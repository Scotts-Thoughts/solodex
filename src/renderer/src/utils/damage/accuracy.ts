/**
 * Hit chance: the probability that one use of a move connects.
 *
 * Accuracy never enters the damage formula, so it lives beside the pipelines
 * rather than inside them. Each generation's check is ported from the same
 * decomps as the damage code (Gen 5 from Showdown, see below):
 *
 *   Gen 1  MoveHitTest / CalcHitChance  pokered engine/battle/core.asm:5228-5418
 *          byte = floor(move% × 255/100); × stat ratio for the accuracy
 *          stage, × stat ratio for (−evasion stage), each floored with min 1;
 *          cap 255; hit iff rand(0..255) < byte → 255/256 at best. Swift and
 *          Bide skip the test; a Fly/Dig target is unhittable (Swift excepted).
 *          OHKO: fails when the user's in-battle Speed is lower
 *          (move_effects/one_hit_ko.asm:8-38).
 *   Gen 2  BattleCommand_CheckHit  pokecrystal engine/battle/effect_commands.asm:1546-1846
 *          (pokegold identical). As Gen 1 with the accuracy table
 *          (data/battle/accuracy_multipliers.asm), then Bright Powder −20
 *          (min 0); a byte of 255 always hits (no 1/256 miss). Foresight with
 *          evasion stage ≥ accuracy stage: stages skipped. Thunder: rain
 *          always hits, sun byte 128 (move_effects/thunder.asm). OHKO
 *          (BattleCommand_OHKO :5420-5462): byte = 76 + 2 × level difference,
 *          cap 255; fails if the user's level is lower.
 *   Gen 3  Cmd_accuracycheck / AccuracyCalcHelper  pokeemerald src/battle_script_commands.c:1054-1189
 *          (pokefirered identical). calc = floor(ratio[acc − eva] × move%)
 *          (Foresight: ratio[acc]) → Compound Eyes ×130/100 → Sand Veil
 *          ×80/100 → Hustle ×80/100 (physical) → Bright Powder ×90/100 or Lax
 *          Incense ×95/100 (items.h); hit iff rand%100 + 1 ≤ calc. Thunder:
 *          rain always hits, sun 50. OHKO (Cmd_tryKO :7490-7575): hit iff
 *          rand%100 + 1 < 30 + level difference → 29% at equal level; Sturdy
 *          blocks; fails if the user's level is lower.
 *   Gen 4  BattleControllerPlayer_CheckMoveHitAccuracy / CheckMoveHitOverrides
 *          pokeplatinum src/battle/battle_controller_player.c:2865-3044 (pokeheartgold
 *          identical). Stages: Simple ×2, Unaware zeroes the other side,
 *          Foresight / Miracle Eye drop positive evasion; ratio → Compound
 *          Eyes ×130/100 → Sand Veil / Snow Cloak ×80/100 → Hustle ×80/100 →
 *          Bright Powder / Lax Incense ×90/100 → Wide Lens ×110/100, Zoom Lens
 *          ×120/100 → Gravity ×10/6 (res/items/data/*.json); hit iff
 *          rand%100 + 1 ≤ rate. No Guard, Thunder in rain and Blizzard in
 *          hail always hit. OHKO (BtlCmd_TryOHKOMove battle_script.c:4334-4395):
 *          hit iff rand%100 < 30 + level difference; Sturdy blocks; No Guard
 *          bypasses; fails if the user's level is lower.
 *   Gen 5  No decomp. Showdown sim/battle-actions.ts hitStepAccuracy with the
 *          data/{abilities,items,moves,conditions}.ts handlers: 4096-scale
 *          modifiers chained (round half up) and applied (round half down),
 *          then the combined stage clamped to ±6 and applied as
 *          trunc(acc × (3+n)/3) / trunc(acc × 3/(3+n)); hit iff rand(0..99) <
 *          acc. Modifiers-before-stages is Showdown's order
 *          (docs/damage/gen5_damage_reference.md §9).
 *
 * Not modelled: X Accuracy, Lock-On / Mind Reader, Protect, Micle Berry,
 * Tangled Feet (needs confusion), fog.
 */
