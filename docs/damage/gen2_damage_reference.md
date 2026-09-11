# Generation 2 (Gold/Silver/Crystal) damage calculation — verification reference

Source of truth: `A:\Cygwin\home\scott\pokecrystal` (Crystal, primary). Gold/Silver differences from
`A:\Cygwin\home\scott\pokegold` are collected in section 8; everything else is byte-identical in the
damage code of both repos (verified by `diff` of `engine/battle/effect_commands.asm`,
`engine/battle/misc.asm`, `engine/battle/core.asm` stat section, `engine/battle/hidden_power.asm`,
`engine/battle/move_effects/*.asm`, and all `data/` tables listed here — the only diffs are cosmetic,
plus the three behavioral differences in section 8).

All paths below are relative to the pokecrystal root unless prefixed `pokegold/`.
"EC" = `engine/battle/effect_commands.asm`, "CORE" = `engine/battle/core.asm`,
"MISC" = `engine/battle/misc.asm`.

Notation: `floor()` = integer truncation (every `Divide` truncates; `Multiply` is exact). All
multi-byte values are big-endian in HRAM. `wCurDamage` is a 16-bit big-endian value.

---

## 0. Helper semantics you must know first

### 0.1 Math routines and HRAM aliasing
`ram/hram.asm:66-82` — a `UNION`: `hMultiplicand` (3 bytes, preceded by 1 spare byte),
`hMultiplier` (1 byte), `hProduct` (4 bytes) all overlap `hDividend` (4 bytes), `hDivisor` (1 byte),
`hQuotient` (4 bytes), `hRemainder`. Concretely:

```
byte offset: 0            1            2            3            4
             hProduct+0   hProduct+1   hProduct+2   hProduct+3   hMultiplier
             hDividend+0  hDividend+1  hDividend+2  hDividend+3  hDivisor
             hQuotient+0  hQuotient+1  hQuotient+2  hQuotient+3  hRemainder
                          hMultiplicand+0 +1        +2
```
So `hMultiplicand` = `hQuotient+1..+3` (the low 3 bytes of the previous quotient), and
`hMultiplier` is the same byte as `hDivisor`. This is why DamageCalc can chain
`Multiply`/`Divide` by writing a single byte at `[hl]` each time.

* `Multiply` (`home/math.asm:27-37` → `engine/math/math.asm:1-80`): 3-byte multiplicand × 1-byte
  multiplier → 4-byte `hProduct`. Exact. Side effect: `hMultiplicand` is shifted left 7 bits (destroyed)
  (`engine/math/math.asm:47-63`).
* `Divide` (`home/math.asm:39-49` → `engine/math/math.asm:82+`): `hDividend` of length `b` bytes
  (always `b = 4` in damage code) ÷ 1-byte `hDivisor` → 4-byte `hQuotient`, truncating.
* `percent` macro (`macros/data.asm:23`): `x percent` = `x * 255 / 100` (integer). `out_of`
  (`macros/data.asm:26`): `1 out_of n` = `256 / n`.
* `ResetDamage` (`home/battle.asm:82-86`): `wCurDamage := 0`.

### 0.2 Battle script order (which command runs when)
`data/moves/effects.asm` lists each effect's command sequence. The canonical damaging move
(`NormalHit`, `data/moves/effects.asm:5-23`) is:

```
checkobedience usedmovetext doturn
critical            ; roll crit  (EC:1120)
damagestats         ; pick Atk/Def, screens, Thick Club/Light Ball, 8-bit truncation, Metal Powder (EC:2525)
damagecalc          ; base formula, type-boost item, crit x2, +2, cap 999 (EC:2900)
stab                ; weather, badge type boost, STAB, type effectiveness (EC:1214)
damagevariation     ; random 217..255 / 255 (EC:1496)
checkhit            ; accuracy (EC:1546)  -- on miss, ResetDamage (except Jump Kick)
moveanim failuretext applydamage criticaltext supereffectivetext checkfaint buildopponentrage kingsrock endmove
```
Note the random roll happens AFTER type effectiveness, and accuracy is checked AFTER damage is
computed. Most special moves reorder/replace commands; see section 6.

---

## 1. `BattleCommand_DamageCalc` — the base formula (EC:2900-3129)

Inputs (registers set by `damagestats`, EC:2532-2613 / 2777-2855): `d` = move power,
`e` = attacker level, `b` = attacker Attack/SpAtk (8-bit), `c` = defender Defense/SpDef (8-bit).

### 1.1 Step by step

1. **Self-Destruct/Explosion halve Defense** (EC:2907-2914). If the move effect is
   `EFFECT_SELFDESTRUCT`: `c := c >> 1`; if that gives 0, `c := 1`. This is applied to the already
   8-bit-truncated defense (see 4.3).
   ```
   	cp EFFECT_SELFDESTRUCT
   	jr nz, .dont_selfdestruct
   	srl c
   	jr nz, .dont_selfdestruct
   	inc c
   ```
2. **Zero power → zero damage** (EC:2917-2928). Unless effect is `EFFECT_MULTI_HIT` or
   `EFFECT_CONVERSION`, `d == 0` returns immediately with `wCurDamage` untouched (it is 0 from
   `ResetDamage` in `damagestats`). This is why Return/Frustration with power 0 deal nothing
   (`docs/bugs_and_glitches.md:751`).
3. **Minimum defense 1** (EC:2930-2935): `if c == 0 then c := 1`.
4. **Level term** (EC:2937-2958): `hDividend := 0,0,0,(2*e)`; if `2*e` overflowed 8 bits,
   `hDividend+2 := 1` (only for level ≥ 128, impossible legitimately). Then `Divide` by 5:
   `q := floor(2*L / 5)`.
5. **+2** (EC:2960-2962): `inc [hl]` twice on `hQuotient+3` (8-bit, no carry; safe since q ≤ 102):
   `q := floor(2L/5) + 2`.
6. **× power** (EC:2964-2967): `Multiply` by `d`. Multiplicand is `hQuotient+1..3` (3 bytes).
7. **× Attack** (EC:2969-2971): `Multiply` by `b`.
8. **÷ Defense** (EC:2973-2976): `Divide` (4-byte) by `c` → truncates.
9. **÷ 50** (EC:2978-2981): `Divide` by 50 → truncates.

   So far: `D = floor( floor( (floor(2L/5)+2) * P * A / Def ) / 50 )`.
   (Exact: the product `(floor(2L/5)+2)*P*A` is computed exactly in 4 bytes; then two successive
   truncating divisions.)

10. **Type-boost held item** (EC:2983-3020). `GetUserItem` (EC:6554-6562) returns held-effect in `b`
    and its parameter in `c` (`GetItemHeldEffect` EC:6576-6594 reads `ItemAttributes`). If effect
    is 0 → skip. Walk `TypeBoostItems` (`data/types/type_boost_items.asm:1-19`) for a row whose
    effect equals `b`; if found and the row's type equals the current move type
    (`BATTLE_VARS_MOVE_TYPE`), then:
    ```
    	ld a, c        ; item parameter (10 for every type-boost item)
    	add 100
    	ldh [hMultiplier], a
    	call Multiply
    	ld a, 100 ; / 100
    	ldh [hDivisor], a
    	ld b, 4
    	call Divide
    ```
    i.e. `D := floor(D * 110 / 100)`. Every type-boost item has parameter 10
    (`data/items/attributes.asm:162,164,172,186,200,202,206,214,218,224,226,236,244,260,286,296,313,351`).
    NOTE: the multiplicand is only the low 3 bytes of `hQuotient`; fine since D < 2^24.
    NOTE: the search stops at the first row whose *effect* matches (`jr nz, .DoneItem` on the type
    compare) — each effect appears once, so effectively "item boosts its one type".
11. **Critical hit ×2** (EC:3022-3023, `.CriticalMultiplier` EC:3108-3129). If `wCriticalHit != 0`,
    the 16-bit value in `hQuotient+2..3` is doubled (`add a` / `rl a`); if carry out, it is set to
    `$FFFF`. Applied AFTER the item boost and BEFORE the +2 / 999 cap.
12. **Cap to 997, then +2** (EC:3025-3106). Constants: `MAX_DAMAGE = 999`, `MIN_DAMAGE = 2`,
    `DAMAGE_CAP = 997`. Logic (with `wCurDamage == 0` on entry, which is always the case because
    `damagestats`/`HitSelfInConfusion`/`BeatUp` call `ResetDamage` first):
    * if `hQuotient+1 != 0` → cap (EC:3044-3048)
    * if `hQuotient+2..3 >= 998` → cap (EC:3050-3059)
    * `wCurDamage := wCurDamage + hQuotient+2..3` (EC:3061-3072); carry → cap; again `>= 998` → cap
      (EC:3075-3085)
    * `.Cap`: `wCurDamage := 997` (EC:3087-3091)
    * finally `wCurDamage += 2` with carry into the high byte (EC:3094-3101).

    **Net effect: `wCurDamage = min(D_after_crit, 997) + 2`, so DamageCalc always yields a value in
    [2, 999].** (The weird `ld b,[hl] / add b` at EC:3031-3034 adds the *high* byte of the existing
    `wCurDamage` to the low byte of the quotient; it is a no-op because `wCurDamage` is 0 here —
    except for Present, see 6.14.)

