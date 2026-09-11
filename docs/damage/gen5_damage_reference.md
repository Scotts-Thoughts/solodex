# Generation V (Black/White, Black 2/White 2) Damage Formula — Exact Reference

Purpose: precise integer-arithmetic specification for a TypeScript Gen 5 damage calculator.

## Sources (fetched 2026-09-10)

| Tag | Source | URL |
|---|---|---|
| **[BWART]** | Smogon, "The Complete Damage Formula for Black & White" by Xfr, Bond697, Kaphotics (disassembly of the BW ARM code; annotated asm) — **primary authority** | https://www.smogon.com/bw/articles/bw_complete_damage_formula |
| **[CALC]** | Smogon damage-calc, `calc/src/mechanics/gen56.ts` | https://raw.githubusercontent.com/smogon/damage-calc/master/calc/src/mechanics/gen56.ts |
| **[UTIL]** | Smogon damage-calc, `calc/src/mechanics/util.ts` (pokeRound, OF16/OF32, chainMods, getBaseDamage, getFinalDamage, getModifiedStat, getStabMod) | https://raw.githubusercontent.com/smogon/damage-calc/master/calc/src/mechanics/util.ts |
| **[PS-BA]** | Pokémon Showdown `sim/battle-actions.ts` (getDamage / modifyDamage / hitStepAccuracy / multihit) | https://raw.githubusercontent.com/smogon/pokemon-showdown/master/sim/battle-actions.ts |
| **[PS-B]** | Pokémon Showdown `sim/battle.ts` (`modify`, `chainModify`, `randomizer`) | https://raw.githubusercontent.com/smogon/pokemon-showdown/master/sim/battle.ts |
| **[PS-PK]** | Pokémon Showdown `sim/pokemon.ts` (`calculateStat`, `isGrounded`, `runImmunity`) | https://raw.githubusercontent.com/smogon/pokemon-showdown/master/sim/pokemon.ts |
| **[PS-DEX]** | Pokémon Showdown `sim/dex.ts` (`getHiddenPower`, `getEffectiveness`) | https://raw.githubusercontent.com/smogon/pokemon-showdown/master/sim/dex.ts |
| **[PS-G5]** | Pokémon Showdown `data/mods/gen5/{moves,items,abilities,conditions,typechart,scripts}.ts` | https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/gen5/ |
| **[PS-G4]** | Pokémon Showdown `data/mods/gen4/{scripts,moves}.ts` (used only for the Gen 4 → 5 diff) | https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/gen4/ |
| **[PS-MV]** | Pokémon Showdown `data/moves.ts`, `data/abilities.ts`, `data/items.ts`, `data/conditions.ts`, `data/typechart.ts` (inherited by the gen5 mod unless overridden) | https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/ |
| **[BULBA]** | Bulbapedia "Damage" — **could not be fetched** (Cloudflare 403 via WebFetch, curl, MediaWiki API, and Wayback). Only search-snippet confirmation was obtained: "In Generation V, the Critical multiplier is 2", order "Weather → Critical → random → STAB → Type → Burn → other", three rounding kinds from Gen V (floor / round-half-down / round-half-up), random = integer 85–100 with floor division by 100. | https://bulbapedia.bulbagarden.net/wiki/Damage |

Notation: `÷` = **truncating (floor) integer division**, as in the game's `divmodUnsigned` [BWART]. `ApplyMod` = **round-half-down** fixed-point multiply (§0). All quantities are non-negative integers unless stated.

---

## 0. Arithmetic primitives (the whole formula depends on these)

### 0.1 Modifier = 16-bit fixed point / 4096

> "A modifier is a 16 bit fixed point factor, i.e. a fraction whose divisor is always 0x1000 (4096). For instance, 0x14cc is the modifier for Life Orb (0x14cc/0x1000 is about 1.3)." [BWART]

### 0.2 ApplyMod(D, M) — **round half DOWN**

> "Applying the modifier M to the damage value D means multiplying D by M and dividing the result by 0x1000; then if the decimal part is ≤0.5, round the result down, otherwise round it up. Simply put: D' = round(D * M / 0x1000)" [BWART]

Disassembly [BWART] (`ApplyMod`): `MULS R1,R0 ; R2 = R1 & 0xFFF ; R0 = R1 >> 12 ; if (R2 > 0x800) R0 += 1`. So:

```ts
// exact game behaviour
function applyMod(d: number, m: number): number {
  const p = d * m;                 // 32-bit in game; use OF32 if paranoid
  const q = Math.floor(p / 4096);
  return (p % 4096) > 2048 ? q + 1 : q;   // remainder EXACTLY 2048 (= .5) rounds DOWN
}
```

Smogon calc's equivalent [UTIL]:

```ts
// Game Freak rounds DOWN on .5
export function pokeRound(num: number) {
  return num % 1 > 0.5 ? Math.ceil(num) : Math.floor(num);
}
```
and it is always used as `pokeRound((value * mod) / 4096)`.

Showdown's equivalent [PS-B]:
```ts
modify(value, numerator, denominator = 1) {
  const modifier = tr(numerator * 4096 / denominator);
  return tr((tr(value * modifier) + 2048 - 1) / 4096);   // +2047 then floor == round-half-down
}
```

### 0.3 ChainMod — **round half UP** when combining modifiers

> "If the current modifier is M and you want to chain with another modifier M', the resulting modifier would be: M'' = ((M * M') + 0x800) >> 12" [BWART]

Smogon calc [UTIL]:
```ts
export function chainMods(mods: number[], lowerBound: number, upperBound: number) {
  let M = 4096;
  for (const mod of mods) {
    if (mod !== 4096) {
      M = (M * mod + 2048) >> 12;
    }
  }
  return Math.max(Math.min(M, upperBound), lowerBound);
}
```
Showdown [PS-B]: `this.event.modifier = ((previousMod * nextMod + 2048) >> 12) / 4096;` — identical.

Chain bounds visible in the asm [BWART] (`StoreVolatileVariableFlag3e3` with min/max args): attack & defense chains: min `0x19A` (410), max `0x1000<<5` = `0x20000` (131072); final-modifier chain: min `0x29` (41), max `0x20000`. The Smogon calc passes exactly those: `chainMods(atMods, 410, 131072)`, `chainMods(dfMods, 410, 131072)`, `chainMods(finalMods, 41, 131072)`; for base power it uses `chainMods(bpMods, 41, 2097152)` [CALC]. The bounds never bind in practice.

**Rule: chain all modifiers of one category into a single M first (round-half-up per step), then apply M once to the value (round-half-down).** Never apply modifiers one at a time.

### 0.4 Truncations

* Every `÷` is floor division.
* Attack stat, defense stat, base power and final damage are stored as **unsigned 16-bit** (asm `LSLS #0x10 / LSRS #0x10`, `STRH`) → `OF16(n) = n > 65535 ? n % 65536 : n` [UTIL]. Intermediate products are 32-bit → `OF32`. These only matter for absurd inputs; implement `OF16` on the four stored values to be faithful.
* Type effectiveness and burn are **bit shifts / floor divisions**, not modifiers (§3.8, §3.9).
* Critical hit is a plain `<< 1` (×2), not a modifier (§3.5).

---

## 1. In-battle stat computation

### 1.1 Stat-stage multiplier table (Gen 3+ style; identical in Gen 5)

> "multiply stat by the dividend first then use unrounded division on divisor" [BWART]

| Stage | ×num/den | Stage | ×num/den |
|---|---|---|---|
| −6 | 2/8 | +1 | 3/2 |
| −5 | 2/7 | +2 | 4/2 |
| −4 | 2/6 | +3 | 5/2 |
| −3 | 2/5 | +4 | 6/2 |
| −2 | 2/4 | +5 | 7/2 |
| −1 | 2/3 | +6 | 8/2 |
| 0 | 2/2 | | |

Smogon calc [UTIL]:
```ts
const modernGenBoostTable = [[2,8],[2,7],[2,6],[2,5],[2,4],[2,3],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2]];
stat = OF16(stat * modernGenBoostTable[6 + mod][numerator]);
stat = Math.floor(stat / modernGenBoostTable[6 + mod][denominator]);
```
`staged = (raw * num) ÷ den`.

### 1.2 Attack stat (`BaseAttackMods` [BWART])

1. **Pick the stat & owner.** Physical → Attack, Special → Sp. Attack, of the user. **Foul Play**: use the *target's* Attack stat **and the target's Attack stage** (the asm swaps the Pokémon pointer via `GetPartyPkm` before reading stat+stage; Smogon calc `attackSource = defender` and reads `defender.boosts[attackStat]`) [BWART][CALC].
2. **Stage:**
   * If the *target* has **Unaware** → use the raw stat (no stage).
   * Else if this hit is a **critical hit and the stage is negative** → use the raw stat.
   * Else apply §1.1.
3. **16-bit truncate.**
4. **Hustle** (physical): `atk = ApplyMod(atk, 0x1800)` **applied directly here, before the chain** ("This is a special trigger in the sense that instead of chaining it will directly apply the 0x1800" [BWART]). Smogon calc: `attack = pokeRound((attack * 3) / 2)`.
5. **Chain the attack modifiers** (start 0x1000, bounds 410..131072), in the order listed [BWART]:

| Modifier | Condition |
|---|---|
| 0x800 (×0.5) | **Thick Fat** on target, move is Fire or Ice |
| 0x1800 (×1.5) | **Torrent** user, HP ≤ MaxHP÷3, Water move |
| 0x1800 | **Guts** user, has a major status, physical move |
| 0x1800 | **Swarm** user, HP ≤ MaxHP÷3, Bug move |
| 0x1800 | **Overgrow** user, HP ≤ MaxHP÷3, Grass move |
| 0x1800 | **Plus / Minus** user, an ally has Plus or Minus, special move |
| 0x1800 | **Blaze** user, HP ≤ MaxHP÷3, Fire move |
| 0x800 | **Defeatist** user, CurrentHP ≤ MaxHP÷2 |
| 0x2000 (×2) | **Pure Power / Huge Power**, physical move |
| 0x1800 | **Solar Power**, sun, special move |
| 0x1800 | **Flash Fire** activated, Fire move |
| 0x800 | **Slow Start** (on field < 5 turns), physical move |
| 0x1800 | **Flower Gift**: a Cherrim with Flower Gift on the user's side (including the user itself), sun, physical move |
| 0x2000 | **Thick Club**, user is Cubone/Marowak, physical |
| 0x2000 | **DeepSeaTooth**, user is Clamperl, special |
| 0x2000 | **Light Ball**, user is Pikachu (**both** physical and special — no category restriction in [BWART]; PS-MV boosts Atk and SpA) |
| 0x1800 | **Soul Dew**, user is Latios/Latias, special |
| 0x1800 | **Choice Band**, physical |
| 0x1800 | **Choice Specs**, special |

6. `atk = OF16(ApplyMod(atk, chain))`; Smogon calc also clamps `Math.max(1, …)` [CALC].

Smogon calc snippet [CALC] (`calculateAttackBWXY`):
```ts
if (attackSource.boosts[attackStat] === 0 || (isCritical && attackSource.boosts[attackStat] < 0)) {
  attack = attackSource.rawStats[attackStat];
} else if (defender.hasAbility('Unaware')) {
  attack = attackSource.rawStats[attackStat];
} else {
  attack = getModifiedStat(attackSource.rawStats[attackStat]!, attackSource.boosts[attackStat]!);
}
// unlike all other attack modifiers, Hustle gets applied directly
if (attacker.hasAbility('Hustle') && move.category === 'Physical') {
  attack = pokeRound((attack * 3) / 2);
}
const atMods = calculateAtModsBWXY(attacker, defender, move, field, desc);
attack = OF16(Math.max(1, pokeRound((attack * chainMods(atMods, 410, 131072)) / 4096)));
```

Not in Gen 5: Assault Vest, Fur Coat, Tough Claws, Aerilate etc. (Gen 6). Ignore any Gen 6+ branches in gen56.ts (`gen.num > 5` checks, Mega forms, Fairy, terrain, Auras, Parental Bond, Protean, Tera).

### 1.3 Defense stat (`BaseDefenseMods` [BWART])

1. **Pick the stat.** Physical → Defense; Special → Sp. Defense. Overrides: **Psyshock, Psystrike, Secret Sword** (special moves that "deal physical damage") use **Defense**; **Wonder Room** swaps Def/SpD identifiers for everyone (and cancels the Psyshock override, i.e. Psyshock under Wonder Room hits SpD) [BWART]. Note the Sandstorm check in step 3 uses the *final* identifier.
2. **Stage:**
   * **Chip Away** (and **Sacred Sword** per [PS-MV] `ignoreDefensive: true`) → raw stat.
   * If the *attacker* has **Unaware** → raw stat.
   * Else if **critical hit and the stage is positive** → raw stat.
   * Else apply §1.1. Then 16-bit truncate.
3. **Sandstorm SpD boost, applied directly (not chained):** if weather is Sandstorm, target is Rock-type, and the stat in use is Sp. Defense: `def = ApplyMod(def, 0x1800)` then 16-bit truncate. "This is done regardless of critical hits and before any other modifier." [BWART]. Smogon calc: `defense = pokeRound((defense * 3) / 2)`.
4. **Chain the defense modifiers** (start 0x1000, bounds 410..131072), in order [BWART]:

| Modifier | Condition |
|---|---|
| 0x1800 | **Marvel Scale**, target has a major status, physical move |
| 0x1800 | **Flower Gift** (Cherrim on target's side incl. itself), sun, special move |
| 0x1800 | **DeepSeaScale**, target is Clamperl, special move |
| 0x2000 | **Metal Powder**, target is untransformed Ditto, physical move |
| 0x1800 | **Eviolite**, target not fully evolved (both Def and SpD) |
| 0x1800 | **Soul Dew**, target Latios/Latias, special move |

5. `def = OF16(ApplyMod(def, chain))`, min 1 [CALC].

Smogon calc [CALC] (`calculateDefenseBWXY`):
```ts
const boosts = defender.boosts[defenseStat];
if (boosts === 0 || (isCritical && boosts > 0) || move.ignoreDefensive) {
  defense = defender.rawStats[defenseStat];
} else if (attacker.hasAbility('Unaware')) {
  defense = defender.rawStats[defenseStat];
} else {
  defense = getModifiedStat(defender.rawStats[defenseStat]!, boosts);
}
// unlike all other defense modifiers, Sandstorm SpD boost gets applied directly
if (field.hasWeather('Sand') && defender.hasType('Rock') && !hitsPhysical) {
  defense = pokeRound((defense * 3) / 2);
}
const dfMods = calculateDfModsBWXY(gen, defender, field, desc, hitsPhysical);
defense = OF16(Math.max(1, pokeRound((defense * chainMods(dfMods, 410, 131072)) / 4096)));
```

### 1.4 Speed (needed for Gyro Ball / Electro Ball / Payback / Analytic / turn order)

`spe = staged(raw)`, then chain (Smogon calc `getFinalSpeed` [UTIL]): Tailwind 0x2000; Chlorophyll/Swift Swim/Sand Rush/Unburden 0x2000, Quick Feet (statused) 0x1800, Slow Start 0x800; Choice Scarf 0x1800, Iron Ball / Macho Brace / Power items 0x800, Quick Powder (Ditto) 0x2000; `spe = pokeRound(spe * chain / 4096)`; then **paralysis: `spe = (spe * 25) ÷ 100`** (Gen 5 is ¼, not ½; `gen.num >= 7 ? 50 : 25` in [UTIL]), unless Quick Feet.

### 1.5 Other pre-calc adjustments in the calc

Power Trick swaps raw Atk/Def; Wonder Room swaps raw Def/SpD; Intimidate −1 Atk on switch-in (blocked by Clear Body/White Smoke/Hyper Cutter); Download +1 SpA if target Def ≥ SpD else +1 Atk (Showdown: `spd <= def` → SpA); Air Lock/Cloud Nine nullify weather; Klutz/Magic Room disable items (Klutz still gets the Iron Ball speed drop only in Gen 4); Infiltrator ignores Reflect/Light Screen; Brick Break removes screens before damage; Mold Breaker/Teravolt/Turboblaze ignore the defender's damage-relevant abilities (Battle Armor, Shell Armor, Dry Skin, Filter, Flash Fire, Flower Gift, Friend Guard, Heatproof, Heavy Metal, Levitate, Light Metal, Lightning Rod, Marvel Scale, Motor Drive, Multiscale, Sap Sipper, Solid Rock, Storm Drain, Sturdy, Telepathy, Thick Fat, Unaware, Volt Absorb, Water Absorb, Wonder Guard, …) [CALC].

---

## 2. Base power

### 2.1 Variable base power (computed first, before any BP modifier) — [BWART] "Triggers for variable base power" unless noted

| Move | Gen 5 base power |
|---|---|
| **Return** | `(Happiness*10) ÷ 25`; if 0 → 1 |
| **Frustration** | `((255−Happiness)*10) ÷ 25`; if 0 → 1 |
| **Flail / Reversal** | `P = (48*CurHP) ÷ MaxHP`; BP = 200 if P≤1; 150 if 2≤P≤4; 100 if 5≤P≤9; 80 if 10≤P≤16; 40 if 17≤P≤32; else 20. (Gen 4 used `64*HP÷MaxHP` with thresholds <2,<6,<13,<22,<43 [PS-G4].) |
| **Eruption / Water Spout** | `(150*CurHP) ÷ MaxHP`; if 0 → 1 |
| **Wring Out / Crush Grip** | `hpFP = (CurHP*4096) ÷ MaxHP` (fixed-point HP fraction); `BP = round-half-down((120 * 100*hpFP) / 4096) ÷ 100`; if 0 → 1. Exact TS [CALC][PS-MV]: `bp = Math.floor(Math.floor((120 * (100 * Math.floor(hp*4096/maxHP)) + 2048 - 1) / 4096) / 100) \|\| 1`. (Gen 4: `floor(120*HP/MaxHP)+1` [PS-G4].) |
| **Gyro Ball** | `min(150, (25 * TargetSpeed ÷ UserSpeed) + 1)` using **modified** speeds (stages, items, paralysis); treat UserSpeed 0 as 1. **Confidence note:** [CALC] and [PS-G5] both add +1; [BWART] prints `min(150, 25 * TargetSpd ÷ UserSpd)` without +1. Recommend +1 (two independent implementations; Bulbapedia's formula also has +1). |
| **Electro Ball** | `S = UserSpeed ÷ TargetSpeed` (modified speeds, target speed min 1); BP = 150 if S≥4; 120 if S=3; 80 if S=2; 60 if S=1; else 40 |
| **Heavy Slam / Heat Crash** | `W = UserWeight ÷ TargetWeight` (weights in 0.1 kg units after Autotomize −100 kg (min 0.1 kg), Heavy Metal ×2, Light Metal ×0.5, Float Stone ×0.5); BP = 120 if W≥5; 100 if W=4; 80 if W=3; 60 if W=2; else 40 |
| **Low Kick / Grass Knot** | target modified weight W kg: ≥200 → 120; ≥100 → 100; ≥50 → 80; ≥25 → 60; ≥10 → 40; else 20 |
| **Punishment** | `60 + 20 * (sum of target's POSITIVE stages, incl. accuracy & evasion)`, **max 200** ([CALC]: `Math.min(200, …)`; [PS-MV] `if (power > 200) power = 200`). **Confidence note:** [BWART] prints `min(120, …)`; treat as a typo in the article — 200 is used by both implementations and Bulbapedia. |
| **Stored Power** | `20 + 20 * (sum of user's positive stages incl. accuracy & evasion)` (no cap needed; max 860) |
| **Hidden Power** | see §2.3 |
| **Beat Up** | one hit per non-fainted, non-statused party member (user included), in party order; hit BP = `(member's BASE Attack stat) ÷ 10 + 5`; Dark type, uses the user's own Atk stat and normal defense, normal STAB/crit per hit [BWART][PS-MV]. (Gen 4: 10 BP typeless using member base Atk vs target base Def [PS-G4].) |
| **Trump Card** | BP by PP remaining *after* using the move: 0 → 200, 1 → 80, 2 → 60, 3 → 50, ≥4 → 40 (40 if called by another move) [BWART][PS-MV] |
| **Present** | 20% heal target ¼ MaxHP (no damage); otherwise `r = rand(80)`: r<40 → 40 BP, r<70 → 80, else 120 (i.e. 40%/30%/10% overall) [BWART][PS-MV] |
| **Magnitude** | `R = rand(100)`: R<5 → Mag 4 (10 BP); <15 → 5 (30); <35 → 6 (50); <65 → 7 (70); <85 → 8 (90); <95 → 9 (110); else 10 (150) |
| **Fling** | held item's Fling power (e.g. Iron Ball 130, Hard Stone/Rare Bone 100, Thick Club/DeepSeaTooth 90, Razor Claw 80, Stick 60, Eviolite 40, most others 30/10; see each item's `fling.basePower` in [PS-MV]); fails with no item / Klutz / Magic Room |
| **Natural Gift** | BP & type from berry, **Gen 5 table** [PS-G5]: 60 — Cheri Fire, Chesto Water, Pecha Electric, Rawst Grass, Aspear Ice, Leppa Fighting, Oran Poison, Persim Ground, Lum Flying, Sitrus Psychic, Figy Bug, Wiki Rock, Mago Ghost, Aguav Dragon, Iapapa Dark, Occa Fire, Passho Water, Wacan Electric, Rindo Grass, Yache Ice, Chople Fighting, Kebia Poison, Shuca Ground, Coba Flying, Payapa Psychic, Tanga Bug, Charti Rock, Kasib Ghost, Haban Dragon, Colbur Dark, Babiri Steel, Chilan Normal, Razz Steel; 70 — Bluk Fire, Nanab Water, Wepear Electric, Pinap Grass, Pomeg Ice, Kelpsy Fighting, Qualot Poison, Hondew Ground, Grepa Flying, Tamato Psychic, Cornn Bug, Magost Rock, Rabuta Ghost, Nomel Dragon, Spelon Dark, Pamtre Steel; 80 — Watmel Fire, Durin Water, Belue Electric, Liechi Grass, Ganlon Ice, Salac Fighting, Petaya Poison, Apicot Ground, Lansat Flying, Starf Psychic, Enigma Bug, Micle Rock, Custap Ghost, Jaboca Dragon, Rowap Dark. (Gen 6 added +20 to each.) |
| **Rollout / Ice Ball** | `30 * 2^(n + dc)`, n = consecutive successful prior hits (0..4), dc = 1 if Defense Curl used earlier while on field |
| **Fury Cutter** | Gen 5 base 20: `20 * 2^n`, n = consecutive prior successful uses, max n=3 → 160 [BWART][PS-G5] |
| **Echoed Voice** | 40, 80, 120, 160, 200 on successive turns it is used on the user's side |
| **Triple Kick** | hit 1 = 10, hit 2 = 20, hit 3 = 30; each hit has its own accuracy check |
| **Spit Up** | `100 * stockpile` (1–3) |
| **Pursuit** | 40; ×2 → 80 if the target is switching out (then cannot miss) |
| **Payback** | 50; 100 if the target has already moved this turn (not doubled vs a target that switched in this turn [PS-MV]) |
| **Avalanche / Revenge** | 60; 120 if the target damaged the user this turn |
| **Assurance** | Gen 5 BP 50; 100 if the target already took damage this turn |
| **Hex** | Gen 5 BP 50; 100 if the target has a major status |
| **Acrobatics** | 55; 110 if the user holds no item (Flying Gem is consumed before, so a Gem user gets 110 *and* the Gem boost [CALC]) |
| **Wake-Up Slap** | 60; 120 if target asleep |
| **SmellingSalt** | 60; 120 if target paralysed |
| **Weather Ball** | 50; 100 in any weather; type becomes Fire/Water/Rock/Ice in sun/rain/sand/hail |
| **Gust / Twister** | 40; 80 if the target is in the semi-invulnerable turn of Fly, Bounce or Sky Drop (this is a BP doubling in Gen 5, not a final modifier) |
| **Round** | 60; 120 if used directly after an ally's Round the same turn |
| **Grass/Fire/Water Pledge** | 50 (Gen 5); 150 when combined with an ally's different Pledge |
| **Judgment** | 100; type = held Plate |
| **Techno Blast** | **85** in Gen 5 [PS-G5]; type = held Drive |
| **Knock Off** | **20**, no boost in Gen 5 [PS-G5] |
| **Struggle** | 50, typeless (no STAB, neutral vs everything, ignores Wonder Guard), user loses ¼ MaxHP |
| **Explosion / Self-Destruct** | 250 / 200; **defender's Defense is NOT halved in Gen 5** (Showdown: `if (this.battle.gen <= 4 && ['explosion','selfdestruct'].includes(move.id) …) defense = floor(defense/2)` [PS-BA]; [BWART] special-case list has no Explosion entry) |

Gen 5 base powers that differ from later gens (calculator must use BW values) [PS-G5]: Air Cutter 55, Assurance 50, Aura Sphere 90, Blizzard 120, Bubble 20, Chatter 60, Crabhammer 90, Draco Meteor 140, Dragon Pulse 90, Energy Ball 80, Fire Blast 120, Flamethrower 95, Frost Breath 40, Fury Cutter 20, Future Sight 100, Heat Wave 100, Hex 50, Hidden Power variable, Hurricane 120, Hydro Pump 120, Ice Beam 95, Incinerate 30, Knock Off 20, Leaf Storm 140, Lick 20, Low Sweep 60, Magma Storm 120, Meteor Mash 100 (85% acc), Muddy Water 95, Overheat 140, Pin Missile 14, Power Gem 70, Rock Tomb 50, Skull Bash 100, Smelling Salts 60, Smog 20, Snore 40, Storm Throw 40, Struggle Bug 30, Surf 95, Synchronoise 70, Techno Blast 85, Thief 40, Thunder 120, Thunderbolt 95, Vine Whip 35, Wake-Up Slap 60; from the gen6 mod (also Gen 5 values): Sucker Punch 80, Tackle 50, Leech Life 20.

### 2.2 Base-power modifier chain — [BWART] "Modifiers for the base power" (order as listed there)

After the variable BP is known, chain these (start 0x1000), then `BP = OF16(max(1, ApplyMod(BP, chain)))` [CALC].

| Modifier | Condition |
|---|---|
| 0x1800 | **Technician**, move BP (after §2.1) ≤ 60 |
| 0x1800 | **Flare Boost**, user burned, special move |
| 0x14CD (5325, ×1.3) | **Analytic**, target already moved this turn (not Future Sight/Doom Desire) |
| 0x1333 (4915, ×1.2) | **Reckless**, move has recoil or is Jump Kick / Hi Jump Kick |
| 0x1333 | **Iron Fist**, punching move |
| 0x1800 | **Toxic Boost**, user poisoned, physical move |
| 0x1400 / 0xC00 / 0x1000 | **Rivalry**: same gender ×1.25, opposite ×0.75, either genderless ×1 |
| 0x14CD | **Sand Force**, sandstorm, Rock/Ground/Steel move |
| 0x800 | **Heatproof** on target, Fire move |
| 0x1400 (×1.25) | **Dry Skin** on target, Fire move |
| 0x14CD | **Sheer Force**, move has a secondary effect (which is then removed) |
| 0x1333 | **Type-boosting items**: Charcoal, Mystic Water, Magnet, Miracle Seed, NeverMeltIce, Black Belt, Poison Barb, Soft Sand, Sharp Beak, TwistedSpoon, SilverPowder, Hard Stone, Spell Tag, Dragon Fang, BlackGlasses, Metal Coat, Silk Scarf; all Plates; Odd Incense, Sea Incense, Wave Incense, Rose Incense, Rock Incense |
| 0x1199 (4505, ×1.1) | **Muscle Band**, physical |
| 0x1333 | **Lustrous Orb** on Palkia, Water/Dragon |
| 0x1199 | **Wise Glasses**, special |
| 0x1333 | **Griseous Orb** on Giratina, Ghost/Dragon |
| 0x1333 | **Adamant Orb** on Dialga, Steel/Dragon |
| **0x1800 (×1.5)** | **Gems** (Gen 5 value; Gen 6 lowered to 0x14CD). Consumed on use. [BWART][PS-G5 `gem: chainModify(1.5)`][CALC `gen.num > 5 ? 5325 : 6144`] |
| 0x2000 | **Facade**, user paralysed/poisoned/burned |
| 0x2000 | **Brine**, target HP ≤ 50% |
| 0x2000 | **Venoshock**, target poisoned |
| 0x2000 | **Retaliate**, a Pokémon on the user's side fainted last turn |
| 0x2000 | **Fusion Bolt / Fusion Flare**, the other Fusion move was used immediately before this turn |
| 0x1800 | move called by **Me First** |
| 0x800 | **SolarBeam** in rain / sandstorm / hail |
| 0x2000 | **Charge** used the previous turn, Electric move |
| 0x1800 | **Helping Hand** received this turn (stacks per Helping Hand in PS) |
| 0x548 (1352, ×0.33) | **Water Sport** active, Fire move |
| 0x548 | **Mud Sport** active, Electric move |

Smogon calc [CALC] (`calculateBPModsBWXY`) — key Gen-5-relevant lines:
```ts
if ((attacker.hasAbility('Technician') && basePower <= 60) ||
    (attacker.hasAbility('Flare Boost') && attacker.hasStatus('brn') && move.category === 'Special') ||
    (attacker.hasAbility('Toxic Boost') && attacker.hasStatus('psn','tox') && move.category === 'Physical')) {
  bpMods.push(6144);
} else if (attacker.hasAbility('Analytic') && (turnOrder !== 'first' || attacker.abilityOn)) {
  bpMods.push(5325);
} else if (attacker.hasAbility('Sand Force') && field.hasWeather('Sand') && move.hasType('Rock','Ground','Steel')) {
  bpMods.push(5325);
} else if ((attacker.hasAbility('Reckless') && (move.recoil || move.hasCrashDamage)) ||
           (attacker.hasAbility('Iron Fist') && move.flags.punch)) {
  bpMods.push(4915);
}
if (field.attackerSide.isCharge && move.hasType('Electric')) bpMods.push(8192);
if (defender.hasAbility('Heatproof') && move.hasType('Fire')) bpMods.push(2048);
else if (defender.hasAbility('Dry Skin') && move.hasType('Fire')) bpMods.push(5120);
if (attacker.hasAbility('Sheer Force') && move.secondaries) bpMods.push(5325);
if (attacker.hasAbility('Rivalry') && ![attacker.gender, defender.gender].includes('N')) {
  bpMods.push(attacker.gender === defender.gender ? 5120 : 3072);
}
if (attacker.item && getItemBoostType(attacker.item) === move.type) bpMods.push(4915);
else if ((Muscle Band && Physical) || (Wise Glasses && Special)) bpMods.push(4505);
else if (Adamant/Lustrous/Griseous Orb on Dialga/Palkia/Giratina-Origin + matching type) bpMods.push(4915);
else if (attacker.hasItem(`${move.type} Gem`)) bpMods.push(gen.num > 5 ? 5325 : 6144);
if ((Facade && brn/par/psn/tox) || (Brine && defender.curHP() <= defender.maxHP()/2) || (Venoshock && psn/tox)) bpMods.push(8192);
else if (gen.num > 5 && Knock Off …) …            // NOT Gen 5
else if (move.named('Solar Beam') && field.hasWeather('Rain','Heavy Rain','Sand','Hail')) bpMods.push(2048);
if (field.attackerSide.isHelpingHand) bpMods.push(6144);
…
basePower = OF16(Math.max(1, pokeRound((basePower * chainMods(bpMods, 41, 2097152)) / 4096)));
```
Note: the Smogon calc's chain order differs slightly from [BWART] (it puts Charge before Heatproof, and items before the move-specific ×2s). Because chaining rounds half-up at every step, order can in rare cases change the chained M by ±1/4096; **use the [BWART] order** (it is the disassembly). Thick Fat is an **attack** modifier, not a BP modifier (§1.2).

### 2.3 Hidden Power (type & power from IVs) — [BWART][PS-DEX]

IV bit order i = 0..5 for HP, Atk, Def, **Spe**, SpA, SpD.

```ts
const HP_TYPES = ['Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel',
                  'Fire','Water','Grass','Electric','Psychic','Ice','Dragon','Dark'];
const order: StatID[] = ['hp','atk','def','spe','spa','spd'];
let t = 0, p = 0;
order.forEach((s, i) => { t += (ivs[s] & 1) << i; p += ((ivs[s] >> 1) & 1) << i; });
const type  = HP_TYPES[Math.floor(t * 15 / 63)];
const power = Math.floor(p * 40 / 63) + 30;      // 30..70 in Gen 5 (Gen 6+: fixed 60)
```
[BWART]: `30 + (40 * sum(((IV[i]>>1)&1)<<i)) ÷ 63`. Hidden Power is Special in Gen 5.

---

## 3. Damage calculation proper (`DamageCalc` [BWART])

### 3.1 Base damage

> `BaseDamage = ((((2 × Level) ÷ 5 + 2) * BasePower * [Sp]Atk) ÷ [Sp]Def) ÷ 50 + 2` [BWART]

```ts
// [UTIL]
export function getBaseDamage(level, basePower, attack, defense) {
  return Math.floor(OF32(Math.floor(OF32(OF32(Math.floor((2 * level) / 5 + 2) * basePower) * attack) / defense) / 50 + 2));
}
```
Showdown [PS-BA]: `baseDamage = tr(tr(tr(tr(2*level/5 + 2) * basePower * attack) / defense) / 50);` then `baseDamage += 2` at the top of `modifyDamage`. Same thing: `floor(floor(floor(2L/5)+2) * BP * Atk / Def) / 50) + 2`. (Note `floor(2L/5 + 2) == floor(2L/5) + 2`.)

### 3.2 Then, in this exact order [BWART] ("General flow"):

```
D = BaseDamage
1. multi-target      D = ApplyMod(D, 0xC00)     if the move has >1 target (doubles/triples spread), else skip
2. weather           D = ApplyMod(D, 0x1800 | 0x800)   if applicable, else skip
3. critical hit      D = D * 2                  (plain shift, no rounding)
4. random            D = (D * (100 - R)) ÷ 100,  R = rand(16) ∈ [0,15]   → ×85%..100%, floor
5. STAB              D = ApplyMod(D, 0x1800)  (Adaptability: 0x2000)  if move type ∈ user's types (never for typeless/Struggle)
6. type effectiveness D = D << 1 (SE), D << 2 (4×), D >> 1 (½), D >> 2 (¼), 0 (immune)
7. burn              D = D ÷ 2   if physical, user burned, user's ability ≠ Guts
8. minimum           if D == 0: D = 1
9. final modifier    D = ApplyMod(D, chain(final mods))
10. store as 16-bit  (STRH)
```

Smogon calc encodes 1–3 in `calculateBaseDamageBWXY` and 4–9 in `getFinalDamage` [CALC][UTIL]:

```ts
// calculateBaseDamageBWXY [CALC]
let baseDamage = getBaseDamage(attacker.level, basePower, attack, defense);
if (isSpread) baseDamage = pokeRound(OF32(baseDamage * 3072) / 4096);
if ((Sun && Fire) || (Rain && Water)) baseDamage = pokeRound(OF32(baseDamage * 6144) / 4096);
else if ((Sun && Water) || (Rain && Fire)) baseDamage = pokeRound(OF32(baseDamage * 2048) / 4096);
if (isCritical) baseDamage = Math.floor(OF32(baseDamage * (gen.num > 5 ? 1.5 : 2)));

// getFinalDamage [UTIL]  (called for i = 0..15)
let damageAmount = Math.floor(OF32(baseAmount * (85 + i)) / 100);
if (stabMod !== 4096) damageAmount = OF32(damageAmount * stabMod) / 4096;
damageAmount = Math.floor(OF32(pokeRound(damageAmount) * effectiveness));
if (isBurned) damageAmount = Math.floor(damageAmount / 2);
return OF16(pokeRound(Math.max(1, OF32(damageAmount * finalMod) / 4096)));
```
and in `calculateBWXY`: `// the random factor is applied between the crit mod and the stab mod`.

Showdown [PS-BA] `modifyDamage` (generic, Gen 5 path): `baseDamage += 2` → spread `modify(0.75)` → `WeatherModifyDamage` (×1.5/×0.5 via chainModify) → `if (isCrit) baseDamage = tr(baseDamage * 2)` (gen<6) → `randomizer` = `tr(tr(baseDamage * (100 - random(16))) / 100)` → STAB `modify(1.5)` (Adaptability 2) → type loop (`*= 2` / `tr(/2)` per stage) → burn `modify(0.5)` if physical & not Guts → `if (gen === 5 && !baseDamage) baseDamage = 1;` ("Generation 5, but nothing later, sets damage to 1 before the final damage modifiers") → `ModifyDamage` event (final chain) → `return tr(baseDamage, 16)`.

### 3.3 Multi-target modifier (step 1)

0xC00 (×0.75) "if the move has more than one target and 0x1000 otherwise. Being a target is independent of all accuracy and effectiveness checks, but a fainted Pokémon on the field will not count as a target." [BWART]. Applies to `allAdjacent` / `allAdjacentFoes` moves in doubles/triples when ≥2 targets are alive (Earthquake, Surf, Discharge, Rock Slide, Heat Wave, Blizzard, Eruption, …). Singles: never.

### 3.4 Weather modifier (step 2)

Sun + Fire move or Rain + Water move → 0x1800; Sun + Water move or Rain + Fire move → 0x800; otherwise no modifier. Sandstorm/Hail never modify damage here (Sandstorm affects Rock SpD in §1.3). Air Lock / Cloud Nine on either active Pokémon cancels weather. [BWART]

### 3.5 Critical hit (step 3)

`D = D << 1` — **×2 in Gen 5** (`CMP R6,#0 ; BEQ ; LSLS R7,R7,#1` [BWART]; [CALC] `gen.num > 5 ? 1.5 : 2`; [PS-BA] `gen >= 6 ? 1.5 : 2`). Sniper is **not** here; it is a 0x1800 final modifier (§3.11), giving ~×3 total. Crit also: ignores negative attack stages / positive defense stages (§1), ignores Reflect/Light Screen (§3.11).

### 3.6 Random factor (step 4)

`R = rand(16)` (0..15); `D = (D * (100 − R)) ÷ 100` [BWART] — i.e. multiply by 85..100 then floor-divide by 100. A calculator produces 16 rolls (`85 + i`, i = 0..15) [UTIL]. Applied **before STAB** (same position as Gen 4).

### 3.7 STAB (step 5)

0x1800 if move type matches one of the user's current types; **Adaptability** sets it to 0x2000. Applied with ApplyMod (round-half-down). Not applied when the move's type is the "???" type (asm skips when `move type == 0x11`; Struggle) [BWART]. [UTIL] `getStabMod`: `4096 (+2048 if hasOriginalType(move.type)) (+2048 if Adaptability && hasType(move.type))`.

### 3.8 Type effectiveness (step 6)

> "Type effectiveness doesn't use a modifier but a simple left (respectively right) shift of one for a simple and two for a double weakness (respectively resistance), in other words an unrounded division or multiplication by 2 or 4." [BWART]

Effectiveness index over both defender types: 0 → damage 0 (immune; move fails earlier), 1 → `D >> 2`, 2 → `D >> 1`, 3 → unchanged, 4 → `D << 1`, 5 → `D << 2`. Equivalent: `D = floor(D * eff)` with eff ∈ {¼, ½, 1, 2, 4} — [UTIL] `Math.floor(pokeRound(damageAmount) * effectiveness)`. Showdown implements it as a loop of `*2` / `tr(/2)` per stage, identical because all values are integers.

### 3.9 Burn (step 7)

If the move is **physical** (category 1), the user's status is **burn**, and the user's ability is **not Guts**: `D = (D * 50) ÷ 100` = `floor(D/2)` [BWART asm: `MOVS R0,#0x32; MULS; divide by 0x64`]. Applies to Facade too in Gen 5 (the Facade exemption is Gen 6+: [CALC] `!(move.named('Facade') && gen.num === 6)`, [PS-BA] `gen < 6 || move.id !== 'facade'`). Burn no longer touches the Attack stat (Gen 3–4 halved Attack).

### 3.10 Minimum 1 (step 8)

`if (D == 0) D = 1` — **before** the final modifier [BWART][PS-BA]. There is no min-1 clamp *after* the final modifier in the game code (Showdown: "Generation 5, but nothing later, sets damage to 1 before the final damage modifiers"; then `return tr(baseDamage, 16)`), so D = 1 with a halving final modifier becomes `ApplyMod(1, 0x800)` = round-half-down(0.5) = **0** in the game/Showdown. The Smogon calc clamps `Math.max(1, D * finalMod / 4096)` *before* rounding and therefore reports 1 [UTIL]. See Confidence §9.

### 3.11 Final modifier chain (step 9) — chain in **this** order [BWART] ("Be sure to chain the modifiers in the order they are listed in"), start 0x1000, bounds 41..131072, then `D = ApplyMod(D, chain)`, then OF16.

| Modifier | Condition |
|---|---|
| **0x800 singles / 0xA8F (2703) doubles** | **Reflect** on target's side, physical move, user not Infiltrator, not a critical hit. "0xA8F if there is more than one Pokémon per side of the field" (i.e. doubles/triples format, regardless of live count — [PS-G5] uses `this.activePerHalf > 1`). Gen 6 changed doubles value to 0xAAC (2732) [CALC `gen.num > 5 ? 2732 : 2703`]. |
| same | **Light Screen**, special move, same conditions |
| 0x800 | **Multiscale** on target at full HP |
| 0x2000 | **Tinted Lens** on user, move not very effective |
| 0xC00 | **Friend Guard** on an ally of the target |
| 0x1800 | **Sniper** on user, critical hit |
| 0xC00 | **Solid Rock / Filter** on target, move super effective |
| 0x1000 + n·0x333 (n ≤ 4), 0x2000 (n ≥ 5) | **Metronome** item: n = number of consecutive successful prior uses of the same move → 1.0, 1.2, 1.4, 1.6, 1.8, 2.0 (4096, 4915, 5734, 6553, 7372, 8192 [PS-MV]) |
| 0x1333 | **Expert Belt**, move super effective |
| 0x14CC (5324, ×1.2998) | **Life Orb** (user then loses 1/10 MaxHP) |
| 0x800 | **Type-resist Berry** on target for the move's type when super effective (Occa Fire, Passho Water, Wacan Electric, Rindo Grass, Yache Ice, Chople Fighting, Kebia Poison, Shuca Ground, Coba Flying, Payapa Psychic, Tanga Bug, Charti Rock, Kasib Ghost, Haban Dragon, Colbur Dark, Babiri Steel); **Chilan** for any Normal move regardless of effectiveness; berry consumed (Unnerve prevents) |
| 0x2000 | **Stomp** vs a target that used Minimize |
| 0x2000 | **Earthquake** (and Magnitude [PS-MV]) vs target in Dig's semi-invulnerable turn |
| 0x2000 | **Surf** (and Whirlpool [PS-MV]) vs target in Dive's semi-invulnerable turn |
| 0x2000 | **Steamroller** vs a target that used Minimize |

Smogon calc [CALC] (`calculateFinalModsBWXY`, Gen 5 values):
```ts
if (field.defenderSide.isReflect && move.category === 'Physical' && !isCritical)
  finalMods.push(field.gameType !== 'Singles' ? (gen.num > 5 ? 2732 : 2703) : 2048);
else if (field.defenderSide.isLightScreen && move.category === 'Special' && !isCritical)
  finalMods.push(field.gameType !== 'Singles' ? (gen.num > 5 ? 2732 : 2703) : 2048);
if (defender.hasAbility('Multiscale') && defender.curHP() === defender.maxHP() && hitCount === 0 && …) finalMods.push(2048);
if (attacker.hasAbility('Tinted Lens') && typeEffectiveness < 1) finalMods.push(8192);
if (field.defenderSide.isFriendGuard) finalMods.push(3072);
if (attacker.hasAbility('Sniper') && isCritical) finalMods.push(6144);
if (defender.hasAbility('Solid Rock', 'Filter') && typeEffectiveness > 1) finalMods.push(3072);
if (attacker.hasItem('Metronome') && move.timesUsedWithMetronome! >= 1) {
  const n = Math.floor(move.timesUsedWithMetronome!);
  finalMods.push(n <= 4 ? 4096 + n * 819 : 8192);
}
if (attacker.hasItem('Expert Belt') && typeEffectiveness > 1 && !move.isZ) finalMods.push(4915);
else if (attacker.hasItem('Life Orb')) finalMods.push(5324);
if (move.hasType(getBerryResistType(defender.item)) && (typeEffectiveness > 1 || move.hasType('Normal')) && hitCount === 0 && !attacker.hasAbility('Unnerve')) finalMods.push(2048);
…
const finalMod = chainMods(finalMods, 41, 131072);
```
(The Smogon calc omits the Minimize/Dig/Dive ×2 entries; Showdown has them as `onSourceModifyDamage … chainModify(2)` in the `minimize`, `dig`, `dive` conditions [PS-MV]. Gust/Twister vs Fly is a BP doubling in Gen 5 per [BWART]; Showdown applies it as a damage modifier for Fly and a BP modifier for Bounce — numerically the same ×2 except for rounding position.)

### 3.12 Complete reference implementation (Gen 5)

```ts
const OF16 = (n: number) => n > 65535 ? n % 65536 : n;
const OF32 = (n: number) => n > 4294967295 ? n % 4294967296 : n;
const applyMod = (d: number, m: number) => { const p = OF32(d * m); const q = Math.floor(p / 4096); return (p % 4096) > 2048 ? q + 1 : q; };
const chain = (mods: number[], lo: number, hi: number) => { let M = 4096; for (const m of mods) if (m !== 4096) M = (M * m + 2048) >> 12; return Math.max(lo, Math.min(hi, M)); };
const STAGES = [[2,8],[2,7],[2,6],[2,5],[2,4],[2,3],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2]];
const staged = (raw: number, stage: number) => { const [n, d] = STAGES[stage + 6]; return Math.floor(OF16(raw * n) / d); };

function gen5Damage(p: {
  level: number; bp: number; atk: number; def: number;           // bp after §2, atk/def after §1
  spread: boolean; weather: 0 | 6144 | 2048; crit: boolean; roll: number /*0..15 → 85..100*/;
  stab: 4096 | 6144 | 8192; eff: 0 | 0.25 | 0.5 | 1 | 2 | 4; burnHalve: boolean; finalMods: number[];
}): number {
  let D = Math.floor(OF32(Math.floor(OF32(OF32((Math.floor(2 * p.level / 5) + 2) * p.bp) * p.atk) / p.def) / 50) + 2);
  if (p.spread) D = applyMod(D, 3072);
  if (p.weather) D = applyMod(D, p.weather);
  if (p.crit) D = D * 2;
  D = Math.floor(OF32(D * (85 + p.roll)) / 100);
  if (p.stab !== 4096) D = applyMod(D, p.stab);
  D = Math.floor(D * p.eff);                               // shifts
  if (p.burnHalve) D = Math.floor(D / 2);
  if (D === 0) D = 1;
  D = OF16(applyMod(D, chain(p.finalMods, 41, 131072)));
  return D;                                                // may be 0 only if D was 1 and final chain < 0x800 — see §9
}
```

---

## 4. Critical hits in Gen 5

### 4.1 Rate by stage (Gen 2–5 table) — [PS-BA]

```ts
if (this.battle.gen <= 5) {
  critRatio = this.battle.clampIntRange(critRatio, 0, 5);
  critMult = [0, 16, 8, 4, 3, 2];
}
```
Stage 0 → 1/16 (6.25%), 1 → 1/8, 2 → 1/4, 3 → 1/3, 4+ → 1/2. (In Showdown a normal move has `critRatio` 1 and high-crit moves `critRatio: 2`, so the effective table for stage s = critRatio−1 is [16, 8, 4, 3, 2].) Gen 6 changed to [16, 8, 2, 1]. [PS-BA]

### 4.2 Stage modifiers — [BWART] "Critical hits" triggers + [PS-MV]

| Source | Effect |
|---|---|
| High-crit-ratio move (`critRatio: 2`): Aeroblast, Air Cutter, Attack Order, Blaze Kick, Crabhammer, Cross Chop, Cross Poison, Drill Run, Karate Chop, Leaf Blade, Night Slash, Poison Tail, Psycho Cut, Razor Leaf, Razor Wind, Shadow Claw, Sky Attack, Slash, Spacial Rend, Stone Edge | +1 |
| **Focus Energy** | +2 |
| **Scope Lens**, **Razor Claw** | +1 each |
| **Super Luck** | +1 |
| **Lucky Punch** (Chansey) | +2 |
| **Stick** (Farfetch'd) | +2 |
| **Frost Breath**, **Storm Throw** | always critical (`willCrit: true`) |
| **Battle Armor / Shell Armor** on target, **Lucky Chant** on target's side | no critical hits (bypass the check) |

Stages add; cap at stage 4 (1/2). Mold Breaker ignores Battle/Shell Armor [CALC list].

### 4.3 Crit effects

×2 damage (§3.5); ignore user's negative Atk/SpA stage and target's positive Def/SpD stage (§1.2/1.3); ignore Reflect / Light Screen (§3.11); Sniper adds 0x1800 in the final chain. Stat *modifiers* (items/abilities) are still applied on crits. Sandstorm SpD boost still applies on crits [BWART].

---

## 5. Special and variable-damage moves (beyond the BP table in §2.1)

Fixed-damage moves bypass §3 entirely ("Special cases" [BWART]); they still obey type immunity (Seismic Toss vs Ghost, Night Shade vs Normal, Sonic Boom vs Ghost, Counter vs Ghost fail) and are blocked by Wonder Guard unless super effective (Wonder Guard: `target.runEffectiveness(move) <= 0 → immune` [PS-MV]; fixed-damage moves' types are never super effective vs Shedinja so they fail; **Struggle** bypasses Wonder Guard). They ignore STAB, crits, type multipliers, weather, burn and all modifiers.

| Move | Damage |
|---|---|
| **Seismic Toss / Night Shade** | user's level |
| **Sonic Boom** | 20 |
| **Dragon Rage** | 40 |
| **Psywave** | `max(1, ((rand(101) + 50) * Level) ÷ 100)` → 50%..150% of level, floor [BWART]; PS: `random(50,151) * level / 100` |
| **Super Fang** | `max(1, TargetCurHP ÷ 2)` |
| **Endeavor** | `TargetCurHP − UserCurHP`; fails if user HP ≥ target HP; Ghost-immune (Normal) |
| **Final Gambit** | user's current HP; user faints |
| **Counter** | 2 × the last physical damage dealt to the user this turn by a foe; priority −5; Ghost-immune |
| **Mirror Coat** | 2 × last special damage from a foe this turn; priority −5; Dark-immune |
| **Metal Burst** | 1.5 × the last damage received this turn (floor), targets that attacker |
| **Bide** | 2 × total damage taken over the 2 charging turns; typeless in effect (`ignoreImmunity: true` in PS) |
| **OHKO moves** (Fissure, Guillotine, Horn Drill, Sheer Cold) | damage = target's max HP (KO); accuracy = `30 + (UserLevel − TargetLevel)`; fails if user level < target level; ignores accuracy/evasion stages; blocked by Sturdy; **Sheer Cold hits Ice types in Gen 5** (Ice immunity is Gen 7+) [PS-BA] |
| **Pain Split** | sets both HPs to `(userHP + targetHP) ÷ 2` |
| **Confusion self-hit** | 40 BP typeless physical, user's own Atk vs own Def **with stages**, no STAB/crit/items/abilities, random factor applies, 16-bit context [PS-BA `getConfusionDamage`] |

Conditional moves already in §2.1: Flail/Reversal, Eruption/Water Spout, Wring Out/Crush Grip, Gyro Ball, Electro Ball, Heavy Slam/Heat Crash, Low Kick/Grass Knot, Punishment, Stored Power, Return/Frustration, Present, Magnitude, Beat Up, Trump Card, Fling, Natural Gift, Hidden Power, Rollout/Ice Ball, Fury Cutter, Echoed Voice, Triple Kick, Acrobatics, Assurance, Avalanche/Revenge, Payback, Brine, Facade, Hex, Venoshock, Retaliate, Round, Weather Ball, Judgment, Techno Blast, Pursuit, Knock Off, Struggle, Explosion/Self-Destruct, Gust/Twister vs Fly/Bounce/Sky Drop, Earthquake vs Dig, Surf vs Dive, Stomp/Steamroller vs Minimize.

Other rules:
* **Dream Eater**: fails unless target is asleep; drains ½ of damage dealt.
* **SolarBeam**: BP ×0.5 in rain/sand/hail (0x800 BP mod); no charge turn in sun.
* **Fake Out**: 40 BP, +3 priority, only on the user's first turn out. **Sucker Punch**: 80 BP (Gen 5), +1 priority, fails if target isn't about to use a damaging move.
* **Multi-hit (2–5)**: Gen 5 distribution **2: 35%, 3: 35%, 4: 15%, 5: 15%** (`sample([2×7, 3×7, 4×3, 5×3])` for gen ≥ 5; Gen 4 was 3/8,3/8,1/8,1/8) [PS-BA]. **Skill Link** → always 5 (`move.multihit = move.multihit[1]`) [PS-MV]. Each hit is a separate damage calc (own random roll and crit roll; stat changes between hits apply). Moves: Bullet Seed, Pin Missile (14 BP), Fury Attack, Fury Swipes, Icicle Spear, Rock Blast, Spike Cannon, Comet Punch, Double Slap, Barrage, Arm Thrust, Bone Rush, Tail Slap.
* **2-hit**: Double Kick 30, Bonemerang 50, Double Hit 35, Dual Chop 40, Gear Grind 50, Twineedle 25. **Triple Kick**: 3 hits 10/20/30 with an accuracy check per hit (Gen 5; `multiaccuracy: true`).
* **Beat Up**: one hit per eligible party member (§2.1).
* **Sacred Sword / Chip Away**: ignore target's Def stage and evasion (§1.3).
* **Foul Play**: uses target's Atk and Atk stage (§1.2). **Psyshock/Psystrike/Secret Sword**: special, hit Def (§1.3).
* **Sky Drop**: fails on Flying types (Gen 5 has no 200 kg limit — that's Gen 6+; [CALC] lumps them). **Synchronoise**: fails unless target shares a type with the user.
* **Substitute**: damage computed normally against the sub's HP.
* **Life Orb** recoil 1/10 MaxHP after a damaging hit; **Rocky Helmet** 1/6 to contact attackers; **Iron Barbs** 1/8.

### 5.1 Accuracy check (for the KO odds; `accuracy.ts` `hitGen5`)
No BW disassembly of the hit test was available; this follows Showdown's `hitStepAccuracy` [PS-BA] with
the Gen 5 data handlers [PS-MV; PS-G5]:
1. Semi-invulnerable targets are unhittable except by Gust / Twister / Thunder / Hurricane / Sky Uppercut /
   Smack Down (Fly, Bounce), Earthquake / Magnitude (Dig), Surf / Whirlpool (Dive); **No Guard** bypasses
   this and the whole check (`noguard.onAnyInvulnerability`, `onAnyAccuracy`).
2. `accuracy = true` (never misses) for Swift, Aerial Ace, Aura Sphere, Magnet Bomb, Shadow Punch, Magical
   Leaf, Shock Wave, Feint Attack, Vital Throw, Struggle, Bide, Trump Card, Clear Smog; Thunder / Hurricane in
   rain and Blizzard in hail (`effectiveWeather()` — suppressed by Cloud Nine / Air Lock); Thunder /
   Hurricane in sun → 50.
3. `ModifyAccuracy` handlers, chained at 4096 scale (round half up per step) and applied with round half
   down (`Battle.modify`): Gravity 0x1AB8 (×5/3), Compound Eyes 0x14CD (×1.3), Hustle 0xCCD (×0.8,
   physical), Victory Star 0x119A (×1.1), Sand Veil / Snow Cloak 0xCCD in their weather, Tangled Feet ×0.5
   while confused, Bright Powder / Lax Incense 0xE66 (×0.9), Wide Lens 0x1199 (×1.1), Zoom Lens 0x1333
   (×1.2, target already moved), Micle Berry ×1.2.
4. Stages: `boost = clamp(accStage, ±6)` (0 if the target has Unaware), then `boost = clamp(boost −
   evaStage, ±6)` (evasion 0 if the attacker has Unaware; Foresight / Miracle Eye zero a positive evasion);
   `acc = trunc(acc × (3 + boost) / 3)` or `trunc(acc × 3 / (3 − boost))` — the Gen 5 fractions
   3/9 … 9/3 replace Gen 4's percent table.
5. Hit iff `random(100) < acc` → `min(acc, 100) %`.
6. OHKO: `30 + (Lu − Lt)`, fails if Lu < Lt, no modifiers; Sturdy (ignorable by Mold Breaker / Teravolt /
   Turboblaze) blocks.

The order *modifiers, then stages* is Showdown's; the Gen 4 code does stages first. The two differ by at
most one point of accuracy — see §9.

---

## 6. Type chart and immunities (Gen 5)

Gen 5 uses the **Gen 2–5 chart**: no Fairy; **Steel resists Ghost and Dark** (both removed in Gen 6). Attacking type → defending type (from [PS-MV] `typechart.ts` + [PS-G5] `typechart.ts` overrides: Electric/Ghost/Grass/Steel rows and Fairy marked 'Future'):

| Atk\Def | Nor | Fir | Wat | Ele | Gra | Ice | Fig | Poi | Gro | Fly | Psy | Bug | Roc | Gho | Dra | Dar | Ste |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Normal | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | ½ | 0 | 1 | 1 | ½ |
| Fire | 1 | ½ | ½ | 1 | 2 | 2 | 1 | 1 | 1 | 1 | 1 | 2 | ½ | 1 | ½ | 1 | 2 |
| Water | 1 | 2 | ½ | 1 | ½ | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 2 | 1 | ½ | 1 | 1 |
| Electric | 1 | 1 | 2 | ½ | ½ | 1 | 1 | 1 | 0 | 2 | 1 | 1 | 1 | 1 | ½ | 1 | 1 |
| Grass | 1 | ½ | 2 | 1 | ½ | 1 | 1 | ½ | 2 | ½ | 1 | ½ | 2 | 1 | ½ | 1 | ½ |
| Ice | 1 | ½ | ½ | 1 | 2 | ½ | 1 | 1 | 2 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | ½ |
| Fighting | 2 | 1 | 1 | 1 | 1 | 2 | 1 | ½ | 1 | ½ | ½ | ½ | 2 | 0 | 1 | 2 | 2 |
| Poison | 1 | 1 | 1 | 1 | 2 | 1 | 1 | ½ | ½ | 1 | 1 | 1 | ½ | ½ | 1 | 1 | 0 |
| Ground | 1 | 2 | 1 | 2 | ½ | 1 | 1 | 2 | 1 | 0 | 1 | ½ | 2 | 1 | 1 | 1 | 2 |
| Flying | 1 | 1 | 1 | ½ | 2 | 1 | 2 | 1 | 1 | 1 | 1 | 2 | ½ | 1 | 1 | 1 | ½ |
| Psychic | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 1 | 1 | ½ | 1 | 1 | 1 | 1 | 0 | ½ |
| Bug | 1 | ½ | 1 | 1 | 2 | 1 | ½ | ½ | 1 | ½ | 2 | 1 | 1 | ½ | 1 | 2 | ½ |
| Rock | 1 | 2 | 1 | 1 | 1 | 2 | ½ | 1 | ½ | 2 | 1 | 2 | 1 | 1 | 1 | 1 | ½ |
| Ghost | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 2 | 1 | ½ | ½ |
| Dragon | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 | ½ |
| Dark | 1 | 1 | 1 | 1 | 1 | 1 | ½ | 1 | 1 | 1 | 2 | 1 | 1 | 2 | 1 | ½ | ½ |
| Steel | 1 | ½ | ½ | ½ | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | ½ |

Dual types multiply (product of the two entries → index 0..5 of §3.8).

**Type-immunity overrides** [CALC][PS-PK][PS-MV]:
* **Scrappy** (user) / **Foresight**, **Odor Sleuth** (on target): Normal and Fighting hit Ghost at ×1. **Miracle Eye**: Psychic hits Dark at ×1.
* **Ground vs Flying / Levitate / Air Balloon / Magnet Rise / Telekinesis**: immune, **except** when grounded by **Gravity**, **Ingrain**, **Iron Ball** (held), **Smack Down**, or (for Flying types) **Roost** this turn. `isGrounded` [PS-PK]: gravity → true; ingrain → true; smackdown → true; item ironball → true; Flying type → false; Levitate → false (null); magnetrise/telekinesis → false; airballoon → false; else true. When grounded by Gravity/Iron Ball/Ring Target, Ground vs a Flying **type** is ×1: [CALC] `if (isGravity && type === 'Flying' && move.hasType('Ground')) return 1;` and `typeEffectiveness === 0 && Ground && defender.hasItem('Iron Ball') → 1`.
* **Ring Target** (held by target): removes type-based immunities (immune entries become ×1) [CALC].
* **Air Balloon**: immune to Ground (unless Gravity / Smack Down / Ingrain / Iron Ball); pops on any hit.
* **Mold Breaker / Teravolt / Turboblaze**: ignore Levitate, Wonder Guard, absorb abilities etc. (§1.5).

**Ability immunities/absorptions (Gen 5)** [CALC][PS-MV]:

| Ability | Effect |
|---|---|
| Levitate | immune to Ground (see grounding above) |
| Wonder Guard | only super-effective damaging moves hit (Struggle and indirect damage still hit) |
| Volt Absorb | Electric → immune, heal ¼ |
| Water Absorb | Water → immune, heal ¼ |
| Dry Skin | Water → immune, heal ¼; Fire ×1.25 BP |
| Motor Drive | Electric → immune, +1 Spe |
| **Lightning Rod** | Electric → immune, +1 SpA; redirects single-target Electric moves in doubles (**new in Gen 5**: Gen 4 only redirected) |
| **Storm Drain** | Water → immune, +1 SpA; redirects (**new in Gen 5**) |
| Sap Sipper | Grass → immune, +1 Atk (new in Gen 5) |
| Flash Fire | Fire → immune, then Fire moves ×1.5 Atk/SpA (§1.2) |
| Soundproof | sound moves → immune |
| Telepathy | immune to allies' damaging moves (doubles/triples) |
| Sturdy | survives OHKO moves; survives from full HP with 1 HP (Gen 5+) |
| Overcoat | immune to sand/hail chip only (powder immunity is Gen 6) [PS-G5] |
| Damp | blocks Explosion/Self-Destruct |

Bulletproof, Fur Coat, Aroma Veil etc. are Gen 6 — ignore.

---

## 7. Gen 4 → Gen 5 changes (what a Gen 4 calculator must change)

1. **Modifier arithmetic**: Gen 5 uses 4096-based fixed-point modifiers, chained with round-half-up and applied with round-half-down [BWART]. Gen 4 (X-Act) used sequential real-number multiplies with floors ("Mod1/Mod2/Mod3" stages) [PS-G4 `modifyDamage`].
2. **Order of operations** (Gen 4 per [PS-G4]: burn ×0.5 → screens/spread/weather ("ModifyDamagePhase1") → `+2` → crit ×2 (Sniper ×3) → Life Orb/Metronome/Charge etc. ("ModifyDamagePhase2", floored) → random → STAB → type → final (Solid Rock/Filter, Expert Belt, Tinted Lens, berries) → min 1). Gen 5: `+2` first, then spread → weather → crit → random → STAB → type → **burn** → min 1 → **single final chain** (screens, Multiscale, Tinted Lens, Friend Guard, Sniper, Solid Rock/Filter, Metronome, Expert Belt, Life Orb, berries, Minimize/Dig/Dive) [BWART].
3. **Burn** moved from the very start (Gen 4 halves before +2) to after type effectiveness (Gen 5) [PS-G4][BWART].
4. **Screens**: Gen 4 applied before +2; Gen 5 in the final chain, doubles value **0xA8F (2703/4096 ≈ 0.66)** rather than exactly ⅔ [BWART].
5. **Sniper**: Gen 4 crit ×3 outright; Gen 5 crit ×2 then 0x1800 final modifier [BWART][PS-G4].
6. **Life Orb / Metronome item**: Gen 4 applied before the random factor; Gen 5 in the final chain after type. Metronome: Gen 4 +10%/use to max ×2; Gen 5 +20%/use (0x333) to ×2 at 5 uses [BWART].
7. **Explosion / Self-Destruct**: Gen 4 halves the target's Defense; **Gen 5 does not** [PS-BA].
8. **Flail / Reversal**: Gen 4 `64*HP÷MaxHP` (<2/<6/<13/<22/<43); Gen 5 `48*HP÷MaxHP` (≤1/≤4/≤9/≤16/≤32) [PS-G4][BWART].
9. **Wring Out / Crush Grip**: Gen 4 `floor(120*HP/MaxHP)+1`; Gen 5 fixed-point rounded formula [PS-G4][BWART].
10. **Beat Up**: Gen 4 10 BP typeless, member base Atk vs target base Def; Gen 5 `baseAtk÷10+5` Dark-type using normal stats [PS-G4][BWART].
11. **Multi-hit distribution**: 3/8,3/8,1/8,1/8 → 35/35/15/15 [PS-BA].
12. **Lightning Rod / Storm Drain** gained immunity + SpA boost [PS-MV]. New Gen 5 abilities affecting damage: Sheer Force, Analytic, Sand Force, Multiscale, Friend Guard, Flare Boost, Toxic Boost, Defeatist, Sap Sipper, Telepathy, Heavy/Light Metal, Iron Barbs, Moxie, Contrary, Teravolt/Turboblaze, Wonder Skin, Overcoat, Prankster, Infiltrator.
13. New Gen 5 items: **Gems (×1.5 BP)**, Eviolite (×1.5 Def/SpD NFE), Air Balloon, Ring Target, Binding Band, Float Stone, Rocky Helmet, Absorb Bulb/Cell Battery, Red Card, Eject Button.
14. New Gen 5 moves with formulas: Electro Ball, Heavy Slam, Heat Crash, Stored Power, Acrobatics, Hex, Venoshock, Retaliate, Round, Echoed Voice, Final Gambit, Foul Play, Psyshock/Psystrike/Secret Sword (hit Def), Chip Away/Sacred Sword (ignore stages), Smack Down, Sky Drop, Fusion Bolt/Flare, Pledges, Techno Blast, Frost Breath/Storm Throw (always crit), Steamroller, Incinerate, Struggle Bug, Synchronoise, Telekinesis, Magic Room, Wonder Room.
15. **Fury Cutter** base 10 → 20 (cap 160). **Knock Off** stays 20 (×1.5 is Gen 6). **Hidden Power** still 30–70 (fixed 60 is Gen 6). **Crit** still ×2 (1.5 is Gen 6). **Crit stages** still 1/16,1/8,1/4,1/3,1/2 (Gen 6 changed). **Paralysis** still ¼ speed (½ is Gen 7). Steel still resists Ghost/Dark (Gen 6 removed). Gems 1.5 (Gen 6: 1.3). Reflect doubles 0xA8F (Gen 6: 0xAAC).
16. **Minimum damage**: Gen 4 and Gen 6+ clamp to 1 after the final modifiers; Gen 5 clamps to 1 *before* the final chain only [PS-BA].
17. Sky Drop has no weight limit in Gen 5 (200 kg limit is Gen 6+). Minimize ×2 for Stomp/Steamroller in Gen 5 does **not** also make them always hit (that is Gen 6) [PS-G5 `minimize.onAccuracy: undefined`].

---

## 8. Checklist for a Gen 5 calculator

1. Implement `applyMod` (round-half-down, §0.2 [BWART ApplyMod; UTIL pokeRound]) and `chain` (round-half-up per step, §0.3 [BWART ChainMod; UTIL chainMods]). Never round modifiers individually against the value.
2. Stage multipliers: `(raw*num)÷den` from the 2/8…8/2 table, floor [BWART; UTIL getModifiedStat].
3. Attack: choose stat (Foul Play → target's Atk and stage) → stage (skip if target Unaware, or crit with negative stage) → OF16 → Hustle ×1.5 applied directly → chain attack mods in [BWART] order (Thick Fat 0x800; Guts/Torrent/Overgrow/Blaze/Swarm/Plus/Minus/Solar Power/Flash Fire/Flower Gift 0x1800; Defeatist/Slow Start 0x800; Huge/Pure Power 0x2000; Thick Club/DeepSeaTooth/Light Ball 0x2000; Soul Dew/Choice Band/Specs 0x1800) → applyMod → OF16, min 1 [BWART; CALC calculateAttackBWXY].
4. Defense: choose stat (Psyshock/Psystrike/Secret Sword → Def; Wonder Room swaps) → stage (skip if attacker Unaware, Chip Away/Sacred Sword, or crit with positive stage) → OF16 → Sandstorm Rock SpD ×1.5 applied directly → chain (Marvel Scale, Flower Gift, DeepSeaScale, Eviolite, Soul Dew 0x1800; Metal Powder 0x2000) → applyMod → OF16, min 1 [BWART; CALC calculateDefenseBWXY].
5. Base power: variable-BP formulas of §2.1 first (Flail 48-scale, Eruption, Wring Out fixed-point, Gyro Ball +1, Electro Ball, Heavy Slam, Low Kick, Punishment cap 200, Stored Power, Return, Beat Up, Trump Card, Hidden Power 30–70, Rollout, Fury Cutter 20×2^n, Echoed Voice, Triple Kick, Acrobatics, Hex 50, Assurance 50, Techno Blast 85, Knock Off 20, …) → then chain BP mods in [BWART] order (Technician ≤60 0x1800 … Gems **0x1800** … Facade/Brine/Venoshock/Retaliate/Fusion/Charge 0x2000, Me First/Helping Hand 0x1800, SolarBeam 0x800, Sports 0x548) → applyMod → OF16, min 1 [BWART; CALC calculateBasePowerBWXY].
6. Base damage: `floor(floor(floor(2L/5)+2)*BP*Atk/Def)/50)+2` with OF32 on intermediates [BWART; UTIL getBaseDamage].
7. Spread: applyMod 0xC00 when the move targets ≥2 live Pokémon [BWART].
8. Weather: applyMod 0x1800 (Sun+Fire, Rain+Water) or 0x800 (Sun+Water, Rain+Fire); cancelled by Air Lock/Cloud Nine [BWART].
9. Crit: ×2 exactly; rate table 1/16,1/8,1/4,1/3,1/2 with stage sources of §4.2; blocked by Battle Armor/Shell Armor/Lucky Chant; Frost Breath/Storm Throw always crit [BWART; PS-BA].
10. Random: 16 rolls `floor(D*(85+i)/100)`, i=0..15, **before STAB** [BWART; UTIL getFinalDamage].
11. STAB: applyMod 0x1800 / 0x2000 (Adaptability); none for typeless (Struggle) [BWART; UTIL getStabMod].
12. Type: `floor(D*eff)`, eff ∈ {0,¼,½,1,2,4} from the Gen 5 chart (§6) with Scrappy/Foresight/Miracle Eye/grounding/Ring Target overrides; immune → move fails (0) [BWART; CALC].
13. Burn: `floor(D/2)` if physical, user burned, not Guts — Facade included [BWART; CALC; PS-BA].
14. `if (D==0) D=1` [BWART; PS-BA].
15. Final chain in [BWART] order: Reflect/Light Screen (0x800 singles, 0xA8F doubles; not on crit; not vs Infiltrator) → Multiscale 0x800 → Tinted Lens 0x2000 → Friend Guard 0xC00 → Sniper 0x1800 → Solid Rock/Filter 0xC00 → Metronome → Expert Belt 0x1333 → Life Orb 0x14CC → resist berry 0x800 → Stomp/Steamroller vs Minimize 0x2000 → Earthquake vs Dig 0x2000 → Surf vs Dive 0x2000; `D = OF16(applyMod(D, chain))` [BWART; CALC calculateFinalModsBWXY].
16. Fixed-damage moves (§5) bypass steps 6–15 but respect type immunity and Wonder Guard [BWART special cases; PS-MV].
17. Multi-hit: 35/35/15/15, Skill Link = 5, per-hit independent calcs; Triple Kick per-hit accuracy [PS-BA; PS-MV].
18. OHKO: acc = 30 + (Lu − Lt), fail if Lu < Lt, Sturdy blocks, Sheer Cold hits Ice [PS-BA].
19. Explosion/Self-Destruct: no Def halving [PS-BA].
20. Use BW-era base powers (§2.1 list) and the Gen 5 type chart (Steel resists Ghost/Dark) [PS-G5].
21. Speed for Gyro/Electro Ball: fully modified speed incl. paralysis ×¼ [UTIL getFinalSpeed].
22. Gen 6+ features to exclude: Fairy, Megas, Assault Vest, Tough Claws, -ate abilities, Auras, Parental Bond, terrain, Knock Off boost, Facade-ignores-burn, crit 1.5, Gem 1.3, Reflect 0xAAC, Sky Drop weight limit, Minimize always-hit, Hidden Power 60, Bulletproof, Fur Coat, etc.
23. Hit chance (KO odds only): sure-hit list and weather rules → 4096-scale modifier chain (Compound Eyes, Hustle, Victory Star, Sand Veil / Snow Cloak, Bright Powder / Lax Incense, Wide / Zoom Lens, Gravity) → combined stage clamped ±6 with `(3+n)/3` / `3/(3+n)` truncation → `random(100) < acc`; No Guard bypasses everything; OHKO `30 + (Lu − Lt)` (§5.1) [PS-BA; PS-MV].

---

## 9. Confidence notes (where sources disagree or were unavailable)

| Topic | Status |
|---|---|
| **Bulbapedia "Damage" page** | Not fetchable (Cloudflare). Only search-snippet confirmations obtained (crit ×2 in Gen V; order Weather→Crit→random→STAB→Type→Burn→other; three rounding modes from Gen V; random 85–100 floor/100). Everything above is grounded in [BWART] (disassembly) and cross-checked against [CALC]/[PS-*]; nothing here relies on Bulbapedia. |
| **Gyro Ball +1** | [BWART] table omits the "+1"; [CALC] and [PS-G5] include it. **Use +1** (medium-high confidence; Bulbapedia also states +1 for Gen IV+). |
| **Punishment cap** | [BWART] prints `min(120, …)`; [CALC]/[PS-MV] use 200. **Use 200** (high confidence; 120 is inconsistent with the move's documented 200 max). |
| **Damage of 0 after final modifier** | Game asm sets D≥1 before the final chain and has no later clamp; Showdown reproduces this (`tr(baseDamage,16)` may be 0 for Gen 5). Smogon calc reports 1. Only reachable when D==1 and the chained final modifier < 0x800 (e.g. Reflect alone → 0.5 → rounds down to 0). **Recommend faithful behaviour (allow 0) or document a min-1 display clamp** (medium confidence on in-game behaviour; no in-game verification available). |
| **BP-modifier chain order** | [BWART] lists abilities → items → move-specific; [CALC] interleaves slightly differently (Charge earlier, items before Facade etc.). Differences can shift the chained M by 1/4096. **Use [BWART] order.** |
| **Reflect/Light Screen "doubles" test** | [BWART]: "more than one Pokémon per side of the field"; [PS-G5] uses `activePerHalf > 1` (format-based). If one side has only one Pokémon left in a double battle the game likely still uses 0xA8F (format-based); low-impact, medium confidence. |
| **Multi-target modifier & fainted allies** | [BWART]: fainted Pokémon don't count; so a spread move with one remaining live target uses 0x1000. Showdown: `spreadHit` set only when >1 target actually resolved — consistent. |
| **Metronome item counting** | "n = number of times the current move was used successfully and successively" [BWART] — implementations treat first use as n=0 (×1.0), second consecutive as n=1 (×1.2). [CALC] `timesUsedWithMetronome`, [PS-MV] `numConsecutive`. High confidence. |
| **Flower Gift scope** | [BWART] phrases it as "ally is Cherrim"; in Gen 5 it boosts Cherrim itself and its allies. [CALC] handles both (attacker Cherrim or `isFlowerGift` side flag). High confidence. |
| **Gust/Twister vs Fly** | [BWART] classifies as BP doubling (40→80); Showdown implements Fly's case as a damage ×2 and Bounce's as BP ×2 — same value, rounding position differs negligibly. Use BP doubling. |
| **Light Ball category** | [BWART] and [PS-MV]: both physical and special for Pikachu (no category test). [CALC] likewise. High confidence. |
| **Weight division for Heavy Slam** | [BWART] `W = UserModWeight ÷ TargetModWeight` (integer); [PS-MV] `userW >= targetW*k` — equivalent. High confidence. |
| **Accuracy modifier order** (§5.1) | Showdown applies the item/ability/Gravity chain *before* the stage fraction; the Gen 4 decomp does stages first and truncates per modifier. No BW disassembly of the hit test was found. Values differ by at most one point (e.g. Bright Powder + evasion +1 on 100 %: 90 → 67 either way). Medium confidence; the stage fractions themselves (3/9 … 9/3) match Bulbapedia. |