import type { BattlerState, Field, Gen, ResolvedMove } from './types'
import { accuracyStageLabel, accuracyStageMultiplier, applyStage, clampStage } from './stages'
import { badgeBoostsStat, gen12BadgeBoost } from './badges'
import { effectiveDefenderAbility } from './abilities'
import { holderItem } from './moves'
import { applyMod, chainMods, clamp } from './math'

export interface HitChance {
  /** 0..1 */
  chance: number
  /** Derivation, one step per entry ("85% accuracy", "Acc +1 ×1.33", "216/256"). */
  notes:  string[]
}

const sure  = (note: string): HitChance => ({ chance: 1, notes: [note] })
const never = (note: string): HitChance => ({ chance: 0, notes: [note] })
const fmtStage = (s: number): string => (s > 0 ? `+${s}` : String(s))

// Moves that still connect with a semi-invulnerable target.
const FLY_HITTERS: Record<Gen, Set<string>> = {
  1: new Set(['Swift', 'Bide']),                            // Swift returns before the Fly/Dig check; Bide skips MoveHitTest
  2: new Set(['Gust', 'Whirlwind', 'Thunder', 'Twister']),  // CheckHit.FlyDigMoves
  3: new Set(['Gust', 'Twister', 'Thunder', 'Sky Uppercut']), // HITMARKER_IGNORE_ON_AIR scripts
  4: new Set(['Gust', 'Twister', 'Thunder', 'Sky Uppercut']), // SYSCTL_HIT_DURING_FLY effect scripts
  5: new Set(['Gust', 'Twister', 'Thunder', 'Sky Uppercut', 'Hurricane', 'Smack Down']),
}
const DIG_HITTERS: Record<Gen, Set<string>> = {
  1: new Set(['Swift', 'Bide']),
  2: new Set(['Earthquake', 'Fissure', 'Magnitude']),
  3: new Set(['Earthquake', 'Magnitude']),                  // OHKO scripts do the Fly/Dig check without the ignore flag
  4: new Set(['Earthquake', 'Magnitude']),
  5: new Set(['Earthquake', 'Magnitude']),
}
const DIVE_HITTERS = new Set(['Surf', 'Whirlpool'])

function semiInvulnerable(d: BattlerState, move: ResolvedMove, gen: Gen): string | null {
  const n = move.name
  if (d.flags.flying && !FLY_HITTERS[gen].has(n)) return 'Target is in Fly: cannot be hit'
  if (d.flags.underground && !DIG_HITTERS[gen].has(n)) return 'Target is in Dig: cannot be hit'
  if (gen >= 3 && d.flags.underwater && !DIVE_HITTERS.has(n)) return 'Target is in Dive: cannot be hit'
  return null
}

/**
 * Move accuracy as a percentage, or null when the move never misses. The app
 * data stores "cannot miss" as null; Struggle and Bide are 100% in the ROMs
 * that still test them (pokered/pokecrystal moves.asm, pokeemerald
 * battle_moves.h; 0 = never misses from Gen 4).
 */
function baseAccuracy(move: ResolvedMove, gen: Gen): number | null {
  if (move.name === 'Struggle') return gen <= 3 ? 100 : null
  if (move.name === 'Bide') return gen === 2 || gen === 3 ? 100 : null
  const acc = move.data.accuracy
  return acc == null || acc <= 0 ? null : acc
}

const weatherHasEffect = (a: BattlerState, d: BattlerState): boolean => {
  const cn = (x: string | null) => x === 'cloudnine' || x === 'airlock'
  return !cn(a.ability) && !cn(d.ability)
}

/** Gen 1–2: `floor(byte × num/den)`, min 1, for the attacker's accuracy stage then the reflected evasion stage; cap 255. */
function gen12Stages(gen: 1 | 2, byte: number, accS: number, evaS: number, notes: string[]): number {
  let acc = byte
  if (accS !== 0) {
    const [n, dn] = accuracyStageMultiplier(gen, accS)
    acc = Math.max(1, Math.floor(acc * n / dn))
    notes.push(`Accuracy ${fmtStage(accS)} ${accuracyStageLabel(gen, accS)}`)
  }
  if (evaS !== 0) {
    const [n, dn] = accuracyStageMultiplier(gen, -evaS)
    acc = Math.max(1, Math.floor(acc * n / dn))
    notes.push(`Evasion ${fmtStage(evaS)} ${accuracyStageLabel(gen, -evaS)}`)
  }
  return Math.min(255, acc)
}

