// Scope / world / step coordinate maths for the map viewer: a port of the XP
// router's rust/crates/xpr-map/src/geom.rs and image_world.rs. A scope is the
// whole world or one map on its own; its pixel space is the world's (outdoor
// maps at `PackMap.world`) or the map's own frame (`PackMap.scope`).

import { STEP_PX, TERRAIN, type MapPackJson } from '../../../shared/mapPack'

export type Scope = { kind: 'world' } | { kind: 'map'; id: number }

export const WORLD: Scope = { kind: 'world' }

/** The binary parts of a pack the maths needs. */
export interface GeomPack {
  json: MapPackJson
  terrain: Uint8Array
  lift: Int16Array | null
  masks: (Uint8Array | null)[]
}

export interface Rect { x: number; y: number; w: number; h: number }

/** How far below / above its own row a lifted tile can be found (pokemap's `pickTileLocal`). */
const PICK_ROWS_ABOVE = 4
const PICK_ROWS_BELOW = 16

export const sameScope = (a: Scope, b: Scope) => a.kind === b.kind && (a.kind === 'world' || (b.kind === 'map' && a.id === b.id))

/** The scope a map is shown in: the world for placed outdoor maps, else its own. */
export function scopeOfMap(pack: GeomPack, id: number): Scope {
  return pack.json.maps[id]?.world ? WORLD : { kind: 'map', id }
}

export function scopeRect(pack: GeomPack, scope: Scope): Rect {
  if (scope.kind === 'world') return { x: 0, y: 0, w: pack.json.world.w, h: pack.json.world.h }
  const m = pack.json.maps[scope.id]
  if (m?.scope) return { x: 0, y: 0, w: m.scope.w, h: m.scope.h }
  return { x: 0, y: 0, w: (m?.w ?? 0) * STEP_PX, h: (m?.h ?? 0) * STEP_PX }
}

/** Where map `id`'s (0, 0) is in the scope's px, or null when the scope does not show it. */
export function mapOrigin(pack: GeomPack, scope: Scope, id: number): [number, number] | null {
  const m = pack.json.maps[id]
  if (!m) return null
  if (scope.kind === 'world') return m.world ?? null
  if (scope.id !== id) return null
  return m.scope ? [m.scope.ox, m.scope.oy] : [0, 0]
}

/** The map's rectangle in a scope's px. */
export function mapRect(pack: GeomPack, scope: Scope, id: number): Rect | null {
  const o = mapOrigin(pack, scope, id)
  const m = pack.json.maps[id]
  return o && m ? { x: o[0], y: o[1], w: m.w * STEP_PX, h: m.h * STEP_PX } : null
}

function terrainIndex(pack: GeomPack, map: number, x: number, y: number): number {
  const m = pack.json.maps[map]
  if (!m || m.terrain < 0 || x < 0 || y < 0 || x >= m.w || y >= m.h) return -1
  return m.terrain + y * m.w + x
}

/** Terrain class of a step (TERRAIN.*). */
export function terrainAt(pack: GeomPack, map: number, x: number, y: number): number {
  const i = terrainIndex(pack, map, x, y)
  return i >= 0 && i < pack.terrain.length ? pack.terrain[i] : TERRAIN.none
}

/** px the tilted render draws a tile above its grid row (gen 4/5; 0 elsewhere). */
export function liftAt(pack: GeomPack, map: number, x: number, y: number): number {
  if (!pack.lift) return 0
  const i = terrainIndex(pack, map, x, y)
  return i >= 0 && i < pack.lift.length ? pack.lift[i] : 0
}

/** Centre of a step in scope px (raised by its tile's lift). */
export function stepCenter(pack: GeomPack, scope: Scope, map: number, x: number, y: number): [number, number] | null {
  const o = mapOrigin(pack, scope, map)
  if (!o) return null
  return [o[0] + x * STEP_PX + STEP_PX / 2, o[1] + y * STEP_PX + STEP_PX / 2 - liftAt(pack, map, x, y)]
}

/** Centre of an object in scope px (raised by its lift). */
export function objectCenter(pack: GeomPack, scope: Scope, index: number): [number, number] | null {
  const o = pack.json.objects[index]
  if (!o) return null
  const origin = mapOrigin(pack, scope, o.map)
  if (!origin) return null
  return [origin[0] + o.x * STEP_PX + STEP_PX / 2, origin[1] + o.y * STEP_PX + STEP_PX / 2 - o.lift]
}

/** The map that owns a world step (gen 4/5 ownership grid; map rects overlap there). */
export function ownerOf(pack: GeomPack, tx: number, ty: number): number | null {
  const own = pack.json.ownership
  if (!own) return null
  const c = Math.floor((tx - own.originX) / own.cell)
  const r = Math.floor((ty - own.originY) / own.cell)
  if (c < 0 || r < 0 || c >= own.cols || r >= own.rows) return null
  const v = own.cells[r * own.cols + c]
  return v >= 0 ? v : null
}

