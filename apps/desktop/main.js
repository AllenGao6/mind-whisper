const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, Notification, systemPreferences, screen, powerMonitor, nativeImage } = require('electron');
const { uIOhook } = require('uiohook-napi');
const OpenAI = require('openai');
const Store = require('./lib/store');
const { autoUpdater } = require('electron-updater');
const { runMigrations } = require('./migration');
const transcription = require('./transcription');
const openaiWhisper = require('./transcription/openai-whisper');
const { safePaste } = require('./clipboard/safe-paste');

const store = new Store({
  defaults: {
    keycode: 3640,
    keycodeLabel: 'Right Option',
    history: [],
    formatterEnabled: false,
    formatterActivePresetId: 'email',
    formatterPresets: [
      {
        id: 'email',
        name: 'Email',
        prompt: 'Reformat the following dictation as a clear, polite email body. Fix grammar and punctuation. Do not add a subject line, greeting, or signature unless I explicitly dictated one. Output only the email text.',
      },
      {
        id: 'slack',
        name: 'Slack',
        prompt: 'Reformat the following dictation as a casual but clear Slack message. Fix grammar and punctuation. Keep it concise and conversational. Output only the message text.',
      },
      {
        id: 'bullets',
        name: 'Bullet points',
        prompt: 'Reformat the following dictation as concise bullet points. One idea per bullet. Use a leading "- " for each bullet. Fix grammar and punctuation. Output only the bullets, no preamble.',
      },
    ],
    activeProvider: 'openai',
    providers: {
      openai: { apiKey: '' },
      deepgram: { apiKey: '', model: 'nova-3' },
      groq: { apiKey: '' },
    },
  },
});

runMigrations(store);

// ── Windows / tray ──
let mainWindow = null;
let hudWindow = null;
let tray = null;

// ── Recording state ──
let isRecording = false;
let currentRecordingId = null;          // UUID for active recording; gates inbound IPC
let recordingStartTime = 0;
let lastAudioChunkAt = 0;               // ms; updated each audio-chunk; 0 = none yet
let recordingHardCapId = null;          // 120s auto-stop timer
let keybindMode = null;                 // null = off; otherwise { mode: 'talk' | 'toggleChord' | 'digitChord' }

// ── Finalize state ──
let currentSession = null;              // active provider session (recording or finalizing)
let currentProviderId = null;
let currentInterim = '';
let currentFinals = [];
let finalizingStartedAt = null;         // ms when finalize started; null if idle
let inFlightFinalizeToken = null;       // Symbol identifying the in-flight finalize; superseded if changed

// ── Deferred hotkey restart ──
let pendingHotkeyRestart = false;       // set true if save-settings hit while busy

// ── HUD send failure tracking ──
let consecutiveHudSendFailures = 0;
const MAX_HUD_SEND_FAILURES = 5;

// ── Health watchdog ──
let healthIntervalId = null;
const MAX_RECORDING_MS = 120_000;       // hard cap on holding the hotkey
const AUDIO_SILENCE_MS = 5_000;         // no audio chunks for this long → recovery
const FINALIZE_STALL_MS = 60_000;       // finalize total budget → force reset

// ── Auto-update state ──
let updateState = 'idle';               // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
let updateDownloadedInfo = null;        // info object for the downloaded update; null otherwise
let pendingUpdateInstall = false;       // if user clicks Install while busy, install after current session
let installPromptPending = false;       // download finished while user was dictating — show dialog on next idle
let installDialogOpen = false;          // re-entrancy guard: don't stack modals if update-downloaded re-fires
let updateCheckIntervalId = null;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;   // every 4 hours
const UPDATE_INITIAL_DELAY_MS = 30_000;

const KEY_NAMES = {
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
};

function getKeyName(keycode) {
  return KEY_NAMES[keycode] || `Key ${keycode}`;
}

// Digit keycodes (top-row): 1→2, 2→3, …, 9→10, 0→11. Index in DIGITS[i] gives keycode for digit i.
// DIGITS[0] = 11 (the '0' key); DIGITS[1..9] = 2..10 (the '1'..'9' keys).
const DIGITS = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DIGIT_KEYCODE_TO_DIGIT = new Map(DIGITS.map((kc, d) => [kc, d]));

// Standalone modifier keycodes; ignored during chord capture (we want the non-modifier "anchor" key).
const MODIFIER_KEYCODES = new Set([56, 3640, 29, 3613, 42, 54, 3675, 3676, 58]);

function modifiersFromEvent(e) {
  return { meta: !!e.metaKey, shift: !!e.shiftKey, ctrl: !!e.ctrlKey, alt: !!e.altKey };
}

function modifiersMatch(e, want) {
  if (!want) return false;
  return (!!want.meta === !!e.metaKey)
    && (!!want.shift === !!e.shiftKey)
    && (!!want.ctrl === !!e.ctrlKey)
    && (!!want.alt === !!e.altKey);
}

function formatModifierString(mods) {
  if (!mods) return '';
  const parts = [];
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.alt) parts.push('Option');
  if (mods.shift) parts.push('Shift');
  if (mods.meta) parts.push('Cmd');
  return parts.join('+');
}

function formatChordLabel(chord) {
  if (!chord) return '(unbound)';
  const mods = formatModifierString(chord.modifiers);
  const key = getKeyName(chord.keycode);
  return mods ? `${mods}+${key}` : key;
}

function formatDigitChordLabel(mods) {
  const m = formatModifierString(mods);
  return m ? `${m}+1…9, ${m}+0` : '1…9, 0';
}

const PROVIDER_LABELS = {
  openai: 'OpenAI Whisper',
  deepgram: 'Deepgram',
  groq: 'Groq Whisper',
};

function getProviderLabel(id) { return PROVIDER_LABELS[id] || id; }

