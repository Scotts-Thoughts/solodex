// Modules produced by scripts/vite-plugin-solodex-data.ts

/** Cross-game species list, computed at build time from every game's Pokedex. */
declare module 'virtual:solodex-species-index' {
  const index: import('./pokemon').PokemonListEntry[]
  export default index
}

/** One game's slice of data_objects-main/pokedex.js (gen 1-4 games share that file). */
declare module '@data/pokedex.js?game=*' {
  export const pokedex: Record<string, import('./pokemon').PokemonData>
}
