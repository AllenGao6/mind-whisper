const hud = document.getElementById('hud');
const meter = document.getElementById('meter');
const ctx = meter.getContext('2d');
const labelText = document.getElementById('label-text');
const dot = document.getElementById('dot');
const textEl = document.getElementById('text');
const langChipsEl = document.getElementById('lang-chips');
const formatChipsEl = document.getElementById('format-chips');
const providerChipsEl = document.getElementById('provider-chips');

// Curated language set (matches Deepgram nova-3 'multi' coverage). 'auto' maps
// to per-provider auto-detect (Deepgram 'multi', OpenAI/Groq no language param).
const LANGUAGES = [
  ['auto', 'Auto'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'],
  ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'], ['nl', 'Dutch'],
  ['hi', 'Hindi'], ['ja', 'Japanese'], ['zh', 'Chinese'], ['ko', 'Korean'],
  ['ru', 'Russian'],
];
const PROVIDERS = [['openai', 'OpenAI'], ['deepgram', 'Deepgram'], ['groq', 'Groq']];

// ── State ──
let config = {
  language: 'auto',
  activeProvider: 'openai',
  providers: {},
  formatterEnabled: false,
  formatterActivePresetId: null,
  formatterPresets: [],
};
let recordingActive = false;   // a recording/finalize/notice phase is showing
let hovered = false;

// ── Audio meter ──
const BARS = 6;
const barLevels = new Array(BARS).fill(0);

function drawMeter(level) {
  for (let i = 0; i < BARS - 1; i++) barLevels[i] = barLevels[i + 1];
  barLevels[BARS - 1] = level;
  ctx.clearRect(0, 0, meter.width, meter.height);
  const w = meter.width;
  const h = meter.height;
  const barW = w / BARS - 1;
  for (let i = 0; i < BARS; i++) {
    const lv = Math.min(1, Math.max(0, barLevels[i]));
    const bh = Math.max(2, lv * (h - 4));
    const x = i * (barW + 1);
    const y = (h - bh) / 2;
    ctx.fillStyle = '#5b9bd5';
    ctx.fillRect(x, y, barW, bh);
  }
}

function setDotState(state) { dot.className = 'dot-pulse ' + state; }
function setText(html) { textEl.innerHTML = html; }
function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

// ── Window sizing: report content size to main, which anchors bottom-center.
// Width is fixed per state (via CSS class), height is measured, so there's no
// resize feedback loop. The +12 accounts for the 6px body padding on each side.
function syncSize() {
  requestAnimationFrame(() => {
    const r = hud.getBoundingClientRect();
    window.hudAPI.resize(Math.ceil(r.width) + 12, Math.ceil(r.height) + 12);
  });
}

// ── Visual state machine ──
// active (recording/finalize) wins; else expanded while hovered; else idle.
function applyVisualState() {
  const state = recordingActive ? 'active' : (hovered ? 'expanded' : 'idle');
  hud.classList.toggle('active', state === 'active');
  hud.classList.toggle('expanded', state === 'expanded');
  hud.classList.toggle('idle', state === 'idle');
  // Idle shows only the empty sliver (#handle) — no text/buttons, non-blocking.
  syncSize();
}

// ── Pickers ──
function chip(label, selected, onClick, opts) {
  const el = document.createElement('div');
  el.className = 'chip' + (selected ? ' selected' : '') + (opts && opts.disabled ? ' disabled' : '');
  el.textContent = label;
  if (!(opts && opts.disabled)) el.addEventListener('click', onClick);
  return el;
}

function renderPickers() {
  // Language
  langChipsEl.innerHTML = '';
  for (const [code, label] of LANGUAGES) {
    langChipsEl.appendChild(chip(label, config.language === code, () => {
      config.language = code;
      window.hudAPI.selectLanguage(code);
      renderPickers();
      applyVisualState();
    }));
  }

  // Format: "Off" + each preset. Selected = enabled ? activePreset : off.
  formatChipsEl.innerHTML = '';
  const formatActive = config.formatterEnabled ? config.formatterActivePresetId : 'off';
  formatChipsEl.appendChild(chip('Off', formatActive === 'off', () => {
    config.formatterEnabled = false;
    window.hudAPI.selectFormat('off');
    renderPickers();
    applyVisualState();
  }));
  for (const preset of (config.formatterPresets || [])) {
    formatChipsEl.appendChild(chip(preset.name || '(unnamed)', formatActive === preset.id, () => {
      config.formatterEnabled = true;
      config.formatterActivePresetId = preset.id;
      window.hudAPI.selectFormat(preset.id);
      renderPickers();
      applyVisualState();
    }));
  }

  // Provider: a provider with no API key is shown disabled.
  providerChipsEl.innerHTML = '';
  for (const [id, label] of PROVIDERS) {
    const hasKey = !!(config.providers && config.providers[id] && config.providers[id].apiKey);
    providerChipsEl.appendChild(chip(label, config.activeProvider === id, () => {
      config.activeProvider = id;
      window.hudAPI.selectProvider(id);
      renderPickers();
      applyVisualState();
    }, { disabled: !hasKey }));
  }
}

// ── Hover → expand ──
hud.addEventListener('mouseenter', () => { hovered = true; applyVisualState(); });
hud.addEventListener('mouseleave', () => { hovered = false; applyVisualState(); });

// ── Config from main ──
window.hudAPI.onConfig((incoming) => {
  if (!incoming) return;
  config = { ...config, ...incoming };
  renderPickers();
  applyVisualState();
});

// ── Recording/status updates from main (RAF-coalesced) ──
let latestPayload = null;
let rafId = null;
function scheduleRender(payload) {
  if (!payload) return;
  latestPayload = payload;
  if (rafId === null) rafId = requestAnimationFrame(renderLatest);
}
function renderLatest() {
  rafId = null;
  const payload = latestPayload;
  latestPayload = null;
  if (payload) applyPayload(payload);
}

function applyPayload(payload) {
  const wasActive = recordingActive;
  switch (payload.phase) {
    case 'idle':
    case 'hide':
      recordingActive = false;
      setText('');
      drawMeter(0);
      break;
    case 'recording':
      recordingActive = true;
      setDotState('recording');
      labelText.textContent = 'Listening…';
      drawMeter(payload.level || 0);
      break;
    case 'partial': {
      recordingActive = true;
      setDotState('recording');
      labelText.textContent = 'Listening…';
      const finals = (payload.finals || []).map(escapeHtml).join(' ');
      const interim = escapeHtml(payload.interim || '');
      setText(
        (finals ? `<span class="final">${finals}</span>` : '') +
        (finals && interim ? ' ' : '') +
        (interim ? `<span class="interim">${interim}</span>` : '')
      );
      break;
    }
    case 'transcribing':
      recordingActive = true;
      setDotState('transcribing');
      labelText.textContent = 'Transcribing…';
      drawMeter(0);
      break;
    case 'formatting':
      recordingActive = true;
      setDotState('formatting');
      labelText.textContent = 'Formatting…';
      setText(`<span class="final">${escapeHtml(payload.text || '')}</span>`);
      drawMeter(0);
      break;
    case 'done':
      recordingActive = true;
      setDotState('idle');
      labelText.textContent = 'Pasted';
      setText(`<span class="final">${escapeHtml(payload.text || '')}</span>`);
      drawMeter(0);
      break;
    case 'notice':
      recordingActive = true;
      setDotState('idle');
      labelText.textContent = payload.label || '';
      setText(`<span class="final">${escapeHtml(payload.text || '')}</span>`);
      drawMeter(0);
      break;
    case 'error':
      recordingActive = true;
      setDotState('error');
      labelText.textContent = 'Error';
      setText(`<span class="interim">${escapeHtml(payload.message || '')}</span>`);
      drawMeter(0);
      break;
    default:
      return;
  }
  // Recompute visual state when the active flag flipped, or always for sizing
  // during active phases (text can change height).
  if (wasActive !== recordingActive || recordingActive) applyVisualState();
}

window.hudAPI.onUpdate(scheduleRender);

// Initial layout.
renderPickers();
applyVisualState();