// ── Utility: bounded promise ──

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Windows ──

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 560,
    show: false,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createHudWindow() {
  if (hudWindow && !hudWindow.isDestroyed()) {
    try { hudWindow.destroy(); } catch (_) {}
  }
  hudWindow = new BrowserWindow({
    width: 300,
    height: 64,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    // NOTE: type:'panel' intentionally NOT set — produced "NSWindow does not support
    // nonactivating panel styleMask 0x80" warnings and was associated with
    // intermittent HUD-no-show on macOS Spaces/fullscreen transitions.
    webPreferences: {
      preload: path.join(__dirname, 'hud-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  applyHudWindowProperties();
  hudWindow.loadFile('hud.html');

  hudWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[HUD] render-process-gone:', details && details.reason);
    recreateHudSoon();
  });
  hudWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[HUD] did-fail-load:', code, desc);
    recreateHudSoon();
  });
  hudWindow.on('closed', () => { /* defensive — should never close on its own */ });
}

let hudRecreatePending = false;
function recreateHudSoon() {
  if (hudRecreatePending) return;
  hudRecreatePending = true;
  setTimeout(() => {
    hudRecreatePending = false;
    try {
      if (hudWindow && !hudWindow.isDestroyed()) hudWindow.destroy();
    } catch (_) {}
    hudWindow = null;
    createHudWindow();
  }, 100);
}

function applyHudWindowProperties() {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  try {
    hudWindow.setAlwaysOnTop(true, 'screen-saver');
    hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    hudWindow.setIgnoreMouseEvents(true);
  } catch (e) {
    console.error('[HUD] applyHudWindowProperties failed:', e && e.message);
  }
}

function positionHudAtCursor() {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  let cursor;
  try { cursor = screen.getCursorScreenPoint(); } catch (_) { cursor = null; }
  if (!cursor || typeof cursor.x !== 'number' || typeof cursor.y !== 'number') {
    const primary = screen.getPrimaryDisplay();
    cursor = {
      x: primary.workArea.x + Math.floor(primary.workArea.width / 2),
      y: primary.workArea.y + Math.floor(primary.workArea.height / 2),
    };
  }
  let display;
  try { display = screen.getDisplayNearestPoint(cursor); } catch (_) { display = null; }
  let wa = display && display.workArea;
  if (!wa || wa.width <= 0 || wa.height <= 0) wa = screen.getPrimaryDisplay().workArea;

  const w = 300, h = 64;
  let x = cursor.x - Math.floor(w / 2);
  let y = cursor.y + 24;
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - w - 8));
  y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - h - 8));
  try {
    hudWindow.setBounds({ x, y, width: w, height: h });
  } catch (e) {
    console.error('[HUD] setBounds failed:', e && e.message);
  }
}

function showHud() {
  if (!hudWindow || hudWindow.isDestroyed()) {
    createHudWindow();
    // Window is reloading; first showInactive will show whatever the renderer has rendered.
  }
  if (!hudWindow || hudWindow.isDestroyed()) return;
  applyHudWindowProperties();
  positionHudAtCursor();
  try {
    hudWindow.showInactive();
  } catch (e) {
    console.error('[HUD] showInactive failed:', e && e.message);
    recreateHudSoon();
  }
}

function hideHud() {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  sendHud({ phase: 'hide' });
  try { hudWindow.hide(); } catch (e) {
    console.error('[HUD] hide failed:', e && e.message);
  }
}

function sendHud(payload) {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  try {
    hudWindow.webContents.send('hud-update', payload);
    consecutiveHudSendFailures = 0;
  } catch (e) {
    consecutiveHudSendFailures++;
    console.error('[HUD] send failed:', e && e.message);
    if (consecutiveHudSendFailures >= MAX_HUD_SEND_FAILURES) {
      console.error('[HUD] too many send failures, recreating');
      consecutiveHudSendFailures = 0;
      recreateHudSoon();
    }
  }
}

function showWindow(tab) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.show();
    mainWindow.focus();
    if (tab) mainWindow.webContents.send('switch-tab', tab);
  } catch (e) {
    console.error('[showWindow] failed:', e && e.message);
  }
}

// ── Tray ──

