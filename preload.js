const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStartRecording: (callback) => ipcRenderer.on('start-recording', callback),
  onStopRecording: (callback) => ipcRenderer.on('stop-recording', callback),
  onCancelRecording: (callback) => ipcRenderer.on('cancel-recording', callback),
  onKeybindCaptured: (callback) => ipcRenderer.on('keybind-captured', (_e, data) => callback(data)),
  onSwitchTab: (callback) => ipcRenderer.on('switch-tab', (_e, tab) => callback(tab)),

  transcribe: (arrayBuffer) => ipcRenderer.invoke('transcribe', arrayBuffer),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  setKeybindMode: (enabled) => ipcRenderer.send('set-keybind-mode', enabled),
});