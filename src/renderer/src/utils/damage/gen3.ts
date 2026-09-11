/**
 * Generation 3 damage pipeline (Ruby/Sapphire, Emerald, FireRed/LeafGreen —
 * numerically identical; only badge gating differs).
 * Source: docs/damage/gen3_damage_reference.md (rules cited as G3 #n).
 *
 * CalculateBaseDamage (pokeemerald src/pokemon.c:3106-3372):
 *   raw stats → Huge Power → badges ×110/100 → type item ×(100+p)/100 →
 *   Choice Band → Soul Dew → species items → Thick Fat → Hustle →
 *   Plus/Minus → Guts → Marvel Scale                                    (#2)
 *   power: Sports ÷2 → Overgrow-class ×150/100; Explosion def ÷2         (#3)
 *   stages (crit: ignore −atk / +def)                                   (#4)
 *   dmg = ((A·P)·(2L/5+2)) / D / 50                                     (#5)
 *   burn ÷2 (physical, no Guts) → screens ÷2 | 2·(x/3) → spread ÷2 →
 *   floor 1 (physical) → weather → Flash Fire → +2                     (#6–#12)
 * Then: ×crit ×doubler → Charge ×2 → Helping Hand ×15/10 → STAB ×15/10 →
 *   type rows (floor 1) → random (100−r%16)/100, min 1                (#13–#17)
 */
import type { CalcContext, PipelineOutput } from './types'
import { applyStage } from './stages'
import { badgeBoostsStat, gen3BadgeBoost } from './badges'
import { gen234Rows, walkTypeChart } from './typechart'
import { gen3Rolls } from './math'
import { typeBoostParam, speciesItem } from './items'
import { holderItem } from './moves'
import { effectiveDefenderAbility } from './abilities'

const CRIT_TABLE = [16, 8, 4, 3, 2]

/** Crit stage → probability (G3 #19, G4 §2, G5 §4.1: same table, cap 4). */
export function critChanceGen345(stage: number): number {
  return 1 / CRIT_TABLE[Math.max(0, Math.min(4, stage))]
}