function createTray() {
  // Idempotent: if a previous Tray exists, destroy it cleanly before making a new one.
  // This makes the function safe to call from recreateTray() during sleep/wake recovery.
  if (tray) {
    try { if (!tray.isDestroyed()) tray.destroy(); } catch (_) {}
    tray = null;
  }
  // macOS menu-bar "template image": pure black on transparent. Filename ending in
  // "Template" makes macOS auto-recolor for light/dark menu bars. We also explicitly
  // call setTemplateImage(true) as a belt-and-suspenders guarantee.
  const iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.error('[tray] icon image empty — path missing or unreadable:', iconPath);
  }
  if (process.platform === 'darwin') image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('MindWhisper');

  // Attach a guaranteed-working minimal menu IMMEDIATELY. If the rich
  // updateTrayMenu() throws on first build (fresh-install state, race with
  // migrations, unexpected store value), the tray still responds with at least
  // Settings + Quit. updateTrayMenu replaces this on success.
  try {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `MindWhisper v${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: 'Settings', click: () => showWindow('settings') },
      { label: 'Quit', click: () => gracefulQuit() },
    ]));
  } catch (err) {
    console.error('[tray] fallback menu attach failed:', err && err.message);
  }

  updateTrayMenu('Idle');
}

// Recreate the tray from scratch. Used to recover from macOS detaching the
// underlying NSStatusItem after sleep/wake or extended idle (a known Electron-on-
// macOS quirk where the icon remains visible but clicks no longer open the menu).
function recreateTray() {
  console.log('[tray] recreating');
  createTray();
}

// Centralized shutdown path used by every Quit affordance.
//
// Why this is a separate function rather than inline `app.quit()`:
//   1. NSStatusItem's context menu runs in a modal Cocoa run loop. Calling
//      app.quit() synchronously from inside its click callback races AppKit's
//      menu/status-item teardown and deadlocks on signed builds (the v1.0.11
//      bug). Deferring with setImmediate lets Cocoa finish dismissing the
//      menu before Electron starts shutting down.
//   2. Explicit tray.destroy() releases the NSStatusItem on our terms instead
//      of leaving it for AppKit to clean up during app exit.
//   3. Idempotent — safe to call multiple times if the user double-clicks Quit.
let isQuitInProgress = false;
function gracefulQuit() {
  if (isQuitInProgress) return;
  isQuitInProgress = true;
  app.isQuitting = true;
  console.log('[quit] graceful shutdown initiated');

  // Release Cocoa references eagerly so AppKit isn't doing it during quit.
  try {
    if (tray && !tray.isDestroyed()) tray.destroy();
  } catch (_) {}
  tray = null;

  try { if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide(); } catch (_) {}

  // Defer so Cocoa's NSMenu modal callback fully unwinds before app.quit()
  // walks the window list. Without this, the signed-build quit hangs.
  setImmediate(() => { app.quit(); });
}

function notifyFormatterChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('formatter-state-changed', {
      enabled: !!store.get('formatterEnabled'),
      activePresetId: store.get('formatterActivePresetId'),
    });
  } catch (_) {}
}

function updateTrayMenu(status) {
  if (!tray) return;
  try {
  const keybindLabel = store.get('keycodeLabel') || getKeyName(store.get('keycode'));
  const formatterEnabled = !!store.get('formatterEnabled');
  const active = getActiveFormatterPreset();
  const formatterLabel = formatterEnabled && active
    ? `Formatter: ${active.name}`
    : 'Formatter: Off';
  const providerLabel = `Provider: ${getProviderLabel(store.get('activeProvider'))}`;
  const appVersion = app.getVersion();

  const template = [
    { label: `MindWhisper v${appVersion}`, enabled: false },
    { label: `Status: ${status}`, enabled: false },
    { label: `Hotkey: ${keybindLabel}`, enabled: false },
    { label: providerLabel, enabled: false },
    {
      label: formatterLabel,
      click: () => { setFormatterState({ enabled: !formatterEnabled }); },
    },
    { type: 'separator' },
  ];

  // Dynamic auto-update menu entries — prominent when actionable.
  if (updateState === 'downloaded' && updateDownloadedInfo) {
    template.push({
      label: `↑  Install update v${updateDownloadedInfo.version}`,
      click: () => installUpdateNow(),
    });
  } else if (updateState === 'downloading') {
    template.push({ label: 'Downloading update…', enabled: false });
  } else if (updateState === 'available') {
    template.push({ label: 'Update available — preparing…', enabled: false });
  } else if (updateState === 'checking') {
    template.push({ label: 'Checking for updates…', enabled: false });
  } else if (updateState === 'error') {
    template.push({ label: 'Update check failed', enabled: false });
  }

  template.push({
    label: 'Check for updates',
    click: () => checkForUpdatesManual(),
    enabled: updateState !== 'checking' && updateState !== 'downloading',
  });

  template.push(
    { type: 'separator' },
    { label: 'Settings', click: () => showWindow('settings') },
    { label: 'Providers', click: () => showWindow('providers') },
    { label: 'Formatter', click: () => showWindow('formatter') },
    { label: 'History', click: () => showWindow('history') },
    { type: 'separator' },
    { label: 'Quit', click: () => gracefulQuit() }
  );

  tray.setContextMenu(Menu.buildFromTemplate(template));
  } catch (err) {
    // The previously-attached menu (the safe minimum from createTray, or the
    // last successful dynamic build) remains in place. Settings + Quit still
    // work, so the tray never becomes a dead icon.
    console.error('[tray] updateTrayMenu failed:', err && (err.stack || err.message));
  }
}

// ── Hotkey listeners ──

function setupUiohook() {
  const configuredKeycode = store.get('keycode');
  const chordToggle = store.get('chordToggle');
  const chordDigitMods = store.get('chordDigitModifiers');

  uIOhook.on('keydown', (e) => {
    // Keybind capture mode: capture the next non-modifier key + its modifier state
    // and route to the right setting via the mode tag.
    if (keybindMode) {
      if (MODIFIER_KEYCODES.has(e.keycode)) return;     // wait for an anchor key
      const captured = {
        keycode: e.keycode,
        label: getKeyName(e.keycode),
        modifiers: modifiersFromEvent(e),
        mode: keybindMode.mode,
      };
      if (mainWindow && !mainWindow.isDestroyed()) {
        try { mainWindow.webContents.send('keybind-captured', captured); } catch (_) {}
      }
      return;
    }

    // Formatter toggle chord (Cmd+Shift+F by default).
    if (chordToggle && e.keycode === chordToggle.keycode && modifiersMatch(e, chordToggle.modifiers)) {
      const res = toggleFormatter();
      showFormatterNotice(res);
      return;
    }

    // Formatter digit chord (Cmd+Shift+1..9, Cmd+Shift+0 by default).
    if (chordDigitMods && modifiersMatch(e, chordDigitMods) && DIGIT_KEYCODE_TO_DIGIT.has(e.keycode)) {
      const digit = DIGIT_KEYCODE_TO_DIGIT.get(e.keycode);
      let res;
      if (digit === 0) {
        res = disableFormatter();
      } else {
        res = setActiveFormatterPresetByIndex(digit - 1);
      }
      if (res) showFormatterNotice(res);
      return;
    }

    if (e.keycode === configuredKeycode && !isRecording) {
      beginRecording();
    }
  });

  uIOhook.on('keyup', (e) => {
    if (e.keycode === configuredKeycode && isRecording) {
      endRecording();
    }
  });

  uIOhook.start();
}

function doRestartUiohook() {
  try { uIOhook.stop(); } catch (_) {}
  try { uIOhook.removeAllListeners(); } catch (_) {}
  try { setupUiohook(); } catch (e) {
    console.error('[uIOhook] setupUiohook failed:', e && e.message);
  }
}

function restartUiohook() {
  if (isRecording || finalizingStartedAt !== null) {
    // Don't tear down listeners mid-session; that loses the keyup and strands the recording.
    pendingHotkeyRestart = true;
    return;
  }
  doRestartUiohook();
}

function applyPendingHotkeyRestart() {
  if (pendingHotkeyRestart && !isRecording && finalizingStartedAt === null) {
    pendingHotkeyRestart = false;
    doRestartUiohook();
  }
  // Piggyback: same "we just returned to idle" moment is when a deferred update install fires.
  applyPendingUpdateInstall();
}

// ── State helpers ──

function getActiveFormatterPreset() {
  const presets = store.get('formatterPresets') || [];
  if (presets.length === 0) return null;
  const activeId = store.get('formatterActivePresetId');
  return presets.find((p) => p.id === activeId) || presets[0];
}

// Single source of truth for formatter state mutations — used by tray menu, IPC, and
// global chord shortcuts. Keeps store, tray label, and renderer UI in lockstep.
function setFormatterState({ enabled, activePresetId } = {}) {
  if (enabled !== undefined) store.set('formatterEnabled', !!enabled);
  if (activePresetId !== undefined) store.set('formatterActivePresetId', activePresetId);
  updateTrayMenu('Idle');
  notifyFormatterChanged();
}

function toggleFormatter() {
  const next = !store.get('formatterEnabled');
  setFormatterState({ enabled: next });
  const active = getActiveFormatterPreset();
  return { enabled: next, presetName: active ? active.name : null };
}

function setActiveFormatterPresetByIndex(idx) {
  const presets = store.get('formatterPresets') || [];
  if (idx < 0 || idx >= presets.length) return null;
  setFormatterState({ enabled: true, activePresetId: presets[idx].id });
  return { enabled: true, presetName: presets[idx].name };
}

function disableFormatter() {
  setFormatterState({ enabled: false });
  return { enabled: false, presetName: null };
}

let formatterNoticeHideTimer = null;
function showFormatterNotice({ enabled, presetName }) {
  if (isRecording) return;             // don't disrupt live transcript HUD mid-recording
  const text = enabled ? `ON — ${presetName || '(no preset)'}` : 'OFF';
  showHud();
  sendHud({ phase: 'notice', label: 'Formatter', text });
  if (formatterNoticeHideTimer) clearTimeout(formatterNoticeHideTimer);
  formatterNoticeHideTimer = setTimeout(() => {
    formatterNoticeHideTimer = null;
    // Only hide if no recording happened in the meantime.
    if (!isRecording) hideHud();
  }, 1500);
}

function addToHistory(text) {
  const history = store.get('history') || [];
  history.unshift({ text, timestamp: Date.now() });
  if (history.length > 200) history.length = 200;
  store.set('history', history);
}

function notify(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (_) {}
}

function getActiveProviderConfig() {
  const id = store.get('activeProvider') || 'openai';
  const providers = store.get('providers') || {};
  return { id, cfg: providers[id] || {}, providers };
}

function newRecordingId() {
  return (crypto.randomUUID ? crypto.randomUUID() : ('rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)));
}

// ── Recording lifecycle ──

function beginRecording() {
  const { id: providerIdLocal, cfg, providers } = getActiveProviderConfig();
  if (!cfg.apiKey) {
    notify('MindWhisper — API key missing', `Set the API key for ${getProviderLabel(providerIdLocal)} in Providers.`);
    return;
  }

  // If a prior session is still finalizing, cancel it. The in-flight finalize will see
  // inFlightFinalizeToken change and skip its paste.
  if (currentSession) {
    try { currentSession.cancel(); } catch (_) {}
    currentSession = null;
  }
  inFlightFinalizeToken = null;
  finalizingStartedAt = null;

  const recId = newRecordingId();
  currentRecordingId = recId;
  isRecording = true;
  recordingStartTime = Date.now();
  lastAudioChunkAt = Date.now();
  currentProviderId = providerIdLocal;
  currentInterim = '';
  currentFinals = [];

  try {
    currentSession = transcription.createSession({
      providerId: providerIdLocal,
      providersConfig: providers,
      hooks: {
        onPartial: (interim, finals) => {
          if (currentRecordingId !== recId) return;
          currentInterim = interim || '';
          if (finals) currentFinals = finals;
          sendHud({ phase: 'partial', interim: currentInterim, finals: currentFinals });
        },
        onFinal: () => {},
        onError: (err) => {
          console.error('[provider error]', err && err.message ? err.message : err);
        },
        onClosed: () => {},
      },
    });
  } catch (err) {
    isRecording = false;
    currentRecordingId = null;
    console.error('[beginRecording] provider createSession failed:', err && err.message);
    notify('MindWhisper — Provider error', err.message || String(err));
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('start-recording', { id: recId }); } catch (_) {}
  }
  showHud();
  sendHud({ phase: 'recording', level: 0 });
  updateTrayMenu('Recording...');

  recordingHardCapId = setTimeout(() => {
    if (isRecording) {
      notify('MindWhisper', `Recording auto-stopped after ${Math.round(MAX_RECORDING_MS / 1000)}s.`);
      endRecording();
    }
  }, MAX_RECORDING_MS);
}

function endRecording() {
  if (!isRecording) return;
  isRecording = false;
  if (recordingHardCapId) { clearTimeout(recordingHardCapId); recordingHardCapId = null; }

  const duration = Date.now() - recordingStartTime;
  const idAtEnd = currentRecordingId;

  if (duration < 500) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('cancel-recording', { id: idAtEnd }); } catch (_) {}
    }
    if (currentSession) { try { currentSession.cancel(); } catch (_) {} }
    currentSession = null;
    currentRecordingId = null;
    hideHud();
    updateTrayMenu('Idle');
    applyPendingHotkeyRestart();
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('stop-recording', { id: idAtEnd }); } catch (_) {}
  }
  sendHud({ phase: 'transcribing' });
  updateTrayMenu('Transcribing...');
  finalizingStartedAt = Date.now();
}

async function finalizeRecording(wavBuffer) {
  const session = currentSession;
  const providerIdAtStart = currentProviderId;
  const recordingIdAtStart = currentRecordingId;
  const myToken = Symbol('finalize');
  inFlightFinalizeToken = myToken;
  // Clear currentSession so the in-flight session can't be cancelled-and-replaced by
  // another concurrent finalize; we still hold a local ref.
  currentSession = null;

  if (!session) {
    finalizingStartedAt = null;
    inFlightFinalizeToken = null;
    currentRecordingId = null;
    hideHud();
    updateTrayMenu('Idle');
    applyPendingHotkeyRestart();
    return;
  }

  let finalText = '';
  let lastError = null;
  try {
    if (session.mode === 'batch') {
      session.sendBatch(wavBuffer);
    }
    finalText = await withTimeout(session.finish(), 25_000, 'transcription');
  } catch (err) {
    lastError = err;
    console.error('[finalize] session.finish failed:', err && err.message);
    try { session.cancel(); } catch (_) {}
  }

  // Superseded by a newer recording? Bail without paste.
  if (inFlightFinalizeToken !== myToken) {
    finalizingStartedAt = null;
    return;
  }

  finalText = (finalText || '').trim();

  // Streaming-provider failure → fall back to OpenAI Whisper batch if we have a WAV + key.
  if (!finalText && session.mode === 'stream' && wavBuffer && providerIdAtStart !== 'openai') {
    const openaiKey = (store.get('providers') || {}).openai && (store.get('providers') || {}).openai.apiKey;
    if (openaiKey) {
      try {
        notify('MindWhisper', `${getProviderLabel(providerIdAtStart)} returned nothing — falling back to OpenAI Whisper.`);
        const txt = await withTimeout(
          openaiWhisper.transcribeBatch({ apiKey: openaiKey, wavBuffer }),
          25_000,
          'fallback transcription'
        );
        finalText = (txt || '').trim();
        lastError = null;
      } catch (err2) {
        lastError = err2;
        console.error('[finalize] OpenAI fallback failed:', err2 && err2.message);
      }
    }
  }

  if (inFlightFinalizeToken !== myToken) {
    finalizingStartedAt = null;
    return;
  }

  if (!finalText) {
    const msg = lastError ? (lastError.message || 'Transcription failed') : 'No speech detected';
    updateTrayMenu(lastError ? 'Error' : 'Idle');
    if (lastError) setTimeout(() => updateTrayMenu('Idle'), 3000);
    sendHud({ phase: 'error', message: msg });
    setTimeout(() => hideHud(), 1500);
    if (lastError) notify('MindWhisper — Transcription failed', msg);
    finalizingStartedAt = null;
    inFlightFinalizeToken = null;
    if (currentRecordingId === recordingIdAtStart) currentRecordingId = null;
    applyPendingHotkeyRestart();
    return;
  }

  // Formatter pass (with streaming + AbortController timeout).
  if (store.get('formatterEnabled')) {
    const active = getActiveFormatterPreset();
    if (active && active.prompt && active.prompt.trim()) {
      const openaiKey = (store.get('providers') || {}).openai && (store.get('providers') || {}).openai.apiKey;
      if (openaiKey) {
        updateTrayMenu('Formatting...');
        if (mainWindow && !mainWindow.isDestroyed()) {
          try { mainWindow.webContents.send('formatting-started'); } catch (_) {}
        }
        sendHud({ phase: 'formatting', text: '' });
        try {
          finalText = await formatTextStreaming(finalText, openaiKey, active.prompt, myToken);
        } catch (err) {
          console.error('[finalize] formatter failed:', err && err.message);
          notify('MindWhisper — Formatter failed', 'Pasted raw transcript. ' + (err.message || ''));
        }
      } else {
        notify('MindWhisper — Formatter skipped', 'Formatter requires an OpenAI API key.');
      }
    }
  }

  if (inFlightFinalizeToken !== myToken) {
    finalizingStartedAt = null;
    return;
  }

  safePaste(finalText);
  addToHistory(finalText);
  sendHud({ phase: 'done', text: finalText });
  setTimeout(() => hideHud(), 900);
  updateTrayMenu('Idle');
  finalizingStartedAt = null;
  inFlightFinalizeToken = null;
  if (currentRecordingId === recordingIdAtStart) currentRecordingId = null;
  applyPendingHotkeyRestart();
}

const FORMATTER_LANGUAGE_PRESERVE =
  '\n\nIMPORTANT: Respond in the same language as the user message. Never translate to another language.';

async function formatTextStreaming(rawText, openaiKey, prompt, ownToken) {
  const openai = new OpenAI({ apiKey: openaiKey });
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 30_000);
  try {
    const stream = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt + FORMATTER_LANGUAGE_PRESERVE },
          { role: 'user', content: rawText },
        ],
        stream: true,
      },
      { signal: ac.signal }
    );
    let acc = '';
    for await (const chunk of stream) {
      if (ownToken !== undefined && inFlightFinalizeToken !== ownToken) {
        ac.abort();
        break;
      }
      const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
      if (delta) {
        acc += delta;
        sendHud({ phase: 'formatting', text: acc });
      }
    }
    const out = acc.trim();
    if (!out) throw new Error('Empty formatter response');
    return out;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Force-reset paths (watchdog, powerMonitor, renderer cancel) ──

function forceResetRecording(reason) {
  // Idempotency guard: nothing to reset and (critically) avoid a feedback loop.
  // Without this, the flow was:
  //   forceReset → send 'cancel-recording' IPC to renderer → renderer responds
  //   with 'recording-cancelled' → handler calls forceReset → infinite
  //   [reset] renderer cancel spam on rapid talk-key taps.
  const alreadyIdle =
    !isRecording &&
    !currentSession &&
    finalizingStartedAt === null &&
    !currentRecordingId &&
    !recordingHardCapId;
  if (alreadyIdle) return;

  if (reason) console.warn('[reset]', reason);
  isRecording = false;
  if (recordingHardCapId) { clearTimeout(recordingHardCapId); recordingHardCapId = null; }
  if (currentSession) { try { currentSession.cancel(); } catch (_) {} }
  currentSession = null;
  currentRecordingId = null;
  finalizingStartedAt = null;
  inFlightFinalizeToken = null;
  lastAudioChunkAt = 0;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('cancel-recording'); } catch (_) {}
  }
  hideHud();
  updateTrayMenu('Idle');
  applyPendingHotkeyRestart();
}

function checkRecordingHealth() {
  if (isRecording && lastAudioChunkAt > 0 && Date.now() - lastAudioChunkAt > AUDIO_SILENCE_MS) {
    notify('MindWhisper', 'Recording auto-recovered (no audio detected).');
    forceResetRecording('audio silence > ' + AUDIO_SILENCE_MS + 'ms');
    return;
  }
  if (finalizingStartedAt && Date.now() - finalizingStartedAt > FINALIZE_STALL_MS) {
    notify('MindWhisper', 'Transcription stalled — reset.');
    forceResetRecording('finalize stall > ' + FINALIZE_STALL_MS + 'ms');
  }
  // Tray self-healing: if the JS-side tray got destroyed somehow, rebuild.
  // (This won't catch the more common case where macOS detaches the NSStatusItem
  // natively — that's handled in onResume — but it covers edge cases.)
  if (!tray || tray.isDestroyed()) {
    console.warn('[watchdog] tray missing/destroyed, recreating');
    recreateTray();
  }
}

// ── IPC Handlers ──

ipcMain.on('audio-chunk', (_event, payload) => {
  const id = payload && payload.id;
  const buffer = payload && payload.buffer;
  if (!buffer || !currentRecordingId || id !== currentRecordingId) return;
  lastAudioChunkAt = Date.now();
  if (currentSession) {
    try { currentSession.sendPcm(buffer); } catch (_) {}
  }
});

ipcMain.on('audio-level', (_event, payload) => {
  const id = payload && payload.id;
  const level = payload && payload.level;
  if (!isRecording || id !== currentRecordingId) return;
  sendHud({ phase: 'recording', level: Number(level) || 0 });
});

ipcMain.on('recording-stopped', async (_event, payload) => {
  const id = payload && payload.id;
  if (id !== currentRecordingId) return;       // stale from a superseded session
  const wavBuffer = payload && payload.wavBuffer ? Buffer.from(payload.wavBuffer) : null;
  await finalizeRecording(wavBuffer);
});

ipcMain.on('recording-cancelled', (_event, payload) => {
  const id = payload && payload.id;
  // Allow cancellation only if id matches or is absent (defensive).
  if (id && currentRecordingId && id !== currentRecordingId) return;
  // Bail if we're already idle. forceResetRecording also guards this, but
  // returning here keeps the "nothing happened" path silent — no log noise.
  if (!isRecording && !currentSession && finalizingStartedAt === null && !currentRecordingId) {
    return;
  }
  forceResetRecording('renderer cancel');
});

ipcMain.handle('get-settings', () => {
  return {
    keycode: store.get('keycode'),
    keycodeLabel: store.get('keycodeLabel') || getKeyName(store.get('keycode')),
  };
});

ipcMain.handle('save-settings', (_event, settings) => {
  if (settings.keycode !== undefined) {
    store.set('keycode', settings.keycode);
    store.set('keycodeLabel', settings.keycodeLabel || getKeyName(settings.keycode));
    restartUiohook();
  }
  updateTrayMenu('Idle');
  return true;
});

ipcMain.handle('get-providers-config', () => ({
  activeProvider: store.get('activeProvider') || 'openai',
  providers: store.get('providers') || {},
}));

ipcMain.handle('save-providers-config', (_event, partial) => {
  if (!partial) return true;
  if (typeof partial.activeProvider === 'string') {
    store.set('activeProvider', partial.activeProvider);
  }
  if (partial.providers && typeof partial.providers === 'object') {
    const existing = store.get('providers') || {};
    const merged = { ...existing };
    for (const [k, v] of Object.entries(partial.providers)) {
      merged[k] = { ...(existing[k] || {}), ...(v || {}) };
    }
    store.set('providers', merged);
  }
  updateTrayMenu('Idle');
  return true;
});

ipcMain.handle('test-provider', async (_event, providerId) => {
  const providers = store.get('providers') || {};
  const cfg = providers[providerId];
  if (!cfg || !cfg.apiKey) return { ok: false, error: 'API key not set' };
  try {
    if (providerId === 'openai') {
      const client = new OpenAI({ apiKey: cfg.apiKey });
      await withTimeout(client.models.list(), 8_000, 'openai test');
      return { ok: true };
    }
    if (providerId === 'groq') {
      const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: 'https://api.groq.com/openai/v1' });
      await withTimeout(client.models.list(), 8_000, 'groq test');
      return { ok: true };
    }
    if (providerId === 'deepgram') {
      const res = await withTimeout(
        fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${cfg.apiKey}` } }),
        8_000,
        'deepgram test'
      );
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown provider' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('get-history', () => store.get('history') || []);
ipcMain.handle('clear-history', () => { store.set('history', []); return true; });

