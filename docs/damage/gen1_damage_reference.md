# Generation 1 (Red/Blue/Yellow) Damage Calculation — Verification Reference

Source of truth: `A:\Cygwin\home\scott\pokered` (Red/Blue). Yellow (`A:\Cygwin\home\scott\pokeyellow`) is cited only where it differs (Section 9). All paths below are relative to the pokered root unless prefixed `pokeyellow/`.

Files cited most:
- `engine/battle/core.asm` (abbreviated **core**)
- `engine/battle/effects.asm` (**effects**)
- `engine/battle/move_effects/*.asm`
- `data/battle/stat_modifiers.asm`, `data/types/type_matchups.asm`, `data/battle/critical_hit_moves.asm`, `data/moves/moves.asm`, `data/moves/effects_pointers.asm`, `data/battle/*_effects*.asm`
- `constants/battle_constants.asm`, `constants/type_constants.asm`, `constants/move_effect_constants.asm`, `macros/data.asm`
- `home/math.asm`, `engine/math/multiply_divide.asm`

Conventions: all arithmetic is integer; "floor" means the truncation the hardware routines perform. `Multiply` takes a 24-bit multiplicand (hMultiplicand..+2) and an 8-bit multiplier and yields a 32-bit product (`engine/math/multiply_divide.asm:1-60`); `Divide` takes a b-byte dividend (b=4 in the damage code) and an 8-bit divisor and yields an integer quotient plus remainder (`engine/math/multiply_divide.asm:62-143`). A divisor of 0 hangs the CPU (the subtract-loop at lines 71-88 never carries), which is why several comments in core mention "division by 0 freeze".

The `percent` macro is `x percent == x * $ff / 100` with integer truncation (`macros/data.asm:3`). So `100 percent = 255`, `95 = 242`, `90 = 229`, `85 = 216`, `80 = 204`, `75 = 191`, `70 = 178`, `65 = 165`, `60 = 153`, `55 = 140`, `30 = 76`, `33 = 84`, `25 = 63`, `20 = 51`, `10 = 25`.

---

## 0. Turn flow — where every step sits

Player's move (`core:3073-3269`, `ExecutePlayerMove`); the enemy's flow is identical apart from level-swapping bookkeeping (`core:5457-5665`).

```
core:3123-3127  effect in ResidualEffects1 (Recover, Reflect, Mist, Haze, Transform, Substitute, ...)?
                -> JumpMoveEffect and DONE: no damage calc, no accuracy test, wDamage NOT touched
core:3129-3133  effect in SpecialEffectsCont (Thrash/Petal Dance, trapping moves)? run the effect first, continue
core:3134-3139  PlayerCalcMoveDamage: effect in SetDamageEffects (Super Fang, Seismic Toss/Night Shade/
                SonicBoom/Dragon Rage/Psywave)? -> skip straight to MoveHitTest
core:3140       CriticalHitTest
core:3141-3142  HandleCounterMove   (Counter returns Z -> skips everything below down to HandleIfPlayerMoveMissed)
core:3143       GetDamageVarsForPlayerAttack (picks stats, applies Reflect/Light Screen, crit stat override,
                the >255 /4 scaling, level doubling on crit; zeroes wDamage)
core:3144-3146  CalculateDamage  (Explosion defense halving, OHKO branch, base formula, 997 cap, +2)
                returns Z for 0-power moves -> skip type/random/accuracy entirely
core:3147       AdjustDamageForMoveType (STAB then type chart, per pair, truncating; 0 -> miss)
core:3148       RandomizeDamage  (217..255 / 255, skipped when damage <= 1)
core:3150       MoveHitTest      (Dream Eater sleep check, Swift, Fly/Dig invulnerability, Mist, X Accuracy,
                accuracy*evasion, the 1/256 miss). On miss: wDamage := 0, wMoveMissed := 1
core:3151-3158  missed? -> skip animation (Explosion still animates)
core:3198-3211  Mirror Move / Metronome re-enter at CheckIfPlayerNeedsToChargeUp with the new move
core:3213-3217  effect in ResidualEffects2 (stat stage moves, sleep moves, Bide)? -> JumpMoveEffect, DONE
core:3218-3225  missed? -> PrintMoveFailureText (Jump Kick crash damage lives here), DONE unless EXPLODE_EFFECT
core:3227       ApplyAttackToEnemyPokemon (fixed-damage moves compute here; HP subtraction; substitute)
core:3233-3237  effect in AlwaysHappenSideEffects (drain, explode, Dream Eater, Pay Day, multi-hit,
                recoil, Twineedle, Rage)? -> run it even if the target fainted
core:3238-3242  target fainted? -> return (NOTHING below runs: no Hyper Beam recharge, no side effects)
core:3243       HandleBuildingRage (target's Rage builds)
core:3245-3257  multi-hit loop: decrement wPlayerNumAttacksLeft and jump back to GetPlayerAnimationType
                (damage/crit/random/accuracy are NOT recomputed per hit)
core:3258-3269  everything else (burn/para/freeze side effects, flinch, stat-drop side effects,
                Hyper Beam recharge, confusion side effect...) via JumpMoveEffect unless in SpecialEffects
```

The effect classification arrays: `data/battle/residual_effects_1.asm:2-20`, `residual_effects_2.asm:1-32`, `set_damage_effects.asm:1-6`, `special_effects.asm:1-24`, `always_happen_effects.asm:1-13`. Effect handler pointer table: `data/moves/effects_pointers.asm:1-90`.

Enemy flow notes: `SwapPlayerAndEnemyLevels` (`core:6188-6197`) is called around the calc (`core:5525,5534,5536,5553`) but `GetDamageVarsForEnemyAttack` reads `wEnemyMonLevel` (`core:4245`) between the two swaps, so the enemy's own level is used. Net behaviour is symmetric with the player.

`wDamage` is a single 16-bit variable shared by both sides (`core:4591-4593` comment). Counter and Bide read it, and status moves in ResidualEffects1 leave it stale.

---

## 1. Base damage formula — exact order of operations

### 1.1 Zero wDamage, move power, physical/special split
`GetDamageVarsForPlayerAttack` (`core:4030-4141`), enemy mirror `core:4143-4254`.

```asm
core:4031-4034  wDamage := 0
core:4035-4039  d := move power; if 0 -> return Z (no damage calc)
core:4040-4042  ld a,[wPlayerMoveType] ; cp SPECIAL ; jr nc,.specialAttack   ; types >= SPECIAL are all special
```
`SPECIAL EQU $14` (`constants/type_constants.asm:19`). Physical types: Normal $00, Fighting $01, Flying $02, Poison $03, Ground $04, Rock $05, Bird $06, Bug $07, Ghost $08. Special types: Fire $14, Water $15, Grass $16, Electric $17, Psychic $18, Ice $19, Dragon $1A (`constants/type_constants.asm:4-26`). The single **Special** stat serves as both offensive and defensive stat for special moves (`core:4074-4078` reads `wEnemyMonSpecial`, `core:4086` reads `wBattleMonSpecial`).

