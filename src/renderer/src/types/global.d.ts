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
      subscribeBulkExport: (callback: () => void) => () => void
      selectExportFolder: () => Promise<string | null>
      savePngToFolder: (folder: string, filename: string, dataUrl: string) => Promise<boolean>
      getTransparentExport: () => Promise<boolean>
      subscribeTransparentExport: (callback: (value: boolean) => void) => () => void
      getFadeUnobtainable: () => Promise<boolean>
      subscribeFadeUnobtainable: (callback: (value: boolean) => void) => () => void
      getShowMovepoolDiff: () => Promise<boolean>
      subscribeShowMovepoolDiff: (callback: (value: boolean) => void) => () => void
      getIncludeTypeEffInExports: () => Promise<boolean>
      subscribeIncludeTypeEffInExports: (callback: (value: boolean) => void) => () => void
      getBulkExport1080: () => Promise<boolean>
      subscribeBulkExport1080: (callback: (value: boolean) => void) => () => void
    }
  }
}
