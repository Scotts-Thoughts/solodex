# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Electron app in dev mode (hot reload)
npm run build        # Build for current platform
npm run build:mac    # Build + package for macOS
npm run build:win    # Build + package for Windows
npm run verify:stats # Cross-check base/trainer stat data against the decomps (see scripts/verify-stats/README.md)
npm run verify:moves # Cross-check moves.js power/type/accuracy/PP/class against the Gen 1-4 decomps
npm run verify:damage # Differential check of the damage pipelines against @smogon/calc (see docs/damage/README.md)
npm test             # vitest unit tests (damage pipelines: hand-computed vectors per gen)
npm run issues:list  # Open bug reports on GitHub (see docs/issues/README.md); `issues:fetch -- <n>` dumps one with its screenshot
npm run sprites:resize # Shrink the downloaded HOME sprites in place to 128px (run after download-sprites.mjs; uses Electron's codec, no native deps)
```

Type-check with `npx tsc -p tsconfig.web.json --noEmit --composite false --incremental false` (a handful of pre-existing errors are expected). Never run `tsc` on `tsconfig.node.json` without `--noEmit`: it emits `electron.vite.config.js` next to the `.ts` config, and electron-vite silently prefers the `.js` (those emits are gitignored).

No linter is configured. Run `verify:stats` and `verify:moves` after regenerating anything in `data_objects-main/`; run `npm test` and `verify:damage` after touching `src/renderer/src/utils/damage/`.

## Architecture

**Stack:** Electron + React + TypeScript + Vite (via `electron-vite`) + Tailwind CSS

**Purpose:** Pokemon solo challenge reference app (Solodex). Browse Pokemon data across all mainline games (Gen 1-9), compare stats, movepool, type matchups, and filter by various criteria.

### Path Aliases (renderer only)
- `@` → `src/renderer/src`
- `@data` → `data_objects-main`

### Data Layer (`src/renderer/src/data/index.ts`)
Single entry point for all data access. Only the small always-needed tables (moves, type chart, TM/HM lists, natures, unobtainable moves) are imported statically; every per-game Pokedex, trainer and encounter table is its own build chunk loaded on demand:
- `loadGame(game)` / `loadTrainers(game)` / `loadEncounters(game)` — idempotent, cached for the session. `main.tsx` awaits `loadGame` for the opening game before the first render, then `preloadAllData()` streams the rest in one at a time.
- The synchronous getters below return `null`/`[]` for a game that has not arrived yet. Components that read per-game data go through `useGameData(game, { trainers?, encounters? })` (`data/useGameData.ts`), which triggers the load and re-renders when it lands — put its result in the deps of any memo that calls `getPokemonData`/`getTrainers`. `App` gates each view on the selected game (trainers for Trainers/Damage/Route/Stats, encounters for EVs); views that read a *different* game (`SelfComparisonView`, `TrainerSpotlightSearch`) call the hook themselves.
- `scripts/vite-plugin-solodex-data.ts` (wired into `electron.vite.config.ts` and `vitest.config.ts`) turns every data module into `JSON.parse("...")`, slices the shared gen 1-4 `pokedex.js` per game (`import('@data/pokedex.js?game=<name>')`), and emits `virtual:solodex-species-index`, the cross-game species list computed at build time with `buildSpeciesIndex` (`data/speciesIndex.ts`). Node scripts that use the getters (`scripts/verify-damage`) must `await preloadAllData()` first.
- `getAllPokemon()` — the build-time species index (name, dex number, typing, growth rate, evolution stage, `games`); available before any game has loaded
- `getPokemonTypes(name, game)` — cheap per-game typing for list rows (no evolution-family work)
- `getPokemonData(name, game)` — full `PokemonData` for a species in a game
- `getGamesForPokemon(name)` — which games contain a species (from the index)
- `getMoveData(moveName, game)` — move details, walking back then forward through generations
- `getTypeMatchups(type, game)` — offensive/defensive effectiveness
- `getPokemonDefenseMatchups(type1, type2, game)` — combined dual-type defensive multipliers
- `getPokemonStatRanking(statKey, game)` / `getPokemonTotalRanking(game)` — stat rankings within a game
- `getTmHmCode(moveName, game)` — TM/HM number for a move

`GAMES`, `GEN_GROUPS`, `GAME_COLOR`, `GAME_ABBREV`, `GAME_TO_GEN` and `POKEDEX_SOURCES` (which file, and key inside it, holds each game's Pokedex) live in `data/games.ts`, a pure module the build plugin also imports; `index.ts` re-exports them. `GAME_TO_GEN` maps game names to generation strings (`'1'`-`'9'`). Move data only exists through gen 5; gen 6+ falls back to gen 5. Raw effectiveness data covers gens 1-4; the data layer constructs gen 5 (Steel resistances changed) and gen 6+ (Fairy type added) charts at import time.

`SPECIES_ALIASES` (`data/speciesIndex.ts`) normalizes species names that differ across generations (e.g. curly apostrophe `\u2019` in gen 5+ data → ASCII `'`). `normalizePokedex()` applies these aliases to both species keys and `evolution_family` entries, when a game's table loads and when the plugin builds the index. Currently normalizes: Nidoran gender symbols, Farfetch'd/Galarian Farfetch'd/Sirfetch'd apostrophe variants.

