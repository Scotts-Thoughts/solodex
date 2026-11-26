// Version variants of maps (gen 5): where Black and White (or Black 2 and
// White 2) load a different zone in the same place, both zones are in the
// router pack as separate maps. The build tags each with its version, pairs
// it with its counterpart, gives warps into a swapped zone a twin for the
// other version, and tags every map that only one version can reach (the
// buildings behind Black City / White Forest, White 2's Route 4 houses …).
// The viewer's version switch then shows one version's maps at a time.
// See docs/maps/README.md ("Versions").

import type { PackMap, PackObject } from '../../src/shared/mapPack'

/**
 * Zones the game swaps by version, `[first version's zone, second version's zone]`:
 * the game loads the second in place of the first in White / White 2. Read from
 * the ROMs' own swap tables (the zonedata.c table in arm9: BW `0xa32a8`, B2W2
 * `0x96348`; B2W2 overlay 12 `0x1d8ac`). Zones the router pack does not carry
 * are skipped (B2W2's Z551, White 2's Route 4, is merged into Z326 by pokemap
 * with version-tagged objects).
 */
export const VERSION_ZONES: Record<string, [string, string][]> = {
  black_white: [
    ['Z0', 'Z424'],     // Black City / White Forest
    ['Z294', 'Z295'],   // the same, second header
  ],
  black2_white2: [
    ['Z0', 'Z424'],     // Black City / White Forest (Area 1)
    ['Z294', 'Z295'],   // Black City / White Forest
    ['Z326', 'Z551'],   // Route 4
    ['Z531', 'Z537'],   // Reversal Mountain rooms
    ['Z532', 'Z538'],
    ['Z533', 'Z539'],
    ['Z534', 'Z540'],
    ['Z535', 'Z541'],
    ['Z536', 'Z542'],
    ['Z587', 'Z594'],   // Victory Road
    ['Z589', 'Z595'],
  ],
}

/**
 * Maps of one version that no warp reaches (scripted entrances), by version
 * index: B2W2's Black Tower and White Treehollow floors are entered by script
 * from Black City / White Forest, so the warp walk cannot tag them.
 */
export const VERSION_ONLY: Record<string, [string[], string[]]> = {
  black2_white2: [
    ['Z479', 'Z481', 'Z483', 'Z484', 'Z486', 'Z493'],   // Black Tower
    ['Z478', 'Z480', 'Z482', 'Z485', 'Z487', 'Z492'],   // White Treehollow
  ],
}

/** The pack's version pairs as map ids (both zones present), and the version of each paired or VERSION_ONLY map. */
export function versionPairs(packId: string, keyToId: Map<string, number>, versions: string[]): { pairs: [number, number][]; versionOf: Map<number, string> } {
  const pairs: [number, number][] = []
  const versionOf = new Map<number, string>()
  if (versions.length !== 2) return { pairs, versionOf }
  VERSION_ONLY[packId]?.forEach((keys, i) => {
    for (const k of keys) {
      const id = keyToId.get(k)
      if (id !== undefined) versionOf.set(id, versions[i])
    }
  })
  for (const [a, b] of VERSION_ZONES[packId] ?? []) {
    const ia = keyToId.get(a)
    const ib = keyToId.get(b)
    if (ia === undefined || ib === undefined) continue
    pairs.push([ia, ib])
    versionOf.set(ia, versions[0])
    versionOf.set(ib, versions[1])
  }
  return { pairs, versionOf }
}

/**
 * Warps into a swapped zone: tag each with the zone's version and, where the
 * source map has no warp of its own into the counterpart (the gates into Black
 * City), add a twin for the other version on the same tile, leading to the
 * counterpart's door back to the source map. Returns the objects to append.
 */
export function versionWarps(objects: PackObject[], pairs: [number, number][], versionOf: Map<number, string>): PackObject[] {
  const twin = new Map<number, number>()
  for (const [a, b] of pairs) { twin.set(a, b); twin.set(b, a) }
  const added: PackObject[] = []
  for (const o of objects) {
    const dest = o.kind === 'warp' ? o.warp?.map ?? null : null
    if (dest === null) continue
    const v = versionOf.get(dest)
    // warps inside a swapped zone's own buildings need no tag: the map itself has one
    if (!v || versionOf.has(o.map) || (o.version && o.version !== v)) continue
    o.version = v
    const other = twin.get(dest)
    if (other === undefined || objects.some(p => p.kind === 'warp' && p.map === o.map && p.warp?.map === other)) continue
    // only where the counterpart leads back here (Black Tower's exit has no White Forest twin)
    const door = objects.find(p => p.kind === 'warp' && p.map === other && p.warp?.map === o.map)
    if (door) added.push({ ...o, version: versionOf.get(other)!, warp: { map: other, x: door.x, y: door.y } })
  }
  return added
}

/**
 * Tag the paired maps and every indoor map only one version can reach: a walk
 * over the warps from the world (and from maps no warp leads to) per version,
 * skipping maps and warps of the other version.
 */
export function tagMapVersions(maps: PackMap[], objects: PackObject[], pairs: [number, number][], versionOf: Map<number, string>, versions: string[]): string[] {
  for (const [id, v] of versionOf) maps[id].version = v
  for (const [a, b] of pairs) {
    maps[a].version = versionOf.get(a)
    maps[a].variants = { [versionOf.get(b)!]: b }
    maps[b].version = versionOf.get(b)
    maps[b].variants = { [versionOf.get(a)!]: a }
  }
  if (versions.length !== 2 || (!pairs.length && !objects.some(o => o.version))) return []
  const out = new Map<number, { to: number; version?: string }[]>()
  const hasIncoming = new Set<number>()
  for (const o of objects) {
    if (o.kind !== 'warp' || !o.warp) continue
    for (const to of [o.warp.map, ...(o.warp.candidates ?? [])]) {
      if (to === null || to === o.map) continue
      const list = out.get(o.map) ?? []
      list.push({ to, version: o.version })
      out.set(o.map, list)
      hasIncoming.add(to)
    }
  }
  const reached = versions.map(v => {
    const seen = new Set<number>()
    const queue = maps.filter(m => (m.world || !hasIncoming.has(m.id)) && (!m.version || m.version === v)).map(m => m.id)
    for (const id of queue) seen.add(id)
    while (queue.length) {
      const id = queue.pop()!
      for (const w of out.get(id) ?? []) {
        if ((w.version && w.version !== v) || seen.has(w.to)) continue
        const m = maps[w.to]
        if (!m || (m.version && m.version !== v)) continue
        seen.add(w.to)
        queue.push(w.to)
      }
    }
    return seen
  })
  const tagged: string[] = []
  for (const m of maps) {
    if (m.version || m.world) continue
    const inA = reached[0].has(m.id)
    const inB = reached[1].has(m.id)
    if (inA === inB) continue
    m.version = inA ? versions[0] : versions[1]
    tagged.push(`${m.key} ${m.name} (${m.version})`)
  }
  return tagged
}
