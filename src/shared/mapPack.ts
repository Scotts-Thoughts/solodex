// The Solodex map pack: one zip per game (resources/maps/<pack id>.zip) that
// `npm run build:maps` converts from the XP router's map_data packs, served to
// the renderer over the `solodex-map://<pack id>/<path>` protocol.
// Shared by the build script, the main process and the renderer, so nothing in
// here may import Electron, Node or DOM APIs. See docs/maps/README.md.

export const MAP_PACK_VERSION = 1
/** URL scheme the main process serves pack files on. */
export const MAP_SCHEME = 'solodex-map'
/** Every map coordinate is in 16 px steps (one gen 3+ tile, half a gen 1/2 block). */
export const STEP_PX = 16

/** Solodex game → map pack id (the router's / pokemap's game id). */
export const MAP_PACK_IDS: Record<string, string> = {
  'Red and Blue':             'red_blue',
  'Yellow':                   'yellow',
  'Gold and Silver':          'gold_silver',
  'Crystal':                  'crystal',
  'Ruby and Sapphire':        'ruby_sapphire',
  'Emerald':                  'emerald',
  'FireRed and LeafGreen':    'firered_leafgreen',
  'Diamond and Pearl':        'diamond_pearl',
  'Platinum':                 'platinum',
  'HeartGold and SoulSilver': 'heartgold_soulsilver',
  'Black':                    'black_white',
  'Black 2 and White 2':      'black2_white2',
}

export type MapCategory = 'city' | 'route' | 'area' | 'building' | 'dungeon'

export type MapObjectKind = 'trainer' | 'item' | 'hidden_item' | 'berry' | 'sign' | 'warp' | 'npc' | 'obstacle'

/** A visibility mask over a surface: one cell per 16 px, row-major run-length `[value, count, …]`, 1 = visible. */
export interface PackMask {
  w: number
  h: number
  rle: number[]
}

/**
 * A picture a scope is drawn from: the world, or one interior image (several
 * maps can share one). Either a single image file at `path` (`tile` 0) or a
 * pyramid of `tile`-px WebP tiles at `<path>/<level>/<x>_<y>.webp`, where a
 * level-L tile covers `tile·2^L` surface px.
 */
export interface PackSurface {
  path: string
  w: number
  h: number
  tile: number
  levels: number
  /** pyramids: the tiles that exist, `"x_y"` per level (absent tiles are empty) */
  tiles?: string[][]
  mask: PackMask | null
}

/** Where an indoor map is shown on its own: a `w × h` px scope with the map's (0, 0) at (ox, oy). */
export interface PackScope {
  w: number
  h: number
  ox: number
  oy: number
  /** surface drawn at (sx, sy), or null when the map has no picture */
  surface: number | null
  sx: number
  sy: number
}

export interface PackMap {
  id: number
  /** decomp constant (`ROUTE_1`, `MAP_HEADER_ROUTE_201`) or gen 5 zone (`Z355`) */
  key: string
  name: string
  category: MapCategory
  /** size in steps */
  w: number
  h: number
  /** outdoor maps: top-left in world px */
  world?: [number, number]
  /** indoor maps (and outdoor maps the world does not place) */
  scope?: PackScope
  /** offset of the map's w·h cells in terrain.bin (and lift.bin), or -1 */
  terrain: number
  /** largest terrain lift of the map (gen 4/5), for hit-test slack */
  maxLift: number
}

export interface PackWarp {
  map: number | null
  /** step of the destination warp, when known */
  x?: number
  y?: number
  /** elevators: the floors the game picks between at runtime */
  candidates?: number[]
}

export interface PackObject {
  map: number
  x: number
  y: number
  /** px the gen 4/5 tilted render draws the object above its tile */
  lift: number
  kind: MapObjectKind
  /** index into `MapPackJson.sprites` */
  sprite: number | null
  /** only in this version (B2W2's version-exclusive objects) */
  version?: string
  /** trainers / battling NPCs: Solodex trainer ids, default battle first */
  trainers?: string[]
  /** trainer names the build could not match to a Solodex trainer */
  unmatched?: string[]
  double?: boolean
  item?: string
  count?: number
  text?: string
  warp?: PackWarp
  label?: string
}

export interface PackSprite {
  file: string
  w: number
  h: number
}

export interface PackSlot {
  species: string
  min: number
  max: number
  /** percent */
  rate: number
}

/** One encounter table of a map: a method (`walk`), optionally met under a condition (`walk_night`). */
export interface PackEncounter {
  method: string
  condition: string | null
  /** encounter rate (gen-specific scale); null when the method has none */
  rate: number | null
  /** slots per version, `"*"` when every version shares them */
  slots: Record<string, PackSlot[]>
}

export interface PackLabel {
  key: string
  label: string
}

export interface PackAnchor {
  map: number
  x: number
  y: number
  /** index into `objects` when the anchor is an object */
  object?: number
}

export interface MapPackJson {
  version: number
  id: string
  gen: number
  versions: string[]
  /** gen 4/5: the world is a pre-rendered, tilted 3D picture (terrain lift, masks) */
  tilted: boolean
  /** `order`: the outdoor maps in draw order (a later map wins where gen 1–3 maps overlap) */
  world: { w: number; h: number; surface: number; defaultMap: number | null; order: number[] }
  surfaces: PackSurface[]
  /** gen 4/5: which map owns each `cell × cell`-step block of the world (map rects overlap) */
  ownership: { originX: number; originY: number; cell: number; cols: number; rows: number; cells: number[] } | null
  maps: PackMap[]
  /** grouped by map, in map order */
  objects: PackObject[]
  sprites: PackSprite[]
  /** by map id */
  encounters: Record<string, PackEncounter[]>
  /** encounter methods in display order, and whether they are met on water */
  methods: (PackLabel & { water: boolean })[]
  conditions: PackLabel[]
  /** Solodex trainer id → where the battle is */
  trainers: Record<string, PackAnchor[]>
  /** what the build could not resolve (shown in docs/maps coverage, not the UI) */
  stats: Record<string, number>
}

/** Terrain classes in terrain.bin, one byte per step. */
export const TERRAIN = { none: 32, walk: 46, blocked: 35, grass: 103, water: 119 } as const // ' ', '.', '#', 'g', 'w'

/** Decode a mask's run-length cells (1 = visible); null when the runs do not add up. */
export function decodeMask(mask: PackMask): Uint8Array | null {
  const n = mask.w * mask.h
  const cells = new Uint8Array(n)
  let i = 0
  for (let k = 0; k + 1 < mask.rle.length; k += 2) {
    const v = mask.rle[k]
    const run = mask.rle[k + 1]
    if (i + run > n) return null
    if (v !== 0) cells.fill(1, i, i + run)
    i += run
  }
  return i === n ? cells : null
}

/** Run-length encode mask cells (the inverse of `decodeMask`). */
export function encodeMask(cells: ArrayLike<number>): number[] {
  const out: number[] = []
  let i = 0
  while (i < cells.length) {
    const v = cells[i] ? 1 : 0
    let j = i
    while (j < cells.length && (cells[j] ? 1 : 0) === v) j++
    out.push(v, j - i)
    i = j
  }
  return out
}
