# Damage Calculator — Verification & Completion Plan

> **Status (2026-09-10): implemented.** Phases 0–10 below are done except the
> items listed under "Deferred". `docs/damage/README.md` is the maintenance
> entry point: module map, reference docs, verification commands and the
> not-modelled list. Verification state at completion: `npm test` 36 passing;
> `verify:damage --all` 932k comparisons (plain) and 1.7M with scenarios, all
> divergences explained; `verify:moves` clean for Gen 1–4 (three data errors
> fixed: Absorb PP 20 in Gen 1–3, Gen 4 Jump Kick 85 power, Punishment
> variable power).
>
> **Deferred:** per-trainer "badges before this trainer" inference (all badges
> remain the default); `data/users`-style per-mon enemy overrides (enemy
> stages/status/HP/screens apply to the whole opposing party); a per-gen
> generated held-item table (items.ts is hand-typed from the decomps).

Goal: make the Solodex damage calculator (`src/renderer/src/utils/damageCalc.ts` +
`src/renderer/src/components/DamageView.tsx`) reproduce the real games'
damage arithmetic exactly for every game that has trainer data (Gen 1–5),
implement every damaging move, and expose the battle state the formulas depend
on (abilities, items on both sides, screens, burn, doubles, crits, HP-based
power) — with an automated harness that proves it.

This document is the plan. The per-generation **reference documents** it is
built on live in `docs/damage/` and were extracted directly from the decomps
listed in `CLAUDE.md` (every rule cites `file:line`):

| Gen | Reference | Ground truth |
|---|---|---|
| 1 | `docs/damage/gen1_damage_reference.md` (25-rule checklist) | pokered / pokeyellow asm |
| 2 | `docs/damage/gen2_damage_reference.md` (40-rule checklist) | pokecrystal / pokegold asm |
| 3 | `docs/damage/gen3_damage_reference.md` (28-rule checklist) | pokeemerald / pokefirered / pokeruby C |
| 4 | `docs/damage/gen4_damage_reference.md` (30-rule checklist) | pokeplatinum / pokeheartgold C (DP has no decompiled battle code) |
| 5 | `docs/damage/gen5_damage_reference.md` (22-rule checklist + confidence table) | **No decomp.** Smogon's disassembly-based "Complete Damage Formula for Black & White", cross-checked against `@smogon/calc` `gen56.ts` and Pokémon Showdown |

**Read the relevant reference before touching a generation's pipeline.** Each
one has a "Checklist for calculator" section that is the acceptance list for
that generation.

---

## 1. Where things stand today

### 1.1 What exists

- `damageCalc.ts` (711 lines): stat formulas (already verified by
  `verify:stats`), natures, held-item table, badge tables, stat stages, a
  single `calcDamageRange()` used for every generation, and a Gen 1-only crit
  path.
- `DamageView.tsx` (1396 lines): player setup (species, level, DV/IV/EV,
  nature, item, badges, 4 stages, rain/sun, Hidden Power type), trainer
  picker, and a per-enemy-Pokémon matchup card showing player→enemy and
  enemy→player ranges as bars and percents.
- Move data (`data_objects-main/moves.js`) is per generation through Gen 5
  with correct per-gen powers/types (checked: Dig 100/60/60/80/80, Bite
  Normal→Dark, Fury Cutter 10→20 in Gen 5). Pokédex has `weight` (tenths of
  kg preserved), `abilities`, `base_friendship`. Trainer data carries each
  enemy's precomputed `stats`, `ability`, `held_item`, `nature`, `moves`, and
  the trainer's `is_double_battle`.
- Trainer data exists for Gen 1–5 games only. Gen 6–9 games have no trainers,
  so the calculator has no opponents there.

### 1.2 What is wrong (audit vs the decomps)

The current `calcDamageRange` is one generic pipeline:
`(lf·P·A/D)/50 + 2 → STAB → type → item → badge-type → weather → random`.
No real game orders things that way. Concretely:

**All generations**
- Type effectiveness is applied as one combined multiplier (×4/×2/½/¼).
  Every game walks the type chart **row by row in table order** and
  truncates after each row (Gen 2–4 also floor each step at 1). ½ then ×2 is
  not the same as ×2 then ½ on odd numbers. (G1 §1.6, G2 rule 21, G3 rule 16,
  G4 rule 20.)
- Crits are only modelled for Gen 1. Every generation needs a crit row with
  the correct stage-ignoring rule, and Gen 4+ needs Sniper.
- No burn, no Reflect/Light Screen, no Explosion defense halving (Gen 1–4),
  no doubles (spread ¾ or ½, screens ⅔), no abilities anywhere, no enemy held
  items even though trainer data has them, no fixed-damage/OHKO/multi-hit/
  variable-power moves (11 unimplemented damaging moves in Gen 1 rising to
  37 in Gen 5, plus ~30 more whose stored power is not what the game uses).
- Stat stages have no min-1 / cap-999 clamp.
- `MoveSlot` looks up display type/power with `getMoveData(value, 'Red and Blue')`
  regardless of the selected game, so the slot badge can show the wrong
  power/type (e.g. Dig, Bite).
