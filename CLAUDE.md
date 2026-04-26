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

**Purpose:** Pokemon solo challenge reference app (Solodex). Browse Pokemon data across all mainline games (Gen 1-9), compare stats, movepool, type matchups, and filter by various criteria.

### Path Aliases (renderer only)
- `@` → `src/renderer/src`
- `@data` → `data_objects-main`

### Data Layer (`src/renderer/src/data/index.ts`)
Single entry point for all data access. Imports raw JS data files from `data_objects-main/` and exposes typed functions:
- `getAllPokemon()` — sorted, deduplicated list across all games (cached after first call)
- `getPokemonData(name, game)` — full `PokemonData` for a species in a game
- `getGamesForPokemon(name)` — which games contain a species
- `getMoveData(moveName, game)` — move details, walking back then forward through generations
- `getTypeMatchups(type, game)` — offensive/defensive effectiveness
- `getPokemonDefenseMatchups(type1, type2, game)` — combined dual-type defensive multipliers
- `getPokemonStatRanking(statKey, game)` / `getPokemonTotalRanking(game)` — stat rankings within a game
- `getTmHmCode(moveName, game)` — TM/HM number for a move

`GAME_TO_GEN` maps game names to generation strings (`'1'`-`'9'`). Move data only exists through gen 5; gen 6+ falls back to gen 5. Raw effectiveness data covers gens 1-4; the data layer constructs gen 5 (Steel resistances changed) and gen 6+ (Fairy type added) charts at import time.

`SPECIES_ALIASES` normalizes species names that differ across generations (e.g. curly apostrophe `\u2019` in gen 5+ data → ASCII `'`). `normalizePokedex()` applies these aliases to both species keys and `evolution_family` entries. Currently normalizes: Nidoran gender symbols, Farfetch'd/Galarian Farfetch'd/Sirfetch'd apostrophe variants.

`GAME_TO_TMHM_KEY` overrides the default gen-based TM/HM lookup for games where the TM list differs within a generation (e.g. X&Y uses `'6xy'` key — TM94 is Rock Smash in XY vs Secret Power in ORAS). Extra reverse mappings (e.g. Secret Power → TM94 in XY) are added manually after the auto-generated reverse lookup.

### Raw Data (`data_objects-main/`)
Plain JS files with named exports:
- `pokedex.js` — gen 1-4 games in one object keyed by game name
- `pokedex/<game>.js` — per-game files for gen 5+ (each has slightly different schemas)
- `pokedex/black.js` — uses `rom_id` instead of `national_dex_number`; the data layer adapts this
- `moves.js` — keyed by generation string
- `effectiveness.js` — keyed by generation string
- `tmhm.js` — TM/HM mappings keyed by generation (or game-specific key like `'6xy'` when TM lists differ within a generation)
- `trainers/<game>.js` — per-game trainer data

### Sprite/Artwork System
- Base forms: PokeAPI official-artwork CDN, keyed by national dex number
- Alternate forms: `src/renderer/src/data/formSprites.ts` maps species names to PokeAPI sprite IDs (e.g. `'Mega Absol': 10057`, `'Alolan Raichu': 10100`)
- When adding new form variants, add an entry to `FORM_SPRITE_IDS` in `formSprites.ts`

### UI Structure (`src/renderer/src/`)
`App.tsx` manages state: selected species, selected game, spotlight search, list panel visibility/width. Layout:
1. Full-width `GameToggle` bar at top (tabs grouped by generation, each game has a color)
2. Left panel: `PokemonList` (searchable, filterable, sorted by dex number, resizable via drag handle)
3. Right panel: `PokemonDetail` — left column (sprite, identity, type matchups, stats with rankings, evolutions) + right column (`Movepool` with TM/HM badges). Level-up moves are sorted by level only; moves at the same level preserve their order from the base data (no alphabetical tiebreaker).
4. `SpotlightSearch` — Cmd/Ctrl+K overlay for quick Pokemon search

