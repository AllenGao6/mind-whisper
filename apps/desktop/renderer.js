// ── State ──
let stream = null;
let audioCtx = null;
let workletNode = null;
let analyserNode = null;
let sourceNode = null;
let isRecording = false;
let pcmFrames = [];          // Int16Array chunks for WAV synthesis
let pcmTotalSamples = 0;
let levelTimerId = null;
let currentRecordingId = null;  // stamped on every outbound IPC; main ignores mismatched ids
const SAMPLE_RATE = 16000;

// UI refs (Settings tab)
const statusEl = document.getElementById('status');
const statusDot = document.getElementById('status-dot');
const keybindBtn = document.getElementById('keybind-btn');
const keybindLabel = document.getElementById('keybind-label');
const saveBtn = document.getElementById('save-btn');
const saveMsg = document.getElementById('save-msg');

// History
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Formatter
const formatterEnabledEl = document.getElementById('formatter-enabled');
const formatterListEl = document.getElementById('formatter-preset-list');
const formatterEditorNameEl = document.getElementById('formatter-editor-name');
const formatterNameEl = document.getElementById('formatter-preset-name');
const formatterPromptEl = document.getElementById('formatter-preset-prompt');
const formatterNewBtn = document.getElementById('formatter-new-btn');
const formatterDeleteBtn = document.getElementById('formatter-delete-btn');
const formatterSaveBtn = document.getElementById('formatter-save-btn');
const formatterSaveMsg = document.getElementById('formatter-save-msg');

// Providers
const providerSelectEl = document.getElementById('active-provider');
const providerSaveMsg = document.getElementById('providers-save-msg');

let pendingKeycode = null;
let pendingKeycodeLabel = null;

// ── Tabs ──
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