13. Returns `nz`, `nc` (EC:3103-3106).

**Not in DamageCalc**: STAB, type effectiveness, weather, badge type boost, random roll — those are in
`BattleCommand_Stab` and `BattleCommand_DamageVariation`, which run afterwards (section 1.3, 1.4).
The Gen 2 stat-badge ×9/8 is applied to the *stat*, not to damage (section 3).

### 1.2 Attack/Defense selection — `BattleCommand_DamageStats` (EC:2525-2855)

`PlayerAttackDamage` (EC:2532-2613) and `EnemyAttackDamage` (EC:2777-2855) are mirror images.
Using the player's-turn version:

1. `ResetDamage` (EC:2535).
2. `d := move power` (from `wPlayerMoveStructPower`); if 0, return (EC:2537-2541).
3. Physical vs special is decided by the **move's type**: `cp SPECIAL; jr nc, .special`
   (EC:2543-2545). `SPECIAL` = 20 (`constants/type_constants.asm:26`); types < 20
   (Normal, Fighting, Flying, Poison, Ground, Rock, Bird, Bug, Ghost, Steel, Curse-type) are physical;
   Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark are special.
4. **Physical** (EC:2548-2568):
   * `bc := wEnemyMonDefense` (the *boosted* in-battle stat, 16-bit).
   * If defender's `SCREENS_REFLECT` set: `bc := bc << 1` (16-bit shift, no cap — the
     "wraps above 1024" bug, `docs/bugs_and_glitches.md:285`) (EC:2553-2557).
   * `hl := &wBattleMonAttack`; `call CheckDamageStatsCritical` (EC:2560-2561). If it returns carry,
     keep boosted stats. Otherwise (**crit that ignores stages**) reload **unboosted** stats:
     `bc := wEnemyDefense` (from `wEnemyStats`), `hl := &wPlayerAttack` (from `wPlayerStats`)
     (EC:2564-2568) — this also discards the Reflect doubling.
   * `call ThickClubBoost` (EC:2599-2601).
5. **Special** (EC:2571-2595): same with `wEnemyMonSpclDef`, `SCREENS_LIGHT_SCREEN`,
   `wBattleMonSpclAtk`, unboosted `wEnemySpDef`/`wPlayerSpAtk`, then `call LightBallBoost` (EC:2594-2596).
6. `.done`: `call TruncateHL_BC` (EC:2603-2604) → 8-bit `b` (attack) and `c` (defense); see 4.3.
7. `e := wBattleMonLevel` (EC:2606-2607).
8. `call DittoMetalPowder` (EC:2608) — see 7.3. Applied AFTER 8-bit truncation.

### 1.3 `BattleCommand_Stab` — weather, badge type boost, STAB, type effectiveness (EC:1214-1396)

Order inside this one command:

0. **Struggle exits immediately** (EC:1216-1219): `cp STRUGGLE; ret z`. Struggle therefore gets **no
   weather modifier, no badge type boost, no STAB and no type effectiveness at all** (it hits Ghosts
   for neutral damage; `wTypeModifier` is left stale from the previous move).
1. Load user types into `b,c` and target types into `d,e` (EC:1221-1243); `wCurType := move type`
   (EC:1245-1248).
2. **Weather** — `farcall DoWeatherModifiers` (EC:1248-1254; MISC:52-144). See 1.3.1.
3. **Badge type boost** — `farcall DoBadgeTypeBoosts` (EC:1256-1260; MISC:147-215). See 3.2.
4. **STAB** (EC:1262-1288): if `wCurType == user type1 or type2`:
   ```
   	ld hl, wCurDamage ... (hl = damage)
   	ld b, h / ld c, l / srl b / rr c   ; bc = damage >> 1
   	add hl, bc                          ; damage += damage >> 1   (16-bit, no cap)
   ```
   i.e. `D := D + floor(D/2)` (= floor(1.5·D)). Sets `STAB_DAMAGE` bit in `wTypeModifier`.
5. **Type effectiveness loop** (EC:1290-1386) over `TypeMatchups`
   (`data/types/type_matchups.asm:1-118`) **in table order**, for each row where
   `row.attacker == move type` and `row.defender == d or e` (target type1 or type2):
   ```
   	ld a, [hl]          ; multiplier: 20 (SE), 5 (NVE), 0 (immune)
   	and a
   	jr nz, .NotImmune
   	inc a / ld [wAttackMissed], a   ; immune -> treat as a miss
   	xor a
   .NotImmune:
   	ldh [hMultiplier], a
   	...
   	call Multiply       ; D * mult   (multiplicand = wCurDamage, 16-bit)
   	(if product == 0 -> .ok, i.e. skip)
   	ld a, 10 / Divide   ; / 10
   	(if quotient16 == 0 -> hMultiplicand+2 := 1, i.e. D := 1)
   .ok  write back 16-bit
   ```
   So per matching row: `D := floor(D * m / 10)`, and **if that truncates to 0 it becomes 1**
   (EC:1356-1373) — unless the multiplier itself was 0 (immune), in which case the product is 0, the
   write-back stores a garbage (left-shifted) multiplicand, and `wAttackMissed = 1` makes
   `failuretext` end the move ("doesn't affect"). Each dual-type matchup is applied as two
   separate truncating steps (×20/10 then ×5/10 etc.) in table order. A mono-type target
   (type1 == type2) matches each row only once (`cp d` then `cp e` both jump to the same label).
   Constants: `SUPER_EFFECTIVE = 20`, `NOT_VERY_EFFECTIVE = 5`, `NO_EFFECT = 0`, `EFFECTIVE = 10`
   (`constants/battle_constants.asm:21-25`).
   * **Foresight** (EC:1300-1310; `data/types/type_matchups.asm:112-118`): the table's main body ends
     with a `-2` sentinel, after which come `NORMAL→GHOST 0` and `FIGHTING→GHOST 0`, then `-1`. At
     the `-2`, if the *target* has `SUBSTATUS_IDENTIFIED` (was Foresighted) the loop ends (Ghost
     immunities skipped); otherwise it continues through them. Because these rows are last, Ghost
     immunity is evaluated last — irrelevant to the result since 0 wins anyway.
6. `.end` (EC:1388-1396): `BattleCheckTypeMatchup` (EC:1398-1471) recomputes the *combined*
   multiplier into `wTypeMatchup` as `10 → ×m/10` chained (so 20 / 40 / 5 / 2 (=2.5, truncated) / 0)
   — used only for messages, AI, OHKO and Counter/Bide immunity checks — and
   `wTypeModifier := STAB bit | wTypeMatchup`.

#### 1.3.1 Weather — `DoWeatherModifiers` (MISC:52-144, table `data/battle/weather_modifiers.asm:1-10`)
Table `WeatherTypeModifiers`: `(RAIN, WATER, MORE_EFFECTIVE=15)`, `(RAIN, FIRE, NOT_VERY_EFFECTIVE=5)`,
`(SUN, FIRE, 15)`, `(SUN, WATER, 5)`. If no (weather, move type) row matches,
`WeatherMoveModifiers` is searched by (weather, **move effect**): only `(RAIN, EFFECT_SOLARBEAM, 5)`.
`.ApplyModifier` (MISC:100-140):
```
	D * mult  (Multiply, multiplicand = wCurDamage)
	/ 10      (Divide, b=4)
	if hQuotient+1 != 0 -> D := $FFFF
	else if quotient16 == 0 -> D := 1
```
So `D := floor(D*15/10)` or `floor(D*5/10)`, min 1, cap 65535. Sandstorm has no damage effect.
Applies to both sides, in all battle types. Note Solar Beam in **sun** has no damage modifier (only the
charge turn is skipped, `BattleCommand_SkipSunCharge` EC:6535).

### 1.4 Random roll — `BattleCommand_DamageVariation` (EC:1496-1545)

```
; No point in reducing 1 or 0 damage.
	ld hl, wCurDamage / ld a,[hli] / and a / jr nz,.go / ld a,[hl] / cp 2 / ret c
.loop
	call BattleRandom
	rrca
	cp 85 percent + 1      ; 85*255/100 = 216, +1 = 217
	jr c, .loop            ; reject a < 217
	ldh [hMultiplier], a
	call Multiply          ; D * R
	ld a, 100 percent      ; = 255
	... Divide             ; / 255
```
* **Skipped when D ≤ 1** (0 or 1). Otherwise `D := floor(D * R / 255)` with `R` uniformly drawn
  (rotate-right of a random byte, then rejection) from **[217, 255]** (39 values). Min result for
  D=2 is `floor(2*217/255) = 1`, so final damage is never 0 by this step.
