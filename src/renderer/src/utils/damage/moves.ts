/**
 * Move resolution: turns a raw `MoveData` entry plus battle state into a
 * `ResolvedMove` the gen pipelines can consume — effective type, category,
 * base power (variable-power formulas), fixed-damage values, multi-hit
 * distributions and per-move flags.
 *
 * Every formula cites the reference doc rule it comes from:
 *   G1 = docs/damage/gen1_damage_reference.md, G2 = gen2, … G5 = gen5.
 */
import type { MoveData } from '../../types/pokemon'
import type {
  Assumption, BattlerState, Field, Gen, HitDistribution, MoveCategory, MoveOptions, ResolvedMove,
} from './types'
import { getItem, speciesItem, itemActiveInGen } from './items'
import { applyStage } from './stages'
import { applyMod } from './math'

// ─── Physical / special ─────────────────────────────────────────────────────

const PHYSICAL_TYPES_GEN123 = new Set([
  'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
])

/** Gen 1–3: category follows the (effective) move type. Gen 4+: the move's own class. */
export function moveCategory(gen: Gen, moveType: string, dataCategory: string): MoveCategory {
  if (gen >= 4) return String(dataCategory).toLowerCase() === 'special' ? 'special' : 'physical'
  return PHYSICAL_TYPES_GEN123.has(moveType) ? 'physical' : 'special'
}

// ─── Hidden Power ───────────────────────────────────────────────────────────

export const HIDDEN_POWER_TYPES = [
  'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark',
] as const

/** Gen 2: power 31–70 and type from DVs (G2 §6.9). */
export function hiddenPowerGen2(dvs: { attack: number; defense: number; speed: number; special: number }) {
  const x = ((dvs.attack & 8) ? 8 : 0) + ((dvs.defense & 8) ? 4 : 0) + ((dvs.speed & 8) ? 2 : 0) + ((dvs.special & 8) ? 1 : 0)
  const power = Math.floor((5 * x + (dvs.special & 3)) / 2) + 31
  const t = 4 * (dvs.attack & 3) + (dvs.defense & 3)
  return { power, type: HIDDEN_POWER_TYPES[t] }
}

/** Gen 3–5: power 30–70 and type from IVs (G3 §4.3, G4 §3.4, G5 §2.3). */
export function hiddenPowerGen3(ivs: { hp: number; attack: number; defense: number; speed: number; spattack: number; spdefense: number }) {
  const order = [ivs.hp, ivs.attack, ivs.defense, ivs.speed, ivs.spattack, ivs.spdefense]
  let t = 0, p = 0
  order.forEach((iv, i) => { t += (iv & 1) << i; p += ((iv >> 1) & 1) << i })
  return { power: Math.floor(p * 40 / 63) + 30, type: HIDDEN_POWER_TYPES[Math.floor(t * 15 / 63)] }
}

// ─── Tables ─────────────────────────────────────────────────────────────────

/** High-crit moves by gen where the data's effect id doesn't say so. */
const HIGH_CRIT_GEN1 = new Set(['Karate Chop', 'Razor Leaf', 'Crabhammer', 'Slash'])
const HIGH_CRIT_GEN2 = new Set(['Karate Chop', 'Razor Wind', 'Razor Leaf', 'Crabhammer', 'Slash', 'Aeroblast', 'Cross Chop'])
const HIGH_CRIT_EFFECTS = new Set([
  'high_crit_rate', 'may_burn_and_high_crit_rate', 'may_poison_and_high_crit_rate', 'sky_attack', 'razor_wind',
])

/** Gen 4+ Iron Fist punching moves (pokeplatinum sPunchingMoves). */
const PUNCH_MOVES = new Set([
  'Ice Punch', 'Fire Punch', 'Thunder Punch', 'Mach Punch', 'Focus Punch', 'Dizzy Punch', 'Dynamic Punch',
  'Hammer Arm', 'Mega Punch', 'Comet Punch', 'Meteor Mash', 'Shadow Punch', 'Drain Punch', 'Bullet Punch',
  'Sky Uppercut',
])

/** Multi-hit 2–5 distributions. Gen 1–4: 3/8 3/8 1/8 1/8; Gen 5: 35/35/15/15. */
function multiHitDist(gen: Gen, skillLink: boolean): Array<[number, number]> {
  if (skillLink) return [[5, 1]]
  return gen >= 5
    ? [[2, 0.35], [3, 0.35], [4, 0.15], [5, 0.15]]
    : [[2, 3 / 8], [3, 3 / 8], [4, 1 / 8], [5, 1 / 8]]
}

