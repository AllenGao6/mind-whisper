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

let pendingKeycode = null;
let pendingKeycodeLabel = null;

// ── Tabs ──

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

function switchTab(tabName) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabName}`));
  if (tabName === 'history') loadHistory();
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

  setStatus('idle', 'Ready — waiting for hotkey');
}

init();
