// Gen 1–3 tile compositor: a port of the XP router's
// rust/crates/xpr-map/src/compose.rs (itself a port of pokemap's
// src/render/tile-renderer.js). Gen 1 recolours a map's tileset with one
// 4-colour CGB palette; gen 2 with per-tile palette slots, the map's time of
// day, roof colours and per-tileset overrides; gen 3 draws 2×2-tile
// metatiles in two layers from a primary + secondary tileset with 16-colour
// palettes and flips. Only daytime palettes are rendered.

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { newRgba, type Rgba } from './pyramid'

type Rgb = [number, number, number]
type Pal4 = [Rgb, Rgb, Rgb, Rgb]

export interface F1Map {
  id: number
  key: string
  display: string
  /** size in blocks */
  w: number
  h: number
  outdoor: boolean
  tileset: { file?: string; primary?: string; secondary?: string | null }
  palette: { index?: number; tod?: string; group?: number } | null
  blocks: Uint16Array | null
  /** world position in blocks (placed outdoor maps) */
  worldPos: [number, number] | null
}

export interface F1Pack {
  dir: string
  gen: number
  blockPx: number
  worldW: number
  worldH: number
  gen3: { num_metatiles_in_primary: number; num_tiles_in_primary: number; num_pals_in_primary: number }
  maps: F1Map[]
  byKey: Map<string, F1Map>
  drawOrder: F1Map[]
  blocksets: Map<string, Uint8Array[] | Uint16Array[]>
  tilesets: Map<string, { w: number; h: number; idx: Uint8Array }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  palettes: any
  grass: Map<string, Set<number>>
  water: Map<string, Set<number>>
}

const readJson = (dir: string, f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))

async function decodeTileset(gen: number, file: string): Promise<{ w: number; h: number; idx: Uint8Array }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const idx = new Uint8Array(info.width * info.height)
  for (let i = 0; i < idx.length; i++) {
    const r = data[i * 4]
    idx[i] = gen === 3 ? Math.floor(((255 - r) * 15 + 127) / 255) : r >= 192 ? 0 : r >= 128 ? 1 : r >= 64 ? 2 : 3
  }
  return { w: info.width, h: info.height, idx }
}

export async function loadF1Pack(dir: string): Promise<F1Pack> {
  const manifest = readJson(dir, 'manifest.json')
  const gen: number = manifest.gen
  const rawMaps = readJson(dir, 'maps.json')
  const layout = readJson(dir, 'layout.json')
  const bd = fs.readFileSync(path.join(dir, 'blockdata.bin'))
  const blockdata = gen === 3
    ? new Uint16Array(bd.buffer.slice(bd.byteOffset, bd.byteOffset + bd.length - (bd.length % 2)))
    : Uint16Array.from(bd)
  const ranges = new Map<string, [number, number]>()
  for (const e of manifest.blockdata) {
    if (e.offset + e.len <= blockdata.length) ranges.set(e.map, [e.offset, e.offset + e.len])
  }
  const bs = fs.readFileSync(path.join(dir, 'blocksets.bin'))
  const blocksets = new Map<string, Uint8Array[] | Uint16Array[]>()
  for (const e of manifest.blocksets) {
    const start = e.offset * 16
    const list: (Uint8Array | Uint16Array)[] = []
    for (let i = 0; i < e.count; i++) {
      const b = bs.subarray(start + i * 16, start + i * 16 + 16)
      if (gen === 3) {
        const v = new Uint16Array(8)
        for (let j = 0; j < 8; j++) v[j] = b.readUInt16LE(j * 2)
        list.push(v)
      } else {
        list.push(Uint8Array.from(b))
      }
    }
    blocksets.set(e.tileset, list as Uint8Array[] | Uint16Array[])
  }
  const maps: F1Map[] = rawMaps.map((r: Record<string, unknown>, i: number) => {
    const key = r.const as string
    const pos = layout.positions[key] as [number, number] | undefined
    const range = ranges.get(key)
    return {
      id: i,
      key,
      display: (r.display as string) ?? (r.name as string),
      w: r.w as number,
      h: r.h as number,
      outdoor: r.kind === 'outdoor' && !!pos,
      tileset: r.tileset as F1Map['tileset'],
      palette: (r.palette as F1Map['palette']) ?? null,
      blocks: range ? blockdata.subarray(range[0], range[1]) : null,
      worldPos: r.kind === 'outdoor' && pos ? pos : null,
    }
  })
  const byKey = new Map(maps.map(m => [m.key, m]))
  const drawOrder = (layout.draw_order as string[]).map(k => byKey.get(k)).filter((m): m is F1Map => !!m?.worldPos)
  const tilesets = new Map<string, { w: number; h: number; idx: Uint8Array }>()
  for (const f of fs.readdirSync(path.join(dir, 'tilesets'))) {
    if (f.endsWith('.png')) tilesets.set(f.slice(0, -4), await decodeTileset(gen, path.join(dir, 'tilesets', f)))
  }
  const terrain = readJson(dir, 'terrain.json')
  const toSets = (o: Record<string, number[]> = {}) => new Map(Object.entries(o).map(([k, v]) => [k, new Set(v)]))
  return {
    dir,
    gen,
    blockPx: manifest.block_px,
    worldW: manifest.world.w_blocks * manifest.block_px,
    worldH: manifest.world.h_blocks * manifest.block_px,
    gen3: manifest.gen3 ?? { num_metatiles_in_primary: 512, num_tiles_in_primary: 512, num_pals_in_primary: 6 },
    maps,
    byKey,
    drawOrder,
    blocksets,
    tilesets,
    palettes: readJson(dir, 'palettes.json'),
    grass: toSets(terrain.grass),
    water: toSets(terrain.water),
  }
}

