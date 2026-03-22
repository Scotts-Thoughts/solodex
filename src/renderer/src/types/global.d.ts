export {}

declare global {
  interface Window {
    electronAPI: {
      openExternal: (url: string) => void
      saveImage: (url: string, defaultName: string) => Promise<boolean>
      savePngData: (dataUrl: string, defaultName: string) => Promise<boolean>
      fetchWiki: (name: string, type: 'move' | 'ability' | 'tm') => Promise<string | null>
      fetchTmPage: (tmCode: string) => Promise<string | null>
      fetchSerebiiTutor: (game: string) => Promise<string | null>
      checkForUpdates: () => Promise<{ hasUpdate: boolean; latestVersion: string; currentVersion: string; downloadUrl: string }>
      openDownloadPage: (url: string) => Promise<void>
      getUpdatePreference: () => Promise<boolean>
      setUpdatePreference: (neverRemind: boolean) => Promise<void>
      performAutoUpdate: () => Promise<{ started: boolean; reason?: string }>
      getIsDev: () => Promise<boolean>
      simulateUpdateProgress: () => Promise<void>
      subscribeUpdateStatus: (callback: (event: { type: string; percent?: number }) => void) => () => void
      subscribeOpenShortcuts: (callback: () => void) => () => void
    }
  }
}