ipcMain.on('set-keybind-mode', (_event, payload) => {
  // payload: { enabled: boolean, mode?: 'talk' | 'toggleChord' | 'digitChord' }
  if (!payload || !payload.enabled) {
    keybindMode = null;
    return;
  }
  keybindMode = { mode: payload.mode || 'talk' };
});

ipcMain.handle('get-chords', () => ({
  chordToggle: store.get('chordToggle'),
  chordDigitModifiers: store.get('chordDigitModifiers'),
}));

ipcMain.handle('save-chords', (_event, partial) => {
  if (!partial) return true;
  if (partial.chordToggle && typeof partial.chordToggle === 'object') {
    store.set('chordToggle', {
      keycode: partial.chordToggle.keycode,
      modifiers: {
        meta: !!(partial.chordToggle.modifiers && partial.chordToggle.modifiers.meta),
        shift: !!(partial.chordToggle.modifiers && partial.chordToggle.modifiers.shift),
        ctrl: !!(partial.chordToggle.modifiers && partial.chordToggle.modifiers.ctrl),
        alt: !!(partial.chordToggle.modifiers && partial.chordToggle.modifiers.alt),
      },
    });
  }
  if (partial.chordDigitModifiers && typeof partial.chordDigitModifiers === 'object') {
    store.set('chordDigitModifiers', {
      meta: !!partial.chordDigitModifiers.meta,
      shift: !!partial.chordDigitModifiers.shift,
      ctrl: !!partial.chordDigitModifiers.ctrl,
      alt: !!partial.chordDigitModifiers.alt,
    });
  }
  // Re-arm uIOhook listeners with the new chord cache (deferred if recording).
  restartUiohook();
  return true;
});