- `unapplyBadgeStatBoost` reverses a floored boost with rounding; the stored
  "base" stat can be off by one after the user edits a field.

**Gen 1** (G1 checklist)
- Missing the `min(q3, 997) + 2` cap (rule 9) and the ≥256 stat scaling: if
  attack or (screen-doubled) defense ≥ 256, **both** are `>>2` and only the
  low byte kept (rule 7). Reflect feeds that test, so Reflect on Def ≥ 128
  changes rounding.
- Crit correctly doubles level and uses raw stats, but must also bypass
  burn/screens once those exist, and the crit *chance* (base Speed / 2 out of
  256, Focus Energy bug ÷4, high-crit ×8) is not shown.
- Badge ×9/8 lacks the 999 cap; the "re-applied on every stat change"
  compounding glitch (G1 §3) is not modelled (see decision D3).
- A ½ step that lands on 0 reads as "doesn't affect" in Gen 1 (no per-step
  floor of 1) — `Math.max(1, …)` hides that.

**Gen 2** (G2 checklist)
- Type-boost items: game does `floor(D·110/100)` **right after ÷50, before
  crit and before +2** (rules 14–16). We apply ×1.1 after STAB/type.
- Order after base: weather → badge type boost → STAB → type → random
  (rules 17–22). We do STAB → type → item → badge → weather → random.
- Badge type boost is `D += max(1, D>>3)` (rule 19); ours is `floor(D·9/8)`
  which differs when `D < 8`.
- Missing: 8-bit truncation loop when either stat > 255 (rule 9, and G/S does
  a single pass then masks — G2 §8), Reflect/Light Screen ×2 uncapped (7),
  burn (4), crit ×2 with the "ignore stages only if attacker's stage ≤
  defender's" rule (6), Explosion (11), the 997 cap (16).
- Item table: Dragon **Scale** is the Gen 2 Dragon booster (Dragon Fang does
  nothing in Gen 2); Pink Bow / Polkadot Bow (Normal) are missing.
- Glacier Badge: SpA boost is real, the SpD boost is a register bug that only
  fires for certain SpA ranges (G2 §3.1). We always boost both.
- Hidden Power must be derived from DVs (power 31–70, 16 types — rule 31);
  Return/Frustration from friendship (rule 32).

**Gen 3** (G3 checklist)
- Type-boost items, Choice Band, badges, species items, Thick Fat, Hustle,
  Guts, Plus/Minus, Marvel Scale all multiply the **stat** before the formula,
  in a fixed order (rule 2). We multiply damage by 1.1 after the type chart.
- Inside `CalculateBaseDamage` the order after ÷50 is: burn ÷2 → screens →
  spread ÷2 → floor 1 (physical) → weather → Flash Fire → **+2** (rules 5–12).
  We add +2 immediately and apply weather after the type chart.
- Then: ×crit ×script-doubler → Charge ×2 → Helping Hand → STAB ×15/10 →
  type chart (per row, floor 1) → random `(100−r%16)/100` (rules 13–17).
- Crit ignores only the attacker's *negative* and defender's *positive*
  stages, and ignores screens; still affected by burn, badges, items.
- Reflect/Light Screen are ÷2 in singles but `2·(dmg/3)` in doubles; spread
  halving only for `MOVE_TARGET_BOTH` (Surf, Rock Slide…), **not**
  Earthquake/Explosion (rules 7–8).
- Struggle skips STAB and the type chart (hits Ghosts). Future Sight / Beat
  Up skip STAB/type/immunities. Spit Up has no random. Flail/Reversal are
  normal in Gen 3 (they lose crit/random only in Gen 2).
- Badge gating differs: RS only in trainer battles, Emerald wild+trainer,
  FRLG everywhere except link. Irrelevant for trainer matchups but must be
  documented.

**Gen 4** (G4 checklist)
- Type items / plates / orbs ×120/100, Muscle Band / Wise Glasses ×110/100,
  Light Ball ×2 (both classes), Technician, Thick Fat ÷2, Overgrow-class,
  Iron Fist, Reckless, Rivalry, Sports all modify **power** in a fixed order
  with truncation after each (rule 4). We apply the item as ×1.2 on final
  damage.
- The `+2` comes after burn, screens, spread ¾, weather, Flash Fire (rule 15).
- **Random is applied before STAB and the type chart** (rules 16–20): base →
  +2 → ×crit (2, Sniper 3) → Life Orb ×130/100 → Metronome → Me First →
  random (min 1) → STAB ×15/10 (Adaptability ×2) → type chart (per row,
  never 0) → Filter/Solid Rock ×¾ → Expert Belt ×120/100 → Tinted Lens ×2.
  We do random last and Life Orb/Expert Belt before random.
- Sandstorm gives Rock types SpD ×1.5 as a *stat* modifier; our weather
  enum has no sand/hail.
- Stage table is applied as one `stat·num/den` (same result as ours), but
  Simple/Unaware alter stages.
