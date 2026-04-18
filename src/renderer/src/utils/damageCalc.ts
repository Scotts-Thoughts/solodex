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

// ─── Held items ──────────────────────────────────────────────────────────────
//
// Damage-affecting held items. Type-boost items multiply final damage by 1.1×
// in Gen 2–3 and 1.2× in Gen 4+. Choice Band/Specs, Life Orb, etc. are Gen 3+
// / Gen 4+ introductions.

export interface HeldItem {
  id:        string
  name:      string
  minGen:    number
  group:     'none' | 'general' | 'species' | 'type-boost'
  moveType?: string    // for type-boost items
}

export const HELD_ITEMS: HeldItem[] = [
  // General
  { id: 'choice_band',   name: 'Choice Band',   minGen: 3, group: 'general' },
  { id: 'choice_specs',  name: 'Choice Specs',  minGen: 4, group: 'general' },
  { id: 'life_orb',      name: 'Life Orb',      minGen: 4, group: 'general' },
  { id: 'expert_belt',   name: 'Expert Belt',   minGen: 4, group: 'general' },
  { id: 'muscle_band',   name: 'Muscle Band',   minGen: 4, group: 'general' },
  { id: 'wise_glasses',  name: 'Wise Glasses',  minGen: 4, group: 'general' },

  // Species-specific
  { id: 'thick_club',    name: 'Thick Club',    minGen: 2, group: 'species' },
  { id: 'light_ball',    name: 'Light Ball',    minGen: 2, group: 'species' },

  // Type-boost
  { id: 'silk_scarf',    name: 'Silk Scarf',    minGen: 3, group: 'type-boost', moveType: 'Normal' },
  { id: 'charcoal',      name: 'Charcoal',      minGen: 2, group: 'type-boost', moveType: 'Fire' },
  { id: 'mystic_water',  name: 'Mystic Water',  minGen: 2, group: 'type-boost', moveType: 'Water' },
  { id: 'miracle_seed',  name: 'Miracle Seed',  minGen: 2, group: 'type-boost', moveType: 'Grass' },
  { id: 'magnet',        name: 'Magnet',        minGen: 2, group: 'type-boost', moveType: 'Electric' },
  { id: 'nevermeltice',  name: 'NeverMeltIce',  minGen: 2, group: 'type-boost', moveType: 'Ice' },
  { id: 'black_belt',    name: 'Black Belt',    minGen: 2, group: 'type-boost', moveType: 'Fighting' },
  { id: 'poison_barb',   name: 'Poison Barb',   minGen: 2, group: 'type-boost', moveType: 'Poison' },
  { id: 'soft_sand',     name: 'Soft Sand',     minGen: 2, group: 'type-boost', moveType: 'Ground' },
  { id: 'sharp_beak',    name: 'Sharp Beak',    minGen: 2, group: 'type-boost', moveType: 'Flying' },
  { id: 'twisted_spoon', name: 'Twisted Spoon', minGen: 2, group: 'type-boost', moveType: 'Psychic' },
  { id: 'silver_powder', name: 'Silver Powder', minGen: 2, group: 'type-boost', moveType: 'Bug' },
  { id: 'hard_stone',    name: 'Hard Stone',    minGen: 2, group: 'type-boost', moveType: 'Rock' },
  { id: 'spell_tag',     name: 'Spell Tag',     minGen: 2, group: 'type-boost', moveType: 'Ghost' },
  { id: 'dragon_fang',   name: 'Dragon Fang',   minGen: 3, group: 'type-boost', moveType: 'Dragon' },
  { id: 'black_glasses', name: 'BlackGlasses',  minGen: 2, group: 'type-boost', moveType: 'Dark' },
  { id: 'metal_coat',    name: 'Metal Coat',    minGen: 2, group: 'type-boost', moveType: 'Steel' },
]

const HELD_ITEM_MAP = new Map(HELD_ITEMS.map(i => [i.id, i]))

/**
 * Modifies the attacker's Atk/SpA stat based on held item (Choice Band/Specs,
 * Thick Club for Cubone/Marowak, Light Ball for Pikachu). Applied before the
 * damage formula — returns the modified stat.
 */
export function applyHeldItemAttackBoost(
  attackStat: number,
  heldItem:   string,
  species:    string,
  category:   MoveCategory,
  gen:        number,
): number {
  if (!heldItem) return attackStat
  switch (heldItem) {
    case 'choice_band':
      if (gen >= 3 && category === 'physical') return Math.floor(attackStat * 1.5)
      break
    case 'choice_specs':
      if (gen >= 4 && category === 'special') return Math.floor(attackStat * 1.5)
      break
    case 'thick_club':
      if ((species === 'Cubone' || species === 'Marowak') && category === 'physical') {
        return attackStat * 2
      }
      break
    case 'light_ball':
      if (species === 'Pikachu') {
        if (gen >= 4) return attackStat * 2
        if (category === 'special') return attackStat * 2
      }
      break
  }
  return attackStat
}

