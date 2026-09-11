# Generation 3 Damage Calculation — Decomp Verification Reference

Primary source: `A:\decomps\pokeemerald` (Emerald). Differences for `A:\decomps\pokefirered` (FRLG) and `A:\decomps\pokeruby` (RS) are in section 6. All line numbers are for the checkouts as of 2026-09-10. All arithmetic is C integer arithmetic on `s32`/`u16` (truncating division toward zero; every operand here is non-negative so truncation == floor).

Notation: `E:` = pokeemerald, `F:` = pokefirered, `R:` = pokeruby. `bsc` = `src/battle_script_commands.c`, `bs1` = `data/battle_scripts_1.s`.

---

## 0. Pipeline overview (which functions run, in what order)

The generic damaging-move script is `BattleScript_EffectHit` (`E:bs1:236-255`):

```
BattleScript_EffectHit::                       @ bs1:236
    jumpifnotmove MOVE_SURF, BattleScript_HitFromAtkCanceler
    jumpifnostatus3 BS_TARGET, STATUS3_UNDERWATER, BattleScript_HitFromAtkCanceler
    orword gHitMarker, HITMARKER_IGNORE_UNDERWATER
    setbyte sDMG_MULTIPLIER, 2                 @ Surf vs Dive target: x2
BattleScript_HitFromAtkCanceler::              @ bs1:241
    attackcanceler
BattleScript_HitFromAccCheck::
    accuracycheck BattleScript_PrintMoveMissed, ACC_CURR_MOVE
BattleScript_HitFromAtkString::
    attackstring
    ppreduce
BattleScript_HitFromCritCalc::                 @ bs1:248
    critcalc                                   @ Cmd_critcalc      bsc:1253
    damagecalc                                 @ Cmd_damagecalc    bsc:1290  (calls CalculateBaseDamage, pokemon.c:3106)
    typecalc                                   @ Cmd_typecalc      bsc:1355  (STAB, then type chart, immunities)
    adjustnormaldamage                         @ Cmd_adjustnormaldamage bsc:1658 (random 85-100%, Focus Band/Endure/False Swipe cap)
BattleScript_HitFromAtkAnimation::             @ bs1:253
    ... healthbarupdate / datahpupdate (Cmd_datahpupdate bsc:1844: clamps to remaining HP, records gHpDealt)
```

So the exact order is:

1. `CalculateBaseDamage` (stats, items, abilities, badges, stages, level formula, burn, screens, spread halving, weather, Flash Fire, +2).
2. `Cmd_damagecalc`: `× gCritMultiplier × gBattleScripting.dmgMultiplier`, then Charge ×2, then Helping Hand ×1.5.
3. `Cmd_typecalc`: STAB ×1.5, then type-chart multipliers one defensive type at a time (each step truncates, each step floors to 1 unless immune), Levitate / Wonder Guard immunity.
4. `Cmd_adjustnormaldamage`: random `100 - (Random() % 16)` percent (85..100), floor to 1, then Endure/Focus Band/False Swipe cap at `hp - 1`.
5. `Cmd_datahpupdate`: actual HP loss is `min(damage, currentHP)` (or Substitute HP).

Per-move state: `gBattleScripting.dmgMultiplier` and `gCritMultiplier` are reset to 1 in `MoveValuesCleanUp` (`E:bsc:3621-3630`) and at the start of each move action in `battle_util.c:92-93`. Scripts raise `sDMG_MULTIPLIER` to 2 for the situational doublings listed in section 4.

---

## 1. `CalculateBaseDamage` line by line

`E:src/pokemon.c:3106-3372`
```c
s32 CalculateBaseDamage(struct BattlePokemon *attacker, struct BattlePokemon *defender, u32 move, u16 sideStatus, u16 powerOverride, u8 typeOverride, u8 battlerIdAtk, u8 battlerIdDef)
```
Return value is `s32 damage + 2`. All intermediate stats are `u16`; `damage`/`damageHelper` are `s32`.

Helper macro (`E:pokemon.c:3100-3104`):
```c
#define APPLY_STAT_MOD(var, mon, stat, statIndex)                                   \
{                                                                                   \
    (var) = (stat) * (gStatStageRatios)[(mon)->statStages[(statIndex)]][0];         \
    (var) /= (gStatStageRatios)[(mon)->statStages[(statIndex)]][1];                 \
}
```
Stat stage table `gStatStageRatios[13][2]` (`E:pokemon.c:1868-1883`):
```
stage: -6 {10,40}  -5 {10,35}  -4 {10,30}  -3 {10,25}  -2 {10,20}  -1 {10,15}
        0 {10,10}  +1 {15,10}  +2 {20,10}  +3 {25,10}  +4 {30,10}  +5 {35,10}  +6 {40,10}
```
i.e. `stat * num / den` with a single truncation (2/8, 2/7, 2/6, 2/5, 2/4, 2/3, 1, 3/2, 2, 5/2, 3, 7/2, 4). Note the numerator is applied first, then the division (`stat*10/15`, not `stat*2/3`; same result).

### Step order inside the function