`MOVE_GAME_OVERRIDES` patches individual move fields for one game where paired games in a generation differ (e.g. Hypnosis is 70% accurate in Diamond/Pearl, 60% in Platinum/HGSS). `getMoveData(name, game)` and `getMovesForGen(gen, game)` apply it; `moves.js` itself stays generation-keyed.

`GAME_TO_TMHM_KEY` overrides the default gen-based TM/HM lookup for games where the TM list differs within a generation (e.g. X&Y uses `'6xy'` key — TM94 is Rock Smash in XY vs Secret Power in ORAS). Extra reverse mappings (e.g. Secret Power → TM94 in XY) are added manually after the auto-generated reverse lookup.

### Raw Data (`data_objects-main/`)
Plain JS files with named exports, generated by the scrapers in `A:\Dropbox\stp-projects\programs\data_objects` (read its `SCRAPING.md` before regenerating — Bulbapedia is behind Cloudflare and needs the `bulba_proxy.js` Electron proxy):
- Every file must stay a single `export const NAME = <object literal>` (JSON-style or with unquoted keys): the renderer never evaluates them as JavaScript — the Vite plugin above parses them at build time and ships `JSON.parse` strings, one chunk per game. The files are not packaged separately (`package.json` `build.files` is `out/**` only).
- `pokedex.js` — gen 1-4 games in one object keyed by game name. Species fields (stats, EVs, items, abilities, evolution families) are ROM-derived and verified by `npm run verify:stats`; the learnset fields are refreshed from the Bulbapedia scrape by `merge_gen1to4_pokedex.py`.
- `pokedex/<game>.js` — per-game files for gen 5+, straight from `scrape_pokedex.py`.
- Every move list (`level_up_learnset`, `tm_hm_learnset`, `tutor_learnset`, `egg_moves`, `transfer_learnset`, `prior_evolution_learnset`, `form_change_learnset`, …) is Bulbapedia's per-generation learnset table for that game, in Bulbapedia's order. `verify_bulbapedia.py` in the scraper repo re-derives and diffs them. Level-up entries use `0` = learned on evolution and `-1` = Move Reminder only.
- Move names use the modern spelling with the typographic apostrophe (`Solar Beam`, `King’s Shield`); `moveNameCanonical.ts` collapses spelling variants when comparing against hand-written lists such as `unobtainable_moves.js`.
- The data layer respells learnsets to the game's own spelling at load time (`_MOVE_RENAMES` / `getMoveNameForGame` in `data/index.ts`: `Faint Attack`, `SolarBeam`, `Hi Jump Kick` … through gen 5; `Vice Grip` in gens 6-7), and `getMovesForGen(gen, game)` does the same for move lists. Trainer files and `tmhm.js` are already period-spelled; `moves.js` is modern. Look moves up through `getMoveData`/`getTmHmCode` (alias-aware), never by exact string against `moves.js` keys.
- `moves.js` — keyed by generation string
- `effectiveness.js` — keyed by generation string
- `tmhm.js` — TM/HM mappings keyed by generation (or game-specific key like `'6xy'` when TM lists differ within a generation)
- `trainers/<game>.js` — per-game trainer data