/**
 * Post-damage multiplier from held items (type-boost items, Life Orb,
 * Expert Belt, Muscle Band, Wise Glasses). Applied after STAB/effectiveness,
 * before the random roll.
 */
function applyHeldItemDamageMultiplier(
  damage:        number,
  heldItem:      string,
  moveType:      string,
  category:      MoveCategory,
  effectiveness: number,
  gen:           number,
): number {
  if (!heldItem) return damage
  const item = HELD_ITEM_MAP.get(heldItem)
  if (item && item.group === 'type-boost' && item.moveType === moveType) {
    const mult = gen >= 4 ? 1.2 : 1.1
    return Math.floor(damage * mult)
  }
  switch (heldItem) {
    case 'life_orb':
      if (gen >= 4) return Math.floor(damage * 1.3)
      break
    case 'expert_belt':
      if (gen >= 4 && effectiveness >= 2) return Math.floor(damage * 1.2)
      break
    case 'muscle_band':
      if (gen >= 4 && category === 'physical') return Math.floor(damage * 1.1)
      break
    case 'wise_glasses':
      if (gen >= 4 && category === 'special') return Math.floor(damage * 1.1)
      break
  }
  return damage
}

// ─── Badges ──────────────────────────────────────────────────────────────────
//
// Gen 1–2 badges boost a stat by 12.5% (×9/8) in battle. Gen 2 badges also
// boost the gym leader's move type by 12.5%. Gen 3 RSE and FRLG badges boost
// a stat by 10% (×11/10) — type boosts do not carry into Gen 3.
//
// Stat boosts are applied to the player's stat whenever it is read during
// damage calculation: offensive stat when the player attacks, defensive stat
// when the player is defending.
//
// Sources: pokered/engine/battle/core.asm (BadgeStatBoosts),
//          pokecrystal/engine/battle/core.asm,
//          pokeemerald/src/battle_util.c.

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

const GEN3_FRLG_BADGES: Badge[] = [
  { id: 'boulder', name: 'Boulder', leader: 'Brock',    stats: ['attack'] },
  { id: 'cascade', name: 'Cascade', leader: 'Misty' },
  { id: 'thunder', name: 'Thunder', leader: 'Surge',    stats: ['defense'] },
  { id: 'rainbow', name: 'Rainbow', leader: 'Erika' },
  { id: 'soul',    name: 'Soul',    leader: 'Koga',     stats: ['speed'] },
  { id: 'marsh',   name: 'Marsh',   leader: 'Sabrina' },
  { id: 'volcano', name: 'Volcano', leader: 'Blaine',   stats: ['spattack', 'spdefense'] },
  { id: 'earth',   name: 'Earth',   leader: 'Giovanni' },
]

const GEN3_RSE_BADGES: Badge[] = [
  { id: 'stone',   name: 'Stone',   leader: 'Roxanne',  stats: ['attack'] },
  { id: 'knuckle', name: 'Knuckle', leader: 'Brawly',   stats: ['defense'] },
  { id: 'dynamo',  name: 'Dynamo',  leader: 'Wattson',  stats: ['speed'] },
  { id: 'heat',    name: 'Heat',    leader: 'Flannery', stats: ['spattack'] },
  { id: 'balance', name: 'Balance', leader: 'Norman',   stats: ['spdefense'] },
  { id: 'feather', name: 'Feather', leader: 'Winona' },
  { id: 'mind',    name: 'Mind',    leader: 'Tate & Liza' },
  { id: 'rain',    name: 'Rain',    leader: 'Wallace' },
]

export const BADGES_BY_GAME: Record<string, Badge[]> = {
  'Red and Blue':         GEN1_BADGES,
  'Yellow':               GEN1_BADGES,
  'Gold and Silver':      GEN2_BADGES,
  'Crystal':              GEN2_BADGES,
  'Ruby and Sapphire':    GEN3_RSE_BADGES,
  'Emerald':              GEN3_RSE_BADGES,
  'FireRed and LeafGreen': GEN3_FRLG_BADGES,
}

/**
 * Apply badge stat boost to a stat value. 12.5% (×9/8) in Gen 1–2, 10% (×11/10)
 * in Gen 3. Returns the stat unchanged for games with no badge boost mechanic.
 */
