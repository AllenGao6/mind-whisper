const meter = document.getElementById('meter');
const ctx = meter.getContext('2d');
const labelText = document.getElementById('label-text');
const dot = document.getElementById('dot');
const textEl = document.getElementById('text');

const BARS = 6;
const barLevels = new Array(BARS).fill(0);

function drawMeter(level) {
  // Shift bars left and append the new level.
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

function setDotState(state) {
  dot.className = 'dot-pulse ' + state;
}

function setText(html) {
  textEl.innerHTML = html;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

// RAF-coalesced render loop: IPC updates from main can arrive faster than we can paint
// (especially the 10 Hz audio-level stream plus 5–10 Hz Deepgram partials). Instead of
// repainting on every IPC, we stash the latest payload and let the browser's animation
// frame drive a single paint. Old payloads are dropped — we always render the freshest
// state, so no backlog can accumulate over time.
let latestPayload = null;
let rafId = null;

function scheduleRender(payload) {
  if (!payload) return;
  latestPayload = payload;
  if (rafId === null) {
    rafId = requestAnimationFrame(renderLatest);
  }
}

function renderLatest() {
  rafId = null;
  const payload = latestPayload;
  latestPayload = null;
  if (!payload) return;
  applyPayload(payload);
}

function applyPayload(payload) {
  switch (payload.phase) {
    case 'recording':
      setDotState('recording');
      labelText.textContent = 'Listening…';
      drawMeter(payload.level || 0);
      break;
    case 'partial': {
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
      setDotState('transcribing');
      labelText.textContent = 'Transcribing…';
      drawMeter(0);
      break;
    case 'formatting':
      setDotState('formatting');
      labelText.textContent = 'Formatting…';
      setText(`<span class="final">${escapeHtml(payload.text || '')}</span>`);
      drawMeter(0);
      break;
    case 'done':
      setDotState('idle');
      labelText.textContent = 'Pasted';
      setText(`<span class="final">${escapeHtml(payload.text || '')}</span>`);
      drawMeter(0);
      break;
    case 'notice':
      setDotState('idle');
      labelText.textContent = payload.label || '';
      setText(`<span class="final">${escapeHtml(payload.text || '')}</span>`);
      drawMeter(0);
      break;
    case 'error':
      setDotState('error');
      labelText.textContent = 'Error';
      setText(`<span class="interim">${escapeHtml(payload.message || '')}</span>`);
      drawMeter(0);
      break;
    case 'hide':
      setText('');
      drawMeter(0);
      break;
  }
}

window.hudAPI.onUpdate(scheduleRender);