### 1.2 Reflect / Light Screen (defender), then crit override, then /4 scaling
Physical (`core:4044-4072`):
```asm
core:4044-4047  bc := defender's current Defense (wEnemyMonDefense, 16-bit, includes stages/badges)
core:4048-4053  if defender HAS_REFLECT_UP: sla c ; rl b     ; bc := 2*Def, 16-bit, NO cap
core:4055-4058  hl := wBattleMonAttack; if no crit -> .scaleStats
core:4059-4072  crit: bc := GetEnemyMonStat(STAT_DEFENSE) (raw recomputed stat)
                      hl := wPartyMonNAttack (raw party stat)
```
Special (`core:4074-4106`) is identical with Special/Light Screen (`core:4079-4083`). The comment at `core:4084-4085` warns that the doubling is uncapped ("weird things will happen ... if a Pokemon with 512 or more Defense has used Reflect").

The crit override happens **after** Reflect doubling and completely replaces `bc`, so a critical hit ignores Reflect/Light Screen (Section 2).

Scaling (`core:4107-4127`):
```asm
core:4108-4110  hl := attacker's offensive stat (16-bit)
core:4111-4112  or b      ; is either high byte nonzero?  (attack >= 256  OR  (doubled) defense >= 256)
core:4114-4117  bc >>= 2  ; defense /4 (16-bit shift, only low byte c survives afterwards)
core:4120-4123  hl >>= 2  ; attack /4
core:4124-4127  if attack == 0 -> attack := 1
core:4129-4130  b := l  ; only the LOW BYTE of the scaled attack is used; c already low byte of scaled defense
```
Rules:
- If **either** stat is >= 256 (after Reflect/LS doubling, after crit override), **both** are `floor(x/4)`; otherwise both are used as-is.
- Attack is clamped to a minimum of 1 after scaling. Defense is **not** (`core:4118` comment: "defensive stat can actually end up as 0, leading to a division by 0 freeze").
- Only 8 bits survive: a scaled value >= 256 (i.e., unscaled >= 1024, which is only reachable via Reflect/LS doubling of a stat >= 512) wraps mod 256.

### 1.3 Level (doubled on crit)
```asm
core:4131-4136  e := wBattleMonLevel ; if crit: sla e   (e := 2*L)
```

### 1.4 CalculateDamage (`core:4299-4465`)
Inputs b=attack (8-bit), c=defense (8-bit), d=power, e=level (`core:4300-4304`).

```asm
core:4306-4311  a := move effect
core:4314-4319  if EXPLODE_EFFECT: c := c >> 1 ; if c == 0 then c := 1        ; Explosion/Selfdestruct
core:4321-4325  TWO_TO_FIVE_ATTACKS_EFFECT / EFFECT_1E: skip the power==0 check
core:4327-4329  OHKO_EFFECT: jp JumpToOHKOMoveEffect (Section 7.2)
core:4331-4334  power == 0 -> ret Z
core:4337-4341  hDividend[0..2] := 0
core:4343-4353  a := e + e (2*L, carry into hDividend+2 as 1 if >= 256) ; hDividend+3 := low byte
core:4355-4361  Divide (4 bytes) by 5                        -> q1 = floor(2L / 5)
core:4363-4365  inc [hl] ; inc [hl]  (8-bit, on hQuotient+3)  -> q1 + 2
core:4369-4371  Multiply by d (power)                        -> p1 = (q1+2) * P
core:4373-4375  Multiply by b (attack)                       -> p2 = p1 * A
core:4377-4380  Divide (4 bytes) by c (defense)              -> q2 = floor(p2 / D)
core:4382-4385  Divide (4 bytes) by 50                       -> q3 = floor(q2 / 50)
```
Cap and floor (`core:4387-4459`):
```asm
core:4388       ; Capped at MAX_NEUTRAL_DAMAGE - MIN_NEUTRAL_DAMAGE: 999 - 2 = 997.
core:4403-4407  hQuotient bytes 0/1 nonzero -> cap
core:4409-4418  hQuotient+2 > 3, or == 3 and hQuotient+3 >= $E6 -> cap   (i.e. q3 >= 998 -> cap)
core:4446-4450  .cap: wDamage := 997
core:4453-4459  wDamage += MIN_NEUTRAL_DAMAGE (2), with carry
```
`MIN_NEUTRAL_DAMAGE EQU 2`, `MAX_NEUTRAL_DAMAGE EQU 999` (`constants/battle_constants.asm:52-54`).

**Exact base damage:**
```
L'  = crit ? 2*L : L
q1  = floor(2*L' / 5)
q3  = floor( floor( (q1 + 2) * P * A / D ) / 50 )       ; the two divisions truncate separately
base = min(q3, 997) + 2                                  ; range [2, 999]
```
where A and D are the (possibly /4-scaled, 8-bit) stats from 1.2. There is no separate "minimum 1" step: the +2 guarantees base >= 2 before type effectiveness. Note `(q1+2)*P*A` is computed as two chained multiplies with a 24-bit multiplicand; the largest possible intermediate ((82)*170*255 = 3,554,700) fits, so no overflow occurs.

### 1.5 STAB (`core:5101-5125`)
```asm
core:5103-5106  move type == attacker type1 or type2? (current in-battle types: Conversion/Transform count)
core:5110-5118  hl := damage ; bc := damage >> 1 (16-bit) ; hl += bc    ; hl = floor(1.5 * damage)
core:5124-5125  set BIT_STAB_DAMAGE in wDamageMultipliers
```
STAB is `damage + floor(damage/2)`, applied once, **before** type effectiveness. Max 999 -> 1498.

### 1.6 Type effectiveness (`core:5127-5187`)
```asm
core:5127-5129  b := move type ; hl := TypeEffects
core:5130-5141  for each (atk, def, mult) row until $FF:
                  if atk == move type and (def == defender type1 or def == defender type2): apply
core:5142-5170  apply: hMultiplier := mult ; multiplicand := wDamage (24-bit)
                  Multiply ; Divide by 10 (4 bytes) ; wDamage := quotient      ; floor(damage * mult / 10)
core:5171-5177  if wDamage == 0 after this row -> wMoveMissed := 1
core:5182-5185  advance to next row, continue scanning
```
Constants (`constants/battle_constants.asm:60-65`): `SUPER_EFFECTIVE=20`, `MORE_EFFECTIVE=15` (unused by the table), `EFFECTIVE=10`, `NOT_VERY_EFFECTIVE=5`, `NO_EFFECT=0`.

