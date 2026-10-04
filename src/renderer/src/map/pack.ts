// Loading a game's map pack (pack.json + terrain blobs + decoded masks) from
// the `solodex-map://` protocol, and the indexes the viewer derives from it.
// See docs/maps/README.md and src/shared/mapPack.ts for the format.

import { useEffect, useState } from 'react'
import { decodeMask, MAP_PACK_IDS, MAP_PACK_VERSION, MAP_SCHEME, type MapPackJson, type PackEncounter } from '../../../shared/mapPack'

export interface SpeciesSpot {
  map: number
  encounter: PackEncounter
  /** slots for the species, all versions */
  levels: [number, number]
  rate: number
}

export interface MapPack {
  game: string
  json: MapPackJson
  /** terrain class per step (see TERRAIN), maps at `PackMap.terrain` */
  terrain: Uint8Array
  /** gen 4/5: px each tile is drawn above its grid row */
  lift: Int16Array | null
  /** decoded masks by surface index (1 = visible) */
  masks: (Uint8Array | null)[]
  /** [start, end) into `json.objects` per map id */
  objectRange: [number, number][]
  /** species → where it appears */
  species: Map<string, SpeciesSpot[]>
  url: (path: string) => string
}

const packs = new Map<string, Promise<MapPack | null>>()
let installed: Promise<Set<string>> | null = null

function installedPacks(): Promise<Set<string>> {
  installed ??= window.electronAPI.getMapPacks().then(ids => new Set(ids)).catch(() => new Set<string>())
  return installed
}

export function mapPackId(game: string): string | null {
  return MAP_PACK_IDS[game] ?? null
}

/** The Solodex games whose map pack is installed (null while unknown). */
export function useMapGames(): string[] | null {
  const [games, setGames] = useState<string[] | null>(null)
  useEffect(() => {
    let live = true
    installedPacks().then(ids => {
      if (live) setGames(Object.entries(MAP_PACK_IDS).filter(([, id]) => ids.has(id)).map(([g]) => g))
    })
    return () => { live = false }
  }, [])
  return games
}

async function fetchPack(game: string): Promise<MapPack | null> {
  const id = mapPackId(game)
  if (!id || !(await installedPacks()).has(id)) return null
  const url = (p: string) => `${MAP_SCHEME}://${id}/${p.split('/').map(encodeURIComponent).join('/')}`
  const [json, terrainBuf, liftBuf] = await Promise.all([
    fetch(url('pack.json')).then(r => (r.ok ? r.json() as Promise<MapPackJson> : Promise.reject(new Error(`pack.json: ${r.status}`)))),
    fetch(url('terrain.bin')).then(r => (r.ok ? r.arrayBuffer() : new ArrayBuffer(0))),
    fetch(url('lift.bin')).then(r => (r.ok ? r.arrayBuffer() : null)),
  ])
  if (json.version !== MAP_PACK_VERSION) throw new Error(`map pack ${id} is version ${json.version}, expected ${MAP_PACK_VERSION} (rerun npm run build:maps)`)
  const objectRange: [number, number][] = json.maps.map(() => [0, 0])
  for (let i = 0; i < json.objects.length;) {
    const m = json.objects[i].map
    let j = i
    while (j < json.objects.length && json.objects[j].map === m) j++
    objectRange[m] = [i, j]
    i = j
  }
  const species = new Map<string, SpeciesSpot[]>()
  for (const [mapId, list] of Object.entries(json.encounters)) {
    for (const enc of list) {
      const seen = new Map<string, SpeciesSpot>()
      for (const slots of Object.values(enc.slots)) {
        for (const s of slots) {
          let spot = seen.get(s.species)
          if (!spot) {
            spot = { map: Number(mapId), encounter: enc, levels: [s.min, s.max], rate: 0 }
            seen.set(s.species, spot)
          }
          spot.levels = [Math.min(spot.levels[0], s.min), Math.max(spot.levels[1], s.max)]
        }
      }
      // the rate of the first version listing the species (versions rarely differ in rate)
      for (const [name, spot] of seen) {
        const slots = Object.values(enc.slots).find(list => list.some(s => s.species === name)) ?? []
        spot.rate = slots.filter(s => s.species === name).reduce((sum, s) => sum + s.rate, 0)
        const list = species.get(name) ?? []
        list.push(spot)
        species.set(name, list)
      }
    }
  }
  return {
    game,
    json,
    terrain: new Uint8Array(terrainBuf),
    lift: liftBuf ? new Int16Array(liftBuf) : null,
    masks: json.surfaces.map(s => (s.mask ? decodeMask(s.mask) : null)),
    objectRange,
    species,
    url,
  }
}

export function loadMapPack(game: string): Promise<MapPack | null> {
  let p = packs.get(game)
  if (!p) {
    p = fetchPack(game).catch(err => {
      console.error(`[Solodex] map pack for ${game} failed to load:`, err)
      packs.delete(game)
      return null
    })
    packs.set(game, p)
  }
  return p
}

/** The game's map pack: undefined while loading, null when there is none. */
export function useMapPack(game: string): MapPack | null | undefined {
  const [state, setState] = useState<{ game: string; pack: MapPack | null } | null>(null)
  useEffect(() => {
    let live = true
    loadMapPack(game).then(pack => { if (live) setState({ game, pack }) })
    return () => { live = false }
  }, [game])
  return state && state.game === game ? state.pack : undefined
}