// ── gen 1 / 2 recoloured sheets ──────────────────────────────────────────────

interface Sheet { w: number; h: number; data: Buffer }
const sheetCache = new WeakMap<F1Pack, Map<string, Sheet>>()

/** The palette set (8 × 4 colours) and cache key of a gen 2 map (compose.rs `gen2_palettes`, day only). */
function gen2Palettes(pack: F1Pack, m: F1Map, tileset: string): [Pal4[], string] {
  const p = pack.palettes
  const tod = m.palette?.tod ?? 'day'
  const group = m.palette?.group ?? 0
  const override = p.tilesetPalettes?.[tileset]
  if (override) return [override, `ts_${tileset}`]
  const bg: Pal4[] = p.bgPalettes?.[tod] ?? p.bgPalettes?.day ?? []
  const roofTod = tod === 'indoor' ? 'day' : tod
  const roofEntry = p.roofPalettes?.[group]
  const roof = roofEntry ? (roofTod === 'nite' ? roofEntry.nite ?? roofEntry.day : roofEntry.day) : null
  if (roof && bg.length > 6) {
    const pals = bg.map(pal => pal.map(c => [...c]) as Pal4)
    pals[6][1] = roof[0]
    pals[6][2] = roof[1]
    return [pals, `${tod}_g${group}`]
  }
  return [bg, `${tod}_none`]
}

