import { pokedex as allPokedex } from '@data/pokedex'
import { pokedex_black as rawBlack } from '@data/pokedex/black'
import { pokedex as rawBw }   from '@data/pokedex/black_white'
import { pokedex as rawBw2 }  from '@data/pokedex/black2_white2'
import { pokedex as rawXy }   from '@data/pokedex/x_y'
import { pokedex as rawOras } from '@data/pokedex/omega_ruby_alpha_sapphire'
import { pokedex as rawSm }   from '@data/pokedex/sun_moon'
import { pokedex as rawUsum } from '@data/pokedex/ultra_sun_ultra_moon'
import { pokedex as rawSwsh } from '@data/pokedex/sword_shield'
import { pokedex as rawSv }   from '@data/pokedex/scarlet_violet'
import { moves as allMoves } from '@data/moves'
import { effectiveness as rawEffectiveness } from '@data/effectiveness'
import { tmhm as rawTmhm } from '@data/tmhm'
import { natures as rawNatures } from '@data/natures'
import { trainers as trainersRedBlue } from '@data/trainers/red_blue'
import { trainers as trainersYellow } from '@data/trainers/yellow'
import { trainers as trainersGoldSilver } from '@data/trainers/gold_silver'
import { trainers as trainersCrystal } from '@data/trainers/crystal'
import { trainers as trainersRuby } from '@data/trainers/ruby'
import { trainers as trainersSapphire } from '@data/trainers/sapphire'
import { trainers as trainersEmerald } from '@data/trainers/emerald'
import { trainers as trainersFireRedLeafGreen } from '@data/trainers/firered_leafgreen'
import { trainers as trainersDiamondPearl } from '@data/trainers/diamond_pearl'
import { trainers as trainersPlatinum } from '@data/trainers/platinum'
import { trainers as trainersHeartGoldSoulSilver } from '@data/trainers/heartgold_soulsilver'
import type { PokemonData, MoveData, PokemonListEntry, EvolutionStage, EvolutionEntry, Trainer, TrainerPokemon, TrainerListEntry } from '../types/pokemon'

export const GAMES = [
  'Red and Blue',
  'Yellow',
  'Gold and Silver',
  'Crystal',
  'Ruby and Sapphire',
  'Emerald',
  'FireRed and LeafGreen',
  'Diamond and Pearl',
  'Platinum',
  'HeartGold and SoulSilver',
  'Black',
  'Black 2 and White 2',
  'X and Y',
  'Omega Ruby and Alpha Sapphire',
  'Sun and Moon',
  'Ultra Sun and Ultra Moon',
  'Sword and Shield',
  'Scarlet and Violet',
] as const

export type GameName = (typeof GAMES)[number]

export const GEN_GROUPS: { label: string; games: string[]; color: string }[] = [
  { label: 'Gen 1', games: ['Red and Blue', 'Yellow'],                                                           color: '#FFB300' },
  { label: 'Gen 2', games: ['Gold and Silver', 'Crystal'],                                                       color: '#29B6F6' },
  { label: 'Gen 3', games: ['Ruby and Sapphire', 'Emerald', 'FireRed and LeafGreen'],                           color: '#2E7D32' },
  { label: 'Gen 4', games: ['Diamond and Pearl', 'Platinum', 'HeartGold and SoulSilver'],                       color: '#78909C' },
  { label: 'Gen 5', games: ['Black', 'Black 2 and White 2'],                                                    color: '#616161' },
  { label: 'Gen 6', games: ['X and Y', 'Omega Ruby and Alpha Sapphire'],                                        color: '#1565C0' },
  { label: 'Gen 7', games: ['Sun and Moon', 'Ultra Sun and Ultra Moon'],                                        color: '#F57F17' },
  { label: 'Gen 8', games: ['Sword and Shield'],                                                                color: '#880E4F' },
  { label: 'Gen 9', games: ['Scarlet and Violet'],                                                              color: '#6A1B9A' },
]

