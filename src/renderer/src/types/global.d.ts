export {}

declare global {
  interface Window {
    electronAPI: {
      openExternal: (url: string) => void
      fetchWiki: (name: string, type: 'move' | 'ability' | 'tm') => Promise<string | null>
      fetchTmPage: (tmCode: string) => Promise<string | null>
    }
  }
}
