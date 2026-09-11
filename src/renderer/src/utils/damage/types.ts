/**
 * Shared contract for the per-generation damage pipelines.
 *
 * The per-gen files (gen1.ts … gen5.ts) each take a `CalcContext` and return
 * every possible damage roll. `index.ts` wraps them: it resolves the move
 * (variable power, fixed damage, multi-hit, …), runs the non-crit and crit
 * pipelines, and packages a `DamageResult` for the UI.
 *
 * Reference docs: docs/damage/gen{1..5}_damage_reference.md. Every rule the
 * pipelines implement is numbered there.
 */
import type { BaseStats, MoveData } from '../../types/pokemon'
import type { CalcStats, Gen12DVs, Gen3IVs } from './stats'

export type Gen = 1 | 2 | 3 | 4 | 5
export type MoveCategory = 'physical' | 'special'
export type Weather = 'none' | 'rain' | 'sun' | 'sand' | 'hail'
export type Status = 'none' | 'burn' | 'paralysis' | 'poison' | 'toxic' | 'sleep' | 'freeze'
export type Gender = 'M' | 'F' | 'N'

/** Stat stages, -6..+6. Gen 1 shares one "special" stage (spattack === spdefense). */
export interface StatStages {
  attack:    number
  defense:   number
  spattack:  number
  spdefense: number
  speed:     number
  accuracy:  number
  evasion:   number
}

export const ZERO_STAGES: StatStages = {
  attack: 0, defense: 0, spattack: 0, spdefense: 0, speed: 0, accuracy: 0, evasion: 0,
}

/**
 * Per-battler flags that change damage. All default to false. They are
 * grouped here (rather than in `Field`) because most belong to one side.
 */
export interface BattlerFlags {
  /** Reflect / Light Screen active on this battler's side (defender-side effect). */
  reflect?:      boolean
  lightScreen?:  boolean
  /** Focus Energy used (crit stage). */
  focusEnergy?:  boolean
  /** Charge used last turn (Electric ×2, Gen 3+). */
  charge?:       boolean
  /** Received Helping Hand this turn (Gen 3+ doubles). */
  helpingHand?:  boolean
  /** Flash Fire has been activated (Gen 3+). */
  flashFire?:    boolean
  /** Used Defense Curl (Rollout / Ice Ball ×2). */
  defenseCurl?:  boolean
  /** Used Minimize (Stomp-class doublers hit ×2). */
  minimized?:    boolean
  /** Currently in Fly / Bounce (Gust/Twister ×2, Gen 2+). */
  flying?:       boolean
  /** Currently in Dig (Earthquake/Magnitude ×2, Gen 2+). */
  underground?:  boolean
  /** Currently in Dive (Surf/Whirlpool ×2, Gen 3+). */
  underwater?:   boolean
  /** Target has been Foresighted / Odor Sleuthed (Ghost immunities dropped). */
  identified?:   boolean
  /** Target has been Miracle Eyed (Gen 4+: Psychic→Dark immunity dropped). */
  miracleEyed?:  boolean
  /** Ingrain / Iron Ball / Gravity grounded (Gen 4+: Ground hits Flying/Levitate). */
  grounded?:     boolean
  /** Roosted this turn (Gen 4+: Flying type dropped). */
  roosted?:      boolean
  /** Magnet Rise active (Gen 4+). */
  magnetRise?:   boolean
  /** Transformed (Metal Powder / Griseous Orb checks). */
  transformed?:  boolean
  /** Can still evolve (Eviolite, Gen 5). */
  notFullyEvolved?: boolean
  /** Slow Start: still within the first five turns. */
  slowStartActive?: boolean
  /** Already moved this turn (Payback / Analytic / Assurance). */
  movedThisTurn?: boolean
  /** Took damage this turn (Revenge / Avalanche / Assurance). */
  damagedThisTurn?: boolean
  /** Is switching out this turn (Pursuit ×2). */
  switchingOut?: boolean
  /** An ally with Plus/Minus is on the field (Plus/Minus ×1.5). */
  partnerPlusMinus?: boolean
  /** A Cherrim with Flower Gift is on this side (Gen 4+). */
  flowerGiftAlly?: boolean
  /** An ally with Friend Guard (Gen 5). */
  friendGuardAlly?: boolean
}

/** Per-move counters the user can set (Rollout turn, stockpiles, …). */
export type CounterKey =
  | 'rolloutTurn'      // 0..4 consecutive prior hits
  | 'furyCutterTurn'   // 0..n consecutive prior uses
  | 'echoedVoiceTurn'  // 0..4
  | 'rageCounter'      // Gen 2 Rage ×(1+n)
  | 'stockpile'        // 1..3
  | 'metronomeUses'    // consecutive prior uses of the same move with the Metronome item
  | 'trumpCardPP'      // PP remaining after use
  | 'tripleKickHits'   // 1..3 — how many kicks landed (for display of totals)