// ─── Gen 1 ──────────────────────────────────────────────────────────────────

/** In-battle Speed: stage → Soul Badge (player) → paralysis ÷4 (pokered core.asm CalculateModifiedStats, QuarterSpeedDueToParalysis). */
function gen1Speed(b: BattlerState, game: string): number {
  let s = applyStage(1, b.stats.speed, b.stages.speed)
  if (b.isPlayer && badgeBoostsStat('speed', b.badges, game)) s = gen12BadgeBoost(s)
  if (b.status === 'paralysis') s = Math.max(1, s >> 2)
  return s
}

function hitGen1(a: BattlerState, d: BattlerState, move: ResolvedMove, field: Field): HitChance {
  if (move.name === 'Bide') return sure('Bide skips the accuracy test')
  if (move.data.effect === 'always_hit') return sure('Never misses')
  const blocked = semiInvulnerable(d, move, 1)
  if (blocked) return never(blocked)
  const base = baseAccuracy(move, 1)
  if (base == null) return sure('Never misses')

  const notes: string[] = []
  if (move.kind === 'ohko') {
    const as = gen1Speed(a, field.game), ds = gen1Speed(d, field.game)
    if (as < ds) return never(`Fails: your Speed (${as}) is below the target's (${ds})`)
    notes.push(`Speed ${as} ≥ ${ds}`)
  }
  const byte = Math.floor(base * 255 / 100)
  notes.push(`${base}% → ${byte}/256`)
  const acc = gen12Stages(1, byte, clampStage(a.stages.accuracy), clampStage(d.stages.evasion), notes)
  if (acc !== byte) notes.push(`${acc}/256`)
  return { chance: acc / 256, notes }
}

// ─── Gen 2 ──────────────────────────────────────────────────────────────────

function hitGen2(a: BattlerState, d: BattlerState, move: ResolvedMove, field: Field): HitChance {
  const blocked = semiInvulnerable(d, move, 2)
  if (blocked) return never(blocked)
  if (move.name === 'Thunder' && field.weather === 'rain') return sure('Thunder never misses in rain')
  if (move.data.effect === 'always_hit') return sure('Never misses')
  const base = baseAccuracy(move, 2)
  if (base == null) return sure('Never misses')

  const notes: string[] = []
  let byte: number
  if (move.kind === 'ohko') {
    if (a.level < d.level) return never("Fails: your level is below the target's")
    const diff = a.level - d.level
    byte = Math.min(255, Math.floor(base * 255 / 100) + 2 * diff)
    notes.push(diff > 0 ? `${base}% + 2 × ${diff} levels → ${byte}/256` : `${base}% → ${byte}/256`)
  } else if (move.name === 'Thunder' && field.weather === 'sun') {
    byte = 128
    notes.push('Thunder in sun → 128/256')
  } else {
    byte = Math.floor(base * 255 / 100)
    notes.push(`${base}% → ${byte}/256`)
  }

  const accS = clampStage(a.stages.accuracy), evaS = clampStage(d.stages.evasion)
  let acc = byte
  if (d.flags.identified && evaS >= accS) {
    if (accS !== 0 || evaS !== 0) notes.push('Foresight: stages ignored')
  } else {
    acc = gen12Stages(2, byte, accS, evaS, notes)
  }
  if (holderItem(d, 2) === 'brightpowder') {
    acc = Math.max(0, acc - 20)
    notes.push('Bright Powder −20')
  }
  if (acc >= 255) return { chance: 1, notes: [...notes, '255 → always hits'] }
  if (acc !== byte) notes.push(`${acc}/256`)
  return { chance: acc / 256, notes }
}

// ─── Gen 3 ──────────────────────────────────────────────────────────────────