export const GAME_COLOR: Record<string, string> = {
  'Red and Blue':                  '#CC0000',
  'Yellow':                        '#FFB300',
  'Gold and Silver':               '#B8860B',
  'Crystal':                       '#29B6F6',
  'Ruby and Sapphire':             '#C62828',
  'Emerald':                       '#2E7D32',
  'FireRed and LeafGreen':         '#E64A19',
  'Diamond and Pearl':             '#5C6BC0',
  'Platinum':                      '#78909C',
  'HeartGold and SoulSilver':      '#F9A825',
  'Black':                         '#616161',
  'Black 2 and White 2':           '#78909C',
  'X and Y':                       '#1565C0',
  'Omega Ruby and Alpha Sapphire': '#BF360C',
  'Sun and Moon':                  '#F57F17',
  'Ultra Sun and Ultra Moon':      '#E65100',
  'Sword and Shield':              '#880E4F',
  'Scarlet and Violet':            '#6A1B9A',
}

export const GAME_ABBREV: Record<string, string> = {
  'Red and Blue':                  'RB',
  'Yellow':                        'Y',
  'Gold and Silver':               'GS',
  'Crystal':                       'C',
  'Ruby and Sapphire':             'RS',
  'Emerald':                       'E',
  'FireRed and LeafGreen':         'FRLG',
  'Diamond and Pearl':             'DP',
  'Platinum':                      'Pt',
  'HeartGold and SoulSilver':      'HGSS',
  'Black':                         'BW',
  'Black 2 and White 2':           'BW2',
  'X and Y':                       'XY',
  'Omega Ruby and Alpha Sapphire': 'ORAS',
  'Sun and Moon':                  'SM',
  'Ultra Sun and Ultra Moon':      'USUM',
  'Sword and Shield':              'SwSh',
  'Scarlet and Violet':            'SV',
}

export const GAME_TO_GEN: Record<string, string> = {
  'Red and Blue':                  '1',
  'Yellow':                        '1',
  'Gold and Silver':               '2',
  'Crystal':                       '2',
  'Ruby and Sapphire':             '3',
  'Emerald':                       '3',
  'FireRed and LeafGreen':         '3',
  'Diamond and Pearl':             '4',
  'Platinum':                      '4',
  'HeartGold and SoulSilver':      '4',
  'Black':                         '5',
  'Black 2 and White 2':           '5',
  'X and Y':                       '6',
  'Omega Ruby and Alpha Sapphire': '6',
  'Sun and Moon':                  '7',
  'Ultra Sun and Ultra Moon':      '7',
  'Sword and Shield':              '8',
  'Scarlet and Violet':            '9',
}

const pokedexData = allPokedex as Record<string, Record<string, PokemonData>>
const movesData = allMoves as Record<string, Record<string, MoveData>>

export function getMovesForGen(gen: string): { name: string; data: MoveData }[] {
  const data = movesData[gen]
  if (!data) return []
  return Object.entries(data)
    .map(([name, move]) => ({ name, data: move }))
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
  return _moveIntroGen[moveName] ?? null
}

/** True if the move appears in this gen's data but not in the previous gen's (so "newly introduced"). */
export function isMoveNewInGen(moveName: string, gen: string): boolean {
  const g = Number(gen)
  if (!Number.isFinite(g) || g < 1) return false
  const curr = movesData[gen]?.[moveName]
  if (!curr) return false
  if (g === 1) return true
  const prev = movesData[String(g - 1)]?.[moveName]
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

// Gen 5: Steel no longer resists Ghost or Dark
const gen5Chart = deepCloneChart(_rawEffectiveness['4'])
gen5Chart['Ghost']['Steel'] = 1
gen5Chart['Dark']['Steel']  = 1

// Gen 6+: Fairy type added, plus keep Gen 5 Steel changes
const gen6Chart = deepCloneChart(gen5Chart)
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

// Adapt Black's schema (uses rom_id instead of national_dex_number) to match PokemonData
const blackData: Record<string, PokemonData> = {}
for (const [name, raw] of Object.entries(rawBlack as Record<string, Record<string, unknown>>)) {
  blackData[name] = {
    ...(raw as PokemonData),
    national_dex_number: raw['rom_id'] as number,
    // Fields not present in black.js — provide safe defaults
    catch_rate: (raw['catch_rate'] as number) ?? null,
    base_experience: (raw['base_experience'] as number) ?? null,
    common_item: (raw['common_item'] as string) ?? null,
    rare_item: (raw['rare_item'] as string) ?? null,
    gender_ratio: (raw['gender_ratio'] as number) ?? ((rawBw as Record<string, Record<string, unknown>>)[name]?.['gender_ratio'] as number) ?? null,
    egg_cycles: (raw['egg_cycles'] as number) ?? null,
    base_friendship: (raw['base_friendship'] as number) ?? null,
    egg_group_1: (raw['egg_group_1'] as string) ?? null,
    egg_group_2: (raw['egg_group_2'] as string) ?? null,
    weight: (raw['weight'] as number) ?? null,
  }
}

// Normalize species names that differ across gens (e.g. Nidoran♀ vs Nidoran_F)
const SPECIES_ALIASES: Record<string, string> = {
  'Nidoran♀': 'Nidoran_F',
  'Nidoran♂': 'Nidoran_M',
  "Farfetch\u2019d": "Farfetch'd",
  "Galarian Farfetch\u2019d": "Galarian Farfetch'd",
  "Sirfetch\u2019d": "Sirfetch'd",
}

// Display names: show symbols instead of underscored internal names
const DISPLAY_NAMES: Record<string, string> = {
  'Nidoran_F': 'Nidoran♀',
  'Nidoran_M': 'Nidoran♂',
}

export function displayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name
}

