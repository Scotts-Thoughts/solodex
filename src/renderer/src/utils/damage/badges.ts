/**
 * Badge boosts.
 *
 *   Gen 1  ×9/8 (`stat += stat >> 3`, cap 999) on Atk / Def / Spe / Special,
 *          player only. pokered engine/battle/core.asm ApplyBadgeStatBoosts
 *          (core:6454-6500). Re-applied on every stat change in the real game
 *          (the "badge boost glitch"); modelled here as a single application.
 *   Gen 2  Johto badges: Zephyr→Atk, Mineral→Def, Plain→Spe, Glacier→SpA (and
 *          SpD, buggy — see `gen2GlacierBoostsSpDef`). Same `+stat>>3`, cap 999.
 *          pokecrystal engine/battle/core.asm BadgeStatBoosts (CORE:6768-6850).
 *          All 16 badges also boost damage of their type by +1/8 — that lives
 *          in gen2.ts, keyed on `hasBadgeTypeBoost`.
 *   Gen 3  ×110/100 on badge 1 (Atk), 5 (Def), 7 (SpA and SpD), player only.
 *          pokeemerald src/pokemon.c CalculateBaseDamage (3161-3168),
 *          pokefirered src/pokemon.c, pokeruby src/calculate_base_damage.c.
 *   Gen 4+ none.
 *
 * Reference: docs/damage/gen{1,2,3}_damage_reference.md §3.
 */
import type { Gen } from './types'

export type BadgeStat = 'attack' | 'defense' | 'spattack' | 'spdefense' | 'speed'

export interface Badge {
  id:     string
  name:   string
  leader: string
  stats?: BadgeStat[]   // which stats this badge boosts (if any)
  type?:  string        // Gen 2 type boost
}

const GEN1_BADGES: Badge[] = [
  { id: 'boulder', name: 'Boulder', leader: 'Brock',    stats: ['attack'] },
  { id: 'cascade', name: 'Cascade', leader: 'Misty' },
  { id: 'thunder', name: 'Thunder', leader: 'Surge',    stats: ['defense'] },
  { id: 'rainbow', name: 'Rainbow', leader: 'Erika' },
  { id: 'soul',    name: 'Soul',    leader: 'Koga',     stats: ['speed'] },
  { id: 'marsh',   name: 'Marsh',   leader: 'Sabrina' },
  { id: 'volcano', name: 'Volcano', leader: 'Blaine',   stats: ['spattack', 'spdefense'] },
  { id: 'earth',   name: 'Earth',   leader: 'Giovanni' },
]

const GEN2_BADGES: Badge[] = [
  // Johto — 4 give stat boosts; all 8 give type boosts
  { id: 'zephyr',  name: 'Zephyr',  leader: 'Falkner',  stats: ['attack'],                type: 'Flying' },
  { id: 'hive',    name: 'Hive',    leader: 'Bugsy',                                      type: 'Bug' },
  { id: 'plain',   name: 'Plain',   leader: 'Whitney', stats: ['speed'],                  type: 'Normal' },
  { id: 'fog',     name: 'Fog',     leader: 'Morty',                                      type: 'Ghost' },
  { id: 'storm',   name: 'Storm',   leader: 'Chuck',                                      type: 'Fighting' },
  { id: 'mineral', name: 'Mineral', leader: 'Jasmine', stats: ['defense'],                type: 'Steel' },
  { id: 'glacier', name: 'Glacier', leader: 'Pryce',   stats: ['spattack', 'spdefense'],  type: 'Ice' },
  { id: 'rising',  name: 'Rising',  leader: 'Clair',                                      type: 'Dragon' },
  // Kanto — type boosts only
  { id: 'k_boulder', name: 'Boulder', leader: 'Brock',    type: 'Rock' },
  { id: 'k_cascade', name: 'Cascade', leader: 'Misty',    type: 'Water' },
  { id: 'k_thunder', name: 'Thunder', leader: 'Surge',    type: 'Electric' },
  { id: 'k_rainbow', name: 'Rainbow', leader: 'Erika',    type: 'Grass' },
  { id: 'k_soul',    name: 'Soul',    leader: 'Koga',     type: 'Poison' },
  { id: 'k_marsh',   name: 'Marsh',   leader: 'Sabrina',  type: 'Psychic' },
  { id: 'k_volcano', name: 'Volcano', leader: 'Blaine',   type: 'Fire' },
  { id: 'k_earth',   name: 'Earth',   leader: 'Giovanni', type: 'Ground' },
]

// FRLG uses the same badge-1/5/7 rule as RSE, so despite sharing Kanto's badges
// with Gen 1 the boosted stats differ: Soul (badge 5) raises Defense rather than
// Speed, and Thunder gives no boost at all.
const GEN3_FRLG_BADGES: Badge[] = [
  { id: 'boulder', name: 'Boulder', leader: 'Brock',    stats: ['attack'] },
  { id: 'cascade', name: 'Cascade', leader: 'Misty' },
  { id: 'thunder', name: 'Thunder', leader: 'Surge' },
  { id: 'rainbow', name: 'Rainbow', leader: 'Erika' },
  { id: 'soul',    name: 'Soul',    leader: 'Koga',     stats: ['defense'] },
  { id: 'marsh',   name: 'Marsh',   leader: 'Sabrina' },
  { id: 'volcano', name: 'Volcano', leader: 'Blaine',   stats: ['spattack', 'spdefense'] },
  { id: 'earth',   name: 'Earth',   leader: 'Giovanni' },
]