function hitGen3(a: BattlerState, d: BattlerState, move: ResolvedMove, field: Field): HitChance {
  const weatherOn = weatherHasEffect(a, d)
  const blocked = semiInvulnerable(d, move, 3)
  if (blocked) return never(blocked)
  if (move.name === 'Thunder' && weatherOn && field.weather === 'rain') return sure('Thunder never misses in rain')
  if (move.data.effect === 'always_hit' || move.name === 'Vital Throw') return sure('Never misses')
  const base = baseAccuracy(move, 3)
  if (base == null) return sure('Never misses')

  if (move.kind === 'ohko') {
    if (d.ability === 'sturdy') return never('Sturdy blocks one-hit KO moves')
    if (a.level < d.level) return never("Fails: your level is below the target's")
    const diff = a.level - d.level
    // rand%100 + 1 < base + diff: one point short of the nominal figure.
    const p = clamp(base + diff - 1, 0, 100)
    return { chance: p / 100, notes: [diff > 0 ? `${base}% + ${diff} levels` : `${base}%`, `rolled as rand + 1 < ${base + diff} → ${p}%`] }
  }

  const notes: string[] = []
  let moveAcc = base
  if (move.name === 'Thunder' && weatherOn && field.weather === 'sun') { moveAcc = 50; notes.push('Thunder in sun: 50%') }
  else notes.push(`${base}%`)

  const accS = clampStage(a.stages.accuracy), evaS = clampStage(d.stages.evasion)
  const buff = d.flags.identified ? accS : clampStage(accS - evaS)
  if (accS !== 0) notes.push(`Accuracy ${fmtStage(accS)}`)
  if (evaS !== 0) notes.push(d.flags.identified ? 'Foresight: evasion ignored' : `Evasion ${fmtStage(evaS)}`)
  const [num, den] = accuracyStageMultiplier(3, buff)
  let calc = Math.floor(num * moveAcc / den)
  if (buff !== 0) notes.push(`stage ${fmtStage(buff)} ${accuracyStageLabel(3, buff)}`)

  if (a.ability === 'compoundeyes') { calc = Math.floor(calc * 130 / 100); notes.push('Compound Eyes ×1.3') }
  if (weatherOn && d.ability === 'sandveil' && field.weather === 'sand') { calc = Math.floor(calc * 80 / 100); notes.push('Sand Veil ×0.8') }
  if (a.ability === 'hustle' && move.category === 'physical') { calc = Math.floor(calc * 80 / 100); notes.push('Hustle ×0.8') }
  const item = holderItem(d, 3)
  if (item === 'brightpowder') { calc = Math.floor(calc * 90 / 100); notes.push('Bright Powder ×0.9') }
  else if (item === 'laxincense') { calc = Math.floor(calc * 95 / 100); notes.push('Lax Incense ×0.95') }

  const p = clamp(calc, 0, 100)
  if (notes.length > 1) notes.push(`${p}%`)
  return { chance: p / 100, notes }
}

// ─── Gen 4 ──────────────────────────────────────────────────────────────────