### PokemonList Filters
The list supports multiple filter dimensions via dropdowns (Gen, Type, Growth Rate, Evolution Stage) and toggles:
- **UI toggles:** Regional forms, Megas, Forms (parenthetical variants like `Deoxys (Attack)`)
- **Hidden toggles (state only, no UI):** Pikachu variants (`showPikachuVariants`, default false), Totem forms (`showTotems`, default false)
- The Megas toggle also covers `(Mega Z)` suffixed forms
- Form name patterns: regional = `Alolan/Galarian/Hisuian/Paldean` prefix; megas = `Mega/Primal` prefix; other forms = parenthesized suffix

### Evolution Stage Detection
`getEvolutionStage()` determines a Pokemon's stage by cross-referencing evolution families across all game data:
- Each Pokemon's `evolution_family` array lists what it evolves INTO (entries with non-null `method`) and other family members (entries with `method: null`)
- A first pass builds `evolvedFromSet` — all Pokemon that appear as evolution targets
- Stage = first (evolves, not evolved from), middle (both), final (evolved from, doesn't evolve), single (neither)

### Regional Form Evolution Remapping
Raw data stores base species names in `evolution_family`. `getPokemonData()` remaps these at read time:
- **Regional forms** (e.g. Alolan Golem): family members are remapped to their regional variant if one exists in the same game (Geodude → Alolan Geodude). Members without a regional form keep their base name (e.g. Cubone stays Cubone for Alolan Marowak).
- **Regional-exclusive evolutions** (`REGIONAL_EVO_LINEAGE`): species like Sirfetch'd, Perrserker, Obstagoon that only evolve from a regional form. Their families are remapped to the regional prefix AND base-form siblings from the other branch are stripped (e.g. Persian removed from Perrserker's family via `replaces`).
- **Base forms**: regional-exclusive evos are filtered out (e.g. base Linoone won't show Obstagoon).
- When adding new regional-exclusive evolutions, add to `REGIONAL_EVO_LINEAGE` with the regional `prefix` and any base-form `replaces` siblings.

### Wiki/Bulbapedia Integration
`WikiPopover` fetches article extracts from Bulbapedia via IPC (`fetch-wiki` in `src/main/index.ts`). Name resolution:
- `WIKI_NAME_OVERRIDES` — manual corrections for names that differ from Bulbapedia (e.g. `Compoundeyes` → `Compound Eyes`, `Faint Attack` → `Feint Attack`, `ViceGrip` → `Vise Grip`, `SelfDestruct` → `Self-Destruct`)
- Automatic camelCase splitting fallback: if initial lookup fails, retries with spaces before mid-word capitals (e.g. `AncientPower` → `Ancient Power`, `SolarBeam` → `Solar Beam`)
- Automatic dash-to-space fallback: if still not found, retries with dashes replaced by spaces (e.g. `Sand-Attack` → `Sand Attack`)

### Comparison Views
- **Species comparison** (`ComparisonView`): side-by-side stats, type effectiveness, and movepools for two different Pokemon in the same game. Stat ranking popovers appear on the side of the clicked Pokemon.
- **Self-comparison** (`SelfComparisonView`): same Pokemon across two different generations, with shared types ordered first in effectiveness display.
- Both are triggered via right-click context menu in `PokemonList`.

Keyboard shortcut: Cmd/Ctrl+1-9 cycles through available games in that generation.

### Team Order Calculator
Modal in the trainer detail view that predicts the order a trainer will send out their Pokémon based on the player's typing. Supported gens 2–4. The button only appears when `getSupportedGen(game)` returns non-null. **Read `docs/team_order_calculator.md` before modifying** — it has the algorithm summaries, links to the per-gen disassembly reference docs they were ported from, and a checklist for adding another generation.

### Config Notes
- `postcss.config.js` and `tailwind.config.js` must use `module.exports` (CJS), not `export default`
- `electron.vite.config.ts` uses ES module format (fine as-is)
- `process.platform` is injected via `define` in the renderer vite config (no nodeIntegration required)
