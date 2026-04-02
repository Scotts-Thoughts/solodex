export const POPOVER_Z = 9999

export function getCategoryColor(category: string | undefined): string {
  if (category === 'Physical') return '#fb923c'
  if (category === 'Special') return '#60a5fa'
  return '#9ca3af'
}