function hitGen4(a: BattlerState, d: BattlerState, move: ResolvedMove, field: Field): HitChance {
  const defAb = effectiveDefenderAbility(d.ability, a.ability, 4)   // Battler_IgnorableAbility
  const noGuard = a.ability === 'noguard' || d.ability === 'noguard'
  const weatherOn = weatherHasEffect(a, d)

  const blocked = semiInvulnerable(d, move, 4)
  if (move.kind === 'ohko') {
    if (defAb === 'sturdy') return never('Sturdy blocks one-hit KO moves')
    if (a.level < d.level) return never("Fails: your level is below the target's")
    if (noGuard) return sure('No Guard: always hits')      // MOVE_STATUS_BYPASSED_ACCURACY
    if (blocked) return never(blocked)
    const diff = a.level - d.level
    const p = clamp(30 + diff, 0, 100)
    return { chance: p / 100, notes: [diff > 0 ? `30% + ${diff} levels → ${p}%` : `${p}%`] }
  }
  if (blocked) return never(blocked)                        // No Guard does not reach a Fly/Dig target here
  if (noGuard) return sure('No Guard: always hits')
  if (weatherOn && field.weather === 'rain' && move.name === 'Thunder') return sure('Thunder never misses in rain')
  if (weatherOn && field.weather === 'hail' && move.name === 'Blizzard') return sure('Blizzard never misses in hail')
  const base = baseAccuracy(move, 4)
  if (base == null) return sure('Never misses')

  const notes: string[] = []
  let accS = clampStage(a.stages.accuracy)
  let evaS = -clampStage(d.stages.evasion)
  if (a.ability === 'simple') accS *= 2
  if (defAb === 'simple') evaS *= 2
  if (defAb === 'unaware') accS = 0
  if (a.ability === 'unaware') evaS = 0
  if ((d.flags.identified || d.flags.miracleEyed) && evaS < 0) evaS = 0
  const sum = clamp(evaS + accS, -6, 6)
  if (a.stages.accuracy !== 0) notes.push(accS === 0 ? 'Unaware: your accuracy stage ignored' : `Accuracy ${fmtStage(clampStage(a.stages.accuracy))}${a.ability === 'simple' ? ' (Simple ×2)' : ''}`)
  if (d.stages.evasion !== 0) notes.push(evaS === 0 ? 'Evasion stage ignored' : `Evasion ${fmtStage(clampStage(d.stages.evasion))}${defAb === 'simple' ? ' (Simple ×2)' : ''}`)

  let rate = base
  if (weatherOn && field.weather === 'sun' && move.name === 'Thunder') { rate = 50; notes.unshift('Thunder in sun: 50%') }
  else notes.unshift(`${base}%`)
  const [num, den] = accuracyStageMultiplier(4, sum)
  rate = Math.floor(rate * num / den)
  if (sum !== 0) notes.push(`stage ${fmtStage(sum)} ${accuracyStageLabel(4, sum)}`)

  if (a.ability === 'compoundeyes') { rate = Math.floor(rate * 130 / 100); notes.push('Compound Eyes ×1.3') }
  if (weatherOn) {
    if (field.weather === 'sand' && defAb === 'sandveil') { rate = Math.floor(rate * 80 / 100); notes.push('Sand Veil ×0.8') }
    if (field.weather === 'hail' && defAb === 'snowcloak') { rate = Math.floor(rate * 80 / 100); notes.push('Snow Cloak ×0.8') }
  }
  if (a.ability === 'hustle' && move.category === 'physical') { rate = Math.floor(rate * 80 / 100); notes.push('Hustle ×0.8') }
  const dItem = holderItem(d, 4)
  if (dItem === 'brightpowder' || dItem === 'laxincense') { rate = Math.floor(rate * 90 / 100); notes.push(`${dItem === 'brightpowder' ? 'Bright Powder' : 'Lax Incense'} ×0.9`) }
  const aItem = holderItem(a, 4)
  if (aItem === 'widelens') { rate = Math.floor(rate * 110 / 100); notes.push('Wide Lens ×1.1') }
  if (aItem === 'zoomlens' && d.flags.movedThisTurn) { rate = Math.floor(rate * 120 / 100); notes.push('Zoom Lens ×1.2') }
  if (field.gravity) { rate = Math.floor(rate * 10 / 6); notes.push('Gravity ×5/3') }

  const p = clamp(rate, 0, 100)
  if (notes.length > 1) notes.push(`${p}%`)
  return { chance: p / 100, notes }
}

// ─── Gen 5 ──────────────────────────────────────────────────────────────────

