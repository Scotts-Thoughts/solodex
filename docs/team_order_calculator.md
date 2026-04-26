# Team Order Calculator

A modal in the Trainers tab that predicts the order in which a trainer will
send out their party Pokémon, given the player's active Pokémon's typing.

Currently supports **gen 2** (Gold/Silver/Crystal), **gen 3** (Ruby/Sapphire/
Emerald, FireRed/LeafGreen), and **gen 4** (Diamond/Pearl, Platinum,
HeartGold/SoulSilver). The button is gated on `getSupportedGen(game)` and
appears next to the "export team as PNG" button on the trainer detail view.

---

## Source documents

The per-gen algorithms were ported from disassembly/decomp trees outside
this repo. Re-read these before touching the calculator core — they include
file/line references, the rationale behind quirks, and the validation that
went into the port.

| Gen | Reference doc | Decomp tree |
|---|---|---|
| 2 | `A:\Cygwin\home\scott\stp-pokecrystal\docs\enemy_trainer_send_out_logic.md` | pokecrystal |
| 3 | `A:\decomps\stp-pokeemerald\docs\enemy_trainer_send_out_logic.md` | pokeemerald |
| 4 | `A:\decomps\stp-pokeplatinum\docs\trainer_switch_ai.md` | pokeplatinum |

If you add a new gen, write or read its equivalent doc *first* and only
then port it — the algorithms have non-obvious quirks (Gen 3's defensive
scoring direction, Gen 4's `u8` overflow, Gen 2's mutual-SE collapsing to
neutral) that are easy to get subtly wrong without the reference.

---

## Code map

| File | Purpose |
|---|---|
| `src/renderer/src/utils/teamOrderCalculator.ts` | Pure-logic core. One `simulateOrder*` function per gen plus a dispatcher; `getSupportedGen(game)` returns `'2' \| '3' \| '4' \| null`. |
| `src/renderer/src/components/TeamOrderCalculator.tsx` | The modal. Type pickers, step rows, PNG export. |
| `src/renderer/src/components/TrainerDetail.tsx` | Renders the "Team Order" button (gated on `getSupportedGen`) and mounts the modal. Search for `calcOpen` / `TeamOrderCalculator`. |

The core has zero React dependencies — it's pure data in / data out, so
it's straightforward to unit-test or call from elsewhere if needed.

---

## Algorithm summary

All gens share: **lead is always slot 0** (no scoring at battle start).
The differences are entirely in the post-faint replacement logic.

### Gen 2 (`simulateOrderGen2`)

Each non-fainted slot gets a `+1 / 0 / -1` score:

- **+1** = has a super-effective move *and* the player isn't super-effective
  vs it
- **0** = mutual SE, or mutual none
- **-1** = no SE move *and* player is SE vs it (also: current/fainted slots)

Pick rule:

1. Lowest-indexed `+1`
2. else lowest-indexed `0`
3. else uniform random over the alive non-current slots (deterministic only
   when one remains — the calculator surfaces multi-candidate randoms as a
   `gen2-random` step and stops simulating)

Move power is ignored — status moves with SE typing still count
(matches the game).

### Gen 3 (`simulateOrderGen3`)

