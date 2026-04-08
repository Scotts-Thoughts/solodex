import type { BaseStats } from '../types/pokemon'

// ─── Physical / Special category ─────────────────────────────────────────────
//
// Gen 1–3: determined by the move's TYPE (the physical/special split was a
//          property of types, not individual moves, until Gen 4).
//
//   Physical types: Normal, Fighting, Flying, Poison, Ground, Rock, Bug,
//                   Ghost, Steel (Steel added Gen 2)
//   Special types:  Fire, Water, Grass, Electric, Psychic, Ice, Dragon,
//                   Dark (Dark added Gen 2)
//
// Gen 4+: determined by the move's explicit "category" field.
//
// Sources: pokered (Gen 1), pokecrystal (Gen 2), pokeemerald / pokefirered
//          (Gen 3), pokediamond (Gen 4 — first gen with per-move split).

const PHYSICAL_TYPES_GEN123 = new Set([
  'Normal', 'Fighting', 'Flying', 'Poison', 'Ground',
  'Rock', 'Bug', 'Ghost', 'Steel',
])

export type MoveCategory = 'physical' | 'special'

export function getMoveCategory(
  moveType: string,
  moveExplicitCategory: string,
  gen: number,
): MoveCategory {
  if (gen >= 4) return moveExplicitCategory.toLowerCase() as MoveCategory
  return PHYSICAL_TYPES_GEN123.has(moveType) ? 'physical' : 'special'
}

// ─── Per-stat input types ─────────────────────────────────────────────────────

/**
 * Gen 1–2 DVs (0–15 each).
 *
 * HP DV is *derived* from the parity bits of the other four DVs — it is not an
 * independent input:
 *   HP_DV = (ATK & 1)<<3 | (DEF & 1)<<2 | (SPE & 1)<<1 | (SPC & 1)
 * Source: pokered/engine/battle/core.asm
 *
 * "special" covers both SpA and SpD because Gen 1–2 share a single "Special"
 * stat value for both attack and defense.
 */
export interface Gen12DVs {
  attack:  number
  defense: number
  speed:   number
  special: number
}

export const DEFAULT_GEN12_DVS: Gen12DVs = {
  attack: 15, defense: 15, speed: 15, special: 15,
}

/**
 * Gen 1–2 Stat Experience (0–65535 each), one value per stat.
 * "special" covers both SpA and SpD (same as DVs — shared Special stat).
 */
export interface Gen12StatExps {
  hp:      number
  attack:  number
  defense: number
  speed:   number
  special: number
}

export const DEFAULT_GEN12_STATEXPS: Gen12StatExps = {
  hp: 0, attack: 0, defense: 0, speed: 0, special: 0,
}

/**
 * Gen 3+ IVs (0–31 each), one per stat.
 */
export interface Gen3IVs {
  hp:        number
  attack:    number
  defense:   number
  spattack:  number
  spdefense: number
  speed:     number
}

export const DEFAULT_GEN3_IVS: Gen3IVs = {
  hp: 31, attack: 31, defense: 31, spattack: 31, spdefense: 31, speed: 31,
}

/**
 * Gen 3+ EVs (0–252 each), one per stat.
 */
export interface Gen3EVs {
  hp:        number
  attack:    number
  defense:   number
  spattack:  number
  spdefense: number
  speed:     number
}

export const DEFAULT_GEN3_EVS: Gen3EVs = {
  hp: 0, attack: 0, defense: 0, spattack: 0, spdefense: 0, speed: 0,
}

// ─── Stat calculation ─────────────────────────────────────────────────────────

export interface CalcStats {
  hp:        number
  attack:    number
  defense:   number
  spattack:  number   // "Special" in Gen 1 (same value as spdefense)
  spdefense: number
  speed:     number
}

/**
 * Derive the Gen 1–2 HP DV from the other four DVs.
 *
 * Source: pokered/engine/battle/core.asm
 *   HP_DV = (ATK_DV & 1)<<3 | (DEF_DV & 1)<<2 | (SPE_DV & 1)<<1 | (SPC_DV & 1)
 */
export function deriveHpDv(dvs: Gen12DVs): number {
  return ((dvs.attack & 1) << 3) | ((dvs.defense & 1) << 2) | ((dvs.speed & 1) << 1) | (dvs.special & 1)
}

/**
 * Gen 1–2 stat formula.
 *
 * Source: pokered/engine/battle/stats_casualty.asm (Gen 1),
 *         pokecrystal/engine/battle/core.asm (Gen 2).
 *
 *   Stat = floor(((base + DV) × 2 + floor(ceil(sqrt(StatExp)) / 4)) × Level / 100) + 5
 *   HP   = same formula + Level + 10  (instead of +5)
 *
 * Each stat has independent DV and Stat Experience values.
 * HP DV is derived from ATK/DEF/SPE/SPC parity bits (see deriveHpDv).
 * SpA and SpD share the "special" DV and Stat Experience.
 */
