let mediaRecorder = null;
let audioChunks = [];
let stream = null;

const statusEl = document.getElementById('status');
const statusDot = document.getElementById('status-dot');
const apiKeyInput = document.getElementById('api-key');
const keybindBtn = document.getElementById('keybind-btn');
const keybindLabel = document.getElementById('keybind-label');
const saveBtn = document.getElementById('save-btn');
const saveMsg = document.getElementById('save-msg');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const formatterEnabledEl = document.getElementById('formatter-enabled');
const formatterListEl = document.getElementById('formatter-preset-list');
const formatterEditorNameEl = document.getElementById('formatter-editor-name');
const formatterNameEl = document.getElementById('formatter-preset-name');
const formatterPromptEl = document.getElementById('formatter-preset-prompt');
const formatterNewBtn = document.getElementById('formatter-new-btn');
const formatterDeleteBtn = document.getElementById('formatter-delete-btn');
const formatterSaveBtn = document.getElementById('formatter-save-btn');
const formatterSaveMsg = document.getElementById('formatter-save-msg');

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

// ── Audio Feedback ──

const audioCtx = new AudioContext();

function playSoftChime(freqs, duration, volume) {
  const t = audioCtx.currentTime;
  freqs.forEach((freq) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.start(t);
    osc.stop(t + duration);
  });
}

function playStartSound() {
  playSoftChime([520, 780], 0.2, 0.15);
}

function playStopSound() {
  playSoftChime([420, 630], 0.25, 0.12);
}

// ── Mic (on-demand) ──

function releaseMic() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

// ── Recording ──

window.electronAPI.onStartRecording(async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('error', 'Microphone access denied');
    console.error('Mic error:', err);
    return;
  }

  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.start();
  playStartSound();
  setStatus('recording', 'Recording...');
});

window.electronAPI.onStopRecording(async () => {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

  playStopSound();
  mediaRecorder.stop();

  mediaRecorder.onstop = async () => {
    releaseMic();
    setStatus('transcribing', 'Transcribing...');

    try {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      const result = await window.electronAPI.transcribe(arrayBuffer);
      setStatus('idle', `Done: "${result.text.substring(0, 60)}${result.text.length > 60 ? '...' : ''}"`);

      setTimeout(() => setStatus('idle', 'Ready — waiting for hotkey'), 3000);
    } catch (err) {
      setStatus('error', `Error: ${err.message || 'Transcription failed'}`);
      setTimeout(() => setStatus('idle', 'Ready — waiting for hotkey'), 4000);
    }
  };
});

window.electronAPI.onCancelRecording(() => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    mediaRecorder.onstop = () => {};
  }
  releaseMic();
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

formatterSaveBtn.addEventListener('click', async () => {
  await window.electronAPI.saveFormatterConfig({
    enabled: formatterEnabledEl.checked,
    activePresetId: formatterActiveId,
    presets: formatterPresets,
  });
  formatterSaveMsg.textContent = 'Saved!';
  formatterSaveMsg.style.opacity = '1';
  setTimeout(() => { formatterSaveMsg.style.opacity = '0'; }, 2000);
});

window.electronAPI.onFormatterStateChanged((data) => {
  if (!data) return;
  if (typeof data.enabled === 'boolean') {
    formatterEnabledEl.checked = data.enabled;
  }
  if (data.activePresetId && data.activePresetId !== formatterActiveId) {
    formatterActiveId = data.activePresetId;
    renderFormatterEditor();
  }
  renderFormatterList();
});

window.electronAPI.onFormattingStarted(() => {
  setStatus('transcribing', 'Formatting...');
});

// ── Keybind capture ──

keybindBtn.addEventListener('click', () => {
  keybindBtn.classList.add('listening');
  keybindBtn.textContent = 'Press any key...';
  window.electronAPI.setKeybindMode(true);
});

window.electronAPI.onKeybindCaptured((data) => {
  pendingKeycode = data.keycode;
  pendingKeycodeLabel = data.label;
  keybindBtn.classList.remove('listening');
  keybindBtn.textContent = data.label;
  keybindLabel.textContent = `Keycode: ${data.keycode}`;
  window.electronAPI.setKeybindMode(false);
});

// ── Settings ──

saveBtn.addEventListener('click', async () => {
  const settings = {
    apiKey: apiKeyInput.value.trim(),
  };

  if (pendingKeycode !== null) {
    settings.keycode = pendingKeycode;
    settings.keycodeLabel = pendingKeycodeLabel;
    pendingKeycode = null;
    pendingKeycodeLabel = null;
  }

  await window.electronAPI.saveSettings(settings);
  saveMsg.textContent = 'Saved!';
  saveMsg.style.opacity = '1';
  setTimeout(() => { saveMsg.style.opacity = '0'; }, 2000);
});

// ── Init ──

async function init() {
  const settings = await window.electronAPI.getSettings();
  apiKeyInput.value = settings.apiKey || '';
  keybindBtn.textContent = settings.keycodeLabel || `Key ${settings.keycode}`;
  keybindLabel.textContent = `Keycode: ${settings.keycode}`;

  await loadFormatter();

  setStatus('idle', 'Ready — waiting for hotkey');
}

init();