* Not called at all by: Flail/Reversal, Counter, Mirror Coat, Bide, OHKO, fixed-damage moves,
  Future Sight at use time (it is applied when Future Sight *lands*), confusion self-hit.

### 1.5 Where the accuracy check sits, and `ClearMissDamage`
`checkhit` (EC:1546-1612) runs after damage for most moves; on miss it calls `ResetDamage` (EC:1612-1618)
except for `EFFECT_JUMP_KICK` (damage kept for crash damage, see 6.24). Scripts that put `checkhit`
*before* damage (MultiHit, TripleKick, Rampage, TrapTarget, Present, BeatUp) use `clearmissdamage`
(EC:2857-2862) to zero it afterwards.

The hit roll itself (`BattleCommand_CheckHit` EC:1546-1612, implemented in `accuracy.ts` `hitGen2`):
1. Dream Eater needs a sleeping target; Protect; drain moves fail on a Substitute; Lock-On forces a
   hit; a Fly target is hittable only by Gust/Whirlwind/Thunder/Twister, a Dig target only by
   Earthquake/Fissure/Magnitude (`.FlyDigMoves` EC:1706-1740); Thunder in rain hits (EC:1741-1749);
   X Accuracy; `EFFECT_ALWAYS_HIT` (Swift, Feint Attack, Vital Throw).
2. `.StatModifiers` (EC:1758-1846): if the target is Foresighted **and** its evasion level ≥ the user's
   accuracy level, the raw byte is used; otherwise `acc := floor(acc*num/den)` for the accuracy level then
   for `14 − evasion level`, min 1 per step, cap 255 (`AccuracyLevelMultipliers`
   `data/battle/accuracy_multipliers.asm`: −6..+6 = 33/36/43/50/60/75/100/133/166/200/233/266/300 %).
3. Bright Powder on the target: `acc := max(0, acc − 20)` (EC:1584-1600, `attributes.asm:16`).
4. `cp -1 ; jr z, .Hit` (EC:1602-1603): **a byte of 255 always hits** — no Gen 1 1/256 miss. Otherwise
   hit iff `BattleRandom < acc` → `acc/256`. Move bytes are `percent` (85% = 216, 70% = 178, 30% = 76).
   Gold/Silver are identical (pokegold EC:1553-1620).

### 1.6 Summary of the full pipeline (normal damaging move)
```
A, Def  = 8-bit stats after: stages -> badge x9/8 -> burn/2 (attacker) ; Reflect/LS x2 (defender) ;
          Thick Club / Light Ball x2 ; joint /4 truncation ; Metal Powder (Ditto defender)
D  = floor( floor( (floor(2L/5)+2) * P * A / Def ) / 50 )
D  = floor(D * 110 / 100)                      if type-boost item matches move type
D  = min(2*D, 65535)                            if crit
D  = min(D, 997) + 2                            (always: 2..999)
D  = floor(D*15/10) | floor(D*5/10), min 1, cap 65535     weather (type or Solar Beam in rain)
D  = D + max(1, D>>3), cap 65535                 player only, badge matching move type
D  = D + (D>>1)                                  STAB
for each matching TypeMatchups row (table order): D = max(1, floor(D*m/10))   (m=20 or 5; 0 => miss)
if D >= 2: D = floor(D * R / 255), R in [217,255]
(then move-specific post-multipliers: Rollout/FuryCutter/Pursuit/DoubleDamage/etc. — see section 6)
```

---

## 2. Critical hits

### 2.1 Chance — `BattleCommand_Critical` (EC:1120-1206)
* `wCriticalHit := 0`; if move power is 0, return (EC:1123-1129) — status/fixed moves never crit.
* Stage `c` starts at 0 (EC:1140).
* **Chansey + Lucky Punch** or **Farfetch'd + Stick**: `c := 2` and **jump straight to `.Tally`**
  (EC:1142-1160), skipping Focus Energy, high-crit-move and Scope Lens checks. So Chansey/Lucky Punch is
  always stage 2 (1/4), even with Focus Energy or a high-crit move. (Species is `wBattleMonSpecies` /
  `wEnemyMonSpecies`, the in-battle species — a Transformed mon uses the transformed species.)
* Otherwise: Focus Energy (`SUBSTATUS_FOCUS_ENERGY`) → `c += 1` (EC:1162-1169); move in
  `CriticalHitMoves` → `c += 2` (EC:1171-1183; table `data/moves/critical_hit_moves.asm:1-9`:
  Karate Chop, Razor Wind, Razor Leaf, Crabhammer, Slash, Aeroblast, Cross Chop); held item effect
  `HELD_CRITICAL_UP` (Scope Lens, `data/items/attributes.asm:290`) → `c += 1` (EC:1185-1194).
  Max stage 4.
* `.Tally` (EC:1196-1206): `if BattleRandom() < CriticalHitChances[c] then crit`.
  Table (`data/battle/critical_hit_chances.asm:1-8`, `out_of` = 256/n):

  | stage | byte | probability |
  |---|---|---|
  | 0 | 256/15 = 17 | 17/256 (6.64%) |
  | 1 | 32 | 1/8 |
  | 2 | 64 | 1/4 |
  | 3 | 256/3 = 85 | 85/256 (33.2%) |
  | 4,5,6 | 128 | 1/2 |

