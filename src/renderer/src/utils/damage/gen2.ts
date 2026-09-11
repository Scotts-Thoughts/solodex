/**
 * Generation 2 damage pipeline (Gold/Silver/Crystal).
 * Source: docs/damage/gen2_damage_reference.md (rules cited as G2 #n).
 *
 *   stats: stage → badge (+x/8, player) → burn ÷2 (attacker)           (#2–#4)
 *   crit + atkStage ≤ defStage → raw stats for both, no screens        (#6)
 *   screens ×2 (16-bit, uncapped) on the boosted path                  (#7)
 *   Thick Club / Light Ball ×2                                         (#8)
 *   8-bit truncation: both >>2 while either > 255 (G/S: once, mask)    (#9)
 *   Metal Powder on Ditto, Explosion def ÷2                            (#10–#11)
 *   D = floor(floor((floor(2L/5)+2)·P·A/Def)/50)                       (#13)
 *   type item ×110/100 → crit ×2 → min(D,997)+2                        (#14–#16)
 *   Struggle: stop here                                                (#17)
 *   weather ×15/10 | ×5/10 (min 1) → badge type D+=max(1,D>>3)         (#18–#19)
 *   STAB D+=D>>1 → type rows in ROM order (floor 1)                    (#20–#21)
 *   pre-random multipliers (Rollout/Fury Cutter/Rage, Triple Kick)     (#24)
 *   random floor(D·r/255) if D ≥ 2 → post-random doublers              (#22–#23)
 */
import type { CalcContext, PipelineOutput } from './types'
import { applyStage } from './stages'
import { badgeBoostsStat, gen12BadgeBoost, gen2GlacierBoostsSpDef, hasBadgeTypeBoost } from './badges'
import { gen234Rows, walkTypeChart } from './typechart'
import { gen12Rolls } from './math'
import { typeBoostParam, speciesItem } from './items'
import { holderItem } from './moves'

const CRIT_TABLE = [17, 32, 64, 85, 128, 128, 128]

/** Crit stage → probability (G2 #5). */
export function critChanceGen2(stage: number): number {
  return CRIT_TABLE[Math.max(0, Math.min(6, stage))] / 256
}

