// Draws one scope of a map pack onto a canvas: the surface's WebP pyramid
// (the tiles of the level that matches the zoom, falling back to a coarser
// loaded ancestor while a tile streams in), the unreachable-area mask, the
// encounter highlight, object markers and map labels.

import { STEP_PX, type MapObjectKind, type PackObject, type PackSurface } from '../../../shared/mapPack'
import { mapOrigin, mapRect, ownerOf, type Scope } from './geom'
import type { MapPack } from './pack'

/** The viewer background; masks fade the hidden scenery into it. */
export const MAP_BG = '#0a0a18'
const MAP_BG_RGB = [10, 10, 24]

/** Scope px at the canvas's top-left and CSS px per scope px. */
export interface Camera { x: number; y: number; zoom: number }

export type LayerKey = 'trainers' | 'items' | 'hidden' | 'berries' | 'warps' | 'signs' | 'npcs' | 'obstacles'
export type Layers = Record<LayerKey, boolean> & { sprites: boolean; mask: boolean; labels: boolean }

export const DEFAULT_LAYERS: Layers = {
  trainers: true, items: true, hidden: true, berries: true, warps: true, signs: false, npcs: false, obstacles: false,
  sprites: true, mask: true, labels: true,
}

const LAYER_OF: Record<MapObjectKind, LayerKey> = {
  trainer: 'trainers', item: 'items', hidden_item: 'hidden', berry: 'berries', warp: 'warps', sign: 'signs', npc: 'npcs', obstacle: 'obstacles',
}

export const KIND_COLOR: Record<MapObjectKind, string> = {
  trainer: '#ef4444', item: '#facc15', hidden_item: '#fb923c', berry: '#f472b6', warp: '#22d3ee', sign: '#a78bfa', npc: '#9ca3af', obstacle: '#4ade80',
}

/** Below this zoom no markers are drawn (they would only be noise). */
const MARKER_MIN_ZOOM = 0.12
/** From this zoom on markers are overworld sprites. */
const SPRITE_MIN_ZOOM = 0.75
const MAX_TILES = 600
const MAX_LOADS = 12

export interface Highlight {
  map: number
  /** terrain classes to fill; null fills the whole map */
  classes: number[] | null
}

export interface Overlay {
  selected: number | null
  hoverStep: { map: number; x: number; y: number } | null
  highlight: Highlight[]
  /** scope px to pulse a ring at (focus), and when the pulse started */
  pulse: { points: [number, number][]; since: number } | null
}

interface Loaded { img: HTMLImageElement | null; state: 'loading' | 'ready' | 'failed'; used: number }

export function objectShown(o: PackObject, layers: Layers, version: string | null): boolean {
  if (!layers[LAYER_OF[o.kind]]) return false
  return !o.version || !version || o.version === version
}

export class MapRenderer {
  private readonly images = new Map<string, Loaded>()
  private readonly queue: string[] = []
  private inFlight = 0
  private frame = 0
  private readonly maskCanvases = new Map<number, HTMLCanvasElement>()
  private readonly highlightPaths = new Map<string, Path2D>()

  constructor(readonly pack: MapPack, private readonly onChange: () => void) {}

  /** Whether a pulse is still running (the canvas keeps animating). */
  animating = false

