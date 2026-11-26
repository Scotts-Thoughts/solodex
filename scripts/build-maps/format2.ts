// Gens 4/5 (router pack format 2, "image"): the world is a pre-rendered,
// tilted 3D picture. Its WebP pyramid and the interior images are copied out
// of the router's imagery.zip as they are (interiors larger than
// SINGLE_IMAGE_MAX are re-cut into pyramids so the viewer never decodes a
// 7616 px image at once); ownership, terrain classes, lift and masks come
// along so the viewer can pick tiles and hide unreachable scenery.

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { ZipFile } from '../../src/main/maps/zip'
import type { MapPackJson, PackMap, PackMask, PackSurface, PackWorldOverlay } from '../../src/shared/mapPack'
import { cropTile, TILE, writePyramid } from './pyramid'
import type { ZipWriter } from './zipWriter'

const SINGLE_IMAGE_MAX = 2048

const readJson = (dir: string, f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))

export interface Format2Result {
  maps: PackMap[]
  surfaces: PackSurface[]
  world: MapPackJson['world']
  ownership: MapPackJson['ownership']
  terrain: Buffer
  lift: Buffer
  methodLabels: Record<string, string>
  conditionLabels: Record<string, string>
  overlays: PackWorldOverlay[]
}

/**
 * pokemap's version variants (pipeline/gen5/variants.py): what White / White 2
 * show where the game swaps chunks or whole interior matrices by version. They
 * are not in the router's pack, so they are read from pokemap's output folder.
 */
interface Variants {
  version: string
  world: { image: string; x: number; y: number; w: number; h: number }[]
  interiors: Record<string, { image: string; imageX: number; imageY: number }>
}

function readVariants(variantsDir: string | null): Variants | null {
  if (!variantsDir) return null
  const f = path.join(variantsDir, 'variants.json')
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
}

