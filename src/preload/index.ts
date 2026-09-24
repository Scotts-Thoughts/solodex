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
  restoreRendererFocus: () => ipcRenderer.invoke('restore-renderer-focus'),
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
  subscribeBulkExport: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-bulk-export', handler)
    return () => { ipcRenderer.removeListener('trigger-bulk-export', handler) }
  },
  subscribeBulkExportCompare: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-bulk-export-compare', handler)
    return () => { ipcRenderer.removeListener('trigger-bulk-export-compare', handler) }
  },
  subscribeBulkExportCustom: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('trigger-bulk-export-custom', handler)
    return () => { ipcRenderer.removeListener('trigger-bulk-export-custom', handler) }
  },
  selectExportFolder: () => ipcRenderer.invoke('select-export-folder'),
  savePngToFolder: (folder: string, filename: string, dataUrl: string) =>
    ipcRenderer.invoke('save-png-to-folder', folder, filename, dataUrl),
  getTransparentExport: () => ipcRenderer.invoke('get-transparent-export'),
  subscribeTransparentExport: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('transparent-export-changed', handler)
    return () => { ipcRenderer.removeListener('transparent-export-changed', handler) }
  },
  getExportToFolder: () => ipcRenderer.invoke('get-export-to-folder'),
  subscribeExportToFolder: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('export-to-folder-changed', handler)
    return () => { ipcRenderer.removeListener('export-to-folder-changed', handler) }
  },
  getExportFolder: () => ipcRenderer.invoke('get-export-folder'),
  subscribeExportFolder: (callback: (value: string | null) => void) => {
    const handler = (_: unknown, value: string | null) => callback(value)
    ipcRenderer.on('export-folder-changed', handler)
    return () => { ipcRenderer.removeListener('export-folder-changed', handler) }
  },
  getCrossOutBanned: () => ipcRenderer.invoke('get-cross-out-banned'),
  subscribeCrossOutBanned: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('cross-out-banned-changed', handler)
    return () => { ipcRenderer.removeListener('cross-out-banned-changed', handler) }
  },
  getCrossOutPostgame: () => ipcRenderer.invoke('get-cross-out-postgame'),
  subscribeCrossOutPostgame: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('cross-out-postgame-changed', handler)
    return () => { ipcRenderer.removeListener('cross-out-postgame-changed', handler) }
  },
  getCrossOutConditional: () => ipcRenderer.invoke('get-cross-out-conditional'),
  subscribeCrossOutConditional: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('cross-out-conditional-changed', handler)
    return () => { ipcRenderer.removeListener('cross-out-conditional-changed', handler) }
  },
  getUserBans: () => ipcRenderer.invoke('get-user-bans'),
  setUserBans: (bans: { banned: string[]; conditional: string[]; byGame: Record<string, string[]> }) =>
    ipcRenderer.invoke('set-user-bans', bans),
  subscribeUserBans: (callback: (value: { banned: string[]; conditional: string[]; byGame: Record<string, string[]> }) => void) => {
    const handler = (_: unknown, value: { banned: string[]; conditional: string[]; byGame: Record<string, string[]> }) => callback(value)
    ipcRenderer.on('user-bans-changed', handler)
    return () => { ipcRenderer.removeListener('user-bans-changed', handler) }
  },
  subscribeOpenBannedMovesModal: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('open-banned-moves-modal', handler)
    return () => { ipcRenderer.removeListener('open-banned-moves-modal', handler) }
  },
  getShowMovepoolDiff: () => ipcRenderer.invoke('get-show-movepool-diff'),
  subscribeShowMovepoolDiff: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('show-movepool-diff-changed', handler)
    return () => { ipcRenderer.removeListener('show-movepool-diff-changed', handler) }
  },
  getShowBulk: () => ipcRenderer.invoke('get-show-bulk'),
  subscribeShowBulk: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('show-bulk-changed', handler)
    return () => { ipcRenderer.removeListener('show-bulk-changed', handler) }
  },
  getShowWbst: () => ipcRenderer.invoke('get-show-wbst'),
  subscribeShowWbst: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('show-wbst-changed', handler)
    return () => { ipcRenderer.removeListener('show-wbst-changed', handler) }
  },
  getShowUbst: () => ipcRenderer.invoke('get-show-ubst'),
  subscribeShowUbst: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('show-ubst-changed', handler)
    return () => { ipcRenderer.removeListener('show-ubst-changed', handler) }
  },
  getIncludeTypeEffInExports: () => ipcRenderer.invoke('get-include-type-eff-in-exports'),
  subscribeIncludeTypeEffInExports: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('include-type-eff-in-exports-changed', handler)
    return () => { ipcRenderer.removeListener('include-type-eff-in-exports-changed', handler) }
  },
  getBulkExport1080: () => ipcRenderer.invoke('get-bulk-export-1080'),
  getInitialSettings: () => ipcRenderer.invoke('get-initial-settings'),
  subscribeBulkExport1080: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('bulk-export-1080-changed', handler)
    return () => { ipcRenderer.removeListener('bulk-export-1080-changed', handler) }
  },
  saveRoutePlan: (json: string, defaultName: string) => ipcRenderer.invoke('save-route-plan', json, defaultName),
  loadRoutePlan: () => ipcRenderer.invoke('load-route-plan'),

  // --- Issues (bug reporter) — see src/main/issues/index.ts ---
  captureIssueScreenshot: () => ipcRenderer.invoke('issue-capture-screenshot'),
  getIssueAppInfo: () => ipcRenderer.invoke('issue-app-info'),
  createIssue: (input: unknown) => ipcRenderer.invoke('issue-create', input),
  listIssues: () => ipcRenderer.invoke('issue-list'),
  getIssue: (id: string) => ipcRenderer.invoke('issue-get', id),
  getIssueScreenshot: (id: string) => ipcRenderer.invoke('issue-screenshot', id),
  openIssueAttachment: (id: string, file: string) => ipcRenderer.invoke('issue-open-attachment', id, file),
  showIssueInFolder: (id: string) => ipcRenderer.invoke('issue-show-in-folder', id),
  retryIssueSend: (id: string) => ipcRenderer.invoke('issue-retry-send', id),
  refreshIssueStatus: (id: string, force?: boolean) => ipcRenderer.invoke('issue-refresh-status', id, force),
  refreshIssueStatuses: () => ipcRenderer.invoke('issue-refresh-all'),
  exportIssueZip: (id: string) => ipcRenderer.invoke('issue-export-zip', id),
  deleteIssue: (id: string) => ipcRenderer.invoke('issue-delete', id),
  getDeveloperMode: () => ipcRenderer.invoke('issue-get-developer-mode'),
  devListGithubIssues: () => ipcRenderer.invoke('dev-list-github-issues'),
  devResolveIssue: (number: number) => ipcRenderer.invoke('dev-resolve-issue', number),
  devReopenIssue: (number: number) => ipcRenderer.invoke('dev-reopen-issue', number),
  subscribeOpenIssueReporter: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('open-issue-reporter', handler)
    return () => { ipcRenderer.removeListener('open-issue-reporter', handler) }
  },
  subscribeOpenIssuesPanel: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('open-issues-panel', handler)
    return () => { ipcRenderer.removeListener('open-issues-panel', handler) }
  },
  subscribeIssuesChanged: (callback: (payload: { ids: string[] }) => void) => {
    const handler = (_: unknown, payload: { ids: string[] }) => callback(payload)
    ipcRenderer.on('issues-changed', handler)
    return () => { ipcRenderer.removeListener('issues-changed', handler) }
  },
  subscribeDeveloperMode: (callback: (value: boolean) => void) => {
    const handler = (_: unknown, value: boolean) => callback(value)
    ipcRenderer.on('developer-mode-changed', handler)
    return () => { ipcRenderer.removeListener('developer-mode-changed', handler) }
  }
})
