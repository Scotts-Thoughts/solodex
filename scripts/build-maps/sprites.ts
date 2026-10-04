// Overworld sprite frames: a port of the XP router's
// rust/crates/xpr-map/src/sprites.rs. Every distinct (sprite, facing,
// palette) an object uses is extracted once, with transparency, and written
// to the pack as sprites/<n>.png.
//
// Gen 1/2 sheets are 16 px wide grayscale strips (16 px tall when still, else
// 96 with standing frames at y 0 down / 16 up / 32 left; right mirrors left);
// shade 0 is transparent and shades 1–3 take a palette (gen 1: the map's CGB
// palette through OBP0; gen 2: the PAL_NPC_* palette of the map's time of
// day). Gen 3 sheets are full-colour rows of w×h frames (down, up, left; berry
// trees use the last, grown frame) with an opaque key colour to remove. Gen
// 4/5 sheets are RGBA rows of four frames: down, up, left, right.

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import type { PackSprite } from '../../src/shared/mapPack'
import type { ZipWriter } from './zipWriter'

type Rgb = [number, number, number]
type Pal4 = [Rgb, Rgb, Rgb, Rgb]
type Dir = 'down' | 'up' | 'left' | 'right'

interface SpriteMeta { file: string; w: number; h: number }

interface Sheet { w: number; h: number; rgba: Buffer }

const GRAY: Pal4 = [[255, 255, 255], [192, 192, 192], [96, 96, 96], [0, 0, 0]]
const GEN2_PAL_INDEX: Record<string, number> = {
  PAL_NPC_RED: 0, PAL_NPC_BLUE: 1, PAL_NPC_GREEN: 2, PAL_NPC_BROWN: 3,
  PAL_NPC_PINK: 4, PAL_NPC_EMOTE: 5, PAL_NPC_TREE: 6, PAL_NPC_ROCK: 7,
}

export interface SpriteObject {
  sprite?: string | null
  facing?: string | null
  pal?: string | null
}

export interface SpriteMapInfo {
  key: string
  /** gen 2: the map's time of day */
  tod?: string
}

export class SpriteFrames {
  readonly sprites: PackSprite[] = []
  private readonly meta = new Map<string, SpriteMeta>()
  private readonly sheets = new Map<string, Sheet | null>()
  private readonly frames = new Map<string, number | null>()