export function calcGen2(ctx: CalcContext): PipelineOutput {
  const { attacker: a, defender: d, move, field, crit } = ctx
  const notes: string[] = []
  const physical = move.category === 'physical'
  const isGS = field.game === 'Gold and Silver'
  const badgesActive = !field.isLinkBattle
  const atkItem = holderItem(a, 2)
  const defItem = holderItem(d, 2)

  // ── Boosted stats (#2–#4) ────────────────────────────────────────────────
  const atkStage = physical ? a.stages.attack : a.stages.spattack
  const defStage = physical ? d.stages.defense : d.stages.spdefense
  const rawAtk = physical ? a.stats.attack : a.stats.spattack
  const rawDef = physical ? d.stats.defense : d.stats.spdefense

  const boostedStat = (raw: number, stage: number, b: typeof a, key: 'attack' | 'spattack' | 'defense' | 'spdefense') => {
    let v = applyStage(2, raw, stage)
    if (b.isPlayer && badgesActive) {
      const boosts = key === 'spdefense'
        ? badgeBoostsStat('spattack', b.badges, field.game) && gen2GlacierBoostsSpDef(b.stats.spattack)
        : badgeBoostsStat(key, b.badges, field.game)
      if (boosts) v = gen12BadgeBoost(v)
    }
    return v
  }

  let atk: number, def: number
  const useRaw = crit && atkStage <= defStage
  if (useRaw) {
    atk = rawAtk; def = rawDef
  } else {
    atk = boostedStat(rawAtk, atkStage, a, physical ? 'attack' : 'spattack')
    if (physical && a.status === 'burn') atk = Math.max(1, atk >> 1)
    def = boostedStat(rawDef, defStage, d, physical ? 'defense' : 'spdefense')
    if (physical ? d.flags.reflect : d.flags.lightScreen) def = (def * 2) & 0xffff
    if (crit) notes.push('Crit uses boosted stats (your stage is above the target\'s)')
  }

  // ── Species items (#8) ───────────────────────────────────────────────────
  const sp = speciesItem(atkItem, a.species)
  if (sp && ((sp.id === 'thickclub' && physical) || (sp.id === 'lightball' && !physical))) atk = (atk * 2) & 0xffff

  // ── 8-bit truncation (#9) ────────────────────────────────────────────────
  const singlePass = isGS || field.isLinkBattle
  if (atk > 255 || def > 255) {
    do {
      def = Math.max(1, def >> 2)
      atk = Math.max(1, atk >> 2)
    } while (!singlePass && (atk > 255 || def > 255))
    if (singlePass && (atk > 255 || def > 255)) {
      notes.push('Stat over 1023: Gold/Silver keep only the low byte after one ÷4 (G2 §8.1)')
      atk &= 0xff; def &= 0xff
      if (def === 0) def = 1
      if (atk === 0) notes.push('Attack wraps to 0')
    }
  }

  // ── Metal Powder (#10) ───────────────────────────────────────────────────
  if (defItem === 'metalpowder' && d.species === 'Ditto') {
    const c = def + (def >> 1)
    if (c > 255) { atk = Math.max(1, atk >> 1); def = (c + 256) >> 1; notes.push('Metal Powder overflow: both stats halved (G2 §7.3)') }
    else def = c
  }
  if (move.flags.selfDestruct) def = Math.max(1, def >> 1)               // (#11)
  if (def === 0) def = 1

  // ── Beat Up (G2 #35): per party member, base Atk vs target's base Def ───
  let level = a.level
  let power = move.power
  const beatUp = move.flags.beatUp?.[0]
  if (beatUp) {
    atk = beatUp.attackBase; def = Math.max(1, beatUp.defenseBase); level = beatUp.level; power = 10
  }
  // Triple Kick (G2 #24): DamageCalc runs at power 10 and its output is
  // multiplied by the kick number before STAB.
  const kick = move.name === 'Triple Kick' ? Math.max(1, Math.floor(power / 10)) : 1
  if (kick > 1) power = 10

  // ── Base (#13) ───────────────────────────────────────────────────────────
  const q = Math.floor(2 * level / 5) + 2
  let D = Math.floor(Math.floor(q * power * atk / def) / 50)

  // Type-boost item (#14)
  const p = typeBoostParam(atkItem, move.type, 2)
  if (p != null) D = Math.floor(D * (100 + p) / 100)
  // Crit ×2 (#15)
  if (crit) D = Math.min(65535, D * 2)
  // Cap and +2 (#16)
  D = Math.min(D, 997) + 2
  if (kick > 1) D = Math.min(65535, D * kick)

  let stab = false
  let effectiveness = 1
  if (move.name !== 'Struggle' && !move.flags.noTypeChart && !beatUp) {
    // Weather (#18)
    if (field.weather === 'rain' || field.weather === 'sun') {
      const boost = (field.weather === 'rain' && move.type === 'Water') || (field.weather === 'sun' && move.type === 'Fire')
      const weaken = (field.weather === 'rain' && move.type === 'Fire') || (field.weather === 'sun' && move.type === 'Water')
        || (field.weather === 'rain' && move.name === 'Solar Beam')
      if (boost) D = Math.min(65535, Math.max(1, Math.floor(D * 15 / 10)))
      else if (weaken) D = Math.max(1, Math.floor(D * 5 / 10))
    }
    // Badge type boost (#19)
    if (a.isPlayer && badgesActive && hasBadgeTypeBoost(move.type, a.badges, field.game)) {
      D = Math.min(65535, D + Math.max(1, D >> 3))
    }
    // STAB (#20)
    stab = !move.flags.noStab && (move.type === a.types[0] || move.type === a.types[1])
    if (stab) D += D >> 1
    // Type chart (#21)
    const r = walkTypeChart(D, move.type, d.types, gen234Rows({ identified: d.flags.identified }), true)
    if (r.immune) return { rolls: [0], effectiveness: 0, stab, immune: true, notes }
    D = r.damage
    effectiveness = r.effectiveness
  } else if (move.name === 'Struggle') {
    notes.push('Struggle: no STAB, weather, badge or type effectiveness')
  }

  // Pre-random multipliers (#24)
  if (move.flags.preRandomMul && move.flags.preRandomMul > 1) D = Math.min(65535, D * move.flags.preRandomMul)

  // Random (#22)
  let rolls = move.flags.noRandom ? [D] : gen12Rolls(D)
  // Post-random doublers (#23)
  if (move.flags.postRandomMul && move.flags.postRandomMul > 1) rolls = rolls.map(v => Math.min(65535, v * move.flags.postRandomMul!))

  return { rolls, effectiveness, stab, immune: false, notes }
}
