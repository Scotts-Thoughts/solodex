/**
 * Integer helpers shared by the pipelines. Every game routine is integer
 * arithmetic with truncation at specific points; these make each step explicit
 * so a pipeline reads like the decomp it was ported from.
 */

/** Truncating division (toward zero), as C `/` on non-negative ints. */
export const div = (a: number, b: number): number => Math.trunc(a / b)

/** `floor(a * num / den)`. */
export const mulDiv = (a: number, num: number, den: number): number => Math.trunc(a * num / den)

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** Unsigned 16-bit wrap (Gen 5 stat/damage stores are `STRH`). */
export const OF16 = (n: number): number => n > 65535 ? n % 65536 : n

/** Unsigned 32-bit wrap (Gen 5 intermediate products). */
export const OF32 = (n: number): number => n > 4294967295 ? n % 4294967296 : n

// ─── Gen 5 fixed-point modifiers (docs/damage/gen5_damage_reference.md §0) ───

/**
 * Apply a 4096-scale modifier: round **half down**.
 * `D' = D*M/0x1000`, +1 only if the remainder is strictly greater than 0x800.
 */
export function applyMod(d: number, m: number): number {
  const p = OF32(d * m)
  const q = Math.floor(p / 4096)
  return (p % 4096) > 2048 ? q + 1 : q
}

/**
 * Chain 4096-scale modifiers: round **half up** at every step, then clamp.
 * `M'' = ((M * M') + 0x800) >> 12`.
 */
export function chainMods(mods: number[], lo: number, hi: number): number {
  let M = 4096
  for (const m of mods) {
    if (m !== 4096) M = (M * m + 2048) >> 12
  }
  return clamp(M, lo, hi)
}

// ─── Random rolls ────────────────────────────────────────────────────────────

/** Gen 1–2: `floor(d * r / 255)` for r in 217..255 (39 outcomes), skipped when d <= 1. */
export function gen12Rolls(d: number): number[] {
  if (d <= 1) return [d]
  const out: number[] = []
  for (let r = 217; r <= 255; r++) out.push(Math.floor(d * r / 255))
  return out
}

/** Gen 3–5: `floor(d * (85 + i) / 100)` for i in 0..15 (16 outcomes). */
export function gen3Rolls(d: number, minOne = true): number[] {
  const out: number[] = []
  for (let i = 0; i < 16; i++) {
    let v = Math.floor(d * (85 + i) / 100)
    if (minOne && v === 0 && d !== 0) v = 1
    out.push(v)
  }
  return out
}

/** Collapse a list of equally likely outcomes into an ascending [value, p] distribution. */
export function toDist(values: number[]): Array<[number, number]> {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([v, c]) => [v, c / values.length])
}

/** Weighted merge of several distributions: `parts[i] = [dist, weight]`. */
export function mergeDists(parts: Array<[Array<[number, number]>, number]>): Array<[number, number]> {
  const acc = new Map<number, number>()
  for (const [dist, w] of parts) {
    for (const [v, p] of dist) acc.set(v, (acc.get(v) ?? 0) + p * w)
  }
  return [...acc.entries()].sort((a, b) => a[0] - b[0])
}