- Fixed-damage moves respect immunities; Beat Up / Future Sight ignore the
  type chart entirely; Bide (per code) still gets STAB and type; Spit Up has
  no random; Triple Kick is 10/20/30 by accumulation.

**Gen 5** (G5 checklist)
- We run Gen 5 through the Gen 3/4 branch. Gen 5 is a different system:
  4096-scale modifiers with **round-half-down when applying** and
  **round-half-up when chaining** (G5 §0), chained per category (attack,
  defense, base power, final).
- Order: base(+2) → spread ×0xC00 → weather → crit ×2 (plain) → random
  (before STAB) → STAB 0x1800/0x2000 → type as bit shifts → **burn ÷2 on
  final damage** (moved from the stat) → min 1 → single final chain
  (screens 0x800 / 0xA8F doubles, Multiscale, Tinted Lens, Friend Guard,
  Sniper, Filter, Metronome, Expert Belt 0x1333, Life Orb 0x14CC, berries,
  Minimize/Dig/Dive doublers) → 16-bit store, **no min-1 after the chain**.
- Explosion no longer halves Defense; gems ×1.5; Eviolite; multi-hit
  35/35/15/15; Flail 48-scale; Wring Out fixed-point; Beat Up `baseAtk/10+5`.
- Hustle and Sandstorm-SpD are applied directly, not in the chain.

---

## 2. Target architecture

Replace the single generic function with one exact pipeline per generation,
behind a shared input/output contract, and move the matchup orchestration out
of the React component so it can be unit-tested and reused by the export code.

```
src/renderer/src/utils/damage/
  index.ts          calcDamage(gen, ctx) dispatcher; re-exports types
  types.ts          Attacker, Defender, Field, MoveContext, DamageResult, Assumption
  math.ts           truncating helpers, gen5 applyMod/chainMod, OF16/OF32, type-chart walkers
  stats.ts          (moved from damageCalc.ts) stat formulas, natures, DVs/IVs — unchanged
  stages.ts         per-gen stage tables + clamps; crit stage-ignore rules
  badges.ts         (moved) badge tables; Gen 2 Glacier bug; per-game gating
  items.ts          per-gen held-item effects (hold effect + param), incl. enemy items
  abilities.ts      per-gen ability effects that touch damage (stat, power, damage, immunity)
  typechart.ts      per-gen ordered type tables (row order matters), immunity overrides
  moves/
    index.ts        resolveMove(gen, move, ctx) → MoveContext (power, type, class, flags)
    fixed.ts        Seismic Toss, Night Shade, Sonic Boom, Dragon Rage, Psywave, Super Fang, Endeavor, Final Gambit
    ohko.ts         Guillotine, Horn Drill, Fissure, Sheer Cold (accuracy / speed / level rules)
    multihit.ts     2–5 hit distributions per gen, fixed 2-hit, Triple Kick, Beat Up
    variable.ts     HP-based (Flail/Reversal/Eruption/Water Spout/Brine/Wring Out/Crush Grip), weight (Low Kick/Grass Knot/Heavy Slam/Heat Crash), speed (Gyro Ball/Electro Ball), friendship (Return/Frustration), IV (Hidden Power), counters (Rollout/Ice Ball/Fury Cutter/Echoed Voice/Rage/Spit Up/Stored Power/Punishment/Trump Card), random-power (Present/Magnitude), item (Fling/Natural Gift/Judgment/Techno Blast), Weather Ball, Facade/Revenge/Avalanche/Payback/Assurance/Pursuit/Smelling Salt/Wake-Up Slap/Hex/Venoshock/Acrobatics/Knock Off/Retaliate/Round
    reflective.ts   Counter, Mirror Coat, Metal Burst, Bide — "reflect" results with a user-entered incoming damage
    special.ts      Struggle (no STAB/type), Future Sight/Doom Desire, Spit Up, Dream Eater, Snore, Sleep Talk, Explosion/Self-Destruct, recoil/drain amounts
  gen1.ts  gen2.ts  gen3.ts  gen4.ts  gen5.ts     one exact pipeline each
  ko.ts             roll distributions → n-HKO probabilities, multi-hit convolution
  matchup.ts        computeMatchup(player, trainerMon, field, game) — what DamageView renders
```

`damageCalc.ts` stays as a thin re-export shim during the migration so
`StatsView`, `SpreadCard` and `bulkExport` keep compiling, then is deleted.

### 2.1 Contract

