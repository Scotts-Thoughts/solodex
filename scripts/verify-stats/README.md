# verify-stats

Cross-checks the stat data in `data_objects-main/` against the game
decompilations, so a regenerated data file can be trusted before it ships.

```bash
npm run verify:stats               # base stats + trainer parties, all games
npm run verify:stats -- base       # just base stats
npm run verify:stats -- trainers   # just trainer parties
npm run verify:stats -- --verbose  # print every mismatch and every skipped entry
```

Exit code is non-zero if any table has a mismatch. Decomp paths default to the
checkouts listed in `CLAUDE.md`; override any with an env var named after the
repo (`POKERED=…`, `POKEPLATINUM=…`, …) — see `config.mjs`.

## What it checks

| Table | Compared against |
| --- | --- |
| Base stats, Gen 1–2 | `data/pokemon/base_stats/*.asm` in pokered / pokeyellow / pokegold / pokecrystal |
| Base stats, Gen 3 | `species_info.h` / `base_stats.h` in pokeruby / pokeemerald / pokefirered, plus the per-version `sDeoxysBaseStats` overrides |
| Base stats, Gen 4 | `res/pokemon/*/data.json` in pokeplatinum (Gen 4 never changed a base stat, so it covers DP and HGSS too) and its `forms/` subfolders |
| Trainer parties, Gen 1–4 | The ROM's party tables, run through that generation's actual DV / IV / nature generation (documented at the top of `trainers.mjs`) — every stat, and from Gen 3 the nature as well |
| Trainer parties, Gen 5 | No decomp exists, so only internal consistency: does some uniform IV reproduce the stored stats under the Gen 3+ formula? |

`formulas.mjs` is a deliberately separate transcription of the stat formulas
from the decomps. It must not import `src/renderer/src/utils/damageCalc.ts` —
if the two drift apart, that is the thing this is meant to catch.

## Reading the output

```
OK   Platinum trainers                                     1878 checked
FAIL HeartGold and SoulSilver trainers                     1776 checked, 5 mismatched
       210 (Beauty Caroline) slot2 MARILL L38 nature: app=Quirky rom=Careful
```

Skipped entries are ones the harness couldn't line up with a ROM row (an
unparseable `rom_id`, a species missing from the game's pokedex file) — they
are worth a look in `--verbose` mode but don't fail the run.
