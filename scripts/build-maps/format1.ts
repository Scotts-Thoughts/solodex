// Gens 1–3 (router pack format 1, "tiles"): the world and every interior are
// composited from the tilesets here, at build time, into the same WebP
// surfaces the gen 4/5 packs ship pre-rendered, so the viewer has one path.

import type { MapCategory, PackMap, PackSurface } from '../../src/shared/mapPack'
import { blit, loadF1Pack, renderMap, terrainOf, type F1Map, type F1Pack } from './compose'
import { cropTile, encodeWebp, newRgba, TILE, writePyramid, type Rgba } from './pyramid'
import type { ZipWriter } from './zipWriter'

/** Interiors up to this size ship as one image; larger ones as a pyramid. */
const SINGLE_IMAGE_MAX = 2048

function categoryOf(m: F1Map, env: string | undefined): MapCategory {
  const name = m.display
  if (m.outdoor) {
    if (/\b(Route|Road)\b|^Route\d/i.test(name) || /^ROUTE_|_ROUTE\d/.test(m.key)) return 'route'
    if (/\b(Town|City|Village|Island|Plateau|Harbor|Port)\b/i.test(name)) return 'city'
    return 'area'
  }
  if (/CAVE|UNDERGROUND|DUNGEON/i.test(env ?? '')) return 'dungeon'
  if (/\b(Cave|Forest|Tunnel|Mt\.?|Mount|Mountain|Tower|Ruins|Path|Victory Road|Seafoam|Mansion|Cavern|Chamber|Den|Falls|Woods|Hideout|Ship|Hall of Origin|Rock|Silph|Rocket)\b/i.test(name)) return 'dungeon'
  return 'building'
}

export interface Format1Result {
  pack: F1Pack
  maps: PackMap[]
  surfaces: PackSurface[]
  world: { w: number; h: number; surface: number; defaultMap: number | null; order: number[] }
  terrain: Buffer
}

export async function buildFormat1(dir: string, zip: ZipWriter, envOf: Map<string, string>): Promise<Format1Result> {
  const pack = await loadF1Pack(dir)
  const bp = pack.blockPx
  const spb = bp / 16
  const surfaces: PackSurface[] = []

  // ── world: placed outdoor maps, rendered once and blitted into each tile ──
  const rendered = new Map<number, Rgba | null>()
  const placed = pack.drawOrder.map(m => {
    if (!rendered.has(m.id)) rendered.set(m.id, renderMap(pack, m))
    return { m, x: m.worldPos![0] * bp, y: m.worldPos![1] * bp, img: rendered.get(m.id)! }
  })
  const worldSurface = await writePyramid(zip, 'world', pack.worldW, pack.worldH, (tx, ty) => {
    const x0 = tx * TILE
    const y0 = ty * TILE
    const hits = placed.filter(p => p.img && p.x < x0 + TILE && p.x + p.img.w > x0 && p.y < y0 + TILE && p.y + p.img.h > y0)
    if (!hits.length) return null
    const tile = newRgba(TILE, TILE)
    for (const p of hits) blit(tile, p.img!, p.x - x0, p.y - y0)
    return tile.data
  }, { mode: 'lossless' })
  surfaces.push(worldSurface)

  // ── maps, interiors and terrain ──
  const maps: PackMap[] = []
  const terrainParts: Uint8Array[] = []
  let terrainLen = 0
  for (const m of pack.maps) {
    const w = m.w * spb
    const h = m.h * spb
    const out: PackMap = { id: m.id, key: m.key, name: m.display, category: categoryOf(m, envOf.get(m.key)), w, h, terrain: -1, maxLift: 0 }
    if (m.worldPos) {
      out.world = [m.worldPos[0] * bp, m.worldPos[1] * bp]
    } else {
      const img = rendered.get(m.id) ?? renderMap(pack, m)
      let surface: number | null = null
      if (img) {
        const name = `interiors/${m.key.toLowerCase()}`
        if (Math.max(img.w, img.h) <= SINGLE_IMAGE_MAX) {
          zip.add(`${name}.webp`, await encodeWebp(img.data, img.w, img.h, 'lossless'))
          surfaces.push({ path: `${name}.webp`, w: img.w, h: img.h, tile: 0, levels: 1, mask: null })
        } else {
          surfaces.push(await writePyramid(zip, name, img.w, img.h, (tx, ty) => cropTile(img, tx * TILE, ty * TILE), { mode: 'lossless' }))
        }
        surface = surfaces.length - 1
      }
      out.scope = { w: w * 16, h: h * 16, ox: 0, oy: 0, surface, sx: 0, sy: 0 }
    }
    if (m.blocks) {
      const t = terrainOf(pack, m)
      out.terrain = terrainLen
      terrainParts.push(t)
      terrainLen += t.length
    }
    maps.push(out)
  }

  const first = pack.drawOrder[0]
  return {
    pack,
    maps,
    surfaces,
    world: { w: pack.worldW, h: pack.worldH, surface: 0, defaultMap: first ? first.id : null, order: pack.drawOrder.map(m => m.id) },
    terrain: Buffer.concat(terrainParts),
  }
}
