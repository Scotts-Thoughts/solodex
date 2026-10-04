// Serves the map packs (resources/maps/<pack>.zip, built by `npm run
// build:maps`) to the renderer as `solodex-map://<pack>/<path>`. Packaged
// builds ship them as extraResources (process.resourcesPath/maps); dev reads
// them from the project. See docs/maps/README.md.

import { app, ipcMain, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { MAP_SCHEME } from '../../shared/mapPack'
import { ZipFile } from './zip'

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.bin': 'application/octet-stream',
}

function mapsDir(): string {
  if (process.env.SOLODEX_MAPS_DIR) return process.env.SOLODEX_MAPS_DIR
  return app.isPackaged ? path.join(process.resourcesPath, 'maps') : path.join(app.getAppPath(), 'resources', 'maps')
}

// Open zips by pack id; reopened when the file changes (a rebuild during dev)
const open = new Map<string, { mtimeMs: number; zip: Promise<ZipFile> }>()

async function packZip(pack: string): Promise<ZipFile | null> {
  const file = path.join(mapsDir(), `${pack}.zip`)
  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(file)
  } catch {
    return null
  }
  const cached = open.get(pack)
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.zip
  if (cached) cached.zip.then(z => z.close()).catch(() => {})
  const zip = ZipFile.open(file)
  open.set(pack, { mtimeMs: stat.mtimeMs, zip })
  zip.catch(() => open.delete(pack))
  return zip
}

/** Must run before the app is ready. */
export function registerMapScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MAP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ])
}

/** Must run once the app is ready. */
export function registerMapProtocol(): void {
  protocol.handle(MAP_SCHEME, async req => {
    const url = new URL(req.url)
    const pack = url.hostname
    const file = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!/^[a-z0-9_]+$/.test(pack) || file.includes('..')) return new Response(null, { status: 400 })
    try {
      const zip = await packZip(pack)
      const data = zip ? await zip.read(file) : null
      if (!data) return new Response(null, { status: 404 })
      return new Response(new Uint8Array(data), {
        headers: {
          'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
          'access-control-allow-origin': '*',
        },
      })
    } catch (err) {
      console.error(`[Solodex] map pack read failed: ${req.url}`, err)
      return new Response(null, { status: 500 })
    }
  })

  // The pack ids that are installed
  ipcMain.handle('get-map-packs', async () => {
    try {
      const names = await fs.promises.readdir(mapsDir())
      return names.filter(n => n.endsWith('.zip')).map(n => n.slice(0, -4))
    } catch {
      return []
    }
  })
}
