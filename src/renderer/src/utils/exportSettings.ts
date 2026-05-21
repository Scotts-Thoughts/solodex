const APP_BG = '#111827' // bg-gray-900

let transparentExport = true
let exportToFolder = false
let exportFolder: string | null = null

export function setTransparentExport(value: boolean): void {
  transparentExport = value
}

export function getExportBgColor(): string {
  return transparentExport ? 'transparent' : APP_BG
}

export function setExportToFolder(value: boolean): void {
  exportToFolder = value
}

export function setExportFolder(value: string | null): void {
  exportFolder = value
}

/**
 * Save an exported PNG. If the user has enabled "Export directly to selected folder"
 * AND a folder is configured, write straight to that folder via the main process and
 * skip the save dialog. Otherwise fall back to the browser-style download flow (which
 * Electron surfaces as a save dialog).
 *
 * @param filename Filename WITHOUT the .png extension — extension is added here.
 */
export async function saveExportPng(dataUrl: string, filename: string): Promise<void> {
  const safeFilename = filename.endsWith('.png') ? filename : `${filename}.png`
  if (exportToFolder && exportFolder) {
    try {
      const ok = await window.electronAPI.savePngToFolder(exportFolder, safeFilename, dataUrl)
      if (ok) return
      console.warn('[Solodex] direct folder save failed, falling back to download flow')
    } catch (err) {
      console.warn('[Solodex] direct folder save threw, falling back to download flow', err)
    }
  }
  const link = document.createElement('a')
  link.download = safeFilename
  link.href = dataUrl
  link.click()
}