ipcMain.handle('get-formatter-config', () => ({
  enabled: store.get('formatterEnabled'),
  activePresetId: store.get('formatterActivePresetId'),
  presets: store.get('formatterPresets') || [],
}));

ipcMain.handle('save-formatter-config', (_event, cfg) => {
  if (cfg && Array.isArray(cfg.presets)) store.set('formatterPresets', cfg.presets);
  setFormatterState({
    enabled: cfg && cfg.enabled !== undefined ? !!cfg.enabled : undefined,
    activePresetId: cfg && cfg.activePresetId !== undefined ? cfg.activePresetId : undefined,
  });
  return true;
});

// ── Power events ──

// ── Auto-update ──

function setupAutoUpdater() {
  if (!app.isPackaged) {
    console.log('[autoUpdater] dev mode — auto-updates disabled');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => console.log('[autoUpdater]', m),
    warn: (m) => console.warn('[autoUpdater]', m),
    error: (m) => console.error('[autoUpdater]', m),
    debug: () => {},
  };

  autoUpdater.on('checking-for-update', () => {
    updateState = 'checking';
    updateTrayMenu('Idle');
  });

  autoUpdater.on('update-available', (info) => {
    updateState = 'downloading';
    updateTrayMenu('Idle');
    notify('MindWhisper — Update available', `Downloading v${info.version} in the background…`);
  });

  autoUpdater.on('update-not-available', () => {
    updateState = 'idle';
    updateDownloadedInfo = null;
    updateTrayMenu('Idle');
  });

  autoUpdater.on('download-progress', (_progress) => {
    // Intentionally no tray rebuild during download. Menu.buildFromTemplate is
    // synchronous and ~5–50 ms; rebuilding on every progress tick starves the
    // main event loop alongside the autoUpdater's network I/O + gzip work,
    // which the user perceives as the app freezing. State doesn't change here,
    // so there's nothing to repaint.
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateState = 'downloaded';
    updateDownloadedInfo = info;
    updateTrayMenu('Idle');                  // single rebuild — safe
    promptInstallWhenIdle();                 // show modal dialog (or queue if recording)
  });

  autoUpdater.on('error', (err) => {
    updateState = 'error';
    updateTrayMenu('Idle');
    console.error('[autoUpdater] error:', err && err.message);
    // Reset to idle after 30s so the user can manually retry.
    setTimeout(() => {
      if (updateState === 'error') { updateState = 'idle'; updateTrayMenu('Idle'); }
    }, 30_000);
  });

  // Initial check 30s after launch — give the user time to grant Accessibility, etc.
  // Wrap in withTimeout(30s) so a hanging GitHub fetch can't leak sockets indefinitely
  // over days of uptime.
  setTimeout(() => {
    withTimeout(autoUpdater.checkForUpdates(), 30_000, 'update check').catch(() => {});
  }, UPDATE_INITIAL_DELAY_MS);
  // Recurring check every 4 hours.
  updateCheckIntervalId = setInterval(() => {
    withTimeout(autoUpdater.checkForUpdates(), 30_000, 'update check').catch(() => {});
  }, UPDATE_CHECK_INTERVAL_MS);
}

