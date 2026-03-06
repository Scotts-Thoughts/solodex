import { pokedex as allPokedex } from '@data/pokedex'
import { pokedex_black as rawBlack } from '@data/pokedex/black'
import { moves as allMoves } from '@data/moves'
import { effectiveness as rawEffectiveness } from '@data/effectiveness'
import type { PokemonData, MoveData, PokemonListEntry } from '../types/pokemon'

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
  'Black'
] as const

export type GameName = (typeof GAMES)[number]

export const GAME_ABBREV: Record<string, string> = {
  'Red and Blue': 'RB',
  Yellow: 'Y',
  'Gold and Silver': 'GS',
  Crystal: 'C',
  'Ruby and Sapphire': 'RS',
  Emerald: 'E',
  'FireRed and LeafGreen': 'FRLG',
  'Diamond and Pearl': 'DP',
  Platinum: 'Pt',
  'HeartGold and SoulSilver': 'HGSS',
  Black: 'BW'
}

const GAME_TO_GEN: Record<string, string> = {
  'Red and Blue': '1',
  Yellow: '1',
  'Gold and Silver': '2',
  Crystal: '2',
  'Ruby and Sapphire': '3',
  Emerald: '3',
  'FireRed and LeafGreen': '3',
  'Diamond and Pearl': '4',
  Platinum: '4',
  'HeartGold and SoulSilver': '4',
  Black: '4' // no gen 5 moves/effectiveness data; gen 4 chart is accurate (Fairy not until gen 6)
}

const pokedexData = allPokedex as Record<string, Record<string, PokemonData>>
const movesData = allMoves as Record<string, Record<string, MoveData>>
const effectivenessData = rawEffectiveness as Record<string, Record<string, Record<string, number>>>

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
    gender_ratio: (raw['gender_ratio'] as number) ?? null,
    egg_cycles: (raw['egg_cycles'] as number) ?? null,
    base_friendship: (raw['base_friendship'] as number) ?? null,
    egg_group_1: (raw['egg_group_1'] as string) ?? null,
    egg_group_2: (raw['egg_group_2'] as string) ?? null,
    weight: (raw['weight'] as number) ?? null,
  }
}

// Sorted, deduplicated list of all Pokemon across all games
let _allPokemon: PokemonListEntry[] | null = null

export function getAllPokemon(): PokemonListEntry[] {
  if (_allPokemon) return _allPokemon

  const seen = new Map<string, PokemonListEntry>()

  for (const game of GAMES) {
    const gameData = game === 'Black' ? blackData : pokedexData[game]
    if (!gameData) continue
    for (const [name, data] of Object.entries(gameData)) {
      if (!seen.has(name)) {
        seen.set(name, {
          name,
          national_dex_number: data.national_dex_number,
          type_1: data.type_1,
          type_2: data.type_2
        })
      }
    }
  }

  _allPokemon = Array.from(seen.values()).sort(
    (a, b) => a.national_dex_number - b.national_dex_number
  )
  return _allPokemon
}

export function getPokemonData(name: string, game: string): PokemonData | null {
  if (game === 'Black') return blackData[name] ?? null
  return pokedexData[game]?.[name] ?? null
}

export function getGamesForPokemon(name: string): string[] {
  return GAMES.filter((game) => {
    if (game === 'Black') return !!blackData[name]
    return !!pokedexData[game]?.[name]
  })
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

export function getMoveData(moveName: string, game: string): MoveData | null {
  const gen = parseInt(GAME_TO_GEN[game] ?? '0')
  if (!gen) return null

  for (let g = gen; g >= 1; g--) {
    const found = movesData[String(g)]?.[moveName]
    if (found) return found
  }
  return null
}