export async function buildFormat2(dir: string, zip: ZipWriter, variantsDir: string | null = null): Promise<Format2Result> {
  const variants = readVariants(variantsDir)
  const manifest = readJson(dir, 'manifest.json')
  const rawMaps: Record<string, unknown>[] = readJson(dir, 'maps.json')
  const layout = readJson(dir, 'layout.json')
  const masks: { world?: PackMask; interiors?: Record<string, PackMask> } = fs.existsSync(path.join(dir, 'masks.json')) ? readJson(dir, 'masks.json') : {}
  const imagery = await ZipFile.open(path.join(dir, manifest.imagery?.zip ?? 'imagery.zip'))
  try {
    const info = JSON.parse((await imagery.read('imagery.json'))!.toString('utf8'))
    const surfaces: PackSurface[] = []

    // ── world pyramid, copied tile for tile ──
    const tiles: string[][] = []
    for (let level = 0; level < info.levels; level++) {
      const names: string[] = info.world[String(level)] ?? []
      for (const n of names) {
        const data = await imagery.read(`world/${level}/${n}.webp`)
        if (data) zip.add(`world/${level}/${n}.webp`, data)
      }
      tiles.push(names)
    }
    surfaces.push({ path: 'world', w: info.w_px, h: info.h_px, tile: info.tile_size, levels: info.levels, tiles, mask: masks.world ?? null })

    // ── interiors: one surface per image (maps can share one) ──
    const surfaceOfImage = new Map<string, number>()
    for (const r of rawMaps) {
      const image = r.image as string | undefined
      if (!image || surfaceOfImage.has(image)) continue
      const data = await imagery.read(image)
      if (!data) continue
      const meta = await sharp(data).metadata()
      const w = meta.width ?? 0
      const h = meta.height ?? 0
      const mask = masks.interiors?.[image] ?? null
      if (Math.max(w, h) <= SINGLE_IMAGE_MAX) {
        zip.add(image, data)
        surfaces.push({ path: image, w, h, tile: 0, levels: 1, mask })
      } else {
        const raw = await sharp(data).ensureAlpha().raw().toBuffer()
        const img = { w, h, data: raw }
        // per tile the smaller of lossy and lossless: all-lossless adds ~20 MB to DP and Platinum, all-lossy ~10 MB to BW2
        const s = await writePyramid(zip, image.replace(/\.webp$/, ''), w, h, (tx, ty) => cropTile(img, tx * TILE, ty * TILE), { mode: 'smallest' })
        surfaces.push({ ...s, mask })
      }
      surfaceOfImage.set(image, surfaces.length - 1)
    }

    // ── version variants (single images; the largest is ~1.3k × 2.5k px) ──
    const overlays: PackWorldOverlay[] = []
    const variantSurface = new Map<string, number>()
    const addVariant = async (image: string): Promise<number | null> => {
      if (variantSurface.has(image)) return variantSurface.get(image)!
      const file = path.join(variantsDir!, image)
      if (!fs.existsSync(file)) return null
      const data = fs.readFileSync(file)
      const meta = await sharp(data).metadata()
      zip.add(image, data)
      surfaces.push({ path: image, w: meta.width ?? 0, h: meta.height ?? 0, tile: 0, levels: 1, mask: null })
      variantSurface.set(image, surfaces.length - 1)
      return surfaces.length - 1
    }
    if (variants) {
      for (const p of variants.world) {
        const surface = await addVariant(p.image)
        if (surface !== null) overlays.push({ version: variants.version, surface, x: p.x, y: p.y })
      }
      for (const v of Object.values(variants.interiors)) await addVariant(v.image)
    }

    // ── maps ──
    const keyToId = new Map(rawMaps.map((r, i) => [r.const as string, i]))
    const classes = fs.readFileSync(path.join(dir, 'classes.bin'))
    const lift = fs.readFileSync(path.join(dir, 'lift.bin'))
    const terrainAt = new Map<string, number>()
    for (const e of manifest.blobs.classes as { map: string; offset: number; len: number }[]) terrainAt.set(e.map, e.offset)
    const maps: PackMap[] = rawMaps.map((r, i) => {
      const key = r.const as string
      const w = r.w as number
      const h = r.h as number
      const offset = terrainAt.get(key) ?? -1
      let maxLift = 0
      if (offset >= 0) for (let k = 0; k < w * h; k++) maxLift = Math.max(maxLift, lift.readInt16LE((offset + k) * 2))
      const out: PackMap = {
        id: i,
        key,
        name: r.display as string,
        category: (r.category as PackMap['category']) ?? (r.kind === 'outdoor' ? 'area' : 'building'),
        w,
        h,
        terrain: offset,
        maxLift,
      }
      const pos = (r.pos as [number, number] | undefined) ?? layout.positions[key]
      if (r.kind === 'outdoor' && pos) {
        out.world = [pos[0] * 16, pos[1] * 16]
      } else {
        // the scope is the union of the map's rectangle and its picture
        // (rendered with padding and terrain lift), as in the router's pack.rs
        const mw = w * 16
        const mh = h * 16
        const image = r.image as string | undefined
        const surface = image !== undefined ? surfaceOfImage.get(image) ?? null : null
        const o = (r.image_origin as [number, number] | undefined) ?? [0, 0]
        if (surface !== null) {
          const s = surfaces[surface]
          // a version's own picture of this map (same frame: the map's (0, 0) at -image origin)
          const v = variants?.interiors[key]
          const vs = v ? variantSurface.get(v.image) : undefined
          const vo: [number, number] = v ? [-v.imageX, -v.imageY] : [0, 0]
          const vw = vs !== undefined ? surfaces[vs] : null
          const ux0 = Math.min(o[0], 0, vw ? vo[0] : 0)
          const uy0 = Math.min(o[1], 0, vw ? vo[1] : 0)
          const ux1 = Math.max(o[0] + s.w, mw, vw ? vo[0] + vw.w : 0)
          const uy1 = Math.max(o[1] + s.h, mh, vw ? vo[1] + vw.h : 0)
          out.scope = { w: ux1 - ux0, h: uy1 - uy0, ox: -ux0, oy: -uy0, surface, sx: o[0] - ux0, sy: o[1] - uy0 }
          // same frame and size: the base picture's mask (the rooms sit in the same cells) hides the same scenery
          if (vw && !vw.mask && s.mask && vw.w === s.w && vw.h === s.h && vo[0] === o[0] && vo[1] === o[1]) vw.mask = s.mask
          if (vs !== undefined) out.scope.versionSurfaces = { [variants!.version]: { surface: vs, sx: vo[0] - ux0, sy: vo[1] - uy0 } }
        } else {
          out.scope = { w: mw, h: mh, ox: 0, oy: 0, surface: null, sx: 0, sy: 0 }
        }
      }
      return out
    })

    const own = layout.ownership
    return {
      maps,
      surfaces,
      world: { w: info.w_px, h: info.h_px, surface: 0, defaultMap: keyToId.get(manifest.world.default_map) ?? null, order: maps.filter(m => m.world).map(m => m.id) },
      ownership: { originX: own.origin[0], originY: own.origin[1], cell: own.cell, cols: own.cols, rows: own.rows, cells: own.cells },
      terrain: classes,
      lift,
      methodLabels: manifest.encounter_methods ?? {},
      conditionLabels: manifest.encounter_conditions ?? {},
      overlays,
    }
  } finally {
    await imagery.close()
  }
}
