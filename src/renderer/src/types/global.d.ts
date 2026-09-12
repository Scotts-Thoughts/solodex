import type { DevResult, GhIssueSummary, IssueRecord, NewIssueInput } from '../../../shared/issues'

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
      restoreRendererFocus: () => Promise<void>
      simulateUpdateProgress: () => Promise<void>
      subscribeUpdateStatus: (callback: (event: { type: string; percent?: number }) => void) => () => void
      subscribeOpenShortcuts: (callback: () => void) => () => void
      subscribeBulkExport: (callback: () => void) => () => void
      subscribeBulkExportCompare: (callback: () => void) => () => void
      subscribeBulkExportCustom: (callback: () => void) => () => void
      selectExportFolder: () => Promise<string | null>
      savePngToFolder: (folder: string, filename: string, dataUrl: string) => Promise<boolean>
      getTransparentExport: () => Promise<boolean>
      subscribeTransparentExport: (callback: (value: boolean) => void) => () => void
      getExportToFolder: () => Promise<boolean>
      subscribeExportToFolder: (callback: (value: boolean) => void) => () => void
      getExportFolder: () => Promise<string | null>
      subscribeExportFolder: (callback: (value: string | null) => void) => () => void
      getCrossOutBanned: () => Promise<boolean>
      subscribeCrossOutBanned: (callback: (value: boolean) => void) => () => void
      getCrossOutPostgame: () => Promise<boolean>
      subscribeCrossOutPostgame: (callback: (value: boolean) => void) => () => void
      getCrossOutConditional: () => Promise<boolean>
      subscribeCrossOutConditional: (callback: (value: boolean) => void) => () => void
      getUserBans: () => Promise<{ banned: string[]; conditional: string[]; byGame: Record<string, string[]> }>
      setUserBans: (bans: { banned: string[]; conditional: string[]; byGame: Record<string, string[]> }) => Promise<void>
      subscribeUserBans: (callback: (value: { banned: string[]; conditional: string[]; byGame: Record<string, string[]> }) => void) => () => void
      subscribeOpenBannedMovesModal: (callback: () => void) => () => void
      getShowMovepoolDiff: () => Promise<boolean>
      subscribeShowMovepoolDiff: (callback: (value: boolean) => void) => () => void
      getShowBulk: () => Promise<boolean>
      subscribeShowBulk: (callback: (value: boolean) => void) => () => void
      getShowWbst: () => Promise<boolean>
      subscribeShowWbst: (callback: (value: boolean) => void) => () => void
      getShowUbst: () => Promise<boolean>
      subscribeShowUbst: (callback: (value: boolean) => void) => () => void
      getIncludeTypeEffInExports: () => Promise<boolean>
      subscribeIncludeTypeEffInExports: (callback: (value: boolean) => void) => () => void
      getBulkExport1080: () => Promise<boolean>
      subscribeBulkExport1080: (callback: (value: boolean) => void) => () => void
      saveRoutePlan: (json: string, defaultName: string) => Promise<boolean>
      loadRoutePlan: () => Promise<string | null>
      // Issues (bug reporter)
      captureIssueScreenshot: () => Promise<{ captureId: string; dataUrl: string; width: number; height: number } | null>
      getIssueAppInfo: () => Promise<{ version: string; developerMode: boolean; relayConfigured: boolean }>
      createIssue: (input: NewIssueInput) => Promise<IssueRecord>
      listIssues: () => Promise<IssueRecord[]>
      getIssue: (id: string) => Promise<IssueRecord | null>
      getIssueScreenshot: (id: string) => Promise<string | null>
      openIssueAttachment: (id: string, file: string) => Promise<boolean>
      showIssueInFolder: (id: string) => Promise<void>
      retryIssueSend: (id: string) => Promise<IssueRecord>
      refreshIssueStatus: (id: string, force?: boolean) => Promise<IssueRecord>
      refreshIssueStatuses: () => Promise<{ checked: number; changed: number }>
      exportIssueZip: (id: string) => Promise<{ ok: boolean; path?: string; error?: string }>
      deleteIssue: (id: string) => Promise<boolean>
      getDeveloperMode: () => Promise<boolean>
      devListGithubIssues: () => Promise<DevResult<GhIssueSummary[]>>
      devResolveIssue: (number: number) => Promise<DevResult<void>>
      devReopenIssue: (number: number) => Promise<DevResult<void>>
      subscribeOpenIssueReporter: (callback: () => void) => () => void
      subscribeOpenIssuesPanel: (callback: () => void) => () => void
      subscribeIssuesChanged: (callback: (payload: { ids: string[] }) => void) => () => void
      subscribeDeveloperMode: (callback: (value: boolean) => void) => () => void
    }
  }
}