function normalizePokedex(raw: Record<string, PokemonData>): Record<string, PokemonData> {
  const hasAliases = Object.keys(raw).some(k => k in SPECIES_ALIASES)
  if (!hasAliases) return raw
  const out: Record<string, PokemonData> = {}
  for (const [name, data] of Object.entries(raw)) {
    const canonical = SPECIES_ALIASES[name] ?? name
    const family = data.evolution_family?.map(evo => {
      const evoCanonical = SPECIES_ALIASES[evo.species] ?? evo.species
      return evoCanonical !== evo.species ? { ...evo, species: evoCanonical } : evo
    })
    out[canonical] = { ...data, species: canonical, evolution_family: family ?? data.evolution_family }
  }
  return out
}

// Per-game files for games not in the main pokedex.js (all use national_dex_number directly)
const PER_GAME_DATA: Record<string, Record<string, PokemonData>> = {
  'Black':                         blackData,
  'Black 2 and White 2':           normalizePokedex(rawBw2  as unknown as Record<string, PokemonData>),
  'X and Y':                       normalizePokedex(rawXy   as unknown as Record<string, PokemonData>),
  'Omega Ruby and Alpha Sapphire': normalizePokedex(rawOras as unknown as Record<string, PokemonData>),
  'Sun and Moon':                  normalizePokedex(rawSm   as unknown as Record<string, PokemonData>),
  'Ultra Sun and Ultra Moon':      normalizePokedex(rawUsum as unknown as Record<string, PokemonData>),
  'Sword and Shield':              normalizePokedex(rawSwsh as unknown as Record<string, PokemonData>),
  'Scarlet and Violet':            normalizePokedex(rawSv   as unknown as Record<string, PokemonData>),
}

function getEvolutionStage(name: string, family: EvolutionEntry[], evolvedFromSet: Set<string>): EvolutionStage {
  if (name.startsWith('Mega ') || name.startsWith('Primal ')) return 'mega'
  if (!family || family.length <= 1) return 'single'
  const evolvesInto = family.some(e => e.species !== name && e.method !== null)
  const evolvedFrom = evolvedFromSet.has(name)
  if (evolvesInto && !evolvedFrom) return 'first'
  if (evolvesInto && evolvedFrom) return 'middle'
  if (!evolvesInto && evolvedFrom) return 'final'
  // Has family but doesn't evolve and nothing evolves into it (shouldn't happen, but fallback)
  return 'single'
}

// Sorted, deduplicated list of all Pokemon across all games
let _allPokemon: PokemonListEntry[] | null = null