### Sprite/Artwork System
- Sprites are bundled locally (`src/renderer/public/sprites/{artwork,home}/<id>.png`, downloaded by `node scripts/download-sprites.mjs`); base forms are keyed by national dex number. HOME sprites are only ever drawn at ≤44 CSS px, so `npm run sprites:resize` shrinks them in place from PokeAPI's 512px (≈140 MB) to 128px (≈17 MB); artwork stays full size for the lightbox and exports
- Alternate forms: `src/renderer/src/data/formSprites.ts` maps species names to PokeAPI sprite IDs (e.g. `'Mega Absol': 10057`, `'Floette (Eternal)': 10061`)
- When adding new form variants, add an entry to `FORM_SPRITE_IDS` in `formSprites.ts` and re-run the download script (it reads the ids from that file)

### Forms (`src/renderer/src/data/forms.ts`)
`classifyForm(name)` is the single source of truth for what kind of form a display name is: `isMega` (Mega/Primal/`(Mega Z)`), `isRegional` + `region`, `isGmax`, `isVariant` (any other parenthesised form: `Giratina (Origin)`, `Pumpkaboo (Small)`, `Minior (Core)`), `base`, and `introducedGen`. Names can combine a regional prefix with a suffix (`Galarian Darmanitan (Zen)`, `Paldean Tauros (Combat Breed)`). Use it instead of new regexes. The scraper only emits forms that differ in stats, types or learnset; battle-only and cosmetic variants (Totems, Busted Mimikyu, cap Pikachu, Minior colours, Koraidon/Miraidon modes …) are excluded at the source.

### UI Structure (`src/renderer/src/`)
`App.tsx` manages state: selected species, selected game, spotlight search, list panel visibility/width. Layout:
1. Full-width `GameToggle` bar at top (tabs grouped by generation, each game has a color)
2. Left panel: `PokemonList` (searchable, filterable, sorted by dex number, resizable via drag handle). Rows are windowed with `VirtualList` (fixed 25px rows; `TrainerList` and `TrainerSpeedList` use it too), so every row must render at exactly its declared height
3. Right panel: `PokemonDetail` — left column (sprite, identity, type matchups, stats with rankings, evolutions) + right column (`Movepool` with TM/HM badges). Level-up moves are sorted by level only; moves at the same level preserve their order from the base data (no alphabetical tiebreaker) — that order is Bulbapedia's, and `applyRemindLabels` relies on it to mark level-1 moves beyond the last four as `Rem`. `Movepool` also shows a "Prior Evolution Only" table (`prior_evolution_learnset`) and crosses out post-game/banned moves by canonical move key.
4. `SpotlightSearch` — Cmd/Ctrl+K overlay for quick Pokemon search

### PokemonList Filters
The list supports multiple filter dimensions via dropdowns (Gen, Type, Growth Rate, Evolution Stage) and toggles:
- **UI toggles:** Regional forms (`isRegional`), Megas (`isMega`), Forms (`isVariant` or `isGmax`) — all decided by `classifyForm`
- The Gen dropdown also hides kinds of form that did not exist yet (`introducedGen`: megas 6, Alolan 7, Galarian/Hisuian/Gmax 8, Paldean 9)

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

