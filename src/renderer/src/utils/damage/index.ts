/**
 * Damage calculator entry point.
 *
 *   calcDamage(attacker, defender, moveName, moveData, field, options)
 *
 * resolves the move, runs the generation's exact pipeline for the normal and
 * critical case, and packages a `DamageResult` (all rolls, hit distribution,
 * recoil/drain, crit chance, hit chance, notes and assumptions) for the UI
 * and tests. KO odds are derived from the result in ko.ts.
 */
import type { MoveData } from '../../types/pokemon'
import type {
  Assumption, BattlerState, CalcContext, DamageResult, DamageRolls, Field, MoveOptions, PipelineOutput, ResolvedMove,
} from './types'
import { resolveMove, holderItem } from './moves'
import { calcGen1, critChanceGen1 } from './gen1'
import { calcGen2, critChanceGen2 } from './gen2'
import { calcGen3, critChanceGen345 } from './gen3'
import { calcGen4 } from './gen4'
import { calcGen5 } from './gen5'
import { gen234Rows, walkTypeChart, GEN1_TYPE_ROWS, combinedEffectiveness } from './typechart'
import { mergeDists, toDist } from './math'
import { speciesItem } from './items'
import { effectiveDefenderAbility } from './abilities'
import { hitChance } from './accuracy'

export * from './types'
export { resolveMove, moveCategory, hiddenPowerGen2, hiddenPowerGen3, HIDDEN_POWER_TYPES } from './moves'
export { itemId, itemName, itemsForGen, getItem, ITEMS } from './items'
export { abilityId, abilityInfo, DAMAGE_ABILITIES } from './abilities'
export { applyStage, stageLabel, accuracyStageLabel, accuracyStageMultiplier } from './stages'
export * from './badges'
export * from './ko'
export { hitChance, type HitChance } from './accuracy'

const PIPELINES = { 1: calcGen1, 2: calcGen2, 3: calcGen3, 4: calcGen4, 5: calcGen5 } as const

function runPipeline(ctx: CalcContext): PipelineOutput {
  return PIPELINES[ctx.field.gen](ctx)
}

// ─── Critical-hit chance ─────────────────────────────────────────────────────

export function critChance(a: BattlerState, d: BattlerState, move: ResolvedMove, field: Field): number {
  if (move.flags.noCrit || move.kind !== 'range' || move.power <= 0) return 0
  const gen = field.gen
  if (gen === 1) return critChanceGen1(a.baseStats.speed, !!move.flags.highCrit, !!a.flags.focusEnergy)
  const item = holderItem(a, gen)
  const sp = speciesItem(item, a.species)
  const defAbility = effectiveDefenderAbility(d.ability, a.ability, gen)
  if (gen >= 3 && (defAbility === 'battlearmor' || defAbility === 'shellarmor')) return 0
  if (move.flags.alwaysCrit) return 1
  if (gen === 2) {
    if (sp?.id === 'luckypunch' || sp?.id === 'stick') return critChanceGen2(2)
    let c = 0
    if (a.flags.focusEnergy) c += 1
    if (move.flags.highCrit) c += 2
    if (item === 'scopelens') c += 1
    return critChanceGen2(c)
  }
  let c = 0
  if (a.flags.focusEnergy) c += 2
  if (move.flags.highCrit) c += 1
  if (item === 'scopelens' || (gen >= 4 && item === 'razorclaw')) c += 1
  if (gen >= 4 && a.ability === 'superluck') c += 1
  if (sp?.id === 'luckypunch') c += 2
  if (sp?.id === 'stick') c += 2
  return critChanceGen345(c)
}

// ─── Fixed-damage immunity ───────────────────────────────────────────────────

