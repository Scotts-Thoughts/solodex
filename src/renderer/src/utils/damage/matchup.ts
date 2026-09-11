/**
 * Glue between app data (PokemonData / TrainerPokemon / player setup) and the
 * calculator's `BattlerState`, plus the matchup computation DamageView renders.
 * Pure functions — no React.
 */
import type { PokemonData, TrainerPokemon } from '../../types/pokemon'
import { GAME_TO_GEN, getMoveData } from '../../data'
import type { BattlerFlags, BattlerState, CounterKey, DamageResult, Field, Gen, MoveOptions, StatStages, Status } from './types'
import { DEFAULT_FIELD, ZERO_STAGES } from './types'
import type { CalcStats, Gen12DVs, Gen3IVs } from './stats'
import { calcDamage } from './index'
import { itemId } from './items'
import { abilityId } from './abilities'

export function genOfGame(game: string): Gen | null {
  const g = parseInt(GAME_TO_GEN[game] ?? '0')
  return g >= 1 && g <= 5 ? (g as Gen) : null
}

/** Whether the calculator supports this game (trainer data + a verified pipeline). */
export function calculatorSupportsGame(game: string): boolean {
  return genOfGame(game) !== null
}

export interface BattlerSetup {
  species:    string
  data:       PokemonData
  level:      number
  stats:      CalcStats
  stages?:    Partial<StatStages>
  item?:      string | null
  ability?:   string | null
  status?:    Status
  hpPercent?: number        // 0..100 of max HP
  friendship?: number
  dvs?:       Gen12DVs
  ivs?:       Gen3IVs
  badges?:    Set<string>
  isPlayer:   boolean
  flags?:     BattlerFlags
  counters?:  Partial<Record<CounterKey, number>>
  gender?:    'M' | 'F' | 'N'
}

export function toBattler(s: BattlerSetup): BattlerState {
  const maxHp = Math.max(1, s.stats.hp)
  const pct = Math.max(0, Math.min(100, s.hpPercent ?? 100))
  const stages: StatStages = { ...ZERO_STAGES, ...(s.stages ?? {}) }
  return {
    species: s.species,
    level: s.level,
    types: [s.data.type_1, s.data.type_2 || s.data.type_1],
    stats: s.stats,
    baseStats: s.data.base_stats,
    stages,
    item: itemId(s.item ?? null),
    ability: abilityId(s.ability ?? null),
    status: s.status ?? 'none',
    currentHp: Math.max(1, Math.round(maxHp * pct / 100)),
    weight: s.data.weight ?? 0,
    friendship: s.friendship ?? 255,
    gender: s.gender ?? 'N',
    dvs: s.dvs,
    ivs: s.ivs,
    badges: s.badges ?? new Set(),
    isPlayer: s.isPlayer,
    flags: {
      // Eviolite: a species that still evolves (entries with a method are what it evolves into).
      notFullyEvolved: s.data.evolution_family.some(e => e.method != null),
      ...(s.flags ?? {}),
    },
    counters: s.counters ?? {},
  }
}

/** Enemy battler from trainer data (stats precomputed and verified by verify:stats). */
export function trainerMonToBattler(
  mon: TrainerPokemon,
  data: PokemonData,
  over: Partial<Omit<BattlerSetup, 'species' | 'data' | 'level' | 'stats' | 'isPlayer'>> = {},
): BattlerState {
  return toBattler({
    species: mon.species,
    data,
    level: mon.level,
    stats: {
      hp: mon.stats.hp, attack: mon.stats.attack, defense: mon.stats.defense,
      spattack: mon.stats.special_attack, spdefense: mon.stats.special_defense, speed: mon.stats.speed,
    },
    item: over.item !== undefined ? over.item : mon.held_item,
    ability: over.ability !== undefined ? over.ability : mon.ability,
    isPlayer: false,
    ...over,
    // Trainer Pokémon are created with their species' base friendship
    // (pokeemerald CreateBoxMon, pokeplatinum Pokemon_Init).
    friendship: over.friendship ?? data.base_friendship ?? 70,
  })
}

export function makeField(game: string, over: Partial<Field> = {}): Field {
  const gen = genOfGame(game) ?? 1
  return { ...DEFAULT_FIELD, game, gen, ...over }
}

export interface MatchupSide {
  move:   string
  result: DamageResult
}

export interface Matchup {
  playerAttacks: MatchupSide[]
  enemyAttacks:  MatchupSide[]
}

/** Per-move options keyed by move name (assumption pills). */
export type MoveOptionMap = Record<string, MoveOptions>

export function computeMatchup(
  player: BattlerState,
  enemy: BattlerState,
  playerMoves: string[],
  enemyMoves: string[],
  field: Field,
  playerOptions: MoveOptionMap = {},
  enemyOptions: MoveOptionMap = {},
): Matchup {
  const run = (attacker: BattlerState, defender: BattlerState, moves: string[], opts: MoveOptionMap): MatchupSide[] => {
    const out: MatchupSide[] = []
    for (const name of moves) {
      if (!name) continue
      const md = getMoveData(name, field.game)
      if (!md) continue
      out.push({ move: name, result: calcDamage({ attacker, defender, moveName: name, moveData: md, field, options: opts[name] }) })
    }
    return out
  }
  return {
    playerAttacks: run(player, enemy, playerMoves, playerOptions),
    enemyAttacks:  run(enemy, player, enemyMoves, enemyOptions),
  }
}