```ts
interface BattlerState {
  species: string; level: number; types: [string, string]
  stats: CalcStats                 // in-battle raw stats (no stages)
  baseStats: BaseStats             // for Beat Up, Gen 1 crit rate
  stages: StatStages               // atk/def/spa/spd/spe/acc/eva
  item: string | null; ability: string | null
  status: 'none' | 'burn' | 'paralysis' | 'poison' | 'toxic' | 'sleep' | 'freeze'
  hpPercent: number                // current HP for Flail/Eruption/Overgrow/Endeavor
  weight: number; friendship: number
  dvs?: Gen12DVs; ivs?: Gen3IVs    // Hidden Power
  badges?: Set<string>             // player only
  isPlayer: boolean
  // per-move counters the UI can set: stockpile, rolloutTurn, furyCutterTurn, rageCounter, metronomeUses, echoedVoice, storedPowerBoosts…
  counters: Partial<Record<CounterKey, number>>
}

interface Field {
  game: string; gen: 1|2|3|4|5
  weather: 'none'|'rain'|'sun'|'sand'|'hail'
  isDoubles: boolean; defendersAlive: 1|2
  screens: { reflect: boolean; lightScreen: boolean }   // on the defender's side
  charge: boolean; helpingHand: boolean; mudSport: boolean; waterSport: boolean
  gravity: boolean; foresight: boolean
}

interface DamageResult {
  kind: 'range' | 'fixed' | 'ohko' | 'reflect' | 'immune' | 'none'
  rolls: number[]            // every possible outcome, ascending (39 for Gen 1–2, 16 for Gen 3–5, 1 for no-random)
  min: number; max: number
  minPercent: number; maxPercent: number
  hits?: { min: number; max: number; distribution: Array<[hits: number, p: number]> }
  crit?: Omit<DamageResult, 'crit'>   // same move on a critical hit
  critChance: number         // 0..1
  effectiveness: number; stab: boolean; category: 'physical'|'special'
  power: number              // the power actually used
  recoil?: { min: number; max: number }; drain?: { min: number; max: number }
  notes: string[]            // "Struggle ignores type and STAB", "Bide: 2× damage taken", …
  assumptions: Assumption[]  // { key: 'friendship', label, value } — surfaced as editable pills in the UI
}
```

`rolls` (not just min/max) is what makes KO-chance and multi-hit maths
possible and what the differential test compares.

### 2.2 Per-generation pipelines (summary — the reference checklists are authoritative)

| Step | Gen 1 | Gen 2 | Gen 3 | Gen 4 | Gen 5 |
|---|---|---|---|---|---|
| Phys/spec | by type | by type | by type | by move | by move |
| Stat mods | stages (66/100 table, cap 999) → badge +x/8 (cap 999) → burn ÷2 | stages → badge +x/8 → burn ÷2; species items ×2; Reflect ×2 uncapped; both stats `>>2` while >255 (G/S single pass + mask) | stages via table; item/ability/badge multipliers on the raw stat in G3 rule 2 order; crit ignores −atk/+def stages | stages ×num/den; Simple/Unaware; stat items/abilities incl. Sandstorm Rock SpD | stages → OF16 → Hustle/Sand direct → chained 4096 mods → applyMod |
| Base | `min(floor(floor(q1·P·A/D)/50), 997)+2`, level doubled on crit | `floor(floor(q1·P·A/D)/50)` → item ×110/100 → crit ×2 → `min(.,997)+2` | `((A·P)·q1)/D/50` → burn → screens (½ or 2·(x/3)) → spread ½ → floor1 → weather → Flash Fire → +2 | `A·P·q1/D/50` with power pre-modified → burn → screens → spread ¾ → weather → Flash Fire → +2 | `floor(floor(q1·BP·A/D)/50)+2` with BP chain |
| After base | STAB `d+d/2` → type rows (0 = no effect) → random 217–255 if d≥2 | (Struggle: skip all) weather → badge-type `+max(1,d>>3)` → STAB → type rows (floor 1) → random 217–255 if d≥2 → post-random doublers | ×crit ×doubler → Charge → Helping Hand → STAB ×15/10 → type rows (floor 1) → random (100−r)/100 → min 1 | ×crit(2/3) → Life Orb → Metronome → Me First → random → STAB → type rows (never 0) → Filter → Expert Belt → Tinted Lens | spread → weather → crit ×2 → random → STAB → type shifts → burn ÷2 → min1 → final chain → OF16 |

---

## 3. Verification strategy (build this first)

The project convention is "no test suite", with `verify:stats` as the one
automated check. Damage arithmetic has far too many branches for manual
checking, so this plan adds two layers:

### 3.1 Unit tests (`vitest`)

Add `vitest` as a dev dependency with `npm test`. It shares Vite's config, so
the `@`/`@data` aliases work with a 10-line `vitest.config.ts`. Tests live
next to the pipelines (`utils/damage/__tests__/genN.test.ts`) and are of
three kinds:

1. **Hand-computed vectors** from the reference docs: for each checklist rule
   at least one case whose expected value was worked by hand from the cited
   arithmetic (e.g. Gen 1 Reflect with Def 130 forcing the ÷4 path; Gen 2
   type item on `D = 57`; Gen 4 random-before-STAB on an odd base; Gen 5
   Reflect on damage 1 → 0).
2. **Order-of-operations sentinels**: cases constructed so that the wrong
   order gives a different integer (odd bases, ½×2 type pairs, 997 cap
   boundary, 255/256 stat boundary, 0xA8F vs ⅔).