function hitGen5(a: BattlerState, d: BattlerState, move: ResolvedMove, field: Field): HitChance {
  const defAb = effectiveDefenderAbility(d.ability, a.ability, 5)
  const noGuard = a.ability === 'noguard' || d.ability === 'noguard'
  const weatherOn = weatherHasEffect(a, d)
  const weather = weatherOn ? field.weather : 'none'

  const blocked = noGuard ? null : semiInvulnerable(d, move, 5)
  if (move.kind === 'ohko') {
    if (defAb === 'sturdy') return never('Sturdy blocks one-hit KO moves')
    if (a.level < d.level) return never("Fails: your level is below the target's")
    if (noGuard) return sure('No Guard: always hits')
    if (blocked) return never(blocked)
    const diff = a.level - d.level
    const p = clamp(30 + diff, 0, 100)
    return { chance: p / 100, notes: [diff > 0 ? `30% + ${diff} levels → ${p}%` : `${p}%`] }
  }
  if (blocked) return never(blocked)
  if (noGuard) return sure('No Guard: always hits')
  const rainMove = move.name === 'Thunder' || move.name === 'Hurricane'
  if (weather === 'rain' && rainMove) return sure(`${move.name} never misses in rain`)
  if (weather === 'hail' && move.name === 'Blizzard') return sure('Blizzard never misses in hail')
  const base = baseAccuracy(move, 5)
  if (base == null) return sure('Never misses')

  const notes: string[] = []
  let acc = base
  if (weather === 'sun' && rainMove) { acc = 50; notes.push(`${move.name} in sun: 50%`) }
  else notes.push(`${base}%`)

  // ModifyAccuracy handlers, chained at 4096 scale (field → abilities → items).
  const mods: number[] = []
  if (field.gravity) { mods.push(6840); notes.push('Gravity ×5/3') }
  if (a.ability === 'compoundeyes') { mods.push(5325); notes.push('Compound Eyes ×1.3') }
  if (a.ability === 'hustle' && move.category === 'physical') { mods.push(3277); notes.push('Hustle ×0.8') }
  if (a.ability === 'victorystar') { mods.push(4506); notes.push('Victory Star ×1.1') }
  if (weather === 'sand' && defAb === 'sandveil') { mods.push(3277); notes.push('Sand Veil ×0.8') }
  if (weather === 'hail' && defAb === 'snowcloak') { mods.push(3277); notes.push('Snow Cloak ×0.8') }
  const dItem = holderItem(d, 5)
  if (dItem === 'brightpowder' || dItem === 'laxincense') { mods.push(3686); notes.push(`${dItem === 'brightpowder' ? 'Bright Powder' : 'Lax Incense'} ×0.9`) }
  const aItem = holderItem(a, 5)
  if (aItem === 'widelens') { mods.push(4505); notes.push('Wide Lens ×1.1') }
  if (aItem === 'zoomlens' && d.flags.movedThisTurn) { mods.push(4915); notes.push('Zoom Lens ×1.2') }
  if (mods.length) acc = applyMod(acc, chainMods(mods, 0, 0xffff))

  // Stages: one combined boost, clamped to ±6 after each side.
  const accStage = clampStage(a.stages.accuracy)
  let evaStage = clampStage(d.stages.evasion)
  if ((d.flags.identified || d.flags.miracleEyed) && evaStage > 0) evaStage = 0
  let boost = defAb === 'unaware' ? 0 : accStage
  if (a.ability !== 'unaware') boost = clampStage(boost - evaStage)
  if (accStage !== 0) notes.push(defAb === 'unaware' ? 'Unaware: your accuracy stage ignored' : `Accuracy ${fmtStage(accStage)}`)
  if (d.stages.evasion !== 0) {
    notes.push(a.ability === 'unaware' ? 'Unaware: evasion stage ignored' : evaStage === 0 ? 'Foresight: evasion ignored' : `Evasion ${fmtStage(evaStage)}`)
  }
  if (boost > 0) acc = Math.trunc(acc * (3 + boost) / 3)
  else if (boost < 0) acc = Math.trunc(acc * 3 / (3 - boost))
  if (boost !== 0) notes.push(`stage ${fmtStage(boost)} ${accuracyStageLabel(5, boost)}`)

  const p = clamp(acc, 0, 100)
  if (notes.length > 1) notes.push(`${p}%`)
  return { chance: p / 100, notes }
}

// ─── Entry point ────────────────────────────────────────────────────────────

const HIT_CHECKS = { 1: hitGen1, 2: hitGen2, 3: hitGen3, 4: hitGen4, 5: hitGen5 } as const

/** Probability that one use of `move` by `a` connects with `d`. */
export function hitChance(a: BattlerState, d: BattlerState, move: ResolvedMove, field: Field): HitChance {
  if (move.kind === 'none') return { chance: 1, notes: [] }
  return HIT_CHECKS[field.gen](a, d, move, field)
}
