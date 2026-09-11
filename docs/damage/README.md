# Damage calculator — references and verification

The calculator lives in `src/renderer/src/utils/damage/`. One file per
generation implements that generation's damage routine exactly as the game
code does it; everything else (move resolution, items, abilities, badges,
type chart, KO maths) is shared.

| File | Purpose |
|---|---|
| `index.ts` | `calcDamage(...)`: resolves the move, runs the pipeline for the normal and crit case, packages a `DamageResult` |
| `gen1.ts` … `gen5.ts` | The per-generation pipelines. Each header lists the step order with the checklist rule numbers it implements |
| `moves.ts` | `resolveMove`: fixed damage, OHKO, multi-hit, every variable-power formula, conditional doublers, per-gen spread targets |
| `typechart.ts` | ROM type tables **in ROM order** (Gen 1; Gen 2–4 shared) — order matters for per-row truncation |
| `stages.ts`, `badges.ts`, `items.ts`, `abilities.ts`, `math.ts` | Tables and primitives (Gen 1–2 stage decimals, Glacier bug, item hold effects, 4096-scale rounding) |
| `accuracy.ts` | Hit chance per generation: move accuracy → accuracy/evasion stages → items, abilities, weather; the Gen 1 255/256 cap; OHKO level/Speed rules. Ported from the same decomps (Gen 5: Showdown's `hitStepAccuracy`) |
| `ko.ts` | Per-use damage distribution (miss → 0, crit chance folded in, multi-hit convolution, Gen 1 one-roll multi-hit, Triple Kick per-kick accuracy) → n-HKO probabilities |
| `matchup.ts` | App data → `BattlerState`; `computeMatchup` for the view |
| `stats.ts` | Stat formulas (also checked by `verify:stats`) |

## Reference documents

Extracted from the decomps listed in `CLAUDE.md`; every rule cites
`file:line`. Each ends with a numbered **checklist** that is the acceptance
list for that generation's pipeline.

| Gen | Document | Ground truth |
|---|---|---|
| 1 | `gen1_damage_reference.md` | pokered / pokeyellow (byte-identical) |
| 2 | `gen2_damage_reference.md` | pokecrystal, with pokegold differences (§8) |
| 3 | `gen3_damage_reference.md` | pokeemerald; pokefirered / pokeruby diffed (§6) |
| 4 | `gen4_damage_reference.md` | pokeplatinum; pokeheartgold diffed (§5). Diamond/Pearl has no decompiled battle code and is assumed identical |
| 5 | `gen5_damage_reference.md` | **No decomp.** Smogon's disassembly-based "Complete Damage Formula for Black & White", cross-checked with `@smogon/calc` and Showdown; §9 lists the medium-confidence points |

## Verification

```bash
npm test                 # unit tests: hand-computed vectors and order-of-operations sentinels per gen (damage, accuracy, KO odds)
npm run verify:damage    # differential check vs @smogon/calc over trainer data (add --all, --game=…, --verbose)
npm run verify:moves     # moves.js power/type/accuracy/PP/class vs the Gen 1–4 decomps
npm run verify:stats     # stat data vs the decomps
```

`verify:damage` runs every trainer Pokémon of every Gen 1–5 game against a
per-gen roster of player Pokémon, in both directions, normal and crit, and
for major trainers across eleven battle-state scenarios (screens, burn,
weather, stages, doubles, low HP, crit items). Disagreements with Smogon are
findings, not automatically bugs: `scripts/verify-damage/known-divergences.ts`
lists each place Smogon simplifies, with the decomp citation we follow
instead. The run fails only on divergences that are not listed.

## Not modelled (deliberately)

- **Gen 1 badge-boost compounding and burn/paralysis re-application** on
  every stat change (G1 §3, §5). Modelled as a single application. Would need
  a stat-change history.
- **Gen 2 Baton Pass** losing badge/burn adjustments until the next stat
  change (G2 §3.1).
- **Gold/Silver Present** register-clobber bug (G2 §8.2): power is still
  rolled normally.
- **Partner abilities** (Plus/Minus, Flower Gift, Friend Guard) are flags, not
  a second battler.
- **Accuracy** feeds only the KO odds, never the damage. Not modelled there:
  X Accuracy, Lock-On / Mind Reader, Protect, Micle Berry, Tangled Feet
  (confusion is not a state), Gen 4 fog. Zoom Lens needs the target's
  `movedThisTurn` flag, which has no UI toggle yet.
- **Gen 6+ games**: no trainer data and no decomp, so the calculator tab is
  disabled there.
- **Gen 5 damage 0 after the final modifier** is reported faithfully (G5 §9)
  rather than clamped to 1.