function fixedImmune(move: ResolvedMove, a: BattlerState, d: BattlerState, field: Field): boolean {
  if (field.gen === 1) return false                                       // G1 #15: fixed damage ignores type
  if (move.flags.ignoreImmunities) return false
  if (move.name === 'Bide' && field.gen >= 5) return false
  const defAbility = effectiveDefenderAbility(d.ability, a.ability, field.gen)
  const rows = gen234Rows({ identified: d.flags.identified || (field.gen >= 4 && a.ability === 'scrappy'), miracleEyed: d.flags.miracleEyed, grounded: d.flags.grounded || field.gravity, roosted: d.flags.roosted })
  if (walkTypeChart(100, move.type, d.types, rows, true).immune) return true
  if (field.gen >= 3 && defAbility === 'levitate' && move.type === 'Ground' && !d.flags.grounded) return true
  if (field.gen >= 3 && defAbility === 'wonderguard' && move.name !== 'Struggle') {
    const eff = combinedEffectiveness(move.type, d.types)
    if (eff < 2) return true
  }
  return false
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface CalcParams {
  attacker: BattlerState
  defender: BattlerState
  moveName: string
  moveData: MoveData
  field:    Field
  options?: MoveOptions
}

export function calcDamage(params: CalcParams): DamageResult {
  const { attacker: a, defender: d, moveName, moveData, field } = params
  const opts = params.options ?? {}
  const move = resolveMove(moveName, moveData, field.gen, a, d, field, opts)
  const defHp = Math.max(1, d.stats.hp)
  const pct = (n: number) => Math.round(n / defHp * 1000) / 10
  const base = {
    move: moveName, moveType: move.type, category: move.category, power: move.power,
    notes: [...move.notes], assumptions: [...move.assumptions] as Assumption[],
  }
  const empty = (kind: DamageResult['kind'], effectiveness = 1, extraNotes: string[] = []): DamageResult => ({
    ...base, kind, rolls: [0], min: 0, max: 0, minPercent: 0, maxPercent: 0,
    effectiveness, stab: false, critChance: 0, hitChance: kind === 'immune' ? 0 : 1, hitNotes: [],
    notes: [...base.notes, ...extraNotes],
  })

  if (move.kind === 'none') return empty('none')
  const hit = hitChance(a, d, move, field)

  // ── Fixed / OHKO / reflect ─────────────────────────────────────────────
  if (move.kind === 'fixed' || move.kind === 'ohko' || move.kind === 'reflect') {
    if (fixedImmune(move, a, d, field)) return empty('immune', 0)
    let rolls = move.kind === 'ohko' ? [Math.max(1, d.currentHp)] : (move.fixedDamage ?? [0])
    let stab = false
    let effectiveness = 1
    if (move.name === 'Bide' && field.gen === 4) {
      // G4 #28: Bide still receives STAB and the type chart.
      stab = move.type === a.types[0] || move.type === a.types[1]
      const rows = gen234Rows({ identified: d.flags.identified })
      rolls = rolls.map(v => {
        if (stab) v = Math.trunc(v * 15 / 10)
        const r = walkTypeChart(v, move.type, d.types, rows, true)
        effectiveness = r.effectiveness
        return r.damage
      })
    }
    rolls = [...rolls].sort((x, y) => x - y)
    const min = rolls[0], max = rolls[rolls.length - 1]
    return {
      ...base, kind: move.kind, rolls, min, max, minPercent: pct(min), maxPercent: pct(max),
      effectiveness, stab, critChance: 0, hitChance: hit.chance, hitNotes: hit.notes,
    }
  }

  // ── Range ──────────────────────────────────────────────────────────────
  const perHitPowers = move.hits?.perHitPower
  const memberList = move.flags.beatUp
  const runVariant = (crit: boolean): { hits: PipelineOutput[]; out: PipelineOutput } => {
    const variants: ResolvedMove[] = []
    if (perHitPowers) for (const p of perHitPowers) variants.push({ ...move, power: p })
    else if (memberList && memberList.length > 1) for (const m of memberList) variants.push({ ...move, flags: { ...move.flags, beatUp: [m] } })
    else if (move.powerDist) for (const [p] of move.powerDist) variants.push({ ...move, power: p })
    else variants.push(move)
    const hits = variants.map(v => runPipeline({ attacker: a, defender: d, move: v, field, crit }))
    return { hits, out: hits[0] }
  }

  const normal = runVariant(false)
  if (normal.out.immune) {
    return empty('immune', normal.out.effectiveness, normal.out.notes ?? [])
  }
  const critOut = move.flags.noCrit ? null : runVariant(true)

  const pack = (v: { hits: PipelineOutput[] }): DamageRolls => {
    if (move.powerDist) {
      // Weighted merge of the outcome distributions of each possible power.
      const dist = mergeDists(v.hits.map((h, i) => [toDist(h.rolls), move.powerDist![i][1]]))
      const rolls = dist.map(([x]) => x)
      return { rolls, dist, min: rolls[0], max: rolls[rolls.length - 1] }
    }
    if (v.hits.length > 1) {
      // Per-hit results (Triple Kick, Beat Up): rolls = first hit; totals in `hits`.
      const first = v.hits[0].rolls
      return { rolls: first, min: Math.min(...first), max: Math.max(...first) }
    }
    const rolls = v.hits[0].rolls
    return { rolls, min: Math.min(...rolls), max: Math.max(...rolls) }
  }

  const chance = critChance(a, d, move, field)
  // A guaranteed crit (Frost Breath / Storm Throw) is the normal result.
  const guaranteed = chance >= 1 && critOut
  const main = guaranteed ? pack(critOut!) : pack(normal)
  const crit = guaranteed ? undefined : critOut ? pack(critOut) : undefined
  const mainOut = guaranteed ? critOut!.out : normal.out

  // Hit totals
  let hits = move.hits
  if (hits && normal.hits.length > 1) {
    const mins = normal.hits.map(h => Math.min(...h.rolls)), maxs = normal.hits.map(h => Math.max(...h.rolls))
    hits = {
      ...hits,
      perHitPower: perHitPowers ?? memberList?.map(() => move.power),
      totalMin: mins.reduce((x, y) => x + y, 0),
      totalMax: maxs.reduce((x, y) => x + y, 0),
    }
  } else if (hits) {
    hits = { ...hits, totalMin: main.min * hits.min, totalMax: main.max * hits.max }
  }
  // G1: damage, crit and random roll are computed once and reused for every hit.
  if (hits && field.gen === 1) hits = { ...hits, sameRoll: true }

  // Recoil / drain from HP actually dealt (capped at the target's current HP).
  const dealt = (v: number) => Math.min(v, Math.max(1, d.currentHp))
  let recoil: DamageResult['recoil']
  if (move.flags.recoil) {
    const r = move.flags.recoil
    if (field.gen >= 4 && move.name === 'Struggle') {
      const v = Math.max(1, Math.trunc(a.stats.hp / 4))
      recoil = { min: v, max: v, label: r.label }
    } else if (field.gen >= 3 && a.ability === 'rockhead' && move.name !== 'Struggle') {
      recoil = undefined
    } else {
      const f = (v: number) => Math.max(1, Math.trunc(dealt(v) * r.num / r.den))
      recoil = { min: f(main.min), max: f(main.max), label: r.label }
    }
  }
  let drain: DamageResult['drain']
  if (move.flags.drain) {
    const f = (v: number) => Math.max(1, Math.trunc(dealt(v) / 2))
    drain = { min: f(main.min), max: f(main.max) }
  }

  const notes = [...base.notes, ...(mainOut.notes ?? [])]
  if (guaranteed) notes.push('Always a critical hit')
  if (field.gen === 1 && hits) notes.push('Gen 1: every hit deals the same damage (one roll, one crit check)')

  return {
    ...base,
    kind: 'range',
    rolls: main.rolls, dist: main.dist, min: main.min, max: main.max,
    minPercent: pct(main.min), maxPercent: pct(main.max),
    effectiveness: mainOut.effectiveness,
    stab: mainOut.stab,
    crit,
    critChance: chance,
    hitChance: hit.chance,
    hitNotes: hit.notes,
    hits,
    recoil, drain,
    nonLethal: moveData.effect === 'non_lethal_damage' || undefined,
    notes: moveData.effect === 'non_lethal_damage' ? [...notes, 'Leaves the target at 1 HP'] : notes,
  }
}

export { GEN1_TYPE_ROWS }
