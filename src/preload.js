/*
  MIDIsync
  Copyright 2022 Luc DeTellis
*/

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onShowMessage: (callback) => {
    ipcRenderer.on('show-message', callback);
  },

  onDisplaySettings: (callback) => {
    ipcRenderer.on('display-settings', callback);
  },

  requestSettings: () => {
    ipcRenderer.send('request-settings');
  },

  updateSettings: (settings) => {
    ipcRenderer.send('update-settings', settings);
  }
});