function hits(distribution: Array<[number, number]>, perHitPower?: number[]): HitDistribution {
  return {
    distribution,
    perHitPower,
    min: Math.min(...distribution.map(d => d[0])),
    max: Math.max(...distribution.map(d => d[0])),
  }
}

/** Flail / Reversal thresholds. */
function flailPower(gen: Gen, hp: number, maxHp: number): number {
  if (gen === 4) {
    // G4 §3.4: p = hp*64/maxHP, min 1 if hp > 0
    let p = Math.floor(hp * 64 / maxHp)
    if (p === 0 && hp > 0) p = 1
    return p <= 1 ? 200 : p <= 5 ? 150 : p <= 12 ? 100 : p <= 21 ? 80 : p <= 42 ? 40 : 20
  }
  // G2 §6.14 (with the /4 quirk over 255 max HP), G3 §4.3, G5 §2.1: 48-scale
  let q: number
  if (gen === 2 && maxHp > 255) q = Math.floor(Math.floor(hp * 48 / 4) / Math.floor(maxHp / 4))
  else q = Math.floor(hp * 48 / maxHp)
  if (gen >= 3 && q === 0 && hp > 0) q = 1
  return q <= 1 ? 200 : q <= 4 ? 150 : q <= 9 ? 100 : q <= 16 ? 80 : q <= 32 ? 40 : 20
}

/** Low Kick / Grass Knot from target weight in kg. */
function weightPower(gen: Gen, kg: number): number {
  if (gen === 4) {
    // G4 §3.4: 0.1 kg units, `<=` thresholds
    const w = Math.round(kg * 10)
    return w <= 100 ? 20 : w <= 250 ? 40 : w <= 500 ? 60 : w <= 1000 ? 80 : w <= 2000 ? 100 : 120
  }
  // G3 §4.3 (`threshold > weight`) and G5 §2.1 (`>=`): identical
  return kg < 10 ? 20 : kg < 25 ? 40 : kg < 50 ? 60 : kg < 100 ? 80 : kg < 200 ? 100 : 120
}

/** Effective weight for Gen 5 (Heavy/Light Metal, Float Stone) in kg. */
function gen5Weight(b: BattlerState): number {
  let w = b.weight
  if (b.ability === 'heavymetal') w *= 2
  if (b.ability === 'lightmetal') w /= 2
  if (b.item === 'floatstone') w /= 2
  return Math.max(0.1, w)
}

/** Fully modified speed for Gyro Ball / Electro Ball (stages, paralysis). */
function battleSpeed(gen: Gen, b: BattlerState): number {
  let s = applyStage(gen, b.stats.speed, b.stages.speed)
  if (b.item === 'choicescarf') s = Math.floor(s * 3 / 2)
  if (b.item === 'ironball') s = Math.floor(s / 2)
  if (b.status === 'paralysis' && b.ability !== 'quickfeet') s = Math.floor(s / 4)
  return Math.max(1, s)
}

const sumPositiveStages = (b: BattlerState): number =>
  (['attack', 'defense', 'spattack', 'spdefense', 'speed', 'accuracy', 'evasion'] as const)
    .reduce((n, k) => n + Math.max(0, b.stages[k]), 0)

// ─── Doubles targeting ──────────────────────────────────────────────────────
//
// Gen 3  pokeemerald src/data/battle_moves.h: MOVE_TARGET_BOTH (halved) vs
//        MOVE_TARGET_FOES_AND_ALLY (not halved — G3 #8).
// Gen 4  pokeplatinum res/moves/*/data.json: RANGE_ADJACENT_OPPONENTS and
//        RANGE_ALL_ADJACENT both ×3/4 (G4 #12).
// Gen 5  same sets as Gen 4 (Surf/Discharge/Lava Plume hit allies too); ×0.75
//        when ≥2 targets are alive (G5 #7).
const SPREAD_BOTH_GEN3 = new Set(['Razor Wind', 'Acid', 'Surf', 'Blizzard', 'Razor Leaf', 'Swift', 'Bubble', 'Rock Slide',
  'Powder Snow', 'Icy Wind', 'Twister', 'Heat Wave', 'Eruption', 'Hyper Voice', 'Air Cutter', 'Water Spout', 'Muddy Water'])
const SPREAD_ALL_GEN3 = new Set(['Earthquake', 'Self-Destruct', 'Explosion', 'Magnitude'])
const SPREAD_BOTH_GEN45 = new Set(['Acid', 'Air Cutter', 'Blizzard', 'Bubble', 'Eruption', 'Heat Wave', 'Hyper Voice', 'Icy Wind',
  'Muddy Water', 'Powder Snow', 'Razor Leaf', 'Razor Wind', 'Rock Slide', 'Swift', 'Twister', 'Water Spout',
  // Gen 5 additions
  'Struggle Bug', 'Electroweb', 'Snarl', 'Glaciate', 'Relic Song', 'Incinerate', 'Dazzling Gleam'])
