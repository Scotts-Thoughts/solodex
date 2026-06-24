// Presentational formatting helpers for the Misc calculators. Pure, never NaN.

/** Format a probability (0–1) as a percentage string. */
export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0%'
  const pct = value * 100
  if (pct <= 0) return '0%'
  if (pct >= 100) return '100%'
  if (pct < 0.01) return '<0.01%'
  if (pct > 99.99) return '>99.99%'
  return pct.toFixed(decimals) + '%'
}

/** Format a plain number to at most `decimals` places, trimming trailing zeros. */
export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0'
  return Number(value.toFixed(decimals)).toString()
}
