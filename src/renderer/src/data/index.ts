/**
 * Data layer.
 *
 * The small, always-needed tables (moves, type chart, TM/HM lists, natures,
 * unobtainable moves) are imported statically. The per-game Pokedex, trainer
 * and encounter tables are loaded on demand — see the "Loading" section — and
 * cached for the rest of the session; the synchronous getters return null/[]
 * for a game that has not arrived yet, and `useGameData` (data/useGameData.ts)
 * re-renders a component when it does. The species list shown before any game
 * has loaded is a build-time index (scripts/vite-plugin-solodex-data.ts).
 */
import { moves as allMoves } from '@data/moves'
import { effectiveness as rawEffectiveness } from '@data/effectiveness'
import { tmhm as rawTmhm } from '@data/tmhm'
import { natures as rawNatures } from '@data/natures'
import { unobtainable_moves as rawUnobtainable } from '@data/unobtainable_moves'
import speciesIndex from 'virtual:solodex-species-index'
import type { PokemonData, MoveData, PokemonListEntry, EvolutionEntry, Trainer, TrainerPokemon, TrainerListEntry } from '../types/pokemon'
import { classifyForm, isMegaForm } from './forms'
import { GAMES, GAME_TO_GEN } from './games'
import { SPECIES_ALIASES, DISPLAY_NAMES, normalizePokedex } from './speciesIndex'

export { GAMES, GEN_GROUPS, GAME_COLOR, GAME_ABBREV, GAME_TO_GEN } from './games'
export type { GameName } from './games'
export { displayName } from './speciesIndex'

// Map game names from unobtainable_moves.js keys to GAMES array entries
const UNOBTAINABLE_GAME_MAP: Record<string, string> = {
  'Black': 'Black',
  'White': 'Black',
  'Black 2': 'Black 2 and White 2',
  'White 2': 'Black 2 and White 2',
}

export interface UserBans {
  banned: string[]
  conditional: string[]
  byGame: Record<string, string[]>
}

export const EMPTY_USER_BANS: UserBans = { banned: [], conditional: [], byGame: {} }

export interface UnobtainableMoveSets {
  banned: Set<string>
  postgame: Set<string>
  conditional: Set<string>
}

const _staticBannedSet: Set<string> = new Set(
  (rawUnobtainable as Record<string, string[]>)['Banned'] ?? []
)
const _staticConditionalSet: Set<string> = new Set(
  (rawUnobtainable as Record<string, string[]>)['Conditional'] ?? []
)
const _staticPostgameByGame: Record<string, Set<string>> = (() => {
  const map: Record<string, Set<string>> = {}
  for (const [key, moves] of Object.entries(rawUnobtainable as Record<string, string[]>)) {
    if (key === 'Banned' || key === 'Conditional') continue
    const mapped = UNOBTAINABLE_GAME_MAP[key] ?? key
    if (!map[mapped]) map[mapped] = new Set()
    for (const m of moves) map[mapped].add(m)
  }
  return map
})()

export function getStaticPostgameMoves(game: string): string[] {
  return Array.from(_staticPostgameByGame[game] ?? [])
}

export function getStaticBannedMoves(): string[] {
  return Array.from(_staticBannedSet)
}

export function getStaticConditionalMoves(): string[] {
  return Array.from(_staticConditionalSet)
}

export function getUnobtainableMoveSets(game: string, userBans: UserBans = EMPTY_USER_BANS): UnobtainableMoveSets {
  const banned = new Set<string>(_staticBannedSet)
  for (const m of userBans.banned) banned.add(m)

  const postgame = new Set<string>(_staticPostgameByGame[game] ?? [])
  const userPerGame = userBans.byGame[game]
  if (userPerGame) for (const m of userPerGame) postgame.add(m)

  const conditional = new Set<string>(_staticConditionalSet)
  for (const m of userBans.conditional) conditional.add(m)

  return { banned, postgame, conditional }
}

const movesData = allMoves as Record<string, Record<string, MoveData>>

/**
 * Every move in a generation's table. Pass `game` to apply that game's
 * per-game overrides (`MOVE_GAME_OVERRIDES`, e.g. Diamond/Pearl Hypnosis) and
 * its move spellings (`getMoveNameForGame`).
 */