Rules:
- The table is scanned **top to bottom** and every matching row is applied in **table order**, each with its own truncation. A mono-type defender (type1 == type2) matches a row only once because one row is applied once per row, not once per type slot.
- Truncation per step means order matters: damage 5 vs a 2x/0.5x pair applied as x2 then x0.5 gives `floor(10*5/10)=5`; as x0.5 then x2 gives `floor(floor(5*5/10)*20/10)=4`.
- 0 after any row (immunity, or 1-2 damage x0.5, or 2-3 damage x0.25) sets `wMoveMissed` -> "doesn't affect" (comment at `core:5173-5174`).
- `wDamageMultipliers` (`core:5147-5153`: keeps the STAB bit, then `add`s the current row's multiplier, overwriting the previous one) only records the **last** matching row. That is the famous Gen 1 "wrong effectiveness message" for dual types (e.g. a net-neutral 2x*0.5x hit prints whichever came last). Damage itself is correct. Also `PrintMoveFailureText` prints "doesn't affect" when the recorded multiplier is 0 (`core:3725-3728`).

Full table in file order (`data/types/type_matchups.asm:3-84`, row n is at line n+2):

| # | atk | def | x | # | atk | def | x | # | atk | def | x |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Water | Fire | 2 | 29 | Grass | Rock | 2 | 57 | Flying | Bug | 2 |
| 2 | Fire | Grass | 2 | 30 | Grass | Flying | .5 | 58 | Flying | Grass | 2 |
| 3 | Fire | Ice | 2 | 31 | Ice | Water | .5 | 59 | Flying | Rock | .5 |
| 4 | Grass | Water | 2 | 32 | Ice | Grass | 2 | 60 | Psychic | Fighting | 2 |
| 5 | Electric | Water | 2 | 33 | Ice | Ground | 2 | 61 | Psychic | Poison | 2 |
| 6 | Water | Rock | 2 | 34 | Ice | Flying | 2 | 62 | Bug | Fire | .5 |
| 7 | Ground | Flying | 0 | 35 | Fighting | Normal | 2 | 63 | Bug | Grass | 2 |
| 8 | Water | Water | .5 | 36 | Fighting | Poison | .5 | 64 | Bug | Fighting | .5 |
| 9 | Fire | Fire | .5 | 37 | Fighting | Flying | .5 | 65 | Bug | Flying | .5 |
| 10 | Electric | Electric | .5 | 38 | Fighting | Psychic | .5 | 66 | Bug | Psychic | 2 |
| 11 | Ice | Ice | .5 | 39 | Fighting | Bug | .5 | 67 | Bug | Ghost | .5 |
| 12 | Grass | Grass | .5 | 40 | Fighting | Rock | 2 | 68 | Bug | Poison | 2 |
| 13 | Psychic | Psychic | .5 | 41 | Fighting | Ice | 2 | 69 | Rock | Fire | 2 |
| 14 | Fire | Water | .5 | 42 | Fighting | Ghost | 0 | 70 | Rock | Fighting | .5 |
| 15 | Grass | Fire | .5 | 43 | Poison | Grass | 2 | 71 | Rock | Ground | .5 |
| 16 | Water | Grass | .5 | 44 | Poison | Poison | .5 | 72 | Rock | Flying | 2 |
| 17 | Electric | Grass | .5 | 45 | Poison | Ground | .5 | 73 | Rock | Bug | 2 |
| 18 | Normal | Rock | .5 | 46 | Poison | Bug | 2 | 74 | Rock | Ice | 2 |
| 19 | Normal | Ghost | 0 | 47 | Poison | Rock | .5 | 75 | Ghost | Normal | 0 |
| 20 | Ghost | Ghost | 2 | 48 | Poison | Ghost | .5 | 76 | **Ghost** | **Psychic** | **0** |
| 21 | Fire | Bug | 2 | 49 | Ground | Fire | 2 | 77 | Fire | Dragon | .5 |
| 22 | Fire | Rock | .5 | 50 | Ground | Electric | 2 | 78 | Water | Dragon | .5 |
| 23 | Water | Ground | 2 | 51 | Ground | Grass | .5 | 79 | Electric | Dragon | .5 |
| 24 | Electric | Ground | 0 | 52 | Ground | Bug | .5 | 80 | Grass | Dragon | .5 |
| 25 | Electric | Flying | 2 | 53 | Ground | Rock | 2 | 81 | Ice | Dragon | 2 |
| 26 | Grass | Ground | 2 | 54 | Ground | Poison | 2 | 82 | Dragon | Dragon | 2 |
| 27 | Grass | Bug | .5 | 55 | Flying | Electric | .5 | | | | |
| 28 | Grass | Poison | .5 | 56 | Flying | Fighting | 2 | | | | |

Gen 1-specific entries a calculator must not "fix": Ghost->Psychic = 0 (line 78, the bug), Bug->Poison = 2 (line 70), Poison->Bug = 2 (line 48), Poison->Ghost = 0.5 (line 50), Ice->Fire neutral (no row), Bug->Ghost 0.5 (line 69). No Dark/Steel/Fairy.

### 1.7 Random factor (`core:5420-5455`)
```asm
core:5421-5427  if wDamage <= 1 -> return (no randomisation of 0 or 1)
core:5437-5441  loop: a := BattleRandom ; rrca ; cp 85 percent + 1 (=217) ; jr c,.loop   -> r in [217,255]
core:5442-5443  Multiply wDamage (24-bit) by r
core:5444-5447  Divide by 255 (4 bytes)
core:5449-5453  wDamage := quotient
```
`damage = floor(damage * r / 255)`, r uniform over the 39 values 217..255 (the `rrca` is a bijection on bytes so the distribution stays uniform). Because the roll is skipped for damage <= 1 and `floor(2*217/255) = 1`, the minimum non-zero final damage is 1; a damage of 1 is never rolled down to 0.

### 1.8 Applying damage (`core:4678-4727` enemy target, `core:4797-4845` player target)
- If damage == 0 -> nothing (`core:4679-4683`).
- Substitute up -> `AttackSubstitute` (`core:4684-4687`, Section 7.16).
- HP -= damage; on underflow HP := 0 **and wDamage := previous HP** (`core:4702-4712`). Recoil/drain/Counter/Bide therefore see damage clamped to the HP actually lost.

### 1.9 Accuracy (`MoveHitTest` `core:5228-5346`, `CalcHitChance` `core:5348-5418`)
Order inside MoveHitTest:
1. Dream Eater: target must be asleep (`core:5241-5246`).
2. Swift: `ret` before anything else — never misses, even against Fly/Dig (`core:5247-5250`).
3. Substitute check for drain/Dream Eater is dead code (`core:5251-5258` comment: "The fix for Swift broke this code").
4. Target INVULNERABLE (Fly/Dig charge turn) -> miss (`core:5259-5261`).
5. Mist blocks stat-down effects (`core:5262-5307`).
6. Attacker USING_X_ACCURACY -> `ret` — always hits, skipping the roll entirely (`core:5288-5290`, `5309-5311`). Combined with OHKO moves this is the "X Accuracy + Fissure" trick.
7. `CalcHitChance` (`core:5313`) then `BattleRandom ; cp b ; jr nc,.moveMissed` (`core:5324-5326`): hit iff `rand < acc`, so **max hit rate is 255/256** (comment `core:5322-5323`).

`CalcHitChance`:
```asm
core:5364-5366  c := 14 - target evasion stage  (reflects around 7)
core:5373-5394  acc := floor(acc * num/den) for attacker accuracy stage, then again for the reflected evasion stage
core:5397-5404  after each step: if 0 -> 1
core:5411-5417  if result > 255 -> 255
```
Move accuracy bytes come from `percent` (Section 0 table): e.g. Thunder 70% = 178/256 = 69.5%, OHKO moves 30% = 76/256 = 29.7%.

Bide never calls `MoveHitTest` (`core:3528`). OHKO moves compare the *modified* in-battle Speeds
(`wBattleMonSpeed` includes stages, the Soul Badge boost and the paralysis quarter) before the
30% roll (`one_hit_ko.asm:8-38`). Implemented in `accuracy.ts` (`hitGen1`); the KO odds in `ko.ts`
use the resulting `acc/256`.

On a miss `wDamage := 0`, `wMoveMissed := 1`, and a trapping move in progress ends (`core:5328-5346`, trapping flag cleared at `5340-5345`).

---

## 2. Critical hits

### 2.1 Chance (`CriticalHitTest` `core:4478-4543`)
```asm
core:4481-4490  species := attacker's CURRENT species (wBattleMonSpecies/wEnemyMonSpecies); b := base Speed
core:4491       srl b                       ; t0 = floor(BS/2)
core:4500-4502  move power == 0 -> return (no crit roll)
core:4505-4514  if GETTING_PUMPED (Focus Energy): srl b  (bug, comment 4507-4508)   ; t1 = t0 >> 1
                else: sla b ; if carry b := $ff                                     ; t1 = 2*t0 (capped)
core:4516-4522  scan HighCriticalMoves
core:4523-4524  not high-crit: srl b                                                 ; b = t1 >> 1
core:4525-4533  high-crit: sla b (cap $ff) ; sla b (cap $ff)                         ; b = 4*t1 capped
core:4534-4539  a := BattleRandom ; rlc a x3 ; cp b ; ret nc                          ; crit iff a < b
core:4540-4541  wCriticalHitOrOHKO := 1
```
`HighCriticalMoves` = Karate Chop, Razor Leaf, Crabhammer, Slash (`data/battle/critical_hit_moves.asm:1-6`).

Resulting threshold b (crit probability = b/256), BS = species base Speed:

| Move | No Focus Energy | Focus Energy (bugged) |
|---|---|---|
| normal | `floor(BS/2)` | `floor(BS/8)` |
| high-crit | `255` if BS >= 64, else `8*floor(BS/2)` | `4*floor(BS/4)` (max 252) |

Focus Energy always **lowers** the rate (x1/4 for normal moves). Since the species header is read via the current species, a Transformed Pokemon uses the copied species' base Speed. Level plays no part.

### 2.2 Effect of a crit
- Level doubled: `sla e` (`core:4136`, `4249`) -> `floor(4L/5)+2` level factor.
- **Both** stats replaced by raw values (`core:4059-4072`, `4088-4106`; enemy side `4172-4185`, `4204-4217`):
  - Player's stat: read directly from the party struct (`wPartyMon1Attack` / `Special`, `Defense`), i.e. the stat as computed by `CalcStat` with DVs and stat exp — **no stat stages, no badge boosts, no burn/paralysis penalty, no Reflect/Light Screen**.
  - Enemy's stat: `GetEnemyMonStat` (`core:4258-4297`) — link battle: from `wEnemyMon1Stats`; otherwise recomputed by `CalcStat` from base stats, the enemy's DVs and **no stat exp** (`ld b,0` at `core:6024` when loading; and `GetEnemyMonStat` passes b=0 at `core:4293`, `home/move_mon.asm:69-71` "consider stat exp?"). Trainer DVs are fixed `$98/$88` (`core:6008-6011`, `constants/battle_constants.asm:78-79`).
- The raw stats then go through the same >255 /4 scaling (`core:4107-4127`), so a crit with a 300 attack vs 100 defense still scales both by 4.
- Reflect/Light Screen are ignored on a crit because the doubled `bc` is overwritten (ordering in `core:4048-4072`).
- A crit is rolled once per move; multi-hit moves reuse it for every hit (Section 7.4). Confusion self-hits force it to 0 (`core:3690`).
- Damage cap is unchanged (997+2).

---

## 3. Badge boosts (`ApplyBadgeStatBoosts` `core:6454-6500`)

```asm
core:6455-6457  link battle -> return (no boosts)
core:6460-6476  bit 0 Boulder -> Attack ; bit 2 Thunder -> Defense ; bit 4 Soul -> Speed ; bit 6 Volcano -> Special
core:6478-6500  stat := stat + (stat >> 3) ; if > 999 -> 999
```
- Exact: `stat += floor(stat / 8)` (so x9/8 rounded down), capped at 999. Applied only to `wBattleMonAttack..Special`, i.e. the **player** only; the enemy never gets badge boosts.
- Applied at: send-out (`core:1659`), level-up (`engine/battle/experience.asm:238`), and **re-applied to all four stats** whenever `StatModifierUpEffect` runs on the player's turn (`effects:496-500`) or `StatModifierDownEffect` runs on the enemy's turn (`effects:686-690`). Those cover: the player's own stat-up moves; X Attack/Defend/Speed/Special (`engine/items/item_effects.asm:1638-1669` calls `StatModifierUpEffect` with `hWhoseTurn := 0`); the enemy's stat-down moves and stat-down side effects (Growl, Screech, Acid, Aurora Beam, Bubblebeam, Psychic, Constrict, Bubble) hitting the player; and Rage building on the player's Pokemon (`HandleBuildingRage` flips the turn to the player and calls `StatModifierUpEffect`, `core:4931-4944`).
- Because the stat that was just changed is recomputed from the unmodified stat (`effects:414-438`, comment `effects:415`: "paralysis and burn penalties, as well as badge boosts are ignored") and then boosted once, while the **other three** stats are boosted again on top of their current values, badge boosts compound: after n such events an untouched boosted stat is roughly `stat*(9/8)^n` (with floors and the 999 cap).

---

## 4. Reflect / Light Screen

- Set by `ReflectLightScreenEffect_` (`engine/battle/move_effects/reflect_light_screen.asm:1-33`), flags `HAS_REFLECT_UP`/`HAS_LIGHT_SCREEN_UP` in BattleStatus3 (`constants/battle_constants.asm:110-111`). No turn counter; cleared by Haze (`move_effects/haze.asm:56-57`) or when the Pokemon leaves.
- Effect: defender's current Defense (Reflect, physical) or Special (Light Screen, special) is doubled 16-bit with no cap immediately before the scaling check (`core:4048-4053`, `4079-4083`).
- Interaction with the /4 rule: the doubled value is what the "either high byte nonzero" test sees (`core:4111-4112`). So Reflect on a Pokemon with Defense >= 128 forces **both** stats through `floor(x/4)`, which changes rounding versus a naive x2. With Def >= 512 the /4 result exceeds 255 and only its low byte is used (comment `core:4084-4085`); 512 exactly yields c = 0 -> divide-by-zero hang.
- Ignored on critical hits (Section 2.2).
- Self-inflicted confusion damage uses `GetDamageVars*Attack` with the user's own Defense copied into the opponent's slot, so it is doubled by the **opponent's** Reflect, not the user's (`core:3675-3695`, `5777-5797`).

---

## 5. Burn (and the paralysis twin)

`HalveAttackDueToBurn` (`core:6326-6363`): 16-bit `Attack >>= 1`, minimum 1; `QuarterSpeedDueToParalysis` (`core:6283-6324`): `Speed >>= 2`, minimum 1. Both operate **in place on the current battle stat** (`wBattleMonAttack`/`wEnemyMonAttack`), which is what `GetDamageVars*Attack` reads. Which Pokemon is affected is chosen by `hWhoseTurn`: turn = player -> the **enemy's** stat, turn = enemy -> the **player's** stat (`core:6328-6331`, `6285-6288`).

When they run:
1. On infliction: burn side effects `effects:243` (player attacking) / `effects:294` (enemy attacking); paralysis side effects `effects:236`/`289`; Thunder Wave/Stun Spore/Glare `move_effects/paralyze.asm:34-35`. Chances: `10 percent + 1` = 26/256 for *_SIDE_EFFECT1, `30 percent + 1` = 77/256 for *_SIDE_EFFECT2 (`effects:213-218`); a move cannot inflict its own-type status on a same-type target (`effects:205-212`) and cannot status an already-statused target (`effects:202-204`).
2. On send-out: `ApplyBurnAndParalysisPenaltiesToPlayer` (`core:1658`, after the unmodified-stat copy at `1654-1657`), enemy `core:1702`.
3. On level-up: `experience.asm:236-238` (recalc from unmodified, penalties, badges).
4. **After every stat-stage change** (`effects:504-506`, `694-698`): `QuarterSpeedDueToParalysis` then `HalveAttackDueToBurn` are called unconditionally for the Pokemon whose turn it is *not*.

Consequences to model:
- Crits ignore burn (raw stat used).
- A stat-stage change to a stat recomputes it from the unmodified stat, discarding the burn/para penalty (`effects:414-438`, `633-658`). Whether it is restored depends on who acted:
  - Player uses a stat-up (incl. X items) while burned: attack recomputed without the burn; the penalty step then targets the **enemy** -> the player's burn halving is **lost**. Symmetrically the enemy's own stat-up loses its burn.
  - Enemy lowers the burned player's Attack (Growl): recomputed, then the player is re-halved -> penalty preserved.
- Because the penalty is applied to the current (already penalised) stat, unrelated stat changes **stack** it: each time the player uses a stat-up, a paralysed enemy's Speed is quartered again and a burned enemy's Attack halved again (down to 1). Each time the enemy uses a stat-down on the player, the player's untouched Speed/Attack are penalised again if statused.

---

## 6. Stat stages

`StatModifierRatios` (`data/battle/stat_modifiers.asm:1-14`), index = stage (1..13, 7 = neutral):

| stage | -6 | -5 | -4 | -3 | -2 | -1 | 0 | +1 | +2 | +3 | +4 | +5 | +6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| num/den | 25/100 | 28/100 | 33/100 | 40/100 | 50/100 | 66/100 | 1/1 | 15/10 | 2/1 | 25/10 | 3/1 | 35/10 | 4/1 |

Note -1 is 66/100 (not 2/3) and -4 is 33/100.

Computation `stat = floor(unmodified * num / den)`:
- `CalculateModifiedStat` (`core:6376-6452`): cap 999 (`core:6430-6440`), then if 0 -> 1 (`core:6441-6449`). Used at level-up and by Transform bookkeeping.
- `StatModifierUpEffect` (`effects:351-506`): stage capped at 13 (`effects:369-373`; a +2 move at +5 stops at +6, `effects:374-382`); if the current stat is already 999 the move prints "Nothing happened" and undoes **one** stage (`effects:407-413`, `508-510` — a +2 move therefore still nets +1 on the counter); otherwise `floor(unmod*num/den)` capped at 999 (`effects:440-449`). Accuracy/evasion stages have no stat to recompute (`effects:384-386`).
- `StatModifierDownEffect` (`effects:539-698`): stage floored at 1 (`effects:590-600`); if the current stat is already 1 -> "Nothing happened" and undo one stage (`effects:627-632`, `700-703`); result floored at 1 (`effects:660-667`). Extra rules: the AI's stat-down moves and side effects have a flat 25% (`rand < 64`) chance to fail in non-link battles (`effects:549-554`); stat-down side effects trigger with `rand < 85` (~33.2%, `effects:558-563`); stat-down moves are blocked by Substitute (`effects:556-557`).
- The unmodified stats live in `wPlayerMonUnmodifiedAttack..` copied at send-out (`core:1654-1657`) and level-up (`experience.asm:229-232`); they include stat exp/DVs but **not** badges or status penalties. Haze copies them back over the battle stats and resets all stages to 7 (`move_effects/haze.asm:2-14`).
- Accuracy/evasion stages use the same table inside `CalcHitChance` (Section 1.9).

---

## 7. Moves with special damage handling

Move data (effect, power, type, accuracy) is `data/moves/moves.asm:14-178`; effect names `constants/move_effect_constants.asm`. Handler dispatch `data/moves/effects_pointers.asm`.

### 7.1 Fixed damage — `SPECIAL_DAMAGE_EFFECT` ($29) and `SUPER_FANG_EFFECT` ($28)
Listed in `SetDamageEffects` -> the whole calc (crit, stats, STAB, **type chart**, random) is skipped and only `MoveHitTest` runs (`core:3135-3139`, `3149-3150`). Damage is set inside `ApplyAttackToEnemyPokemon` (`core:4612-4676`) / `ApplyAttackToPlayerPokemon` (`core:4731-4795`):
- Seismic Toss, Night Shade: `damage = user level` (`core:4643-4650`). No type immunity: Seismic Toss hits Ghosts, Night Shade hits Normals.
- SonicBoom: 20 (`core:4651-4653`, `SONICBOOM_DAMAGE` `constants/battle_constants.asm:57`).
- Dragon Rage: 40 (`core:4654-4656`).
- Psywave (`core:4657-4671`): `b = L + floor(L/2)`; player: random in **[1, b)** (`core:4664-4670`); enemy: random in **[0, b)** so it can deal 0 (`core:4776-4789`, comment `4782-4784`).
- Super Fang: `floor(targetCurrentHP / 2)` (16-bit shift), minimum 1 (`core:4624-4641`). Works on Ghosts.
- All are still subject to accuracy (Psywave 80%, Super Fang 90%, SonicBoom 90%) and to Substitute.

### 7.2 OHKO — `OHKO_EFFECT` ($26): Guillotine, Horn Drill, Fissure
`CalculateDamage` jumps to the effect (`core:4327-4329`, `4467-4471`); handler `engine/battle/move_effects/one_hit_ko.asm:1-38`:
```asm
one_hit_ko.asm:2-7    wDamage := 0 ; wCriticalHitOrOHKO := $ff
one_hit_ko.asm:8-26   compare user's CURRENT Speed (wBattleMonSpeed: stages, paralysis, badges included)
                      with target's; carry (user < target) -> .userIsSlower
one_hit_ko.asm:27-33  user >= target: wDamage := $FFFF ; wCriticalHitOrOHKO := 2
one_hit_ko.asm:34-38  slower: wMoveMissed := 1 (prints "Unaffected")
```
`JumpToOHKOMoveEffect` returns Z when it missed so the type/random/accuracy steps are skipped (`core:4469-4471`, `3145`). When the speed check passes the move continues through `AdjustDamageForMoveType` (so Ground-type Fissure does 0 to Flying, Normal-type Guillotine/Horn Drill 0 to Ghost -> "doesn't affect"; STAB overflows 65535 to 32766 but is still lethal), `RandomizeDamage`, and `MoveHitTest` (30% = 76/256, modified by accuracy/evasion, bypassed by X Accuracy). Damage is clamped to the target's HP in `ApplyDamage*` and breaks a Substitute (`core:4869-4872`).

### 7.3 Counter (`HandleCounterMove` `core:4547-4610`)
Move data: `NO_ADDITIONAL_EFFECT`, power 1, Fighting, 100% (`moves.asm:81`).
```asm
core:4567-4568  not Counter -> return NZ (normal calc proceeds)
core:4571-4573  opponent's selected move is Counter -> miss
core:4574-4576  opponent's selected move has 0 power -> miss
core:4578-4586  opponent's selected move type must be Normal or Fighting, else miss
core:4588-4591  wDamage == 0 -> miss
core:4595-4605  wDamage := 2 * wDamage, capped $FFFF
core:4609       MoveHitTest (so Counter can miss 1/256 and is affected by evasion)
```
Counter returns Z, so `GetDamageVars`/`CalculateDamage`/type/random are all skipped (`core:3141-3142`): it ignores type (hits Ghosts) and cannot crit. It doubles whatever is in the shared `wDamage` — the last damage applied by anyone (clamped to HP lost, or the full amount if it hit a Substitute), including the Counter user's own previous hit if the opponent then used a `ResidualEffects1` move which leaves `wDamage` untouched (comment `core:4591-4593`). The "selected move" checks read the move the opponent picked in the menu, not necessarily the one last executed (comment `core:4548-4553`).

### 7.4 Multi-hit moves
`TwoToFiveAttacksEffect` (`effects:925-969`) handles `TWO_TO_FIVE_ATTACKS_EFFECT`, `ATTACK_TWICE_EFFECT`, `TWINEEDLE_EFFECT` (`effects_pointers.asm:32,47,80`).
- 2-5 hits (DoubleSlap, Comet Punch, Fury Attack, Pin Missile, Spike Cannon, Barrage, Fury Swipes): `r1 = rand & 3; if r1 < 2 -> hits = r1 + 2 else r2 = rand & 3, hits = r2 + 2` (`effects:951-961`) -> P(2)=P(3)=3/8, P(4)=P(5)=1/8.
- Double Kick, Bonemerang: exactly 2 (`effects:948-950`).
- Twineedle: 2 hits, and its effect is rewritten to `POISON_SIDE_EFFECT1` (`effects:966-969`), which then runs once at the end of the move (`core:3258-3268` comment) with `20 percent + 1` = 52/256 (`effects:100-101`).
- The effect runs from `AlwaysHappenSideEffects` after the first hit; subsequent hits loop at `core:3245-3257` re-entering at `GetPlayerAnimationType`. Damage, crit, random roll and accuracy are computed **once** and reused for every hit (comment `core:3251-3252`); the loop stops when the target faints (`core:3238-3242`) or its Substitute breaks (effect nullified, `core:4899-4901`). Each hit triggers Rage building on the target (`core:3243`).

### 7.5 Bide (`BideEffect` `effects:764-789`; unleash `core:3481-3529` player, `core:5856-5905` enemy)
- Start: STORING_ENERGY, accumulator := 0, both move effects := 0, counter := 2 or 3 (`effects:775-786`).
- Each of the user's subsequent turns: accumulator += `wDamage` (the shared variable, so whatever the opponent's last move left there; stale values from `ResidualEffects1` moves are re-added) (`core:3487-3497`).
- Unleash: `wDamage := 2 * accumulator` (16-bit), power := 1 so it is applied, 0 -> miss (`core:3508-3521`); jumps to `HandleIfPlayerMoveMissed`, skipping crit/type/random **and `MoveHitTest`** (`core:3528`): Bide is typeless, ignores Ghost immunity and Fly/Dig invulnerability, and cannot miss.