3. **Move resolvers**: every variable-power formula at its thresholds
   (Flail 48-scale boundaries, Low Kick weight classes, Hidden Power for a
   handful of DV/IV sets, Return at friendship 0/1/2/3/255, Triple Kick
   10/20/30, Rollout with Defense Curl, Beat Up per member).

### 3.2 Differential harness (`scripts/verify-damage/`, `npm run verify:damage`)

Same shape as `scripts/verify-stats/` (node `.mjs`, non-zero exit on
mismatch, `--verbose`, per-table report):

- **Oracle:** `@smogon/calc` (v0.11, MIT, independent implementation of
  Gen 1–9). For every Gen 1–5 game, sample real matchups (every trainer
  Pokémon × a rotating set of player species/levels/items/abilities/stages/
  screens/weather/burn) and compare full roll arrays, crit rolls, and
  multi-hit ranges.
- **Adjudication:** a disagreement is a finding to settle against the decomp
  reference, not automatically a bug in our code. Keep
  `scripts/verify-damage/known-divergences.mjs` listing cases where Smogon
  simplifies (expected candidates: Gen 1 ≥256 scaling and 997 cap, Gen 2
  G/S single-pass truncation and Glacier bug, Gen 2 badge type `+1` floor,
  Gen 3 doubles-screen `2·(x/3)`, Gen 5 min-0 after final chain, Gen 2
  Dragon Scale) with the decomp citation for why we differ. The harness
  fails only on *unlisted* divergences.
- **Golden file:** a committed JSON of a few hundred matchups with our
  outputs so future regressions show as diffs even where Smogon is silent.
- Stretch: a native oracle for Gen 3 by compiling pokeemerald's
  `CalculateBaseDamage` + `Cmd_typecalc` into a tiny host program. Only if
  the Smogon layer leaves doubt.

### 3.3 Documentation review gate

Each generation's PR is not done until every numbered checklist item in its
reference doc is either (a) covered by a named test, or (b) listed in the
"not modelled" section of `docs/damage/README.md` with a reason (e.g. Gen 1
badge compounding, Gen 2 Baton Pass edge case).

---

## 4. Phases

Each phase is independently shippable. Order matters: the test infrastructure
comes first, then the module split, then generations oldest-first (they are
simplest and their decomps are most exact), then moves, then battle-state
inputs, then UI.

### Phase 0 — Test infrastructure (½ day)
- Add `vitest`, `vitest.config.ts` with aliases, `npm test`.
- Scaffold `scripts/verify-damage/` with the Smogon oracle wired up against
  the *current* `calcDamageRange` so the baseline mismatch count is recorded
  before anything changes.
- Add `docs/damage/README.md` indexing the reference docs and the
  "not modelled" list.

### Phase 1 — Module split and contract (1 day)
- Create `utils/damage/` per §2. Move stats/natures/badges/stages out of
  `damageCalc.ts` unchanged; keep the shim.
- Implement `types.ts`, `math.ts` (truncating ops, `applyMod`/`chainMod`,
  OF16/OF32), `typechart.ts` with **ordered** per-gen tables (Gen 1 table
  verbatim incl. Ghost→Psychic 0; Gen 2–5 with Steel resists; Foresight and
  ability immunity hooks), `ko.ts`.
- `matchup.ts`: lift the two loops from `DamageView`'s `useMemo` into a pure
  function that returns `DamageResult`s. DamageView renders it; behaviour
  unchanged at this point.
- Fix the `MoveSlot` wrong-game lookup and remove `unapplyBadgeStatBoost`
  (store base stats; render boosted values read-only or edit base directly).

### Phase 2 — Gen 1 exact (1 day)
Implement `gen1.ts` to the 25-rule checklist:
- Stat prep: stages (table, min 1/cap 999), badges `+x/8` cap 999 (player
  only), burn `>>1`, Reflect/Light Screen ×2 uncapped, crit override to raw
  stats + doubled level, ≥256 scaling of both stats with low-byte keep,
  Explosion `def>>1`.
- Base with 997 cap, STAB, ordered type rows with "0 = no effect", random
  only when d ≥ 2.
- Crit chance from base Speed (`floor(BS/2)/256`, Focus Energy `/8` bug,
  high-crit moves 255 when BS ≥ 64) shown in the UI.
- Fixed damage set, OHKO (current Speed compare + type chart + 30%),
  Counter/Bide as reflect results, multi-hit 3/8·3/8·1/8·1/8, recoil ¼
  (Struggle ½), drain ½, Jump Kick crash 1 HP, confusion self-hit.
- Yellow: identical (documented).

### Phase 3 — Gen 2 exact (1½ days)
Implement `gen2.ts` to the 40-rule checklist, including:
- The 8-bit truncation loop and the Gold/Silver single-pass variant keyed on
  `game`.
- Item ×110/100 → crit ×2 → cap 997 → +2 ordering; weather → badge type →
  STAB → type → random; pre-/post-random doublers; Struggle bypass.