const SPREAD_ALL_GEN45 = new Set(['Discharge', 'Earthquake', 'Explosion', 'Lava Plume', 'Magnitude', 'Self-Destruct', 'Surf',
  // Gen 5 additions
  'Bulldoze', 'Sludge Wave', 'Searing Shot', 'Synchronoise', 'Petal Blizzard'])

function spreadKind(gen: Gen, name: string): 'both' | 'all' | 'single' {
  if (gen <= 2) return 'single'
  if (gen === 3) return SPREAD_BOTH_GEN3.has(name) ? 'both' : SPREAD_ALL_GEN3.has(name) ? 'all' : 'single'
  return SPREAD_BOTH_GEN45.has(name) ? 'both' : SPREAD_ALL_GEN45.has(name) ? 'all' : 'single'
}

// ─── Resolver ───────────────────────────────────────────────────────────────

const OHKO_MOVES = new Set(['Guillotine', 'Horn Drill', 'Fissure', 'Sheer Cold'])
const FIXED_LEVEL = new Set(['Seismic Toss', 'Night Shade'])

export function resolveMove(
  rawName: string,
  data: MoveData,
  gen: Gen,
  attacker: BattlerState,
  defender: BattlerState,
  field: Field,
  opts: MoveOptions = {},
): ResolvedMove {
  // Trainer data uses older spellings ("ThunderPunch", "Selfdestruct");
  // the move record carries the canonical modern name every check below uses.
  const name = data.move || rawName
  const notes: string[] = []
  const assumptions: Assumption[] = []
  const flags: ResolvedMove['flags'] = {}
  const effect = data.effect
  let type = data.type
  let power = data.power ?? 0
  let kind: ResolvedMove['kind'] = String(data.category).toLowerCase() === 'status' ? 'none' : 'range'
  let fixedDamage: number[] | undefined
  let powerDist: Array<[number, number]> | undefined
  let hitDist: HitDistribution | undefined

  const maxHp = attacker.stats.hp
  const hp = Math.max(1, Math.min(attacker.currentHp, maxHp))
  const defMaxHp = defender.stats.hp
  const defHp = Math.max(1, Math.min(defender.currentHp, defMaxHp))
  const cond = opts.conditionMet ?? false
  const condAssumption = (label: string) =>
    assumptions.push({ key: 'conditionMet', label, value: cond })

  if (data.makes_contact) flags.contact = true
  if (PUNCH_MOVES.has(name)) flags.punch = true
  // Sheer Force: secondary effects on the target (or chance-based self boosts),
  // not guaranteed self stat drops (Hammer Arm, Overheat, Close Combat …).
  if (data.effect_chance != null && data.effect_chance > 0 && !/^lower_self_/.test(effect)) flags.hasSecondary = true

  // Doubles targeting (for spread reduction), from the ROM target tables
  // rather than the app data's modern targeting (Gen 3 Surf hits foes only).
  flags.spread = spreadKind(gen, name)

  // ── High-crit ────────────────────────────────────────────────────────────
  // Gen 3's Razor Wind is not high-crit (EFFECT_RAZOR_WIND); it became so in Gen 4.
  if (gen === 1 ? HIGH_CRIT_GEN1.has(name)
    : gen === 2 ? HIGH_CRIT_GEN2.has(name)
    : HIGH_CRIT_EFFECTS.has(effect) && !(gen === 3 && effect === 'razor_wind')) {
    flags.highCrit = true
  }
  if (gen >= 5 && (name === 'Frost Breath' || name === 'Storm Throw')) { flags.alwaysCrit = true; flags.highCrit = false }

  // ── Recoil / drain ───────────────────────────────────────────────────────
  if (name === 'Struggle') {
    flags.noStab = gen >= 2
    flags.noTypeChart = gen >= 2
    flags.ignoreImmunities = gen >= 2
    if (gen >= 2) notes.push('Struggle ignores type and STAB (hits Ghosts neutrally)')
    flags.recoil = gen <= 1 ? { num: 1, den: 2, label: '½ damage dealt' }
      : gen === 2 ? { num: 1, den: 4, label: '¼ damage dealt' }
      : gen === 3 ? { num: 1, den: 4, label: '¼ damage dealt' }
      : { num: 1, den: 4, label: '¼ max HP' }
  } else if (effect === 'quarter_recoil_on_hit') {
    flags.recoil = { num: 1, den: 4, label: '¼ damage dealt' }
  } else if (effect === 'third_recoil_on_hit' || effect === 'third_recoil_and_may_burn' || effect === 'third_recoil_may_paralyze') {
    flags.recoil = { num: 1, den: 3, label: '⅓ damage dealt' }
  } else if (effect === 'half_recoil') {
    flags.recoil = { num: 1, den: 2, label: '½ damage dealt' }
  }
  if (gen === 2 && flags.recoil && name !== 'Struggle') flags.recoil = { num: 1, den: 4, label: '¼ damage dealt' } // G2 rule 37
  if (effect === 'drain_hp_on_hit' || effect === 'drain_hp' || effect === 'dream_eater') flags.drain = true
  if (effect === 'dream_eater') notes.push('Only works on a sleeping target')
  if (effect === 'recoil_on_miss' || name === 'High Jump Kick' || name === 'Hi Jump Kick') {
    notes.push(gen === 1 ? 'Miss: 1 HP crash damage' : gen === 2 ? 'Miss: ⅛ of the damage as crash damage'
      : gen === 3 ? 'Miss: ½ of the damage as crash damage' : gen === 4 ? 'Miss: ½ of the damage as crash damage' : 'Miss: ½ max HP crash damage')
  }
  // Reckless (Gen 4 powerMul 12): recoil moves and Jump Kick / High Jump Kick
  // (effect_script_0045.s, 0048, 0198, 0253, 0262, 0269). Not Struggle.
  const crashes = effect === 'recoil_on_miss' || name === 'High Jump Kick' || name === 'Jump Kick'
  if ((flags.recoil || crashes) && gen === 4 && name !== 'Struggle' && attacker.ability === 'reckless') flags.powerMul = 12

  // ── Self-destruct ────────────────────────────────────────────────────────
  if (name === 'Explosion' || name === 'Self-Destruct' || name === 'Selfdestruct') {
    if (gen <= 4) { flags.selfDestruct = true; notes.push("Target's Defense halved") }
    notes.push('User faints')
  }

  // ── Fixed damage ─────────────────────────────────────────────────────────
  if (FIXED_LEVEL.has(name)) {
    kind = 'fixed'; fixedDamage = [attacker.level]
  } else if (name === 'Sonic Boom') {
    kind = 'fixed'; fixedDamage = [20]
  } else if (name === 'Dragon Rage') {
    kind = 'fixed'; fixedDamage = [40]
  } else if (name === 'Psywave') {
    kind = 'fixed'
    const L = attacker.level
    if (gen === 1) {
      const b = L + Math.floor(L / 2)
      const lo = attacker.isPlayer ? 1 : 0
      fixedDamage = []
      for (let v = lo; v < b; v++) fixedDamage.push(v)
      if (!attacker.isPlayer) notes.push('Enemy Psywave can roll 0 (G1 §7.1)')
    } else if (gen === 2) {
      fixedDamage = []
      for (let v = 1; v <= Math.floor(1.5 * L) - 1; v++) fixedDamage.push(v)
    } else if (gen === 3) {
      fixedDamage = []
      for (let k = 0; k <= 10; k++) fixedDamage.push(Math.floor(L * (50 + 10 * k) / 100))
    } else if (gen === 4) {
      fixedDamage = []
      for (let r = 5; r <= 15; r++) fixedDamage.push(Math.max(1, Math.floor(L * r / 10)))
    } else {
      fixedDamage = []
      for (let r = 50; r <= 150; r++) fixedDamage.push(Math.max(1, Math.floor(r * L / 100)))
    }
  } else if (name === 'Super Fang') {
    kind = 'fixed'; fixedDamage = [Math.max(1, Math.floor(defHp / 2))]
    assumptions.push({ key: 'hp', label: 'Target HP', value: defHp })
  } else if (name === 'Endeavor') {
    kind = 'fixed'
    fixedDamage = defHp > hp ? [defHp - hp] : [0]
    if (defHp <= hp) notes.push('Fails: target HP is not above yours')
    assumptions.push({ key: 'hp', label: 'HP difference', value: `${defHp} − ${hp}` })
  } else if (name === 'Final Gambit') {
    kind = 'fixed'; fixedDamage = [hp]
    notes.push('User faints')
    assumptions.push({ key: 'hp', label: 'Your HP', value: hp })
  } else if (OHKO_MOVES.has(name)) {
    kind = 'ohko'
    if (gen === 1) notes.push('Hits only if your Speed ≥ target Speed; 30% accuracy')
    else if (gen === 2) notes.push(`Accuracy ${Math.min(255, 76 + 2 * (attacker.level - defender.level))}/256; fails if your level is lower`)
    else notes.push(`Accuracy ${Math.max(0, 30 + attacker.level - defender.level)}%; fails if your level is lower${gen >= 3 ? '; blocked by Sturdy' : ''}`)
    if (attacker.level < defender.level && gen >= 2) notes.push('Fails: your level is lower than the target\'s')
  } else if (name === 'Counter' || name === 'Mirror Coat' || name === 'Metal Burst' || name === 'Bide') {
    kind = 'reflect'
    const incoming = opts.incomingDamage ?? 0
    const mult = name === 'Metal Burst' ? 1.5 : 2
    fixedDamage = [Math.floor(incoming * mult)]
    assumptions.push({ key: 'incomingDamage', label: name === 'Bide' ? 'Damage taken while biding' : 'Damage taken', value: incoming })
    notes.push(name === 'Counter' ? (gen === 1 ? '2× the last Normal/Fighting hit taken' : '2× the last physical hit taken')
      : name === 'Mirror Coat' ? '2× the last special hit taken'
      : name === 'Metal Burst' ? '1.5× the last hit taken'
      : '2× all damage taken while biding')
    if (name === 'Bide' && gen === 4) notes.push('Gen 4 Bide still receives STAB and type effectiveness')
  }

  // ── Variable power ───────────────────────────────────────────────────────
  if (kind === 'range') {
    switch (true) {
      case name === 'Hidden Power': {
        if (gen === 1) break
        let hpType: string, hpPower: number
        if (gen === 2 && attacker.dvs) ({ type: hpType, power: hpPower } = hiddenPowerGen2(attacker.dvs))
        else if (attacker.ivs) ({ type: hpType, power: hpPower } = hiddenPowerGen3(attacker.ivs))
        else { hpType = 'Dark'; hpPower = 70 }
        if (opts.hiddenPowerType) hpType = opts.hiddenPowerType
        type = hpType; power = hpPower
        assumptions.push({ key: 'hiddenPowerType', label: 'Hidden Power', value: `${hpType} ${hpPower}` })
        break
      }
      case name === 'Return': {
        const f = attacker.friendship
        power = Math.floor(f * 10 / 25)
        if (power === 0 && gen >= 3) power = 1
        assumptions.push({ key: 'friendship', label: 'Friendship', value: f })
        break
      }
      case name === 'Frustration': {
        const f = attacker.friendship
        power = Math.floor((255 - f) * 10 / 25)
        if (power === 0 && gen >= 3) power = 1
        assumptions.push({ key: 'friendship', label: 'Friendship', value: f })
        break
      }
      case name === 'Flail' || name === 'Reversal': {
        power = flailPower(gen, hp, maxHp)
        if (gen === 2) { flags.noCrit = true; flags.noRandom = true; notes.push('Gen 2 Flail/Reversal: no crit, no random spread') }
        assumptions.push({ key: 'hp', label: 'Your HP', value: `${hp}/${maxHp}` })
        break
      }
      case name === 'Eruption' || name === 'Water Spout': {
        power = Math.max(1, Math.floor(hp * 150 / maxHp))
        assumptions.push({ key: 'hp', label: 'Your HP', value: `${hp}/${maxHp}` })
        break
      }
      case name === 'Wring Out' || name === 'Crush Grip': {
        if (gen === 4) power = 1 + Math.floor(120 * defHp / defMaxHp)
        else {
          const hpFP = Math.floor(defHp * 4096 / defMaxHp)
          power = Math.floor(Math.floor((120 * (100 * hpFP) + 2048 - 1) / 4096) / 100) || 1
        }
        assumptions.push({ key: 'hp', label: 'Target HP', value: `${defHp}/${defMaxHp}` })
        break
      }
      case name === 'Low Kick' && gen >= 3:
      case name === 'Grass Knot': {
        const kg = gen >= 5 ? gen5Weight(defender) : defender.weight
        power = weightPower(gen, kg)
        assumptions.push({ key: 'weight', label: 'Target weight', value: `${kg} kg` })
        break
      }
      case name === 'Heavy Slam' || name === 'Heat Crash': {
        const W = Math.floor(gen5Weight(attacker) / gen5Weight(defender))
        power = W >= 5 ? 120 : W === 4 ? 100 : W === 3 ? 80 : W === 2 ? 60 : 40
        assumptions.push({ key: 'weight', label: 'Weight ratio', value: W })
        break
      }
      case name === 'Gyro Ball': {
        const us = battleSpeed(gen, attacker), ts = battleSpeed(gen, defender)
        power = Math.min(150, 1 + Math.floor(25 * ts / us))
        assumptions.push({ key: 'hp', label: 'Speeds', value: `${ts} vs ${us}` })
        break
      }
      case name === 'Electro Ball': {
        const S = Math.floor(battleSpeed(gen, attacker) / battleSpeed(gen, defender))
        power = S >= 4 ? 150 : S === 3 ? 120 : S === 2 ? 80 : S === 1 ? 60 : 40
        break
      }
      case name === 'Punishment': {
        power = Math.min(200, 60 + 20 * sumPositiveStages(defender))
        break
      }
      case name === 'Stored Power': {
        power = 20 + 20 * sumPositiveStages(attacker)
        break
      }
      case name === 'Trump Card': {
        const pp = attacker.counters.trumpCardPP ?? 4
        power = pp === 0 ? 200 : pp === 1 ? 80 : pp === 2 ? 60 : pp === 3 ? 50 : 40
        assumptions.push({ key: 'trumpCardPP', label: 'PP left', value: pp })
        break
      }
      case name === 'Present': {
        if (opts.forcedPower) { power = opts.forcedPower; break }
        // G2 §6.12: 103/77/25/256 (+heal 51); G3 §4.3: 102/76/26; G5: 40/30/10/20 %
        powerDist = gen === 2
          ? [[40, 103 / 256], [80, 77 / 256], [120, 25 / 256]]
          : gen <= 4 ? [[40, 102 / 256], [80, 76 / 256], [120, 26 / 256]]
          : [[40, 0.4], [80, 0.3], [120, 0.1]]
        power = 40
        notes.push('20% chance to heal the target instead')
        break
      }
      case name === 'Magnitude': {
        if (opts.forcedPower) { power = opts.forcedPower; break }
        powerDist = gen === 2
          ? [[10, 14 / 256], [30, 25 / 256], [50, 51 / 256], [70, 77 / 256], [90, 51 / 256], [110, 25 / 256], [150, 13 / 256]]
          : [[10, 0.05], [30, 0.10], [50, 0.20], [70, 0.30], [90, 0.20], [110, 0.10], [150, 0.05]]
        power = 70
        break
      }
      case name === 'Rollout' || name === 'Ice Ball': {
        const n = Math.min(4, attacker.counters.rolloutTurn ?? 0)
        const curl = attacker.flags.defenseCurl ? 1 : 0
        if (gen === 2) { flags.preRandomMul = 2 ** (n + curl); power = 30 }
        else power = 30 * 2 ** (n + curl)
        assumptions.push({ key: 'rolloutTurn', label: 'Prior hits', value: n })
        break
      }
      case name === 'Fury Cutter': {
        const n = Math.min(gen >= 5 ? 3 : 4, attacker.counters.furyCutterTurn ?? 0)
        if (gen === 2) { flags.preRandomMul = 2 ** n; power = 10 }
        else power = (gen >= 5 ? 20 : 10) * 2 ** n
        assumptions.push({ key: 'furyCutterTurn', label: 'Prior uses', value: n })
        break
      }
      case name === 'Echoed Voice': {
        const n = Math.min(4, attacker.counters.echoedVoiceTurn ?? 0)
        power = 40 * (n + 1)
        assumptions.push({ key: 'echoedVoiceTurn', label: 'Prior turns', value: n })
        break
      }
      case name === 'Rage' && gen === 2: {
        const n = attacker.counters.rageCounter ?? 0
        flags.preRandomMul = 1 + n
        assumptions.push({ key: 'rageCounter', label: 'Rage counter', value: n })
        break
      }
      case name === 'Spit Up': {
        const n = Math.max(1, Math.min(3, attacker.counters.stockpile ?? 1))
        if (gen <= 4) { power = 100; flags.stockpileMul = n; flags.noRandom = true; flags.noCrit = true }
        else power = 100 * n
        assumptions.push({ key: 'stockpile', label: 'Stockpiles', value: n })
        break
      }
      case name === 'Triple Kick': {
        // Gen 3+: each kick rolls accuracy and a miss ends the move; Gen 2 rolls once (G2 §6.3).
        hitDist = { ...hits([[3, 1]], [10, 20, 30]), perHitAccuracy: gen >= 3 }
        power = 10
        notes.push(gen >= 3 ? 'Each kick has its own accuracy check' : 'One accuracy check for all three kicks')
        break
      }
      case name === 'Beat Up': {
        const party = attacker.party?.filter(p => p.usable) ?? [{
          species: attacker.species, level: attacker.level, baseStats: attacker.baseStats, usable: true,
        }]
        if (gen <= 4) {
          flags.beatUp = party.map(p => ({ attackBase: p.baseStats.attack, defenseBase: defender.baseStats.defense, level: p.level }))
          flags.noStab = true; flags.noTypeChart = true; flags.ignoreImmunities = true
          power = 10
          hitDist = hits([[party.length, 1]])
        } else {
          hitDist = hits([[party.length, 1]], party.map(p => Math.floor(p.baseStats.attack / 10) + 5))
          power = Math.floor(party[0].baseStats.attack / 10) + 5
        }
        assumptions.push({ key: 'party', label: 'Party members', value: party.length })
        break
      }
      case name === 'Weather Ball': {
        const w = field.weather
        if (w !== 'none' && !cloudNine(attacker, defender)) {
          type = w === 'rain' ? 'Water' : w === 'sun' ? 'Fire' : w === 'sand' ? 'Rock' : 'Ice'
          if (gen === 3) { flags.doubler = 'damage'; flags.doublerActive = true }
          else power = 100
        }
        break
      }
      case name === 'Judgment': {
        const it = getItem(attacker.item)
        if (it && it.id.endsWith('plate') && it.type) type = it.type
        break
      }
      case name === 'Techno Blast': {
        const drive = attacker.item
        type = drive === 'burndrive' ? 'Fire' : drive === 'dousedrive' ? 'Water' : drive === 'shockdrive' ? 'Electric' : drive === 'chilldrive' ? 'Ice' : 'Normal'
        break
      }
      case name === 'Natural Gift': {
        if (opts.naturalGift) { power = opts.naturalGift.power; type = opts.naturalGift.type }
        else { kind = 'none'; notes.push('Needs a berry (set its power and type)') }
        break
      }
      case name === 'Fling': {
        if (opts.flingPower) power = opts.flingPower
        else { kind = 'none'; notes.push('Needs a held item (set its Fling power)') }
        break
      }
      case name === 'Acrobatics': {
        // A Flying Gem is consumed before the power check, so it doubles too (G5 §2.1).
        if (!attacker.item || attacker.item === 'flyinggem') power = 110
        break
      }
      case name === 'Hex' && gen >= 5: {
        if (defender.status !== 'none') power = 100
        break
      }
      case name === 'Venoshock' && gen >= 5: {
        if (defender.status === 'poison' || defender.status === 'toxic') power = 130
        break
      }
      case name === 'Brine': {
        const active = defHp <= Math.floor(defMaxHp / 2)
        doubler(gen, flags, active, 'power')
        assumptions.push({ key: 'hp', label: 'Target ≤ ½ HP', value: active })
        break
      }
      case name === 'Facade': {
        const active = ['burn', 'poison', 'toxic', 'paralysis'].includes(attacker.status)
        doubler(gen, flags, active, 'power')
        if (active && gen <= 5) notes.push(gen <= 4 ? 'Burn still halves Attack' : 'Burn still halves damage')
        break
      }
      case name === 'Smelling Salts' || name === 'SmellingSalt': {
        doubler(gen, flags, defender.status === 'paralysis', 'power')
        break
      }
      case name === 'Wake-Up Slap': {
        doubler(gen, flags, defender.status === 'sleep', 'power')
        break
      }
      case name === 'Revenge' || name === 'Avalanche': {
        doubler(gen, flags, cond, 'power'); condAssumption('Hit by target first'); break
      }
      case name === 'Payback': {
        doubler(gen, flags, cond, 'power'); condAssumption('Target moved first'); break
      }
      case name === 'Assurance': {
        doubler(gen, flags, cond, 'power'); condAssumption('Target already damaged'); break
      }
      case name === 'Retaliate' && gen >= 5: {
        doubler(gen, flags, cond, 'power'); condAssumption('Ally fainted last turn'); break
      }
      case name === 'Round' && gen >= 5: {
        doubler(gen, flags, cond, 'power'); condAssumption('After an ally\'s Round'); break
      }
      case (name === 'Fusion Bolt' || name === 'Fusion Flare') && gen >= 5: {
        doubler(gen, flags, cond, 'power'); condAssumption('Other Fusion move used first'); break
      }
      case name === 'Pursuit' && gen >= 2: {
        const active = !!defender.flags.switchingOut
        if (gen === 2) flags.postRandomMul = active ? 2 : undefined
        else doubler(gen, flags, active, 'power')
        assumptions.push({ key: 'conditionMet', label: 'Target switching', value: active })
        break
      }
      case (name === 'Gust' || name === 'Twister') && gen >= 2: {
        const active = !!defender.flags.flying
        if (gen === 2) flags.postRandomMul = active ? 2 : undefined
        else doubler(gen, flags, active, 'power')
        break
      }
      case (name === 'Earthquake' || name === 'Magnitude') && gen >= 2: {
        const active = !!defender.flags.underground
        if (gen === 2) flags.postRandomMul = active ? 2 : undefined
        else if (gen === 5) doubler(gen, flags, active, 'final')
        else doubler(gen, flags, active, 'power')
        break
      }
      case (name === 'Surf' || name === 'Whirlpool') && gen >= 3: {
        const active = !!defender.flags.underwater
        if (gen === 5) doubler(gen, flags, active, 'final')
        else doubler(gen, flags, active, 'power')
        break
      }
      case (name === 'Stomp' && gen >= 2) || (gen === 3 && ['Astonish', 'Needle Arm', 'Extrasensory'].includes(name)) || (gen >= 5 && name === 'Steamroller'): {
        const active = !!defender.flags.minimized
        if (gen === 2) flags.postRandomMul = active ? 2 : undefined
        else if (gen === 5) doubler(gen, flags, active, 'final')
        else doubler(gen, flags, active, 'power')
        break
      }
      case effect === 'future_sight': {
        flags.noCrit = true
        if (gen <= 4) { flags.noStab = true; flags.noTypeChart = true; flags.ignoreImmunities = true; notes.push('No STAB or type effectiveness (Gen 2–4)') }
        notes.push('Hits two turns later with the stats at time of use')
        break
      }
      case name === 'Foul Play': flags.useTargetAttack = true; break
      case name === 'Psyshock' || name === 'Psystrike' || name === 'Secret Sword': flags.hitsDefense = true; break
      case name === 'Chip Away' || name === 'Sacred Sword': flags.ignoreDefenseStages = true; break
      case name === 'Synchronoise': {
        const shares = attacker.types.some(t => t === defender.types[0] || t === defender.types[1])
        if (!shares) { kind = 'none'; notes.push('Fails: target shares no type with the user') }
        break
      }
      case name === 'Sky Uppercut': notes.push('Can hit a target using Fly'); break
      case name === 'Snore': notes.push('Only usable while asleep'); break
      case name === 'Fake Out': notes.push('Only on the first turn out'); break
      case name === 'Focus Punch': notes.push('Fails if hit before it goes off'); break
      case name === 'Sucker Punch': notes.push('Fails unless the target is about to attack'); break
      case name === 'Last Resort': notes.push('Needs every other move used first'); break
      case name === 'Me First': kind = 'none'; notes.push('Copies the target\'s move (set it manually)'); break
      case name === 'Sleep Talk' || name === 'Nature Power' || name === 'Metronome' || name === 'Mirror Move' || name === 'Assist' || name === 'Copycat':
        kind = 'none'; notes.push('Calls another move'); break
      case name === 'Shadow Half': kind = 'none'; notes.push('Not usable in the main-series games'); break
    }
  }

  // ── Multi-hit ────────────────────────────────────────────────────────────
  if (kind === 'range' && !hitDist) {
    if (effect === 'two_to_five_hits') {
      const forced = opts.hits
      hitDist = forced ? hits([[forced, 1]]) : hits(multiHitDist(gen, gen >= 4 && attacker.ability === 'skilllink'))
      if (forced) assumptions.push({ key: 'hits', label: 'Hits', value: forced })
    } else if (effect === 'two_hits' || effect === 'two_hits_and_may_poison') {
      hitDist = hits([[2, 1]])
    }
  }

  // Gen 1 crit / random: fixed-damage moves ignore both.
  if (kind === 'fixed' || kind === 'reflect' || kind === 'ohko') { flags.noCrit = true; flags.noRandom = true }
  if (kind === 'range' && power <= 0 && !powerDist) {
    if (gen === 2 && (name === 'Return' || name === 'Frustration')) { kind = 'none'; notes.push('Power 0: deals no damage in Gen 2') }
    else if (kind === 'range') kind = 'none'
  }

  const category = kind === 'none' ? 'physical' : moveCategory(gen, type, data.category)

  return { name, data, type, category, power, kind, fixedDamage, powerDist, flags, hits: hitDist, notes, assumptions }
}

/** Configure a conditional ×2 for the gen's mechanism. */
function doubler(gen: Gen, flags: ResolvedMove['flags'], active: boolean, where: 'power' | 'final') {
  flags.doublerActive = active
  flags.doubler = gen === 3 ? 'damage' : where
}

function cloudNine(a: BattlerState, d: BattlerState): boolean {
  const cn = (x: string | null) => x === 'cloudnine' || x === 'airlock'
  return cn(a.ability) || cn(d.ability)
}

/** Whether an item's damage-side effect is live for this holder (Klutz/Embargo not modelled). */
export function holderItem(b: BattlerState, gen: Gen): string | null {
  if (!b.item) return null
  if (gen >= 4 && b.ability === 'klutz') return null
  return itemActiveInGen(b.item, gen) ? b.item : null
}

export { speciesItem, applyMod }