### 2.2 What a crit does
1. **×2 damage** in DamageCalc, after item boost, before +2/cap (EC:3022-3023, 3108-3129).
2. **Stat stage handling — `CheckDamageStatsCritical`** (EC:2660-2704). Returns carry ("use boosted
   stats") when not a crit. On a crit it compares
   `b = attacker's Atk (or SpAtk) stage` with `a = defender's Def (or SpDef) stage`
   (raw stage values 1..13, `BASE_STAT_LEVEL = 7`), using the move-type-derived physical/special split:
   ```
   .end
   	cp b        ; a(def stage) - b(atk stage)
   	pop bc / pop hl
   	ret         ; carry iff defStage < atkStage
   ```
   * `defStage < atkStage` → carry → **boosted stats used** (stages *and* Reflect/Light Screen apply).
   * `defStage >= atkStage` → no carry → **unboosted stats used** for BOTH sides
     (`wPlayerStats`/`wEnemyStats` copies: raw stats with no stages, no badge boosts, no burn/paralysis,
     and the screen doubling is not applied because the screen doubling was done on the boosted copy).
   So a crit ignores stat stages, screens, badge stat boosts and burn **only when the attacker's attacking
   stage ≤ the defender's defending stage**. E.g. attacker +2 Atk vs defender +0 Def → crit uses +2 Atk
   and screens; attacker +0 vs defender −1 → crit uses boosted (defender's drop counts).
3. Thick Club / Light Ball / Metal Powder / 8-bit truncation still apply on either path (they run after
   the choice, EC:2594-2608).
4. Type-boost items, badge *type* boosts, STAB, weather: unaffected by crit.
5. Messages: `wCriticalHit = 1` → "Critical hit!"; `2` → "One-hit KO!" (`BattleCommand_CriticalText`
   EC:2275-2303); `-1` ($FF) is used by OHKO's "no effect" path (EC:5457-5462, EC:2211-2214).
6. `False Swipe`/Endure/Focus Band clear `wCriticalHit` if it was 2 (`move_effects/false_swipe.asm:34-38`).

---

## 3. Badge boosts

### 3.1 Stat boosts ×9/8 — `BadgeStatBoosts` (CORE:6768-6824) / `BoostStat` (CORE:6826-6850)
* Player only (called only on the player's battle mon), not in link battles or Battle Tower
  (CORE:6779-6787).
* Uses `wJohtoBadges` only: Zephyr → Attack, Plain → Speed, Mineral → Defense, Glacier → Sp.Atk
  (and Sp.Def, buggy). The bit order is swapped so the loop visits Zephyr(Atk), Mineral(Def),
  Plain(Spd), Glacier(SpAtk) as it walks `wBattleMonAttack`, `+2`, `+4`, `+6` (CORE:6791-6822).
  Kanto badges give **no** stat boosts.
* `BoostStat`: `stat := stat + (stat >> 3)` (16-bit, floor), then cap at `MAX_STAT_VALUE = 999`
  (CORE:6826-6850). No minimum add (a stat < 8 gets +0).
* **Glacier/SpDef bug** (`docs/bugs_and_glitches.md:1255`, CORE:6822-6824): the final `srl a; call c,
  BoostStat` for Sp.Def uses `a` which `BoostStat` clobbered; Sp.Def is boosted only if the unboosted
  Sp.Atk is 206–432 or ≥ 661 (per the doc's analysis). Exact rule from the code: after the loop
  `a` = the last value `BoostStat` left in it (`ld a,[hl]` = low byte of boosted Sp.Atk if the boost ran,
  otherwise `a` = pre-shift badge byte `b`); carry of `srl a` decides. A calculator should implement
  the doc's stated ranges or replicate the register trace.
* **When applied**: on switch-in / send-out (`InitBattleMon` CORE:3901-3907: copy raw party stats to
  both `wBattleMonAttack..` and `wPlayerStats`, then `ApplyStatusEffectOnPlayerStats`, then
  `BadgeStatBoosts`), and on every stat-stage change via `CalcPlayerStats` (EC:4778-4797: stage
  multiplier → `BadgeStatBoosts` → PRZ → BRN). Order therefore: **stages, then ×9/8 (cap 999), then
  burn ÷2 / paralysis ÷4**. (After Baton Pass, `PassedBattleMonEntrance` CORE:5285-5305 calls
  `ApplyStatLevelMultiplierOnAllStats` *after* `InitBattleMon`, which overwrites the badge/burn-adjusted
  values with stage-only values until the next stat change — an edge case.)

### 3.2 Type boosts ×9/8 (well, +1/8) — `DoBadgeTypeBoosts` (MISC:147-215, table `data/types/badge_type_boosts.asm:1-21`)
* Player's turn only (`hBattleTurn == 0`, MISC:156-158), not link / Battle Tower (MISC:148-154).
* Bits walked LSB-first over the 16-bit pair `wKantoBadges:wJohtoBadges` (MISC:160-185), so **Johto badges
  boost types too**: Zephyr→Flying, Hive→Bug, Plain→Normal, Fog→Ghost, Mineral→Steel, Storm→Fighting,
  Glacier→Ice, Rising→Dragon, Boulder→Rock, Cascade→Water, Thunder→Electric, Rainbow→Grass, Soul→Poison,
  Marsh→Psychic, Volcano→Fire, Earth→Ground. First badge whose bit is set and whose type equals
  `wCurType` applies; then done (only one boost).
* `.ApplyBoost` (MISC:187-215): `D := D + (D >> 3)`; **if `D >> 3 == 0` add 1 instead**; cap `$FFFF`.
  Applied inside `BattleCommand_Stab` after weather, before STAB (section 1.3).

---

## 4. Burn, screens, stat truncation

### 4.1 Burn — `ApplyBrnEffectOnAttack` (CORE:6630-6669)
`wBattleMonAttack := max(1, Attack >> 1)` (16-bit) when the mon's status has `BRN`. Applied to the
in-battle (boosted) Attack after stages and badge boost (`CalcPlayerStats` EC:4778-4797,
`CalcEnemyStats` EC:4799-4815, `InitBattleMon` CORE:3905). Not applied to the unboosted `wPlayerStats`
copy, so a crit that takes the "unboosted" path ignores burn. Paralysis likewise: Speed `>> 2`, min 1
(CORE:6585-6629). Bug: a *switched-in enemy trainer mon* that is already burned/paralyzed in
single-player does not get the reduction (`LoadEnemyMon` CORE:6413-6420,
`docs/bugs_and_glitches.md:1237`).

### 4.2 Reflect / Light Screen
`Def := Def << 1` (16-bit, no cap) in `damagestats` (EC:2553-2557 / 2582-2586 and enemy mirror), only
on the boosted path (see 2.2). Screens also apply to confusion self-hit (EC:2879-2884). The doubled
value can exceed 1023 and, after `TruncateHL_BC`, wrap (`docs/bugs_and_glitches.md:285`) — in Gold/Silver
always, in Crystal only in link battles (see 4.3).

### 4.3 16-bit → 8-bit truncation — `TruncateHL_BC` (EC:2614-2658)
Inputs: `hl` = attack (after Thick Club/Light Ball), `bc` = defense (after screens). Outputs `b` = 8-bit
attack, `c` = 8-bit defense.
```
.loop
	ld a, h / or b / jr z, .finish        ; if both <= 255, done
	srl b / rr c / srl b / rr c          ; defense >>= 2
	(if defense == 0: c := 1)
	srl h / rr l / srl h / rr l          ; attack  >>= 2
	(if attack == 0: l := 1)
.finish
	ld a, [wLinkMode] / cp LINK_COLOSSEUM / jr z, .done     ; Crystal: link battle -> single pass
	ld a, h / or b / jr nz, .loop                           ; Crystal non-link: repeat while either > 255
.done
	ld b, l          ; attack low byte
	ret
```
* If **either** stat > 255, **both** are divided by 4 (floor), each with minimum 1. Crystal (non-link)
  repeats until both ≤ 255 (so a 1024+ value is divided by 16). Gold/Silver and Crystal-in-link do a
  single `/4` pass and then take the low byte (`ld b, l`), so values ≥ 1024 (after /4 still ≥ 256) wrap
  mod 256 (`docs/bugs_and_glitches.md:172,198,285`).
* Since ordinary stats are capped at 999, only Reflect/Light Screen (×2) and Thick Club/Light Ball (×2)
  can push a value ≥ 1024.
* Order is: screens → Thick Club/Light Ball → truncation → Metal Powder (Metal Powder is applied to the
  8-bit `c`, section 7.3).

### 4.4 Explosion/Self-Destruct: 8-bit `c` halved, min 1 (EC:2907-2914). Applied after truncation.

---

## 5. Stat stage multipliers

Table `data/battle/stat_multipliers.asm:8-20` (included twice: `StatLevelMultipliers` EC:4625 for
`CalcBattleStats`, `StatLevelMultipliers_Applied` CORE:6765 for `ApplyStatLevelMultiplier`):

| stage | num/den | multiplier |
|---|---|---|
| −6 | 25/100 | 0.25 |
| −5 | 28/100 | 0.28 |
| −4 | 33/100 | 0.33 |
| −3 | 40/100 | 0.40 |
| −2 | 50/100 | 0.50 |
| −1 | 66/100 | **0.66** (not 2/3) |
| 0 | 1/1 | 1 |
| +1 | 15/10 | 1.5 |
| +2 | 2/1 | 2 |
| +3 | 25/10 | 2.5 |
| +4 | 3/1 | 3 |
| +5 | 35/10 | 3.5 |
| +6 | 4/1 | 4 |

Applied as `stat := floor(base * num / den)` (`CalcBattleStats` EC:4817-4886; `ApplyStatLevelMultiplier`
CORE:6682-6763), where `base` is the raw `wPlayerStats`/`wEnemyStats` value; result **min 1, cap 999**
(`MAX_STAT_VALUE`) (EC:4851-4870; CORE:6739-6760). Stage variable range 1..13 (`BASE_STAT_LEVEL = 7`,
`MAX_STAT_LEVEL = 13`, `constants/battle_constants.asm:10-11`). Accuracy/evasion use a different table
(`data/battle/accuracy_multipliers.asm:1-17`: −6..+6 = 33,36,43,50,60,75,100,133,166,200,233,266,300 %).

---

## 6. Moves with special damage handling

Script command sequences are from `data/moves/effects.asm` (line numbers given). "Normal pipeline" means
`critical damagestats damagecalc stab damagevariation checkhit`.

### 6.1 Fixed damage: Seismic Toss, Night Shade, SonicBoom, Dragon Rage, Psywave, Super Fang
Script `StaticDamage`/`SuperFang`/`Psywave` (`effects.asm:1237-1252`):
`constantdamage checkhit resettypematchup moveanim failuretext applydamage ...`
— no `critical`, no `stab`, no `damagevariation`. `BattleCommand_ResetTypeMatchup` (EC:1473-1494) only
checks immunity (`wTypeMatchup == 0` → miss, damage reset). No STAB/weather/badge/type multipliers.
`BattleCommand_ConstantDamage` (EC:3133-3205):
* `EFFECT_LEVEL_DAMAGE` (Seismic Toss, Night Shade; `moves.asm:85,117`): damage = user's level (EC:3141-3146).
  Night Shade vs Normal = immune, Seismic Toss vs Ghost = immune (via resettypematchup).
* `EFFECT_STATIC_DAMAGE` (SonicBoom 20, Dragon Rage 40; `moves.asm:65,98`): damage = move power byte
  (EC:3159-3163).
* `EFFECT_PSYWAVE` (EC:3165-3178): `b := L + (L >> 1)`; loop: `r := BattleRandom()`, reject `r == 0`,
  reject `r >= b`; damage = `r`. So damage ∈ **[1, floor(1.5·L) − 1]**, uniform.
* `EFFECT_SUPER_FANG` (EC:3180-3199): damage = `target current HP >> 1` (16-bit), min 1.

### 6.2 OHKO: Fissure, Guillotine, Horn Drill — `BattleCommand_OHKO` (EC:5420-5462)
Script `OHKOHit` (`effects.asm:917-930`): `stab ohko moveanim failuretext applydamage ...`.
* `ResetDamage`; if `wTypeModifier & EFFECTIVENESS_MASK == 0` (immune, from the preceding `stab`) →
  `wCriticalHit := -1`, miss ("doesn't affect").
* `diff := userLevel − targetLevel`; if negative → same "no effect" path.
* `acc := moveAcc + 2*diff`, capped 255; move acc byte is `30 percent` = 76 (`moves.asm:28,48,106`).
* `call BattleCommand_CheckHit` — normal accuracy check, so **accuracy/evasion stages apply**, Bright
  Powder applies, Lock-On forces a hit, and Fly/Dig immunity applies (Fissure can hit Dig).
* Damage `:= $FFFF`; `wCriticalHit := 2` ("One-hit KO!"). Speed is **not** compared in Gen 2.

### 6.3 Multi-hit moves — `BattleCommand_EndLoop` (EC:5203-5334)
Script `MultiHit` (`effects.asm:842-866`): `startloop lowersub checkhit critical damagestats damagecalc
stab damagevariation clearmissdamage moveanimnosub failuretext applydamage criticaltext cleartext
supereffectivelooptext checkfaint buildopponentrage endloop raisesub kingsrock`. Accuracy is rolled once
(before the loop); `endloop` jumps back to `critical`, so **crit, damage and random roll are re-rolled per
hit**. `endloop` on the first pass decides the count `a` = *additional* hits; total = `a + 1`:
* `EFFECT_MULTI_HIT` (DoubleSlap, Comet Punch, Fury Attack, Pin Missile, Spike Cannon, Barrage, Fury
  Swipes, Bone Rush; EC:5271-5285): `r := rand & 3; if r >= 2 then r := rand & 3; a := r + 1`.
  Distribution of total hits: **2: 3/8, 3: 3/8, 4: 1/8, 5: 1/8**.
* `EFFECT_DOUBLE_HIT` (Double Kick, Bonemerang) and `EFFECT_POISON_MULTI_HIT` (Twineedle): `a := 1` →
  exactly 2 hits (EC:5225-5228, 5286-5288). Twineedle's poison chance is rolled once, before the loop
  (`effectchance` before `critical`, `effects.asm:868-894`), and applied after the loop.
* `EFFECT_TRIPLE_KICK` (EC:5232-5241): `r := rand & 3` re-rolled until nonzero (1..3); `r−1` additional
  hits → **1, 2 or 3 hits each with probability 1/3**. Per-hit damage: `BattleCommand_TripleKick`
  (`move_effects/triple_kick.asm:1-25`) runs right after `damagecalc` and adds the DamageCalc result to
  itself `kick#` times, cap `$FFFF`: hit n deals `n × (DamageCalc output)` before STAB/type/random (so it
  is `n×(min(D,997)+2)`, not power 10/20/30 through the formula). `kickcounter` increments after each hit.
  Note: Triple Kick's accuracy is checked once; Gen 2 does not re-check per kick.
* `EFFECT_BEAT_UP`: see 6.10.
* The loop ends early if the target faints (`checkfaint`) — standard.

### 6.4 Counter / Mirror Coat (`move_effects/counter.asm:1-57`, `mirror_coat.asm:1-58`)
Script `Counter`/`MirrorCoat` (`effects.asm:1270-1281`, `1849-1860`): `counter moveanim failuretext
applydamage ...` — no `checkhit`, no `critical`, no `stab`, no random.
Conditions (each failing → `wAttackMissed = 1`): opponent's last counterable move exists and is not
itself Counter/Mirror Coat; `ResetTypeMatchup` — target not immune to the move's own type (Counter is
Fighting, so fails vs Ghost; Mirror Coat is Psychic, fails vs Dark); opponent moved first this turn;
that move has power > 0; its type is physical (`< SPECIAL`) for Counter / special (`>= SPECIAL`) for
Mirror Coat; `wCurDamage != 0`. Then **`wCurDamage := 2 × wCurDamage`** (16-bit, cap `$FFFF`) —
`wCurDamage` is whatever the last damage computation left (the opponent's last hit, including damage
absorbed by a Substitute; bug: also survives the opponent using an item, `docs/bugs_and_glitches.md:540`).

### 6.5 Bide (`move_effects/bide.asm:1-96`)
Stores for `2 + (rand & 1)` turns (`BattleCommand_UnleashEnergy` :88-92). Damage taken is accumulated in
`wPlayerDamageTaken` by `ApplyDamage.update_damage_taken` (EC:2166-2195; not counted when it hits a
Substitute). Release: `wCurDamage := 2 × damageTaken`, cap `$FFFF` (:35-46); if 0 → miss. Script `Bide`
(`effects.asm:795-809`): `... unleashenergy resettypematchup checkhit moveanim bidefailtext applydamage`
— only immunity check (Normal vs Ghost fails), no STAB/type/random/crit.

### 6.6 Self-Destruct / Explosion (`moves.asm:136,169`, effect `EFFECT_SELFDESTRUCT`)
Normal pipeline with the 8-bit defense halved (min 1) inside DamageCalc (EC:2907-2914). Power 200 / 250.
User faints regardless (`move_effects/selfdestruct.asm`). Bug: the halving (and type-boost items) also
apply to confusion self-hit while these moves are selected (`docs/bugs_and_glitches.md:412`).

### 6.7 Hyper Beam — normal pipeline + `rechargenextturn` (`effects.asm:1091-1109`; EC:5946-5950).
No damage peculiarity.

### 6.8 Recoil moves (Take Down, Double-Edge, Submission, **Struggle**) — `BattleCommand_Recoil` (EC:5670-5730)
Script `RecoilHit` (`effects.asm:932-951`). Recoil = `wCurDamage >> 2` (16-bit), **min 1**, subtracted
from user's HP (can KO). Struggle is `EFFECT_RECOIL_HIT`, power 50, type Normal (`moves.asm:181`) → 1/4
recoil, and skips all of `BattleCommand_Stab` (section 1.3 step 0): no STAB, no type effectiveness
(hits Ghost), no weather/badge boost. It still gets crit, item boost (Pink Bow/Polkadot Bow), random.

### 6.9 Hidden Power (`engine/battle/hidden_power.asm:1-108`; script `effects.asm:1791-1809`)
Script: `critical hiddenpower damagecalc stab ...` (`hiddenpower` replaces `damagestats`). DVs stored
as bytes `AtkDef` (Atk high nibble, Def low) and `SpdSpc`.
* Power (:11-62): `x = (Atk&8)<<0 | (Def&8)>>1 | (Spd&8)>>2 | (Spc&8)>>3` i.e.
  `x = 8·atkBit3 + 4·defBit3 + 2·spdBit3 + spcBit3` (0..15);
  **`power = floor((5·x + (Spc & 3)) / 2) + 31`** → range 31..70.
* Type (:64-92): `t = 4·(Atk & 3) + (Def & 3)` (0..15) → `t+1`; if `>= BIRD(6)` add 1; if
  `>= UNUSED_TYPES(10)` add `UNUSED_TYPES_END − UNUSED_TYPES = 10` (`constants/type_constants.asm:7-35`).
  Mapping t=0..15 → Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel, Fire, Water, Grass,
  Electric, Psychic, Ice, Dragon, Dark.
* The move type is overwritten, then `BattleCommand_DamageStats` is called with the new type, so
  physical/special follows the Hidden Power type (:94-108). STAB, type-boost items, weather and badges
  all use the new type.

### 6.10 Beat Up (`move_effects/beat_up.asm:1-220`; script `effects.asm:2041-2066`)
Script: `startloop lowersub checkhit critical beatup damagecalc damagevariation clearmissdamage ...
endloop ...` — **no `stab`** → no STAB, no type effectiveness, no weather, no badge type boost. Crit is
rolled per hit. Per party member (in party order; skipped if fainted or has any status, :31-47):
`b := base Attack of that party member's species`, `c := base Defense of the target's species`
(`wBaseDefense`, not battle stats), `e := that member's level`, `d := 10` (:54-79). Then normal DamageCalc
(incl. +2 and type-boost item ×1.1 for a Dark booster held by the *user*) and random. Hits = party count
(`EndLoop.beat_up` EC:5243-5259; a 1-mon party goes to the buggy `.only_one_beatup` path,
`docs/bugs_and_glitches.md:673`). Wild enemy using Beat Up falls through to `EnemyAttackDamage` (:154-160).

### 6.11 Return / Frustration (`move_effects/return.asm:1-25`, `frustration.asm:1-26`)
Script `Return` (`effects.asm:1607-1626`): `critical damagestats happinesspower damagecalc stab ...`.
`power = floor(happiness × 10 / 25)` (max 102); Frustration `floor((255 − happiness) × 10 / 25)`.
Power 0 (happiness 0–2 / 253–255) → DamageCalc returns 0 damage (`docs/bugs_and_glitches.md:751`).

### 6.12 Present (`move_effects/present.asm:1-87`, table `data/moves/present_power.asm:1-6`)
Script `Present` (`effects.asm:1628-1647`): `checkhit critical damagestats present damagecalc stab
damagevariation clearmissdamage failuretext applydamage ...` (accuracy first).
`BattleCommand_Present` first calls `BattleCommand_Stab` itself (with `wCurDamage = 0`) to obtain
`wTypeMatchup`; immune target (Ghost) → fails. Then `r := BattleRandom()`, power by threshold
`r <= byte`: `40 percent = 102` → 40 (103/256 ≈ 40.2%); `70 percent + 1 = 179` → 80 (77/256 ≈ 30.1%);
`80 percent = 204` → 120 (25/256 ≈ 9.8%); else (51/256 ≈ 19.9%) heal target by 1/4 max HP
(`GetQuarterMaxHP`) and end. Side effects of the early Stab call: with the Plain Badge (Normal) the badge
boost turns `wCurDamage` 0 into 1 (MISC:203-207) and DamageCalc then *adds* that 1 (EC:3061-3072), so
Present gets +1 damage for a badge-holding player. In Crystal the registers `bc`/`de` are saved around the
Stab call except in link mode (:3-18) — see section 8 for the Gold/Silver bug.

### 6.13 Magnitude (`move_effects/magnitude.asm:1-25`, table `data/moves/magnitude_power.asm:1-9`)
Script `Magnitude` (`effects.asm:1699-1719`): `critical damagestats getmagnitude damagecalc stab
damagevariation checkhit doubleundergrounddamage ...`. `r := BattleRandom()`; first row with
`byte >= r`:

| byte | r range | count/256 | power | magnitude |
|---|---|---|---|---|
| `5 percent + 1` = 13 | 0–13 | 14 | 10 | 4 |
| `15 percent` = 38 | 14–38 | 25 | 30 | 5 |
| `35 percent` = 89 | 39–89 | 51 | 50 | 6 |
| `65 percent + 1` = 166 | 90–166 | 77 | 70 | 7 |
| `85 percent + 1` = 217 | 167–217 | 51 | 90 | 8 |
| `95 percent` = 242 | 218–242 | 25 | 110 | 9 |
| `100 percent` = 255 | 243–255 | 13 | 150 | 10 |

Doubled vs a Digging target (6.19).

### 6.14 Flail / Reversal (`BattleCommand_ConstantDamage.reversal` EC:3209-3300, table `data/moves/flail_reversal_power.asm:1-8`)
Script `Reversal` (`effects.asm:1254-1268`): `constantdamage stab checkhit moveanim ...` — **no
`critical` (cannot crit) and no `damagevariation` (no random spread)**; STAB and type effectiveness apply.
`p := HP × 48` (24-bit product); if `MaxHP <= 255`: `q := floor(p / MaxHP)`; else
`q := floor(floor(p / 4) / floor(MaxHP / 4))` (both shifted right 2 as 8-bit divisor; EC:3232-3249).
`HP_BAR_LENGTH_PX = 48` (`constants/gfx_constants.asm:14`). Power = first row with `threshold >= q`:

| q (48·HP/MaxHP) | power |
|---|---|
| ≤ 1 | 200 |
| ≤ 4 | 150 |
| ≤ 9 | 100 |
| ≤ 16 | 80 |
| ≤ 32 | 40 |
| ≤ 48 | 20 |

Then the power is written into the move struct, `PlayerAttackDamage`/`EnemyAttackDamage` +
`BattleCommand_DamageCalc` run (EC:3268-3298), and the power byte is restored to 1.
Crit: `wCriticalHit` is not rolled here; it is whatever `CriticalText`/`FailureText` left (0), so no crit.

### 6.15 Rollout (`move_effects/rollout.asm:1-91`)
Script `Rollout` (`effects.asm:1538-1558`): `critical damagestats damagecalc stab checkhit rolloutpower
damagevariation ...`. On hit `count++` (1..5, `MAX_ROLLOUT_COUNT = 5`, ends after the 5th); if
`SUBSTATUS_CURLED` (Defense Curl used) `count++` once more; then damage doubled `count − 1` times
(cap `$FFFF`) — i.e. hit n: ×2^(n−1), ×2 more with Defense Curl. Applied after STAB/type, before
random. Miss resets the sequence.

### 6.16 Fury Cutter (`move_effects/fury_cutter.asm:1-53`)
Script `FuryCutter` (`effects.asm:1578-1597`): `... stab checkhit furycutter damagevariation ...`.
`count++` (capped at 5 for the doubling), damage doubled `count − 1` times → ×1, 2, 4, 8, 16; cap `$FFFF`.
Reset on miss.

### 6.17 Pursuit (`move_effects/pursuit.asm:1-23`)
Script (`effects.asm:1728-1747`): `... damagevariation pursuit checkhit ...`. If target is switching
(`wEnemyIsSwitching`/`wPlayerIsSwitching`) damage ×2 (cap `$FFFF`), after the random roll.

### 6.18 Rage (`move_effects/rage.asm`, `BattleCommand_RageDamage` EC:2451-2476, `BuildOpponentRage` EC:2422-2449)
Script `Rage` (`effects.asm:1111-1131`): `critical damagestats damagecalc stab checkhit ragedamage
damagevariation ...`. `ragedamage`: `D := D × (1 + rageCounter)` (repeated 16-bit add, cap `$FFFF`).
`rageCounter` increments (cap 255) each time the Rage user is hit by a move that did not miss
(`buildopponentrage` runs in every damaging script, EC:2422-2449). Applied before random.

### 6.19 Earthquake / Magnitude vs Dig, Gust / Twister vs Fly, Stomp vs Minimize
`BattleCommand_DoubleUndergroundDamage` (EC:5969-5975), `DoubleFlyingDamage` (EC:5962-5967) →
`DoubleDamage` (EC:5977-5988): `D := D << 1`, cap `$FFFF`; `DoubleMinimizeDamage` (EC:6515-6534) same,
keyed on `wEnemyMinimized`/`wPlayerMinimized`. Scripts (`effects.asm:1909,1699,1947,1887,1967`) place
these after `damagevariation`, before `checkhit`. `CheckHit.FlyDigMoves` (EC:1706-1739) lets Gust,
Whirlwind, Thunder, Twister hit Flying targets and Earthquake, Fissure, Magnitude hit Underground ones.

### 6.20 Thunder (`move_effects/thunder.asm:1-16`)
Script `Thunder` (`effects.asm:2012-2032`): `damagecalc thunderaccuracy checkhit effectchance stab
damagevariation`. Rain: accuracy byte := 255 and `CheckHit.ThunderRain` (EC:1741-1749) returns "hit"
before any accuracy/evasion math. Sun: accuracy byte := `50 percent + 1` = 128 (50%). Otherwise 70%
(`moves.asm:103`). No damage change.

### 6.21 Solar Beam
Script (`effects.asm:1989-2010`): `checkcharge ... skipsuncharge charge ...`. Sun skips the charge turn
(EC:6535-6545). Rain: ×0.5 via `WeatherMoveModifiers` (section 1.3.1). No sun damage boost (Grass).

### 6.22 Dream Eater — normal pipeline + `eatdream` (`effects.asm:160-178`). Fails (miss) unless target is
asleep (`CheckHit.DreamEater` EC:1625-1634) or if target has a Substitute (`.DrainSub` EC:1688-1704).
Heals user `max(1, D >> 1)` (`SapHealth` EC:3837-3928), capped at max HP. Same drain for Absorb/Mega
Drain/Giga Drain/Leech Life (`LeechHit`, `effects.asm:55-74`; drain amount uses the damage actually
dealt… note it uses `wCurDamage`, which is not reduced to the target's remaining HP, so overkill still
heals half the computed damage).

### 6.23 Snore / Sleep Talk / Rapid Spin / Future Sight
* Snore (`move_effects/snore.asm`): normal 40-power pipeline; fails if user not asleep (checked after
  damage, before anim).
* Sleep Talk (`move_effects/sleep_talk.asm`): picks a random other move (not two-turn/Bide) and executes
  it via `ResetTurn` — normal damage for that move.
* Rapid Spin: normal pipeline + `clearhazards` (`move_effects/rapid_spin.asm`).
* Future Sight (`move_effects/future_sight.asm:1-77`, script `effects.asm:1930-1945`:
  `checkfuturesight checkobedience usedmovetext doturn damagestats damagecalc futuresight
  damagevariation checkhit moveanimnosub failuretext applydamage ...`). **No `critical` and no `stab`** →
  no crit, no STAB, no type effectiveness, no weather/badge boost. Damage is computed at use time
  (`damagestats damagecalc` with the stats at that moment, stored in `wPlayerFutureSightDamage`,
  `wCurDamage` zeroed, counter := 4). When the counter reaches 1 (`checkfuturesight`), the stored value is
  loaded into `wCurDamage` and the script skips to the `futuresight` command, so `damagevariation` (random)
  and `checkhit` (accuracy 90%) run at landing time. Type immunity is never checked.

### 6.24 Jump Kick / Hi Jump Kick crash (`GetFailureResultText` EC:2197-2253)
On miss, `CheckHit.Miss` keeps `wCurDamage` (EC:1612-1616); the failure text routine, if
`wTypeModifier & mask != 0` (target not immune), deals `max(1, D >> 3)` (1/8 of the would-be damage,
after all multipliers incl. random) to the user.

### 6.25 Confusion self-hit (`HitConfusion` EC:602-630, `HitSelfInConfusion` EC:2864-2898)
`wCriticalHit := 0`; `d := 40`, `e := level`, `bc := user's own boosted Defense` (Reflect doubles it),
`hl := user's boosted Attack`; `TruncateHL_BC`; then `BattleCommand_DamageCalc` only (no Stab, no random)
→ damage = `min(D, 997) + 2` and is subtracted from the user. Bugs (`docs/bugs_and_glitches.md:412`):
DamageCalc reads the *selected move's* effect and the user's held item, so a Normal-type booster (Pink
Bow/Polkadot Bow) gives ×1.1 and a selected Explosion/Self-Destruct halves the defense. Not affected by
Thick Club/Light Ball or Metal Powder (they are not called on this path).

### 6.26 False Swipe (`move_effects/false_swipe.asm:1-46`): after the normal pipeline, if
`D >= targetHP`, `D := targetHP − 1`.

### 6.27 Rampage (Thrash/Petal Dance/Outrage), Trap moves, Sky Attack/Razor Wind/Skull Bash/Fly/Dig,
Twineedle, Thief, Tri Attack, Pay Day, Sacred Fire, Flame Wheel, Fake Out (0 damage), King's Rock
holders: all use the normal pipeline (`effects.asm:811-832, 1216-1235, 1060-1082, 1171-1214, 1862-1885,
868-894, 1430-1450, 1019-1037, 760-779, 1677-1697, 1466-1486`). No damage peculiarities beyond
ordering of `checkhit`.

---

## 7. Held items and species items affecting damage

### 7.1 Type-boost items — `TypeBoostItems` (`data/types/type_boost_items.asm:1-19`), all ×1.1 (`floor(D*110/100)`) in DamageCalc step 10
Pink Bow / Polkadot Bow → Normal; Black Belt → Fighting; Sharp Beak → Flying; Poison Barb → Poison;
Soft Sand → Ground; Hard Stone → Rock; SilverPowder → Bug; Spell Tag → Ghost; Charcoal → Fire; Mystic
Water → Water; Miracle Seed → Grass; Magnet → Electric; TwistedSpoon → Psychic; NeverMeltIce → Ice;
**Dragon Scale** → Dragon (Dragon Fang has `HELD_NONE`, `data/items/attributes.asm:298-299,313`;
`docs/bugs_and_glitches.md:800`); BlackGlasses → Dark; Metal Coat → Steel.
Applies to any move of that type including Struggle (Normal), Hidden Power (its computed type),
Beat Up (Dark), confusion self-hit (bug), Flail/Reversal, Present. Does not apply to fixed-damage moves,
Counter/Mirror Coat, Bide, OHKO (those never run DamageCalc).

### 7.2 Thick Club (Cubone/Marowak) and Light Ball (Pikachu) — `SpeciesItemBoost` (EC:2736-2775)
Species from the **party struct** (`BattlePartyAttr MON_SPECIES` / `wTempEnemyMonSpecies`), item from the
battle mon. Thick Club doubles the *Attack* register on the physical path (EC:2599, 2706-2719); Light
Ball doubles the *Special Attack* register on the special path (EC:2595, 2721-2734). `sla l / rl h`:
16-bit, no cap → values ≥ 1024 wrap after truncation in G/S and Crystal link
(`docs/bugs_and_glitches.md:172`). Applied after the crit boosted/unboosted choice (so it works on crits
either way) and before `TruncateHL_BC`.

### 7.3 Metal Powder (Ditto) — `DittoMetalPowder` (EC:2488-2523)
Checked on the **defender**: party species == DITTO (a Transformed Ditto still counts) and
`GetOpponentItem == METAL_POWDER`. Operates on the 8-bit `c` (defense) and `b` (attack) after truncation:
```
	ld a, c / srl a / add c / ld c, a     ; c := c + c/2  (8-bit)
	ret nc                                ; no overflow -> done (defense x1.5)
	srl b ; (min 1)                       ; overflow: attack /= 2 (min 1)
	scf / rr c                            ; c := (c + 256) / 2  i.e. the 9-bit 1.5x value halved
```
So Def ×1.5 (floor); if that exceeds 255, both sides are halved instead (bug can *raise* damage,
`docs/bugs_and_glitches.md:198`). Applies to Defense or Special Defense depending on the move.

### 7.4 Lucky Punch (Chansey), Stick (Farfetch'd) — crit stage 2 only (2.1). Scope Lens — +1 crit stage.
Focus Band — 30/256 chance (`HELD_FOCUS_BAND` param 30, `attributes.asm:248`, EC:2119-2131) to survive
with 1 HP (via `BattleCommand_FalseSwipe`). Bright Powder — subtracts 20 (`attributes.asm:16`) from the
accuracy byte (EC:1584-1600). King's Rock — flinch only. Berserk Gene — on switch-in: +2 Attack stage
and confusion (CORE:~380-400), no direct damage effect; the Attack stage flows through the tables of
section 5. Quick Claw, Leftovers, berries — no damage effect.

---

## 8. Gold/Silver differences (pokegold vs pokecrystal)

Verified by diff; the damage/stat code is otherwise identical (cosmetic `sla a` vs `add a`, label names,
mobile/Battle Tower code removed).

1. **`TruncateHL_BC` is single-pass** (`pokegold/engine/battle/effect_commands.asm:2625-2656`): no
   `.loop`, no `wLinkMode` check. If either stat > 255, both are `>> 2` once, then `b := l` takes the low
   byte — so an Attack/Defense ≥ 1024 (Thick Club/Light Ball ×2 on a ≥512 stat, or Reflect/Light Screen
   ×2 on a ≥512 stat) wraps mod 256 after the /4. Crystal behaves this way **only** when
   `wLinkMode == LINK_COLOSSEUM` (EC:2644-2655) and otherwise keeps dividing by 4 until both fit
   (`docs/bugs_and_glitches.md:172,198,285`).
2. **Present's registers are clobbered** (`pokegold/engine/battle/move_effects/present.asm:1-3`): Gold
   calls `BattleCommand_Stab` without saving `bc`/`de`. `Stab` leaves `b = wTypeMatchup` (10, or 5 vs
   Rock/Steel), `c` = user's type-2 constant (or low byte of `wCurDamage>>1` = 0 when the user is
   Normal-type and STAB applies), `e` = target's type-2 constant; Present then only sets `d` = power. So
   in G/S DamageCalc runs with Attack = 10 (or 5), Defense = user's type2 index (min 1), Level = target's
   type2 index (`docs/bugs_and_glitches.md:722`; Crystal reproduces this in link battles for
   compatibility, `present.asm:2-18`).
3. **No Battle Tower guards** in `DoBadgeTypeBoosts` (`pokegold/engine/battle/misc.asm:146-152` checks
   only `wLinkMode`) and `BadgeStatBoosts` (`pokegold/engine/battle/core.asm:6534+`). Same results in
   normal/link play.
4. Gold line numbers for the shared routines (for citation): `BattleCommand_Critical` 1123,
   `BattleCommand_Stab` 1217, `BattleCommand_DamageVariation` 1503, `BattleCommand_CheckHit` 1553,
   `BattleCommand_RageDamage` 2463, `DittoMetalPowder` 2500, `BattleCommand_DamageStats` 2536,
   `PlayerAttackDamage` 2543, `CheckDamageStatsCritical` 2658, `SpeciesItemBoost` 2734,
   `EnemyAttackDamage` 2774, `HitSelfInConfusion` 2861, `BattleCommand_DamageCalc` 2897,
   `BattleCommand_ConstantDamage` 3131, `CalcBattleStats` 4780, `BattleCommand_EndLoop` 5161,
   `BattleCommand_OHKO` 5377, `BattleCommand_Recoil` 5627, `DoubleDamage` 5930 (all
   `pokegold/engine/battle/effect_commands.asm`); `DoWeatherModifiers` 52, `DoBadgeTypeBoosts` 146
   (`pokegold/engine/battle/misc.asm`); `ApplyPrzEffectOnSpeed` 6351, `ApplyBrnEffectOnAttack` 6396,
   `ApplyStatLevelMultiplier` 6448, `BadgeStatBoosts` 6534, `BoostStat` 6590
   (`pokegold/engine/battle/core.asm`); `HiddenPowerDamage` 1 (`pokegold/engine/battle/hidden_power.asm`).
   All data tables (`data/battle/*.asm`, `data/types/*.asm`, `data/moves/moves.asm`, `data/moves/effects.asm`,
   `data/moves/*_power.asm`) are identical.

---

## 9. Checklist for a Gen 2 damage calculator

Each rule cites the code that mandates it.

1. Physical/special is by **move type**: type index < 20 (Normal…Steel) physical, ≥ 20 (Fire…Dark) special
   — EC:2543-2545, `constants/type_constants.asm:9-34`. Hidden Power uses its computed type — `hidden_power.asm:94-108`.
2. Stat stages: multiply raw stat by the table in section 5 (note −1 = 0.66), floor, min 1, cap 999 —
   `data/battle/stat_multipliers.asm:8-20`, EC:4817-4886.
3. Player only, non-link: badge stat boosts Zephyr→Atk, Mineral→Def, Plain→Spd, Glacier→SpAtk (SpDef buggy):
   `stat += stat >> 3`, cap 999, applied after stages — CORE:6768-6850.
4. Burn: attacker's Attack `>> 1`, min 1, after stages and badges; Paralysis Speed `>> 2` — CORE:6630-6669.
   (Not applied to the unboosted copy used by stage-ignoring crits.)
5. Crit chance: stage = (Chansey+Lucky Punch or Farfetch'd+Stick ? 2 exclusively : FocusEnergy(1) +
   HighCritMove(2) + ScopeLens(1)); P = {17,32,64,85,128,128,128}[stage]/256 — EC:1120-1206,
   `data/battle/critical_hit_chances.asm`, `data/moves/critical_hit_moves.asm`. Only for moves with power > 0.
6. Crit stat rule: if crit AND defender's defending stage ≥ attacker's attacking stage → use raw stats for
   both (no stages, no badge stat boost, no burn, no Reflect/Light Screen); else use boosted stats and
   screens — EC:2660-2704, 2548-2568.
7. Reflect/Light Screen: defender's (boosted) Def/SpDef ×2 (16-bit, uncapped) — EC:2553-2557, 2582-2586.
8. Thick Club (Cubone/Marowak, physical) / Light Ball (Pikachu, special): attacking stat ×2, uncapped —
   EC:2706-2775. Species = party species (Transform-safe).
9. 8-bit truncation: while (atk > 255 or def > 255): atk >>= 2, def >>= 2, each min 1 (Crystal
   non-link). G/S and Crystal-link: one pass, then atk &= 255, def &= 255 — EC:2614-2658,
   `pokegold/.../effect_commands.asm:2625-2656`.
10. Metal Powder on a Ditto defender (after truncation): `c = c + (c>>1)` 8-bit; if overflow then
    `atk = max(1, atk>>1)`, `c = (c+256)>>1` — EC:2488-2523.
11. Explosion/Self-Destruct: `def = max(1, def >> 1)` on the 8-bit value — EC:2907-2914.
12. Power 0 → damage 0 (except multi-hit/conversion effects); def 0 → 1 — EC:2917-2935.
13. Base: `D = floor(floor((floor(2L/5)+2) * P * A / Def) / 50)` — EC:2943-2981.
14. Type-boost item matching move type: `D = floor(D * 110 / 100)` — EC:2983-3020, `data/types/type_boost_items.asm`,
    `data/items/attributes.asm` (param 10). Dragon *Scale* is the Dragon booster.
15. Crit: `D = min(2D, 65535)` — EC:3108-3129.
16. `D = min(D, 997) + 2` (always ≥ 2, ≤ 999) — EC:3025-3101.
17. Struggle: skip rules 18–21 entirely (no weather, badge type boost, STAB, or type effectiveness) — EC:1216-1219.
18. Weather: Water in rain / Fire in sun `floor(D*15/10)`; Fire in rain / Water in sun `floor(D*5/10)`;
    Solar Beam in rain `floor(D*5/10)`; result min 1, cap 65535 — MISC:52-144, `data/battle/weather_modifiers.asm`.
19. Player only, non-link: if any owned badge (Johto or Kanto) maps to the move type, `D += max(1, D>>3)`,
    cap 65535 — MISC:147-215, `data/types/badge_type_boosts.asm`.
20. STAB: `D += D >> 1` — EC:1264-1289.
21. Type effectiveness: iterate `TypeMatchups` in file order; for each row matching (move type, target
    type1 or type2): `D = floor(D*m/10)`, and if that is 0 set 1; `m = 0` → immune (no damage, "doesn't
    affect"). Skip the two Ghost-immunity rows (Normal, Fighting → Ghost) if the target is Foresighted —
    EC:1291-1364, `data/types/type_matchups.asm:1-118`.
22. Random: if `D >= 2`, `D = floor(D * R / 255)`, R uniform in [217, 255] — EC:1496-1545. Skipped for D ≤ 1.
23. Post-random multipliers (cap 65535): Earthquake/Magnitude vs Dig ×2, Gust/Twister vs Fly ×2, Stomp vs
    Minimized ×2, Pursuit vs switching ×2 — EC:5962-5988, 6515-6534, `pursuit.asm`.
24. Pre-random multipliers (after STAB/type, cap 65535): Rollout ×2^(n−1) (×2 more if curled), Fury
    Cutter ×2^(min(n,5)−1), Rage ×(1+counter) — `rollout.asm`, `fury_cutter.asm`, EC:2451-2476.
    Triple Kick: multiply the *DamageCalc output* by kick number (1,2,3) before STAB — `triple_kick.asm`.
25. Multi-hit counts: 2/3/4/5 hits at 3/8, 3/8, 1/8, 1/8; Double Kick/Bonemerang/Twineedle exactly 2; Triple
    Kick 1/2/3 at 1/3 each; Beat Up = party size. One accuracy roll; crit and random re-rolled per hit —
    EC:5203-5334.
26. Fixed damage (no STAB/type/crit/random; immunity only): Seismic Toss/Night Shade = level; SonicBoom 20;
    Dragon Rage 40; Psywave uniform in [1, floor(1.5L)−1]; Super Fang max(1, HP>>1) — EC:3133-3205.
27. OHKO: fails if immune or user level < target level; acc = 76 + 2·(Lu−Lt) (cap 255) then normal
    accuracy/evasion processing; damage 65535 — EC:5420-5462.
28. Counter/Mirror Coat: 2× the last `wCurDamage` from a physical/special move that hit the user earlier
    this turn; fails vs Ghost/Dark respectively; no random — `counter.asm`, `mirror_coat.asm`.
29. Bide: 2× accumulated damage taken over 2–3 turns; Normal-type immunity only — `bide.asm`.
30. Flail/Reversal: power from `q = floor(48·HP/MaxHP)` (with the /4 quirk when MaxHP > 255):
    ≤1→200, ≤4→150, ≤9→100, ≤16→80, ≤32→40, else 20; then the full base formula and STAB/type, but
    **no crit and no random** — EC:3209-3300, `data/moves/flail_reversal_power.asm`.
31. Hidden Power: power `floor((5·x + (Spc&3))/2) + 31`, type from `4·(Atk&3)+(Def&3)` — `hidden_power.asm`.
32. Return `floor(happiness·10/25)`, Frustration `floor((255−happiness)·10/25)`; 0 power → 0 damage —
    `return.asm`, `frustration.asm`.
33. Present: 40/80/120 at 103/77/25 out of 256, heal 1/4 max HP at 51/256; badge-holding player gets +1 —
    `present.asm`, `data/moves/present_power.asm`. G/S: garbage stats (section 8.2).
34. Magnitude: powers 10/30/50/70/90/110/150 at 14/25/51/77/51/25/13 out of 256 — `magnitude.asm`,
    `data/moves/magnitude_power.asm`.
35. Beat Up: per party mon, `A = base Atk of that mon`, `Def = base Def of target species`, `L = that
    mon's level`, `P = 10`; crit, item and random apply; no STAB/type/weather/badge — `beat_up.asm`.
36. Future Sight: damage computed at use (rules 1–16, no crit), random and accuracy at landing; no
    STAB/type — `future_sight.asm`, `effects.asm:1930-1945`.
37. Recoil moves and Struggle: user loses `max(1, D >> 2)` — EC:5670-5730. Drain moves heal
    `max(1, D >> 1)` — EC:3837-3928. Jump Kick crash: `max(1, D >> 3)` — EC:2197-2253.
38. Confusion self-hit: 40 power, user's own boosted Atk vs boosted Def (Reflect applies), rules 9,
    11–16 only (no STAB/type/random/crit); type-boost item and Explosion halving leak in — EC:602-630,
    2864-2898, 2900-3129.
39. Thunder: 100% (bypasses accuracy) in rain, 50% in sun — `thunder.asm`, EC:1741-1749.
    Solar Beam: no charge in sun, ×0.5 in rain — EC:6535-6545, MISC:78-99.
40. False Swipe/Endure/Focus Band: cap damage at target HP − 1 — `false_swipe.asm`, EC:2107-2168.
41. Hit chance (for KO odds, never for damage): byte = `percent(acc)`; stages via the accuracy table
    (skipped entirely when Foresighted with evasion ≥ accuracy level), min 1, cap 255; Bright Powder −20;
    255 always hits, else `acc/256`; Thunder sun byte 128 / rain sure; OHKO byte 76 + 2·(Lu−Lt) —
    Section 1.5, EC:1546-1846.
