// Cuts a surface into the WebP tile pyramid the viewer streams
// (PackSurface: level-L tile (x, y) covers 512·2^L px from (x, y)·512·2^L).
// Level 0 comes from a tile callback; each higher level is the 2×2 box
// downsample (premultiplied, so transparent edges do not darken) of the one
// below. Fully transparent tiles are not written.

import sharp from 'sharp'
import type { PackSurface } from '../../src/shared/mapPack'
import type { ZipWriter } from './zipWriter'

export const TILE = 512
const HALF = TILE / 2

/** RGBA pixels. */
export interface Rgba {
  w: number
  h: number
  data: Buffer
}

export function newRgba(w: number, h: number): Rgba {
  return { w, h, data: Buffer.alloc(w * h * 4) }
}

export function levelsFor(w: number, h: number): number {
  let levels = 1
  while (TILE * 2 ** (levels - 1) < Math.max(w, h)) levels++
  return levels
}

function isEmpty(data: Buffer): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false
  return true
}

/** Halve a TILE×TILE tile into a HALF×HALF one (premultiplied 2×2 box). */
function halve(src: Buffer): Buffer {
  const out = Buffer.alloc(HALF * HALF * 4)
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 2 + dy) * TILE + x * 2 + dx) * 4
          const pa = src[i + 3]
          r += src[i] * pa
          g += src[i + 1] * pa
          b += src[i + 2] * pa
          a += pa
        }
      }
      const o = (y * HALF + x) * 4
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
        out[o + 3] = Math.round(a / 4)
      }
    }
  }
  return out
}

/**
 * WebP-encode RGBA. `smallest` tries lossy (q92, like the gen 4/5 world
 * tiles) and lossless and keeps the smaller: flat or mostly transparent
 * pictures are smaller lossless.
 */
export async function encodeWebp(data: Buffer, w: number, h: number, mode: 'lossless' | 'smallest'): Promise<Buffer> {
  const img = () => sharp(data, { raw: { width: w, height: h, channels: 4 } })
  const lossless = await img().webp({ lossless: true, effort: 5 }).toBuffer()
  if (mode === 'lossless') return lossless
  const lossy = await img().webp({ quality: 92, alphaQuality: 100, effort: 5 }).toBuffer()
  return lossy.length < lossless.length ? lossy : lossless
}

/**
 * Write the pyramid of a `w × h` surface under `path/` and describe it.
 * `tileAt(tx, ty)` returns the level-0 tile's RGBA (TILE×TILE) or null.
 */
export async function writePyramid(
  zip: ZipWriter,
  path: string,
  w: number,
  h: number,
  tileAt: (tx: number, ty: number) => Promise<Buffer | null> | Buffer | null,
  opts: { mode: 'lossless' | 'smallest' },
): Promise<PackSurface> {
  const levels = levelsFor(w, h)
  const tiles: string[][] = []
  // halves[`${px}_${py}`][quadrant] for the next level up
  let halves = new Map<string, (Buffer | null)[]>()
  const cols0 = Math.ceil(w / TILE)
  const rows0 = Math.ceil(h / TILE)
  const keep = (tx: number, ty: number, data: Buffer) => {
    const key = `${tx >> 1}_${ty >> 1}`
    let q = halves.get(key)
    if (!q) halves.set(key, (q = [null, null, null, null]))
    q[(ty & 1) * 2 + (tx & 1)] = halve(data)
  }

  const level0: string[] = []
  for (let ty = 0; ty < rows0; ty++) {
    for (let tx = 0; tx < cols0; tx++) {
      const data = await tileAt(tx, ty)
      if (!data || isEmpty(data)) continue
      zip.add(`${path}/0/${tx}_${ty}.webp`, await encodeWebp(data, TILE, TILE, opts.mode))
      level0.push(`${tx}_${ty}`)
      if (levels > 1) keep(tx, ty, data)
    }
  }
  tiles.push(level0)

  for (let level = 1; level < levels; level++) {
    const current = halves
    halves = new Map()
    const names: string[] = []
    for (const [key, quads] of current) {
      const [tx, ty] = key.split('_').map(Number)
      const data = Buffer.alloc(TILE * TILE * 4)
      quads.forEach((q, i) => {
        if (!q) return
        const ox = (i & 1) * HALF
        const oy = (i >> 1) * HALF
        for (let y = 0; y < HALF; y++) q.copy(data, ((oy + y) * TILE + ox) * 4, y * HALF * 4, (y + 1) * HALF * 4)
      })
      if (isEmpty(data)) continue
      zip.add(`${path}/${level}/${tx}_${ty}.webp`, await encodeWebp(data, TILE, TILE, opts.mode))
      names.push(key)
      if (level + 1 < levels) keep(tx, ty, data)
    }
    tiles.push(names.sort())
  }
  return { path, w, h, tile: TILE, levels, tiles, mask: null }
}

/** Copy the TILE×TILE window at (x0, y0) of an RGBA image (transparent outside it). */
export function cropTile(img: Rgba, x0: number, y0: number): Buffer {
  const out = Buffer.alloc(TILE * TILE * 4)
  const x1 = Math.min(img.w, x0 + TILE)
  if (x1 <= x0) return out
  for (let y = 0; y < TILE; y++) {
    const sy = y0 + y
    if (sy >= img.h) break
    img.data.copy(out, y * TILE * 4, (sy * img.w + x0) * 4, (sy * img.w + x1) * 4)
  }
  return out
}
