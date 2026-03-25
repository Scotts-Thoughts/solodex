const APP_BG = '#111827' // bg-gray-900

let transparentExport = true

export function setTransparentExport(value: boolean): void {
  transparentExport = value
}

export function getExportBgColor(): string {
  return transparentExport ? 'transparent' : APP_BG
}
