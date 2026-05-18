const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hudAPI', {
  onUpdate: (callback) => ipcRenderer.on('hud-update', (_e, payload) => callback(payload)),
});
