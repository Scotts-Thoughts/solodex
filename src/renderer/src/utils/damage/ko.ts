/**
 * KO probabilities from damage distributions.
 *
 * `useDistribution` turns one DamageResult into the distribution of HP lost by
 * a single use of the move: a miss (1 − hitChance, see accuracy.ts) deals 0;
 * a hit draws from the damage rolls with the crit chance folded in; multi-hit
 * moves convolve the per-hit rolls with the hit-count distribution (Gen 1
 * reuses one roll and one crit check for every hit; Triple Kick rolls
 * accuracy per kick from Gen 3). `koChances` then gives, for 1..n uses, the
 * probability that the total reaches the target's HP.
 */
import type { DamageResult, DamageRolls } from './types'
import { mergeDists, toDist } from './math'

export type Dist = Array<[number, number]>

/** Probabilities within 1e-9 of certain are certain (16 × 1/16 in floating point). */
const snap = (p: number): number => (Math.abs(p - 1) < 1e-9 ? 1 : p)

export function convolve(a: Dist, b: Dist, cap = Infinity): Dist {
  const m = new Map<number, number>()
  for (const [va, pa] of a) for (const [vb, pb] of b) {
    const v = Math.min(cap, va + vb)
    m.set(v, (m.get(v) ?? 0) + pa * pb)
  }
  return [...m.entries()].sort((x, y) => x[0] - y[0])
}

/**
 * Outcome distribution of one set of rolls (uniform unless `dist` is given).
 * A `dist` summing to less than 1 has a no-damage outcome the pipeline left
 * out (Present's heal, 51–52/256): it comes back here as 0 damage so the
 * per-use distribution keeps its full mass.
 */
const rollDist = (r: DamageRolls): Dist => {
  if (!r.dist) return toDist(r.rolls)
  const mass = r.dist.reduce((s, [, p]) => s + p, 0)
  return mass < 1 - 1e-9 ? mergeDists([[r.dist, 1], [[[0, 1 - mass]], 1]]) : r.dist
}

/**
 * Damage from one hit that connects: the normal rolls and the crit rolls
 * weighted by the crit chance. `powerScale` approximates a later hit of a
 * move whose hits differ in power (Triple Kick 10/20/30, Beat Up).
 */
export function hitDistribution(r: DamageResult, powerScale = 1): Dist {
  const scale = (d: Dist): Dist => (powerScale === 1 ? d : d.map(([v, p]) => [Math.floor(v * powerScale), p]))
  const normal = scale(rollDist(r))
  if (!r.crit || r.critChance <= 0) return normal
  return mergeDists([[normal, 1 - r.critChance], [scale(rollDist(r.crit)), r.critChance]])
}

/** Distribution of damage from one use: miss → 0, every hit, crits folded in. `cap` bounds the sum. */
export function useDistribution(r: DamageResult, cap = Infinity): Dist {
  const p = r.hitChance
  const withMiss = (d: Dist): Dist => (p >= 1 ? d : mergeDists([[[[0, 1]], 1 - p], [d, p]]))
  if (r.kind === 'ohko') return withMiss([[Math.min(cap, r.max), 1]])
  const one = hitDistribution(r)
  const hits = r.hits
  if (!hits) return withMiss(one)

  // Per-hit distributions. When per-hit powers differ the pipeline gives only
  // the first hit's rolls; later hits are scaled by the power ratio (the exact
  // totals live in totalMin/totalMax).
  const perHit = hits.perHitPower
  const maxHits = Math.max(...hits.distribution.map(h => h[0]))
  const hitDists: Dist[] = []
  for (let i = 0; i < maxHits; i++) {
    hitDists.push(perHit && perHit[0] > 0 && perHit[i] !== perHit[0] ? hitDistribution(r, perHit[i] / perHit[0]) : one)
  }
  const totals = (n: number): Dist => {
    let out: Dist = [[0, 1]]
    for (let i = 0; i < n; i++) out = convolve(out, hitDists[i], cap)
    return out
  }

  if (hits.perHitAccuracy) {
    // Each hit rolls accuracy and the first miss ends the move.
    const parts: Array<[Dist, number]> = [[[[0, 1]], 1 - p]]
    for (let n = 1; n <= maxHits; n++) parts.push([totals(n), n === maxHits ? p ** n : p ** n * (1 - p)])
    return mergeDists(parts)
  }
  if (hits.sameRoll) {
    // Gen 1: the same damage lands on every hit.
    return withMiss(mergeDists(hits.distribution.map(([n, pn]) => [one.map(([v, q]) => [Math.min(cap, v * n), q]), pn])))
  }
  return withMiss(mergeDists(hits.distribution.map(([n, pn]) => [totals(n), pn])))
}

const massAtLeast = (d: Dist, hp: number): number => snap(d.reduce((s, [v, p]) => (v >= hp ? s + p : s), 0))

export interface KoChance {
  uses: number
  /** Probability the target is KO'd within `uses` uses. */
  chance: number
}

/**
 * KO probability within 1..maxUses uses of the move against `hp`, with the
 * miss chance, the damage rolls and critical hits all included.
 */
export function koChances(r: DamageResult, hp: number, maxUses = 8): KoChance[] {
  if (r.kind === 'none' || r.kind === 'immune' || r.max <= 0 || r.hitChance <= 0) return []
  const one = useDistribution(r, hp)
  const out: KoChance[] = []
  let acc: Dist = [[0, 1]]
  for (let n = 1; n <= maxUses; n++) {
    acc = convolve(acc, one, hp)
    const chance = massAtLeast(acc, hp)
    out.push({ uses: n, chance })
    if (chance >= 0.99995) break
  }
  return out
}

export interface KoBreakdown {
  /** Chance one use KOs given that it connects. */
  onHit:  number
  /** …and without a critical hit. */
  noCrit: number
  /** …on a critical hit (null when the move cannot crit). */
  onCrit: number | null
}

/** The pieces behind `koChances[0]`, for explaining the figure. */
export function koBreakdown(r: DamageResult, hp: number): KoBreakdown {
  const sure: DamageResult = { ...r, hitChance: 1 }
  const onHit = massAtLeast(useDistribution(sure, hp), hp)
  if (!r.crit || r.critChance <= 0) return { onHit, noCrit: onHit, onCrit: null }
  return {
    onHit,
    noCrit: massAtLeast(useDistribution({ ...sure, critChance: 0 }, hp), hp),
    onCrit: massAtLeast(useDistribution({ ...sure, critChance: 1 }, hp), hp),
  }
}

/**
 * Entries worth showing inline: from the first with a real chance (≥ 0.5 %,
 * or any nonzero OHKO chance), up to `max`, ending once a KO is practically
 * certain (≥ 99.5 %). The full list belongs in the tooltip.
 */
export function koSummary(chances: KoChance[], max = 4): KoChance[] {
  const start = chances.findIndex((c, i) => c.chance >= (i === 0 ? 0.00005 : 0.005))
  if (start < 0) return []
  const out: KoChance[] = []
  for (const c of chances.slice(start)) {
    out.push(c)
    if (out.length >= max || c.chance >= 0.995) break
  }
  return out
}

/** "OHKO", "2HKO", … */
export const koName = (uses: number): string => (uses === 1 ? 'OHKO' : `${uses}HKO`)

/** Probability for display: two decimals with trailing zeros trimmed; "100%" only when certain. */
export function fmtChance(p: number): string {
  if (p >= 1) return '100%'
  if (p >= 0.99995) return '>99.99%'
  if (p <= 0) return '0%'
  if (p < 0.00005) return '<0.01%'
  return `${(p * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}