### 7.6 Self-Destruct / Explosion (`EXPLODE_EFFECT` $07; power 130 / 170, `moves.asm:133,166`)
- Defense halved inside `CalculateDamage` **after** the /4 scaling, 8-bit, minimum 1 (`core:4313-4319`).
- Effect (`effects:175-192`) sets user HP to 0; it is in `AlwaysHappenSideEffects`, and the miss path specifically still runs it (`core:3223-3224`, `5549-5550`, `5623-5624`), so the user faints even on a miss or on a Ghost.

### 7.7 Hyper Beam (`HYPER_BEAM_EFFECT` $50; 150 power, 90%)
`HyperBeamEffect` (`effects:1171-1179`) just sets NEEDS_TO_RECHARGE. It is in none of the special arrays, so it runs only at `core:3258-3265` — **after** the "return if target fainted" check at `core:3238-3242`. Hence: KO -> no recharge; Substitute broken -> effect zeroed (`core:4899-4901`) -> no recharge; miss -> no recharge. The recharge flag is also cleared if the recharging Pokemon flinches (`effects:992`), is frozen by the player's move (`effects:249`; the enemy's freezes do not clear it, comment `effects:298`), or is hit by a trapping move (`effects:1091`). Recharge turn handling `core:3384-3392` / `5727-5735`.