// Gen 3 boosts only Attack (badge 1), Defense (badge 5) and SpA+SpD (badge 7)
// in the damage formula. Badge 3 boosts Speed in the speed calc only.
const GEN3_RSE_BADGES: Badge[] = [
  { id: 'stone',   name: 'Stone',   leader: 'Roxanne',  stats: ['attack'] },
  { id: 'knuckle', name: 'Knuckle', leader: 'Brawly' },
  { id: 'dynamo',  name: 'Dynamo',  leader: 'Wattson',  stats: ['speed'] },
  { id: 'heat',    name: 'Heat',    leader: 'Flannery' },
  { id: 'balance', name: 'Balance', leader: 'Norman',   stats: ['defense'] },
  { id: 'feather', name: 'Feather', leader: 'Winona' },
  { id: 'mind',    name: 'Mind',    leader: 'Tate & Liza', stats: ['spattack', 'spdefense'] },
  { id: 'rain',    name: 'Rain',    leader: 'Wallace' },
]

export const BADGES_BY_GAME: Record<string, Badge[]> = {
  'Red and Blue':          GEN1_BADGES,
  'Yellow':                GEN1_BADGES,
  'Gold and Silver':       GEN2_BADGES,
  'Crystal':               GEN2_BADGES,
  'Ruby and Sapphire':     GEN3_RSE_BADGES,
  'Emerald':               GEN3_RSE_BADGES,
  'FireRed and LeafGreen': GEN3_FRLG_BADGES,
}

export function badgeGen(game: string): Gen | 0 {
  if (game === 'Red and Blue' || game === 'Yellow') return 1
  if (game === 'Gold and Silver' || game === 'Crystal') return 2
  if (game in BADGES_BY_GAME) return 3
  return 0
}

/** Every badge id for a game (the default — assume all badges are obtained). */
export function allBadgeIds(game: string): Set<string> {
  const list = BADGES_BY_GAME[game]
  return new Set(list ? list.map(b => b.id) : [])
}

export function badgeBoostsStat(statKey: BadgeStat, badges: Set<string>, game: string): boolean {
  const list = BADGES_BY_GAME[game]
  if (!list || badges.size === 0) return false
  return list.some(b => badges.has(b.id) && b.stats?.includes(statKey))
}

/** Gen 1–2: `stat + (stat >> 3)`, capped at 999. */
export function gen12BadgeBoost(stat: number): number {
  return Math.min(999, stat + (stat >> 3))
}

/** Gen 3: `floor(stat * 110 / 100)`. */
export function gen3BadgeBoost(stat: number): number {
  return Math.floor(stat * 110 / 100)
}

/**
 * Apply this game's badge stat boost to a raw stat. For Gen 1–2 Sp. Def this
 * is the *intended* boost; gen2.ts handles the Glacier bug separately.
 */
export function applyBadgeStatBoost(
  statValue: number,
  statKey:   BadgeStat,
  badges:    Set<string>,
  game:      string,
): number {
  if (!badgeBoostsStat(statKey, badges, game)) return statValue
  return badgeGen(game) === 3 ? gen3BadgeBoost(statValue) : gen12BadgeBoost(statValue)
}

/**
 * Gen 2 Glacier Badge Sp. Def bug (pokecrystal `BadgeStatBoosts.CheckBadge`,
 * CORE:6791-6824). The final `srl a / call c, BoostStat` for Sp. Def uses
 * register `a` as `BoostStat` left it after boosting Sp. Atk: for a boosted
 * Sp. Atk `S` below 999, `a = hi(S) - 3 - (lo(S) < 231)` and Sp. Def is
 * boosted iff bit 0 of that is set; for `S >= 999` the cap path leaves
 * `a = LOW(999) = 231` (bit 0 set). This trace gives: boosted when `S` is in
 * 231–486, 512–742 or ≥ 999. (pret's bugs_and_glitches.md phrases the second
 * range as "661 or above" in unboosted terms; the register trace above is
 * what the code does, and is what we follow.)
 *
 * Returns whether Sp. Def gets boosted given the *unboosted* Sp. Atk.
 */
export function gen2GlacierBoostsSpDef(unboostedSpAtk: number): boolean {
  const S = unboostedSpAtk + (unboostedSpAtk >> 3)
  if (S >= 999) return true
  const lo = S & 0xff
  const hi = (S >> 8) & 0xff
  const a = (hi - 3 - (lo < 231 ? 1 : 0)) & 0xff
  return (a & 1) === 1
}

/**
 * Whether any owned Gen 2 badge boosts moves of this type. Johto badges boost
 * types too (Zephyr→Flying … Rising→Dragon), not only the Kanto ones:
 * pokecrystal engine/battle/misc.asm DoBadgeTypeBoosts walks all 16 bits.
 */
export function hasBadgeTypeBoost(moveType: string, badges: Set<string>, game: string): boolean {
  if (badgeGen(game) !== 2) return false
  const list = BADGES_BY_GAME[game]
  if (!list) return false
  return list.some(b => badges.has(b.id) && b.type === moveType)
}
