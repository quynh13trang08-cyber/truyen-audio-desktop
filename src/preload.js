const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioAPI', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: data => ipcRenderer.invoke('library:save', data),
  openTextFile: () => ipcRenderer.invoke('file:open-text'),
  importWebsite: url => ipcRenderer.invoke('web:import', url)
});
