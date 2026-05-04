const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, ipcMain, clipboard, dialog, Notification, systemPreferences } = require('electron');
const { uIOhook } = require('uiohook-napi');
const OpenAI = require('openai');
const Store = require('electron-store');
const { exec } = require('child_process');

const store = new Store({
  defaults: {
    apiKey: '',
    keycode: 3640,
    keycodeLabel: 'Right Option',
    history: [],
  },
});

let mainWindow = null;
let tray = null;
let isRecording = false;
let recordingStartTime = 0;
let keybindMode = false;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 520,
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
}

function showWindow(tab) {
  mainWindow.show();
  mainWindow.focus();
  if (tab) mainWindow.webContents.send('switch-tab', tab);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('MindWhisper');
  updateTrayMenu('Idle');
}

function updateTrayMenu(status) {
  const keybindLabel = store.get('keycodeLabel') || getKeyName(store.get('keycode'));
  const contextMenu = Menu.buildFromTemplate([
    { label: `Status: ${status}`, enabled: false },
    { label: `Hotkey: ${keybindLabel}`, enabled: false },
    { type: 'separator' },
    { label: 'Settings', click: () => showWindow('settings') },
    { label: 'History', click: () => showWindow('history') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

function setupUiohook() {
  const configuredKeycode = store.get('keycode');

  uIOhook.on('keydown', (e) => {
    if (keybindMode) {
      mainWindow.webContents.send('keybind-captured', {
        keycode: e.keycode,
        label: getKeyName(e.keycode),
      });
      return;
    }
    if (e.keycode === configuredKeycode && !isRecording) {
      isRecording = true;
      recordingStartTime = Date.now();
      mainWindow.webContents.send('start-recording');
      updateTrayMenu('Recording...');
    }
  });

  uIOhook.on('keyup', (e) => {
    if (e.keycode === configuredKeycode && isRecording) {
      isRecording = false;
      const duration = Date.now() - recordingStartTime;
      if (duration < 500) {
        mainWindow.webContents.send('cancel-recording');
        updateTrayMenu('Idle');
        return;
      }
      mainWindow.webContents.send('stop-recording');
      updateTrayMenu('Transcribing...');
    }
  });

  uIOhook.start();
}

function restartUiohook() {
  uIOhook.stop();
  uIOhook.removeAllListeners();
  setupUiohook();
}

function pasteText(text) {
  clipboard.writeText(text);
  exec('osascript -e \'tell application "System Events" to keystroke "v" using command down\'');
}

function addToHistory(text) {
  const history = store.get('history') || [];
  history.unshift({ text, timestamp: Date.now() });
  // Keep last 200 entries
  if (history.length > 200) history.length = 200;
  store.set('history', history);
}

// IPC Handlers
ipcMain.handle('transcribe', async (_event, arrayBuffer) => {
  const apiKey = store.get('apiKey');
  if (!apiKey) {
    throw new Error('No API key configured. Please enter your OpenAI API key in Settings.');
  }

  const tmpPath = path.join(app.getPath('temp'), `whisper-recording-${Date.now()}.webm`);

  try {
    fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));

    const openai = new OpenAI({ apiKey });
    const result = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(tmpPath),
    });

    pasteText(result.text);
    addToHistory(result.text);
    updateTrayMenu('Idle');

    return { text: result.text };
  } catch (err) {
    updateTrayMenu('Error');
    setTimeout(() => updateTrayMenu('Idle'), 3000);

    if (Notification.isSupported()) {
      new Notification({
        title: 'MindWhisper Error',
        body: err.message || 'Transcription failed',
      }).show();
    }

    throw err;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
});

ipcMain.handle('get-settings', () => {
  return {
    apiKey: store.get('apiKey') || '',
    keycode: store.get('keycode'),
    keycodeLabel: store.get('keycodeLabel') || getKeyName(store.get('keycode')),
  };
});

ipcMain.handle('save-settings', (_event, settings) => {
  if (settings.apiKey !== undefined) store.set('apiKey', settings.apiKey);
  if (settings.keycode !== undefined) {
    store.set('keycode', settings.keycode);
    store.set('keycodeLabel', settings.keycodeLabel || getKeyName(settings.keycode));
    restartUiohook();
  }
  updateTrayMenu('Idle');
  return true;
});

ipcMain.handle('get-history', () => {
  return store.get('history') || [];
});

ipcMain.handle('clear-history', () => {
  store.set('history', []);
  return true;
});

ipcMain.on('set-keybind-mode', (_event, enabled) => {
  keybindMode = enabled;
});

// App lifecycle
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  createWindow();
  createTray();

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
});

app.on('window-all-closed', (e) => {
  e.preventDefault?.();
});

app.on('before-quit', () => {
  try { uIOhook.stop(); } catch {}
});

app.on('will-quit', () => {
  try { uIOhook.stop(); } catch {}
});