export function getMovesForGen(gen: string, game?: string): { name: string; data: MoveData }[] {
  const data = movesData[gen]
  if (!data) return []
  const overrides = game ? MOVE_GAME_OVERRIDES[game] : undefined
  return Object.entries(data)
    // Colosseum/XD Shadow moves ride along in the gen 3-4 tables; no mainline game has them
    .filter(([, move]) => move.type !== 'Shadow')
    .map(([name, move]) => ({
      name: game ? getMoveNameForGame(name, game) : name,
      data: overrides?.[name] ? { ...move, ...overrides[name] } : move,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

let _moveIntroGen: Record<string, number> | null = null

export function getMoveIntroductionGen(moveName: string): number | null {
  if (!_moveIntroGen) {
    const map: Record<string, number> = {}
    const gens = Object.keys(movesData)
      .map(Number)
      .filter(g => !Number.isNaN(g))
      .sort((a, b) => a - b)

    for (const gen of gens) {
      const genData = movesData[String(gen)]
      if (!genData) continue
      for (const name of Object.keys(genData)) {
        if (map[name] == null) {
          map[name] = gen
        }
      }
    }
    _moveIntroGen = map
  }
  return _moveIntroGen[moveName] ?? _moveIntroGen[MOVE_NAME_ALIASES[moveName] ?? ''] ?? null
}

/** True if the move appears in this gen's data but not in the previous gen's (so "newly introduced"). */
export function isMoveNewInGen(moveName: string, gen: string): boolean {
  const g = Number(gen)
  if (!Number.isFinite(g) || g < 1) return false
  const alias = MOVE_NAME_ALIASES[moveName] ?? ''
  const curr = movesData[gen]?.[moveName] ?? movesData[gen]?.[alias]
  if (!curr) return false
  if (g === 1) return true
  const prev = movesData[String(g - 1)]?.[moveName] ?? movesData[String(g - 1)]?.[alias]
  return !prev
}

// Raw effectiveness only covers gens 1–4. Build gen 5 and gen 6+ charts from gen 4.
const _rawEffectiveness = rawEffectiveness as Record<string, Record<string, Record<string, number>>>

function deepCloneChart(chart: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const clone: Record<string, Record<string, number>> = {}
  for (const [atk, defs] of Object.entries(chart)) {
    clone[atk] = { ...defs }
  }
  return clone
}

// Gen 5: same type chart as Gen 4
const gen5Chart = deepCloneChart(_rawEffectiveness['4'])

// Gen 6+: Steel no longer resists Ghost or Dark, Fairy type added
const gen6Chart = deepCloneChart(gen5Chart)
gen6Chart['Ghost']['Steel'] = 1
gen6Chart['Dark']['Steel']  = 1
// Fairy as attacker (entries in gen6Chart['Fairy'][defending])
gen6Chart['Fairy'] = {}
const allDefendingTypes = Object.keys(gen6Chart['Normal']) // all defending types from existing data
for (const t of allDefendingTypes) gen6Chart['Fairy'][t] = 1
gen6Chart['Fairy']['Dragon']   = 2
gen6Chart['Fairy']['Dark']     = 2
gen6Chart['Fairy']['Fighting'] = 2
gen6Chart['Fairy']['Fire']     = 0.5
gen6Chart['Fairy']['Poison']   = 0.5
gen6Chart['Fairy']['Steel']    = 0.5
// Fairy as defender (entries in gen6Chart[attacking]['Fairy'])
for (const atkType of Object.keys(gen6Chart)) {
  gen6Chart[atkType]['Fairy'] = 1
}
gen6Chart['Poison']['Fairy']   = 2
gen6Chart['Steel']['Fairy']    = 2
gen6Chart['Bug']['Fairy']      = 0.5
gen6Chart['Dark']['Fairy']     = 0.5
gen6Chart['Fighting']['Fairy'] = 0.5
gen6Chart['Dragon']['Fairy']   = 0

const effectivenessData: Record<string, Record<string, Record<string, number>>> = {
  ..._rawEffectiveness,
  '5': gen5Chart,
  '6': gen6Chart,
  '7': gen6Chart,
  '8': gen6Chart,
  '9': gen6Chart,
}

// Types that exist in each generation — used to filter out non-existent types from charts
const GEN1_TYPES = new Set([
  'Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison','Ground',
  'Flying','Psychic','Bug','Rock','Ghost','Dragon',
])
function typesForGen(gen: string): Set<string> | null {
  if (gen === '1') return GEN1_TYPES
  // Dark & Steel added in gen 2; Fairy added in gen 6 (handled by chart construction)
  return null // null = no filtering needed
}

// Split a parenthesized form suffix off a display name, e.g.
// "Meloetta (Aria)" → { base: "Meloetta", form: "(Aria)" } — used by the
// stat/effectiveness cards to always render the form on its own line
export function splitFormName(name: string): { base: string; form: string | null } {
  const m = name.match(/^(.+?)\s*(\(.+\))$/)
  return m ? { base: m[1], form: m[2] } : { base: name, form: null }
}

// ── Encounter Data ──────────────────────────────────────────────────────────────

export interface EncounterEntry {
  location: string
  method: string
  min_level: number
  max_level: number
  chance: number
}

type EncounterTable = Record<string, EncounterEntry[]>

/** Wild encounters for a species; empty until `loadEncounters(game)` has completed. */
export function getEncountersForPokemon(game: string, species: string): EncounterEntry[] {
  const table = _encounters[game]
  if (!table) return []

  // Try exact match first
  if (table[species]) return table[species]

  // Then try canonical alias form used in other datasets
  const canonical = SPECIES_ALIASES[species]
  if (canonical && table[canonical]) return table[canonical]

  // Finally, try display name variants (e.g. Nidoran♀)
  const display = DISPLAY_NAMES[species]
  if (display && table[display]) return table[display]

  return []
}

// Move names that changed spelling between generations, with the last
// generation that used the old spelling. The scraped pokedex files use the
// modern (Bulbapedia) spelling everywhere; `getMoveNameForGame` respells them
// for the game being shown. Trainer data and tmhm.js already use the period
// spelling, and moves.js the modern one, so lookups go through
// MOVE_NAME_ALIASES to accept either form.
const _MOVE_RENAMES: [modern: string, legacy: string, lastGen: number][] = [
  ['Ancient Power',  'AncientPower',  5],
  ['Bubble Beam',    'BubbleBeam',    5],
  ['Conversion 2',   'Conversion2',   2],
  ['Double Slap',    'DoubleSlap',    5],
  ['Dragon Breath',  'DragonBreath',  5],
  ['Dynamic Punch',  'DynamicPunch',  5],
  ['Extreme Speed',  'ExtremeSpeed',  5],
  ['Feather Dance',  'FeatherDance',  5],
  ['Feint Attack',   'Faint Attack',  5],
  ['Grass Whistle',  'GrassWhistle',  5],
  ['High Jump Kick', 'Hi Jump Kick',  5],
  ['Poison Powder',  'PoisonPowder',  5],
  ['Sand Attack',    'Sand-Attack',   5],
  ['Self-Destruct',  'Selfdestruct',  5],
  ['Smelling Salts', 'SmellingSalt',  5],
  ['Smokescreen',    'SmokeScreen',   5],
  ['Soft-Boiled',    'Softboiled',    5],
  ['Solar Beam',     'SolarBeam',     5],
  ['Sonic Boom',     'SonicBoom',     5],
  ['Thunder Punch',  'ThunderPunch',  5],
  ['Thunder Shock',  'ThunderShock',  5],
  ['Vise Grip',      'ViceGrip',      5],
  ['Vise Grip',      'Vice Grip',     7],
]
const MOVE_NAME_ALIASES: Record<string, string> = {}
for (const [modern, legacy] of _MOVE_RENAMES) {
  MOVE_NAME_ALIASES[modern] ??= legacy
  MOVE_NAME_ALIASES[legacy] = modern
}
// modern name → [lastGen, spelling] ascending, so the first entry whose
// lastGen covers the game's generation wins
const _MOVE_SPELLINGS_BY_GEN: Record<string, [number, string][]> = {}
for (const [modern, legacy, lastGen] of _MOVE_RENAMES) {
  ;(_MOVE_SPELLINGS_BY_GEN[modern] ??= []).push([lastGen, legacy])
}
for (const list of Object.values(_MOVE_SPELLINGS_BY_GEN)) list.sort((a, b) => a[0] - b[0])

/** The spelling a move had in `gen` (e.g. Feint Attack → "Faint Attack" in gens 1-5). Accepts any spelling. */
export function getMoveNameForGen(moveName: string, gen: number): string {
  const modern = _MOVE_SPELLINGS_BY_GEN[moveName] ? moveName : MOVE_NAME_ALIASES[moveName]
  const spellings = modern ? _MOVE_SPELLINGS_BY_GEN[modern] : undefined
  if (!spellings) return moveName
  return spellings.find(([lastGen]) => gen <= lastGen)?.[1] ?? modern
}

export function getMoveNameForGame(moveName: string, game: string): string {
  const gen = parseInt(GAME_TO_GEN[game] ?? '0')
  return gen ? getMoveNameForGen(moveName, gen) : moveName
}

const _LEARNSET_LIST_FIELDS = [
  'tm_hm_learnset', 'tutor_learnset', 'egg_moves', 'transfer_learnset', 'prior_evolution_learnset',
  'form_change_learnset', 'zygarde_cube_learnset', 'light_ball_egg_learnset',
] as const

/** Respell every learnset in a game's pokedex to that game's move names. */
function respellLearnsets(dex: Record<string, PokemonData>, game: string): Record<string, PokemonData> {
  const gen = parseInt(GAME_TO_GEN[game] ?? '0')
  if (!gen) return dex
  const respell = (m: string) => getMoveNameForGen(m, gen)
  const out: Record<string, PokemonData> = {}
  for (const [name, data] of Object.entries(dex)) {
    const entry: PokemonData = { ...data }
    if (data.level_up_learnset) entry.level_up_learnset = data.level_up_learnset.map(([lv, m]) => [lv, respell(m)])
    for (const field of _LEARNSET_LIST_FIELDS) {
      const list = data[field]
      if (Array.isArray(list)) (entry[field] as string[]) = list.map(respell)
    }
    out[name] = entry
  }
  return out
}

// ── Loading ───────────────────────────────────────────────────────────────────
//
// Each per-game table is its own build chunk (one `import()` each, turned into
// `JSON.parse(...)` by scripts/vite-plugin-solodex-data.ts). Nothing is loaded
// at import time: main.tsx loads the first game before the first render, then
// `preloadAllData()` streams in the rest.

type RawDex = Record<string, PokemonData>
interface LoadedDex { dex: RawDex; transfer?: Record<string, { transfer_learnset?: string[] }> }

const dexOnly = (p: Promise<{ pokedex: unknown }>): Promise<LoadedDex> =>
  p.then(m => ({ dex: m.pokedex as RawDex }))
// pokedex.js has no transfer_learnset for gen 1; the per-game files do
const withTransfer = (dexP: Promise<{ pokedex: unknown }>, transferP: Promise<{ pokedex: unknown }>): Promise<LoadedDex> =>
  Promise.all([dexP, transferP]).then(([m, t]) => ({ dex: m.pokedex as RawDex, transfer: t.pokedex as LoadedDex['transfer'] }))

// Must list the same games and files as POKEDEX_SOURCES in games.ts (the
// import specifiers have to be literal for Vite to split them into chunks).
const POKEDEX_LOADERS: Record<string, () => Promise<LoadedDex>> = {
  'Red and Blue':                  () => withTransfer(import('@data/pokedex.js?game=Red%20and%20Blue'), import('@data/pokedex/red_blue')),
  'Yellow':                        () => withTransfer(import('@data/pokedex.js?game=Yellow'), import('@data/pokedex/yellow')),
  'Gold and Silver':               () => dexOnly(import('@data/pokedex.js?game=Gold%20and%20Silver')),
  'Crystal':                       () => dexOnly(import('@data/pokedex.js?game=Crystal')),
  'Ruby and Sapphire':             () => dexOnly(import('@data/pokedex.js?game=Ruby%20and%20Sapphire')),
  'Emerald':                       () => dexOnly(import('@data/pokedex.js?game=Emerald')),
  'FireRed and LeafGreen':         () => dexOnly(import('@data/pokedex.js?game=FireRed%20and%20LeafGreen')),
  'Diamond and Pearl':             () => dexOnly(import('@data/pokedex.js?game=Diamond%20and%20Pearl')),
  'Platinum':                      () => dexOnly(import('@data/pokedex.js?game=Platinum')),
  'HeartGold and SoulSilver':      () => dexOnly(import('@data/pokedex.js?game=HeartGold%20and%20SoulSilver')),
  'Black':                         () => dexOnly(import('@data/pokedex/black_white')),
  'Black 2 and White 2':           () => dexOnly(import('@data/pokedex/black2_white2')),
  'X and Y':                       () => dexOnly(import('@data/pokedex/x_y')),
  'Omega Ruby and Alpha Sapphire': () => dexOnly(import('@data/pokedex/omega_ruby_alpha_sapphire')),
  'Sun and Moon':                  () => dexOnly(import('@data/pokedex/sun_moon')),
  'Ultra Sun and Ultra Moon':      () => dexOnly(import('@data/pokedex/ultra_sun_ultra_moon')),
  'Sword and Shield':              () => dexOnly(import('@data/pokedex/sword_shield')),
  'Brilliant Diamond and Shining Pearl': () => dexOnly(import('@data/pokedex/brilliant_diamond_shining_pearl')),
  'Legends Arceus':                () => dexOnly(import('@data/pokedex/legends_arceus')),
  'Scarlet and Violet':            () => dexOnly(import('@data/pokedex/scarlet_violet')),
  'Legends Z-A':                   () => dexOnly(import('@data/pokedex/legends_za')),
}
for (const game of GAMES) {
  if (!(game in POKEDEX_LOADERS)) throw new Error(`[Solodex] no pokedex loader for ${game}`)
}

type RawTrainers = Record<string, unknown>
const trainersOf = (p: Promise<{ trainers: unknown }>): Promise<RawTrainers> => p.then(m => m.trainers as RawTrainers)

const TRAINER_LOADERS: Record<string, () => Promise<RawTrainers>> = {
  'Red and Blue':             () => trainersOf(import('@data/trainers/red_blue')),
  'Yellow':                   () => trainersOf(import('@data/trainers/yellow')),
  'Gold and Silver':          () => trainersOf(import('@data/trainers/gold_silver')),
  'Crystal':                  () => trainersOf(import('@data/trainers/crystal')),
  'Ruby and Sapphire':        () => Promise.all([trainersOf(import('@data/trainers/ruby')), trainersOf(import('@data/trainers/sapphire'))])
                                      .then(([ruby, sapphire]) => ({ ...ruby, ...sapphire })),
  'Emerald':                  () => trainersOf(import('@data/trainers/emerald')),
  'FireRed and LeafGreen':    () => trainersOf(import('@data/trainers/firered_leafgreen')),
  'Diamond and Pearl':        () => trainersOf(import('@data/trainers/diamond_pearl')),
  'Platinum':                 () => trainersOf(import('@data/trainers/platinum')),
  'HeartGold and SoulSilver': () => trainersOf(import('@data/trainers/heartgold_soulsilver')),
  'Black':                    () => trainersOf(import('@data/trainers/black_white')),
  'Black 2 and White 2':      () => trainersOf(import('@data/trainers/black2_white2')),
}

export const GAMES_WITH_TRAINERS: string[] = GAMES.filter(g => g in TRAINER_LOADERS)

const encountersOf = (p: Promise<{ encounters_by_pokemon: unknown }>): Promise<EncounterTable> =>
  p.then(m => m.encounters_by_pokemon as EncounterTable)

const ENCOUNTER_LOADERS: Record<string, () => Promise<EncounterTable>> = {
  'Red and Blue':                  () => encountersOf(import('@data/encounters/red_blue_by_pokemon')),
  'Yellow':                        () => encountersOf(import('@data/encounters/yellow_by_pokemon')),
  'Gold and Silver':               () => encountersOf(import('@data/encounters/gold_silver_by_pokemon')),
  'Crystal':                       () => encountersOf(import('@data/encounters/crystal_by_pokemon')),
  'Ruby and Sapphire':             () => encountersOf(import('@data/encounters/ruby_sapphire_by_pokemon')),
  'Emerald':                       () => encountersOf(import('@data/encounters/emerald_by_pokemon')),
  'FireRed and LeafGreen':         () => encountersOf(import('@data/encounters/firered_leafgreen_by_pokemon')),
  'Diamond and Pearl':             () => encountersOf(import('@data/encounters/diamond_pearl_by_pokemon')),
  'Platinum':                      () => encountersOf(import('@data/encounters/platinum_by_pokemon')),
  'HeartGold and SoulSilver':      () => encountersOf(import('@data/encounters/heartgold_soulsilver_by_pokemon')),
  'Black':                         () => encountersOf(import('@data/encounters/black_white_by_pokemon')),
  'Black 2 and White 2':           () => encountersOf(import('@data/encounters/black2_white2_by_pokemon')),
  'X and Y':                       () => encountersOf(import('@data/encounters/x_y_by_pokemon')),
  'Omega Ruby and Alpha Sapphire': () => encountersOf(import('@data/encounters/omega_ruby_alpha_sapphire_by_pokemon')),
  'Sun and Moon':                  () => encountersOf(import('@data/encounters/sun_moon_by_pokemon')),
  'Ultra Sun and Ultra Moon':      () => encountersOf(import('@data/encounters/ultra_sun_ultra_moon_by_pokemon')),
}

// Loaded tables. Entries are added once and never replaced, so anything
// derived from them (rankings, mega index, per-game species lists) can be cached.
const _dex: Record<string, Record<string, PokemonData>> = {}
const _trainers: Record<string, Trainer[]> = {}
const _encounters: Record<string, EncounterTable> = {}

const _listeners = new Set<() => void>()
const _inFlight = new Map<string, Promise<void>>()

/** Notified whenever a table finishes loading (for useSyncExternalStore). */
export function subscribeData(listener: () => void): () => void {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

function runOnce(key: string, run: () => Promise<void>): Promise<void> {
  const existing = _inFlight.get(key)
  if (existing) return existing
  const promise = run().finally(() => {
    _inFlight.delete(key)
    for (const listener of [..._listeners]) listener()
  })
  _inFlight.set(key, promise)
  return promise
}

function mergeTransferLearnsets(dex: RawDex, transfer: NonNullable<LoadedDex['transfer']>): RawDex {
  const out: RawDex = { ...dex }
  for (const [name, entry] of Object.entries(transfer)) {
    const canonical = SPECIES_ALIASES[name] ?? name
    if (out[canonical] && entry.transfer_learnset) {
      out[canonical] = { ...out[canonical], transfer_learnset: entry.transfer_learnset }
    }
  }
  return out
}

export type DataKind = 'pokedex' | 'trainers' | 'encounters'

export function isGameLoaded(game: string): boolean { return game in _dex }
/** True when the game's trainers are in memory, or it has none. */
export function areTrainersLoaded(game: string): boolean { return !(game in TRAINER_LOADERS) || game in _trainers }
export function areEncountersLoaded(game: string): boolean { return !(game in ENCOUNTER_LOADERS) || game in _encounters }

export function isDataReady(game: string, kinds: readonly DataKind[]): boolean {
  return kinds.every(kind =>
    kind === 'pokedex' ? (isGameLoaded(game) || !(game in POKEDEX_LOADERS))
    : kind === 'trainers' ? areTrainersLoaded(game)
    : areEncountersLoaded(game))
}

/** Load a game's Pokedex (normalised and respelled for that game). Resolves at once if already loaded. */
export function loadGame(game: string): Promise<void> {
  if (_dex[game]) return Promise.resolve()
  const loader = POKEDEX_LOADERS[game]
  if (!loader) return Promise.resolve()
  return runOnce(`pokedex:${game}`, async () => {
    const { dex, transfer } = await loader()
    let normalized = normalizePokedex(dex)
    if (transfer) normalized = mergeTransferLearnsets(normalized, transfer)
    _dex[game] = respellLearnsets(normalized, game)
  })
}

export function loadTrainers(game: string): Promise<void> {
  if (_trainers[game]) return Promise.resolve()
  const loader = TRAINER_LOADERS[game]
  if (!loader) return Promise.resolve()
  return runOnce(`trainers:${game}`, async () => {
    const raw = await loader()
    const trainers: Trainer[] = []
    for (const [id, data] of Object.entries(raw)) {
      const t = normalizeTrainer(id, data as Record<string, unknown>)
      // Skip empty parties and placeholder entries
      if (t.party.length === 0) continue
      trainers.push(t)
    }
    _trainers[game] = trainers
  })
}

export function loadEncounters(game: string): Promise<void> {
  if (_encounters[game]) return Promise.resolve()
  const loader = ENCOUNTER_LOADERS[game]
  if (!loader) return Promise.resolve()
  return runOnce(`encounters:${game}`, async () => { _encounters[game] = await loader() })
}

export function ensureData(game: string, kinds: readonly DataKind[]): Promise<void> {
  return Promise.all(kinds.map(kind =>
    kind === 'pokedex' ? loadGame(game) : kind === 'trainers' ? loadTrainers(game) : loadEncounters(game)
  )).then(() => undefined)
}

let _preload: Promise<void> | null = null

/**
 * Load every remaining table, one at a time with a yield between each so the
 * UI stays responsive (each chunk is a 5-40 ms JSON.parse on the main thread).
 */
export function preloadAllData(): Promise<void> {
  if (_preload) return _preload
  _preload = (async () => {
    const steps: (() => Promise<void>)[] = [
      ...GAMES.map(g => () => loadGame(g)),
      ...GAMES_WITH_TRAINERS.map(g => () => loadTrainers(g)),
      ...GAMES.filter(g => g in ENCOUNTER_LOADERS).map(g => () => loadEncounters(g)),
    ]
    for (const step of steps) {
      try {
        await step()
      } catch (err) {
        console.error('[Solodex] background data load failed:', err)
      }
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  })()
  return _preload
}

/** A game's Pokedex table, or undefined until `loadGame(game)` has completed. */
function getGamePokedexData(game: string): Record<string, PokemonData> | undefined {
  return _dex[game]
}

/** Cheap per-game typing lookup (no evolution-family work). Null until the game has loaded. */
export function getPokemonTypes(name: string, game: string): { type_1: string; type_2: string } | null {
  const raw = _dex[game]?.[name]
  return raw ? { type_1: raw.type_1, type_2: raw.type_2 } : null
}

// ── Species index (built at build time from every game) ──────────────────────

const _gamesBySpecies = new Map<string, string[]>(speciesIndex.map(entry => [entry.name, entry.games]))

/** Sorted, deduplicated list of all Pokemon across all games. Available before any game has loaded. */
export function getAllPokemon(): PokemonListEntry[] {
  return speciesIndex
}

// Mega/Primal/(Mega Z) forms in a game's pokedex keyed by the species they
// belong to, built once per loaded game (replaces an O(species²) scan per
// lookup). A "Mega X ..." key is filed under every word-prefix of X so that
// "Mega Charizard X" and "Mega Magearna Original" both belong to their base.
const _megaIndex = new WeakMap<Record<string, PokemonData>, Map<string, string[]>>()
function megaFormsByBase(gameData: Record<string, PokemonData>): Map<string, string[]> {
  let index = _megaIndex.get(gameData)
  if (!index) {
    index = new Map()
    for (const key of Object.keys(gameData)) {
      if (!isMegaForm(key)) continue
      let bases: string[]
      if (key.startsWith('Mega ')) {
        const words = key.slice('Mega '.length).split(' ')
        bases = words.map((_, i) => words.slice(0, i + 1).join(' '))
      } else if (key.startsWith('Primal ')) {
        bases = [key.slice('Primal '.length)]
      } else if (key.endsWith(' (Mega Z)')) {
        bases = [key.slice(0, -' (Mega Z)'.length)]
      } else {
        continue
      }
      for (const base of bases) {
        const list = index.get(base)
        if (list) list.push(key)
        else index.set(base, [key])
      }
    }
    _megaIndex.set(gameData, index)
  }
  return index
}

// Species that exclusively evolve from a regional form (no base-form equivalent)
// `prefix`: regional lineage this species belongs to
// `replaces`: base-form siblings from the other branch to exclude
const REGIONAL_EVO_LINEAGE: Record<string, { prefix: string; replaces: string[] }> = {
  "Sirfetch'd": { prefix: 'Galarian', replaces: [] },
  'Perrserker':      { prefix: 'Galarian', replaces: ['Persian'] },
  'Obstagoon':       { prefix: 'Galarian', replaces: [] },
  'Mr. Rime':        { prefix: 'Galarian', replaces: [] },
  'Cursola':         { prefix: 'Galarian', replaces: [] },
  'Runerigus':       { prefix: 'Galarian', replaces: ['Cofagrigus'] },
  'Sneasler':        { prefix: 'Hisuian', replaces: ['Weavile'] },
  'Overqwil':        { prefix: 'Hisuian', replaces: [] },
  'Clodsire':        { prefix: 'Paldean', replaces: ['Quagsire'] },
}

// Build reverse lookup: base-form species that are replaced by a regional-exclusive evo within a given prefix
const REGIONAL_REPLACED: Set<string> = new Set()
for (const [, { prefix, replaces }] of Object.entries(REGIONAL_EVO_LINEAGE)) {
  for (const r of replaces) {
    REGIONAL_REPLACED.add(`${prefix}:${r}`)
  }
}

function remapFamilyToRegional(family: EvolutionEntry[], prefix: string, gameData: Record<string, PokemonData>): EvolutionEntry[] {
  return family.map(evo => {
    const regionalName = `${prefix} ${evo.species}`
    if (gameData?.[regionalName]) {
      return { ...evo, species: regionalName }
    }
    return evo
  })
}

export function getPokemonData(name: string, game: string): PokemonData | null {
  const gameData = getGamePokedexData(game)
  const raw = gameData?.[name]
  if (!raw) return null

  let family = raw.evolution_family
  if (family) {
    const form = classifyForm(name)
    if (form.isRegional) {
      // For regional forms, remap evolution_family to use regional species names where they exist
      const prefix = form.region as string
      family = remapFamilyToRegional(family, prefix, gameData)
      // Remove entries from other branches:
      // - regional-exclusive evos belonging to a different prefix (e.g. Perrserker from Alolan Meowth)
      // - base-form evos that weren't remapped but have a regional counterpart (e.g. Persian from Galarian Meowth)
      // - base-form siblings replaced by a regional-exclusive evo (e.g. Cofagrigus from Galarian Yamask)
      family = family.filter(evo => {
        const evoLineage = REGIONAL_EVO_LINEAGE[evo.species]
        if (evoLineage && evoLineage.prefix !== prefix) return false
        if (!evo.species.startsWith(prefix + ' ') && gameData?.[`${prefix} ${evo.species}`]) return false
        if (REGIONAL_REPLACED.has(`${prefix}:${evo.species}`)) return false
        return true
      })
    } else if (REGIONAL_EVO_LINEAGE[name]) {
      // For species that exclusively evolve from a regional form (e.g. Sirfetch'd)
      const { prefix, replaces } = REGIONAL_EVO_LINEAGE[name]
      const replacedSet = new Set(replaces)
      family = remapFamilyToRegional(family, prefix, gameData)
      // Remove base-form siblings from the other branch (e.g. Persian from Perrserker's family)
      family = family.filter(evo =>
        evo.species === name ||
        evo.species.startsWith(prefix + ' ') ||
        (!gameData?.[`${prefix} ${evo.species}`] && !replacedSet.has(evo.species))
      )
    } else {
      // For base-form Pokemon, remove regional-exclusive evolutions that don't belong
      // (e.g. base Linoone shouldn't show Obstagoon, only Galarian Linoone evolves into it)
      const regionalExclusiveNames = new Set(Object.keys(REGIONAL_EVO_LINEAGE))
      family = family.filter(evo => !regionalExclusiveNames.has(evo.species) || evo.species === name)
    }
  }

  // Fill in null evolution methods by cross-referencing other family members' data
  if (family && family.length > 1) {
    family = family.map(evo => {
      if (evo.method !== null) return evo
      // Check what the first-stage member's entry says about this species
      const baseSpecies = family.find(e => e.method === null && e !== evo)?.species ?? family[0].species
      const baseData = gameData?.[baseSpecies]
      if (baseData?.evolution_family) {
        const match = baseData.evolution_family.find(e => e.species === evo.species && e.method !== null)
        if (match) return { ...evo, method: match.method, parameter: match.parameter }
      }
      // Fallback: check each family member's data
      for (const other of family) {
        if (other.species === evo.species) continue
        const otherData = gameData?.[other.species]
        if (!otherData?.evolution_family) continue
        const match = otherData.evolution_family.find(e => e.species === evo.species && e.method !== null)
        if (match) return { ...evo, method: match.method, parameter: match.parameter }
      }
      return evo
    })
  }

  // Append Mega/Primal forms that exist in this game's pokedex but aren't in the family
  if (family && gameData) {
    const familyNames = new Set(family.map(e => e.species))
    const megaEntries: EvolutionEntry[] = []
    const megaIndex = megaFormsByBase(gameData)
    for (const memberName of familyNames) {
      // Skip if the member itself is already a Mega/Primal — don't look for megas of megas
      if (isMegaForm(memberName)) continue
      // "Mega X", "Mega X Y", "Mega X Z", "X (Mega Z)", "Primal X"
      for (const key of megaIndex.get(memberName) ?? []) {
        if (!familyNames.has(key)) megaEntries.push({ species: key, method: 'mega', parameter: null })
      }
    }
    if (megaEntries.length > 0) {
      family = [...family, ...megaEntries]
    }
  }

  const transferLearnset = GAME_TO_GEN[game] === '1' ? (raw.transfer_learnset ?? []) : []
  return { ...raw, transfer_learnset: transferLearnset, abilities: [...raw.abilities], evolution_family: family }
}

/** Games (in GAMES order) whose Pokedex contains the species. From the build-time index, so always available. */
export function getGamesForPokemon(name: string): string[] {
  const games = _gamesBySpecies.get(name)
  return games ? [...games] : []
}

// Cached per game (the tables never change once loaded). Callers must not mutate the result.
const _allForGame: Record<string, PokemonData[]> = {}

/** All Pokemon available in a given game, sorted by national dex number. Empty until the game has loaded. */
export function getAllPokemonForGame(game: string): PokemonData[] {
  const cached = _allForGame[game]
  if (cached) return cached
  const gameData = getGamePokedexData(game)
  if (!gameData) return []
  const list = Object.keys(gameData)
    .map((name) => getPokemonData(name, game))
    .filter((p): p is PokemonData => p != null)
    .sort((a, b) => a.national_dex_number - b.national_dex_number)
  _allForGame[game] = list
  return list
}

export interface TypeMatchups {
  superEffVs: string[]
  notEffVs:   string[]
  noEffVs:    string[]
  weakTo:     string[]
  resists:    string[]
  immuneTo:   string[]
}

/** All types that exist in the type chart for a given game's generation. */
// Types that didn't exist yet in a given gen
const TYPES_INTRODUCED: Record<string, number> = {
  'Dark': 2,
  'Steel': 2,
  'Fairy': 6,
}

/** All types that exist in a given game's generation. */
export function getTypesForGame(game: string): string[] {
  const gen = parseInt(GAME_TO_GEN[game] ?? '4', 10)
  const chart = effectivenessData[String(gen)] ?? effectivenessData['4']
  return Object.keys(chart).filter(t => {
    const intro = TYPES_INTRODUCED[t]
    return !intro || gen >= intro
  })
}

/** Offensive multiplier of attackType vs a single defending type in this game's gen. */
export function getOffensiveMultiplier(attackType: string, defType: string, game: string): number {
  const gen = GAME_TO_GEN[game] ?? '4'
  const chart = effectivenessData[gen] ?? effectivenessData['4']
  return chart[attackType]?.[defType] ?? 1
}

export function getTypeMatchups(type: string, game?: string): TypeMatchups {
  const gen = game ? (GAME_TO_GEN[game] ?? '4') : '4'
  const chart = effectivenessData[gen] ?? effectivenessData['4']
  const validTypes = typesForGen(gen)
  const offensive = chart[type] ?? {}

  const superEffVs = Object.entries(offensive).filter(([t, v]) => v === 2 && (!validTypes || validTypes.has(t))).map(([t]) => t)
  const notEffVs   = Object.entries(offensive).filter(([t, v]) => v === 0.5 && (!validTypes || validTypes.has(t))).map(([t]) => t)
  const noEffVs    = Object.entries(offensive).filter(([t, v]) => v === 0 && (!validTypes || validTypes.has(t))).map(([t]) => t)

  const weakTo:   string[] = []
  const resists:  string[] = []
  const immuneTo: string[] = []
  for (const [atkType, matchups] of Object.entries(chart)) {
    if (validTypes && !validTypes.has(atkType)) continue
    const v = matchups[type]
    if (v === 2)        weakTo.push(atkType)
    else if (v === 0.5) resists.push(atkType)
    else if (v === 0)   immuneTo.push(atkType)
  }

  return { superEffVs, notEffVs, noEffVs, weakTo, resists, immuneTo }
}

// Reverse lookup: gen → moveName → TM/HM code
const tmhmByGen: Record<string, Record<string, string>> = {}
for (const [gen, entries] of Object.entries(rawTmhm as Record<string, Record<string, string>>)) {
  tmhmByGen[gen] = {}
  for (const [code, moveName] of Object.entries(entries)) {
    tmhmByGen[gen][moveName] = code
  }
}
// XY TM94 is Rock Smash, but Secret Power also appears in XY learnsets as TM94 (shared with ORAS)
tmhmByGen['6xy']['Secret Power'] = 'TM94'

// HGSS has Whirlpool as HM05 instead of Defog
tmhmByGen['4hgss'] = { ...tmhmByGen['4'] }
delete tmhmByGen['4hgss']['Defog']
tmhmByGen['4hgss']['Whirlpool'] = 'HM05'

const GAME_TO_TMHM_KEY: Record<string, string> = {
  'X and Y': '6xy',
  'HeartGold and SoulSilver': '4hgss',
  'Legends Z-A': '9za',
  'Brilliant Diamond and Shining Pearl': '8bdsp',
}

export function getTmHmCode(moveName: string, game: string): string | null {
  const key = GAME_TO_TMHM_KEY[game] ?? GAME_TO_GEN[game]
  const table = tmhmByGen[key]
  if (!table) return null
  return table[moveName] ?? table[MOVE_NAME_ALIASES[moveName] ?? ''] ?? null
}

// Combined defensive multipliers for a dual-type pokemon against every attacking type
export interface StatRankEntry {
  name: string
  dex: number
  value: number
  rank: number
}

function buildRanking(entries: { name: string; dex: number; value: number }[]): StatRankEntry[] {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const result: StatRankEntry[] = []
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].value < sorted[i - 1].value) rank = i + 1
    result.push({ ...sorted[i], rank })
  }
  return result
}

export function getPokemonStatRanking(statKey: keyof PokemonData['base_stats'], game: string, nameFilter?: Set<string>): StatRankEntry[] {
  const gameData = getGamePokedexData(game)
  if (!gameData) return []

  const entries = Object.entries(gameData)
    .filter(([name]) => !nameFilter || nameFilter.has(name))
    .map(([name, data]) => ({ name, dex: data.national_dex_number, value: data.base_stats[statKey] ?? 0 }))

  return buildRanking(entries)
}

export type BulkKind = 'physical' | 'special'

export function getPokemonBulkRanking(kind: BulkKind, game: string, nameFilter?: Set<string>): StatRankEntry[] {
  const gameData = getGamePokedexData(game)
  if (!gameData) return []

  const isGen1 = GAME_TO_GEN[game] === '1'

  const entries = Object.entries(gameData)
    .filter(([name]) => !nameFilter || nameFilter.has(name))
    .map(([name, data]) => {
      const s = data.base_stats
      const specialStat = isGen1 ? s.special_attack : s.special_defense
      const value = kind === 'physical' ? s.hp * s.defense : s.hp * specialStat
      return { name, dex: data.national_dex_number, value }
    })

  return buildRanking(entries)
}

export function getPokemonTotalRanking(game: string, nameFilter?: Set<string>): StatRankEntry[] {
  const gameData = getGamePokedexData(game)
  if (!gameData) return []

  const isGen1 = GAME_TO_GEN[game] === '1'

  const entries = Object.entries(gameData)
    .filter(([name]) => !nameFilter || nameFilter.has(name))
    .map(([name, data]) => {
      const s = data.base_stats
      const value = isGen1
        ? s.hp + s.attack + s.defense + s.special_attack + s.speed
        : Object.values(s).reduce((sum, v) => sum + v, 0)
      return { name, dex: data.national_dex_number, value }
    })

  return buildRanking(entries)
}

// Weighted Base Stat Total (Gen 1 only): BST with Special counted twice, since the
// single Special stat is used both offensively and defensively in Gen 1.
// WBST = hp + attack + defense + speed + special + special
export function getPokemonWbstRanking(game: string, nameFilter?: Set<string>): StatRankEntry[] {
  const gameData = getGamePokedexData(game)
  if (!gameData) return []

  const entries = Object.entries(gameData)
    .filter(([name]) => !nameFilter || nameFilter.has(name))
    .map(([name, data]) => {
      const value = data.base_stats.hp + data.base_stats.attack + data.base_stats.defense + data.base_stats.speed + data.base_stats.special_attack * 2
      return { name, dex: data.national_dex_number, value }
    })

  return buildRanking(entries)
}

// Useful Base Stat Total (Gen 1 only): WBST minus the offensive stat for any
// damage category the species can't actually use. Attack is dropped entirely if
// the species learns no physical damaging move (by level-up or TM/HM); one copy of
// Special is dropped if it learns no special damaging move (the other copy stays,
// since Special doubles as the special-defense stat in Gen 1).
function computeUbst(data: PokemonData, game: string): number {
  const s = data.base_stats
  let value = s.hp + s.attack + s.defense + s.speed + s.special_attack * 2
  let hasPhysical = false
  let hasSpecial = false
  const moveNames = new Set<string>()
  for (const [, move] of data.level_up_learnset) moveNames.add(move)
  for (const move of data.tm_hm_learnset) moveNames.add(move)
  for (const move of moveNames) {
    const md = getMoveData(move, game)
    if (!md || md.power == null || md.power <= 0) continue
    if (md.category === 'Physical') hasPhysical = true
    else if (md.category === 'Special') hasSpecial = true
    if (hasPhysical && hasSpecial) break
  }
  if (!hasPhysical) value -= s.attack
  if (!hasSpecial) value -= s.special_attack
  return value
}

export function getPokemonUbst(name: string, game: string): number | null {
  const data = getGamePokedexData(game)?.[name]
  if (!data) return null
  return computeUbst(data, game)
}

export function getPokemonUbstRanking(game: string, nameFilter?: Set<string>): StatRankEntry[] {
  const gameData = getGamePokedexData(game)
  if (!gameData) return []

  const entries = Object.entries(gameData)
    .filter(([name]) => !nameFilter || nameFilter.has(name))
    .map(([name, data]) => ({ name, dex: data.national_dex_number, value: computeUbst(data, game) }))

  return buildRanking(entries)
}

export function getPokemonDefenseMatchups(type1: string, type2: string, game: string): Record<string, number> {
  const gen = GAME_TO_GEN[game] ?? '4'
  const chart = effectivenessData[gen] ?? effectivenessData['4']
  const validTypes = typesForGen(gen)
  const result: Record<string, number> = {}
  for (const [atkType, matchups] of Object.entries(chart)) {
    if (validTypes && !validTypes.has(atkType)) continue
    const v1 = (matchups[type1] as number) ?? 1
    const v2 = type1 !== type2 ? ((matchups[type2] as number) ?? 1) : 1
    result[atkType] = v1 * v2
  }
  return result
}

/**
 * Per-game move overrides. `moves.js` is keyed by generation, but a few moves
 * changed within a generation between paired games. Applied on top of the
 * generation record by `getMoveData`.
 */
const MOVE_GAME_OVERRIDES: Record<string, Record<string, Partial<MoveData>>> = {
  // Hypnosis was 70% accurate in Diamond/Pearl; Platinum and HGSS lowered it to 60%.
  'Diamond and Pearl': { Hypnosis: { accuracy: 70 } },
}

export function getMoveData(moveName: string, game: string): MoveData | null {
  const base = getGenMoveData(moveName, game)
  if (!base) return null
  const override = MOVE_GAME_OVERRIDES[game]?.[base.move] ?? MOVE_GAME_OVERRIDES[game]?.[moveName]
  return override ? { ...base, ...override } : base
}

function getGenMoveData(moveName: string, game: string): MoveData | null {
  const gen = parseInt(GAME_TO_GEN[game] ?? '0')
  if (!gen) return null

  const genKeys = Object.keys(movesData).map(Number).filter(Number.isFinite)
  if (genKeys.length === 0) return null
  const maxGen = Math.max(...genKeys)
  const alias = MOVE_NAME_ALIASES[moveName]

  // Walk backward first (prefer data from the same or earlier gen)
  for (let g = gen; g >= 1; g--) {
    const genData = movesData[String(g)]
    const found = genData?.[moveName] ?? (alias ? genData?.[alias] : undefined)
    if (found) return found
  }
  // Fall forward — handles moves introduced in a gen whose data was only
  // documented in a later gen's file (e.g. gen 5 moves only appear in gen 6+)
  for (let g = gen + 1; g <= maxGen; g++) {
    const genData = movesData[String(g)]
    const found = genData?.[moveName] ?? (alias ? genData?.[alias] : undefined)
    if (found) return found
  }
  return null
}

let _allMoveNames: string[] | null = null
export function getAllMoveNames(): string[] {
  if (!_allMoveNames) {
    const names = new Set<string>()
    for (const genData of Object.values(movesData)) {
      for (const name of Object.keys(genData)) {
        names.add(name)
      }
    }
    _allMoveNames = [...names].sort((a, b) => a.localeCompare(b))
  }
  return _allMoveNames
}

export function getMoveAcrossGens(moveName: string): { gen: string; data: MoveData }[] {
  const alias = MOVE_NAME_ALIASES[moveName]
  const genKeys = Object.keys(movesData).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  const results: { gen: string; data: MoveData }[] = []
  for (const g of genKeys) {
    const genData = movesData[String(g)]
    const found = genData?.[moveName] ?? (alias ? genData?.[alias] : undefined)
    if (found) results.push({ gen: String(g), data: found })
  }
  return results
}

// ── Trainer Data ──────────────────────────────────────────────────────────────

// Build nature index → name lookup from natures data
const naturesData = rawNatures as Record<string, { nature: string; index: number; increased: string | null; decreased: string | null }>
const NATURE_BY_INDEX: Record<number, string> = {}
for (const [name, data] of Object.entries(naturesData)) {
  NATURE_BY_INDEX[data.index] = name
}

export function getNatureInfo(nature: string): { increased: string | null; decreased: string | null } | null {
  const data = naturesData[nature]
  if (!data) return null
  return { increased: data.increased, decreased: data.decreased }
}

function normalizeTrainer(id: string, raw: Record<string, unknown>): Trainer {
  const party = (raw.party as Record<string, unknown>[]) ?? []
  return {
    id,
    rom_id: raw.rom_id as string | number,
    name: raw.name as string,
    trainer_class: raw.trainer_class as string,
    location: (raw.location as string) ?? null,
    money: (raw.money as number) ?? 0,
    is_double_battle: (raw.is_double_battle as boolean) ?? false,
    items: (raw.items as string[]) ?? [],
    party: party.map(p => {
      const natureRaw = p.nature
      let nature: string | null = null
      if (typeof natureRaw === 'string') {
        nature = natureRaw
      } else if (typeof natureRaw === 'number') {
        nature = NATURE_BY_INDEX[natureRaw] ?? null
      }

      const stats = p.stats as Record<string, number> | undefined
      return {
        species: p.species as string,
        level: p.level as number,
        experience_yield: (p.experience_yield as number) ?? 0,
        nature,
        ability: (p.ability as string) ?? null,
        held_item: (p.held_item as string) ?? null,
        stats: {
          hp: stats?.hp ?? 0,
          attack: stats?.attack ?? 0,
          defense: stats?.defense ?? 0,
          speed: stats?.speed ?? 0,
          special_attack: stats?.special_attack ?? 0,
          special_defense: stats?.special_defense ?? 0,
        },
        moves: ((p.moves as (string | null)[]) ?? []).filter((m): m is string => m !== null),
      }
    }),
  }
}

/** Normalized trainers for a game; empty until `loadTrainers(game)` has completed. */
export function getTrainers(game: string): Trainer[] {
  return _trainers[game] ?? []
}

export function getTrainerList(game: string): TrainerListEntry[] {
  return getTrainers(game).map(t => ({
    id: t.id,
    rom_id: t.rom_id,
    name: t.name,
    trainer_class: t.trainer_class,
    location: t.location,
    partySize: t.party.length,
    maxLevel: Math.max(...t.party.map(p => p.level)),
    party: t.party.map(p => ({ species: p.species, level: p.level })),
  }))
}

export function getTrainer(game: string, id: string): Trainer | null {
  return getTrainers(game).find(t => t.id === id) ?? null
}

export function getTrainerClasses(game: string): string[] {
  const classes = new Set(getTrainers(game).map(t => t.trainer_class))
  return Array.from(classes).sort()
}

export function getTrainerLocations(game: string): string[] {
  const locations = new Set(getTrainers(game).filter(t => t.location).map(t => t.location!))
  return Array.from(locations).sort()
}

// ── Trainer Groups ─────────────────────────────────────────────────────────────

export interface TrainerGroup {
  name: string       // Display name in the list
  trainerIds: string[]  // Ordered trainer IDs in the group
}

// Manual groups for distinct trainers that should be shown as one entry
const MANUAL_GROUPS: Record<string, TrainerGroup[]> = {
  'Black': [
    { name: 'Chili / Cilan / Cress', trainerIds: ['11', '12', '13'] },
  ],
}

// Major-battle detection (shared by auto-grouping + UI coloring)
const IMPORTANT_CLASSES = new Set([
  'Leader', 'Elite Four', 'Champion', 'Rival', 'Gym Leader',
  'RIVAL', 'RIVAL1', 'RIVAL2', 'RIVAL3', 'LEADER', 'ELITE FOUR', 'CHAMPION',
  'LORELEI', 'BRUNO', 'AGATHA', 'LANCE',
  // Gen 1 (Red/Blue/Yellow) stores each gym leader as their own class
  'BROCK', 'MISTY', 'LT.SURGE', 'ERIKA', 'KOGA', 'SABRINA', 'BLAINE', 'GIOVANNI',
])
const RIVAL_NAMES = new Set(['Bianca', 'N'])
const GAME_RIVAL_NAMES: Record<string, Set<string>> = {
  'Black':               new Set(['Cheren']),
  'Black 2 and White 2': new Set(['Hugh']),
}
// Named bosses that aren't detected by class alone
const BOSS_NAMES = new Set(['Ghetsis'])

// Strip group-level suffix like " (Lv14)" to recover the base trainer name
function baseName(name: string): string {
  return name.replace(/ \(Lv\d+\)$/, '')
}

export function isRivalName(name: string, game?: string): boolean {
  const base = baseName(name)
  if (RIVAL_NAMES.has(base)) return true
  if (game && GAME_RIVAL_NAMES[game]?.has(base)) return true
  return false
}

export function isBossTrainer(name: string): boolean {
  return BOSS_NAMES.has(baseName(name))
}

export function isMajorTrainer(name: string, trainerClass: string, game?: string): boolean {
  if (IMPORTANT_CLASSES.has(trainerClass)) return true
  const base = baseName(name)
  if (base.startsWith('Leader ') || base.startsWith('Elite Four ') || base.startsWith('Champion ')) return true
  if (BOSS_NAMES.has(base)) return true
  if (trainerClass === 'Rival' || trainerClass === 'RIVAL' ||
      trainerClass === 'RIVAL1' || trainerClass === 'RIVAL2' || trainerClass === 'RIVAL3' ||
      base.includes('Rival') || isRivalName(base, game)) return true
  return false
}

// Auto-group major trainers: ≤3 same-name → single group, >3 → cluster by level
const LEVEL_GAP_THRESHOLD = 1

function autoGroupTrainers(game: string): TrainerGroup[] {
  const trainers = getTrainers(game)

  // Collect IDs already in manual groups
  const manualIds = new Set<string>()
  for (const g of MANUAL_GROUPS[game] ?? []) {
    for (const id of g.trainerIds) manualIds.add(id)
  }

  // Bucket major trainers by name (skip manually grouped ones)
  // For rivals, strip trailing number suffixes (e.g. "Rival Brendan 4" → "Rival Brendan")
  // so starter variants get bucketed together for level-based clustering
  const byName = new Map<string, Trainer[]>()
  const hasRematches = new Set<string>()  // buckets that merged rematches with originals
  for (const t of trainers) {
    if (manualIds.has(t.id)) continue
    if (!isMajorTrainer(t.name, t.trainer_class, game)) continue
    let key = t.name
    // Strip " Rematch ..." suffix so rematches group with the original
    const stripped = key.replace(/ Rematch(?: \d+)?$/, '')
    if (stripped !== key) {
      hasRematches.add(stripped)
      key = stripped
    }
    if (isRivalName(key, game) || t.trainer_class === 'Rival' || t.trainer_class === 'RIVAL' ||
        t.trainer_class === 'RIVAL1' || t.trainer_class === 'RIVAL2' || key.includes('Rival')) {
      key = key.replace(/ \d+(?: \w+)?$/, '')
    }
    const list = byName.get(key) ?? []
    list.push(t)
    byName.set(key, list)
  }

  const groups: TrainerGroup[] = []

  for (const [name, list] of byName) {
    if (list.length <= 1) continue  // nothing to group

    // Buckets with rematches or ≤3 entries: combine all into one group
    if (list.length <= 3 || hasRematches.has(name)) {
      // Sort by max level so original comes before rematches
      const sorted = [...list].sort((a, b) => {
        const aMax = Math.max(...a.party.map(p => p.level))
        const bMax = Math.max(...b.party.map(p => p.level))
        return aMax - bMax
      })
      groups.push({ name, trainerIds: sorted.map(t => t.id) })
    } else {
      // Cluster by max party level
      const sorted = [...list].sort((a, b) => {
        const aMax = Math.max(...a.party.map(p => p.level))
        const bMax = Math.max(...b.party.map(p => p.level))
        return aMax - bMax
      })

      let cluster: Trainer[] = [sorted[0]]
      let clusterMaxLevel = Math.max(...sorted[0].party.map(p => p.level))

      for (let i = 1; i < sorted.length; i++) {
        const maxLvl = Math.max(...sorted[i].party.map(p => p.level))
        if (maxLvl - clusterMaxLevel <= LEVEL_GAP_THRESHOLD) {
          cluster.push(sorted[i])
          clusterMaxLevel = maxLvl
        } else {
          const lvl = Math.max(...cluster[0].party.map(p => p.level))
          groups.push({ name: cluster.length > 1 ? `${name} (Lv${lvl})` : name, trainerIds: cluster.map(t => t.id) })
          cluster = [sorted[i]]
          clusterMaxLevel = maxLvl
        }
      }
      // Final cluster
      {
        const lvl = Math.max(...cluster[0].party.map(p => p.level))
        groups.push({ name: cluster.length > 1 ? `${name} (Lv${lvl})` : name, trainerIds: cluster.map(t => t.id) })
      }
    }
  }

  return groups
}

// Cache computed groups per game
const _groupCache: Record<string, TrainerGroup[]> = {}

function getAllGroups(game: string): TrainerGroup[] {
  if (_groupCache[game]) return _groupCache[game]
  if (!_trainers[game]) return []   // not loaded yet: don't cache an empty answer
  const manual = MANUAL_GROUPS[game] ?? []
  const auto = autoGroupTrainers(game)
  _groupCache[game] = [...manual, ...auto]
  return _groupCache[game]
}

/** Returns the group a trainer belongs to (if any) for a given game */
export function getTrainerGroup(game: string, trainerId: string): TrainerGroup | null {
  return getAllGroups(game).find(g => g.trainerIds.includes(trainerId)) ?? null
}

/** Returns all groups for a game */
export function getTrainerGroups(game: string): TrainerGroup[] {
  return getAllGroups(game)
}

/** Returns a map of trainer ID → group for all grouped trainers */
export function getGroupedTrainerIds(game: string): Map<string, TrainerGroup> {
  const map = new Map<string, TrainerGroup>()
  for (const g of getAllGroups(game)) {
    for (const id of g.trainerIds) {
      map.set(id, g)
    }
  }
  return map
}

// ── Route Planner ──────────────────────────────────────────────────────────────

export interface MajorBattle {
  id: string            // stable id (first trainer id in the group)
  name: string
  trainerIds: string[]
  maxLevel: number
  trainerClass: string  // class of the first trainer (Leader / Elite Four / etc.)
}

export type MoveSource = 'level' | 'tm' | 'tutor' | 'egg'

export interface LearnsetEntry {
  move: string
  source: MoveSource
  level?: number
  tmCode?: string
}

export interface MoveSuggestion extends LearnsetEntry {
  type: string
  multiplier: number
  power: number | null
  category: string
}

/** Returns major battles (gym leaders, elite four, champion, rivals, bosses) ordered by level. */
export function getMajorBattles(game: string): MajorBattle[] {
  const trainers = getTrainers(game)
  const groupMap = getGroupedTrainerIds(game)
  const battles: MajorBattle[] = []
  const seenGroupIds = new Set<string>()

  for (const t of trainers) {
    const group = groupMap.get(t.id)
    if (group) {
      const groupId = group.trainerIds[0]
      if (seenGroupIds.has(groupId)) continue
      // Only include groups whose members are major trainers
      const firstTrainer = trainers.find(x => x.id === group.trainerIds[0])
      if (!firstTrainer || !isMajorTrainer(firstTrainer.name, firstTrainer.trainer_class, game)) continue
      seenGroupIds.add(groupId)
      const maxLevel = Math.max(
        ...group.trainerIds.flatMap(id => trainers.find(x => x.id === id)?.party.map(p => p.level) ?? [0])
      )
      battles.push({
        id: groupId,
        name: group.name,
        trainerIds: group.trainerIds,
        maxLevel,
        trainerClass: firstTrainer.trainer_class,
      })
    } else if (isMajorTrainer(t.name, t.trainer_class, game)) {
      battles.push({
        id: t.id,
        name: t.name,
        trainerIds: [t.id],
        maxLevel: Math.max(...t.party.map(p => p.level)),
        trainerClass: t.trainer_class,
      })
    }
  }

  battles.sort((a, b) => a.maxLevel - b.maxLevel)
  return battles
}

/** Returns a runner's full learnset for a game with source tags. */
export function getRunnerLearnset(species: string, game: string): LearnsetEntry[] {
  const data = getPokemonData(species, game)
  if (!data) return []
  const out: LearnsetEntry[] = []
  for (const [level, move] of data.level_up_learnset) {
    out.push({ move, source: 'level', level })
  }
  for (const move of data.tm_hm_learnset) {
    const tmCode = getTmHmCode(move, game) ?? undefined
    out.push({ move, source: 'tm', tmCode })
  }
  for (const move of data.tutor_learnset) {
    out.push({ move, source: 'tutor' })
  }
  for (const move of data.egg_moves) {
    out.push({ move, source: 'egg' })
  }
  return out
}

const _SOURCE_PRIORITY: Record<MoveSource, number> = { level: 0, tm: 1, tutor: 2, egg: 3 }

/**
 * Returns runner moves whose type is super-effective (≥2×) against the enemy's type combo.
 * Filters out status moves (no power). One entry per (move, source) pair.
 */
export function getSuperEffectiveMoveSuggestions(
  runnerSpecies: string,
  enemySpecies: string,
  game: string
): MoveSuggestion[] {
  const enemy = getPokemonData(enemySpecies, game)
  if (!enemy) return []
  const learnset = getRunnerLearnset(runnerSpecies, game)
  const suggestions: MoveSuggestion[] = []

  for (const entry of learnset) {
    const md = getMoveData(entry.move, game)
    if (!md) continue
    if (md.category === 'Status') continue
    if (md.power == null || md.power <= 0) continue

    const m1 = getOffensiveMultiplier(md.type, enemy.type_1, game)
    const m2 = enemy.type_2 && enemy.type_2 !== enemy.type_1
      ? getOffensiveMultiplier(md.type, enemy.type_2, game)
      : 1
    const mult = m1 * m2
    if (mult < 2) continue

    suggestions.push({
      ...entry,
      type: md.type,
      multiplier: mult,
      power: md.power,
      category: md.category,
    })
  }

  suggestions.sort((a, b) => {
    if (b.multiplier !== a.multiplier) return b.multiplier - a.multiplier
    if ((b.power ?? 0) !== (a.power ?? 0)) return (b.power ?? 0) - (a.power ?? 0)
    if (_SOURCE_PRIORITY[a.source] !== _SOURCE_PRIORITY[b.source]) {
      return _SOURCE_PRIORITY[a.source] - _SOURCE_PRIORITY[b.source]
    }
    return a.move.localeCompare(b.move)
  })
  return suggestions
}
