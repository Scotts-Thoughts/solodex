export {}

declare global {
  interface Window {
    electronAPI: {
      openExternal: (url: string) => void
      fetchWiki: (name: string, type: 'move' | 'ability' | 'tm') => Promise<string | null>
      fetchTmPage: (tmCode: string) => Promise<string | null>
      checkForUpdates: () => Promise<{ hasUpdate: boolean; latestVersion: string; currentVersion: string; downloadUrl: string }>
      openDownloadPage: (url: string) => Promise<void>
      getUpdatePreference: () => Promise<boolean>
      setUpdatePreference: (neverRemind: boolean) => Promise<void>
    }
  }
}
