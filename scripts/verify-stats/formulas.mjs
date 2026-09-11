/**
 * Reference stat formulas, transcribed directly from the decomps.
 *
 * These are deliberately a *second* implementation, independent of
 * src/renderer/src/utils/damageCalc.ts — the point of the harness is to catch
 * the app drifting from the ROMs, so it must not import the app's version.
 */

// ─── Natures (Gen 3+) ────────────────────────────────────────────────────────

/** Nature index → name, in the games' own order (personality % 25). */
export const NATURES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
]

/**
 * gNatureStatTable (pokeemerald/src/data/pokemon/natures.h) — one row per
 * nature, columns in STAT order: Atk, Def, Speed, SpA, SpD. 1 raises, -1 lowers.
 */
const NATURE_STAT_TABLE = [
  [0, 0, 0, 0, 0], [1, -1, 0, 0, 0], [1, 0, -1, 0, 0], [1, 0, 0, -1, 0], [1, 0, 0, 0, -1],
  [-1, 1, 0, 0, 0], [0, 0, 0, 0, 0], [0, 1, -1, 0, 0], [0, 1, 0, -1, 0], [0, 1, 0, 0, -1],
  [-1, 0, 1, 0, 0], [0, -1, 1, 0, 0], [0, 0, 0, 0, 0], [0, 0, 1, -1, 0], [0, 0, 1, 0, -1],
  [-1, 0, 0, 1, 0], [0, -1, 0, 1, 0], [0, 0, -1, 1, 0], [0, 0, 0, 0, 0], [0, 0, 0, 1, -1],
  [-1, 0, 0, 0, 1], [0, -1, 0, 0, 1], [0, 0, -1, 0, 1], [0, 0, 0, -1, 1], [0, 0, 0, 0, 0],
]

/**
 * ModifyStatByNature: `stat * 110 / 100` or `stat * 90 / 100`, integer division.
 * `statIndex` is 0=Atk, 1=Def, 2=Speed, 3=SpA, 4=SpD (HP is never modified).
 */
function modifyStatByNature(stat, nature, statIndex) {
  const dir = NATURE_STAT_TABLE[nature][statIndex]
  if (dir === 1) return Math.floor(stat * 110 / 100)
  if (dir === -1) return Math.floor(stat * 90 / 100)
  return stat
}

// ─── Gen 1–2 ─────────────────────────────────────────────────────────────────

/**
 * HP DV is derived from the parity of the other four, not stored.
 * Source: pokered home/move_mon.asm, pokecrystal engine/pokemon/move_mon.asm.
 */
export function deriveHpDv({ attack, defense, speed, special }) {
  return ((attack & 1) << 3) | ((defense & 1) << 2) | ((speed & 1) << 1) | (special & 1)
}

/**
 * Stat Exp bonus = floor(ceil(sqrt(statExp)) / 4), where the square root is
 * capped at 255: pokered/pokegold walk an 8-bit counter that bails at $FF, and
 * pokecrystal's GetSquareRoot table stops at NUM_SQUARE_ROOTS (255).
 */
function statExpBonus(statExp) {
  return Math.floor(Math.min(255, Math.ceil(Math.sqrt(statExp))) / 4)
}

const NO_STAT_EXP = { hp: 0, attack: 0, defense: 0, speed: 0, special: 0 }

/**
 * Gen 1–2 stat formula. `dvs` carries attack/defense/speed/special (SpA and SpD
 * share the Special DV and Stat Exp); HP's DV is derived.
 *
 *   Stat = floor(((base + DV) × 2 + bonus) × Level / 100) + 5
 *   HP   = same, but + Level + 10
 */
export function calcGen12(base, level, dvs, statExps = NO_STAT_EXP) {
  const core = (b, dv, exp) =>
    Math.floor(((b + dv) * 2 + statExpBonus(exp)) * level / 100)
  return {
    hp:              core(base.hp, deriveHpDv(dvs), statExps.hp) + level + 10,
    attack:          core(base.attack, dvs.attack, statExps.attack) + 5,
    defense:         core(base.defense, dvs.defense, statExps.defense) + 5,
    speed:           core(base.speed, dvs.speed, statExps.speed) + 5,
    special_attack:  core(base.special_attack, dvs.special, statExps.special) + 5,
    special_defense: core(base.special_defense, dvs.special, statExps.special) + 5,
  }
}

// ─── Gen 3+ ──────────────────────────────────────────────────────────────────

const NO_EVS = {
  hp: 0, attack: 0, defense: 0, speed: 0, special_attack: 0, special_defense: 0,
}

/** Expand a scalar IV into the per-stat shape the formula wants. */
export function uniformIvs(iv) {
  return {
    hp: iv, attack: iv, defense: iv, speed: iv, special_attack: iv, special_defense: iv,
  }
}

/**
 * Gen 3+ stat formula (identical from Ruby through the present day).
 *
 *   Stat = floor((floor((2 × base + IV + floor(EV/4)) × Level / 100) + 5) × nature)
 *   HP   = floor((2 × base + IV + floor(EV/4)) × Level / 100) + Level + 10
 *
 * `nature` is an index into NATURES. Shedinja's max HP is hardcoded to 1 before
 * the HP formula runs, so pass `species` when you have it.
 */
export function calcGen3Plus(base, level, ivs, nature = 0, evs = NO_EVS, species = null) {
  const core = key =>
    Math.floor((2 * base[key] + ivs[key] + Math.floor(evs[key] / 4)) * level / 100)
  const mod = (key, statIndex) => modifyStatByNature(core(key) + 5, nature, statIndex)
  return {
    hp:              species === 'Shedinja' ? 1 : core('hp') + level + 10,
    attack:          mod('attack', 0),
    defense:         mod('defense', 1),
    speed:           mod('speed', 2),
    special_attack:  mod('special_attack', 3),
    special_defense: mod('special_defense', 4),
  }
}

// ─── Gen 3–4 personality / RNG ───────────────────────────────────────────────

/**
 * The DS-era LCRNG: seed = seed * 0x41C64E6D + 0x6073. `LCRNG_Next` returns the
 * top 16 bits of the new state.
 */
export function lcrngNext(seed) {
  return (Math.imul(seed, 0x41C64E6D) + 0x6073) >>> 0
}

/** Pokemon_InlineIsPersonalityShiny — used by the non-shiny OT ID reroll loop. */
export function isShiny(otId, personality) {
  const xor = ((otId & 0xFFFF) ^ (otId >>> 16) ^ (personality & 0xFFFF) ^ (personality >>> 16)) >>> 0
  return xor < 8
}

/**
 * Gen 4 random-IV path: when `(u8)(ivScale * 31 / 255)` lands at 32 or above,
 * the game rolls IVs off the same RNG instead of using a uniform spread. Two
 * calls burn the non-shiny OT ID, then two words carry the six IVs.
 * Returns { ivs, seed } so the caller can keep advancing if it needs to.
 */
export function rollGen4RandomIvs(seed, personality) {
  let s = seed
  const next16 = () => { s = lcrngNext(s); return s >>> 16 }
  let otId
  do {
    otId = (next16() | (next16() << 16)) >>> 0
  } while (isShiny(otId, personality))
  const first = next16()
  const second = next16()
  return {
    seed: s,
    ivs: {
      hp:              first & 31,
      attack:          (first >> 5) & 31,
      defense:         (first >> 10) & 31,
      speed:           second & 31,
      special_attack:  (second >> 5) & 31,
      special_defense: (second >> 10) & 31,
    },
  }
}
