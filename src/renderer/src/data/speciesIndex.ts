/**
 * Species-name normalisation and the cross-game species index.
 *
 * Pure functions only: the build-time data plugin
 * (scripts/vite-plugin-solodex-data.ts) runs `buildSpeciesIndex` over every
 * game's Pokedex so the list the app shows at startup does not need any game
 * loaded, and the runtime data layer applies `normalizePokedex` to each game
 * as it arrives. Keep both sides using these same functions.
 */
import type { EvolutionEntry, EvolutionStage, PokemonData, PokemonListEntry } from '../types/pokemon'
import { isMegaForm } from './forms'

// Normalize species names that differ across gens (e.g. Nidoran♀ vs Nidoran_F)
export const SPECIES_ALIASES: Record<string, string> = {
  'Nidoran♀': 'Nidoran_F',
  'Nidoran♂': 'Nidoran_M',
  "Farfetch’d": "Farfetch'd",
  "Galarian Farfetch’d": "Galarian Farfetch'd",
  "Sirfetch’d": "Sirfetch'd",
  'Wormadam (Plant Cloak)': 'Wormadam',
  'Wormadam (Sandy Cloak)': 'Wormadam (Sandy)',
  'Wormadam (Trash Cloak)': 'Wormadam (Trash)',
  'Giratina': 'Giratina (Altered)',
  'Shaymin': 'Shaymin (Land)',
  'Deoxys': 'Deoxys (Normal)',
  'Meloetta': 'Meloetta (Aria)',
}

// Display names: show symbols instead of underscored internal names
export const DISPLAY_NAMES: Record<string, string> = {
  'Nidoran_F': 'Nidoran♀',
  'Nidoran_M': 'Nidoran♂',
}

export function displayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name
}

/** Apply SPECIES_ALIASES to a game's species keys and evolution families. */
export function normalizePokedex(raw: Record<string, PokemonData>): Record<string, PokemonData> {
  const hasAliases = Object.keys(raw).some(k => k in SPECIES_ALIASES)
  if (!hasAliases) return raw
  const out: Record<string, PokemonData> = {}
  for (const [name, data] of Object.entries(raw)) {
    const canonical = SPECIES_ALIASES[name] ?? name
    const family = data.evolution_family?.map(evo => {
      const evoCanonical = SPECIES_ALIASES[evo.species] ?? evo.species
      return evoCanonical !== evo.species ? { ...evo, species: evoCanonical } : evo
    })
    out[canonical] = { ...data, species: canonical, evolution_family: family ?? data.evolution_family }
  }
  return out
}

/**
 * Stage from the species' own family plus `evolvedFromSet` (every species that
 * appears as an evolution target in any game): first (evolves, not evolved
 * from), middle (both), final (evolved from, does not evolve), single (neither).
 */
export function getEvolutionStage(name: string, family: EvolutionEntry[] | undefined, evolvedFromSet: Set<string>): EvolutionStage {
  if (isMegaForm(name)) return 'mega'
  if (!family || family.length <= 1) return 'single'
  const evolvesInto = family.some(e => e.species !== name && e.method !== null)
  const evolvedFrom = evolvedFromSet.has(name)
  if (evolvesInto && !evolvedFrom) return 'first'
  if (evolvesInto && evolvedFrom) return 'middle'
  if (!evolvesInto && evolvedFrom) return 'final'
  // Has family but doesn't evolve and nothing evolves into it (shouldn't happen, but fallback)
  return 'single'
}

/**
 * Sorted, deduplicated list of every species across `games` (in that order:
 * a species' list entry takes its typing from the first game that has it),
 * with the games each species appears in.
 */
export function buildSpeciesIndex(
  dexByGame: Record<string, Record<string, PokemonData> | undefined>,
  games: readonly string[],
): PokemonListEntry[] {
  const normalized: [string, Record<string, PokemonData>][] = []
  for (const game of games) {
    const dex = dexByGame[game]
    if (dex) normalized.push([game, normalizePokedex(dex)])
  }

  // Build set of all Pokemon that something else evolves into
  const evolvedFromSet = new Set<string>()
  for (const [, dex] of normalized) {
    for (const data of Object.values(dex)) {
      if (!data.evolution_family) continue
      for (const evo of data.evolution_family) {
        if (evo.method !== null && evo.species !== data.species) evolvedFromSet.add(evo.species)
      }
    }
  }

  const seen = new Map<string, PokemonListEntry>()
  for (const [game, dex] of normalized) {
    for (const [name, data] of Object.entries(dex)) {
      const entry = seen.get(name)
      if (entry) {
        entry.games.push(game)
        continue
      }
      seen.set(name, {
        name,
        national_dex_number: data.national_dex_number,
        type_1: data.type_1,
        type_2: data.type_2,
        growth_rate: data.growth_rate,
        evolution_stage: getEvolutionStage(name, data.evolution_family, evolvedFromSet),
        games: [game],
      })
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.national_dex_number - b.national_dex_number)
}
