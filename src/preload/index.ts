import { contextBridge, shell, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string) => shell.openExternal(url),
  fetchWiki: (name: string, type: string) => ipcRenderer.invoke('fetch-wiki', name, type),
  fetchTmPage: (tmCode: string) => ipcRenderer.invoke('fetch-tm-page', tmCode),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openDownloadPage: (url: string) => ipcRenderer.invoke('open-download-page', url),
  getUpdatePreference: () => ipcRenderer.invoke('get-update-preference'),
  setUpdatePreference: (neverRemind: boolean) => ipcRenderer.invoke('set-update-preference', neverRemind)
})