function checkForUpdatesManual() {
  if (!app.isPackaged) {
    notify('MindWhisper', 'Auto-update is disabled in development.');
    return;
  }
  if (updateState === 'downloaded') {
    // Already downloaded — clicking "Check" again should just offer install.
    installUpdateNow();
    return;
  }
  withTimeout(autoUpdater.checkForUpdates(), 30_000, 'update check').catch((err) => {
    notify('MindWhisper — Update check failed', err.message || String(err));
  });
}

function installUpdateNow() {
  if (!updateDownloadedInfo) return;
  if (isRecording || finalizingStartedAt !== null) {
    pendingUpdateInstall = true;
    notify('MindWhisper', 'Update will install as soon as the current dictation finishes.');
    return;
  }
  app.isQuitting = true;
  // isSilent=false shows the installer UI; isForceRunAfter=true relaunches the new version after install.
  autoUpdater.quitAndInstall(false, true);
}

function applyPendingUpdateInstall() {
  if (pendingUpdateInstall && !isRecording && finalizingStartedAt === null) {
    pendingUpdateInstall = false;
    installUpdateNow();
  }
  // Same trigger point: if the download finished while the user was dictating,
  // surface the "Install Now / Later" dialog now that they're idle.
  if (installPromptPending && !isRecording && finalizingStartedAt === null) {
    showInstallDialog();
  }
}

