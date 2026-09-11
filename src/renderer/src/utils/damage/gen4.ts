/**
 * Generation 4 damage pipeline (Diamond/Pearl, Platinum, HeartGold/SoulSilver).
 * Platinum and HGSS are statement-identical; DP has no decompiled battle code
 * and is assumed identical.
 * Source: docs/damage/gen4_damage_reference.md (rules cited as G4 #n).
 *
 * BattleSystem_CalcMoveDamage (pokeplatinum src/battle/battle_lib.c:6601-7079):
 *   power = data power (variable moves) × powerMul/10                    (#2–#3)
 *   power chain: Charge → Helping Hand → Technician → type item/plate →
 *     Light Ball → orbs → Muscle Band/Wise Glasses → Thick Fat → Sports →
 *     Overgrow-class → Heatproof → Dry Skin → Rivalry → Iron Fist        (#4)
 *   stat chain: Huge Power → Slow Start → Choice → Soul Dew → Deep Sea →
 *     Metal Powder → Thick Club → Hustle → Guts → Marvel Scale →
 *     Plus/Minus → weather stat mods (Solar Power, Sand Rock SpD, Flower
 *     Gift) → Explosion def ÷2                                           (#5)
 *   stages (Simple / Unaware; crit: ignore −atk / +def)                 (#6–#8)
 *   dmg = A'·P·(2L/5+2) / D' / 50                                        (#9)
 *   burn ÷2 → screens ÷2 | ×2/3 → spread ×3/4 → weather → Flash Fire →
 *   +2                                                                  (#10–#15)
 * Then (battle_script.c / controller): ×crit (Sniper 3) → Life Orb →
 *   Metronome → Me First → random (min 1) → STAB → type rows (Divide,
 *   never 0) → Filter/Solid Rock → Expert Belt → Tinted Lens            (#16–#23)
 */
import type { CalcContext, PipelineOutput } from './types'
import { applyStage, clampStage } from './stages'
import { gen234Rows, walkTypeChart } from './typechart'
import { gen3Rolls } from './math'
import { typeBoostParam, speciesItem, getItem } from './items'
import { holderItem } from './moves'
import { effectiveDefenderAbility } from './abilities'

/** `BattleSystem_Divide`: truncate, but a non-zero dividend never yields 0. */
const divide = (x: number, den: number): number => {
  if (x === 0) return 0
  const q = Math.trunc(x / den)
  return q === 0 ? 1 : q
}

