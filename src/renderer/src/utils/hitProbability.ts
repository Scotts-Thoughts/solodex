// Pure, DOM-free probability helpers for the Misc → Hit Probability tools.
//
// The core model is the binomial distribution from the build spec: N independent
// uses of a move, each landing with probability p. Also included are the Gen 6+
// accuracy/evasion stat-stage multipliers (effective-accuracy helper) and the
// 2–5 strike multi-hit distributions (multi-hit move mode). Everything here is
// numerically stable across the supported input ranges and free of DOM
// references so it can be unit-tested and reused. See the reference
// implementation in the spec — these match it exactly.

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ─── Binomial core ──────────────────────────────────────────────────────────

/**
 * Numerically stable "n choose k" — avoids large factorials by dividing as it
 * multiplies, and uses the symmetry C(n, k) = C(n, n − k).
 */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1
  k = Math.min(k, n - k)
  let result = 1
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1)
  }
  return result
}

/**
 * P(X = k): exactly k hits out of n uses, each with hit probability p.
 *
 * Math.pow(0, 0) === 1 in JS, which is exactly what's wanted at the extremes:
 * when p = 1 the (1 − p)^(n − k) term is 0^0 = 1 for k = n, and when p = 0 the
 * p^k term is 0^0 = 1 for k = 0. No special-casing required.
 */
export function binomialPMF(k: number, n: number, p: number): number {
  return combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k)
}

/** P(X ≥ k): at least k hits. Summed directly to avoid off-by-one bugs. */
export function atLeast(k: number, n: number, p: number): number {
  let sum = 0
  for (let i = k; i <= n; i++) sum += binomialPMF(i, n, p)
  return sum
}

/** P(X ≤ k): at most k hits. */
export function atMost(k: number, n: number, p: number): number {
  let sum = 0
  for (let i = 0; i <= k; i++) sum += binomialPMF(i, n, p)
  return sum
}

/** Full distribution: array where index i = P(X = i), for i from 0..n. */
export function distribution(n: number, p: number): number[] {
  const out: number[] = []
  for (let i = 0; i <= n; i++) out.push(binomialPMF(i, n, p))
  return out
}

export const expectedHits = (n: number, p: number): number => n * p
export const variance = (n: number, p: number): number => n * p * (1 - p)
export const stdDeviation = (n: number, p: number): number => Math.sqrt(variance(n, p))

// ─── Effective accuracy (Gen 6+) ──────────────────────────────────────────────

/**
 * Gen 6+ accuracy/evasion combined stat-stage multiplier. The combined stage is
 * (your accuracy stages) − (target's evasion stages), clamped to the −6..+6
 * range. Multiplier is (3 + s) / 3 for s ≥ 0 and 3 / (3 − s) for s < 0.
 *
 * Gen 1–5 used a different evasion formula; this table is Gen 6+ only.
 */
export function accuracyStageMultiplier(stage: number): number {
  const s = clamp(Math.round(stage), -6, 6)
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s)
}

export interface AccuracyModifier {
  id: string
  label: string
  /** Multiplicative factor applied to accuracy, e.g. 1.3 for Compound Eyes. */
  factor: number
  note: string
}

/** Common "other modifiers" from the spec (multiply in, then cap at 100%). */
export const ACCURACY_MODIFIERS: AccuracyModifier[] = [
  { id: 'compoundEyes', label: 'Compound Eyes',          factor: 1.3, note: '×1.3' },
  { id: 'victoryStar',  label: 'Victory Star',           factor: 1.1, note: '×1.1' },
  { id: 'wideLens',     label: 'Wide Lens',              factor: 1.1, note: '×1.1 held' },
  { id: 'hustle',       label: 'Hustle',                 factor: 0.8, note: '×0.8 physical' },
  { id: 'sandSnow',     label: 'Sand Veil / Snow Cloak', factor: 0.8, note: '×0.8 target in weather' },
]

export interface EffectiveAccuracyInput {
  baseAccuracy: number    // 0–100
  accuracyStages: number  // −6..+6 (attacker)
  evasionStages: number   // −6..+6 (target)
  factors: number[]       // extra multiplicative modifiers
  alwaysHits: boolean     // No Guard / Lock-On / Mind Reader → always hits
}