- Crit rule "ignore stages/screens/badge/burn only if attacker's stage ≤
  defender's"; crit stages incl. Lucky Punch/Stick lock; Scope Lens.
- Glacier SpD bug per G2 §3.1 ranges; Johto and Kanto badge type boosts.
- Hidden Power from DVs (type and 31–70 power); Return/Frustration from
  friendship; Present/Magnitude distributions; Flail/Reversal (no crit, no
  random, `/4` quirk over 255 HP); Rollout/Fury Cutter/Rage/Triple Kick;
  Beat Up per party member; Future Sight; Metal Powder; Dragon Scale, Pink
  Bow, Polkadot Bow; Explosion; Thunder/Solar Beam weather notes.

### Phase 4 — Gen 3 exact (1½ days)
Implement `gen3.ts` to the 28-rule checklist:
- Stat-side multipliers in the exact G3 rule 2 order (Huge Power → badges →
  type item → Choice Band → Soul Dew → species items → Thick Fat → Hustle /
  Plus-Minus / Guts / Marvel Scale); Sports and Overgrow-class on power;
  Explosion def ÷2.
- `((A·P)·q1)/D/50` → burn → screens (singles ÷2, doubles `2·(x/3)`) →
  spread ÷2 (`MOVE_TARGET_BOTH` only) → floor 1 → weather (special only;
  Cloud Nine/Air Lock) → Flash Fire → +2 → ×crit ×doubler → Charge →
  Helping Hand → STAB → ordered type rows (floor 1; Levitate, Wonder Guard,
  Volt/Water Absorb, Flash Fire immunities; Foresight) → random → min 1.
- Crit stages {1/16,1/8,1/4,1/3,1/2}, Focus Energy +2, Scope Lens, Lucky
  Punch, Stick, Battle Armor/Shell Armor.
- Script doublers (Dive/Dig/Fly/Minimize targets, Facade, Smelling Salt,
  Revenge, Weather Ball, Pursuit); Low Kick weight table; Eruption/Water
  Spout; Psywave; Endeavor; Spit Up (no random); Future Sight (snapshot);
  Beat Up; recoil ¼ / ⅓, Rock Head.
- Badge gating per game documented; FRLG/RS/E otherwise identical.

### Phase 5 — Gen 4 exact (2 days)
Implement `gen4.ts` to the 30-rule checklist:
- Power chain in G4 rule 4 order (Charge → Helping Hand → Technician → type
  item/plate → Light Ball → orbs → Muscle Band/Wise Glasses → Thick Fat →
  Sports → Overgrow-class → Heatproof → Dry Skin → Rivalry → Iron Fist;
  Reckless/Pursuit via `powerMul`).
- Stat chain in rule 5 order incl. Sandstorm Rock SpD, Solar Power, Flower
  Gift, Slow Start; Simple/Unaware; crit stage rule.
- Base → burn → screens (½ / ⅔ doubles) → spread ¾ → weather → Flash Fire →
  +2 → ×crit (Sniper 3) → Life Orb → Metronome → Me First → **random** →
  STAB (Adaptability) → ordered type rows (never 0; Scrappy/Foresight/
  Miracle Eye/Gravity/Iron Ball/Roost overrides; Levitate/Magnet Rise) →
  Filter/Solid Rock → Expert Belt → Tinted Lens; Klutz/Embargo null items.
- New variable moves: Gyro Ball, Grass Knot, Brine, Assurance, Payback,
  Punishment, Trump Card, Wring Out/Crush Grip, Fling, Natural Gift,
  Judgment, Avalanche, Wake-Up Slap, Metal Burst, Me First, Feint, Sucker
  Punch, Last Resort, Double Hit, Skill Link.
- HGSS identical to Platinum; DP assumed identical (no decompiled battle
  code) — state this in the UI footnote for DP.

### Phase 6 — Gen 5 (2 days)
Implement `gen5.ts` to the 22-rule checklist from the Smogon disassembly
article, with the confidence-table decisions applied (Gyro Ball +1,
Punishment cap 200, BW modifier order, faithful min-0 after final chain but
display-clamped — see D4):
- `applyMod` / `chainMod` primitives with tests for both rounding modes.
- Attack/defense chains with OF16 and the direct Hustle/Sandstorm steps;
  Eviolite, gems ×1.5, Choice items, Flower Gift, Defeatist, etc.
- Base-power chain; Gen 5 variable moves (Heavy Slam/Heat Crash, Electro
  Ball, Stored Power, Acrobatics, Hex, Venoshock, Retaliate, Round, Echoed
  Voice, Final Gambit, Foul Play uses target Atk, Psyshock uses Def).
- Final chain order; burn after type; multi-hit 35/35/15/15; Explosion no
  def halving; OHKO accuracy `30 + (Lu−Lt)`, Sturdy.
- Label Gen 5 results "verified against documented disassembly research, not
  a local decomp" in `docs/damage/README.md`.

### Phase 7 — Move coverage sweep (1 day, overlaps 2–6)
Walk `moves.js` for each gen and make sure every non-status move resolves to
a `DamageResult` kind, never silently skipped:

| Category | Moves (first gen) | Result kind / inputs |
|---|---|---|
| Fixed | Seismic Toss, Night Shade (level); Sonic Boom 20; Dragon Rage 40; Psywave (range); Super Fang (½ current HP); Endeavor (3); Final Gambit (5) | `fixed`, rolls = the range (Psywave), needs defender current HP for Super Fang/Endeavor |
| OHKO | Guillotine, Horn Drill, Fissure, Sheer Cold (3) | `ohko` + per-gen success condition and accuracy |
| Reflective | Counter, Mirror Coat (2), Bide, Metal Burst (4) | `reflect` with an "incoming damage" assumption pill |
| Multi-hit 2–5 | Double Slap, Comet Punch, Fury Attack, Pin Missile, Spike Cannon, Barrage, Fury Swipes, Bone Rush, Arm Thrust, Bullet Seed, Icicle Spear, Rock Blast, Tail Slap… | `range` + `hits` distribution (3/8·3/8·1/8·1/8; Gen 5 35/35/15/15; Skill Link 5) |
| Fixed 2-hit | Double Kick, Bonemerang, Twineedle, Double Hit, Dual Chop, Gear Grind | `hits: {2,2}` |
| Triple Kick | escalating 10/20/30, per-hit accuracy | `hits` 1–3 with kick powers |
| Beat Up | per-gen formula over the party | needs player party (Gen 2–4: base stats of each member; Gen 5: `baseAtk/10+5`) — default to "this Pokémon only" with a pill |
| HP-based | Flail, Reversal (Gen 2 no crit/random), Eruption, Water Spout, Brine, Wring Out, Crush Grip | `hpPercent` slider (both sides) |
| Weight | Low Kick (Gen 1–2 fixed 50; Gen 3+ table), Grass Knot, Heavy Slam, Heat Crash | from pokédex `weight` |
| Speed | Gyro Ball, Electro Ball | uses both Speeds incl. stages/paralysis |
| Friendship | Return, Frustration | slider, default max (Return 102) |
| IV/DV | Hidden Power (Gen 2: DVs; Gen 3–5: IVs, 30–70) | derived; optional "pick a type" helper that sets IVs |
| Counters | Rollout/Ice Ball (+Defense Curl), Fury Cutter, Rage, Spit Up (stockpiles), Stored Power, Punishment, Trump Card, Echoed Voice, Metronome item | numeric pill per move |
| Random power | Present (40/80/120/heal), Magnitude (10–150) | rolls over the power distribution, shown as expected + range |
| Conditional doublers | Facade, Revenge/Avalanche, Payback, Assurance, Pursuit, Smelling Salt, Wake-Up Slap, Hex, Venoshock, Brine, Retaliate, Round, Acrobatics, Knock Off (Gen 6+ only), Earthquake/Magnitude vs Dig, Gust/Twister vs Fly, Surf/Whirlpool vs Dive, Stomp/Astonish/Needle Arm/Extrasensory/Steamroller vs Minimize, Sky Uppercut | toggle pill "condition met" (default off) |
| Weather/field power | Weather Ball, Solar Beam (½ in rain/sand/hail), Thunder accuracy, Charge, Helping Hand, Mud/Water Sport | from `Field` |
| Item-typed | Fling, Natural Gift, Judgment, Techno Blast | from held item |
| Delayed / no-STAB | Future Sight, Doom Desire (Gen 2–4 no STAB/type), Struggle (no STAB/type Gen 2+; Gen 1 normal Normal move), Beat Up | `notes` |
| Recoil / drain | Take Down, Double-Edge, Submission, Volt Tackle, Flare Blitz, Brave Bird, Wood Hammer, Head Smash, Head Charge, Wild Charge, Struggle; Absorb-class, Drain Punch, Dream Eater (asleep only), Leech Life | `recoil`/`drain` fields |
| Self-KO | Self-Destruct, Explosion (def ÷2 through Gen 4), Memento no damage | note |
| Sleep-gated | Dream Eater, Snore, Sleep Talk | note / assumption |
| Unusable | Shadow Half (Gen 3 XD only) | `none` with note |

### Phase 8 — Battle-state inputs (1½ days)
- **Enemy side from data:** use `TrainerPokemon.held_item` and `.ability`
  automatically (Gen 3+), show them on the card, allow override.
- **Player ability** selector from `PokemonData.abilities` (Gen 3+), default
  first ability.
- **Field panel:** weather incl. sand/hail (Gen 3+ Solar Beam; Gen 4+ Rock
  SpD), Reflect/Light Screen per side, burn on either attacker, doubles
  (default from `trainer.is_double_battle`, with "both defenders alive"),
  Charge/Helping Hand (doubles only), Mud/Water Sport, Foresight.
- **Stages** for both sides (currently player only, 4 stats): add Speed
  (Gyro/Electro Ball, Gen 1 OHKO) and enemy stages.
