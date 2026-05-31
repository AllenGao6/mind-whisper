const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStartRecording: (callback) => ipcRenderer.on('start-recording', (_e, data) => callback(data)),
  onStopRecording: (callback) => ipcRenderer.on('stop-recording', (_e, data) => callback(data)),
  onCancelRecording: (callback) => ipcRenderer.on('cancel-recording', (_e, data) => callback(data)),
  onKeybindCaptured: (callback) => ipcRenderer.on('keybind-captured', (_e, data) => callback(data)),
  onSwitchTab: (callback) => ipcRenderer.on('switch-tab', (_e, tab) => callback(tab)),

  // Audio streaming — all stamped with the recordingId from start-recording so main can
  // ignore noise from stale/orphaned sessions.
  sendAudioChunk: (arrayBuffer, id) => ipcRenderer.send('audio-chunk', { id, buffer: arrayBuffer }),
  sendAudioLevel: (level, id) => ipcRenderer.send('audio-level', { id, level }),
  sendRecordingStopped: (wavBuffer, id) => ipcRenderer.send('recording-stopped', { id, wavBuffer }),
  sendRecordingCancelled: (id) => ipcRenderer.send('recording-cancelled', { id }),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Providers
  getProvidersConfig: () => ipcRenderer.invoke('get-providers-config'),
  saveProvidersConfig: (cfg) => ipcRenderer.invoke('save-providers-config', cfg),
  testProvider: (id) => ipcRenderer.invoke('test-provider', id),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  exportHistory: () => ipcRenderer.invoke('export-history'),

  setKeybindMode: (enabled, mode) => ipcRenderer.send('set-keybind-mode', { enabled, mode }),

  // Formatter chord shortcuts
  getChords: () => ipcRenderer.invoke('get-chords'),
  saveChords: (partial) => ipcRenderer.invoke('save-chords', partial),

  // Formatter
  getFormatterConfig: () => ipcRenderer.invoke('get-formatter-config'),
  saveFormatterConfig: (cfg) => ipcRenderer.invoke('save-formatter-config', cfg),
  onFormatterStateChanged: (callback) => ipcRenderer.on('formatter-state-changed', (_e, data) => callback(data)),
  onFormattingStarted: (callback) => ipcRenderer.on('formatting-started', callback),

  // Dynamic island (HUD) visibility
  getHudEnabled: () => ipcRenderer.invoke('get-hud-enabled'),
  setHudEnabled: (enabled) => ipcRenderer.invoke('set-hud-enabled', enabled),
  onHudEnabledChanged: (callback) => ipcRenderer.on('hud-enabled-changed', (_e, enabled) => callback(enabled)),
});