export function calcGen4(ctx: CalcContext): PipelineOutput {
  const { attacker: a, defender: d, move, field, crit } = ctx
  const notes: string[] = []
  const physical = move.category === 'physical'
  const atkItem = holderItem(a, 4)
  const defItem = holderItem(d, 4)
  const defAbility = effectiveDefenderAbility(d.ability, a.ability, 4)
  const noCloudNine = a.ability !== 'cloudnine' && a.ability !== 'airlock' && d.ability !== 'cloudnine' && d.ability !== 'airlock'
  const critMul = crit ? (a.ability === 'sniper' ? 3 : 2) : 1

  // ── Beat Up (G4 §3.2): base stats, +2, crit, Helping Hand, random; no type ─
  const beatUp = move.flags.beatUp?.[0]
  if (beatUp) {
    let dmg = Math.trunc(Math.trunc(beatUp.attackBase * 10 * (Math.trunc(beatUp.level * 2 / 5) + 2) / Math.max(1, beatUp.defenseBase)) / 50) + 2
    dmg *= critMul
    if (a.flags.helpingHand) dmg = Math.trunc(dmg * 15 / 10)
    return { rolls: gen3Rolls(dmg), effectiveness: 1, stab: false, immune: false, notes }
  }

  let movePower = move.power
  if (move.flags.doubler === 'power' && move.flags.doublerActive) movePower = Math.trunc(movePower * 20 / 10)
  else if (move.flags.powerMul) movePower = Math.trunc(movePower * move.flags.powerMul / 10)

  // ── Power modifiers (#4) ─────────────────────────────────────────────────
  if (a.flags.charge && move.type === 'Electric') movePower *= 2
  if (a.flags.helpingHand) movePower = Math.trunc(movePower * 15 / 10)
  if (a.ability === 'technician' && move.name !== 'Struggle' && movePower <= 60) movePower = Math.trunc(movePower * 15 / 10)

  let attackStat = a.stats.attack, spAttackStat = a.stats.spattack
  let defenseStat = d.stats.defense, spDefenseStat = d.stats.spdefense

  if (a.ability === 'hugepower' || a.ability === 'purepower') attackStat *= 2
  if (a.ability === 'slowstart' && a.flags.slowStartActive) attackStat = Math.trunc(attackStat / 2)
  const tp = typeBoostParam(atkItem, move.type, 4)
  if (tp != null) movePower = Math.trunc(movePower * (100 + tp) / 100)
  if (atkItem === 'choiceband') attackStat = Math.trunc(attackStat * 150 / 100)
  if (atkItem === 'choicespecs') spAttackStat = Math.trunc(spAttackStat * 150 / 100)
  const aSp = speciesItem(atkItem, a.species), dSp = speciesItem(defItem, d.species)
  if (aSp?.id === 'souldew') spAttackStat = Math.trunc(spAttackStat * 150 / 100)
  if (dSp?.id === 'souldew') spDefenseStat = Math.trunc(spDefenseStat * 150 / 100)
  if (aSp?.id === 'deepseatooth') spAttackStat *= 2
  if (dSp?.id === 'deepseascale') spDefenseStat *= 2
  if (aSp?.id === 'lightball') movePower *= 2
  if (dSp?.id === 'metalpowder') defenseStat *= 2
  if (aSp?.id === 'thickclub') attackStat *= 2
  if (aSp && (aSp.id === 'adamantorb' || aSp.id === 'lustrousorb' || (aSp.id === 'griseousorb' && !a.flags.transformed))
    && (move.type === aSp.type || move.type === aSp.type2)) movePower = Math.trunc(movePower * 120 / 100)
  if (atkItem === 'muscleband' && physical) movePower = Math.trunc(movePower * 110 / 100)
  if (atkItem === 'wiseglasses' && !physical) movePower = Math.trunc(movePower * 110 / 100)
  if (defAbility === 'thickfat' && (move.type === 'Fire' || move.type === 'Ice')) movePower = Math.trunc(movePower / 2)
  if (a.ability === 'hustle') attackStat = Math.trunc(attackStat * 150 / 100)
  if (a.ability === 'guts' && a.status !== 'none') attackStat = Math.trunc(attackStat * 150 / 100)
  if (defAbility === 'marvelscale' && d.status !== 'none') defenseStat = Math.trunc(defenseStat * 150 / 100)
  if ((a.ability === 'plus' || a.ability === 'minus') && a.flags.partnerPlusMinus) spAttackStat = Math.trunc(spAttackStat * 150 / 100)
  if (field.mudSport && move.type === 'Electric') movePower = Math.trunc(movePower / 2)
  if (field.waterSport && move.type === 'Fire') movePower = Math.trunc(movePower / 2)
  const pinch = a.currentHp <= Math.trunc(a.stats.hp / 3)
  if (pinch && ((a.ability === 'overgrow' && move.type === 'Grass') || (a.ability === 'blaze' && move.type === 'Fire')
    || (a.ability === 'torrent' && move.type === 'Water') || (a.ability === 'swarm' && move.type === 'Bug'))) {
    movePower = Math.trunc(movePower * 150 / 100)
  }
  if (defAbility === 'heatproof' && move.type === 'Fire') movePower = Math.trunc(movePower / 2)
  if (defAbility === 'dryskin' && move.type === 'Fire') movePower = Math.trunc(movePower * 125 / 100)

  // Stages (#6)
  let atkStage = clampStage(physical ? a.stages.attack : a.stages.spattack)
  let defStage = clampStage(physical ? d.stages.defense : d.stages.spdefense)
  if (a.ability === 'simple') atkStage = clampStage(atkStage * 2)
  if (defAbility === 'simple') defStage = clampStage(defStage * 2)
  if (defAbility === 'unaware') atkStage = 0
  if (a.ability === 'unaware') defStage = 0

  if (a.ability === 'rivalry' && a.gender !== 'N' && d.gender !== 'N') {
    movePower = Math.trunc(movePower * (a.gender === d.gender ? 125 : 75) / 100)
  }
  if (a.ability === 'ironfist' && move.flags.punch) movePower = Math.trunc(movePower * 12 / 10)
  if (noCloudNine) {
    if (field.weather === 'sun' && a.ability === 'solarpower') spAttackStat = Math.trunc(spAttackStat * 15 / 10)
    if (field.weather === 'sand' && (d.types[0] === 'Rock' || d.types[1] === 'Rock')) spDefenseStat = Math.trunc(spDefenseStat * 15 / 10)
    if (field.weather === 'sun' && (a.ability === 'flowergift' || a.flags.flowerGiftAlly)) attackStat = Math.trunc(attackStat * 15 / 10)
    if (field.weather === 'sun' && (defAbility === 'flowergift' || d.flags.flowerGiftAlly)) spDefenseStat = Math.trunc(spDefenseStat * 15 / 10)
  }
  if (move.flags.selfDestruct) defenseStat = Math.trunc(defenseStat / 2)

  // ── Core (#8–#9) ─────────────────────────────────────────────────────────
  const atkStat = physical ? attackStat : spAttackStat
  const defStat = physical ? defenseStat : spDefenseStat
  let dmg = crit && atkStage <= 0 ? atkStat : applyStage(4, atkStat, atkStage)
  dmg *= movePower
  dmg *= Math.trunc(a.level * 2 / 5) + 2
  const stageDivisor = crit && defStage >= 0 ? defStat : applyStage(4, defStat, defStage)
  dmg = Math.trunc(dmg / Math.max(1, stageDivisor))
  dmg = Math.trunc(dmg / 50)

  // ── Burn, screens, spread (#10–#12) ──────────────────────────────────────
  if (physical && a.status === 'burn' && a.ability !== 'guts') dmg = Math.trunc(dmg / 2)
  const screen = physical ? d.flags.reflect : d.flags.lightScreen
  if (screen && !crit && move.name !== 'Brick Break') {
    dmg = field.isDoubles && field.defendersAlive === 2 ? Math.trunc(dmg * 2 / 3) : Math.trunc(dmg / 2)
  }
  if (field.isDoubles) {
    if (move.flags.spread === 'both' && field.defendersAlive === 2) dmg = Math.trunc(dmg * 3 / 4)
    else if (move.flags.spread === 'all' && field.otherBattlersAlive >= 2) dmg = Math.trunc(dmg * 3 / 4)
  }

  // ── Weather, Flash Fire (#13–#14) ────────────────────────────────────────
  if (noCloudNine) {
    if (field.weather === 'rain') {
      if (move.type === 'Fire') dmg = Math.trunc(dmg / 2)
      if (move.type === 'Water') dmg = Math.trunc(dmg * 15 / 10)
    }
    if (field.weather !== 'none' && field.weather !== 'sun' && move.name === 'Solar Beam') dmg = Math.trunc(dmg / 2)
    if (field.weather === 'sun') {
      if (move.type === 'Fire') dmg = Math.trunc(dmg * 15 / 10)
      if (move.type === 'Water') dmg = Math.trunc(dmg / 2)
    }
  }
  if (a.flags.flashFire && move.type === 'Fire') dmg = Math.trunc(dmg * 15 / 10)

  dmg += 2                                                                 // (#15)

  // ── Post-routine (#16–#18) ───────────────────────────────────────────────
  dmg *= critMul
  if (move.flags.stockpileMul) dmg *= move.flags.stockpileMul               // Spit Up (CalcMaxDamage)
  if (atkItem === 'lifeorb') dmg = Math.trunc(dmg * 130 / 100)
  const metro = a.counters.metronomeUses ?? 0
  if (atkItem === 'metronome' && metro > 0) dmg = Math.trunc(dmg * (10 + Math.min(10, metro)) / 10)

  let rolls = move.flags.noRandom ? [dmg] : gen3Rolls(dmg)

  // ── STAB, type chart, SE/NVE modifiers (#19–#23) ─────────────────────────
  let stab = false
  let effectiveness = 1
  const typeless = move.name === 'Struggle' || move.flags.noTypeChart
  if (!typeless) {
    stab = !move.flags.noStab && (move.type === a.types[0] || move.type === a.types[1])
    const imm = gen4AbilityImmunity(move.type, defAbility, d, move.power > 0)
    if (imm) return { rolls: [0], effectiveness: 0, stab, immune: true, notes: [...notes, imm] }
    const rows = gen234Rows({
      identified: d.flags.identified || a.ability === 'scrappy',
      miracleEyed: d.flags.miracleEyed,
      grounded: d.flags.grounded || defItem === 'ironball' || field.gravity,
      roosted: d.flags.roosted,
    })
    const probe = walkTypeChart(1000, move.type, d.types, rows, true)
    if (probe.immune) return { rolls: [0], effectiveness: 0, stab, immune: true, notes }
    effectiveness = probe.effectiveness
    if (defAbility === 'wonderguard' && effectiveness < 2 && move.power > 0) {
      return { rolls: [0], effectiveness, stab, immune: true, notes: [...notes, 'Wonder Guard'] }
    }
    rolls = rolls.map(v => {
      if (stab) v = a.ability === 'adaptability' ? v * 2 : Math.trunc(v * 15 / 10)
      for (const [atkT, defT, m] of rows) {
        if (atkT !== move.type || (defT !== d.types[0] && defT !== d.types[1])) continue
        v = divide(v * m, 10)
      }
      if (effectiveness > 1 && move.power > 0) {
        if (defAbility === 'solidrock' || defAbility === 'filter') v = divide(v * 3, 4)
        if (atkItem === 'expertbelt') v = Math.trunc(v * 120 / 100)
      }
      if (effectiveness < 1 && move.power > 0 && a.ability === 'tintedlens') v *= 2
      // Type-resist berry at HP update (G4 #25): halves, min 1.
      const berry = getItem(defItem)
      if (berry?.kind === 'resistberry' && berry.type === move.type && (effectiveness > 1 || move.type === 'Normal')) v = divide(v, 2)
      return v
    })
  } else if (move.name === 'Struggle') {
    notes.push('Struggle: typeless (no STAB or type effectiveness)')
  }

  return { rolls, effectiveness, stab, immune: false, notes }
}

/** Gen 4 immunity abilities and Levitate/Magnet Rise (G4 #21, #24). */
export function gen4AbilityImmunity(
  moveType: string, defAbility: string | null, d: CalcContext['defender'], hasPower: boolean,
): string | null {
  const ironBall = d.item === 'ironball'
  if (moveType === 'Ground' && !ironBall && !d.flags.grounded) {
    if (defAbility === 'levitate') return 'Levitate'
    if (d.flags.magnetRise) return 'Magnet Rise'
  }
  if (!hasPower) return null
  if (defAbility === 'voltabsorb' && moveType === 'Electric') return 'Volt Absorb'
  if (defAbility === 'motordrive' && moveType === 'Electric') return 'Motor Drive'
  if (defAbility === 'waterabsorb' && moveType === 'Water') return 'Water Absorb'
  if (defAbility === 'dryskin' && moveType === 'Water') return 'Dry Skin'
  if (defAbility === 'flashfire' && moveType === 'Fire') return 'Flash Fire'
  return null
}

