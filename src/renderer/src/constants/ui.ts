export const POPOVER_Z = 9999

export const ARTWORK_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

export function getCategoryColor(category: string | undefined): string {
  if (category === 'Physical') return '#fb923c'
  if (category === 'Special') return '#60a5fa'
  return '#9ca3af'
}