function switchTab(tabName) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabName}`));
  if (tabName === 'history') loadHistory();
  if (tabName === 'formatter') loadFormatter();
  if (tabName === 'providers') loadProviders();
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

window.electronAPI.onSwitchTab((tab) => switchTab(tab));

// ── Status UI ──
function setStatus(state, message) {
  statusEl.textContent = message;
  statusDot.className = 'status-dot ' + state;
}

// Uniform busy/success/error feedback for save & test buttons. The button is disabled
// during the async work, swapped to a busy label, then to a success or error label
// briefly, then restored. Works around silent-completion confusion for sub-100ms saves.
async function withButtonState(button, asyncFn, opts = {}) {
  if (!button) return asyncFn();
  const busyLabel = opts.busyLabel || 'Saving…';
  const successLabel = opts.successLabel || 'Saved ✓';
  const errorLabel = opts.errorLabel;        // optional; if omitted, defaults to 'Failed' or err.message
  const successMs = opts.successMs || 2000;
  const errorMs = opts.errorMs || 2500;

  const originalLabel = button.textContent;
  const originalDisabled = button.disabled;
  button.disabled = true;
  button.textContent = busyLabel;
  button.classList.add('btn-busy');

  const restoreLater = (cls, ms) => setTimeout(() => {
    button.textContent = originalLabel;
    button.disabled = originalDisabled;
    button.classList.remove(cls);
  }, ms);

  try {
    const result = await asyncFn();
    button.classList.remove('btn-busy');
    button.classList.add('btn-success');
    button.textContent = (typeof successLabel === 'function') ? (successLabel(result) || 'Saved ✓') : successLabel;
    restoreLater('btn-success', successMs);
    return result;
  } catch (err) {
    button.classList.remove('btn-busy');
    button.classList.add('btn-error');
    button.textContent = errorLabel || (err && err.message ? err.message.slice(0, 20) : 'Failed');
    restoreLater('btn-error', errorMs);
    throw err;
  }
}

// ── Audio feedback ──
const feedbackCtx = new AudioContext();

function playSoftChime(freqs, duration, volume) {
  const t = feedbackCtx.currentTime;
  freqs.forEach((freq) => {
    const osc = feedbackCtx.createOscillator();
    const gain = feedbackCtx.createGain();
    osc.connect(gain);
    gain.connect(feedbackCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  });
}

function playStartSound() { playSoftChime([520, 780], 0.2, 0.15); }
function playStopSound() { playSoftChime([420, 630], 0.25, 0.12); }

// ── Audio capture pipeline ──

async function startCapture(recId) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('error', 'Microphone access denied');
    console.error('Mic error:', err);
    window.electronAPI.sendRecordingCancelled(recId);
    return false;
  }

  // Recover from mic disappearing mid-recording (sleep/wake, unplug, OS revocation).
  try {
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onended = () => {
        console.warn('[capture] audio track ended unexpectedly');
        if (isRecording && currentRecordingId === recId) {
          isRecording = false;
          teardownCapture();
          window.electronAPI.sendRecordingCancelled(recId);
          setStatus('idle', 'Ready — waiting for hotkey');
        }
      };
    }
  } catch (_) {}

  pcmFrames = [];
  pcmTotalSamples = 0;

  try {
    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  } catch (err) {
    console.error('AudioContext init failed:', err);
    setStatus('error', 'Audio init failed');
    teardownCapture();
    window.electronAPI.sendRecordingCancelled(recId);
    return false;
  }

  try {
    await audioCtx.audioWorklet.addModule('audio/pcm-capture-worklet.js');
  } catch (err) {
    console.error('Worklet load error:', err);
    setStatus('error', 'Audio worklet failed to load');
    teardownCapture();
    window.electronAPI.sendRecordingCancelled(recId);
    return false;
  }

  try {
    sourceNode = audioCtx.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture');
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.6;

    sourceNode.connect(workletNode);
    sourceNode.connect(analyserNode);
  } catch (err) {
    console.error('Audio graph setup failed:', err);
    setStatus('error', 'Audio setup failed');
    teardownCapture();
    window.electronAPI.sendRecordingCancelled(recId);
    return false;
  }

  workletNode.port.onmessage = (e) => {
    if (!isRecording || currentRecordingId !== recId) return;
    const ab = e.data;
    if (!(ab instanceof ArrayBuffer) || ab.byteLength === 0) return;
    const clone = ab.slice(0);
    window.electronAPI.sendAudioChunk(clone, recId);
    pcmFrames.push(new Int16Array(ab));
    pcmTotalSamples += ab.byteLength / 2;
  };

  const buf = new Uint8Array(analyserNode.frequencyBinCount);
  // 10 Hz is plenty for a 6-bar level meter; 20 Hz was saturating the HUD IPC queue
  // and the meter visibly slowed down the longer the recording lasted.
  levelTimerId = setInterval(() => {
    if (!isRecording || !analyserNode || currentRecordingId !== recId) return;
    analyserNode.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const avg = sum / buf.length / 255;
    window.electronAPI.sendAudioLevel(Math.min(1, avg * 2.5), recId);
  }, 100);

  // If stop fired while we were still setting up, tear down immediately.
  if (!isRecording || currentRecordingId !== recId) {
    teardownCapture();
    return false;
  }
  return true;
}

function teardownCapture() {
  if (levelTimerId) { clearInterval(levelTimerId); levelTimerId = null; }
  try { if (workletNode) workletNode.disconnect(); } catch (_) {}
  try { if (analyserNode) analyserNode.disconnect(); } catch (_) {}
  try { if (sourceNode) sourceNode.disconnect(); } catch (_) {}
  workletNode = null;
  analyserNode = null;
  sourceNode = null;
  if (audioCtx) { try { audioCtx.close(); } catch (_) {} audioCtx = null; }
  if (stream) {
    try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
    stream = null;
  }
}

function synthesizeWavFromFrames() {
  // Concatenate Int16 chunks into one buffer.
  const combined = new Int16Array(pcmTotalSamples);
  let offset = 0;
  for (const chunk of pcmFrames) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  // Build minimal WAV header inline so we don't need Buffer in renderer.
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = combined.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(off, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44).set(combined);
  return buffer;
}

// ── Recording lifecycle ──

window.electronAPI.onStartRecording(async (data) => {
  if (isRecording) return;
  const recId = (data && data.id) || null;
  currentRecordingId = recId;
  isRecording = true;
  setStatus('recording', 'Recording...');
  try {
    playStartSound();
    const ok = await startCapture(recId);
    if (!ok) {
      isRecording = false;
      currentRecordingId = null;
      setStatus('idle', 'Ready — waiting for hotkey');
    }
  } catch (err) {
    // Defensive: never leave isRecording=true on an unexpected throw.
    console.error('startCapture threw:', err);
    isRecording = false;
    currentRecordingId = null;
    teardownCapture();
    try { window.electronAPI.sendRecordingCancelled(recId); } catch (_) {}
    setStatus('error', 'Recording failed');
    setTimeout(() => setStatus('idle', 'Ready — waiting for hotkey'), 2000);
  }
});

window.electronAPI.onStopRecording((data) => {
  const recId = (data && data.id) || currentRecordingId;
  if (!isRecording || (data && data.id && data.id !== currentRecordingId)) return;
  isRecording = false;
  playStopSound();
  setStatus('transcribing', 'Transcribing...');
  let wavBuffer = null;
  try {
    if (pcmTotalSamples > 0) wavBuffer = synthesizeWavFromFrames();
  } catch (err) {
    console.error('WAV synth error', err);
  }
  teardownCapture();
  try { window.electronAPI.sendRecordingStopped(wavBuffer, recId); } catch (_) {}
  currentRecordingId = null;
  setTimeout(() => setStatus('idle', 'Ready — waiting for hotkey'), 1500);
});

window.electronAPI.onCancelRecording((data) => {
  const recId = (data && data.id) || currentRecordingId;
  if (data && data.id && data.id !== currentRecordingId) return;
  isRecording = false;
  currentRecordingId = null;
  teardownCapture();
  try { window.electronAPI.sendRecordingCancelled(recId); } catch (_) {}
  setStatus('idle', 'Ready — waiting for hotkey');
});

// ── History ──
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function loadHistory() {
  const history = await window.electronAPI.getHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No transcriptions yet. Hold your hotkey and speak!</div>';
    return;
  }
  historyList.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-time">${formatTime(item.timestamp)}</div>
      <div class="history-text">${escapeHtml(item.text)}</div>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

clearHistoryBtn.addEventListener('click', async () => {
  await window.electronAPI.clearHistory();
  loadHistory();
});

// ── Formatter ──
let formatterPresets = [];
let formatterActiveId = null;

function genPresetId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'preset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function findActivePreset() {
  return formatterPresets.find((p) => p.id === formatterActiveId) || formatterPresets[0] || null;
}

function renderFormatterList() {
  const enabled = formatterEnabledEl.checked;
  formatterListEl.innerHTML = formatterPresets.map((p) => {
    const isSelected = p.id === formatterActiveId;
    const showActiveBadge = isSelected && enabled;
    return `
      <div class="preset-row${isSelected ? ' selected' : ''}" data-id="${escapeHtml(p.id)}">
        <div class="preset-radio"></div>
        <div class="preset-name">${escapeHtml(p.name || '(unnamed)')}</div>
        ${showActiveBadge ? '<div class="preset-active-badge">Active</div>' : ''}
      </div>
    `;
  }).join('');

  formatterListEl.querySelectorAll('.preset-row').forEach((row) => {
    row.addEventListener('click', async () => {
      if (row.dataset.id === formatterActiveId) return;
      formatterActiveId = row.dataset.id;
      renderFormatterList();
      renderFormatterEditor();
      await window.electronAPI.saveFormatterConfig({ activePresetId: formatterActiveId });
    });
  });
}

function renderFormatterEditor() {
  const active = findActivePreset();
  if (!active) {
    formatterEditorNameEl.textContent = '—';
    formatterNameEl.value = '';
    formatterPromptEl.value = '';
    formatterNameEl.disabled = true;
    formatterPromptEl.disabled = true;
    formatterDeleteBtn.disabled = true;
    formatterSaveBtn.disabled = true;
    return;
  }
  formatterEditorNameEl.textContent = active.name || '(unnamed)';
  formatterNameEl.disabled = false;
  formatterPromptEl.disabled = false;
  formatterDeleteBtn.disabled = formatterPresets.length <= 1;
  formatterSaveBtn.disabled = false;
  formatterNameEl.value = active.name || '';
  formatterPromptEl.value = active.prompt || '';
}

async function loadFormatter() {
  const cfg = await window.electronAPI.getFormatterConfig();
  formatterPresets = (cfg.presets || []).map((p) => ({ ...p }));
  formatterActiveId = cfg.activePresetId || (formatterPresets[0] && formatterPresets[0].id) || null;
  formatterEnabledEl.checked = !!cfg.enabled;
  renderFormatterList();
  renderFormatterEditor();
}

formatterNameEl.addEventListener('input', () => {
  const active = findActivePreset();
  if (!active) return;
  active.name = formatterNameEl.value;
  formatterEditorNameEl.textContent = active.name || '(unnamed)';
  const row = formatterListEl.querySelector(`.preset-row[data-id="${CSS.escape(active.id)}"] .preset-name`);
  if (row) row.textContent = active.name || '(unnamed)';
});

formatterPromptEl.addEventListener('input', () => {
  const active = findActivePreset();
  if (!active) return;
  active.prompt = formatterPromptEl.value;
});

formatterNewBtn.addEventListener('click', async () => {
  const preset = { id: genPresetId(), name: 'New preset', prompt: '' };
  formatterPresets.push(preset);
  formatterActiveId = preset.id;
  renderFormatterList();
  renderFormatterEditor();
  formatterNameEl.focus();
  formatterNameEl.select();
  await window.electronAPI.saveFormatterConfig({
    activePresetId: formatterActiveId,
    presets: formatterPresets,
  });
});

formatterDeleteBtn.addEventListener('click', async () => {
  if (formatterPresets.length <= 1) return;
  formatterPresets = formatterPresets.filter((p) => p.id !== formatterActiveId);
  formatterActiveId = formatterPresets[0].id;
  renderFormatterList();
  renderFormatterEditor();
  await window.electronAPI.saveFormatterConfig({
    activePresetId: formatterActiveId,
    presets: formatterPresets,
  });
});

formatterEnabledEl.addEventListener('change', async () => {
  renderFormatterList();
  await window.electronAPI.saveFormatterConfig({ enabled: formatterEnabledEl.checked });
});

formatterSaveBtn.addEventListener('click', () => {
  withButtonState(formatterSaveBtn, () => window.electronAPI.saveFormatterConfig({
    enabled: formatterEnabledEl.checked,
    activePresetId: formatterActiveId,
    presets: formatterPresets,
  })).catch(() => {});
});

window.electronAPI.onFormatterStateChanged((data) => {
  if (!data) return;
  if (typeof data.enabled === 'boolean') formatterEnabledEl.checked = data.enabled;
  if (data.activePresetId && data.activePresetId !== formatterActiveId) {
    formatterActiveId = data.activePresetId;
    renderFormatterEditor();
  }
  renderFormatterList();
});

window.electronAPI.onFormattingStarted(() => {
  setStatus('transcribing', 'Formatting...');
});

// ── Providers ──

const PROVIDER_META = [
  { id: 'openai', label: 'OpenAI Whisper', keyPlaceholder: 'sk-...', hasModel: false },
  { id: 'deepgram', label: 'Deepgram (streaming)', keyPlaceholder: 'dg-...', hasModel: true, models: ['nova-3'] },
  { id: 'groq', label: 'Groq Whisper', keyPlaceholder: 'gsk-...', hasModel: false },
];

let providersDraft = null;
let activeProviderDraft = 'openai';

async function loadProviders() {
  const cfg = await window.electronAPI.getProvidersConfig();
  providersDraft = JSON.parse(JSON.stringify(cfg.providers || {}));
  activeProviderDraft = cfg.activeProvider || 'openai';

  providerSelectEl.innerHTML = PROVIDER_META
    .map((p) => `<option value="${p.id}"${p.id === activeProviderDraft ? ' selected' : ''}>${escapeHtml(p.label)}</option>`)
    .join('');

  for (const p of PROVIDER_META) {
    const keyEl = document.getElementById(`provider-${p.id}-key`);
    if (keyEl) keyEl.value = providersDraft?.[p.id]?.apiKey || '';
    if (p.hasModel) {
      const modelEl = document.getElementById(`provider-${p.id}-model`);
      if (modelEl) modelEl.value = providersDraft?.[p.id]?.model || p.models[0];
    }
    const testStatus = document.getElementById(`provider-${p.id}-status`);
    if (testStatus) testStatus.textContent = '';
  }
}

providerSelectEl?.addEventListener('change', async () => {
  activeProviderDraft = providerSelectEl.value;
  await window.electronAPI.saveProvidersConfig({ activeProvider: activeProviderDraft });
});

PROVIDER_META.forEach((p) => {
  const saveBtnEl = document.getElementById(`provider-${p.id}-save`);
  const testBtnEl = document.getElementById(`provider-${p.id}-test`);
  const keyEl = document.getElementById(`provider-${p.id}-key`);
  const modelEl = p.hasModel ? document.getElementById(`provider-${p.id}-model`) : null;
  const statusEl = document.getElementById(`provider-${p.id}-status`);

  saveBtnEl?.addEventListener('click', () => {
    withButtonState(saveBtnEl, async () => {
      const update = { apiKey: keyEl.value.trim() };
      if (modelEl) update.model = modelEl.value;
      providersDraft[p.id] = { ...(providersDraft[p.id] || {}), ...update };
      await window.electronAPI.saveProvidersConfig({ providers: { [p.id]: update } });
    }).catch(() => {});
  });

  testBtnEl?.addEventListener('click', () => {
    statusEl.textContent = '';
    withButtonState(testBtnEl, async () => {
      const update = { apiKey: keyEl.value.trim() };
      if (modelEl) update.model = modelEl.value;
      await window.electronAPI.saveProvidersConfig({ providers: { [p.id]: update } });
      const res = await window.electronAPI.testProvider(p.id);
      if (!res.ok) {
        const e = new Error(res.error || 'Failed');
        e.userMessage = res.error || 'Failed';
        throw e;
      }
      return res;
    }, {
      busyLabel: 'Testing…',
      successLabel: '✓ Connected',
      errorLabel: '✗ Failed',
      successMs: 2500,
    }).then(() => {
      statusEl.textContent = '✓ Connected';
      statusEl.style.color = '#4ade80';
    }).catch((err) => {
      statusEl.textContent = '✗ ' + (err.userMessage || err.message || 'Failed');
      statusEl.style.color = '#ef4444';
    });
  });
});

// ── Keybind & chord capture ──

const chordToggleBtn = document.getElementById('chord-toggle-btn');
const chordDigitBtn = document.getElementById('chord-digit-btn');

function formatModifierString(mods) {
  if (!mods) return '';
  const parts = [];
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.alt) parts.push('Option');
  if (mods.shift) parts.push('Shift');
  if (mods.meta) parts.push('Cmd');
  return parts.join('+');
}

function renderChordToggleLabel(chord) {
  if (!chord || !chord.keycode) { chordToggleBtn.textContent = '(unbound)'; return; }
  const mods = formatModifierString(chord.modifiers);
  const key = chord.label || `Key ${chord.keycode}`;
  chordToggleBtn.textContent = mods ? `${mods}+${key}` : key;
}

function renderChordDigitLabel(mods) {
  const m = formatModifierString(mods);
  chordDigitBtn.textContent = m ? `${m}+1…9, ${m}+0` : '1…9, 0';
}

async function loadChords() {
  const c = await window.electronAPI.getChords();
  // Toggle: store gives { keycode, modifiers }; we need a label too.
  if (c.chordToggle && c.chordToggle.keycode) {
    c.chordToggle.label = keyNameFromCode(c.chordToggle.keycode);
  }
  renderChordToggleLabel(c.chordToggle);
  renderChordDigitLabel(c.chordDigitModifiers);
}

// Lightweight mirror of main.js KEY_NAMES — only used to label saved chords.
const KEY_NAMES_R = {
  56: 'Left Option', 3640: 'Right Option',
  29: 'Left Ctrl', 3613: 'Right Ctrl',
  42: 'Left Shift', 54: 'Right Shift',
  3675: 'Left Cmd', 3676: 'Right Cmd',
  58: 'Caps Lock', 57: 'Space', 1: 'Escape',
  15: 'Tab', 14: 'Backspace', 28: 'Enter',
  59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6',
  65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12',
  91: 'F13', 92: 'F14', 93: 'F15', 99: 'F16', 100: 'F17', 101: 'F18',
  102: 'F19', 103: 'F20',
  30: 'A', 48: 'B', 46: 'C', 32: 'D', 18: 'E', 33: 'F', 34: 'G',
  35: 'H', 23: 'I', 36: 'J', 37: 'K', 38: 'L', 50: 'M', 49: 'N',
  24: 'O', 25: 'P', 16: 'Q', 19: 'R', 31: 'S', 20: 'T', 22: 'U',
  47: 'V', 17: 'W', 45: 'X', 21: 'Y', 44: 'Z',
  2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
};
function keyNameFromCode(kc) { return KEY_NAMES_R[kc] || `Key ${kc}`; }

keybindBtn.addEventListener('click', () => {
  keybindBtn.classList.add('listening');
  keybindBtn.textContent = 'Press any key...';
  window.electronAPI.setKeybindMode(true, 'talk');
});

chordToggleBtn.addEventListener('click', () => {
  chordToggleBtn.classList.add('listening');
  chordToggleBtn.textContent = 'Press chord…';
  window.electronAPI.setKeybindMode(true, 'toggleChord');
});

chordDigitBtn.addEventListener('click', () => {
  chordDigitBtn.classList.add('listening');
  chordDigitBtn.textContent = 'Press chord+digit…';
  window.electronAPI.setKeybindMode(true, 'digitChord');
});

window.electronAPI.onKeybindCaptured(async (data) => {
  if (!data) return;
  // Always cancel capture mode immediately.
  window.electronAPI.setKeybindMode(false);

  if (data.mode === 'toggleChord') {
    chordToggleBtn.classList.remove('listening');
    const chord = { keycode: data.keycode, modifiers: data.modifiers };
    await window.electronAPI.saveChords({ chordToggle: chord });
    renderChordToggleLabel({ ...chord, label: data.label });
    return;
  }

  if (data.mode === 'digitChord') {
    chordDigitBtn.classList.remove('listening');
    // Digit press is just used to capture the modifier state; the digit itself is discarded.
    await window.electronAPI.saveChords({ chordDigitModifiers: data.modifiers });
    renderChordDigitLabel(data.modifiers);
    return;
  }

  // Default: talk-key capture (existing flow — applied on Save click).
  pendingKeycode = data.keycode;
  pendingKeycodeLabel = data.label;
  keybindBtn.classList.remove('listening');
  keybindBtn.textContent = data.label;
  keybindLabel.textContent = `Keycode: ${data.keycode}`;
});

// ── Settings save ──
saveBtn.addEventListener('click', () => {
  withButtonState(saveBtn, async () => {
    const settings = {};
    if (pendingKeycode !== null) {
      settings.keycode = pendingKeycode;
      settings.keycodeLabel = pendingKeycodeLabel;
      pendingKeycode = null;
      pendingKeycodeLabel = null;
    }
    await window.electronAPI.saveSettings(settings);
  }).catch(() => {});
});

// ── Init ──
async function init() {
  const settings = await window.electronAPI.getSettings();
  keybindBtn.textContent = settings.keycodeLabel || `Key ${settings.keycode}`;
  keybindLabel.textContent = `Keycode: ${settings.keycode}`;
  await loadFormatter();
  await loadProviders();
  await loadChords();
  setStatus('idle', 'Ready — waiting for hotkey');
}

init();