Phase 1: `typeDmg = 10` start, then `ModulateByTypeEffectiveness` is called
once per opponent type against the candidate's two types. Picks the
candidate with the **highest** typeDmg (i.e. the one that takes the *most*
damage from the player's STAB — flagged as a probable bug in the source) AND
that has at least one SE move. If the top-scorer has no SE move, mark it
disregarded and re-run the sweep.

Tie-break: lowest party slot. Candidates with `typeDmg = 0` are never
picked — the comparison is `bestDmg < typeDmg` and `bestDmg` starts at 0.

Phase 2 fallback (damage-based) is surfaced as `gen3-phase2` and not
simulated — the engine uses the *outgoing* mon's stats with the candidate's
move, plus a `u8` overflow without the `BUGFIX` define. Predicting it
faithfully would be more misleading than admitting the indeterminacy.

**Engine quirk we reproduce**: single-typed players have `type1 == type2`
in `gSpeciesInfo`, so `ModulateByTypeEffectiveness` gets called twice with
the same attacker type → multipliers double-apply. We mimic this by
internally setting `effOppType2 = oppType2 ?? oppType1` before the loop.

### Gen 4 (`simulateOrderGen4`)

Stage 1: sums two `BattleSystem_TypeMatchupMultiplier` calls (one per
candidate type), each starting at `mul = 40` (= 1×). This is the **inverse
direction** of gen 3 — the candidate is scoring as the *attacker*, so a
higher score means the candidate's STAB does more damage *to the player*.
Picks the highest-scoring candidate that also has an SE move; on failure
mark disregarded and retry. Tie-break: lowest slot.

The engine's score helper does NOT include `NO_EFFECT` (immunity) chart
rows — those are handled by `ApplyTypeChart` elsewhere. We skip
`noEffVs` matches in `gen4TypeMatchupMultiplier` to match.

**`u8` overflow bug is reproduced**: `score` is `u8` in stock Platinum, so
summed scores above 255 wrap silently. Comparison uses `score & 0xFF`, which
can put genuinely-stronger candidates behind weaker ones. The eval object
exposes both the true score and the 8-bit value; the UI annotates picked
mons with `(8-bit: X — wraps in stock Platinum)` when truncation matters.

Stage 2 fallback (damage-based, also `u8`-truncated, also uses outgoing
mon's stats) is surfaced as `gen4-stage2` and not simulated.

---

## What the calculator does NOT model

These are deliberately out of scope for the current implementation. If a
future change needs them, they're listed here so they don't get stumbled
into:

- **Voluntary mid-turn switching.** Gen 2's `CheckAbleToSwitch`
  (gated by `SWITCH_OFTEN/SOMETIMES/RARELY` flags), gen 3's `ShouldSwitch`
  heuristic stack, and gen 4's `TrainerAI_ShouldSwitch` heuristic stack
  are all separate from the post-faint scoring. Modeling them needs more
  inputs than the calculator collects (last move that hit, perish
  counter, sleep status, party abilities, etc.) and several use RNG.
- **Abilities and held items.** Levitate, Wonder Guard, Flash Fire, Sitrus
  Berry, etc. all influence the gen 3+ engines' real `CalcEffectiveness` /
  `CalcMoveDamage` calls. We use the raw type chart only.
- **Doubles.** All three gens have doubles-specific paths (the AI scores
  against a randomly-picked opposing battler via `BattleRandom & 1` in
  gen 3+). The calculator assumes singles.
- **Player switches.** The simulation assumes the player's active mon does
  not change. If the player switches mid-battle the user must re-open the
  calculator with the new types.
- **Player's exact moves.** We only ask for type 1 / type 2. The
  SE-move check uses the player types as the *defender* — actual move
  coverage isn't relevant to the trainer's switch scoring (only the
  player's typing is, since that's what the AI sees).
- **Conversion / Soak / type-changing effects.** Engines read base types
  from species data, not the live mon struct, in the switch routines —
  but we don't even have access to live state, so this is moot.

---

## Adding another generation

Rough recipe:

1. Find or write the per-gen reference doc in the relevant decomp tree
   (`pokefirered`, `pokeruby`, `pokediamond`, `pokeblack`, `pokesoulsilver`,
   …). Verify the algorithm against the actual functions before porting.
2. Add a `simulateOrderGen<N>` to `teamOrderCalculator.ts` following the
   pattern of the existing per-gen functions. Use the shared
   `cachedMatchups` / `combinedMultiplier` / `defenderTypes` helpers; add
   gen-specific helpers (e.g. `applyModulate` for gen 3,
   `gen4TypeMatchupMultiplier` for gen 4) inline.
3. Add the new reasons (e.g. `gen5-...`) to the `StepReason` union.
4. Extend `getSupportedGen` to include the new gen string.
5. Add the new dispatch branch in `simulateOrder`.
6. Update `reasonLabel`, the fallback-step heading switch, and the
   per-step extras render in `TeamOrderCalculator.tsx`.
7. Add a `GEN_NOTE[<gen>]` footer string.
8. If the gen introduces new types (Fairy in gen 6), expand
   `PRE_FAIRY_TYPES` or split into a per-gen type list driven by
   `getSupportedGen`.

The trainer button gating in `TrainerDetail.tsx` is already
gen-agnostic — it just checks `getSupportedGen(selectedGame) !== null`.

---

## Other notes

- **Move-name color palette.** SE move names are colored by the move's
  type. The standard `TYPE_COLORS` (from `TypeBadge.tsx`) is tuned for
  white-text-on-colored-fill badges and reads poorly as raw text on the
  modal's dark background — Ghost, Dark, Ground, Dragon, Poison especially.
  `TeamOrderCalculator.tsx` defines a `TYPE_TEXT_COLOR_OVERRIDES` map with
  brighter shades for those types; everything else falls back to
  `TYPE_COLORS`. If you add a new type or want to retune, edit there.
- **PNG export.** The export button uses the same `html-to-image`
  `toCanvas` → composite-onto-1920×1080 pattern as the trainer party
  export in `TrainerDetail.tsx`. Before capture it temporarily lifts the
  modal card's `max-height: 90vh` and the body's `overflow-y: auto` so
  the full predicted order ends up in the image even when the on-screen
  modal is scrolling. State is restored in a `finally` block. The export
  and close buttons are wrapped in `data-export-ignore` so they're
  filtered out.
- **Filename convention.** `${timestamp}-${GAMENAME}-${trainer}_team_order_vs_${type1}[_${type2}].png`
  via `buildExportFilename`, matching the rest of the app's exports.