| # | Lines | Operation (exact C) | Notes |
|---|---|---|---|
| 1 | 3118-3121 | `gBattleMovePower = powerOverride ? powerOverride : gBattleMoves[move].power` | `powerOverride` = `gDynamicBasePower` (Flail, Return, Magnitude, Hidden Power, Low Kick, Eruption, Rollout, Fury Cutter, Triple Kick, Present). |
| 2 | 3123-3127 | `type = typeOverride ? (typeOverride & DYNAMIC_TYPE_MASK) : gBattleMoves[move].type` | `DYNAMIC_TYPE_MASK = 0x3F` (`E:include/battle.h:454`). Dynamic type set by Hidden Power / Weather Ball. |
| 3 | 3129-3132 | `attack = attacker->attack; defense = defender->defense; spAttack = ...; spDefense = ...` | These are the in-battle stat values (level/IV/EV/nature already applied, no stat stages). |
| 4 | 3134-3156 | Read attacker & defender hold effect + param (Enigma Berry uses `gEnigmaBerries[]`). | |
| 5 | 3158-3159 | `if (ability == HUGE_POWER \|\| PURE_POWER) attack *= 2;` | |
| 6 | 3161-3168 | Badge boosts, each `(110 * stat) / 100`: BADGE01→attacker `attack`; BADGE05→defender `defense`; BADGE07→attacker `spAttack` AND defender `spDefense`. | See `ShouldGetStatBadgeBoost` below. Emerald: Stone / Balance / Mind badges. |
| 7 | 3170-3182 | Type-boost hold item: loop over `sHoldEffectToType` (`E:pokemon.c:1919-1938`); if `attackerHoldEffect` matches and `type` matches: `IS_TYPE_PHYSICAL(type) ? attack = attack*(param+100)/100 : spAttack = spAttack*(param+100)/100` | param = 10 for all 17 type items (`E:src/data/items.h`, e.g. `[ITEM_SILK_SCARF]` at 2665) → ×110/100. **Sea Incense param = 5** (`items.h:2703`) → ×105/100. Only the attacker's item. Break after first match. |
| 8 | 3185-3186 | `if (attackerHoldEffect == HOLD_EFFECT_CHOICE_BAND) attack = (150 * attack) / 100;` | Physical `attack` only (irrelevant for special moves). |
| 9 | 3187-3190 | Soul Dew: attacker Latias/Latios `spAttack = 150*spAttack/100`; defender Latias/Latios `spDefense = 150*spDefense/100`. Disabled when `BATTLE_TYPE_FRONTIER`. | |
| 10 | 3191-3192 | Deep Sea Tooth + Clamperl: `spAttack *= 2` | |
| 11 | 3193-3194 | Deep Sea Scale + Clamperl (defender): `spDefense *= 2` | |
| 12 | 3195-3196 | Light Ball + Pikachu: `spAttack *= 2` | Gen 3: Sp. Atk only. |
| 13 | 3197-3198 | Metal Powder + Ditto (defender): `defense *= 2` | Physical Defense only; no Transform check. |
| 14 | 3199-3200 | Thick Club + Cubone/Marowak: `attack *= 2` | |
| 15 | 3203-3204 | Thick Fat (defender) and `type == FIRE \|\| type == ICE`: `spAttack /= 2` | Only `spAttack` is halved (Fire/Ice are always special in gen 3). |
| 16 | 3205-3206 | Hustle: `attack = (150 * attack) / 100` | |
| 17 | 3207-3210 | Plus with Minus anywhere on field, or Minus with Plus: `spAttack = (150 * spAttack) / 100` | `ABILITY_ON_FIELD2` = `AbilityBattleEffects(ABILITYEFFECT_FIELD_SPORT, ...)` (`E:include/battle_util.h:38`) whose default case (`E:battle_util.c:3114-3123`) scans all battlers' `ability` **without an HP check**; either side counts. |
| 18 | 3211-3212 | Guts and `attacker->status1 != 0`: `attack = (150 * attack) / 100` | Any status1 (sleep/poison/burn/freeze/paralysis/toxic). |
| 19 | 3213-3214 | Marvel Scale (defender) and `defender->status1 != 0`: `defense = (150 * defense) / 100` | |
| 20 | 3215-3216 | Mud Sport active (any battler has `STATUS3_MUDSPORT`, `E:battle_util.c:3100-3106`) and `type == ELECTRIC`: `gBattleMovePower /= 2` | |
| 21 | 3217-3218 | Water Sport active and `type == FIRE`: `gBattleMovePower /= 2` | |
| 22 | 3219-3226 | Overgrow/Blaze/Torrent/Swarm: `type` matches and `attacker->hp <= (attacker->maxHP / 3)`: `gBattleMovePower = (150 * gBattleMovePower) / 100` | Threshold uses integer `maxHP / 3`. |
| 23 | 3229-3230 | `if (gBattleMoves[gCurrentMove].effect == EFFECT_EXPLOSION) defense /= 2;` | Uses `gCurrentMove`, not `move`. |
| 24 | 3232 | `if (IS_TYPE_PHYSICAL(type))` — `type < TYPE_MYSTERY (9)` (`E:include/battle.h:466`) | Physical: Normal 0, Fighting 1, Flying 2, Poison 3, Ground 4, Rock 5, Bug 6, Ghost 7, Steel 8. Special (`type > 9`): Fire 10, Water 11, Grass 12, Electric 13, Psychic 14, Ice 15, Dragon 16, Dark 17. (`E:include/constants/pokemon.h:6-23`) |
| 24a | 3234-3242 | Attack stage: crit && `statStages[ATK] > 6` → `APPLY_STAT_MOD(damage, attacker, attack, STAT_ATK)`; crit && stage ≤ 6 → `damage = attack` (negative stages ignored); non-crit → always apply. | |
| 24b | 3245 | `damage = damage * gBattleMovePower;` | |
| 24c | 3246 | `damage *= (2 * attacker->level / 5 + 2);` | `2*level/5` truncated first. |
| 24d | 3248-3257 | Defense stage: crit && `statStages[DEF] < 6` → apply (negative kept); crit && stage ≥ 6 → `damageHelper = defense` (positive ignored); non-crit → apply. | |
| 24e | 3259 | `damage = damage / damageHelper;` | |
| 24f | 3260 | `damage /= 50;` | |
| 24g | 3263-3264 | `if ((status1 & STATUS1_BURN) && ability != ABILITY_GUTS) damage /= 2;` | Applied to *damage*, after /50. Guts cancels burn halving (and still gets ×1.5 from step 18). |
| 24h | 3267-3273 | Reflect on defender side and `gCritMultiplier == 1`: doubles with `CountAliveMonsInBattle(BATTLE_ALIVE_DEF_SIDE) == 2` → `damage = 2 * (damage / 3)`; otherwise `damage /= 2`. | **Gen 3 Reflect is ×1/2 in singles, ×2/3 in doubles (only when both defenders alive).** Crits ignore it. |
| 24i | 3276-3277 | Doubles and `gBattleMoves[move].target == MOVE_TARGET_BOTH` and 2 alive on defending side: `damage /= 2` | `MOVE_TARGET_BOTH = 8` (`E:include/battle.h:50`). **`MOVE_TARGET_FOES_AND_ALLY` (32: Earthquake, Magnitude, Explosion, Self-Destruct) is NOT halved in gen 3.** |
| 24j | 3280-3281 | `if (damage == 0) damage = 1;` | Physical branch only. |
| 25 | 3284-3285 | `if (type == TYPE_MYSTERY) damage = 0;` | Returns 2 (0 + 2). Not reachable for real damaging moves. |
| 26 | 3287-3369 | Special branch: identical 24a-24f with `spAttack`/`spDefense`/`STAT_SPATK`/`STAT_SPDEF` (3289-3315); Light Screen exactly like Reflect (3318-3324); spread halving (3327-3328). **No burn check** and **no `damage==0 → 1` floor** in the special branch. |
| 26a | 3331 | `if (WEATHER_HAS_EFFECT2)` — no Cloud Nine / Air Lock among all battlers (no HP check, `E:include/battle_util.h:48`). | |
| 26b | 3334-3345 | `if (gBattleWeather & B_WEATHER_RAIN_TEMPORARY)`: Fire `damage /= 2`; Water `damage = (15 * damage) / 10`. | Drizzle and overworld rain set `RAIN_TEMPORARY \| RAIN_PERMANENT` (`E:battle_util.c:2486, 2521`), Rain Dance sets `RAIN_TEMPORARY` (`E:bsc:6690`), so the TEMPORARY-only test is always satisfied when it rains. |
| 26c | 3348-3349 | `if ((gBattleWeather & (RAIN \| SANDSTORM \| HAIL)) && gCurrentMove == MOVE_SOLAR_BEAM) damage /= 2;` | Solar Beam halved in any non-sun weather (applied after the rain/water step — Solar Beam is Grass so rain step never touches it). |
| 26d | 3352-3363 | `if (gBattleWeather & B_WEATHER_SUN)`: Fire `damage = (15 * damage) / 10`; Water `damage /= 2`. | |
| 26e | 3367-3368 | `if ((gBattleResources->flags->flags[battlerIdAtk] & RESOURCE_FLAG_FLASH_FIRE) && type == TYPE_FIRE) damage = (15 * damage) / 10;` | Flag set when the holder is hit by a Fire move (`E:battle_util.c:2692-2700`); persists until switch-out. Applied **outside** the weather guard, **after** weather. |
| 27 | 3371 | `return damage + 2;` | The +2 is applied after everything above and before crit/STAB/type/random. |

**Sandstorm Rock Sp. Def boost: absent** (no code anywhere in `CalculateBaseDamage`; sandstorm only appears in the Solar Beam check). Hail: only the Solar Beam check.