- **Current HP %** for both sides.
- **Badges:** keep "all badges" default, but add a per-game "badges before
  this trainer" inference (gym-leader order table) so early-game matchups are
  right by default. Gen 2 Kanto badges as a group.
- Gen 1 Special is one stat: keep the existing shared-stage handling; Gen 2
  has separate SpA/SpD stages.

### Phase 9 — UI (2 days)
Split `DamageView.tsx` (1400 lines) into `damage/` components: `PlayerPanel`,
`FieldPanel`, `TrainerPanel`, `MatchupCard`, `DamageRow`, `AssumptionPills`.
- Rows render by `kind`: range bar (existing), fixed value, "OHKO if …",
  "2× incoming", "Immune", "n hits: per-hit x–y, total a–b", with the crit
  row beneath (all gens, with chance) instead of a tooltip tick.
- **KO summary** per row: "guaranteed 2HKO", "37.5% 3HKO" computed from
  `rolls` (`ko.ts`); this is the number a solo-run player actually wants.
- Assumption pills inline on the row (friendship, HP %, hits, "Facade
  boosted", stockpiles) so the user can tune per move without leaving the
  card.
- Per-game footnotes (DP assumed = Platinum; Gen 5 from documented research;
  RS badge gating).
- Keep the spread-card export working (`bulkExport.tsx` uses stats only).
- Gen 6–9 games: show a clear "no trainer data / calculator unsupported for
  this game" state rather than silently running the Gen 5 pipeline (D5).

### Phase 10 — Data layer & docs (½ day)
- `data_objects-main/mods.js` Gen 1 stat table is wrong (2/3, 1/3, 2/7
  instead of 66/100, 33/100, 28/100) and unused — fix or delete.
- Add a per-gen held-item effect table (hold effect + param) generated from
  the decomps (Gen 2 `attributes.asm`, Gen 3 `items.h`, Gen 4 item data) so
  `items.ts` isn't hand-typed; extend `verify:stats`-style checking to it.
- Add an ability-effects table (damage-relevant subset) per gen.
- Confirm trainer party `held_item` names match the item table keys across
  games (Gen 3 "NeverMeltIce" vs "Never-Melt Ice" etc.).
- Update `CLAUDE.md` (Damage Calculator section → this plan + references),
  `docs/damage/README.md` "not modelled" list, and the `verify:damage`
  command.

Rough total: 14–15 focused days. Phases 2–6 can run in parallel once Phase 1
lands, since each generation is its own file with its own tests.

---

## 5. Decisions to confirm (defaults chosen; say if you want otherwise)

- **D1 — Add `vitest`.** The project has no test runner; damage arithmetic
  needs one. Default: add it (dev-only, ~0 impact on the build).
- **D2 — Use `@smogon/calc` as the differential oracle.** Independent
  implementation, MIT. Divergences are adjudicated against the decomps and
  recorded. Default: yes, dev dependency only.
- **D3 — Gen 1 badge-boost compounding and burn re-application glitches.**
  Model as a snapshot (badges applied once, burn applied once) and document
  the glitch, rather than simulating stat-change history. Default: snapshot;
  optional later "stat-change events" counter if wanted.
- **D4 — Gen 5 damage 0 after the final chain.** Faithful behaviour allows 0
  (e.g. 1 damage behind Reflect). Default: compute faithfully, display "0–1"
  with a note; do not silently clamp.
- **D5 — Gen 6–9 games.** No trainer data and no decomp. Default: the
  calculator tab shows "unsupported for this game" instead of running an
  unverified Gen 5 pipeline. Revisit if Gen 6+ trainer data is added.
- **D6 — Hidden Power.** Derive from DVs/IVs (exact) and offer a "choose
  type" helper that sets the IVs; drop the fixed-70 assumption. Default: yes.
- **D7 — Beat Up needs the player's party.** Default: treat the party as the
  single selected Pokémon and expose a pill for extra members.

---

## 6. Risks and open points

- **Gen 5 confidence.** No decomp; the Smogon article is disassembly-based
  and matches `@smogon/calc`/Showdown, but a few points (min-0, doubles
  screen test, BP-chain order) are medium confidence. They are listed in the
  G5 confidence table and should be surfaced as footnotes, not hidden.
- **Diamond/Pearl.** No decompiled battle code in pokediamond; Platinum is
  assumed identical. Known DP-vs-Pt differences are in move data, not the
  formula, and the move data is already per game.
- **Trainer data precision.** Enemy stats are precomputed and verified by
  `verify:stats`, so enemy-side inputs are trustworthy; enemy *items* and
  *abilities* have not been cross-checked against the decomps yet — add that
  to `verify:stats` in Phase 10.
- **Smogon oracle gaps.** Smogon's Gen 1–2 model is known to simplify
  (single-pass ≥256 handling, no Glacier bug, no G/S mask). Expect a
  non-trivial known-divergence list; each entry must cite the decomp.
- **DamageView size.** Refactoring 1400 lines while changing the calc is the
  riskiest step; Phase 1 deliberately changes structure with zero behaviour
  change, gated by the Phase 0 baseline golden file.
