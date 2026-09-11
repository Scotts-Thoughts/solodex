import type { MoveData } from '../../../types/pokemon'
import { DEFAULT_FIELD, ZERO_STAGES, type BattlerState, type Field, type Gen } from '../types'
import { calcDamage, type CalcParams } from '../index'
import type { DamageResult } from '../types'

const GAME_FOR_GEN: Record<Gen, string> = {
  1: 'Red and Blue', 2: 'Crystal', 3: 'Emerald', 4: 'Platinum', 5: 'Black',
}

export function mon(over: Partial<BattlerState> & { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number } = {}): BattlerState {
  const hp = over.hp ?? 150, atk = over.atk ?? 100, def = over.def ?? 80, spa = over.spa ?? 100, spd = over.spd ?? 80, spe = over.spe ?? 90
  return {
    species: 'Testmon',
    level: 50,
    types: ['Normal', 'Normal'],
    stats: { hp, attack: atk, defense: def, spattack: spa, spdefense: spd, speed: spe },
    baseStats: { hp: 60, attack: 60, defense: 60, special_attack: 60, special_defense: 60, speed: 60 },
    stages: { ...ZERO_STAGES },
    item: null, ability: null, status: 'none',
    currentHp: hp, weight: 30, friendship: 255, gender: 'M',
    badges: new Set(), isPlayer: true, flags: {}, counters: {},
    ...over,
    ...(over.stages ? { stages: { ...ZERO_STAGES, ...over.stages } } : {}),
  }
}

export function move(over: Partial<MoveData> = {}): MoveData {
  return {
    rom_id: 0, move: over.move ?? 'Test Move', type: 'Normal', category: 'Physical', pp: 10, power: 90, accuracy: 100,
    priority: 0, effect: 'basic_hit', effect_chance: null, target: 'Foe Or Ally', makes_contact: true,
    affected_by_protect: true, affected_by_magic_coat: false, affected_by_snatch: false, affected_by_mirror_move: true,
    affected_by_kings_rock: true, description: '', ...over,
  }
}

export function field(gen: Gen, over: Partial<Field> = {}): Field {
  return { ...DEFAULT_FIELD, game: GAME_FOR_GEN[gen], gen, ...over }
}

export function calc(gen: Gen, p: Partial<CalcParams> & { attacker?: BattlerState; defender?: BattlerState } = {}): DamageResult {
  const md = p.moveData ?? move()
  return calcDamage({
    attacker: p.attacker ?? mon(),
    defender: p.defender ?? mon(),
    moveName: p.moveName ?? md.move,
    moveData: md,
    field: p.field ?? field(gen),
    options: p.options,
  })
}
