const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioAPI', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: data => ipcRenderer.invoke('library:save', data),
  openTextFile: () => ipcRenderer.invoke('file:open-text'),
  importWebsite: url => ipcRenderer.invoke('web:import', url),
  getTtsStatus: () => ipcRenderer.invoke('tts:status'),
  connectGoogle: details => ipcRenderer.invoke('tts:connect', details),
  clearTtsKey: () => ipcRenderer.invoke('tts:clear-key'),
  testTtsKey: () => ipcRenderer.invoke('tts:test-key'),
  synthesizeSpeech: options => ipcRenderer.invoke('tts:synthesize', options),
  exportBackupZip: () => ipcRenderer.invoke('backup:export-zip'),
  exportTextFiles: mode => ipcRenderer.invoke('backup:export-txt', mode)
});