  constructor(
    private readonly zip: ZipWriter,
    private readonly gen: number,
    private readonly dir: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly palettes: any,
  ) {
    const p = path.join(dir, 'sprites.json')
    const raw: Record<string, unknown> = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') this.meta.set(k, { file: v, w: 16, h: 16 })
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        this.meta.set(k, {
          file: String(o.file ?? ''),
          w: Number(o.w ?? o.width ?? 16),
          h: Number(o.h ?? o.height ?? 16),
        })
      }
    }
  }

  /** The sprite index of an object's frame, or null when it has none. */
  async frameFor(obj: SpriteObject, map: SpriteMapInfo): Promise<number | null> {
    const name = obj.sprite
    if (!name) return null
    const meta = this.meta.get(name)
    if (!meta) return null
    const berry = name.startsWith('OBJ_EVENT_GFX_BERRY_TREE_')
    const dir: Dir = berry ? 'down' : (['up', 'left', 'right'].includes(obj.facing ?? '') ? obj.facing as Dir : 'down')
    let palette: Pal4 | null = null
    let palKey = ''
    if (this.gen === 1) {
      const a = this.palettes.mapAssignments?.[map.key]
      const cgb: Pal4 = a?.colors ?? this.palettes.cgbPalettes?.[0] ?? GRAY
      palette = [cgb[0], cgb[0], cgb[1], cgb[3]]
      palKey = `g1:${a?.paletteIndex ?? 0}`
    } else if (this.gen === 2) {
      const tod = !map.tod || map.tod === 'indoor' ? 'day' : map.tod
      const pals: Pal4[] | undefined = this.palettes.npcPalettes?.[tod] ?? this.palettes.npcPalettes?.day
      const idx = obj.pal ? GEN2_PAL_INDEX[obj.pal] ?? 1 : 1
      palette = pals?.[idx] ?? pals?.[0] ?? null
      palKey = `${obj.pal ?? 'default'}:${tod}`
    }
    const key = `${name}|${dir}|${palKey}`
    if (this.frames.has(key)) return this.frames.get(key)!
    const sheet = await this.sheet(meta.file)
    const frame = sheet ? this.extract(sheet, meta, dir, palette, berry) : null
    let index: number | null = null
    if (frame) {
      index = this.sprites.length
      const file = `sprites/${index}.png`
      const png = await sharp(frame.data, { raw: { width: frame.w, height: frame.h, channels: 4 } }).png().toBuffer()
      this.zip.add(file, png)
      this.sprites.push({ file, w: frame.w, h: frame.h })
    }
    this.frames.set(key, index)
    return index
  }

  private async sheet(file: string): Promise<Sheet | null> {
    if (this.sheets.has(file)) return this.sheets.get(file)!
    const p = path.join(this.dir, 'sprites', `${file}.png`)
    let sheet: Sheet | null = null
    if (fs.existsSync(p)) {
      const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      sheet = { w: info.width, h: info.height, rgba: data }
    }
    this.sheets.set(file, sheet)
    return sheet
  }

  private extract(sheet: Sheet, meta: SpriteMeta, dir: Dir, palette: Pal4 | null, berry: boolean): { w: number; h: number; data: Buffer } | null {
    const { rgba } = sheet
    if (this.gen <= 2) {
      const size = 16
      if (sheet.w < size || sheet.h < size) return null
      const still = sheet.h <= size
      const srcY = still ? 0 : dir === 'down' ? 0 : dir === 'up' ? 16 : 32
      if (srcY + size > sheet.h) return null
      const flip = !still && dir === 'right'
      const pal = palette ?? GRAY
      const out = Buffer.alloc(size * size * 4)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const sx = flip ? size - 1 - x : x
          const r = rgba[((srcY + y) * sheet.w + sx) * 4]
          const shade = r >= 192 ? 0 : r >= 128 ? 1 : r >= 64 ? 2 : 3
          if (shade === 0) continue
          const c = pal[shade]
          const o = (y * size + x) * 4
          out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255
        }
      }
      return { w: size, h: size, data: out }
    }
    const fw = Math.max(1, meta.w)
    const fh = Math.max(1, meta.h)
    if (sheet.w < fw || sheet.h < fh) return null
    const frames = Math.floor(sheet.w / fw)
    const out = Buffer.alloc(fw * fh * 4)
    if (this.gen >= 4) {
      let idx = dir === 'down' ? 0 : dir === 'up' ? 1 : dir === 'left' ? 2 : 3
      if (idx >= frames) idx = 0
      for (let y = 0; y < fh; y++) rgba.copy(out, y * fw * 4, (y * sheet.w + idx * fw) * 4, (y * sheet.w + idx * fw + fw) * 4)
      return { w: fw, h: fh, data: out }
    }
    let idx = berry ? Math.max(0, frames - 1) : dir === 'down' ? 0 : dir === 'up' ? 1 : 2
    if (frames <= 1 || idx >= frames) idx = 0
    const flip = !berry && dir === 'right'
    const sx0 = idx * fw
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const sx = flip ? fw - 1 - x : x
        const i = (y * sheet.w + sx0 + sx) * 4
        rgba.copy(out, (y * fw + x) * 4, i, i + 4)
      }
    }
    // chroma key: an opaque top-left pixel of the frame is the background colour
    const k = sx0 * 4
    if (rgba[k + 3] === 255) {
      const [kr, kg, kb] = [rgba[k], rgba[k + 1], rgba[k + 2]]
      for (let i = 0; i < out.length; i += 4) {
        if (Math.abs(out[i] - kr) <= 30 && Math.abs(out[i + 1] - kg) <= 30 && Math.abs(out[i + 2] - kb) <= 30) out[i + 3] = 0
      }
    }
    return { w: fw, h: fh, data: out }
  }
}