export interface PartyMember {
  species:   string
  level:     number
  baseStats: BaseStats
  /** Fainted or statused members are skipped by Beat Up. */
  usable:    boolean
}

/**
 * Everything about one battler the damage formulas can read. Stats are the
 * raw in-battle values: level/DV/IV/EV/nature applied, **no** stat stages, no
 * badge boosts, no item/ability multipliers — the pipelines apply those.
 */
export interface BattlerState {
  species:    string
  level:      number
  types:      [string, string]
  stats:      CalcStats
  baseStats:  BaseStats
  stages:     StatStages
  /** Canonical item id (see items.ts `itemId`), or null. */
  item:       string | null
  /** Canonical ability id (see abilities.ts `abilityId`), or null. */
  ability:    string | null
  status:     Status
  currentHp:  number
  weight:     number          // kg
  friendship: number          // 0..255
  gender:     Gender
  dvs?:       Gen12DVs
  ivs?:       Gen3IVs
  /** Owned badge ids (player only; empty for the enemy). */
  badges:     Set<string>
  isPlayer:   boolean
  flags:      BattlerFlags
  counters:   Partial<Record<CounterKey, number>>
  /** For Beat Up. Defaults to the battler alone. */
  party?:     PartyMember[]
}

export interface Field {
  game:       string
  gen:        Gen
  weather:    Weather
  /** Double battle. Enables spread reduction and doubles screen fractions. */
  isDoubles:  boolean
  /** Living Pokémon on the defender's side (doubles). 1 or 2. */
  defendersAlive: 1 | 2
  /** Living Pokémon other than the defender (Gen 4 RANGE_ALL_ADJACENT). */
  otherBattlersAlive: number
  mudSport:   boolean
  waterSport: boolean
  gravity:    boolean
  /** Gen 2: link battles use single-pass stat truncation and no badges. */
  isLinkBattle: boolean
}

export const DEFAULT_FIELD: Omit<Field, 'game' | 'gen'> = {
  weather: 'none', isDoubles: false, defendersAlive: 1, otherBattlersAlive: 1,
  mudSport: false, waterSport: false, gravity: false, isLinkBattle: false,
}

/** Per-move options set by the UI (assumption pills). */
export interface MoveOptions {
  /** For conditional doublers (Facade, Revenge, Payback, …): condition met? */
  conditionMet?:   boolean
  /** Counter / Mirror Coat / Metal Burst / Bide: damage taken. */
  incomingDamage?: number
  /** Hidden Power: chosen type (overrides DV/IV derivation when set). */
  hiddenPowerType?: string
  /** Present / Magnitude: force one outcome (else the distribution is used). */
  forcedPower?:    number
  /** Fling: item's fling power. Natural Gift: berry power/type. */
  flingPower?:     number
  naturalGift?:    { power: number; type: string }
  /** Multi-hit: force a hit count. */
  hits?:           number
  /** Judgment / Techno Blast / Weather Ball etc. explicit type override. */
  typeOverride?:   string
}

export type ResultKind =
  | 'range'    // normal damage roll range
  | 'fixed'    // fixed damage (Seismic Toss, Dragon Rage, …)
  | 'ohko'     // one-hit KO move
  | 'reflect'  // Counter / Mirror Coat / Bide / Metal Burst
  | 'immune'   // type / ability immunity
  | 'none'     // no damage (status move, unusable, power 0)

export interface Assumption {
  key:   keyof MoveOptions | CounterKey | 'friendship' | 'hp' | 'party' | 'weight'
  label: string
  value: string | number | boolean
}

export interface HitDistribution {
  /** [hits, probability] pairs. */
  distribution: Array<[number, number]>
  /** Per-hit power when hits differ (Triple Kick 10/20/30, Beat Up). */
  perHitPower?: number[]
  min: number
  max: number
  /** Total damage range over all hits (min hits × min roll … max hits × max roll). */
  totalMin?: number
  totalMax?: number
  /** Every hit has its own accuracy check; a miss ends the move (Triple Kick, Gen 3+). */
  perHitAccuracy?: boolean
  /** Gen 1: one damage roll and one crit check are reused for every hit. */
  sameRoll?: boolean
}

export interface DamageRolls {
  /** Every possible outcome, ascending. Uniform unless `dist` is present. */
  rolls: number[]
  /** Non-uniform outcome distribution ([damage, probability]), ascending. */
  dist?: Array<[number, number]>
  min:   number
  max:   number
}