### 7.8 Recoil (`RECOIL_EFFECT` $30): Take Down, Double-Edge, Submission, Struggle
`engine/battle/move_effects/recoil.asm:1-67`: `recoil = floor(wDamage / 4)`; Struggle `floor(wDamage / 2)` (`recoil.asm:15-21`); minimum 1 (`recoil.asm:23-26`). `wDamage` is post-clamp (HP actually lost), but if the hit landed on a Substitute it is the full computed damage (`core:4879-4880`). Runs from `AlwaysHappenSideEffects`, so it happens even when the target faints; it is skipped when the move misses (only EXPLODE_EFFECT survives the miss path, `core:3222-3225`). Recoil is taken directly from HP, never from the user's own Substitute.

### 7.9 Struggle
`RECOIL_EFFECT, 50, NORMAL, 100%` (`moves.asm:178`). It is a normal Normal-type attack: STAB for Normal types, 0 damage vs Ghost (then no recoil because the move "missed"), 1/256 miss, 50% recoil.

### 7.10 Swift (`SWIFT_EFFECT` $11)
Handler is NULL; `MoveHitTest` returns immediately (`core:5247-5250`), before the Fly/Dig check, so it hits semi-invulnerable targets. Still Normal-type: 0 vs Ghost via the type chart.

### 7.11 Dream Eater (`DREAM_EATER_EFFECT` $08) and drains (`DRAIN_HP_EFFECT` $03: Absorb, Mega Drain, Leech Life)
- Dream Eater requires a sleeping target (`core:5241-5245`); Psychic-type, so neutral vs Ghost (Ghost->Psychic is 0 only the other way).
- Heal = `floor(wDamage / 2)`, minimum 1, capped at max HP (`move_effects/drain_hp.asm:2-13`, `39-70`). Uses clamped `wDamage`. Both work against a Substitute because the guard is dead code (`core:5251-5257`).

