export {}

declare global {
  interface Window {
    electronAPI: {
      openExternal: (url: string) => void
      fetchWiki: (name: string, type: 'move' | 'ability') => Promise<string | null>
    }
  }
}
