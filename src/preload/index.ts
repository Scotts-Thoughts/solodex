import { contextBridge, shell, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string) => shell.openExternal(url),
  saveImage: (url: string, defaultName: string) => ipcRenderer.invoke('save-image', url, defaultName),
  fetchWiki: (name: string, type: string) => ipcRenderer.invoke('fetch-wiki', name, type),
  fetchTmPage: (tmCode: string) => ipcRenderer.invoke('fetch-tm-page', tmCode),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openDownloadPage: (url: string) => ipcRenderer.invoke('open-download-page', url),
  getUpdatePreference: () => ipcRenderer.invoke('get-update-preference'),
  setUpdatePreference: (neverRemind: boolean) => ipcRenderer.invoke('set-update-preference', neverRemind),
  performAutoUpdate: () => ipcRenderer.invoke('perform-auto-update'),
  getIsDev: () => ipcRenderer.invoke('get-is-dev'),
  simulateUpdateProgress: () => ipcRenderer.invoke('simulate-update-progress'),
  subscribeUpdateStatus: (callback: (event: { type: string; percent?: number }) => void) => {
    const handler = (_: unknown, payload: { type: string; percent?: number }) => callback(payload)
    ipcRenderer.on('update-status', handler)
    return () => { ipcRenderer.removeListener('update-status', handler) }
  }
})
