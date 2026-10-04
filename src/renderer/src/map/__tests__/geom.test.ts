import { describe, it, expect } from 'vitest'
import type { MapPackJson, PackMap } from '../../../../shared/mapPack'
import { TERRAIN } from '../../../../shared/mapPack'
import { fitRect, mapAt, objectCenter, pickStep, scopeOfMap, stepCenter, WORLD, type GeomPack } from '../geom'

function pack(maps: PackMap[], extra: Partial<MapPackJson> = {}, binary: Partial<GeomPack> = {}): GeomPack {
  const json: MapPackJson = {
    version: 1, id: 'test', gen: 3, versions: ['Test'], tilted: false,
    world: { w: 256, h: 256, surface: 0, defaultMap: 0, order: maps.filter(m => m.world).map(m => m.id) },
    surfaces: [{ path: 'world', w: 256, h: 256, tile: 512, levels: 1, tiles: [[]], mask: null }],
    ownership: null, maps, objects: [], sprites: [], encounters: {}, methods: [], conditions: [], trainers: {}, stats: {},
    ...extra,
  }
  return { json, terrain: new Uint8Array(0), lift: null, masks: [null], ...binary }
}

const map = (id: number, w: number, h: number, more: Partial<PackMap> = {}): PackMap =>
  ({ id, key: `M${id}`, name: `Map ${id}`, category: 'route', w, h, terrain: -1, maxLift: 0, ...more })

describe('tile worlds (gens 1–3)', () => {
  const p = pack([
    map(0, 4, 4, { world: [0, 0] }),
    map(1, 4, 4, { world: [32, 32] }),
    map(2, 5, 4, { scope: { w: 96, h: 80, ox: 16, oy: 8, surface: null, sx: 0, sy: 0 } }),
  ])

  it('gives overlapping pixels to the map drawn last', () => {
    expect(mapAt(p, WORLD, 40, 40)?.map).toBe(1)
    const reordered = pack(p.json.maps, { world: { ...p.json.world, order: [1, 0] } })
    expect(mapAt(reordered, WORLD, 40, 40)?.map).toBe(0)
    expect(mapAt(p, WORLD, 200, 200)).toBeNull()
  })

  it('picks the step under a pixel', () => {
    expect(pickStep(p, WORLD, 50, 20)).toEqual({ map: 0, x: 3, y: 1 })
    expect(pickStep(p, WORLD, 90, 90)).toEqual({ map: 1, x: 3, y: 3 })
  })

  it('places interiors in their own scope', () => {
    expect(scopeOfMap(p, 2)).toEqual({ kind: 'map', id: 2 })
    expect(scopeOfMap(p, 0)).toEqual(WORLD)
    const scope = scopeOfMap(p, 2)
    expect(mapAt(p, scope, 21, 13)).toEqual({ map: 2, lx: 5, ly: 5 })
    expect(mapAt(p, scope, 10, 13)).toBeNull()
    expect(stepCenter(p, scope, 2, 1, 1)).toEqual([16 + 24, 8 + 24])
    expect(stepCenter(p, WORLD, 2, 1, 1)).toBeNull()
  })
})

describe('tilted worlds (gens 4/5)', () => {
  // a 2×4 map whose bottom row is drawn 20 px higher (terrain lift)
  const lift = new Int16Array([0, 0, 0, 0, 0, 0, 20, 20])
  const terrain = new Uint8Array([46, 46, 103, 103, 46, 46, 119, 119])
  const p = pack(
    [map(0, 2, 4, { world: [0, 0], terrain: 0, maxLift: 20 })],
    { tilted: true, ownership: { originX: 0, originY: 0, cell: 32, cols: 1, rows: 1, cells: [0] }, objects: [{ map: 0, x: 1, y: 3, lift: 20, kind: 'item', sprite: null }] },
    { lift, terrain },
  )

  it('picks the front-most lifted tile covering the pixel', () => {
    expect(pickStep(p, WORLD, 8, 30)).toEqual({ map: 0, x: 0, y: 3 })
    expect(pickStep(p, WORLD, 8, 20)).toEqual({ map: 0, x: 0, y: 1 })
  })

  it('raises tiles and objects by their lift', () => {
    expect(stepCenter(p, WORLD, 0, 0, 3)).toEqual([8, 3 * 16 + 8 - 20])
    expect(objectCenter(p, WORLD, 0)).toEqual([24, 3 * 16 + 8 - 20])
  })

  it('skips tiles another map owns', () => {
    const other = pack(p.json.maps, { ...p.json, ownership: { originX: 0, originY: 0, cell: 32, cols: 1, rows: 1, cells: [-1] } }, { lift, terrain })
    expect(pickStep(other, WORLD, 8, 20)).toBeNull()
    expect(TERRAIN.water).toBe('w'.charCodeAt(0))
  })
})

describe('fit', () => {
  it('fits an interior to its mask\'s visible cells', () => {
    const cells = new Uint8Array(16)
    cells[1 * 4 + 1] = 1
    cells[1 * 4 + 2] = 1
    const p = pack(
      [map(0, 2, 2, { scope: { w: 120, h: 100, ox: 0, oy: 0, surface: 1, sx: 16, sy: 8 } })],
      { surfaces: [{ path: 'world', w: 1, h: 1, tile: 512, levels: 1, mask: null }, { path: 'interiors/a.webp', w: 64, h: 64, tile: 0, levels: 1, mask: { w: 4, h: 4, rle: [] } }] },
      { masks: [null, cells] },
    )
    expect(fitRect(p, { kind: 'map', id: 0 })).toEqual({ x: 32, y: 24, w: 32, h: 16 })
    expect(fitRect(p, WORLD)).toEqual({ x: 0, y: 0, w: 256, h: 256 })
  })
})
