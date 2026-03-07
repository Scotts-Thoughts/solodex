# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Electron app in dev mode (hot reload)
npm run build        # Build for current platform
npm run build:mac    # Build + package for macOS
npm run build:win    # Build + package for Windows
```

No linter or test suite is configured.

## Architecture

**Stack:** Electron + React + TypeScript + Vite (via `electron-vite`) + Tailwind CSS

### Path Aliases (renderer only)
- `@` → `src/renderer/src`
- `@data` → `data_objects-main`

### Data Layer (`src/renderer/src/data/index.ts`)
Single entry point for all data access. Imports raw JS data files from `data_objects-main/` and exposes typed functions:
- `getAllPokemon()` — sorted, deduplicated list across all games
- `getPokemonData(name, game)` — full `PokemonData` for a species in a game
- `getGamesForPokemon(name)` — which games contain a species
- `getMoveData(moveName, game)` — move details, walking back through generations
- `getTypeMatchups(type, game)` — offensive/defensive effectiveness

`GAME_TO_GEN` maps game names to generation strings (`'1'`–`'9'`) for indexing into `moves.js` and `effectiveness.js`. Move data only exists through gen 5; gen 6+ falls back to gen 5. Effectiveness data only exists through gen 4; gen 5+ falls back to gen 4 (note: Fairy type introduced in gen 6 is not reflected).

### Raw Data (`data_objects-main/`)
Plain JS files with named exports:
- `pokedex.js` — all games in one object keyed by game name
- `pokedex/black.js` — Black-specific file with slightly different schema (uses `rom_id` instead of `national_dex_number`; the data layer adapts this)
- `moves.js` — keyed by generation string
- `effectiveness.js` — keyed by generation string
- `pokedex/<game>.js`, `trainers/<game>.js` — per-game individual files

### UI Structure (`src/renderer/src/`)
`App.tsx` manages two pieces of state: selected species and selected game. Layout is:
1. Full-width `GameToggle` bar at top (tabs for each game the species appears in)
2. Left panel: `PokemonList` (searchable, sorted by dex number)
3. Right panel: `PokemonDetail` — left column (sprite, identity, stats, evolutions) + right column (`Movepool`)

Keyboard shortcut: Cmd/Ctrl+1–5 cycles through available games in that generation.

Sprites are loaded from the PokeAPI GitHub sprites CDN by national dex number, with a fallback `?` on error.

### Config Notes
- `postcss.config.js` and `tailwind.config.js` must use `module.exports` (CJS), not `export default`
- `electron.vite.config.ts` uses ES module format (fine as-is)
- `process.platform` is injected via `define` in the renderer vite config (no nodeIntegration required)