`ShouldGetStatBadgeBoost` (`E:pokemon.c:3407-3419`):
```c
if (gBattleTypeFlags & (BATTLE_TYPE_LINK | BATTLE_TYPE_EREADER_TRAINER | BATTLE_TYPE_RECORDED_LINK | BATTLE_TYPE_FRONTIER)) return FALSE;
else if (GetBattlerSide(battler) != B_SIDE_PLAYER) return FALSE;
else if (gBattleTypeFlags & BATTLE_TYPE_TRAINER && gTrainerBattleOpponent_A == TRAINER_SECRET_BASE) return FALSE;
else if (FlagGet(badgeFlag)) return TRUE;
```
Emerald applies badge boosts in wild AND trainer battles (player's mons only). Badge flags: `FLAG_BADGE01_GET`..`08` = Hoenn badges 1..8 (`E:include/constants/flags.h:1359-1366`); 01 = Stone (Attack), 05 = Balance (Defense), 07 = Mind (Sp. Atk & Sp. Def). (Badge 03 Dynamo / speed is applied in the speed calc, not here.)

Sanity: crit stage handling is the classic "crit ignores attacker's negative stages and defender's positive stages"; it does NOT ignore burn (24g runs regardless), badge boosts, items, or abilities.

---

## 2. After `CalculateBaseDamage`

### 2.1 `Cmd_damagecalc` (`E:bsc:1290-1303`)
```c
gBattleMoveDamage = CalculateBaseDamage(&gBattleMons[gBattlerAttacker], &gBattleMons[gBattlerTarget], gCurrentMove,
                                        sideStatus, gDynamicBasePower, gBattleStruct->dynamicMoveType, gBattlerAttacker, gBattlerTarget);
gBattleMoveDamage = gBattleMoveDamage * gCritMultiplier * gBattleScripting.dmgMultiplier;   // 1296
if (gStatuses3[gBattlerAttacker] & STATUS3_CHARGED_UP && gBattleMoves[gCurrentMove].type == TYPE_ELECTRIC)
    gBattleMoveDamage *= 2;                                                                  // 1298-1299
if (gProtectStructs[gBattlerAttacker].helpingHand)
    gBattleMoveDamage = gBattleMoveDamage * 15 / 10;                                         // 1300-1301
```
- `gCritMultiplier` ∈ {1, 2}. `dmgMultiplier` ∈ {1, 2} (script `setbyte sDMG_MULTIPLIER, 2` / `doubledamagedealtifdamaged` / `setweatherballtype`).
- Charge checks the move's **base** type (`gBattleMoves[].type`), not dynamic type.
- Order: crit·multiplier → Charge → Helping Hand.

### 2.2 `Cmd_typecalc` (`E:bsc:1355-1425`)
```c
if (gCurrentMove == MOVE_STRUGGLE) { gBattlescriptCurrInstr++; return; }          // 1360-1364: Struggle: no STAB, no type chart (hits Ghosts)
GET_MOVE_TYPE(gCurrentMove, moveType);                                            // dynamic type if set (Hidden Power / Weather Ball)
if (IS_BATTLER_OF_TYPE(gBattlerAttacker, moveType)) {                             // 1369-1373  STAB
    gBattleMoveDamage = gBattleMoveDamage * 15;
    gBattleMoveDamage = gBattleMoveDamage / 10;
}
if (target ability == ABILITY_LEVITATE && moveType == TYPE_GROUND) { ... MOVE_RESULT_MISSED | DOESNT_AFFECT_FOE ... }   // 1375-1383
else {
    while (TYPE_EFFECT_ATK_TYPE(i) != TYPE_ENDTABLE) {                            // 1386-1405
        if (TYPE_EFFECT_ATK_TYPE(i) == TYPE_FORESIGHT) {
            if (gBattleMons[gBattlerTarget].status2 & STATUS2_FORESIGHT) break;   // Foresight: stop before Ghost-immunity rows
            i += 3; continue;
        }
        else if (TYPE_EFFECT_ATK_TYPE(i) == moveType) {
            if (TYPE_EFFECT_DEF_TYPE(i) == types[0]) ModulateDmgByType(TYPE_EFFECT_MULTIPLIER(i));
            if (TYPE_EFFECT_DEF_TYPE(i) == types[1] && types[0] != types[1]) ModulateDmgByType(TYPE_EFFECT_MULTIPLIER(i));
        }
        i += 3;
    }
}
// Wonder Guard 1409-1418
```
`ModulateDmgByType` (`E:bsc:1321-1353`):
```c
gBattleMoveDamage = gBattleMoveDamage * multiplier / 10;       // multiplier: 0, 5, or 20
if (gBattleMoveDamage == 0 && multiplier != 0) gBattleMoveDamage = 1;
```
- STAB is applied **before** type effectiveness, with its own truncation.
- Each defensive type is a separate `*mult/10` step with truncation (so 4× = `(((d*20)/10)*20)/10`, ¼× = `((d*5)/10*5)/10`). Each non-immune step floors to 1.
- Matching order is the table order (section 5), so for a dual-typed target the multiplier steps come in the table's row order for that attacking type, not type1-then-type2 (each row is tested against both slots).
- Wonder Guard (1409-1418): if target has Wonder Guard, the move is not a charge turn (`AttacksThisTurn()==2`, `E:bsc:8221-8240`), the result is not super-effective (or is both SE and NVE flagged), and the move has power → `MOVE_RESULT_MISSED` (no damage).
- Volt Absorb / Water Absorb / Flash Fire immunities happen earlier in `attackcanceler` via `AbilityBattleEffects(ABILITYEFFECT_ABSORBING)` (`E:battle_util.c:2660-2725`): Volt/Water Absorb require `gBattleMoves[move].power != 0`; Flash Fire triggers on any Fire move (power or not) unless the holder is frozen.
- `Cmd_typecalc2` (`E:bsc:4500-4594`) is the flag-only variant (no damage modification) used by Counter/Mirror Coat/Rollout/Brick Break; `TypeCalc`/`AI_TypeCalc` (`E:bsc:1536-1656`) are the AI variants.

### 2.3 `Cmd_adjustnormaldamage` (`E:bsc:1658-1699`) and `ApplyRandomDmgMultiplier` (`E:bsc:1639-1652`)
```c
u16 rand = Random();
u16 randPercent = 100 - (rand % 16);          // 85..100 inclusive, uniform
if (gBattleMoveDamage != 0) {
    gBattleMoveDamage *= randPercent;
    gBattleMoveDamage /= 100;
    if (gBattleMoveDamage == 0) gBattleMoveDamage = 1;
}
```
Then (1670-1698): Focus Band roll `Random() % 100 < param` (param 10, `items.h`); if target has no Substitute and (move effect is `EFFECT_FALSE_SWIPE` or target endured or Focus Band fired) and `hp <= damage` → `damage = hp - 1`.

`Cmd_adjustnormaldamage2` (1701-1741): same minus the False Swipe check (used by Future Sight hit). `Cmd_adjustsetdamage` (5861-5899): same cap logic **without** the random roll (used by fixed-damage moves).

**Random is applied last, after STAB and type effectiveness.**

### 2.4 `Cmd_datahpupdate` (`E:bsc:1844-1986`)
`gHpDealt = min(damage, hp)` (1917-1925); with a Substitute, `gHpDealt = min(damage, substituteHP)` (1866-1879). Records `physicalDmg`/`specialDmg` for Counter/Mirror Coat based on `IS_TYPE_PHYSICAL(moveType)` (1938-1966); for Hidden Power the **base** Normal type is used (`F_DYNAMIC_TYPE_IGNORE_PHYSICALITY`, 1852-1858), so Hidden Power always counts as physical for Counter. Bide accumulates raw `gBattleMoveDamage` (1912).

---

## 3. Critical hits

`Cmd_critcalc` (`E:bsc:1253-1288`), table `sCriticalHitChance[] = {16, 8, 4, 3, 2}` (`E:bsc:606`).
```c
critChance  = 2 * ((status2 & STATUS2_FOCUS_ENERGY) != 0)
            + (effect == EFFECT_HIGH_CRITICAL)
            + (effect == EFFECT_SKY_ATTACK)
            + (effect == EFFECT_BLAZE_KICK)
            + (effect == EFFECT_POISON_TAIL)
            + (holdEffect == HOLD_EFFECT_SCOPE_LENS)
            + 2 * (holdEffect == HOLD_EFFECT_LUCKY_PUNCH && species == SPECIES_CHANSEY)
            + 2 * (holdEffect == HOLD_EFFECT_STICK && species == SPECIES_FARFETCHD);    // 1267-1274
if (critChance >= 5) critChance = 4;                                                       // 1276-1277
if ((target ability != BATTLE_ARMOR && != SHELL_ARMOR)
 && !(gStatuses3[attacker] & STATUS3_CANT_SCORE_A_CRIT)     // never set anywhere in vanilla (only read here)
 && !(gBattleTypeFlags & (BATTLE_TYPE_WALLY_TUTORIAL | BATTLE_TYPE_FIRST_BATTLE))
 && !(Random() % sCriticalHitChance[critChance]))
    gCritMultiplier = 2; else gCritMultiplier = 1;                                          // 1279-1285
```
- Stage → probability: 0: 1/16, 1: 1/8, 2: 1/4, 3: 1/3, 4: 1/2.
- Focus Energy = +2 stages. Scope Lens +1. Lucky Punch (Chansey) +2. Stick (Farfetch'd) +2. High-crit move effect +1.
- `EFFECT_HIGH_CRITICAL` moves (`E:src/data/battle_moves.h`): Karate Chop, Razor Leaf, Crabhammer, Slash, Aeroblast, Cross Chop, Air Cutter, Leaf Blade. Plus Sky Attack (`EFFECT_SKY_ATTACK`), Blaze Kick (`EFFECT_BLAZE_KICK`), Poison Tail (`EFFECT_POISON_TAIL`).
- Crit effect: `× 2` in `Cmd_damagecalc` (`E:bsc:1296`); inside `CalculateBaseDamage` a crit ignores the attacker's *negative* Atk/SpA stages and the defender's *positive* Def/SpD stages (`E:pokemon.c:3234-3242, 3248-3257, 3289-3297, 3303-3312`), and ignores Reflect/Light Screen (`3267`, `3318`). Burn halving, badge boosts, items and abilities still apply on a crit.
- Beat Up crits: the script doubles via `manipulatedamage DMG_DOUBLED` when `gCritMultiplier == 2` (`E:bs1:1951-1953`), since Beat Up does not go through `damagecalc`.
- Future Sight / Doom Desire: no `critcalc` is run at set-up or on hit (`E:bs1:1881-1890`, `3508-3535`) → never crit; `gCritMultiplier` is 1 at set-up so stage rules are the non-crit ones.

---

## 4. Moves with special damage handling

Move → script mapping table: `gBattleScriptsForMoveEffects` (`E:bs1:20-234`). Move data: `E:src/data/battle_moves.h` (struct `BattleMove` `E:include/pokemon.h:327-338`: effect, power, type, accuracy, pp, secondaryEffectChance, target, priority, flags). Full effect constant list is at the end of this section.

Unless stated, "normal pipeline" = `critcalc, damagecalc, typecalc, adjustnormaldamage`.

### 4.1 Fixed damage (no `damagecalc`; `typecalc` is run only for immunity flags then SE/NVE flags cleared; damage then overwritten; `adjustsetdamage` = no random)
| Move | Effect | Script | Damage |
|---|---|---|---|
| Seismic Toss, Night Shade | `EFFECT_LEVEL_DAMAGE` | `E:bs1:1195` | `Cmd_dmgtolevel` (`E:bsc:7926-7930`): `damage = attacker level`. Typecalc first → Night Shade vs Normal / Seismic Toss vs Ghost = immune (no Foresight → still immune... Foresight removes it). |
| Sonic Boom | `EFFECT_SONICBOOM` | `E:bs1:1720` | `setword gBattleMoveDamage, 20`. Ghost immune. |
| Dragon Rage | `EFFECT_DRAGON_RAGE` | `E:bs1:819` | `setword gBattleMoveDamage, 40`. |
| Psywave | `EFFECT_PSYWAVE` | `E:bs1:1206` | `Cmd_psywavedamageeffect` (`E:bsc:7932-7941`): `while ((r = Random() % 16) > 10);  r *= 10;  damage = level * (r + 50) / 100` → level×{0.5,0.6,...,1.5} (11 outcomes), truncated. |
| Super Fang | `EFFECT_SUPER_FANG` | `E:bs1:809` | `Cmd_damagetohalftargethp` (`E:bsc:7577-7583`): `damage = target hp / 2; if 0 → 1`. Ghost immune. |
| Endeavor | `EFFECT_ENDEAVOR` | `E:bs1:2479` | `Cmd_setdamagetohealthdifference` (`E:bsc:9366-9377`): fails if `target hp <= attacker hp`, else `damage = target hp - attacker hp`. Ghost immune. |
| Counter | `EFFECT_COUNTER` | `E:bs1:1217` | `Cmd_counterdamagecalculator` (`E:bsc:7943-7967`): `damage = gProtectStructs[attacker].physicalDmg * 2` (last physical HP actually lost this turn from an opponent; Follow Me redirect). Then `typecalc2` (flags only: Ghost immune) + `adjustsetdamage`. |
| Mirror Coat | `EFFECT_MIRROR_COAT` | `E:bs1:1801` | `Cmd_mirrorcoatdamagecalculator` (`E:bsc:7969-7990`): `specialDmg * 2`. Dark immune via typecalc2. |
| Bide | `EFFECT_BIDE` | `E:bs1:573`, `BattleScript_BideAttack` `E:bs1:3292` | Stores 2 turns (`Cmd_setbide` `E:bsc:7121-7129`); damage accumulates in `gBideDmg` (`E:bsc:1912`, raw `gBattleMoveDamage` incl. overkill); unleash `= gBideDmg * 2` (`E:battle_util.c:2218-2221`). Script: `typecalc` (immunity only; Ghost immune), `bicbyte SE\|NVE`, `copyword gBattleMoveDamage, sBIDE_DMG`, `adjustsetdamage`. No STAB/type multiplier. |
| OHKO (Fissure, Guillotine, Horn Drill, Sheer Cold) | `EFFECT_OHKO` | `E:bs1:762` | `Cmd_tryKO` (`E:bsc:7490-7575`): Sturdy blocks; `chance = accuracy + (atkLevel - defLevel)`; hits if `Random()%100 + 1 < chance` and `atkLevel >= defLevel` (Lock-On from this attacker: auto-hit if level ok). Damage = target hp (or hp-1 with Endure/Focus Band). `typecalc` first → type immunities apply (Fissure vs Flying/Levitate, Sheer Cold... no Ice immunity in gen 3). |

### 4.2 Multi-hit
- `EFFECT_MULTI_HIT` (Double Slap, Comet Punch, Fury Attack, Pin Missile, Spike Cannon, Barrage, Fury Swipes, Bone Rush, Arm Thrust, Bullet Seed, Icicle Spear, Rock Blast): `E:bs1:604-660`; `setmultihitcounter 0` → `Cmd_setmultihitcounter` (`E:bsc:7139-7155`):
  ```c
  gMultiHitCounter = Random() & 3;                 // 0..3
  if (gMultiHitCounter > 1) gMultiHitCounter = (Random() & 3) + 2;   // 2..5
  else gMultiHitCounter += 2;                      // 2 or 3
  ```
  → P(2)=3/8, P(3)=3/8, P(4)=1/8, P(5)=1/8. Each hit runs the full pipeline (`E:bs1:617-625`: `critcalc, damagecalc, typecalc, adjustnormaldamage`) — independent crit and random per hit; loop stops when target faints or the target Endured (`E:bs1:640-641`).
- `EFFECT_DOUBLE_HIT` (Double Kick, Bonemerang): `E:bs1:839-847`: `setmultihitcounter 2`, same loop.
- `EFFECT_TWINEEDLE`: `E:bs1:1075-1083`: 2 hits, per-hit 20% poison via `sMULTIHIT_EFFECT`.
- `EFFECT_TRIPLE_KICK`: `E:bs1:1384-1445`: `sTRIPLE_KICK_POWER = 0; setmultihit 3`; each hit: separate `accuracycheck` (a miss ends the move), `addbyte sTRIPLE_KICK_POWER, 10`, `copyhword gDynamicBasePower, sTRIPLE_KICK_POWER` → powers 10, 20, 30, then full pipeline per hit.

### 4.3 Variable base power (set `gDynamicBasePower`, then normal pipeline)
| Move | Handler | Formula |
|---|---|---|
| Flail, Reversal (`EFFECT_FLAIL`) | `Cmd_remaininghptopower` `E:bsc:8303-8316`, table `sFlailHpScaleToPowerTable` `E:bsc:749-757` | `hpFraction = GetScaledHPFraction(hp, maxHP, 48)` (`E:src/battle_interface.c:2517-2525`: `hp*48/maxhp`, min 1 if hp>0); first row with `hpFraction <= threshold`: `{1:200, 4:150, 9:100, 16:80, 32:40, 48:20}`. |
| Return / Frustration | `Cmd_friendshiptodamagecalculation` `E:bsc:8603-8611` | `10 * friendship / 25` / `10 * (255 - friendship) / 25`. Power 0 possible (friendship < 3) → `CalculateBaseDamage` yields `0*... + 2` then floors. |
| Present | `Cmd_presentdamagecalculation` `E:bsc:8613-8650`, script `E:bs1:1664` | `r = Random() & 0xFF`: `<102`→40, `<178`→80, `<204`→120, else heal `maxHP/4` (min 1). Script runs `typecalc` **before** the roll, then jumps to `BattleScript_HitFromCritCalc` (full pipeline). |
| Magnitude | `Cmd_magnitudedamagecalculation` `E:bsc:8670-8721` | `Random()%100`: `<5`→10, `<15`→30, `<35`→50, `<65`→70, `<85`→90, `<95`→110, else 150. Uses the Earthquake hits-all loop (`E:bs1:1697`). |
| Rollout / Ice Ball (`EFFECT_ROLLOUT`) | `Cmd_rolloutdamagecalculation` `E:bsc:8536-8569`, script `E:bs1:1596-1605` | power = base × 2^(hit-1) for hits 1..5 (`for (i = 1; i < 5 - rolloutTimer; i++) power *= 2`), then `*= 2` if `STATUS2_DEFENSE_CURL`. Script: `typecalc2` (flags), then `HitFromCritCalc`. |
| Fury Cutter | `Cmd_furycuttercalc` `E:bsc:8580-8601`, script `E:bs1:1631` | counter caps at 5; power = base × 2^(counter-1) → 10,20,40,80,160. |
| Low Kick | `Cmd_weightdamagecalculation` `E:bsc:9467-9482`, table `E:bsc:774-782` | weight in hectograms from Pokédex data: first row with `threshold > weight`: `{100:20, 250:40, 500:60, 1000:80, 2000:100}`, else 120. (i.e. <10.0 kg→20, <25.0→40, <50.0→60, <100.0→80, <200.0→100, ≥200.0→120). |
| Eruption / Water Spout | `Cmd_scaledamagebyhealthratio` `E:bsc:9379-9390` | `power = hp * 150 / maxHP; if 0 → 1`. |
| Hidden Power | `Cmd_hiddenpowercalc` `E:bsc:8889-8915` | `powerBits = (hpIV&2)>>1 \| (atkIV&2) \| (defIV&2)<<1 \| (speIV&2)<<2 \| (spaIV&2)<<3 \| (spdIV&2)<<4`; `power = 40*powerBits/63 + 30`. `typeBits = (hpIV&1) \| (atkIV&1)<<1 \| (defIV&1)<<2 \| (speIV&1)<<3 \| (spaIV&1)<<4 \| (spdIV&1)<<5`; `type = 15*typeBits/63 + 1; if (type >= TYPE_MYSTERY) type++` (skips Normal and ???). Dynamic type drives physical/special split, STAB, type-boost item and type chart; `F_DYNAMIC_TYPE_IGNORE_PHYSICALITY` makes Counter/Mirror Coat treat it as physical (Normal). |
| Spit Up | `Cmd_stockpiletobasedamage` `E:bsc:6868-6892`, script `E:bs1:2094` | `damage = CalculateBaseDamage(...powerOverride 0 → move power 100...) * stockpileCounter`, then `×15/10` Helping Hand; script: `typecalc` (STAB + type chart applied!), `adjustsetdamage` (**no random**, no crit). |
| Beat Up | `Cmd_trydobeatup` `E:bsc:8957-9007`, script `E:bs1:1940-1971` | Per healthy, non-egg, status-free party member (attacker's party order): `dmg = baseAttack(member) * 10 * (memberLevel*2/5 + 2) / baseDefense(target species) / 50 + 2`, `×15/10` Helping Hand; then `critcalc` → if crit `manipulatedamage DMG_DOUBLED`; then `adjustnormaldamage` (random). **No `typecalc`** → no STAB, no type effectiveness, no immunity (hits Dark normally... and everything else at 1×). Uses species base stats, not battle stats. |

### 4.4 Situational doublers via `sDMG_MULTIPLIER` (feeds `dmgMultiplier` in `Cmd_damagecalc`)
| Situation | Script |
|---|---|
| Surf vs target underwater (Dive) | `BattleScript_EffectHit` `E:bs1:236-240` (`jumpifnotmove MOVE_SURF ...; setbyte sDMG_MULTIPLIER, 2`). Any move with `EFFECT_HIT`-routed scripts passes through this head; the check is only for MOVE_SURF. |
| Whirlpool vs underwater | `BattleScript_EffectTrap` `E:bs1:830-837` |
| Earthquake / Magnitude vs underground (Dig) | `BattleScript_HitsAllWithUndergroundBonusLoop` `E:bs1:1839-1847` (per target; `setbyte sDMG_MULTIPLIER, 1` otherwise) |
| Gust vs airborne (Fly/Bounce) | `BattleScript_EffectGust` `E:bs1:1892-1896` |
| Twister vs airborne | `BattleScript_EffectTwister` `E:bs1:1826-1832` |
| Stomp / Astonish / Needle Arm / Extrasensory vs Minimized (`EFFECT_FLINCH_MINIMIZE_HIT`) | `BattleScript_EffectStomp` `E:bs1:1898-1901` (`STATUS3_MINIMIZED` set by `Cmd_setminimize` `E:bsc:9047-9053`) |
| Facade with burn/poison/toxic/paralysis on user | `BattleScript_EffectFacade` `E:bs1:2252-2258` (`STATUS1_POISON \| BURN \| PARALYSIS \| TOXIC_POISON`; sleep/freeze do not count) |
| Smelling Salt vs paralyzed target (no Substitute) | `E:bs1:2268-2275`; also cures paralysis after. |
| Revenge when damaged this turn by the target | `Cmd_doubledamagedealtifdamaged` `E:bsc:9339-9350` (`physicalDmg`/`specialDmg` with matching battler id), script `E:bs1:2414` |
| Weather Ball in any weather | `Cmd_setweatherballtype` `E:bsc:9787-9806`: if `WEATHER_HAS_EFFECT` and any weather: `dmgMultiplier = 2`; type = Water (rain) / Rock (sandstorm) / Fire (sun) / Ice (hail), else Normal. Dynamic type → Rock Weather Ball is physical. |
| Pursuit on a switching target | `BattleScript_ActionSwitch` `E:bs1:3088-3122` sets `sDMG_MULTIPLIER, 2` then `BattleScript_PursuitDmgOnSwitchOut` `E:bs1:3123-3147` runs the normal pipeline. Normal Pursuit (`EFFECT_PURSUIT`) otherwise uses `BattleScript_EffectHit`. |

### 4.5 Recoil, self-KO, drain
- `EFFECT_RECOIL` (Take Down, Submission, **Struggle**): `E:bs1:897-901` → `MOVE_EFFECT_RECOIL_25`: `gBattleMoveDamage = gHpDealt / 4; if 0 → 1` (`E:bsc:2636-2639`). Rock Head negates except for Struggle (`E:bs1:3938-3940`). Struggle recoil in gen 3 = 1/4 of HP dealt, not max HP.
- `EFFECT_DOUBLE_EDGE` (Double-Edge, Volt Tackle): `E:bs1:2567` → `MOVE_EFFECT_RECOIL_33`: `gHpDealt / 3; min 1` (`E:bsc:2843-2846`).
- `EFFECT_RECOIL_IF_MISS` (Jump Kick, Hi Jump Kick): `E:bs1:849-870`: on miss, `damagecalc, typecalc, adjustnormaldamage` are computed as if it hit, then `manipulatedamage DMG_RECOIL_FROM_MISS` (`E:bsc:6746-6752`): `damage /= 2; min 1; cap at target maxHP/2`. (Note: `critcalc` is not re-run, so `gCritMultiplier` stays 1 from cleanup.)
- `EFFECT_EXPLOSION` (Explosion, Self-Destruct): `E:bs1:374-411`: `tryexplosion` (Damp check, `E:bsc:6538-6575`), user HP set to 0 first, then per target the normal pipeline with `defense /= 2` inside `CalculateBaseDamage` (`E:pokemon.c:3229-3230`). Not halved for hitting multiple targets (target is `FOES_AND_ALLY`).
- `EFFECT_ABSORB` (Absorb, Mega Drain, Giga Drain, Leech Life): `E:bs1:323-355`: normal pipeline, then `negativedamage` (`Cmd_negativedamage` `E:bsc:6925`: heal = `gHpDealt / 2`, min 1) — Liquid Ooze flips sign.
- `EFFECT_DREAM_EATER`: `E:bs1:425-457`: fails unless target asleep and no Substitute; normal pipeline; heals half like Absorb.

### 4.6 Delayed / other
- Future Sight, Doom Desire (`EFFECT_FUTURE_SIGHT`): `Cmd_trysetfutureattack` (`E:bsc:8929-8955`) computes `futureSightDmg = CalculateBaseDamage(attacker, target, move, sideStatus(target), 0, 0, ...)` **at the time of use** (attacker's current stats/items/stages; `gCritMultiplier` = 1), then Helping Hand ×1.5 at set time. On hit 2 turns later (`E:battle_util.c:1797-1820`, `BattleScript_MonTookFutureAttack` `E:bs1:3508-3535`): `accuracycheck`, `adjustnormaldamage2` (random 85-100% + Focus Band/Endure cap), then HP update. **No `typecalc`** → no STAB, no type effectiveness, no immunity (hits Dark types with Future Sight; ignores Wonder Guard); no crit.
- Hyper Beam & other `EFFECT_RECHARGE` (Blast Burn, Hydro Cannon, Frenzy Plant): normal pipeline (`E:bs1` `BattleScript_EffectRecharge`), recharge is a move effect.
- Solar Beam (`EFFECT_SOLAR_BEAM`, `E:bs1:1903-1918`): charge turn skipped in sun (`AttacksThisTurn` `E:bsc:8224-8226`); damage halved in rain/sand/hail inside `CalculateBaseDamage` (`E:pokemon.c:3348-3349`). Otherwise normal.
- Rage (`EFFECT_RAGE`, `E:bs1:1122`): normal pipeline; the Attack +1 when hit is handled at `MOVEEND_RAGE` (`E:bsc:4240-4251`), i.e. Rage's damage boost is entirely via ordinary Attack stages.
- Thrash / Outrage / Petal Dance (`EFFECT_RAMPAGE`, `E:bs1:583`), Uproar (`E:bs1:2072`), Fake Out (`E:bs1:2048`, fails unless first turn), Focus Punch (`E:bs1:2260`, fails if damaged), Knock Off (`E:bs1:2475`), Rapid Spin (`E:bs1:1716`), Snore (`E:bs1:1257`, requires sleep), Sleep Talk (calls the chosen move's script), Secret Power, Thief/Covet, Pursuit, Quick Attack/Mach Punch/Extreme Speed, Vital Throw, all `*_HIT` secondary-effect moves, Superpower, Overheat/Psycho Boost, Brick Break (removes screens *before* `damagecalc`, `E:bs1:2418-2427`), Sky Uppercut (can hit Fly, no bonus), Thunder (can hit Fly, no bonus), Fly/Dig/Dive/Bounce attack turn: normal pipeline.
- Charge: `STATUS3_CHARGED_UP` → ×2 for Electric moves in `Cmd_damagecalc` (`E:bsc:1298-1299`). Helping Hand: ×15/10 (`E:bsc:1300-1301`) plus in Spit Up, Beat Up, Future Sight set-up.
- Mud Sport / Water Sport: power halving in `CalculateBaseDamage` (`E:pokemon.c:3215-3218`), field-wide, checked via `STATUS3_MUDSPORT`/`WATERSPORT` on any battler.

### 4.6b Accuracy check — `Cmd_accuracycheck` (`E:bsc:1099-1189`), `AccuracyCalcHelper` (`E:bsc:1054-1097`)
Never touches damage; `accuracy.ts` (`hitGen3`) uses it for the KO odds. FRLG is identical
(`F:bsc:1003-1106`).
* `AccuracyCalcHelper`: Lock-On from this attacker → hit; target on air / underground / underwater →
  miss unless the script set `HITMARKER_IGNORE_*` (Gust, Twister, Thunder, Sky Uppercut / Earthquake,
  Magnitude / Surf, Whirlpool; the OHKO script uses `NO_ACC_CALC_CHECK_LOCK_ON`, so Fissure does **not**
  reach a Dig target); Thunder in rain, `EFFECT_ALWAYS_HIT`, `EFFECT_VITAL_THROW` → hit.
* Stage: `buff = acc + 6 − evasion` clamped 0..12, or just `acc` when the target is Foresighted
  (`E:bsc:1128-1136`); `sAccuracyStageRatios` (`E:bsc:588-603`) = 33/36/43/50/60/75/100/133/166/200/233/266/300 %.
* `calc = floor(ratio.num × moveAcc / ratio.den)`, Thunder in sun `moveAcc = 50` (`E:bsc:1146`).
* Then, each `floor(calc × k / 100)`: Compound Eyes 130; Sand Veil in sandstorm 80 (weather must have
  effect); Hustle 80 for type-physical moves; target hold effect `EVASION_UP` `100 − param`: Bright Powder
  10, Lax Incense 5 (`E:src/data/items.h:2189-2192, 2719-2722`).
* Miss iff `Random() % 100 + 1 > calc` → hit chance `min(calc, 100) %`.
* OHKO (`Cmd_tryKO`, `E:bsc:7490-7575`): Sturdy blocks; `chance = 30 + (Lu − Lt)`; hit iff
  `Random() % 100 + 1 < chance` **and** Lu ≥ Lt — one point below the nominal figure (29 % at equal level).

### 4.7 Full `EFFECT_*` list (`E:include/constants/battle_move_effects.h:4-217`, identical values in FRLG and RS; RS names differ for 150/151/155)
```
0 HIT  1 SLEEP  2 POISON_HIT  3 ABSORB  4 BURN_HIT  5 FREEZE_HIT  6 PARALYZE_HIT  7 EXPLOSION  8 DREAM_EATER  9 MIRROR_MOVE
10 ATTACK_UP  11 DEFENSE_UP  12 SPEED_UP  13 SPECIAL_ATTACK_UP  14 SPECIAL_DEFENSE_UP  15 ACCURACY_UP  16 EVASION_UP  17 ALWAYS_HIT
18 ATTACK_DOWN  19 DEFENSE_DOWN  20 SPEED_DOWN  21 SPECIAL_ATTACK_DOWN  22 SPECIAL_DEFENSE_DOWN  23 ACCURACY_DOWN  24 EVASION_DOWN
25 HAZE  26 BIDE  27 RAMPAGE  28 ROAR  29 MULTI_HIT  30 CONVERSION  31 FLINCH_HIT  32 RESTORE_HP  33 TOXIC  34 PAY_DAY  35 LIGHT_SCREEN
36 TRI_ATTACK  37 REST  38 OHKO  39 RAZOR_WIND  40 SUPER_FANG  41 DRAGON_RAGE  42 TRAP  43 HIGH_CRITICAL  44 DOUBLE_HIT  45 RECOIL_IF_MISS
46 MIST  47 FOCUS_ENERGY  48 RECOIL  49 CONFUSE  50-56 ATTACK/DEFENSE/SPEED/SPECIAL_ATTACK/SPECIAL_DEFENSE/ACCURACY/EVASION_UP_2
57 TRANSFORM  58-64 *_DOWN_2  65 REFLECT  66 POISON  67 PARALYZE  68-74 ATTACK/DEFENSE/SPEED/SPECIAL_ATTACK/SPECIAL_DEFENSE/ACCURACY/EVASION_DOWN_HIT
75 SKY_ATTACK  76 CONFUSE_HIT  77 TWINEEDLE  78 VITAL_THROW  79 SUBSTITUTE  80 RECHARGE  81 RAGE  82 MIMIC  83 METRONOME  84 LEECH_SEED
85 SPLASH  86 DISABLE  87 LEVEL_DAMAGE  88 PSYWAVE  89 COUNTER  90 ENCORE  91 PAIN_SPLIT  92 SNORE  93 CONVERSION_2  94 LOCK_ON  95 SKETCH
96 UNUSED_60  97 SLEEP_TALK  98 DESTINY_BOND  99 FLAIL  100 SPITE  101 FALSE_SWIPE  102 HEAL_BELL  103 QUICK_ATTACK  104 TRIPLE_KICK
105 THIEF  106 MEAN_LOOK  107 NIGHTMARE  108 MINIMIZE  109 CURSE  110 UNUSED_6E  111 PROTECT  112 SPIKES  113 FORESIGHT  114 PERISH_SONG
115 SANDSTORM  116 ENDURE  117 ROLLOUT  118 SWAGGER  119 FURY_CUTTER  120 ATTRACT  121 RETURN  122 PRESENT  123 FRUSTRATION  124 SAFEGUARD
125 THAW_HIT  126 MAGNITUDE  127 BATON_PASS  128 PURSUIT  129 RAPID_SPIN  130 SONICBOOM  131 UNUSED_83  132 MORNING_SUN  133 SYNTHESIS
134 MOONLIGHT  135 HIDDEN_POWER  136 RAIN_DANCE  137 SUNNY_DAY  138 DEFENSE_UP_HIT  139 ATTACK_UP_HIT  140 ALL_STATS_UP_HIT  141 UNUSED_8D
142 BELLY_DRUM  143 PSYCH_UP  144 MIRROR_COAT  145 SKULL_BASH  146 TWISTER  147 EARTHQUAKE  148 FUTURE_SIGHT  149 GUST
150 FLINCH_MINIMIZE_HIT (RS: FLINCH_HIT_2)  151 SOLAR_BEAM (RS: SOLARBEAM)  152 THUNDER  153 TELEPORT  154 BEAT_UP
155 SEMI_INVULNERABLE (RS: FLY)  156 DEFENSE_CURL  157 SOFTBOILED  158 FAKE_OUT  159 UPROAR  160 STOCKPILE  161 SPIT_UP  162 SWALLOW
163 UNUSED_A3  164 HAIL  165 TORMENT  166 FLATTER  167 WILL_O_WISP  168 MEMENTO  169 FACADE  170 FOCUS_PUNCH  171 SMELLINGSALT
172 FOLLOW_ME  173 NATURE_POWER  174 CHARGE  175 TAUNT  176 HELPING_HAND  177 TRICK  178 ROLE_PLAY  179 WISH  180 ASSIST  181 INGRAIN
182 SUPERPOWER  183 MAGIC_COAT  184 RECYCLE  185 REVENGE  186 BRICK_BREAK  187 YAWN  188 KNOCK_OFF  189 ENDEAVOR  190 ERUPTION
191 SKILL_SWAP  192 IMPRISON  193 REFRESH  194 GRUDGE  195 SNATCH  196 LOW_KICK  197 SECRET_POWER  198 DOUBLE_EDGE  199 TEETER_DANCE
200 BLAZE_KICK  201 MUD_SPORT  202 POISON_FANG  203 WEATHER_BALL  204 OVERHEAT  205 TICKLE  206 COSMIC_POWER  207 SKY_UPPERCUT
208 BULK_UP  209 POISON_TAIL  210 WATER_SPORT  211 CALM_MIND  212 DRAGON_DANCE  213 CAMOUFLAGE
```
Every damaging effect not named in 4.1-4.6 resolves to `BattleScript_EffectHit` or a `setmoveeffect X; goto BattleScript_EffectHit` wrapper (see the mapping at `E:bs1:20-234`), i.e. the normal pipeline.

`MOVE_TARGET_BOTH` moves (spread-halved in doubles; from `E:src/data/battle_moves.h`): Razor Wind, Acid, Blizzard, Razor Leaf, Swift, Bubble, Rock Slide, Powder Snow, Icy Wind, Twister, Heat Wave, Eruption, Air Cutter, Water Spout, Muddy Water, Surf, Hyper Voice, plus non-damaging (Tail Whip, Leer, Growl, etc.). `MOVE_TARGET_FOES_AND_ALLY` (NOT halved): Earthquake, Magnitude, Self-Destruct, Explosion.

---

## 5. Type effectiveness table

`gTypeEffectiveness[336]` (`E:src/battle_main.c:335-448`), rows `{attackType, defenseType, multiplier}` with `TYPE_MUL_NO_EFFECT 0`, `TYPE_MUL_NOT_EFFECTIVE 5`, `TYPE_MUL_SUPER_EFFECTIVE 20` (`E:include/battle_main.h:31-34`); `TYPE_FORESIGHT 0xFE`, `TYPE_ENDTABLE 0xFF` (`battle_main.h:37-38`). Any pair not listed = 1×. Table order (this is also the multiplier application order):

```
NORMAL:   ROCK 5, STEEL 5
FIRE:     FIRE 5, WATER 5, GRASS 20, ICE 20, BUG 20, ROCK 5, DRAGON 5, STEEL 20
WATER:    FIRE 20, WATER 5, GRASS 5, GROUND 20, ROCK 20, DRAGON 5
ELECTRIC: WATER 20, ELECTRIC 5, GRASS 5, GROUND 0, FLYING 20, DRAGON 5
GRASS:    FIRE 5, WATER 20, GRASS 5, POISON 5, GROUND 20, FLYING 5, BUG 5, ROCK 20, DRAGON 5, STEEL 5
ICE:      WATER 5, GRASS 20, ICE 5, GROUND 20, FLYING 20, DRAGON 20, STEEL 5, FIRE 5
FIGHTING: NORMAL 20, ICE 20, POISON 5, FLYING 5, PSYCHIC 5, BUG 5, ROCK 20, DARK 20, STEEL 20
POISON:   GRASS 20, POISON 5, GROUND 5, ROCK 5, GHOST 5, STEEL 0
GROUND:   FIRE 20, ELECTRIC 20, GRASS 5, POISON 20, FLYING 0, BUG 5, ROCK 20, STEEL 20
FLYING:   ELECTRIC 5, GRASS 20, FIGHTING 20, BUG 20, ROCK 5, STEEL 5
PSYCHIC:  FIGHTING 20, POISON 20, PSYCHIC 5, DARK 0, STEEL 5
BUG:      FIRE 5, GRASS 20, FIGHTING 5, POISON 5, FLYING 5, PSYCHIC 20, GHOST 5, DARK 20, STEEL 5
ROCK:     FIRE 20, ICE 20, FIGHTING 5, GROUND 5, FLYING 20, BUG 20, STEEL 5
GHOST:    NORMAL 0, PSYCHIC 20, DARK 5, STEEL 5, GHOST 20
DRAGON:   DRAGON 20, STEEL 5
DARK:     FIGHTING 5, PSYCHIC 20, GHOST 20, DARK 5, STEEL 5
STEEL:    FIRE 5, WATER 5, ELECTRIC 5, ICE 20, ROCK 20, STEEL 5
--- TYPE_FORESIGHT sentinel row (0xFE, 0xFE, 0) ---
NORMAL:   GHOST 0
FIGHTING: GHOST 0
--- TYPE_ENDTABLE (0xFF) ---
```
Confirmed gen-3 specifics: Ghost vs Steel = ½, Dark vs Steel = ½ (Steel resists both), Ghost vs Dark = ½, Steel vs Fire/Water/Electric ½, Bug vs Poison ½, Poison vs Bug 1×.

- Foresight / Odor Sleuth (`STATUS2_FORESIGHT`, set by `Cmd_setforesight` `E:bsc:8502`): the loop `break`s at the sentinel (`E:bsc:1388-1394`), so only Normal/Fighting vs Ghost immunity is removed; Foresight does not change any other multiplier and does not affect Ghost's other matchups. Also removes evasion stages from the accuracy formula (`E:bsc:1127-1131`).
- Levitate: Ground-type moves (by effective type, incl. Hidden Power Ground) → "doesn't affect" before the table (`E:bsc:1375-1383`).
- Wonder Guard: after the table (`E:bsc:1409-1418`); requires the move to have `power != 0` and not be a charging turn.
- Volt Absorb / Water Absorb / Flash Fire: `attackcanceler` stage (`E:battle_util.c:2660-2712`).
- `IS_BATTLER_OF_TYPE` uses both type slots; mono-typed mons have `types[0] == types[1]` and the second slot is skipped in the chart (`types[0] != types[1]` guard).

---

## 6. Ruby/Sapphire vs Emerald vs FireRed/LeafGreen

Verified by diffing the three repos:

| Topic | Emerald | FRLG | Ruby/Sapphire |
|---|---|---|---|
| `CalculateBaseDamage` location | `src/pokemon.c:3106-3372` | `src/pokemon.c:2385-2649` | `src/calculate_base_damage.c:93-338` |
| Arithmetic / order of every step in section 1 | as documented | **identical** (line-for-line, `F:pokemon.c:2437-2648`) | **identical** (`R:calculate_base_damage.c:143-337`); `gStatStageRatios` identical (`R:calculate_base_damage.c:34-49`), `gHoldEffectToType` identical (53-72), spread check written as `target == 8` (246, 293). |
| Badge boost gating | `ShouldGetStatBadgeBoost` `E:pokemon.c:3407-3419`: not LINK/EREADER/RECORDED_LINK/FRONTIER, player side, not secret-base trainer, flag set. Applies in **wild and trainer** battles. | Macro `F:pokemon.c:2381-2382`: `!(gBattleTypeFlags & (BATTLE_TYPE_LINK \| BATTLE_TYPE_EREADER_TRAINER)) && FlagGet(flag) && GetBattlerSide(battler) == B_SIDE_PLAYER`. Applies in wild, trainer **and Trainer Tower** battles. Badges 01/05/07 = Boulder (Atk), Soul (Def), Volcano (SpA & SpD). | Macro `BADGE_BOOST` `R:calculate_base_damage.c:82-91`: requires **`BATTLE_TYPE_TRAINER`** and not LINK/BATTLE_TOWER/EREADER and not secret-base opponent and player side. **No badge boost in wild battles in RS.** |
| Soul Dew exclusion | `BATTLE_TYPE_FRONTIER` (`E:pokemon.c:3187-3190`) | `BATTLE_TYPE_BATTLE_TOWER` (Trainer Tower) (`F:2466-2469`) | `BATTLE_TYPE_BATTLE_TOWER` (`R:166-169`) |
| Solar Beam weather mask | `RAIN \| SANDSTORM \| HAIL` (`E:3348`) | `RAIN \| SANDSTORM \| HAIL_TEMPORARY` (`F:2625`) — same bits since `B_WEATHER_HAIL == HAIL_TEMPORARY` | same as FRLG (`R:314`) |
| Cloud Nine/Air Lock weather guard | `WEATHER_HAS_EFFECT2` (no HP check) | same | inline `AbilityBattleEffects(ABILITYEFFECT_FIELD_SPORT, ...)` — same semantics (`R:297-298`); Ruby `FIELD_SPORT` default case also has no HP check (`R:battle_util.c:2538-2541`). |
| Flash Fire flag | `gBattleResources->flags->flags[atk] & RESOURCE_FLAG_FLASH_FIRE` | same | `eBattleFlagsArr.arr[bankAtk] & 1` (`R:333`) — same bit |
| `Cmd_damagecalc` | `E:bsc:1290-1303` | identical (`F:bsc:1209`) | identical, `gBattleStruct->dmgMultiplier` (`R:bsc:1410-1424`) |
| Crit calc | `E:bsc:1253-1288`, table {16,8,4,3,2}, blocked in Wally tutorial / first battle | same table (`F:bsc:588`) and formula; blocked in Old Man tutorial / Pokédude / first battle unless `BtlCtrl_OakOldMan_TestState2Flag(1)` (`F:bsc:1170-1206`) | identical to Emerald incl. `BATTLE_TYPE_WALLY_TUTORIAL \| FIRST_BATTLE` (`R:bsc:1373-1407`, table `R:bsc:822`) |
| `Cmd_typecalc`, `ModulateDmgByType` | `E:bsc:1321-1425` | identical except `type1/type2` field names (`F:bsc:1274`) | identical (`R:bsc:1441-1540`) |
| Random 85-100 | `E:bsc:1639-1652` | identical (`F:bsc:1558-1570`) | identical (`R:bsc:1751-1763`) |
| Endure/Focus Band/False Swipe cap | `E:bsc:1670-1698` | identical | identical logic with gotos (`R:bsc:1770-1800`) |
| Multi-hit distribution, Psywave, Present, Magnitude, Beat Up, Hidden Power, Rollout, Fury Cutter, Low Kick, Flail table, Eruption, Return, Counter, Mirror Coat, Weather Ball, Revenge, Endeavor, Spit Up, Future Sight set-up, recoil 1/4 & 1/3 | as documented | **all identical** (diffed: `F:bsc:6857, 7557, 8238, 8284, 8571, 8503, 8161, 8205, 9074, 731-739, 8986, 8228, 7568, 9345, 8946, ...`); only cosmetic differences (`255` vs `MAX_FRIENDSHIP`, flag names). | **all identical** (`R:bsc:6697, 7690, 8281, 8324, 8586, 8521, 8211, 8250, 9033, 969-976, 8955, 8275-8277, 7699, 9277, 8923, 8942, 6430, 8559, 2715-2717, 2913-2915`). Ruby Present does not clear `MOVE_RESULT_DOESNT_AFFECT_FOE` on the heal branch (message only). Ruby `atk93_tryKO` is a non-matching stub in the decomp; treat Emerald's as authoritative. |
| Script-level doublers (Surf/Whirlpool vs Dive, EQ/Magnitude vs Dig, Gust/Twister vs Fly, Stomp-class vs Minimize, Facade, Smelling Salt, Pursuit on switch, Beat Up crit) | as documented | all present (`F:bs1:241-243, 831-833, 1837-1843, 1889-1896, 1823-1825, 2247-2252, 2269, 3046-3049, 1949`) | all present (`R:bs1:255-257, 887-889, 1925-1932, 1982-1984, 1909-1911, 1988-1989, 2357-2362, 2373-2380, 3121-3124, 2045`) |
| Bide script | `typecalc; bicbyte SE\|NVE; copyword dmg, sBIDE_DMG; adjustsetdamage` | same | same (`R:bs1:3347-3350`) |
| Type chart | `E:battle_main.c:335-448` | **identical** (`F:battle_main.c:312`) | **identical** values/order (`R:data/type_effectiveness.inc:7-119`, raw bytes 0/5/20, sentinel `0xFE`, end `0xFF`) |
| Move table (effect, power, type, target) | `E:src/data/battle_moves.h` | **identical** | **identical** (`R:src/data/battle_moves.c`; target constants named `TARGET_BOTH_ENEMIES` = 8, `TARGET_ALL_EXCEPT_USER` = 32) |
| Move effect constants | `E:include/constants/battle_move_effects.h` | identical | identical values; names `EFFECT_FLINCH_HIT_2`, `EFFECT_SOLARBEAM`, `EFFECT_FLY` |
| Item hold params (type items 10, Sea Incense 5, Focus Band 10) | `E:src/data/items.h` | same (`F:src/data/items.h:3368-3381` Sea Incense 5) | same (`R:src/data/items_en.h:3525` Sea Incense 5) |

Net: the only **numerically relevant** cross-game differences are (a) when badge boosts apply (RS: trainer battles only; Emerald: wild + trainer excluding Frontier/link; FRLG: wild + trainer, only link/e-Reader excluded) and which badge numbers map to which gyms, and (b) the facility flag that disables Soul Dew.

---

## 7. Checklist for a Gen 3 calculator

Integer arithmetic throughout; `//` = truncating division.

1. Physical/special split is by **move type**: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel = physical; Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark = special (`E:include/battle.h:466-467`, `constants/pokemon.h:6-23`). Hidden Power / Weather Ball use their dynamic type (`E:bsc:8905-8913`, `9787-9806`).
2. Start from in-battle stats (no stages). Apply, in this order, to the raw stats (`E:pokemon.c:3158-3230`):
   1. Huge Power / Pure Power: `atk *= 2`.
   2. Badge boosts `stat = 110*stat//100` (player only; Emerald: badge1→Atk, badge5→Def, badge7→SpA and SpD; gating per section 6).
   3. Type-boost item matching the move type: `atk (or spa) = stat*(100+param)//100` (param 10; Sea Incense 5).
   4. Choice Band: `atk = 150*atk//100`.
   5. Soul Dew (Latias/Latios, not facility): `spa = 150*spa//100` / defender `spd = 150*spd//100`.
   6. Deep Sea Tooth (Clamperl) `spa *= 2`; Deep Sea Scale (Clamperl, defender) `spd *= 2`; Light Ball (Pikachu) `spa *= 2`; Metal Powder (Ditto, defender) `def *= 2`; Thick Club (Cubone/Marowak) `atk *= 2`.
   7. Thick Fat (defender) vs Fire/Ice: `spa //= 2`.
   8. Hustle `atk = 150*atk//100`; Plus/Minus (partner ability anywhere on field) `spa = 150*spa//100`; Guts (any status) `atk = 150*atk//100`; Marvel Scale (defender, any status) `def = 150*def//100`.
3. Base power modifiers (`E:pokemon.c:3215-3226`): Mud Sport (Electric) `power //= 2`; Water Sport (Fire) `power //= 2`; then Overgrow/Blaze/Torrent/Swarm when `hp <= maxHP//3`: `power = 150*power//100`. Variable-power moves supply `power` first (section 4.3). Explosion/Self-Destruct: `def //= 2` (`3229`).
4. Stat stages (`E:pokemon.c:1868-1883`, `3234-3257`): `A = atk*num//den`; on a crit use the raw stat instead if the attacker's stage is ≤ 0; `D = def*num//den`; on a crit use the raw stat if the defender's stage is ≥ 0.
5. Core: `dmg = ((A * power) * (2*L//5 + 2)) // D // 50` (`E:pokemon.c:3245-3260`) — multiply `A*power` first, then by `(2L//5+2)`, then integer-divide by `D`, then by 50.
6. Physical only: burn without Guts → `dmg //= 2` (`3263`).
7. Reflect (physical) / Light Screen (special), non-crit only: singles `dmg //= 2`; doubles with 2 defenders alive `dmg = 2*(dmg//3)` (`3267-3273`, `3318-3324`).
8. Doubles: if move target is `MOVE_TARGET_BOTH` and 2 defenders alive → `dmg //= 2` (`3276`, `3327`). Earthquake/Magnitude/Explosion/Self-Destruct are not halved.
9. Physical only: `if dmg == 0: dmg = 1` (`3280`).
10. Special only, unless Cloud Nine/Air Lock on field (`3331-3363`): rain → Fire `//2`, Water `15*dmg//10`; Solar Beam in rain/sand/hail `//2`; sun → Fire `15*dmg//10`, Water `//2`. No sandstorm SpD boost, no hail effect.
11. Special only: Flash Fire active on attacker and Fire move → `dmg = 15*dmg//10` (`3367`).
12. `dmg += 2` (`3371`).
13. `dmg = dmg * crit(1|2) * dmgMultiplier(1|2)` (`E:bsc:1296`) where dmgMultiplier = 2 for: Surf/Whirlpool vs Dive, Earthquake/Magnitude vs Dig, Gust/Twister vs Fly/Bounce, Stomp/Astonish/Needle Arm/Extrasensory vs Minimize, Facade (psn/tox/brn/par), Smelling Salt vs paralyzed, Revenge after being hit by target this turn, Weather Ball in weather, Pursuit on a switching target (section 4.4).
14. Charge + Electric move: `dmg *= 2`; then Helping Hand: `dmg = dmg*15//10` (`E:bsc:1298-1301`).
15. STAB: `dmg = dmg*15//10` if the effective move type matches either of the attacker's types (`E:bsc:1369-1373`). Struggle skips STAB and type chart entirely (`1360`).
16. Type chart: for each matching row in table order (section 5) that matches defender type1, then type2 (skipped if identical): `dmg = dmg*mult//10` with mult ∈ {0, 5, 20}; if result is 0 and mult ≠ 0, set 1 (`E:bsc:1321-1326`). Foresight/Odor Sleuth only removes Normal/Fighting→Ghost immunity. Levitate → Ground immune; Wonder Guard → immune unless SE; Volt/Water Absorb → immune (power>0 moves); Flash Fire → Fire immune.
17. Random: `dmg = dmg * (100 - r) // 100` with `r = Random() % 16` (uniform 85..100%), then `if dmg == 0: dmg = 1` (`E:bsc:1639-1652`).
18. Endure / Focus Band (10%) / False Swipe: if `hp <= dmg` → `dmg = hp - 1` (no Substitute) (`E:bsc:1670-1698`).
19. Crit rate: stage = 2·FocusEnergy + HighCrit(incl. Sky Attack, Blaze Kick, Poison Tail) + ScopeLens + 2·LuckyPunch(Chansey) + 2·Stick(Farfetch'd), capped 4 → 1/16, 1/8, 1/4, 1/3, 1/2; Battle Armor/Shell Armor block (`E:bsc:1253-1288`).
20. Fixed-damage moves skip 2-17 except the immunity part of 16 (no STAB/type multiplier, no random): Seismic Toss/Night Shade = level; Sonic Boom 20; Dragon Rage 40; Psywave `L*(50 + 10*k)//100, k∈0..10`; Super Fang `hp//2` min 1; Endeavor `targetHP - userHP`; Counter/Mirror Coat `2 × last physical/special HP lost`; Bide `2 × stored`; OHKO = HP (section 4.1).
21. Multi-hit: 2/3/4/5 hits with 3/8, 3/8, 1/8, 1/8; each hit fully independent (crit, random) (`E:bsc:7139-7155`). Double Kick/Bonemerang/Twineedle exactly 2; Triple Kick 10/20/30 with per-hit accuracy.
22. Beat Up: per party member `baseAtk*10*(2*lvl//5+2)//baseDef(target)//50 + 2`, ×1.5 Helping Hand, ×2 on crit, random; no STAB/type (`E:bsc:8957-9007`, `bs1:1940-1971`).
23. Future Sight / Doom Desire: `CalculateBaseDamage` snapshot at use (steps 2-12, non-crit), ×1.5 Helping Hand; on hit only random + Endure cap; no STAB, no type chart, no immunities, no crit (`E:bsc:8929-8955`, `bs1:3508-3535`).
24. Spit Up: `CalculateBaseDamage × stockpiles`, ×1.5 Helping Hand, then STAB and type chart, no random, no crit (`E:bsc:6868-6892`, `bs1:2094-2103`).
25. Recoil: Take Down/Submission/Struggle `HPdealt//4` min 1 (Rock Head negates except Struggle); Double-Edge/Volt Tackle `HPdealt//3` min 1; Jump Kick/Hi Jump Kick miss: computed damage `//2`, min 1, capped at `targetMaxHP//2` (section 4.5). HP dealt is capped at the target's remaining HP (or Substitute HP).
26. Absorb-class and Dream Eater heal `HPdealt//2` min 1 (`E:bsc:6925`); Liquid Ooze inverts.
27. Weather Ball: type from weather, power 50, ×2 via dmgMultiplier (so effectively 100), physical if Rock.
28. Rollout/Ice Ball: `30·2^(n-1)`, ×2 with Defense Curl; Fury Cutter `10·2^(n-1)` capped at 160; Low Kick weight table `<10kg 20, <25 40, <50 60, <100 80, <200 100, else 120`; Flail/Reversal via `hp*48//maxHP` thresholds `≤1:200, ≤4:150, ≤9:100, ≤16:80, ≤32:40, else 20`; Eruption/Water Spout `hp*150//maxHP` min 1; Return `10*f//25`, Frustration `10*(255-f)//25`; Present 40/80/120 at 102/76/26 out of 256 else heal `maxHP//4`; Magnitude 10/30/50/70/90/110/150 at 5/10/20/30/20/10/5 %; Hidden Power power `40*bits//63+30`, type `15*bits//63+1` (skip ???).
29. Hit chance (KO odds only): `floor(ratio[acc−eva] × acc%)` (Foresight: `ratio[acc]`) → Compound Eyes
    ×130/100 → Sand Veil ×80/100 → Hustle ×80/100 (physical) → Bright Powder ×90/100 / Lax Incense ×95/100,
    each floored; hit iff `rand%100+1 ≤ calc`; Thunder sun 50 / rain sure; always-hit effects; semi-
    invulnerable exceptions; OHKO `rand%100+1 < 30 + (Lu−Lt)` with Lu ≥ Lt, Sturdy blocks (section 4.6b).