export function getAllPokemon(): PokemonListEntry[] {
  if (_allPokemon) return _allPokemon

  // Build set of all Pokemon that something else evolves into
  const evolvedFromSet = new Set<string>()
  for (const game of GAMES) {
    const gameData = PER_GAME_DATA[game] ?? pokedexData[game]
    if (!gameData) continue
    for (const [, data] of Object.entries(gameData)) {
      if (!data.evolution_family) continue
      for (const evo of data.evolution_family) {
        if (evo.method !== null && evo.species !== data.species) {
          evolvedFromSet.add(evo.species)
        }
      }
    }
  }

  const seen = new Map<string, PokemonListEntry>()

  for (const game of GAMES) {
    const gameData = PER_GAME_DATA[game] ?? pokedexData[game]
    if (!gameData) continue
    for (const [name, data] of Object.entries(gameData)) {
      if (!seen.has(name)) {
        seen.set(name, {
          name,
          national_dex_number: data.national_dex_number,
          type_1: data.type_1,
          type_2: data.type_2,
          growth_rate: data.growth_rate,
          evolution_stage: getEvolutionStage(name, data.evolution_family, evolvedFromSet)
        })
      }
    }
  }

  _allPokemon = Array.from(seen.values()).sort(
    (a, b) => a.national_dex_number - b.national_dex_number
  )
  return _allPokemon
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
const REGIONAL_REPLACED: Map<string, Set<string>> = new Map()
for (const [, { prefix, replaces }] of Object.entries(REGIONAL_EVO_LINEAGE)) {
  for (const r of replaces) {
    const key = `${prefix}:${r}`
    if (!REGIONAL_REPLACED.has(key)) REGIONAL_REPLACED.set(key, new Set())
    REGIONAL_REPLACED.get(key)!.add(r)
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
  const gameData = PER_GAME_DATA[game] ?? pokedexData[game]
  const raw = gameData?.[name]
  if (!raw) return null

  let family = raw.evolution_family
  if (family) {
    const regionalMatch = name.match(/^(Alolan|Galarian|Hisuian|Paldean) /)
    if (regionalMatch) {
      // For regional forms, remap evolution_family to use regional species names where they exist
      const prefix = regionalMatch[1]
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

  return { ...raw, abilities: [...raw.abilities], evolution_family: family }
}

export function getGamesForPokemon(name: string): string[] {
  return GAMES.filter((game) => {
    const gameData = PER_GAME_DATA[game] ?? pokedexData[game]
    return !!gameData?.[name]
  })
}

/** All Pokemon available in a given game, sorted by national dex number. */
export function getAllPokemonForGame(game: string): PokemonData[] {
  const gameData = PER_GAME_DATA[game] ?? (pokedexData[game] as Record<string, PokemonData> | undefined)
  if (!gameData) return []
  return Object.keys(gameData)
    .map((name) => getPokemonData(name, game))
    .filter((p): p is PokemonData => p != null)
    .sort((a, b) => a.national_dex_number - b.national_dex_number)
}

export interface TypeMatchups {
  superEffVs: string[]
  notEffVs:   string[]
  noEffVs:    string[]
  weakTo:     string[]
  resists:    string[]
  immuneTo:   string[]
}

export function getTypeMatchups(type: string, game?: string): TypeMatchups {
  const gen = game ? (GAME_TO_GEN[game] ?? '4') : '4'
  const chart = effectivenessData[gen] ?? effectivenessData['4']
  const offensive = chart[type] ?? {}

  const superEffVs = Object.entries(offensive).filter(([, v]) => v === 2).map(([t]) => t)
  const notEffVs   = Object.entries(offensive).filter(([, v]) => v === 0.5).map(([t]) => t)
  const noEffVs    = Object.entries(offensive).filter(([, v]) => v === 0).map(([t]) => t)

  const weakTo:   string[] = []
  const resists:  string[] = []
  const immuneTo: string[] = []
  for (const [atkType, matchups] of Object.entries(chart)) {
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
}

export function getTmHmCode(moveName: string, game: string): string | null {
  const key = GAME_TO_TMHM_KEY[game] ?? GAME_TO_GEN[game]
  return tmhmByGen[key]?.[moveName] ?? null
}

// Combined defensive multipliers for a dual-type pokemon against every attacking type
export interface StatRankEntry {
  name: string
  value: number
  rank: number
}

function buildRanking(entries: { name: string; value: number }[]): StatRankEntry[] {
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
  const gameData = PER_GAME_DATA[game] ?? (pokedexData[game] as Record<string, PokemonData> | undefined)
  if (!gameData) return []

  const entries = Object.entries(gameData)
    .filter(([name]) => !nameFilter || nameFilter.has(name))
    .map(([name, data]) => ({ name, value: data.base_stats[statKey] ?? 0 }))

  return buildRanking(entries)
}

export function getPokemonTotalRanking(game: string, nameFilter?: Set<string>): StatRankEntry[] {
  const gameData = PER_GAME_DATA[game] ?? (pokedexData[game] as Record<string, PokemonData> | undefined)
  if (!gameData) return []

  const isGen1 = GAME_TO_GEN[game] === '1'

  const entries = Object.entries(gameData)
    .filter(([name]) => !nameFilter || nameFilter.has(name))
    .map(([name, data]) => {
      const s = data.base_stats
      const value = isGen1
        ? s.hp + s.attack + s.defense + s.special_attack + s.speed
        : Object.values(s).reduce((sum, v) => sum + v, 0)
      return { name, value }
    })

  return buildRanking(entries)
}

export function getPokemonDefenseMatchups(type1: string, type2: string, game: string): Record<string, number> {
  const gen = GAME_TO_GEN[game] ?? '4'
  const chart = effectivenessData[gen] ?? effectivenessData['4']
  const result: Record<string, number> = {}
  for (const [atkType, matchups] of Object.entries(chart)) {
    const v1 = (matchups[type1] as number) ?? 1
    const v2 = type1 !== type2 ? ((matchups[type2] as number) ?? 1) : 1
    result[atkType] = v1 * v2
  }
  return result
}

export function getMoveData(moveName: string, game: string): MoveData | null {
  const gen = parseInt(GAME_TO_GEN[game] ?? '0')
  if (!gen) return null

  const maxGen = Math.max(...Object.keys(movesData).map(Number))

  // Walk backward first (prefer data from the same or earlier gen)
  for (let g = gen; g >= 1; g--) {
    const found = movesData[String(g)]?.[moveName]
    if (found) return found
  }
  // Fall forward — handles moves introduced in a gen whose data was only
  // documented in a later gen's file (e.g. gen 5 moves only appear in gen 6+)
  for (let g = gen + 1; g <= maxGen; g++) {
    const found = movesData[String(g)]?.[moveName]
    if (found) return found
  }
  return null
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

// Raw trainer data mapped by game name
const RAW_TRAINER_DATA: Record<string, Record<string, unknown>> = {
  'Red and Blue':             trainersRedBlue as unknown as Record<string, unknown>,
  'Yellow':                   trainersYellow as unknown as Record<string, unknown>,
  'Gold and Silver':          trainersGoldSilver as unknown as Record<string, unknown>,
  'Crystal':                  trainersCrystal as unknown as Record<string, unknown>,
  'Ruby and Sapphire':        { ...(trainersRuby as unknown as Record<string, unknown>), ...(trainersSapphire as unknown as Record<string, unknown>) },
  'Emerald':                  trainersEmerald as unknown as Record<string, unknown>,
  'FireRed and LeafGreen':    trainersFireRedLeafGreen as unknown as Record<string, unknown>,
  'Diamond and Pearl':        trainersDiamondPearl as unknown as Record<string, unknown>,
  'Platinum':                 trainersPlatinum as unknown as Record<string, unknown>,
  'HeartGold and SoulSilver': trainersHeartGoldSoulSilver as unknown as Record<string, unknown>,
}

function normalizeTrainer(id: string, raw: Record<string, unknown>): Trainer {
  const party = (raw.party as Record<string, unknown>[]) ?? []
  return {
    id,
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

export const GAMES_WITH_TRAINERS: string[] = GAMES.filter(g => g in RAW_TRAINER_DATA)

// Cached normalized trainer data per game
const _trainerCache: Record<string, Trainer[]> = {}

export function getTrainers(game: string): Trainer[] {
  if (_trainerCache[game]) return _trainerCache[game]
  const raw = RAW_TRAINER_DATA[game]
  if (!raw) return []
  const trainers: Trainer[] = []
  for (const [id, data] of Object.entries(raw)) {
    const t = normalizeTrainer(id, data as Record<string, unknown>)
    // Skip empty parties and placeholder entries
    if (t.party.length === 0) continue
    trainers.push(t)
  }
  _trainerCache[game] = trainers
  return trainers
}

export function getTrainerList(game: string): TrainerListEntry[] {
  return getTrainers(game).map(t => ({
    id: t.id,
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