function promptInstallWhenIdle() {
  if (!updateDownloadedInfo) return;
  if (installDialogOpen) return;          // a dialog is already in front of the user
  if (isRecording || finalizingStartedAt !== null) {
    // Defer until the next idle transition; applyPendingUpdateInstall picks it up.
    installPromptPending = true;
    return;
  }
  showInstallDialog();
}

async function showInstallDialog() {
  if (installDialogOpen) return;          // re-entrancy guard: electron-updater can re-emit update-downloaded
  if (!updateDownloadedInfo) return;
  installDialogOpen = true;
  installPromptPending = false;
  const v = updateDownloadedInfo.version;
  // Use null as parent so the dialog is window-modal and reliably focusable
  // (the mainWindow is usually hidden for this tray-based app, which can cause
  // sheet-attached dialogs to render oddly or invisibly).
  try {
    const result = await dialog.showMessageBox(null, {
      type: 'info',
      title: 'Update Ready',
      message: `MindWhisper ${v} is ready to install.`,
      detail: 'Install now? You can also install later — the update will apply automatically the next time you quit the app.',
      buttons: ['Install Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result && result.response === 0) {
      // Re-check recording state: user could have started dictating between
      // dismissing the dialog and this microtask resolving. installUpdateNow's
      // internal check handles it cleanly (queues via pendingUpdateInstall).
      installUpdateNow();
    }
    // "Later" — do nothing. autoInstallOnAppQuit=true means it installs on next quit.
    // The tray menu's "↑ Install update vX.Y.Z" item is still available as a re-entry point.
  } catch (err) {
    console.error('[autoUpdater] install dialog failed:', err && err.message);
  } finally {
    installDialogOpen = false;
  }
}

function prewarmAutomationPermission() {
  // Benign call — just asks System Events for the name of the first process.
  // The first AppleEvent to System Events triggers the macOS Automation permission
  // prompt; doing it here means it fires at app launch, not in the middle of the
  // user's first dictation (where it would race the paste keystroke and silently
  // drop it).
  exec(
    `osascript -e 'tell application "System Events" to return name of first process'`,
    { timeout: 10_000 },
    (err) => {
      if (err) {
        console.warn('[prewarm] Automation pre-warm failed:', err.message || err);
      } else {
        console.log('[prewarm] Automation permission OK');
      }
    }
  );
}

function onSleepOrLock() {
  if (isRecording) {
    notify('MindWhisper', 'Recording cancelled — system going to sleep / locked.');
    forceResetRecording('powerMonitor: suspend/lock');
  }
}

function onResume() {
  // macOS commonly detaches the NSStatusItem's event responder during sleep/lock —
  // the icon stays in the menu bar but clicks stop opening the menu. Force a fresh
  // tray so clicks reliably work after wake / unlock.
  recreateTray();
  // macOS may have reset HUD window flags during sleep — re-applied lazily by showHud on next record.
  applyPendingHotkeyRestart();
}

// ── App lifecycle ──

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    // Lock the app into accessory mode BEFORE the tray's NSStatusItem is
    // registered. Combined with `LSUIElement: true` in Info.plist
    // (build.mac.extendInfo), the app is born without a dock icon and never
    // appears in Cmd+Tab — closing the activation-policy race that was leaving
    // tray click handlers unbound on signed builds.
    app.setActivationPolicy('accessory');
  }

  console.log(`[boot] MindWhisper v${app.getVersion()} ready — platform=${process.platform} userData=${app.getPath('userData')}`);

  createWindow();
  createHudWindow();
  createTray();

  // One-shot delayed re-attach: after migrations and any async startup work
  // have settled, rebuild the tray menu so the user sees the rich version even
  // if the first build inside createTray() ran against partial state.
  setTimeout(() => {
    if (tray && !tray.isDestroyed()) updateTrayMenu('Idle');
  }, 1500);

  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    if (!trusted) {
      dialog.showErrorBox(
        'MindWhisper - Permission Required',
        'Accessibility permission is needed for global hotkeys. Please grant it in System Settings > Privacy & Security > Accessibility, then restart the app.'
      );
      return;
    }
  }

  try {
    setupUiohook();
  } catch (err) {
    dialog.showErrorBox(
      'MindWhisper - Error',
      'Could not start global keyboard listener: ' + (err.message || err)
    );
  }

  // Trigger macOS Automation permission dialog upfront so the first real paste
  // doesn't race the dialog and silently drop its keystroke.
  if (process.platform === 'darwin') prewarmAutomationPermission();

  // Health watchdog: every 1 s, recover from stuck recording or stalled finalize.
  healthIntervalId = setInterval(checkRecordingHealth, 1000);

  // Auto-update: checks GitHub Releases, downloads in background, prompts via tray.
  setupAutoUpdater();

  // Power events
  try {
    powerMonitor.on('suspend', onSleepOrLock);
    powerMonitor.on('lock-screen', onSleepOrLock);
    powerMonitor.on('resume', onResume);
    powerMonitor.on('unlock-screen', onResume);
  } catch (e) {
    console.error('[powerMonitor] not available:', e && e.message);
  }
});

