/** Sort order for TM/TR/HM prefixes: TM first, then TR, then HM, then unknown */
function tmhmOrder(prefix: string): number {
  if (prefix.startsWith('TM')) return 0
  if (prefix.startsWith('TR')) return 1
  if (prefix.startsWith('HM')) return 2
  return 3
}

/** Comparator for sorting TM/HM rows by prefix (TM before TR before HM, then by number) */
export function compareTmHmPrefix(a: string, b: string): number {
  const oa = tmhmOrder(a), ob = tmhmOrder(b)
  if (oa !== ob) return oa - ob
  return parseInt(a.slice(2) || '0') - parseInt(b.slice(2) || '0')
}
