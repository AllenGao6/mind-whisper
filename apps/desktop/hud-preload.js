const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hudAPI', {
  // Main → HUD
  onUpdate: (callback) => ipcRenderer.on('hud-update', (_e, payload) => callback(payload)),
  onConfig: (callback) => ipcRenderer.on('hud-config', (_e, config) => callback(config)),
  // HUD → main
  resize: (width, height) => ipcRenderer.send('hud-resize', { width, height }),
  selectLanguage: (code) => ipcRenderer.send('hud-select-language', code),
  selectProvider: (id) => ipcRenderer.send('hud-select-provider', id),
  selectFormat: (presetId) => ipcRenderer.send('hud-select-format', presetId),
});