function sheetFor(pack: F1Pack, m: F1Map): Sheet | null {
  const file = m.tileset.file
  if (!file) return null
  const ts = pack.tilesets.get(file)
  if (!ts) return null
  let palettes: Pal4[]
  let key: string
  if (pack.gen === 1) {
    const a = pack.palettes.mapAssignments?.[m.key]
    const colors: Pal4 = a?.colors ?? pack.palettes.cgbPalettes?.[0] ?? [[255, 255, 255], [170, 170, 170], [85, 85, 85], [0, 0, 0]]
    palettes = [colors]
    key = `${file}:g1:${a?.paletteIndex ?? 0}`
  } else {
    const [pals, k] = gen2Palettes(pack, m, file)
    palettes = pals
    key = `${file}:g2:${k}`
  }
  let cache = sheetCache.get(pack)
  if (!cache) sheetCache.set(pack, (cache = new Map()))
  const hit = cache.get(key)
  if (hit) return hit
  const perTile: number[] | undefined = pack.gen === 2 ? pack.palettes.paletteMaps?.[file] : undefined
  const data = Buffer.alloc(ts.w * ts.h * 4)
  const tilesPerRow = ts.w / 8
  for (let i = 0; i < ts.idx.length; i++) {
    let pal: Pal4 | undefined = palettes[0]
    if (perTile) {
      const x = i % ts.w
      const y = Math.floor(i / ts.w)
      const slot = perTile[Math.floor(y / 8) * tilesPerRow + Math.floor(x / 8)] ?? 0
      pal = palettes[slot] ?? palettes[0]
    }
    const c = pal ? pal[ts.idx[i] & 3] : [255, 0, 255]
    data[i * 4] = c[0]
    data[i * 4 + 1] = c[1]
    data[i * 4 + 2] = c[2]
    data[i * 4 + 3] = 255
  }
  const sheet = { w: ts.w, h: ts.h, data }
  cache.set(key, sheet)
  return sheet
}

// ── gen 3 metatiles ──────────────────────────────────────────────────────────

const metatileCache = new WeakMap<F1Pack, Map<string, (Buffer | null)[]>>()

function metatilesFor(pack: F1Pack, m: F1Map): (Buffer | null)[] | null {
  const primary = m.tileset.primary
  if (!primary) return null
  const secondary = m.tileset.secondary ?? null
  const key = `${primary}+${secondary ?? ''}`
  let cache = metatileCache.get(pack)
  if (!cache) metatileCache.set(pack, (cache = new Map()))
  const hit = cache.get(key)
  if (hit) return hit
  const c = pack.gen3
  const priTs = pack.tilesets.get(primary)
  if (!priTs) return null
  const secTs = secondary ? pack.tilesets.get(secondary) : undefined
  const priMeta = (pack.blocksets.get(primary) ?? []) as Uint16Array[]
  const secMeta = (secondary ? pack.blocksets.get(secondary) ?? [] : []) as Uint16Array[]
  const pals: Record<string, Rgb[][]> = pack.palettes
  const priPals = pals[primary] ?? []
  const secPals = (secondary && pals[secondary]) || []
  const combined: Rgb[][] = []
  for (let i = 0; i < 16; i++) combined.push((i < c.num_pals_in_primary ? priPals[i] : secPals[i]) ?? [])
  const total = Math.max(c.num_metatiles_in_primary + secMeta.length, c.num_metatiles_in_primary)
  const tiles: (Buffer | null)[] = []
  for (let id = 0; id < total; id++) {
    const entries = id < c.num_metatiles_in_primary ? priMeta[id] : secMeta[id - c.num_metatiles_in_primary]
    if (!entries) { tiles.push(null); continue }
    const out = Buffer.alloc(16 * 16 * 4)
    for (let layer = 0; layer < 2; layer++) {
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          const e = entries[layer * 4 + ty * 2 + tx]
          const tileNum = e & 0x3ff
          const xflip = (e >> 10) & 1
          const yflip = (e >> 11) & 1
          const pal = combined[(e >> 12) & 0xf]
          const [src, local] = tileNum < c.num_tiles_in_primary ? [priTs, tileNum] : [secTs, tileNum - c.num_tiles_in_primary]
          if (!src) continue
          const tilesPerRow = src.w / 8
          const sx0 = (local % tilesPerRow) * 8
          const sy0 = Math.floor(local / tilesPerRow) * 8
          if (sy0 + 8 > src.h) continue
          for (let py = 0; py < 8; py++) {
            for (let px = 0; px < 8; px++) {
              const spx = xflip ? 7 - px : px
              const spy = yflip ? 7 - py : py
              const ci = src.idx[(sy0 + spy) * src.w + sx0 + spx]
              if (layer === 1 && ci === 0) continue
              const col = pal[ci]
              if (!col) continue
              const o = ((ty * 8 + py) * 16 + tx * 8 + px) * 4
              out[o] = col[0]
              out[o + 1] = col[1]
              out[o + 2] = col[2]
              out[o + 3] = 255
            }
          }
        }
      }
    }
    tiles.push(out)
  }
  cache.set(key, tiles)
  return tiles
}

