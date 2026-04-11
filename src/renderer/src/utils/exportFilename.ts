// Builds export filenames in the form `${YYYYMMDDHHMMSS}-${GAMENAME}-${base}`
// so exported graphics can be easily verified against the game they came from.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function exportTimestamp(d: Date = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export function sanitizeGameName(game: string): string {
  return game
    .replace(/[\\/:*?"<>|]/g, '')       // strip characters illegal in filenames
    .replace(/\s+/g, '_')                // collapse whitespace
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

// `base` should NOT include the extension. `ext` defaults to `png`.
export function buildExportFilename(game: string | null | undefined, base: string, ext = 'png'): string {
  const ts = exportTimestamp()
  const gamePart = game ? sanitizeGameName(game) : ''
  const cleanBase = base.replace(/\.(png|jpe?g|webp)$/i, '')
  return gamePart
    ? `${ts}-${gamePart}-${cleanBase}.${ext}`
    : `${ts}-${cleanBase}.${ext}`
}