export interface DamageResult extends DamageRolls {
  kind:          ResultKind
  move:          string
  moveType:      string
  category:      MoveCategory
  /** Base power actually used (after variable-power resolution). 0 for fixed. */
  power:         number
  effectiveness: number      // 0 | 0.25 | 0.5 | 1 | 2 | 4 (chart product, for display)
  stab:          boolean
  minPercent:    number
  maxPercent:    number
  /** Same move on a critical hit (absent when the move cannot crit). */
  crit?:         DamageRolls
  /** Probability of a critical hit, 0..1. */
  critChance:    number
  /**
   * Probability that one use connects: move accuracy after accuracy/evasion
   * stages, items, abilities and weather (Gen 1: the 255/256 cap). 1 for
   * moves that cannot miss; 0 when the move cannot hit at all (OHKO level
   * rule, semi-invulnerable target). See accuracy.ts.
   */
  hitChance:     number
  /** How `hitChance` was derived ("85% accuracy", "Acc +1 ×1.33", …). */
  hitNotes:      string[]
  hits?:         HitDistribution
  /** False Swipe: always leaves the target at 1 HP. */
  nonLethal?:    boolean
  /** Recoil / drain in HP, based on min/max damage. */
  recoil?:       { min: number; max: number; label: string }
  drain?:        { min: number; max: number }
  notes:         string[]
  assumptions:   Assumption[]
}

/** Move as seen by a pipeline after `resolveMove`. */
export interface ResolvedMove {
  name:      string
  data:      MoveData
  type:      string
  category:  MoveCategory
  power:     number
  kind:      ResultKind
  /** For `fixed` kind: every possible damage value (uniform). */
  fixedDamage?: number[]
  /** For non-uniform power moves (Present, Magnitude): [power, p] pairs. */
  powerDist?: Array<[number, number]>
  flags: {
    noStab?:            boolean   // Struggle (Gen 2+), Future Sight, Beat Up
    noTypeChart?:       boolean   // Struggle (Gen 2+), Future Sight (3–4), Beat Up (2–4)
    ignoreImmunities?:  boolean   // Future Sight / Beat Up (Gen 4): skip immunities too
    noRandom?:          boolean   // Flail/Reversal (Gen 2), Spit Up (3–4), fixed moves
    noCrit?:            boolean   // Flail/Reversal (Gen 2), Future Sight, Spit Up
    selfDestruct?:      boolean   // halves defence (Gen 1–4)
    highCrit?:          boolean   // +1 crit stage (Gen 2+), ×8 (Gen 1)
    alwaysCrit?:        boolean   // Frost Breath / Storm Throw (Gen 5)
    recoil?:            { num: number; den: number; label: string }
    drain?:             boolean
    punch?:             boolean
    contact?:           boolean
    hasSecondary?:      boolean   // Sheer Force
    spread?:            'both' | 'all' | 'single'   // doubles targeting
    /** Gen 3 sDMG_MULTIPLIER ×2 / Gen 4 powerMul 20 / Gen 5 BP ×2 or final ×2. */
    doubler?:           'power' | 'damage' | 'final'
    doublerActive?:     boolean
    /** Gen 2 post-random doublers (Dig/Fly/Minimize/Pursuit). */
    postRandomMul?:     number
    /** Gen 2 pre-random multipliers (Rollout, Fury Cutter, Rage). */
    preRandomMul?:      number
    /** Gen 4 Reckless: powerMul 12. */
    powerMul?:          number
    /** Gen 5: uses the target's Attack (Foul Play) / hits Defense (Psyshock). */
    useTargetAttack?:   boolean
    hitsDefense?:       boolean
    ignoreDefenseStages?: boolean   // Chip Away / Sacred Sword
    /** Spit Up: ×stockpile after base damage (Gen 3–4). */
    stockpileMul?:      number
    /** Beat Up (Gen 2–4): per-member base stat formula. */
    beatUp?:            { attackBase: number; defenseBase: number; level: number }[]
  }
  hits?:       HitDistribution
  notes:       string[]
  assumptions: Assumption[]
}

export interface CalcContext {
  attacker: BattlerState
  defender: BattlerState
  move:     ResolvedMove
  field:    Field
  crit:     boolean
}

/** What a gen pipeline returns for one (crit | non-crit) pass. */
export interface PipelineOutput {
  rolls:         number[]
  dist?:         Array<[number, number]>
  effectiveness: number
  stab:          boolean
  immune:        boolean
  notes?:        string[]
}
