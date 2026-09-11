/**
 * Stat stage multipliers per generation.
 *
 *   Gen 1–2  two-digit decimal table (pokered data/battle/stat_modifiers.asm,
 *            pokecrystal data/battle/stat_multipliers.asm): −1 is 66/100 not
 *            2/3, −4 is 33/100, −5 is 28/100. `floor(stat*num/den)`, min 1,
 *            cap 999.
 *   Gen 3–5  exact fractions applied as one `stat*num/den`
 *            (pokeemerald gStatStageRatios, pokeplatinum sStatStageBoosts,
 *            Gen 5 per Smogon's BW research). Gen 5 wraps the product to
 *            16 bits (OF16) before dividing.
 *
 * Accuracy / evasion stages use their own tables (see `accuracyStageMultiplier`):
 *   Gen 1    the stat table above (pokered CalcHitChance → StatModifierRatios)
 *   Gen 2–4  33/36/43/50/60/75 … 133/166/200/233/266/300 % (pokecrystal
 *            data/battle/accuracy_multipliers.asm, pokeemerald
 *            sAccuracyStageRatios, pokeplatinum HitRateByStage)
 *   Gen 5    (3+n)/3 and 3/(3+n) (Showdown hitStepAccuracy)
 */
import { OF16 } from './math'

const GEN12: [number, number][] = [
  [25, 100], [28, 100], [33, 100], [40, 100], [50, 100], [66, 100],
  [1, 1],
  [15, 10], [2, 1], [25, 10], [3, 1], [35, 10], [4, 1],
]

const GEN345: [number, number][] = [
  [2, 8], [2, 7], [2, 6], [2, 5], [2, 4], [2, 3],
  [2, 2],
  [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2],
]

const ACCURACY_GEN234: [number, number][] = [
  [33, 100], [36, 100], [43, 100], [50, 100], [60, 100], [75, 100],
  [1, 1],
  [133, 100], [166, 100], [2, 1], [233, 100], [133, 50], [3, 1],
]

export const clampStage = (s: number): number => Math.max(-6, Math.min(6, s))

export function stageMultiplier(gen: number, stage: number): [number, number] {
  const s = clampStage(stage) + 6
  return gen <= 2 ? GEN12[s] : GEN345[s]
}

/** Apply a stage to a raw stat the way this gen does. */
export function applyStage(gen: number, stat: number, stage: number): number {
  const s = clampStage(stage)
  if (s === 0) return stat
  const [num, den] = stageMultiplier(gen, s)
  if (gen <= 2) return Math.max(1, Math.min(999, Math.floor(stat * num / den)))
  if (gen === 5) return Math.floor(OF16(stat * num) / den)
  return Math.floor(stat * num / den)
}

/** Ratio applied to a move's accuracy for a combined accuracy/evasion stage. */
export function accuracyStageMultiplier(gen: number, stage: number): [number, number] {
  const s = clampStage(stage)
  if (gen === 1) return GEN12[s + 6]
  if (gen === 5) return s >= 0 ? [3 + s, 3] : [3, 3 - s]
  return ACCURACY_GEN234[s + 6]
}

const fmtRatio = ([num, den]: [number, number]): string => {
  const v = num / den
  return `×${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')}`
}

/** Human-readable multiplier for a stage ("×0.66", "×2"). */
export function stageLabel(gen: number, stage: number): string {
  return fmtRatio(stageMultiplier(gen, stage))
}

/** Same for an accuracy / evasion stage ("×0.75", "×1.33"). */
export function accuracyStageLabel(gen: number, stage: number): string {
  return fmtRatio(accuracyStageMultiplier(gen, stage))
}