### Damage Calculator
Player-vs-trainer damage ranges: `utils/damage/` (one exact pipeline per generation, `gen1.ts`–`gen5.ts`, plus `moves.ts` for fixed/variable/multi-hit moves, `accuracy.ts` for the per-gen hit chance, `ko.ts` for KO odds that fold in misses, rolls and crits, and `matchup.ts` for app-data glue) rendered by `components/DamageView.tsx` and `components/damage/`. **Read `docs/damage/README.md` before modifying** — module map, verification commands and the not-modelled list. The exact per-gen formulas, extracted from the decomps with `file:line` citations, are in `docs/damage/gen{1,2,3,4,5}_damage_reference.md`; each ends with a numbered checklist the pipeline headers cite. Gen 5 has no decomp and is documented from Smogon's disassembly-based research instead. `utils/damageCalc.ts` is only a re-export shim for the stat formulas and badge tables. Type-chart rows must stay in ROM order (per-row truncation), and any new Smogon disagreement goes in `scripts/verify-damage/known-divergences.ts` with its decomp citation.

### Game Decompilation Repos
Local disassembly/decomp checkouts to consult when verifying actual game behavior (mechanics, formulas, AI, data tables). Prefer these over web sources when a question is about what the game code really does.

| Gen | Games | Path |
| --- | --- | --- |
| 1 | Red & Blue | `A:\Cygwin\home\scott\pokered` |
| 1 | Yellow | `A:\Cygwin\home\scott\pokeyellow` |
| 2 | Gold & Silver | `A:\Cygwin\home\scott\pokegold` |
| 2 | Crystal | `A:\Cygwin\home\scott\pokecrystal` |
| 3 | Ruby & Sapphire | `A:\decomps\pokeruby` |
| 3 | Emerald | `A:\decomps\pokeemerald` |
| 3 | FireRed & LeafGreen | `A:\decomps\pokefirered` |
| 4 | Diamond & Pearl | `A:\Dropbox\stp-projects\programs\poke_map\repos\pokediamond` |
| 4 | Platinum | `A:\decomps\pokeplatinum` |
| 4 | HeartGold & SoulSilver | `A:\Dropbox\stp-projects\programs\poke_map\repos\pokeheartgold` |

Gen 1-2 are asm (pokered/pokeyellow/pokegold/pokecrystal); gen 3 is C (pokeruby/pokeemerald/pokefirered); gen 4 is C/asm for the NDS. No decomp is listed for gen 5+ - use documented sources there.

### Config Notes
- `postcss.config.js` and `tailwind.config.js` must use `module.exports` (CJS), not `export default`
- electron-vite ships the renderer unminified by default; `electron.vite.config.ts` sets `build.minify: 'esbuild'`. A stray `electron.vite.config.js` beside the `.ts` file would silently replace the whole config (see Commands)
- The Play font is bundled (`src/renderer/src/assets/fonts`, `@font-face` in `index.css`); `index.html` must not load fonts from the network
- Startup settings come from one `get-initial-settings` IPC call (`App.tsx`); add new persisted settings to that handler in `src/main/index.ts` as well as their own getter/subscription
- `DamageView` mounts on first visit to the Damage tab and then stays mounted (hidden) so edits survive tab switches
- `electron.vite.config.ts` uses ES module format (fine as-is)
- `process.platform` is injected via `define` in the renderer vite config (no nodeIntegration required)

### Issues (bug reports)
In-app bug reports arrive as GitHub issues on this repo (labels `status:open`, `from:app`) through the Cloudflare Worker in `relay/`; the app side lives in `src/main/issues/`, `src/renderer/src/components/issues/` and `src/shared/issues.ts`. Work them with the `/issues` skill (`.claude/skills/issues/SKILL.md`): it fixes, posts a technical fix note and a plain-language resolution note, relabels to `status:fix-applied` and commits one fix per issue with `(#N)` in the subject. Never use closing keywords (`fixes #N`) — issues are closed by hand after verification (Resolved = closed; Reopen = reopened). **Read `docs/issues/README.md` before modifying** — label scheme, issue body/diagnostics format, relay API and operations. `relay/src/format.ts` is the single source of the issue format; `npm test` covers `src/shared`, `src/main/issues`, `utils/issues` and `relay/test`.
