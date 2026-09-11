/**
 * Generation 1 damage pipeline (Red/Blue/Yellow — byte-identical).
 * Source: docs/damage/gen1_damage_reference.md (rules cited as G1 #n).
 *
 *   A, D  = battle stats: stage → badge (+x/8, player only) → burn ÷2
 *           defender ×2 for Reflect (physical) / Light Screen (special)
 *           crit: raw stats for both, level ×2                      (#3–#6)
 *   if A ≥ 256 or D ≥ 256: both >>= 2, A min 1, keep low byte         (#7)
 *   Explosion: D >>= 1, min 1                                        (#8)
 *   q1 = floor(2L'/5)+2 ; q3 = floor(floor(q1·P·A/D)/50)
 *   base = min(q3, 997) + 2                                          (#9)
 *   STAB: base += floor(base/2)                                      (#10)
 *   type rows in ROM order, floor per row, 0 = "doesn't affect"      (#11)
 *   random: if d ≥ 2, floor(d·r/255), r ∈ 217..255                    (#12)
 */
import type { CalcContext, PipelineOutput } from './types'
import { applyStage } from './stages'
import { badgeBoostsStat, gen12BadgeBoost } from './badges'
import { GEN1_TYPE_ROWS, walkTypeChart } from './typechart'
import { gen12Rolls } from './math'

export function critChanceGen1(baseSpeed: number, highCrit: boolean, focusEnergy: boolean): number {
  let b = baseSpeed >> 1                              // t0
  b = focusEnergy ? b >> 1 : Math.min(255, b * 2)     // Focus Energy bug: quarters instead of doubles
  b = highCrit ? Math.min(255, Math.min(255, b * 2) * 2) : b >> 1
  return b / 256
}

export function calcGen1(ctx: CalcContext): PipelineOutput {
  const { attacker: a, defender: d, move, field, crit } = ctx
  const notes: string[] = []
  const physical = move.category === 'physical'
  const isPlayerAtk = a.isPlayer

  // ── Attacking stat (#3) ──────────────────────────────────────────────────
  let atk: number
  let def: number
  if (crit) {
    atk = physical ? a.stats.attack : a.stats.spattack
    def = physical ? d.stats.defense : d.stats.spdefense
  } else {
    const atkStage = physical ? a.stages.attack : a.stages.spattack
    atk = applyStage(1, physical ? a.stats.attack : a.stats.spattack, atkStage)
    if (isPlayerAtk && badgeBoostsStat(physical ? 'attack' : 'spattack', a.badges, field.game)) atk = gen12BadgeBoost(atk)
    if (physical && a.status === 'burn') atk = Math.max(1, atk >> 1)

    // Defending stat (#4). Gen 1 has one Special stage; the defender's
    // "spdefense" stage is the same stage as its "spattack".
    const defStage = physical ? d.stages.defense : d.stages.spattack
    def = applyStage(1, physical ? d.stats.defense : d.stats.spdefense, defStage)
    if (d.isPlayer && badgeBoostsStat(physical ? 'defense' : 'spdefense', d.badges, field.game)) def = gen12BadgeBoost(def)
    if (physical ? d.flags.reflect : d.flags.lightScreen) def = def * 2   // 16-bit, uncapped
  }

  // ── ≥256 scaling (#7) ────────────────────────────────────────────────────
  if (atk >= 256 || def >= 256) {
    atk = Math.max(1, atk >> 2) & 0xff
    if (atk === 0) atk = 1
    def = (def >> 2) & 0xff
    if (def === 0) { notes.push('Defense scales to 0 — the real game freezes (divide by zero); treated as 1'); def = 1 }
  }
  if (move.flags.selfDestruct) def = Math.max(1, def >> 1)               // (#8)

  // ── Base (#9) ────────────────────────────────────────────────────────────
  const level = crit ? a.level * 2 : a.level
  const q1 = Math.floor(2 * level / 5) + 2
  const q3 = Math.floor(Math.floor(q1 * move.power * atk / def) / 50)
  let dmg = Math.min(q3, 997) + 2

  // ── STAB (#10) ───────────────────────────────────────────────────────────
  const stab = !move.flags.noStab && (move.type === a.types[0] || move.type === a.types[1])
  if (stab) dmg += dmg >> 1

  // ── Type chart (#11) ─────────────────────────────────────────────────────
  let effectiveness = 1
  if (!move.flags.noTypeChart) {
    const r = walkTypeChart(dmg, move.type, d.types, GEN1_TYPE_ROWS, false)
    dmg = r.damage
    effectiveness = r.effectiveness
    if (r.immune || dmg === 0) {
      return { rolls: [0], effectiveness: r.immune ? 0 : effectiveness, stab, immune: true,
        notes: r.immune ? notes : [...notes, 'Damage truncates to 0 — "doesn\'t affect" (G1 §1.6)'] }
    }
  }

  // ── Random (#12) ─────────────────────────────────────────────────────────
  const rolls = move.flags.noRandom ? [dmg] : gen12Rolls(dmg)
  return { rolls, effectiveness, stab, immune: false, notes }
}