app.on('window-all-closed', () => {
  // Intentionally a no-op on darwin. With LSUIElement=true we're a proper
  // accessory app — macOS already keeps the app alive after all windows close
  // (menubar-app convention). Calling event.preventDefault() here interacted
  // badly with an in-flight app.quit() on signed v1.0.11, freezing the app
  // post-Quit. The non-darwin branch is for any future Windows/Linux port.
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  console.log('[quit] before-quit — cleaning up');

  if (healthIntervalId)         { clearInterval(healthIntervalId);         healthIntervalId = null; }
  if (updateCheckIntervalId)    { clearInterval(updateCheckIntervalId);    updateCheckIntervalId = null; }
  if (recordingHardCapId)       { clearTimeout(recordingHardCapId);        recordingHardCapId = null; }
  if (formatterNoticeHideTimer) { clearTimeout(formatterNoticeHideTimer);  formatterNoticeHideTimer = null; }

  // electron-updater attempts to install any downloaded update on quit. If
  // nothing is actually downloaded, defang it so the install path doesn't run
  // with empty/stale state during teardown.
  try {
    if (updateState !== 'downloaded') {
      autoUpdater.autoInstallOnAppQuit = false;
    }
  } catch (_) {}

  try { uIOhook.stop(); } catch (_) {}

  // Hard-exit watchdog: if Electron's quit sequence stalls (uiohook native
  // module hang, renderer zombie, AppKit edge case), force-terminate after 2 s.
  // .unref() so this timer doesn't itself keep the loop alive.
  setTimeout(() => {
    console.warn('[quit] hard exit after 2 s — Electron quit sequence stalled');
    process.exit(0);
  }, 2000).unref();
});

app.on('will-quit', () => {
  console.log('[quit] will-quit');
  try { uIOhook.stop(); } catch (_) {}
});