export interface EffectiveAccuracyResult {
  effective: number       // final accuracy %, capped at 100
  combinedStage: number   // clamped −6..+6
  stageMultiplier: number
  cappedAt100: boolean    // true if the raw product exceeded 100
  alwaysHits: boolean
}

/**
 * effective = base × stageMultiplier(accuracy − evasion) × Π(modifiers),
 * clamped to a maximum of 100%. No Guard (alwaysHits) short-circuits to 100%.
 */
export function effectiveAccuracy(input: EffectiveAccuracyInput): EffectiveAccuracyResult {
  if (input.alwaysHits) {
    return { effective: 100, combinedStage: 0, stageMultiplier: 1, cappedAt100: false, alwaysHits: true }
  }
  const combinedStage = clamp(Math.round(input.accuracyStages - input.evasionStages), -6, 6)
  const stageMultiplier = accuracyStageMultiplier(combinedStage)
  let acc = clamp(input.baseAccuracy, 0, 100) * stageMultiplier
  for (const f of input.factors) acc *= f
  return {
    effective: Math.min(100, acc),
    combinedStage,
    stageMultiplier,
    cappedAt100: acc > 100,
    alwaysHits: false,
  }
}

// ─── Multi-hit (2–5 strike) moves ─────────────────────────────────────────────
//
// A standard 2–5 hit move makes ONE accuracy check for the whole move; if it
// passes, the number of hits is rolled from a fixed distribution. This is a
// different probability model from the binomial one above.

export type MultiHitGen = 'gen1to4' | 'gen5plus'
export type MultiHitModifier = 'none' | 'skillLink' | 'loadedDice'

/** Conditional per-roll hit-count distribution for a standard 2–5 hit move. */
const MULTI_HIT_BASE: Record<MultiHitGen, Record<number, number>> = {
  gen5plus: { 2: 0.35,  3: 0.35,  4: 0.15,  5: 0.15 },
  gen1to4:  { 2: 0.375, 3: 0.375, 4: 0.125, 5: 0.125 },
}

/**
 * Hit-count distribution GIVEN the single accuracy check passed.
 *  - Skill Link  → always the maximum (5 hits).
 *  - Loaded Dice → guarantees ≥4 hits; rolls that would be 2 or 3 are remapped
 *    to an even 4/5 split, so overall 50% / 50% for 4 / 5. (Gen 9 item; verified
 *    against Bulbapedia's "even chance of each number of hits" mechanic.)
 */
export function multiHitRollDistribution(
  gen: MultiHitGen,
  modifier: MultiHitModifier,
): Record<number, number> {
  if (modifier === 'skillLink') return { 5: 1 }
  if (modifier === 'loadedDice') return { 4: 0.5, 5: 0.5 }
  return { ...MULTI_HIT_BASE[gen] }
}

export interface MultiHitOutcome {
  hits: number          // 0 (accuracy check failed) or 2–5
  probability: number
}

/** Full outcome distribution including the single accuracy gate. accuracy is 0–100. */
export function multiHitOutcomes(
  accuracy: number,
  gen: MultiHitGen,
  modifier: MultiHitModifier,
): MultiHitOutcome[] {
  const p = clamp(accuracy / 100, 0, 1)
  const roll = multiHitRollDistribution(gen, modifier)
  const outcomes: MultiHitOutcome[] = [{ hits: 0, probability: 1 - p }]
  for (const key of Object.keys(roll)) {
    const hits = Number(key)
    outcomes.push({ hits, probability: p * roll[hits] })
  }
  return outcomes.sort((a, b) => a.hits - b.hits)
}

/** E[hit count] given the move's single accuracy check passed. */
export function expectedRolledHits(gen: MultiHitGen, modifier: MultiHitModifier): number {
  const roll = multiHitRollDistribution(gen, modifier)
  return Object.entries(roll).reduce((sum, [h, pr]) => sum + Number(h) * pr, 0)
}

/** E[total hits] over the whole move = P(accuracy passes) × E[rolled hit count]. */
export function expectedTotalHits(
  accuracy: number,
  gen: MultiHitGen,
  modifier: MultiHitModifier,
): number {
  return clamp(accuracy / 100, 0, 1) * expectedRolledHits(gen, modifier)
}