### 7.12 High-crit moves
Karate Chop, Razor Leaf, Crabhammer, Slash (`data/battle/critical_hit_moves.asm:2-5`). See Section 2.1 for the exact threshold.

### 7.13 Trapping moves (`TRAPPING_EFFECT` $2A): Bind, Wrap, Fire Spin, Clamp
`TrappingEffect` (`effects:1080-1103`) runs before the damage calc (SpecialEffectsCont): sets USING_TRAPPING_MOVE, clears the **target's** recharge, extra turns `r+1` with the same 3/8,3/8,1/8,1/8 distribution (2-5 total turns). Follow-up turns skip the calc entirely and re-apply the stored `wDamage` (`core:3554-3566` "deal damage equal to last hit"); the trapped target cannot move (`core:3365-3372`). A miss on the first turn clears the status (`core:5340-5346`).

### 7.14 Thrash / Petal Dance (`THRASH_PETAL_DANCE_EFFECT` $1B)
2-3 turns (`effects:791-808`); each turn re-enters `PlayerCalcMoveDamage` so damage/crit/random/accuracy are fresh (`core:3540`); then 2-5 turns of confusion (`core:3543-3550`).

### 7.15 Rage (`RAGE_EFFECT` $51; 20 power)
Normal damage each turn (subsequent turns re-enter `PlayerCanExecuteMove` with effect 0, `core:3568-3579`). `HandleBuildingRage` (`core:4913-4953`) raises the Rage user's Attack one stage each time it is hit by any move that reaches `core:3243` (i.e. a non-missed damaging move, per hit for multi-hit moves), via `StatModifierUpEffect` with the turn flipped — triggering the badge/penalty re-application of Section 3/5.

