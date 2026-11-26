import { describe, it, expect } from 'vitest'
import type { PackMap, PackObject } from '../../../shared/mapPack'
import { inVersion } from '../../../shared/mapPack'
import { tagMapVersions, versionPairs, versionWarps } from '../../../../scripts/build-maps/versions'

const V = ['Black', 'White']

// 0 Route (world) · 1 Gate · 2 Black City · 3 White Forest · 4 Black City PC · 5 White Forest PC · 6 Hut (no warp in)
const keys = ['R14', 'GATE', 'Z0', 'Z424', 'PC_B', 'PC_W', 'HUT']
const map = (id: number, world = false): PackMap => ({ id, key: keys[id], name: keys[id], category: 'building', w: 8, h: 8, terrain: -1, maxLift: 0, ...(world ? { world: [0, 0] as [number, number] } : {}) })
const warp = (from: number, to: number, x = 1, y = 1): PackObject => ({ map: from, x, y, lift: 0, kind: 'warp', sprite: null, warp: { map: to } })

function build() {
  const maps = keys.map((_, i) => map(i, i === 0))
  const objects = [
    warp(0, 1), warp(1, 0),
    warp(1, 2, 5, 14),           // the gate only leads to Black City, as in the ROM
    warp(2, 1, 3, 3), warp(2, 4),
    warp(3, 1, 7, 7), warp(3, 5),
    warp(4, 2), warp(5, 3),
  ]
  const pairs = versionPairs('black_white', new Map(keys.map((k, i) => [k, i])), V)
  objects.push(...versionWarps(objects, pairs.pairs, pairs.versionOf))
  const tagged = tagMapVersions(maps, objects, pairs.pairs, pairs.versionOf, V)
  return { maps, objects, tagged }
}

describe('map version variants', () => {
  it('pairs the swapped zones', () => {
    const { maps } = build()
    expect(maps[2]).toMatchObject({ version: 'Black', variants: { White: 3 } })
    expect(maps[3]).toMatchObject({ version: 'White', variants: { Black: 2 } })
  })

  it('gives the gate a White twin leading to White Forest\'s door back', () => {
    const { objects } = build()
    const gate = objects.filter(o => o.map === 1 && o.warp?.map !== 0)
    expect(gate).toHaveLength(2)
    expect(gate.find(o => o.version === 'Black')!.warp!.map).toBe(2)
    expect(gate.find(o => o.version === 'White')).toMatchObject({ x: 5, y: 14, warp: { map: 3, x: 7, y: 7 } })
  })

  it('tags the maps only one version reaches, and leaves unreached maps shared', () => {
    const { maps, tagged } = build()
    expect(maps[4].version).toBe('Black')
    expect(maps[5].version).toBe('White')
    expect(maps[1].version).toBeUndefined()
    expect(maps[6].version).toBeUndefined()
    expect(tagged).toHaveLength(2)
  })

  it('inVersion: untagged and one-version packs show everywhere', () => {
    expect(inVersion(undefined, 'Black')).toBe(true)
    expect(inVersion('White', null)).toBe(true)
    expect(inVersion('White', 'Black')).toBe(false)
  })
})
