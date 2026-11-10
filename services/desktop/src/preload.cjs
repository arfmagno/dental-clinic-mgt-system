// The only bridge between the web app and the desktop shell: reading and setting the clinic
// server address. Nothing else from Node or Electron is exposed to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clinicDesktop', {
  getServerUrl: () => ipcRenderer.invoke('server-url:get'),
  setServerUrl: (url) => ipcRenderer.invoke('server-url:set', String(url)),
});