export function calcGen12Stats(
  base: BaseStats,
  level: number,
  dvs: Gen12DVs = DEFAULT_GEN12_DVS,
  statExps: Gen12StatExps = DEFAULT_GEN12_STATEXPS,
): CalcStats {
  const hpDv  = deriveHpDv(dvs)
  const bonus = (exp: number) => Math.floor(Math.ceil(Math.sqrt(exp)) / 4)
  const core  = (b: number, dv: number, exp: number) =>
    Math.floor(((b + dv) * 2 + bonus(exp)) * level / 100)
  return {
    hp:        core(base.hp,             hpDv,        statExps.hp)      + level + 10,
    attack:    core(base.attack,          dvs.attack,  statExps.attack)  + 5,
    defense:   core(base.defense,         dvs.defense, statExps.defense) + 5,
    spattack:  core(base.special_attack,  dvs.special, statExps.special) + 5,
    spdefense: core(base.special_defense, dvs.special, statExps.special) + 5,
    speed:     core(base.speed,           dvs.speed,   statExps.speed)   + 5,
  }
}

/**
 * Gen 3+ stat formula.
 *
 * Source: pokeemerald/src/pokemon.c CalcMonStat,
 *         pokefirered/src/pokemon.c.
 *
 *   Stat = floor((floor((2 × base + IV + floor(EV/4)) × Level / 100) + 5) × nature)
 *   HP   = floor((2 × base + IV + floor(EV/4)) × Level / 100) + Level + 10
 *
 * Each stat has independent IV and EV values.
 */
export function calcGen3PlusStats(
  base: BaseStats,
  level: number,
  ivs: Gen3IVs = DEFAULT_GEN3_IVS,
  evs: Gen3EVs = DEFAULT_GEN3_EVS,
  nature = 1.0,
): CalcStats {
  const core = (b: number, iv: number, ev: number) =>
    Math.floor((2 * b + iv + Math.floor(ev / 4)) * level / 100)
  return {
    hp:        core(base.hp,             ivs.hp,        evs.hp)        + level + 10,
    attack:    Math.floor((core(base.attack,          ivs.attack,    evs.attack)    + 5) * nature),
    defense:   Math.floor((core(base.defense,         ivs.defense,   evs.defense)   + 5) * nature),
    spattack:  Math.floor((core(base.special_attack,  ivs.spattack,  evs.spattack)  + 5) * nature),
    spdefense: Math.floor((core(base.special_defense, ivs.spdefense, evs.spdefense) + 5) * nature),
    speed:     Math.floor((core(base.speed,           ivs.speed,     evs.speed)     + 5) * nature),
  }
}

// ─── Damage range ─────────────────────────────────────────────────────────────

export interface DamageRange {
  min:           number
  max:           number
  minPercent:    number   // min / defenderHP × 100, 1 decimal
  maxPercent:    number
  effectiveness: number   // 0 | 0.25 | 0.5 | 1 | 2 | 4
  stab:          boolean
  category:      MoveCategory
}

/**
 * Calculate the damage range (min / max) for one move against one target.
 *
 * ── Base formula (identical across all gens) ──────────────────────────────────
 *
 *   1. levelFactor = floor(2 × Level / 5) + 2
 *   2. d = floor(levelFactor × Power × Attack / Defense)
 *   3. d = floor(d / 50) + 2
 *
 * ── Modifiers applied in order ────────────────────────────────────────────────
 *
 *   STAB:    d = floor(d × 3 / 2)
 *
 *   Type effectiveness — applied as separate integer operations to match the
 *   assembly behavior (each ×2 doubles, each ÷2 truncates):
 *     4× → d × 2 × 2
 *     2× → d × 2
 *    ½× → floor(d / 2)
 *    ¼× → floor(floor(d / 2) / 2)
 *
 *   Random:
 *     Gen 1–2: byte r ∈ [217, 255] → d_final = floor(d × r / 255)
 *              Source: pokered/engine/battle/core.asm CalcDamage
 *     Gen 3–5: roll r ∈ [85, 100]  → d_final = floor(d × r / 100)
 *              Source: pokeemerald/src/battle_main.c (Random() % 16 + 85)
 *
 * Minimum damage after a hit is always 1.
 */
export function calcDamageRange(
  gen:           number,
  attackerLevel: number,
  attackStat:    number,
  defenseStat:   number,
  power:         number,
  stab:          boolean,
  effectiveness: number,
  category:      MoveCategory,
  defenderHP:    number,
): DamageRange {
  const none: DamageRange = {
    min: 0, max: 0, minPercent: 0, maxPercent: 0, effectiveness, stab, category,
  }
  if (power <= 0 || effectiveness === 0 || defenseStat <= 0 || defenderHP <= 0) return none

  // Base damage
  const lf = Math.floor(2 * attackerLevel / 5) + 2
  let d = Math.floor(Math.floor(lf * power * attackStat / defenseStat) / 50) + 2

  // STAB
  if (stab) d = Math.floor(d * 3 / 2)

  // Type effectiveness (separate integer operations per gen assembly behavior)
  if      (effectiveness === 4)    d = d * 2 * 2
  else if (effectiveness === 2)    d = d * 2
  else if (effectiveness === 0.5)  d = Math.floor(d / 2)
  else if (effectiveness === 0.25) d = Math.floor(Math.floor(d / 2) / 2)

  // Random modifier
  const min = Math.max(1, gen <= 2 ? Math.floor(d * 217 / 255) : Math.floor(d * 85 / 100))
  const max = Math.max(1, d)  // r = 255/100 → no change

  const pct = (n: number) => Math.round(n / defenderHP * 1000) / 10

  return {
    min,
    max,
    minPercent: pct(min),
    maxPercent: pct(max),
    effectiveness,
    stab,
    category,
  }
}