### 7.16 Substitute (`SUBSTITUTE_EFFECT` $4F)
Sub HP = `floor(maxHP/4)` low byte, subtracted from the user (`move_effects/substitute.asm:17-43`). `AttackSubstitute` (`core:4849-4902`): damage >= 256 always breaks it; else 8-bit `subHP -= damage`, break on underflow; `wDamage` is not clamped; when it breaks the attacker's move effect is zeroed (no side effects, no Hyper Beam recharge). Self-confusion damage and Jump Kick crash damage flip the turn and so hit the **opponent's** Substitute (`core:4850-4855`).

### 7.17 Jump Kick / Hi Jump Kick (`JUMP_KICK_EFFECT` $2D)
Handler NULL. On a miss (including 0 damage from the Ghost immunity), `PrintMoveFailureText` applies crash damage `floor(wDamage/8)` with minimum 1 — and since `wDamage` is already 0 on a miss, it is always exactly 1 HP (`core:3740-3773`, comment `3745-3747`).

### 7.18 Confusion self-hit (`HandleSelfConfusionDamage` `core:3672-3714`; enemy `core:5771-5814`)
50% (`rand >= 128`, `core:3427-3429`) to hit itself: power 40, effect 0, type 0 (Normal, but `AdjustDamageForMoveType` is not called so it is effectively typeless — no STAB, no Ghost immunity), crit forced off (`core:3690`), user's current Attack vs user's own current Defense (copied into the opponent's Defense slot, `core:3675-3683`), `GetDamageVars` + `CalculateDamage` only — **no random roll, no accuracy** (comment `core:3696-3697`). The opponent's Reflect doubles the Defense used (Section 4). Applied via `ApplyDamageToPlayerPokemon` with the turn flipped (`core:3706-3714`).

### 7.19 Fly / Dig / charge moves (`CHARGE_EFFECT` $27, `FLY_EFFECT` $2B)
`ChargeEffect` (`effects:998-1030`): first turn sets CHARGING_UP; only Fly (FLY_EFFECT) and Dig (move id check, `effects:1017-1020`) set INVULNERABLE. Second turn is a normal attack. Razor Wind, Solar Beam, Skull Bash, Sky Attack charge without invulnerability.

### 7.20 Pay Day, Twineedle, flinch, status side effects
Not damage-affecting. Flinch chances `10 percent + 1`/`30 percent + 1` (`effects:983-986`); confusion side effect `rand < 25` (`effects:1115-1117`).

---

## 8. Gen 1 quirks worth modelling (summary with citations)

1. **1/256 miss**: `rand < acc` with acc <= 255 (`core:5321-5326`). Bypassed by X Accuracy (`core:5288-5290`), Swift (`core:5247-5250`) and Bide (`core:3528`); Counter still rolls it (`core:4609`).
2. **Special stat** for both offence and defence of special moves (`core:4074-4090`); types >= $14 are special (`core:4040-4042`).
3. **Hyper Beam recharge skipped** on KO / sub break / miss (`core:3238-3242`, `4899-4901`).
4. **Focus Energy quarters** the crit rate (`core:4505-4514`).
5. **Crit ignores every modifier** (stages, badges, burn, Reflect/LS) on both sides and doubles level (`core:4059-4072`, `4136`).
6. **Type effectiveness rounding**: per-row `floor(d*m/10)`; 1 damage x0.5 = 0 = "doesn't affect" (`core:5162-5177`).
7. **Ghost vs Psychic = 0** (`data/types/type_matchups.asm:78`), plus Bug<->Poison 2x, Poison->Ghost 0.5x, Ice->Fire neutral.
8. **Effectiveness message** shows only the last matching row (`core:5146-5150`).
9. **>255 /4 scaling** of both stats, attack min 1, defense may hit 0 (`core:4107-4127`).
10. **Reflect/LS uncapped doubling** feeds the /4 test; >= 512 wraps (`core:4048-4053`, `4084-4085`).
11. **Badge boosts re-applied to all stats** on stat changes involving the player (`effects:496-500`, `686-690`).
12. **Burn/paralysis penalties stack / get lost** on stat changes (`effects:504-506`, `694-698`, `414-415`).
13. **Minimum base damage 2**, random roll skipped at <= 1, so final minimum 1 (`core:4453-4459`, `5421-5427`).
14. **997 cap before type/STAB**; final damage can reach `floor(1.5*999)*4 = 5992` pre-random (`core:4388`).
15. **wDamage shared** between sides; Counter/Bide can use stale or self-inflicted values (`core:4591-4593`, `3487-3497`).
16. **Multi-hit**: one crit/roll for all hits (`core:3251-3252`).
17. **Psywave** enemy range starts at 0 (`core:4782-4784`).
18. **OHKO** uses current in-battle Speed (`one_hit_ko.asm:8-26`), goes through the type chart (immunities apply), 30% base accuracy, X Accuracy bypass.
19. **Explosion defense halving** after /4 scaling, user faints on miss (`core:4313-4319`, `3223-3224`).
20. **Jump Kick crash = 1 HP** always (`core:3745-3747`).
21. **AI stat-down 25% flat fail** in non-link battles (`effects:549-554`).
22. **Struggle** is Normal-type, 50% recoil, no recoil vs Ghost (`moves.asm:178`, `recoil.asm:17-19`).
23. **Enemy stats** use fixed DVs `$98/$88` for trainers and no stat exp (`core:6008-6027`); crit-time raw stats recomputed the same way (`core:4258-4297`).
24. Stat-stage table uses 66/100 for -1 and 33/100 for -4 (`stat_modifiers.asm:5,7`).
25. Divide-by-zero hangs are real (defense 0 after scaling / Reflect 512) — a calculator should flag, not emulate.

---

## 9. Yellow differences

`diff engine/battle/core.asm` and `effects.asm`, plus the data files, between pokered and pokeyellow show **no change to any damage-calculation routine or data**: `GetDamageVarsForPlayerAttack` (pokeyellow `core:4201`), `GetDamageVarsForEnemyAttack` (`4314`), `CalculateDamage` (`4470`), `CriticalHitTest` (`4649`, Focus Energy bug intact), `HandleCounterMove` (`4718`), `ApplyAttackToEnemyPokemon` (`4783`), `AdjustDamageForMoveType` (`5246`), `MoveHitTest` (`5410`), `RandomizeDamage` (`5602`), `QuarterSpeedDueToParalysis` (`6468`), `HalveAttackDueToBurn` (`6511`), `CalculateModifiedStat` (`6561`), `ApplyBadgeStatBoosts` (`6639`), `StatModifierUpEffect` (`effects:387`), `StatModifierDownEffect` (`effects:575`), `TwoToFiveAttacksEffect` (`effects:961`) are byte-for-byte the same logic. `data/moves/moves.asm`, `data/types/type_matchups.asm`, `data/battle/stat_modifiers.asm`, `data/battle/critical_hit_moves.asm`, `home/math.asm`, `engine/math/multiply_divide.asm` are identical.

Differences that exist but do not change damage numbers:
- `AIGetTypeEffectiveness` (AI move scoring only): Lorelei's Dewgong has a 40% chance to ignore type effectiveness (`pokeyellow/engine/battle/core.asm:5392-5402`).
- `FlinchSideEffect`: in link battles Yellow also calls `ClearHyperBeam` before rolling (`pokeyellow/engine/battle/effects.asm:1018-1020`).
- Stadium-compat branches for `FREEZE_SIDE_EFFECT2` and sleep counters gated on `wUnknownSerialFlag_d499` (`pokeyellow/engine/battle/effects.asm:63-72, 224-233, 289-298`); no move uses `FREEZE_SIDE_EFFECT2`.
- Move-selection PP check masks PP Up bits (`and $3f`), Transform PP copy loop, Pikachu/Prof. Oak battle types, VC hooks — none touch damage.

---

## Checklist for calculator (Gen 1)

1. Classify the move: power 0 -> no damage; `SetDamageEffects` (Seismic Toss, Night Shade, SonicBoom, Dragon Rage, Psywave, Super Fang) -> fixed damage, skip everything but accuracy (`core:3135-3139`, `4612-4676`).
2. Physical if move type < $14, else special; special uses Special for both sides (`constants/type_constants.asm:19`, `core:4040-4042`).
3. Attacker stat = current battle stat: `floor(unmod*stage)` capped 999/min 1, then badge `+floor(x/8)` (player only, cap 999), then burn `>>1` (min 1) — with the ordering/stacking history of Sections 3/5 if you model a battle rather than a snapshot (`core:6376-6500`, `6326-6363`).
4. Defender stat likewise; if the defender has Reflect (physical) / Light Screen (special), double it 16-bit uncapped (`core:4048-4053`, `4079-4083`).
5. Crit roll: threshold from Section 2.1 table, chance `b/256`, only if power > 0; high-crit list = Karate Chop, Razor Leaf, Crabhammer, Slash; Focus Energy divides (`core:4478-4543`).
6. On crit: replace both stats by raw computed stats (no stages/badges/burn/screens) and double the level (`core:4059-4072`, `4136`).
7. If attack >= 256 or (screened) defense >= 256: both `>>= 2`; attack min 1; keep only low 8 bits (`core:4107-4130`).
8. Explosion/Self-Destruct: defense `>>= 1`, min 1, after step 7 (`core:4313-4319`).
9. `q1 = floor(2L'/5) + 2`; `q3 = floor(floor(q1*P*A / D) / 50)`; `base = min(q3, 997) + 2` (`core:4343-4459`).
10. STAB if move type equals attacker's current type1 or type2: `base += floor(base/2)` (`core:5101-5125`).
11. Type chart: walk `TypeEffects` rows in file order; for each row matching move type and either defender type, `d = floor(d*m/10)`; use the Gen 1 table verbatim including Ghost->Psychic 0; 0 => "doesn't affect" (`core:5127-5187`, `type_matchups.asm`).
12. If damage >= 2: `d = floor(d*r/255)`, r uniform in 217..255; damage 1 stays 1 (`core:5420-5455`).
13. Accuracy: `acc = percent(move acc)`; `acc = max(1, floor(acc*stageNum/stageDen))` for the attacker's accuracy stage, then for `14 - evasionStage`; cap 255; hit iff `rand < acc` (max 255/256). X Accuracy, Swift, Bide bypass; Fly/Dig target is unhittable except by Swift/Bide (`core:5228-5418`).
14. Apply: clamp to remaining HP (this clamped value drives recoil/drain/Counter/Bide); Substitute takes it first, >= 256 always breaks it (`core:4678-4727`, `4849-4902`).
15. Fixed damage: level / 20 / 40 / Psywave `[1, L+floor(L/2))` (player) or `[0, ...)` (enemy) / `max(1, floor(HP/2))`; all ignore type and crit (`core:4642-4671`, `4624-4641`, `4776-4789`).
16. OHKO: succeed iff user current Speed >= target current Speed, then still subject to type immunity and 30% accuracy; damage = target's HP (`one_hit_ko.asm`, `core:4327-4329`).
17. Counter: `2 * lastDamage` if the opponent's selected move is Normal/Fighting with power > 0 and not Counter and lastDamage > 0; ignores type; rolls accuracy (`core:4547-4610`).
18. Multi-hit: hit count distribution 3/8,3/8,1/8,1/8 (2/3/4/5), Double Kick/Bonemerang/Twineedle = 2; identical damage and crit every hit; stop on faint (`effects:925-969`, `core:3245-3257`).
19. Bide: `2 * sum of wDamage seen on the user's turns`, typeless, unmissable (`core:3481-3529`).
20. Recoil `floor(d/4)` (Struggle `floor(d/2)`), min 1, only if the move hit; drain `floor(d/2)` min 1 capped at max HP (`recoil.asm`, `drain_hp.asm`).
21. Explosion user always faints; Hyper Beam recharge only if the target survived and its Substitute did not break (`core:3223-3224`, `3238-3242`, `4899-4901`).
22. Confusion self-hit: 40 power, typeless, no crit, no random, own Attack vs own Defense (doubled by the opponent's Reflect) (`core:3672-3714`).
23. Jump Kick/Hi Jump Kick miss: exactly 1 HP crash damage (`core:3740-3773`).
24. Trapping moves repeat the first turn's damage without recalculating (`core:3554-3566`); Thrash/Petal Dance recalculate each turn (`core:3531-3541`).
25. Treat Red, Blue and Yellow identically for all of the above (Section 9).