  draw(ctx: CanvasRenderingContext2D, cssW: number, cssH: number, dpr: number, scope: Scope, cam: Camera, layers: Layers, overlay: Overlay, version: string | null): void {
    this.frame++
    const { pack } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = MAP_BG
    ctx.fillRect(0, 0, cssW * dpr, cssH * dpr)
    // scope px → device px
    const k = cam.zoom * dpr
    const dx = (x: number) => (x - cam.x) * k
    const dy = (y: number) => (y - cam.y) * k
    const view = { x: cam.x, y: cam.y, w: cssW / cam.zoom, h: cssH / cam.zoom }

    // ── picture ──
    const placed = this.surfaceOf(scope)
    if (placed) {
      const { surface, index, at } = placed
      this.drawSurface(ctx, surface, at, view, cam.zoom, dx, dy)
      if (layers.mask && this.pack.masks[index]) this.drawMask(ctx, index, surface, at, dx, dy, k)
    } else if (scope.kind === 'map') {
      // a map without a picture: its rectangle, so objects have a frame
      const r = mapRect(pack, scope, scope.id)
      if (r) {
        ctx.fillStyle = '#1f2433'
        ctx.fillRect(dx(r.x), dy(r.y), r.w * k, r.h * k)
      }
    }

    // ── encounter highlight ──
    if (overlay.highlight.length) {
      ctx.lineWidth = Math.max(1, 2 * dpr)
      for (const h of overlay.highlight) {
        const path = this.highlightPath(scope, h)
        if (!path) continue
        ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k)
        ctx.fillStyle = 'rgba(250, 204, 21, 0.55)'
        ctx.fill(path)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        // the map's outline, so the spot stands out zoomed out (in a map's own scope it is the frame)
        if (scope.kind === 'world') {
          const r = mapRect(pack, scope, h.map)
          if (r) {
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)'
            ctx.strokeRect(dx(r.x), dy(r.y), r.w * k, r.h * k)
          }
        }
      }
    }

    // ── hovered step ──
    if (overlay.hoverStep && cam.zoom >= 0.5) {
      const { map, x, y } = overlay.hoverStep
      const o = mapOrigin(pack, scope, map)
      if (o) {
        const lift = pack.lift && pack.json.maps[map].terrain >= 0 ? pack.lift[pack.json.maps[map].terrain + y * pack.json.maps[map].w + x] ?? 0 : 0
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = Math.max(1, dpr)
        ctx.strokeRect(dx(o[0] + x * STEP_PX), dy(o[1] + y * STEP_PX - lift), STEP_PX * k, STEP_PX * k)
      }
    }

    // ── map labels (zoomed out) ──
    if (layers.labels && scope.kind === 'world' && cam.zoom < 0.4) this.drawLabels(ctx, view, dx, dy, dpr)

    // ── markers ──
    const objects = this.objectsIn(scope)
    const spritesOn = layers.sprites && cam.zoom >= SPRITE_MIN_ZOOM
    if (cam.zoom >= MARKER_MIN_ZOOM) {
      for (const i of objects) {
        const o = pack.json.objects[i]
        if (!objectShown(o, layers, version)) continue
        const origin = mapOrigin(pack, scope, o.map)
        if (!origin) continue
        const cx = origin[0] + o.x * STEP_PX + STEP_PX / 2
        const cy = origin[1] + o.y * STEP_PX + STEP_PX / 2 - o.lift
        if (cx < view.x - 64 || cy < view.y - 64 || cx > view.x + view.w + 64 || cy > view.y + view.h + 64) continue
        this.drawMarker(ctx, o, cx, cy, spritesOn, dx, dy, k, dpr)
      }
    }

    // ── selection and focus ──
    if (overlay.selected !== null) {
      const o = pack.json.objects[overlay.selected]
      const origin = o ? mapOrigin(pack, scope, o.map) : null
      if (o && origin) {
        const cx = dx(origin[0] + o.x * STEP_PX + STEP_PX / 2)
        const cy = dy(origin[1] + o.y * STEP_PX + STEP_PX / 2 - o.lift)
        const r = Math.max(9 * dpr, 13 * k)
        ctx.lineWidth = 2.5 * dpr
        ctx.strokeStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    this.animating = false
    if (overlay.pulse) {
      const t = (performance.now() - overlay.pulse.since) / 1000
      if (t < 3) {
        this.animating = true
        const phase = (t % 1)
        ctx.lineWidth = 3 * dpr
        for (const [px, py] of overlay.pulse.points) {
          const r = (10 + phase * 30) * dpr
          ctx.strokeStyle = `rgba(250, 204, 21, ${1 - phase})`
          ctx.beginPath()
          ctx.arc(dx(px), dy(py), r, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      // a steady ring stays after the pulse
      ctx.lineWidth = 2.5 * dpr
      ctx.strokeStyle = '#facc15'
      for (const [px, py] of overlay.pulse.points) {
        ctx.beginPath()
        ctx.arc(dx(px), dy(py), Math.max(10 * dpr, 14 * k), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    this.pump()
  }

  /** The object indices a scope shows. */
  objectsIn(scope: Scope): number[] {
    const { pack } = this
    const out: number[] = []
    const maps = scope.kind === 'world' ? pack.json.world.order : [scope.id]
    for (const id of maps) {
      const [a, b] = pack.objectRange[id] ?? [0, 0]
      for (let i = a; i < b; i++) out.push(i)
    }
    return out
  }

  /** The topmost shown object whose marker is under a scope px. */
  objectAt(scope: Scope, px: number, py: number, cam: Camera, layers: Layers, version: string | null): number | null {
    if (cam.zoom < MARKER_MIN_ZOOM) return null
    const { pack } = this
    const spritesOn = layers.sprites && cam.zoom >= SPRITE_MIN_ZOOM
    const slack = 8 / cam.zoom
    let best: number | null = null
    let bestD = Infinity
    for (const i of this.objectsIn(scope)) {
      const o = pack.json.objects[i]
      if (!objectShown(o, layers, version)) continue
      const origin = mapOrigin(pack, scope, o.map)
      if (!origin) continue
      const cx = origin[0] + o.x * STEP_PX + STEP_PX / 2
      const cy = origin[1] + o.y * STEP_PX + STEP_PX / 2 - o.lift
      const sprite = spritesOn && o.sprite !== null ? pack.json.sprites[o.sprite] : null
      let hit: boolean
      if (sprite) {
        const bottom = cy + STEP_PX / 2
        hit = px >= cx - sprite.w / 2 && px <= cx + sprite.w / 2 && py >= bottom - sprite.h && py <= bottom
      } else if (spritesOn) {
        hit = Math.abs(px - cx) <= STEP_PX / 2 && Math.abs(py - cy) <= STEP_PX / 2
      } else {
        hit = Math.hypot(px - cx, py - cy) <= slack
      }
      if (!hit) continue
      const d = Math.hypot(px - cx, py - cy)
      if (d < bestD) { best = i; bestD = d }
    }
    return best
  }

  /** The surface a scope draws, its index and where it sits in scope px. */
  surfaceOf(scope: Scope): { surface: PackSurface; index: number; at: [number, number] } | null {
    const { json } = this.pack
    if (scope.kind === 'world') return { surface: json.surfaces[json.world.surface], index: json.world.surface, at: [0, 0] }
    const sc = json.maps[scope.id]?.scope
    if (!sc || sc.surface === null) return null
    return { surface: json.surfaces[sc.surface], index: sc.surface, at: [sc.sx, sc.sy] }
  }

  private drawSurface(ctx: CanvasRenderingContext2D, s: PackSurface, at: [number, number], view: { x: number; y: number; w: number; h: number }, zoom: number, dx: (x: number) => number, dy: (y: number) => number): void {
    ctx.imageSmoothingEnabled = zoom < 1
    ctx.imageSmoothingQuality = 'medium'
    if (s.tile === 0) {
      const img = this.image(s.path)
      if (img) {
        const x0 = Math.round(dx(at[0])), y0 = Math.round(dy(at[1]))
        ctx.drawImage(img, x0, y0, Math.round(dx(at[0] + s.w)) - x0, Math.round(dy(at[1] + s.h)) - y0)
      }
      return
    }
    const level = Math.max(0, Math.min(s.levels - 1, Math.floor(Math.log2(1 / zoom))))
    const span = s.tile * 2 ** level
    const sets = this.tileSets(s)
    const tx0 = Math.max(0, Math.floor((view.x - at[0]) / span))
    const ty0 = Math.max(0, Math.floor((view.y - at[1]) / span))
    const tx1 = Math.floor((view.x + view.w - at[0]) / span)
    const ty1 = Math.floor((view.y + view.h - at[1]) / span)
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!sets[level]?.has(`${tx}_${ty}`)) continue
        const x0 = Math.round(dx(at[0] + tx * span)), y0 = Math.round(dy(at[1] + ty * span))
        const w = Math.round(dx(at[0] + (tx + 1) * span)) - x0
        const h = Math.round(dy(at[1] + (ty + 1) * span)) - y0
        const img = this.image(`${s.path}/${level}/${tx}_${ty}.webp`)
        if (img) {
          ctx.drawImage(img, x0, y0, w, h)
          continue
        }
        // a coarser tile that is already here, cropped to this one
        for (let up = 1; level + up < s.levels; up++) {
          const ax = tx >> up, ay = ty >> up
          const anc = this.peek(`${s.path}/${level + up}/${ax}_${ay}.webp`)
          if (!anc) continue
          const sub = s.tile / 2 ** up
          ctx.drawImage(anc, (tx - (ax << up)) * sub, (ty - (ay << up)) * sub, sub, sub, x0, y0, w, h)
          break
        }
      }
    }
  }

  private drawMask(ctx: CanvasRenderingContext2D, index: number, s: PackSurface, at: [number, number], dx: (x: number) => number, dy: (y: number) => number, k: number): void {
    const meta = s.mask!
    let canvas = this.maskCanvases.get(index)
    if (!canvas) {
      const cells = this.pack.masks[index]!
      canvas = document.createElement('canvas')
      canvas.width = meta.w
      canvas.height = meta.h
      const c = canvas.getContext('2d')!
      const img = c.createImageData(meta.w, meta.h)
      for (let i = 0; i < cells.length; i++) {
        if (cells[i]) continue
        img.data[i * 4] = MAP_BG_RGB[0]
        img.data[i * 4 + 1] = MAP_BG_RGB[1]
        img.data[i * 4 + 2] = MAP_BG_RGB[2]
        img.data[i * 4 + 3] = 255
      }
      c.putImageData(img, 0, 0)
      this.maskCanvases.set(index, canvas)
    }
    // bilinear upscaling softens the cell edges (the router's Mask::coverage)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'low'
    const mw = meta.w * STEP_PX
    const mh = meta.h * STEP_PX
    ctx.drawImage(canvas, dx(at[0]), dy(at[1]), mw * k, mh * k)
    // cells past the mask's extent are hidden
    ctx.fillStyle = MAP_BG
    if (s.w > mw) ctx.fillRect(dx(at[0] + mw), dy(at[1]), (s.w - mw) * k, s.h * k)
    if (s.h > mh) ctx.fillRect(dx(at[0]), dy(at[1] + mh), Math.min(s.w, mw) * k, (s.h - mh) * k)
  }

  private drawMarker(ctx: CanvasRenderingContext2D, o: PackObject, cx: number, cy: number, spritesOn: boolean, dx: (x: number) => number, dy: (y: number) => number, k: number, dpr: number): void {
    const color = KIND_COLOR[o.kind]
    if (spritesOn) {
      const sprite = o.sprite !== null ? this.pack.json.sprites[o.sprite] : null
      const img = sprite ? this.image(sprite.file) : null
      if (sprite && img) {
        ctx.imageSmoothingEnabled = false
        const bottom = cy + STEP_PX / 2
        ctx.drawImage(img, Math.round(dx(cx - sprite.w / 2)), Math.round(dy(bottom - sprite.h)), Math.round(sprite.w * k), Math.round(sprite.h * k))
        return
      }
      if (sprite) return // still loading
      // no sprite: a tinted square on the step
      const x0 = dx(cx - STEP_PX / 2), y0 = dy(cy - STEP_PX / 2)
      ctx.fillStyle = color + '55'
      ctx.fillRect(x0, y0, STEP_PX * k, STEP_PX * k)
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1, 1.5 * dpr)
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, STEP_PX * k - 1, STEP_PX * k - 1)
      return
    }
    const r = Math.max(2.5, Math.min(6, 5 * k / dpr + 1.5)) * dpr
    ctx.beginPath()
    ctx.arc(dx(cx), dy(cy), r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = Math.max(1, dpr)
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'
    ctx.stroke()
  }

  private drawLabels(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }, dx: (x: number) => number, dy: (y: number) => number, dpr: number): void {
    const { pack } = this
    ctx.font = `bold ${11 * dpr}px Play, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3 * dpr
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.fillStyle = '#f3f4f6'
    for (const id of pack.json.world.order) {
      const m = pack.json.maps[id]
      if (m.category !== 'city' && m.category !== 'route') continue
      const [x, y] = m.world!
      const cx = x + (m.w * STEP_PX) / 2
      const cy = y + (m.h * STEP_PX) / 2
      if (cx < view.x || cy < view.y || cx > view.x + view.w || cy > view.y + view.h) continue
      ctx.strokeText(m.name, dx(cx), dy(cy))
      ctx.fillText(m.name, dx(cx), dy(cy))
    }
  }

  /** The highlighted steps of a map as one path in scope px (cached). */
  private highlightPath(scope: Scope, h: Highlight): Path2D | null {
    const key = `${scope.kind === 'world' ? 'w' : scope.id}:${h.map}:${h.classes?.join(',') ?? '*'}`
    const hit = this.highlightPaths.get(key)
    if (hit) return hit
    const { pack } = this
    const m = pack.json.maps[h.map]
    const o = mapOrigin(pack, scope, h.map)
    if (!m || !o) return null
    const path = new Path2D()
    const wanted = h.classes ? new Set(h.classes) : null
    const owned = (x: number, y: number) => scope.kind !== 'world' || !pack.json.ownership || ownerOf(pack, o[0] / STEP_PX + x, o[1] / STEP_PX + y) === h.map
    if (!wanted || m.terrain < 0) {
      if (!pack.json.ownership || scope.kind !== 'world') {
        path.rect(o[0], o[1], m.w * STEP_PX, m.h * STEP_PX)
      } else {
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (owned(x, y)) path.rect(o[0] + x * STEP_PX, o[1] + y * STEP_PX, STEP_PX, STEP_PX)
      }
    } else {
      for (let y = 0; y < m.h; y++) {
        let run = -1
        let runLift = 0
        for (let x = 0; x <= m.w; x++) {
          const i = m.terrain + y * m.w + x
          const lift = pack.lift && x < m.w ? pack.lift[i] : 0
          const on = x < m.w && wanted.has(pack.terrain[i]) && owned(x, y)
          if (run >= 0 && (!on || lift !== runLift)) {
            path.rect(o[0] + run * STEP_PX, o[1] + y * STEP_PX - runLift, (x - run) * STEP_PX, STEP_PX)
            run = -1
          }
          if (on && run < 0) { run = x; runLift = lift }
        }
      }
    }
    this.highlightPaths.set(key, path)
    return path
  }

  private tileSetCache = new WeakMap<PackSurface, Set<string>[]>()
  private tileSets(s: PackSurface): Set<string>[] {
    let sets = this.tileSetCache.get(s)
    if (!sets) {
      sets = (s.tiles ?? []).map(l => new Set(l))
      this.tileSetCache.set(s, sets)
    }
    return sets
  }

  /** A loaded image, or null (and queue the load). */
  private image(path: string): HTMLImageElement | null {
    const e = this.images.get(path)
    if (e) {
      e.used = this.frame
      return e.state === 'ready' ? e.img : null
    }
    this.images.set(path, { img: null, state: 'loading', used: this.frame })
    this.queue.push(path)
    return null
  }

  private peek(path: string): HTMLImageElement | null {
    const e = this.images.get(path)
    return e && e.state === 'ready' ? e.img : null
  }

  /** Start queued loads (newest first, skipping ones no longer drawn) and trim the cache. */
  private pump(): void {
    while (this.inFlight < MAX_LOADS && this.queue.length) {
      const path = this.queue.pop()!
      const e = this.images.get(path)
      if (!e || e.state !== 'loading' || e.img) continue
      if (e.used < this.frame - 1) { this.images.delete(path); continue }
      const img = new Image()
      e.img = img
      this.inFlight++
      img.onload = () => {
        this.inFlight--
        e.state = 'ready'
        this.onChange()
        this.pump()
      }
      img.onerror = () => {
        this.inFlight--
        e.state = 'failed'
        e.img = null
        this.pump()
      }
      img.src = this.pack.url(path)
    }
    if (this.images.size > MAX_TILES) {
      const old = [...this.images.entries()].filter(([, e]) => e.state !== 'loading' && e.used < this.frame - 2).sort((a, b) => a[1].used - b[1].used)
      for (const [path] of old.slice(0, this.images.size - MAX_TILES)) this.images.delete(path)
    }
  }
}

/** Camera that fits a rect into a viewport with a margin. */
export function fitCamera(r: { x: number; y: number; w: number; h: number }, cssW: number, cssH: number, margin = 24, maxZoom = 4): Camera {
  const zoom = Math.min(maxZoom, Math.max(0.01, Math.min((cssW - margin * 2) / Math.max(1, r.w), (cssH - margin * 2) / Math.max(1, r.h))))
  return { zoom, x: r.x + r.w / 2 - cssW / zoom / 2, y: r.y + r.h / 2 - cssH / zoom / 2 }
}

