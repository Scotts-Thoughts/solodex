import { contextBridge, shell, ipcRenderer } from 'electron'

function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string) => {
    if (isValidExternalUrl(url)) shell.openExternal(url)
  },
  saveImage: (url: string, defaultName: string) => ipcRenderer.invoke('save-image', url, defaultName),
  savePngData: (dataUrl: string, defaultName: string) => ipcRenderer.invoke('save-png-data', dataUrl, defaultName),
  fetchWiki: (name: string, type: string) => ipcRenderer.invoke('fetch-wiki', name, type),
  fetchTmPage: (tmCode: string) => ipcRenderer.invoke('fetch-tm-page', tmCode),
  fetchSerebiiTutor: (game: string) => ipcRenderer.invoke('fetch-serebii-tutor', game),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  openDownloadPage: (url: string) => {
    if (isValidExternalUrl(url)) ipcRenderer.invoke('open-download-page', url)
  },
  getUpdatePreference: () => ipcRenderer.invoke('get-update-preference'),
  setUpdatePreference: (neverRemind: boolean) => ipcRenderer.invoke('set-update-preference', neverRemind),
  performAutoUpdate: () => ipcRenderer.invoke('perform-auto-update'),
  getIsDev: () => ipcRenderer.invoke('get-is-dev'),
  simulateUpdateProgress: () => ipcRenderer.invoke('simulate-update-progress'),
  subscribeUpdateStatus: (callback: (event: { type: string; percent?: number }) => void) => {
    const handler = (_: unknown, payload: { type: string; percent?: number }) => callback(payload)
    ipcRenderer.on('update-status', handler)
    return () => { ipcRenderer.removeListener('update-status', handler) }
  },
  subscribeOpenShortcuts: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('open-keyboard-shortcuts', handler)
    return () => { ipcRenderer.removeListener('open-keyboard-shortcuts', handler) }
  },
  getTransparentExport: () => ipcRenderer.invoke('get-transparent-export'),
  subscribeTransparentExport: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('transparent-export-changed', handler)
    return () => { ipcRenderer.removeListener('transparent-export-changed', handler) }
  },
  getFadeUnobtainable: () => ipcRenderer.invoke('get-fade-unobtainable'),
  subscribeFadeUnobtainable: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('fade-unobtainable-changed', handler)
    return () => { ipcRenderer.removeListener('fade-unobtainable-changed', handler) }
  },
  getShowMovepoolDiff: () => ipcRenderer.invoke('get-show-movepool-diff'),
  subscribeShowMovepoolDiff: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('show-movepool-diff-changed', handler)
    return () => { ipcRenderer.removeListener('show-movepool-diff-changed', handler) }
  },
  getIncludeTypeEffInExports: () => ipcRenderer.invoke('get-include-type-eff-in-exports'),
  subscribeIncludeTypeEffInExports: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('include-type-eff-in-exports-changed', handler)
    return () => { ipcRenderer.removeListener('include-type-eff-in-exports-changed', handler) }
  }
})