export function applyBadgeStatBoost(
  statValue: number,
  statKey:   BadgeStat,
  badges:    Set<string>,
  game:      string,
): number {
  const list = BADGES_BY_GAME[game]
  if (!list || badges.size === 0) return statValue
  const hasBoost = list.some(b => badges.has(b.id) && b.stats?.includes(statKey))
  if (!hasBoost) return statValue
  const gen = game === 'Ruby and Sapphire' || game === 'Emerald' || game === 'FireRed and LeafGreen' ? 3 : 1
  return gen >= 3 ? Math.floor(statValue * 11 / 10) : Math.floor(statValue * 9 / 8)
}

/**
 * Whether any owned Gen 2 badge boosts moves of this type. Caller passes the
 * result as `badgeTypeBoost` to calcDamageRange.
 */
export function hasBadgeTypeBoost(moveType: string, badges: Set<string>, game: string): boolean {
  if (game !== 'Gold and Silver' && game !== 'Crystal') return false
  const list = BADGES_BY_GAME[game]
  if (!list) return false
  return list.some(b => badges.has(b.id) && b.type === moveType)
}

// ─── Stat stages ──────────────────────────────────────────────────────────────
//
// Gen 2+ stat stage formula (Gen 1 uses the same math in practice):
//   stage > 0 → stat × (2 + stage) / 2   (floored)
//   stage < 0 → stat × 2 / (2 - stage)   (floored)
// Stages clamp to [-6, +6]. Represents post-setup stats (Swords Dance, Amnesia,
// Growl, etc.) applied on top of base stat + item + badge boosts.

export interface StatStages {
  attack:    number
  defense:   number
  spattack:  number
  spdefense: number
}

export const DEFAULT_STAT_STAGES: StatStages = {
  attack: 0, defense: 0, spattack: 0, spdefense: 0,
}

export function applyStageMultiplier(stat: number, stage: number): number {
  if (stage === 0) return stat
  const s = Math.max(-6, Math.min(6, stage))
  const num = s > 0 ? 2 + s : 2
  const den = s > 0 ? 2 : 2 - s
  return Math.floor(stat * num / den)
}

// ─── Weather ──────────────────────────────────────────────────────────────────
//
// Gen 2+ damage-affecting weather:
//   Rain: Water ×1.5, Fire ×0.5
//   Sun:  Fire ×1.5,  Water ×0.5
// Sand/hail have only defender-type-specific effects (e.g. Rock SpD in Gen 4+)
// that we don't model here.

export type Weather = 'none' | 'rain' | 'sun'

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
  gen:             number,
  attackerLevel:   number,
  attackStat:      number,
  defenseStat:     number,
  power:           number,
  stab:            boolean,
  effectiveness:   number,
  category:        MoveCategory,
  defenderHP:      number,
  heldItem:        string = '',
  moveType:        string = '',
  badgeTypeBoost:  boolean = false,
  weather:         Weather = 'none',
  crit:            boolean = false,
): DamageRange {
  const none: DamageRange = {
    min: 0, max: 0, minPercent: 0, maxPercent: 0, effectiveness, stab, category,
  }
  if (power <= 0 || effectiveness === 0 || defenseStat <= 0 || defenderHP <= 0) return none

  // Base damage. Gen 1 crits double the level factor (≈2× damage) and the
  // caller must also pass UNMODIFIED attack/defense stats (no stage/badge
  // boosts) — this is why setup can make Gen 1 crits weaker than regular hits.
  // Gen 2+ crit mechanics are not modeled here.
  const effectiveLevel = crit && gen === 1 ? attackerLevel * 2 : attackerLevel
  const lf = Math.floor(2 * effectiveLevel / 5) + 2
  let d = Math.floor(Math.floor(lf * power * attackStat / defenseStat) / 50) + 2

  // STAB
  if (stab) d = Math.floor(d * 3 / 2)

  // Type effectiveness (separate integer operations per gen assembly behavior)
  if      (effectiveness === 4)    d = d * 2 * 2
  else if (effectiveness === 2)    d = d * 2
  else if (effectiveness === 0.5)  d = Math.floor(d / 2)
  else if (effectiveness === 0.25) d = Math.floor(Math.floor(d / 2) / 2)

  // Held item post-damage multiplier (type-boost, Life Orb, Expert Belt, etc.)
  d = applyHeldItemDamageMultiplier(d, heldItem, moveType, category, effectiveness, gen)

  // Gen 2 badge type boost (×9/8)
  if (badgeTypeBoost) d = Math.floor(d * 9 / 8)

  // Weather (Gen 2+)
  if (gen >= 2 && weather !== 'none') {
    if (weather === 'rain') {
      if (moveType === 'Water')      d = Math.floor(d * 3 / 2)
      else if (moveType === 'Fire')  d = Math.floor(d / 2)
    } else if (weather === 'sun') {
      if (moveType === 'Fire')       d = Math.floor(d * 3 / 2)
      else if (moveType === 'Water') d = Math.floor(d / 2)
    }
  }

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