export function calcGen3(ctx: CalcContext): PipelineOutput {
  const { attacker: a, defender: d, move, field, crit } = ctx
  const notes: string[] = []
  const physical = move.category === 'physical'
  const atkItem = holderItem(a, 3)
  const defItem = holderItem(d, 3)
  const defAbility = d.ability   // no Mold Breaker in Gen 3
  const weatherActive = a.ability !== 'cloudnine' && a.ability !== 'airlock' && d.ability !== 'cloudnine' && d.ability !== 'airlock'

  // ── Beat Up (#22): base stats only, +2, crit, Helping Hand, random ───────
  const beatUp = move.flags.beatUp?.[0]
  if (beatUp) {
    let dmg = Math.floor(Math.floor(beatUp.attackBase * 10 * (Math.floor(beatUp.level * 2 / 5) + 2) / Math.max(1, beatUp.defenseBase)) / 50) + 2
    if (a.flags.helpingHand) dmg = Math.floor(dmg * 15 / 10)
    if (crit) dmg *= 2
    return { rolls: gen3Rolls(dmg), effectiveness: 1, stab: false, immune: false, notes }
  }

  // ── Stats (#2) ───────────────────────────────────────────────────────────
  let attack = a.stats.attack, spAttack = a.stats.spattack
  let defense = d.stats.defense, spDefense = d.stats.spdefense
  let power = move.power

  if (a.ability === 'hugepower' || a.ability === 'purepower') attack *= 2
  if (a.isPlayer && badgeBoostsStat('attack', a.badges, field.game)) attack = gen3BadgeBoost(attack)
  if (d.isPlayer && badgeBoostsStat('defense', d.badges, field.game)) defense = gen3BadgeBoost(defense)
  if (a.isPlayer && badgeBoostsStat('spattack', a.badges, field.game)) spAttack = gen3BadgeBoost(spAttack)
  if (d.isPlayer && badgeBoostsStat('spdefense', d.badges, field.game)) spDefense = gen3BadgeBoost(spDefense)

  const p = typeBoostParam(atkItem, move.type, 3)
  if (p != null) {
    if (physical) attack = Math.floor(attack * (100 + p) / 100)
    else spAttack = Math.floor(spAttack * (100 + p) / 100)
  }
  if (atkItem === 'choiceband') attack = Math.floor(150 * attack / 100)
  if (speciesItem(atkItem, a.species)?.id === 'souldew') spAttack = Math.floor(150 * spAttack / 100)
  if (speciesItem(defItem, d.species)?.id === 'souldew') spDefense = Math.floor(150 * spDefense / 100)
  if (speciesItem(atkItem, a.species)?.id === 'deepseatooth') spAttack *= 2
  if (speciesItem(defItem, d.species)?.id === 'deepseascale') spDefense *= 2
  if (speciesItem(atkItem, a.species)?.id === 'lightball') spAttack *= 2
  if (speciesItem(defItem, d.species)?.id === 'metalpowder') defense *= 2
  if (speciesItem(atkItem, a.species)?.id === 'thickclub') attack *= 2
  if (defAbility === 'thickfat' && (move.type === 'Fire' || move.type === 'Ice')) spAttack = Math.floor(spAttack / 2)
  if (a.ability === 'hustle') attack = Math.floor(150 * attack / 100)
  if ((a.ability === 'plus' || a.ability === 'minus') && a.flags.partnerPlusMinus) spAttack = Math.floor(150 * spAttack / 100)
  if (a.ability === 'guts' && a.status !== 'none') attack = Math.floor(150 * attack / 100)
  if (defAbility === 'marvelscale' && d.status !== 'none') defense = Math.floor(150 * defense / 100)

  // ── Power (#3) ───────────────────────────────────────────────────────────
  if (field.mudSport && move.type === 'Electric') power = Math.floor(power / 2)
  if (field.waterSport && move.type === 'Fire') power = Math.floor(power / 2)
  const pinch = a.currentHp <= Math.floor(a.stats.hp / 3)
  if (pinch && ((a.ability === 'overgrow' && move.type === 'Grass') || (a.ability === 'blaze' && move.type === 'Fire')
    || (a.ability === 'torrent' && move.type === 'Water') || (a.ability === 'swarm' && move.type === 'Bug'))) {
    power = Math.floor(150 * power / 100)
  }
  if (move.flags.selfDestruct) defense = Math.floor(defense / 2)

  // ── Stages and core (#4–#5) ──────────────────────────────────────────────
  const atkStat = physical ? attack : spAttack
  const defStat = physical ? defense : spDefense
  const atkStage = physical ? a.stages.attack : a.stages.spattack
  const defStage = physical ? d.stages.defense : d.stages.spdefense
  const A = crit && atkStage <= 0 ? atkStat : applyStage(3, atkStat, atkStage)
  const D = crit && defStage >= 0 ? defStat : applyStage(3, defStat, defStage)

  let dmg = Math.floor(Math.floor(A * power * (Math.floor(2 * a.level / 5) + 2) / Math.max(1, D)) / 50)

  // ── Burn, screens, spread, floor (#6–#9) ─────────────────────────────────
  if (physical && a.status === 'burn' && a.ability !== 'guts') dmg = Math.floor(dmg / 2)
  const screen = physical ? d.flags.reflect : d.flags.lightScreen
  if (screen && !crit && move.name !== 'Brick Break') {   // Brick Break removes screens before damagecalc (G3 §4.6)
    dmg = field.isDoubles && field.defendersAlive === 2 ? 2 * Math.floor(dmg / 3) : Math.floor(dmg / 2)
  }
  if (field.isDoubles && move.flags.spread === 'both' && field.defendersAlive === 2) dmg = Math.floor(dmg / 2)
  if (physical && dmg === 0) dmg = 1

  // ── Weather (special only), Flash Fire (#10–#11) ─────────────────────────
  if (!physical && weatherActive) {
    if (field.weather === 'rain') {
      if (move.type === 'Fire') dmg = Math.floor(dmg / 2)
      if (move.type === 'Water') dmg = Math.floor(15 * dmg / 10)
    }
    if ((field.weather === 'rain' || field.weather === 'sand' || field.weather === 'hail') && move.name === 'Solar Beam') dmg = Math.floor(dmg / 2)
    if (field.weather === 'sun') {
      if (move.type === 'Fire') dmg = Math.floor(15 * dmg / 10)
      if (move.type === 'Water') dmg = Math.floor(dmg / 2)
    }
  }
  if (!physical && a.flags.flashFire && move.type === 'Fire') dmg = Math.floor(15 * dmg / 10)

  dmg += 2                                                                 // (#12)

  // ── Crit, doubler, Charge, Helping Hand (#13–#14) ────────────────────────
  if (crit) dmg *= 2
  if (move.flags.doubler === 'damage' && move.flags.doublerActive) dmg *= 2
  if (move.flags.stockpileMul) dmg *= move.flags.stockpileMul
  if (a.flags.charge && move.data.type === 'Electric') dmg *= 2
  if (a.flags.helpingHand) dmg = Math.floor(dmg * 15 / 10)

  // ── STAB and type chart (#15–#16) ────────────────────────────────────────
  let stab = false
  let effectiveness = 1
  if (move.name !== 'Struggle' && !move.flags.noTypeChart) {
    stab = !move.flags.noStab && (move.type === a.types[0] || move.type === a.types[1])
    if (stab) dmg = Math.floor(dmg * 15 / 10)
    const imm = abilityImmunity(move.type, defAbility, move.power > 0)
    if (imm) return { rolls: [0], effectiveness: 0, stab, immune: true, notes: [...notes, imm] }
    const r = walkTypeChart(dmg, move.type, d.types, gen234Rows({ identified: d.flags.identified }), true)
    if (r.immune) return { rolls: [0], effectiveness: 0, stab, immune: true, notes }
    dmg = r.damage
    effectiveness = r.effectiveness
    if (defAbility === 'wonderguard' && effectiveness < 2 && move.power > 0) {
      return { rolls: [0], effectiveness, stab, immune: true, notes: [...notes, 'Wonder Guard'] }
    }
  } else if (move.name === 'Struggle') {
    notes.push('Struggle: no STAB or type effectiveness')
  }

  // ── Random (#17) ─────────────────────────────────────────────────────────
  const rolls = move.flags.noRandom ? [dmg] : gen3Rolls(dmg)
  return { rolls, effectiveness, stab, immune: false, notes }
}

/** Gen 3 absorb/immunity abilities (attackcanceler + Levitate in typecalc). */
export function abilityImmunity(moveType: string, defAbility: string | null, hasPower: boolean): string | null {
  if (defAbility === 'levitate' && moveType === 'Ground') return 'Levitate'
  if (defAbility === 'voltabsorb' && moveType === 'Electric' && hasPower) return 'Volt Absorb'
  if (defAbility === 'waterabsorb' && moveType === 'Water' && hasPower) return 'Water Absorb'
  if (defAbility === 'flashfire' && moveType === 'Fire') return 'Flash Fire'
  return null
}

export { effectiveDefenderAbility }
