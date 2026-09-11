import type { BaseStats } from '../../types/pokemon'

// Stat formulas, DV/IV/EV inputs and natures. Verified against the decomps by
// `npm run verify:stats` (scripts/verify-stats/formulas.mjs is an independent
// transcription; the two must agree).

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

// ─── Natures (Gen 3+) ───────────────────────────────────────────────────────
//
// A nature raises one stat by 10% and lowers another by 10% (HP is never
// affected). "Neutral" natures (Hardy, Docile, etc.) raise and lower the same
// stat, netting no change.
//
// natures.js stores the affected stat as one of:
//   attack | defense | speed | specialAttack | specialDefense
// which we map onto CalcStats keys (spattack / spdefense).

export interface NatureMods {
  attack:    number
  defense:   number
  spattack:  number
  spdefense: number
  speed:     number
}

export const NEUTRAL_NATURE: NatureMods = {
  attack: 1, defense: 1, spattack: 1, spdefense: 1, speed: 1,
}

const NATURE_KEY_MAP: Record<string, keyof NatureMods> = {
  attack:         'attack',
  defense:        'defense',
  speed:          'speed',
  specialAttack:  'spattack',
  specialDefense: 'spdefense',
}

/**
 * Build per-stat nature multipliers from a nature's increased/decreased stat
 * names (as stored in natures.js). Neutral natures (increased === decreased, or
 * either null) return all 1.0.
 */
export function getNatureMods(increased: string | null, decreased: string | null): NatureMods {
  const mods: NatureMods = { ...NEUTRAL_NATURE }
  if (!increased || !decreased || increased === decreased) return mods
  const inc = NATURE_KEY_MAP[increased]
  const dec = NATURE_KEY_MAP[decreased]
  if (inc) mods[inc] = 1.1
  if (dec) mods[dec] = 0.9
  return mods
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
 *
 * The ceil(sqrt(StatExp)) term is capped at 255 in every Gen 1–2 game: pokered
 * and pokegold search upward with an 8-bit counter that bails at $FF, and
 * pokecrystal's GetSquareRoot table stops at NUM_SQUARE_ROOTS (255). So StatExp
 * above 65025 still only yields a bonus of floor(255 / 4) = 63, not 64.
 */
export function calcGen12Stats(
  base: BaseStats,
  level: number,
  dvs: Gen12DVs = DEFAULT_GEN12_DVS,
  statExps: Gen12StatExps = DEFAULT_GEN12_STATEXPS,
): CalcStats {
  const hpDv  = deriveHpDv(dvs)
  const bonus = (exp: number) => Math.floor(Math.min(255, Math.ceil(Math.sqrt(exp))) / 4)
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
 * Each stat has independent IV and EV values. `nature` carries the per-stat
 * ×1.1 / ×0.9 / ×1.0 multipliers (HP is never affected); defaults to neutral.
 *
 * `species` only matters for Shedinja, whose max HP is hardcoded to 1 in every
 * game it appears in (CalculateMonStats special-cases SPECIES_SHEDINJA before
 * the HP formula runs).
 */
export function calcGen3PlusStats(
  base: BaseStats,
  level: number,
  ivs: Gen3IVs = DEFAULT_GEN3_IVS,
  evs: Gen3EVs = DEFAULT_GEN3_EVS,
  nature: NatureMods = NEUTRAL_NATURE,
  species?: string,
): CalcStats {
  const core = (b: number, iv: number, ev: number) =>
    Math.floor((2 * b + iv + Math.floor(ev / 4)) * level / 100)
  return {
    hp:        species === 'Shedinja'
      ? 1
      : core(base.hp, ivs.hp, evs.hp) + level + 10,
    attack:    Math.floor((core(base.attack,          ivs.attack,    evs.attack)    + 5) * nature.attack),
    defense:   Math.floor((core(base.defense,         ivs.defense,   evs.defense)   + 5) * nature.defense),
    spattack:  Math.floor((core(base.special_attack,  ivs.spattack,  evs.spattack)  + 5) * nature.spattack),
    spdefense: Math.floor((core(base.special_defense, ivs.spdefense, evs.spdefense) + 5) * nature.spdefense),
    speed:     Math.floor((core(base.speed,           ivs.speed,     evs.speed)     + 5) * nature.speed),
  }
}