// ── maps ─────────────────────────────────────────────────────────────────────

/** A whole map at native scale (null when it has no block data). */
export function renderMap(pack: F1Pack, m: F1Map): Rgba | null {
  if (!m.blocks) return null
  const bp = pack.blockPx
  const img = newRgba(m.w * bp, m.h * bp)
  if (pack.gen === 3) {
    const metatiles = metatilesFor(pack, m)
    if (!metatiles) return img
    for (let by = 0; by < m.h; by++) {
      for (let bx = 0; bx < m.w; bx++) {
        const v = m.blocks[by * m.w + bx]
        const px = v === undefined ? null : metatiles[v & 0x3ff]
        if (!px) continue
        for (let y = 0; y < 16; y++) px.copy(img.data, ((by * 16 + y) * img.w + bx * 16) * 4, y * 64, y * 64 + 64)
      }
    }
    return img
  }
  const sheet = sheetFor(pack, m)
  const file = m.tileset.file
  const blockset = file ? (pack.blocksets.get(file) as Uint8Array[] | undefined) : undefined
  if (!sheet || !blockset) return img
  const tilesPerRow = sheet.w / 8
  for (let by = 0; by < m.h; by++) {
    for (let bx = 0; bx < m.w; bx++) {
      const block = blockset[m.blocks[by * m.w + bx]]
      if (!block) continue
      for (let ty = 0; ty < 4; ty++) {
        for (let tx = 0; tx < 4; tx++) {
          const t = block[ty * 4 + tx]
          const sx0 = (t % tilesPerRow) * 8
          const sy0 = Math.floor(t / tilesPerRow) * 8
          if (sy0 + 8 > sheet.h) continue
          for (let y = 0; y < 8; y++) {
            const si = ((sy0 + y) * sheet.w + sx0) * 4
            sheet.data.copy(img.data, ((by * bp + ty * 8 + y) * img.w + bx * bp + tx * 8) * 4, si, si + 32)
          }
        }
      }
    }
  }
  return img
}

/** Draw `src` into `dst` at (x, y), clipped (opaque copy of rows). */
export function blit(dst: Rgba, src: Rgba, x: number, y: number): void {
  const x0 = Math.max(0, x)
  const x1 = Math.min(dst.w, x + src.w)
  if (x1 <= x0) return
  for (let sy = 0; sy < src.h; sy++) {
    const dy = y + sy
    if (dy < 0 || dy >= dst.h) continue
    src.data.copy(dst.data, (dy * dst.w + x0) * 4, (sy * src.w + x0 - x) * 4, (sy * src.w + x1 - x) * 4)
  }
}

/** Terrain class per 16 px step of a map ('g' grass, 'w' water, '.' anything else). */
export function terrainOf(pack: F1Pack, m: F1Map): Uint8Array {
  const spb = pack.blockPx / 16
  const sw = m.w * spb
  const sh = m.h * spb
  const out = new Uint8Array(sw * sh).fill(46)
  if (!m.blocks) return out
  const classOf = (v: number): number => {
    if (pack.gen === 3) {
      const n = pack.gen3.num_metatiles_in_primary
      const id = v & 0x3ff
      const [ts, local] = id < n ? [m.tileset.primary, id] : [m.tileset.secondary, id - n]
      if (!ts) return 46
      if (pack.grass.get(ts)?.has(local)) return 103
      if (pack.water.get(ts)?.has(local)) return 119
      return 46
    }
    const file = m.tileset.file ?? ''
    if (pack.grass.get(file)?.has(v)) return 103
    if (pack.water.get(file)?.has(v)) return 119
    return 46
  }
  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const v = m.blocks[Math.floor(sy / spb) * m.w + Math.floor(sx / spb)]
      if (v !== undefined) out[sy * sw + sx] = classOf(v)
    }
  }
  return out
}