/** Which map (and map-local px) a scope px falls in. */
export function mapAt(pack: GeomPack, scope: Scope, px: number, py: number): { map: number; lx: number; ly: number } | null {
  if (scope.kind === 'map') {
    const r = mapRect(pack, scope, scope.id)
    if (!r || px < r.x || py < r.y || px >= r.x + r.w || py >= r.y + r.h) return null
    return { map: scope.id, lx: px - r.x, ly: py - r.y }
  }
  if (pack.json.ownership) {
    const id = ownerOf(pack, Math.floor(px / STEP_PX), Math.floor(py / STEP_PX))
    const w = id !== null ? pack.json.maps[id]?.world : undefined
    return id !== null && w ? { map: id, lx: px - w[0], ly: py - w[1] } : null
  }
  // tile worlds: the last map in draw order wins where maps overlap
  let hit: { map: number; lx: number; ly: number } | null = null
  for (const id of pack.json.world.order) {
    const r = mapRect(pack, scope, id)
    if (r && px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h) hit = { map: id, lx: px - r.x, ly: py - r.y }
  }
  return hit
}

/** The tile of a map under a map-local px, allowing for terrain lift (`pick_local`). */
function pickLocal(pack: GeomPack, map: number, lx: number, ly: number): [number, number] | null {
  const m = pack.json.maps[map]
  if (!m) return null
  const tx = Math.floor(lx / STEP_PX)
  if (tx < 0 || tx >= m.w) return null
  const base = Math.floor(ly / STEP_PX)
  if (!pack.lift || m.terrain < 0) return base >= 0 && base < m.h ? [tx, base] : null
  const lo = Math.max(0, base - PICK_ROWS_ABOVE)
  const hi = Math.min(m.h - 1, base + PICK_ROWS_BELOW)
  for (let ty = hi; ty >= lo; ty--) {
    const top = ty * STEP_PX - liftAt(pack, map, tx, ty)
    if (ly >= top && ly < top + STEP_PX) return [tx, ty]
  }
  return null
}

/**
 * The step under a scope px: tile worlds take the step the px is in; tilted
 * worlds the front-most tile whose lifted picture covers it, across every
 * overworld map near it and only where the ownership grid gives that map the
 * tile (`pick_step`).
 */
export function pickStep(pack: GeomPack, scope: Scope, px: number, py: number): { map: number; x: number; y: number } | null {
  if (!pack.json.tilted) {
    const hit = mapAt(pack, scope, px, py)
    return hit ? { map: hit.map, x: Math.floor(hit.lx / STEP_PX), y: Math.floor(hit.ly / STEP_PX) } : null
  }
  if (scope.kind === 'map') {
    const o = mapOrigin(pack, scope, scope.id)
    const t = o ? pickLocal(pack, scope.id, px - o[0], py - o[1]) : null
    return t ? { map: scope.id, x: t[0], y: t[1] } : null
  }
  let best: { map: number; x: number; y: number; row: number } | null = null
  for (const id of pack.json.world.order) {
    const m = pack.json.maps[id]
    const r = mapRect(pack, scope, id)
    if (!m || !r) continue
    const slack = m.maxLift + STEP_PX
    if (px < r.x || px >= r.x + r.w || py < r.y - slack || py >= r.y + r.h + 4 * STEP_PX) continue
    const t = pickLocal(pack, id, px - r.x, py - r.y)
    if (!t) continue
    const wtx = r.x / STEP_PX + t[0]
    const wty = r.y / STEP_PX + t[1]
    if (ownerOf(pack, wtx, wty) !== id) continue
    if (!best || wty > best.row) best = { map: id, x: t[0], y: t[1], row: wty }
  }
  if (best) return { map: best.map, x: best.x, y: best.y }
  const hit = mapAt(pack, scope, px, py)
  return hit ? { map: hit.map, x: Math.floor(hit.lx / STEP_PX), y: Math.floor(hit.ly / STEP_PX) } : null
}

/**
 * What "fit" shows of a scope: everything, except an interior whose picture
 * is a whole block of chunks around a room in one corner; that fits the
 * mask's visible cells (`fit_rect`).
 */
export function fitRect(pack: GeomPack, scope: Scope): Rect {
  const full = scopeRect(pack, scope)
  if (scope.kind === 'world') return full
  const sc = pack.json.maps[scope.id]?.scope
  if (!sc || sc.surface === null) return full
  const mask = pack.masks[sc.surface]
  const meta = pack.json.surfaces[sc.surface].mask
  if (!mask || !meta) return full
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let cy = 0; cy < meta.h; cy++) {
    for (let cx = 0; cx < meta.w; cx++) {
      if (!mask[cy * meta.w + cx]) continue
      if (cx < x0) x0 = cx
      if (cy < y0) y0 = cy
      if (cx + 1 > x1) x1 = cx + 1
      if (cy + 1 > y1) y1 = cy + 1
    }
  }
  if (x1 <= x0) return full
  const x = Math.max(full.x, sc.sx + x0 * STEP_PX)
  const y = Math.max(full.y, sc.sy + y0 * STEP_PX)
  const r = { x, y, w: Math.min(full.w, sc.sx + x1 * STEP_PX) - x, h: Math.min(full.h, sc.sy + y1 * STEP_PX) - y }
  return r.w > 0 && r.h > 0 ? r : full
}
