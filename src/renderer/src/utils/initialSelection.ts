import { getAllPokemon, getGamesForPokemon } from '../data'

/**
 * The species and game the app opens on: the last-viewed species if it still
 * exists, else the first in the list, in the first game that has it. Used by
 * main.tsx to load that game before the first render and by App to select it.
 */
export function resolveInitialSelection(): { species: string; game: string } | null {
  const all = getAllPokemon()
  if (all.length === 0) return null
  let saved: string | null = null
  try { saved = localStorage.getItem('lastSelected') } catch { /* storage unavailable */ }
  const species = saved && all.some(p => p.name === saved) ? saved : all[0].name
  const game = getGamesForPokemon(species)[0] ?? ''
  return { species, game }
}
