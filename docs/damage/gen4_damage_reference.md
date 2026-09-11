# Generation 4 Damage Calculation — Verification Reference (from the decomps)

Primary source: **pokeplatinum** (`A:\decomps\pokeplatinum`, abbreviated `P:`).
Secondary: **pokeheartgold** (`A:\Dropbox\stp-projects\programs\poke_map\repos\pokeheartgold`, abbreviated `H:`).
**pokediamond** (`A:\Dropbox\stp-projects\programs\poke_map\repos\pokediamond`) has NO decompiled battle code — overlay 12 exists only as raw asm at `arm9/overlays/12/asm/overlay_12.s`; no C to diff (see §5).

All arithmetic below is C `int`/`s32` (or `u16` where noted) integer arithmetic: `/` truncates toward zero. Every "×a/b" means `x = x * a / b` (multiply first, then truncating divide), unless stated otherwise.

Conventions used in this doc:
- `MOVE_DATA(m)` = `battleCtx->aiContext.moveTable[m]` (`P:include/battle/common.h:25`).
- `NO_CLOUD_NINE` = no living battler has Cloud Nine or Air Lock (`P:include/battle/common.h:63-64`).
- `Battler_IgnorableAbility(ctx, atk, def, A)` = defender has ability A **and attacker does not have Mold Breaker** (`P:src/battle/battle_lib.c:3108-3124`). Every "defender ability" marked *(MB)* below is bypassed by Mold Breaker.
- `Battler_HeldItem` returns ITEM_NONE if the holder has **Klutz** or is under **Embargo** (`P:src/battle/battle_lib.c:5352-5362`); all item checks in the damage routine go through this.
- Stat stages are stored 0..12, `DEFAULT_STAT_STAGE = 6`, `MIN=0`, `MAX=12` (`P:include/constants/battle/battle_script.h:4-6`).

---

## 0. Pipeline order (which routine applies what, and in what order)

Per move use (and per hit of a multi-hit), the engine does the following:

1. **Move script** (`res/moves/<move>/script.s` → `GoToEffectScript` → `res/battle/scripts/effects/effect_script_NNNN.s` where NNNN = `BATTLE_EFFECT_*` id). A plain attack is `effect_script_0000.s`: `CalcCrit` / `CalcDamage` / `End`. Loaded by `BattleControllerPlayer_BeforeMove` (`P:src/battle/battle_controller_player.c:3214-3216`, `commandNext = BATTLE_CONTROL_TRY_MOVE`).
   - Variable-power/type commands (`CalcFlailPower`, `CalcHiddenPowerParams`, `UpdateVar BTLVAR_POWER_MULTI …`, etc.) run **before** `CalcCrit`/`CalcDamage` in the script and write `battleCtx->movePower`, `battleCtx->moveType`, `battleCtx->powerMul`.
   - `CalcCrit` → `BtlCmd_CalcCrit` (`P:src/battle/battle_script.c:2150-2168`) → `BattleSystem_CalcCriticalMulti` (§2).
   - `CalcDamage` → `BtlCmd_CalcDamage` (`P:src/battle/battle_script.c:1380-1389`):
     ```c
     BattleScript_CalcMoveDamage(battleSys, battleCtx);                           // base damage (+2), ×crit, Life Orb, Metronome, Me First
     battleCtx->damage = BattleSystem_CalcDamageVariance(battleSys, battleCtx, battleCtx->damage); // random 85..100 %
     battleCtx->damage *= -1;                                                      // damage is stored NEGATIVE from here on
     ```
     `BattleScript_CalcMoveDamage` (`P:src/battle/battle_script.c:1323-1365`):
     ```c
     battleCtx->damage = BattleSystem_CalcMoveDamage(... battleCtx->movePower, moveType, attacker, defender, battleCtx->criticalMul);
     battleCtx->damage *= battleCtx->criticalMul;                                                          // ×2 (×3 Sniper)
     if (heldItemEffect == HOLD_EFFECT_HP_DRAIN_ON_ATK)  damage = damage * (100 + itemPower) / 100;       // Life Orb: ×130/100
     if (heldItemEffect == HOLD_EFFECT_BOOST_REPEATED)   damage = damage * (10 + metronomeTurns) / 10;     // Metronome item
     if (meFirst && (meFirstTurnOrder - meFirstTurnNumber) < 2) damage = damage * 15 / 10;                 // Me First ×1.5
     ```
     `CalcMaxDamage` (`P:src/battle/battle_script.c:1402-1409`) is the same **without** the random step (used by Spit Up).
2. **`BATTLE_CONTROL_TRY_MOVE`** (`BattleControllerPlayer_TryMove`, `P:src/battle/battle_controller_player.c:3237-3296`): target validity → redirection abilities → accuracy → hit overrides (Protect, No Guard, semi-invulnerable) → **`TRY_MOVE_STATE_CHECK_TYPE_CHART`** (line 3275) → immunity abilities (Volt Absorb etc., line 3283).
   - `BattleControllerPlayer_CheckTypeChart` (`P:src/battle/battle_controller_player.c:2350-2373`) calls `BattleSystem_ApplyTypeChart` **only if**: move range is not USER/USER_SIDE, `MOVE_DATA.power != 0`, `SYSCTL_IGNORE_IMMUNITIES` is clear, `SYSCTL_FIRST_OF_MULTI_TURN` is clear — or the move is Thunder Wave. This is where **STAB, type effectiveness, Filter/Solid Rock, Expert Belt, Tinted Lens** are applied (§1.9, §4), on the already-negative, already-randomized damage.
3. `BATTLE_CONTROL_UPDATE_HP` (`BattleControllerPlayer_UpdateHP`, `P:src/battle/battle_controller_player.c:3341-3462`): OHKO → damage = −maxHP; Substitute; False Swipe leaves 1 HP; Endure / Focus Sash / Focus Band leave 1 HP; records physical/special damage taken (for Counter/Mirror Coat/Metal Burst/Revenge/Focus Punch); then `subscript_update_hp`.
4. `subscript_update_hp.s` (`P:res/battle/scripts/subscripts/subscript_update_hp.s`) calls `BATTLE_SUBSCRIPT_TYPE_RESIST_BERRY`: if the move was super effective and the defender holds the matching `HOLD_EFFECT_WEAKEN_SE_*` berry (or Chilan for any Normal move), `DivideVarByValue BTLVAR_HP_CALC_TEMP, 2` (→ `BattleSystem_Divide`, min magnitude 1) and the berry is consumed (`subscript_type_resist_berry.s` lines `_245`..).

So the **complete order** for a normal damaging move is:

```
base = CalcMoveDamage(...)            // §1.1–1.8, returns (…)+2
× criticalMul                          // 1 / 2 / 3
× (100+30)/100  if Life Orb
× (10+metronomeTurns)/10  if Metronome item
× 15/10  if Me First-boosted
× (100 - rand%16) / 100, min 1         // random 85..100
negate
× 15/10 (or ×2 Adaptability)  if STAB
per type-chart entry: ×20/10 | ×5/10 | ×0  (BattleSystem_Divide: min magnitude 1 unless ×0)
× 3/4 (BattleSystem_Divide) if SE and defender Filter/Solid Rock (MB)
× (100+20)/100 if SE and Expert Belt
× 2 if NVE and Tinted Lens
[HP update] Endure/Sash/Band → leave 1 HP; type-resist berry ÷2 (min 1)
```

Notes: there is **no final floor-to-1 after the type chart** other than the per-step `BattleSystem_Divide` behaviour (it never returns 0 from a non-zero dividend). Multi-hit moves reload the move script for each hit and re-run **everything** (new crit roll, new random roll, new type chart) — `BattleControllerPlayer_LoopMultiHit` (`P:src/battle/battle_controller_player.c:3777-3820`); `BattleSystem_SetupLoop` (`P:src/battle/battle_lib.c:3357-3362`) resets only `moveStatusFlags` and `criticalMul`, **not** `movePower`/`powerMul`.

---

## 1. `BattleSystem_CalcMoveDamage` line by line

`P:src/battle/battle_lib.c:6601-7079` (signature 6601-6611):

```c
int BattleSystem_CalcMoveDamage(BattleSystem *battleSys, BattleContext *battleCtx, int move,
    u32 sideConditions, u32 fieldConditions, u16 inPower, u8 inType, u8 attacker, u8 defender, u8 criticalMul)
```

Variables: `s32 damage, stageDivisor; u16 attackStat, defenseStat, spAttackStat, spDefenseStat; s8 *Stage; u8 attackerLevel; u16 movePower;` — note **stats and movePower are `u16`** (all the intermediate ×150/100 etc. are computed in int then truncated back to u16; harmless for real stat ranges).

### 1.1 Inputs (6634-6675)

- Stats read raw from the battle mon (`BATTLEMON_ATTACK` etc.) — these are the calculated stats (nature/EV/IV) with no badge boost (there are no badge boosts in gen 4; nothing in this routine or elsewhere applies one).
- Stages = stored stage − 6 (`s8`, so −6..+6).
- `heldItemEffect` / `heldItemPower` from `Battler_HeldItem` (Klutz/Embargo → none) via `BattleSystem_GetItemData(... ITEM_PARAM_HOLD_EFFECT / ITEM_PARAM_EFFECT_PARAM)`.

### 1.2 Power and type (6680-6688)

```c
if (inPower == 0) movePower = MOVE_DATA(move).power; else movePower = inPower;            // 6680-6684
if (ability == ABILITY_NORMALIZE) moveType = TYPE_NORMAL;
else if (inType == TYPE_NORMAL)   moveType = MOVE_DATA(move).type;                         // NB: inType 0 == TYPE_NORMAL == "use move data"
else                              moveType = inType & 0x3F;                                 // 6672-6678
GF_ASSERT(battleCtx->powerMul >= 10);
movePower = movePower * battleCtx->powerMul / 10;                                          // 6688  (powerMul: 10 normal, 20 for "double power" moves, 12 Reckless)
```
Quirk: a script that computes `movePower = 0` (e.g. Return at friendship 0-2) falls back to the move's data power, which is **1** for these moves (`res/moves/return/data.json: "power": 1`), so minimum effective power is 1, not 0.

### 1.3 Power modifiers, in order

| # | Line | Condition | Effect |
|---|------|-----------|--------|
| a | 6690-6692 | attacker has `MOVE_EFFECT_CHARGE` and move is Electric | `movePower *= 2` |
| b | 6694-6696 | `turnFlags[attacker].helpingHand` | `movePower = movePower * 15 / 10` |
| c | 6698-6702 | attacker Technician, move != Struggle, `movePower <= 60` (after a,b) | `×15/10` |
| d | 6706-6708 | attacker Huge Power / Pure Power | `attackStat *= 2` |
| e | 6709-6714 | attacker Slow Start and `(totalTurns - slowStartTurnNumber) < 5` | `attackStat /= 2` |
| f | 6716-6722 | attacker held type-boost item matching `moveType` (`sTypeBoostingItems`, 6514-6548: all 17 `HOLD_EFFECT_STRENGTHEN_*` items **and all 16 `HOLD_EFFECT_ARCEUS_*` plates**) | `movePower = movePower * (100 + heldItemPower) / 100` — every such item has `effectParam 20` (e.g. `res/items/data/charcoal.json`, `flame_plate.json`, `silk_scarf.json`) → ×120/100 |
| g | 6724-6726 | Choice Band (`HOLD_EFFECT_CHOICE_ATK`) | `attackStat = attackStat * 150 / 100` |
| h | 6727-6729 | Choice Specs (`HOLD_EFFECT_CHOICE_SPATK`) | `spAttackStat = ×150/100` |
| i | 6730-6734 | attacker Soul Dew, not Battle Frontier (`BATTLE_TYPE_FRONTIER`), species Latios/Latias | `spAttackStat ×150/100` |
| j | 6735-6739 | defender Soul Dew (same conditions) | `spDefenseStat ×150/100` |
| k | 6740-6743 | Deep Sea Tooth (`CLAMPERL_SPATK`) on Clamperl | `spAttackStat *= 2` |
| l | 6744-6747 | Deep Sea Scale on Clamperl (defender) | `spDefenseStat *= 2` |
| m | 6748-6751 | Light Ball (`PIKA_SPATK_UP`) on Pikachu | **`movePower *= 2`** (applies to both classes because it's a power boost) |
| n | 6752-6755 | Metal Powder on Ditto (defender) | `defenseStat *= 2` (no transformed check) |
| o | 6756-6759 | Thick Club on Cubone/Marowak | `attackStat *= 2` |
| p | 6760-6764 | Adamant Orb, Dialga, Dragon/Steel move | `movePower ×(100+20)/100` |
| q | 6765-6769 | Lustrous Orb, Palkia, Dragon/Water | `×120/100` |
| r | 6770-6775 | Griseous Orb, Giratina, Dragon/Ghost, **not Transformed** | `×120/100` |
| s | 6776-6779 | Muscle Band (`POWER_UP_PHYS`, param 10) and `moveClass == CLASS_PHYSICAL` | `movePower ×110/100` |
| t | 6780-6783 | Wise Glasses (`POWER_UP_SPEC`, param 10) and special | `×110/100` |
| u | 6785-6788 | defender Thick Fat *(MB)*, Fire or Ice move | `movePower /= 2` |
| v | 6790-6792 | attacker Hustle | `attackStat ×150/100` |
| w | 6793-6795 | attacker Guts and any non-volatile status | `attackStat ×150/100` |
| x | 6797-6800 | defender Marvel Scale *(MB)* and defender statused | `defenseStat ×150/100` |
| y | 6802-6809 | attacker Plus with a living Minus on its side / Minus with Plus (`COUNT_ALIVE_BATTLERS_OUR_SIDE`, `battle_lib.c:2870`) | `spAttackStat ×150/100` |
| z | 6811-6817 | Mud Sport active on any battler & Electric / Water Sport & Fire | `movePower /= 2` |
| aa | 6819-6839 | Overgrow/Blaze/Torrent/Swarm, matching type, `curHP <= maxHP / 3` | `movePower ×150/100` |
| ab | 6841-6844 | Fire move vs Heatproof *(MB)* | `movePower /= 2` |
| ac | 6845-6848 | Fire move vs Dry Skin *(MB)* | `movePower ×125/100` |
| ad | 6850-6866 | attacker Simple | `attackStage *= 2`, `spAttackStage *= 2`, clamped to −6..+6 |
| ae | 6868-6884 | defender Simple *(MB)* | `defenseStage`, `spDefenseStage` `*= 2`, clamped |
| af | 6886-6889 | defender Unaware *(MB)* | attacker's Atk/SpA stage = 0 |
| ag | 6891-6894 | attacker Unaware | defender's Def/SpD stage = 0 |
| — | 6896-6899 | | stages += 6 (back to 0..12 index) |
| ah | 6901-6912 | Rivalry, both gendered: same gender `×125/100`; different `×75/100` | `movePower` |
| ai | 6914-6919 | Iron Fist and move in `sPunchingMoves` (6565-6581: Ice/Fire/Thunder/Mach/Focus/Dizzy/Dynamic Punch, Hammer Arm, Mega Punch, Comet Punch, Meteor Mash, Shadow Punch, Drain Punch, Bullet Punch, Sky Uppercut) | `movePower = movePower * 12 / 10` |
| aj | 6921-6941 | if `NO_CLOUD_NINE`: Sun & attacker Solar Power → `spAttackStat ×15/10`; **Sandstorm & defender Rock-type (type1 or type2) → `spDefenseStat ×15/10`**; Sun & a living Flower Gift on attacker's side (incl. self) → `attackStat ×15/10`; Sun & attacker not Mold Breaker & living Flower Gift on defender's side → `spDefenseStat ×15/10` | |
| ak | 6943-6945 | `MOVE_DATA(move).effect == BATTLE_EFFECT_HALVE_DEFENSE` (Self-Destruct, Explosion; effect 7) | `defenseStat = defenseStat / 2` |

### 1.4 Core formula (physical: 6947-6991; special: 6992-7032)

Class is per move (`MOVE_DATA(move).class`, `CLASS_PHYSICAL` / `CLASS_SPECIAL`, read at 6704). Physical uses Atk/Def; special uses SpA/SpD. Otherwise identical:

```c
// attacking stat with stage
if (criticalMul > 1) {
    if (attackStage > 6) damage = attackStat * num[attackStage] / den[attackStage];   // positive stages KEPT on crit
    else                 damage = attackStat;                                          // negative stages IGNORED on crit
} else {
    damage = attackStat * num[attackStage] / den[attackStage];
}
damage *= movePower;                              // 6960
damage *= (attackerLevel * 2 / 5 + 2);            // 6961  — floor(L*2/5)+2
// defending stat with stage
if (criticalMul > 1) {
    if (defenseStage < 6) stageDivisor = defenseStat * num / den;                      // negative stages KEPT on crit
    else                  stageDivisor = defenseStat;                                  // positive stages IGNORED on crit
} else {
    stageDivisor = defenseStat * num / den;
}
damage /= stageDivisor;                           // 6975
damage /= 50;                                     // 6976
```
Stage table `sStatStageBoosts` (`P:src/battle/battle_lib.c:6550-6563`), `{numerator, denominator}`, index = stage 0..12:
```
-6:{10,40} -5:{10,35} -4:{10,30} -3:{10,25} -2:{10,20} -1:{10,15} 0:{10,10}
+1:{15,10} +2:{20,10} +3:{25,10} +4:{30,10} +5:{35,10} +6:{40,10}
```
i.e. stat × 2/(2−s) for s<0 (as 10/(10+5|s|)), stat × (2+s)/2 for s>0 — each applied as a single `*num/den` with one truncation.

Then (physical only, 6978-6980): **Burn** and attacker's ability != Guts → `damage /= 2`. (Special moves are never halved by burn.)

Screens (physical 6982-6990 / special 7023-7031): Reflect / Light Screen on the **defender's** side, `criticalMul == 1`, and move effect != `BATTLE_EFFECT_REMOVE_SCREENS` (Brick Break) → in **doubles** with 2 living battlers on the defender's side (`BattleSystem_CountAliveBattlers(TRUE, defender) == 2`, `battle_lib.c:2825`) `damage = damage * 2 / 3`, otherwise `damage /= 2`. Crits ignore screens.

### 1.5 Spread-move reduction (7034-7043)

Doubles only:
- `range == RANGE_ADJACENT_OPPONENTS` (Rock Slide, Blizzard, Heat Wave …) and 2 living battlers on the defender's side → `damage = damage * 3 / 4`.
- `range == RANGE_ALL_ADJACENT` (Earthquake, Surf, Explosion, Discharge …) and `CountAliveBattlers(FALSE, defender) >= 2` (living battlers other than the defender, both sides) → `×3/4`.

Applied once per target, regardless of how many are actually hit by immunity etc.

### 1.6 Weather (7045-7072), only if `NO_CLOUD_NINE`

```c
if (RAIN)  { Fire: damage /= 2;  Water: damage = damage * 15 / 10; }
if ((fieldConditions & FIELD_CONDITION_SOLAR_DOWN) && move == MOVE_SOLAR_BEAM) damage /= 2;   // SOLAR_DOWN = rain|sandstorm|hail|fog (condition.h:136-139)
if (SUN)   { Fire: damage = damage * 15 / 10;  Water: damage /= 2; }
```
Uses `moveType` (post Normalize / Hidden Power / Weather Ball / Judgment / Natural Gift), so e.g. Fire Weather Ball gets the sun boost.

### 1.7 Flash Fire (7074-7076)

`BATTLEMON_FLASH_FIRE` set and Fire move → `damage = damage * 15 / 10`. (Set when the mon absorbs a Fire move via `subscript_absorb_and_boost_fire_type_moves`.)

### 1.8 Return (7078)

`return damage + 2;` — the +2 is added **after** ÷50, burn, screens, spread, weather and Flash Fire (this differs from the textbook formula where +2 comes right after ÷50). Sandstorm SpD and Solar Power/Flower Gift are stat multipliers (applied before the division), not damage multipliers.

### 1.9 Post-routine steps (outside `CalcMoveDamage`)

- `BattleScript_CalcMoveDamage` (`P:src/battle/battle_script.c:1334-1365`): `×criticalMul`; Life Orb `×(100+30)/100` (`res/items/data/life_orb.json effectParam 30`); Metronome item `×(10+metronomeTurns)/10` (`metronome.json effectParam 10` is unused here; turns 0..10 → ×1.0..×2.0); Me First `×15/10`.
- `BattleSystem_CalcDamageVariance` (`P:src/battle/battle_lib.c:7081-7094`):
  ```c
  if (damage) { damage *= (100 - (RandNext() % 16)); damage /= 100; if (damage == 0) damage = 1; }
  ```
  i.e. uniform 85..100 %, floor, min 1.
- Negation (`BtlCmd_CalcDamage`, 1387).
- `BattleSystem_ApplyTypeChart` (`P:src/battle/battle_lib.c:2560-2679`) via the controller (§0 step 2):
  ```c
  if (move == MOVE_STRUGGLE) return damage;                                                   // 2573: Struggle is typeless, no STAB
  if (!(SYSCTL_IGNORE_TYPE_CHECKS) && MON_HAS_TYPE(attacker, moveType)) {                      // 2591
      if (Adaptability) damage *= 2; else damage = damage * 15 / 10;                           // 2593-2597  STAB
  }
  if (Levitate(MB) && Ground && defender item != Iron Ball)      *mask |= MOVE_STATUS_LEVITATED;      // 2600-2603
  else if (magnetRiseTurns && !Ingrain && Ground && !Iron Ball)  *mask |= MOVE_STATUS_MAGNET_RISE;    // 2604-2608
  else { walk sTypeMatchupMultipliers (§4): for each matching {moveType, defType, mul}:
           damage = ApplyTypeMultiplier(...) → BattleSystem_Divide(damage * mul, 10)  (mul ∈ {0,5,20}) }  // 2612-2646
  // Wonder Guard (MB): if move is on damaging turn, not SE (or both flags set), and data power != 0 → immune  // 2649-2655
  else if (!IGNORE_TYPE_CHECKS && !IGNORE_IMMUNITIES) {
      if (SE && data power) { Filter/Solid Rock(MB): damage = BattleSystem_Divide(damage * 3, 4);            // 2658-2661
                              Expert Belt: damage = damage * (100 + 20) / 100; }                             // 2663-2665
      if (NVE && data power) { Tinted Lens: damage *= 2; }                                                   // 2668-2671
  } else { clear SE/NVE flags }
  ```
  `BattleSystem_Divide` (`P:src/battle/battle_lib.c:3599-3617`): `0 → 0`; otherwise `x/den`, and if the truncated quotient is 0 it returns ±1 (sign of dividend). So each ×½ step has minimum magnitude 1, and ×0 gives exactly 0. Because damage is negative at this point, the sign handling matters: `−7 * 5 / 10 = −3` (toward zero).
  `ApplyTypeMultiplier` (`P:src/battle/battle_lib.c:7542-7580`): skips the damage change (but still updates the SE/NVE/immune flags) when `SYSCTL_IGNORE_TYPE_CHECKS` or `SYSCTL_IGNORE_IMMUNITIES` is set or damage == 0; flag updates for SE/NVE only when `update`(=data power) != 0. SE cancels a pending NVE flag and vice versa (so 2×½ shows as neutral).

---

## 2. Critical hits

`BattleSystem_CalcCriticalMulti` (`P:src/battle/battle_lib.c:7105-7147`), called from `BtlCmd_CalcCrit` (`P:src/battle/battle_script.c:2150-2168`, which forces no crit in the catch tutorial / first battle).

```c
effectiveCritStage = (Focus Energy ? 2 : 0)
                   + (itemEffect == HOLD_EFFECT_CRITRATE_UP)                                 // Scope Lens, Razor Claw (both param 0)
                   + criticalStage                                                             // battleCtx->criticalBoosts, +1 from high-crit move scripts
                   + (ability == ABILITY_SUPER_LUCK)
                   + 2 * (Lucky Punch on Chansey)
                   + 2 * (Stick on Farfetch'd);                                                 // 7123-7128
if (effectiveCritStage > 4) effectiveCritStage = 4;                                             // 7130-7132
if (RandNext() % sCriticalStageRates[stage] == 0                                                // {16, 8, 4, 3, 2} → 1/16, 1/8, 1/4, 1/3, 1/2  (7097-7103)
    && !BattleArmor(MB) && !ShellArmor(MB) && !(defender side LUCKY_CHANT) && !(defender MOVE_EFFECT_NO_CRITICAL)) criticalMul = 2;   // 7134-7140
if (criticalMul == 2 && attacker Sniper) criticalMul = 3;                                       // 7142-7144
```
`MOVE_EFFECT_NO_CRITICAL` is "checked for, but never set" (`P:include/constants/battle/moves.h:23`).

High-crit moves add `UpdateVar OPCODE_ADD, BTLVAR_CRITICAL_BOOSTS, 1` in their effect script: effect 43 `HIGH_CRITICAL` (Slash, Razor Leaf, Crabhammer, Karate Chop, Aeroblast, Cross Chop, Leaf Blade, Night Slash, Psycho Cut, Shadow Claw, Stone Edge, Attack Order, Spacial Rend, Cross Poison…) — `effect_script_0043.s`; effect 39 Razor Wind, 75 Sky Attack (`effect_script_0039.s:_031`, `0075.s:_026`); 200 Blaze Kick, 209 Poison Tail/Cross Poison (same pattern). Focus Energy = `VOLATILE_CONDITION_FOCUS_ENERGY` (effect 47, `effect_script_0047.s`), Lucky Chant = `SIDE_CONDITION_LUCKY_CHANT` (effect 240).

Damage effect: `damage *= criticalMul` immediately after the base routine (§1.9) — before Life Orb, random, STAB and type. Crit also (a) ignores attacker's negative and defender's positive stages (§1.4), (b) ignores Reflect/Light Screen (§1.4). It does **not** ignore burn, Unaware, Simple, items, or weather.

HGSS: identical (`H:src/battle/overlay_12_0224E4FC.c:5960-5994`, `TryCriticalHit`).

---

## 3. Moves with special damage handling

Effect IDs from `P:build/generated/battle_move_effects.h`; effect scripts in `P:res/battle/scripts/effects/effect_script_<id>.s`; subscripts in `P:res/battle/scripts/subscripts/`. Script opcodes: `UpdateVar OPCODE_DIV` is plain truncating `/=` (`P:src/battle/battle_script.c:2713-2715`); `DivideVarByValue` uses `BattleSystem_Divide` (min magnitude 1) (`P:src/battle/battle_script.c:4406-4416`); `Random range, offset` → `calcTemp = rand % (range+1) + offset` (`P:src/battle/battle_script.c:3200-3210`).

`SYSCTL_IGNORE_TYPE_CHECKS` (`system_control.h:15`) = no STAB, no type multiplier applied to damage, no Expert Belt/Filter/Tinted Lens, **but immunities still block** (flags still set → `noEffect`). `SYSCTL_IGNORE_IMMUNITIES` (`:19`) = the controller never calls `ApplyTypeChart` at all (§0 step 2) → no STAB, no type, hits Ghosts, Wonder Guard bypassed.

### 3.1 Fixed damage (all set `SYSCTL_IGNORE_TYPE_CHECKS`; all stored negative; no crit, no random, no STAB)
| Move(s) | Effect / script | Damage |
|---|---|---|
| Seismic Toss, Night Shade | 87 `LEVEL_DAMAGE_FLAT` — `effect_script_0087.s` | `−level` |
| Dragon Rage | 41 `40_DAMAGE_FLAT` — `0041.s` | `−40` (fails under `BTLVAR_REGULATION_FLAG`) |
| SonicBoom | 130 `20_DAMAGE_FLAT` — `0130.s` | `−20` (same regulation fail) |
| Psywave | 88 `RANDOM_DAMAGE_1_TO_150_LEVEL` — `0088.s` | `Random 10, 5` → r ∈ 5..15; `damage = level * r / 10` (plain `/`), if 0 → 1; negate. i.e. 50 %..150 % of level in 10 % steps |
| Super Fang | 40 `HALVE_HP` — `0040.s` | `damage = −curHP` then `DivideVarByValue 2` → `BattleSystem_Divide(−curHP, 2)`, min 1 |
| Endeavor | 189 `SET_HP_EQUAL_TO_USER` — `0189.s` | fails if `defender curHP <= attacker curHP`; else `−(defCurHP − atkCurHP)` |
| Counter | 89 — `0089.s` + `BtlCmd_Counter` `P:src/battle/battle_script.c:4615-4655` | `damage = physicalDamageTakenFrom[lastAttacker] * 2` (value already negative); requires last physical hitter alive & on other side; redirected to Follow Me user |
| Mirror Coat | 144 — `0144.s` + `BtlCmd_MirrorCoat` 4668-4708 | same with `specialDamageTakenFrom` |
| Metal Burst | 227 — `0227.s` + `BtlCmd_TryMetalBurst` 7153-7186 | `damage = lastDamageTaken * 15 / 10` (plain, negative), any class, last attacker on other side |
| Bide | 26 — `0026.s`, `subscript_bide_start/end.s`, release in `BattleControllerPlayer_CheckStatusDisruption` `P:src/battle/battle_controller_player.c:2695-2725` | `damage = storedDamage[attacker] * 2` (sum of HP lost while biding, `storedDamage` accumulated at `battle_controller_player.c:3407`). **No IGNORE flag is set**, and Bide's data power is 1, so the controller's `CheckTypeChart` runs: per code, STAB ×1.5 applies if the user is Normal-type and Ghost immunity applies. Fails ("but it failed") if stored damage is 0. |
| OHKO (Fissure, Guillotine, Horn Drill, Sheer Cold) | 38 — `0038.s` + `BtlCmd_TryOHKOMove` 4334-4395 | hit chance `accuracy + (atkLevel − defLevel)` %, must have `atkLevel >= defLevel`; Sturdy *(MB)* blocks; No Guard / Lock-On bypass; `damage = −curHP`, and `UpdateHP` sets `−maxHP` when `MOVE_STATUS_ONE_HIT_KO` (3343-3345) |

`physicalDamageTakenFrom` / `specialDamageTakenFrom` are set in `UpdateHP` by the **move's class** (`battle_controller_player.c:3413-3425`) with the final negative damage (after Endure/Sash clipping, before the actual HP write).

### 3.2 Multi-hit
- `BtlCmd_SetMultiHit` (`P:src/battle/battle_script.c:2634-2660`): `hits == 0` → Skill Link: 5; else `r = rand & 3; if r < 2 hits = r + 2 else hits = (rand & 3) + 2`. Distribution: 2 hits 3/8, 3 hits 3/8, 4 hits 1/8, 5 hits 1/8.
- Effect 29 `MULTI_HIT` (`0029.s`): `SetMultiHit 0, SYSCTL_MULTI_HIT_MOVE` (later hits skip accuracy — `system_control.h:87-92`). Effect 77 `POISON_MULTI_HIT` Twineedle (`0077.s`) and 44 `HIT_TWICE` Double Kick / Bonemerang / Double Hit (`0044.s`): `SetMultiHit 2`.
- Effect 104 `HIT_THREE_TIMES` Triple Kick (`0104.s`): `SetMultiHit 3, SYSCTL_TRIPLE_KICK` (accuracy checked each hit) and `UpdateVar OPCODE_ADD, BTLVAR_MOVE_POWER, 10`. `movePower` is **not** reset between hits (`BattleSystem_SetupLoop` 3357-3362 resets only flags/crit), so hits use power 10 / 20 / 30. Note in `CalcMoveDamage` `inPower == 0` would fall back to data power 10; here inPower is 10 on hit 1 so it's 10 either way.
- Each hit re-runs crit, base damage, random and type chart (§0). Loop ends early on target faint, attacker put to sleep, or `MOVE_STATUS_MULTI_HIT_DISRUPTED` (`LoopMultiHit` 3777-3820).
- Beat Up (154, `0154.s` + `BtlCmd_BeatUp` 6173-6250): sets `SYSCTL_IGNORE_IMMUNITIES`; per eligible party mon (in party order): `damage = baseAtk(species,form) * MOVE_DATA.power(10) * (level*2/5 + 2) / baseDef(defender species,form) / 50; damage += 2; damage *= criticalMul; Helping Hand ×15/10; random; negate`. Crit rolled once per hit (script `CalcCrit` before `BeatUp`). No stat stages, no items, no abilities, no STAB, no type chart, no burn, no screens.

### 3.3 Recoil / drain / self-damage
- Take Down, Submission (48 `RECOIL_QUARTER`, `0048.s`): recoil `subscript_recoil_1_4.s`; Double-Edge, Brave Bird, Flare Blitz, Volt Tackle, Wood Hammer (198/253/262): `subscript_recoil_1_3.s`; Head Smash (269): `subscript_recoil_1_2.s`. Recoil = `DivideVarByValue(BTLVAR_HIT_DAMAGE, 4|3|2)` on the HP actually lost (`hitDamage`), min 1, skipped by Rock Head / Magic Guard. **Reckless**: script sets `BTLVAR_POWER_MULTI 12` (`0048.s:_000`, `0198.s`, `0253.s`, `0262.s`, `0269.s`) → `movePower ×12/10` inside `CalcMoveDamage` (§1.2). Jump Kick/Hi Jump Kick crash damage: `subscript_crash_on_miss.s` (not a damage-calc matter).
- Struggle (254, `0254.s` + `subscript_struggle.s`): normal damage calc with data power 50, **typeless** (`ApplyTypeChart` returns early, 2573 — no STAB, no immunities), Technician excluded (6699); recoil = `BattleSystem_Divide(−maxHP, 4)` (¼ max HP, min 1), not blocked by Rock Head (script has no such check).
- Absorb/Mega Drain/Giga Drain/Leech Life/Drain Punch (3): `subscript_drain_half_damage_dealt.s`: heal = `BattleSystem_Divide(hitDamage, 2)`; Big Root (`HOLD_EFFECT_LEECH_BOOST`) `×(100+param)/100`; Liquid Ooze reverses.
- Dream Eater (92, `0092.s`): fails unless target asleep; `subscript_dream_eater.s` same heal formula.
- Self-Destruct/Explosion (7 `HALVE_DEFENSE`, `0007.s`): user HP set to 0 before the hit (unless Damp on field); `CalcMoveDamage` halves `defenseStat` (6943-6945).
- Memento/Healing Wish etc. not damage.

### 3.4 Variable power (all feed `battleCtx->movePower` → `inPower`)
| Move | Effect | Where | Power |
|---|---|---|---|
| Hidden Power | 135 | `BtlCmd_CalcHiddenPowerParams` 6007-6032 | power = `(Σ bit1 of IVs in order HP,Atk,Def,Spe,SpA,SpD as bits 0..5) * 40 / 63 + 30` (30..70); type = `(Σ bit0 …) * 15 / 63 + 1`, skipping `TYPE_MYSTERY` (index shifts by one past it) |
| Return | 121 | `0121.s` | `friendship * 10 / 25` (→ min 1 via data power fallback) |
| Frustration | 123 | `0123.s` | `(friendship − 255) * −10 / 25` = `(255−f)*10/25` |
| Present | 122 | `BtlCmd_Present` 5789-5806 | `r = rand & 0xFF`: `r < 102` → 40; `< 178` → 80; `< 204` → 120; else heal target `BattleSystem_Divide(maxHP,4)` (sets IGNORE_IMMUNITIES for the heal branch) |
| Magnitude | 126 | `BtlCmd_CalcMagnitudePower` 5820-5852 | `r = rand % 100`: <5→10 (M4), <15→30, <35→50, <65→70, <85→90, <95→110, else 150 (M10); `0126.s` also sets `HIT_DURING_DIG` and `POWER_MULTI 20` if target underground |
| Flail / Reversal | 99 | `BtlCmd_CalcFlailPower` 4958-4971 + table 4941-4948 | `p = App_PixelCount(curHP, maxHP, 64)` = `curHP*64/maxHP`, min 1 if curHP>0 (`P:src/unk_0208C098.c:41-49`); p ≤1→200, ≤5→150, ≤12→100, ≤21→80, ≤42→40, else 20 |
| Rollout / Ice Ball | 117 | `BtlCmd_CalcRolloutPower` 5661-5688 | `power = base * 2^(turnIndex)` (turn 1..5 → ×1..×16), `×2` more if `VOLATILE_CONDITION_DEFENSE_CURL` |
| Fury Cutter | 119 | `BtlCmd_CalcFuryCutterPower` 5700-5714 | counter capped at 5; `power = base * 2^(count−1)` (10,20,40,80,160) |
| Pursuit | 128 | `0128.s` (normal) / `subscript_pursuit.s` + `BtlCmd_TryPursuit` 6884-6961 | on a switching/U-turning target: `powerMul = 20` (6928 / subscript `_001`), executed before the switch with its own `CalcCrit`/`CalcDamage`/`ApplyTypeEffectiveness` |
| Rage | 81 | `0081.s` → `subscript_set_rage_flag.s`; Atk +1 when hit (`subscript_rage_is_building.s`) | normal damage |
| Low Kick / Grass Knot | 196 | `BtlCmd_CalcWeightBasedPower` 6808-6826, `P:include/data/battle/weight_to_power.h` | defender `weight` (0.1 kg units): ≤100→20, ≤250→40, ≤500→60, ≤1000→80, ≤2000→100, else 120 |
| Solar Beam | 151 | `0151.s`; damage halved in `CalcMoveDamage` 7058-7060 when `FIELD_CONDITION_SOLAR_DOWN` (rain/sand/hail/fog) | charge skipped in sun |
| Weather Ball | 203 | `BtlCmd_CalcWeatherBallParams` 6843-6872 | any weather (and `NO_CLOUD_NINE`): power `50*2 = 100`, type Water/Rock/Fire/Ice; else 50 Normal |
| Facade | 169 | `0169.s` | `powerMul 20` if `MON_CONDITION_FACADE_BOOST` (poison/toxic/burn/paralysis, `condition.h:29`); burn still halves Atk |
| Revenge / Avalanche | 185 | `BtlCmd_CalcRevengePowerMul` 6525-6537 | `powerMul 20` if the **target** dealt physical or special damage to the user this turn, else 10 |
| Smelling Salt | 171 | `0171.s` | `powerMul 20` if target paralysed (and not behind Substitute); cures it after |
| Wake-Up Slap | 217 | `0217.s` | `powerMul 20` if target asleep; wakes it |
| Eruption / Water Spout | 190 | `BtlCmd_CalcHPFalloffPower` 6645-6657 | `150 * curHP / maxHP`, min 1 |
| Spit Up | 161 | `0161.s` | `power = stockpileCount * 100`; uses **`CalcMaxDamage` — no random 85-100 %**; stockpile Def/SpD boosts removed |
| Earthquake / Magnitude vs Dig | 147 / 126 | `0147.s`, `0126.s` | `powerMul 20` if target has `MOVE_EFFECT_UNDERGROUND` |
| Gust / Twister vs Fly, Bounce | 149 / 146 | `0149.s`, `0146.s` | `powerMul 20` if `MOVE_EFFECT_AIRBORNE` |
| Stomp vs Minimize | 150 | `0150.s` | `powerMul 20` if `MOVE_EFFECT_MINIMIZE` |
| Surf / Whirlpool vs Dive | 257 / 261 | `0257.s`, `0261.s` | `powerMul 20` if `MOVE_EFFECT_UNDERWATER` |
| Knock Off | 188 | `0188.s`, `subscript_knock_off.s` | normal damage (no boost in gen 4); removes item after |
| Focus Punch | 170 | `0170.s` | fails ("lost focus") if user took physical or special damage this turn; else normal |
| Brine | 221 | `0221.s` | `powerMul 20` if `defender curHP <= maxHP / 2` (`maxHP` plain `/2`) |
| Assurance | 231 | `0231.s` | power ×2 if `BTLVAR_DEFENDER_ASSURANCE_DAMAGE_MASK` non-zero (target lost HP this turn; set in `subscript_update_hp.s`) |
| Payback | 230 | `BtlCmd_CalcPaybackPower` 7198-7208 | ×2 if defender's action is already `BATTLE_CONTROL_MOVE_END` (moved this turn — includes switching/items) |
| Punishment | 245 | `BtlCmd_CalcPunishmentPower` 7354-7371 | `60 + 20 * Σ(positive stages of all 7 stats)`, cap 200 |
| Trump Card | 235 | `BtlCmd_CalcTrumpCardPower` 7233-7244, table 7210-7216 | PP remaining **after** deduction: 0→200, 1→80, 2→60, 3→50, ≥4→40 |
| Wring Out / Crush Grip | 237 | `BtlCmd_CalcWringOutPower` 7261-7268 | `1 + (120 * defCurHP) / defMaxHP` |
| Gyro Ball | 219 | `BtlCmd_CalcGyroBallPower` 7123-7133 | `1 + 25 * monSpeedValues[def] / monSpeedValues[atk]`, cap 150 (`monSpeedValues` = computed in-battle speeds) |
| Fling | 233 | `BtlCmd_TryFling` 8144-8154 → `BattleSystem_FlingItem` `battle_lib.c:5854`, power = item `flingPower` (`Battler_ItemFlingPower` 5491) | fails with no item / power 0 / Multitype+Griseous |
| Natural Gift | 222 | `BtlCmd_CalcNaturalGiftParams` 8088-8102 | power & type from berry (`naturalGiftPower`/`naturalGiftType` in item json); berry consumed |
| Judgment | 268 | `0268.s` | type from held plate's `HOLD_EFFECT_ARCEUS_*`; plates also give ×120/100 (§1.3 f) |
| Me First | 241 | `BtlCmd_TryMeFirst` 7286-7310; `×15/10` in `BattleScript_CalcMoveDamage` 1351-1362 | executes the target's chosen damaging move via `GoToMoveScript` |
| Feint | 223 | `BtlCmd_TryFeint` 7518-7528 | only works if target is Protecting (gen 4); normal damage |
| Sucker Punch | 248 | `BtlCmd_TrySuckerPunch` 7385-7405 | fails if target already moved or chose a 0-power move (unless struggling) |
| Last Resort | 246 | `BtlCmd_TryLastResort` 7567-7579 | needs `lastResortCount >= numMoves − 1` and ≥2 moves |
| Charge | 174 | `subscript_charge.s` → `MOVE_EFFECT_CHARGE`; `×2` Electric power in `CalcMoveDamage` 6690-6692 | |
| Helping Hand | 176 | `BtlCmd_TryHelpingHand` 6291-6314 sets partner `turnFlags.helpingHand`; `×15/10` power (6694) | doubles only; also ×15/10 on Beat Up and Future Sight damage |
| Fake Out | 158 | `0158.s` | only on `fakeOutTurnNumber == totalTurns`; normal damage + flinch |
| Uproar | 159 | `0159.s` | normal damage |
| Future Sight / Doom Desire | 148 | `BtlCmd_TryFutureSight` 6065-6100; hit via `subscript_future_sight_damage.s` | damage computed **at setup**: `CalcMoveDamage(..., inPower 0, inType 0, crit 1)`, negated, then `CalcDamageVariance`, then Helping Hand ×15/10; stored and applied 2 turns later as raw HP loss — **no crit, no STAB, no type chart, no Life Orb**, uses attacker's stats/items at setup time; `0148.s` sets `IGNORE_IMMUNITIES` + hits through Fly/Dig/Dive/Shadow Force |
| Thunder / Blizzard | 152 / 260 | `CheckMoveHitOverrides` `battle_controller_player.c:3022-3030` | accuracy only (never miss in rain / hail) |
| Spread moves | — | §1.5 | ×3/4 |
| Type-changing | Normalize (Normal), Weather Ball, Hidden Power, Judgment, Natural Gift | `moveType` param | STAB/type use the changed type |

### 3.4b Accuracy check — `BattleControllerPlayer_CheckMoveHitAccuracy` (`P:src/battle/battle_controller_player.c:2865-2981`), `CheckMoveHitOverrides` (3001-3044)
Never touches damage; `accuracy.ts` (`hitGen4`) uses it for the KO odds. HGSS is identical apart from
naming (`BattleSystem_CheckMoveHit`, `H:src/battle/battle_controller_player.c:2415-2551`). Runs in `TryMove` **after** the move's
script (3216-3218), so `BtlCmd_TryOHKOMove` has already set `SYSCTL_NONSTANDARD_ACC_CHECK` (2911) for
OHKO moves.
* Stages: `acc = accStage`, `eva = −evaStage`; attacker Simple doubles `acc`, target Simple *(MB)* doubles
  `eva`; target Unaware zeroes `acc`, attacker Unaware zeroes `eva`; Foresight / Miracle Eye zero a negative
  `eva`; `sum = clamp(6 + eva + acc, 0, 12)` → `HitRateByStage` (`P:include/data/hit_rate_stages.h`:
  33/36/43/50/60/75/100/133/166/200/233/266/300 %).
* `hitRate = accuracy` (0 = never misses: Swift, Aerial Ace, Bide, Struggle …); charge turns and
  nonstandard checks return early; Thunder in sun 50 (NO_CLOUD_NINE).
* Then, each `hitRate × k / 100` truncated, in this order: stage ratio → Compound Eyes 130 → Sand Veil
  *(MB)* in sand 80 → Snow Cloak *(MB)* in hail 80 → deep fog ×6/10 → Hustle 80 (class physical) → Tangled
  Feet *(MB)* while confused 50 → target `HOLD_EFFECT_ACC_REDUCE` (Bright Powder 10, Lax Incense 10) →
  attacker `ACCURACY_UP` (Wide Lens 10) → `ACCURACY_UP_SLOWER` (Zoom Lens 20, target already moved) →
  Micle Berry 120 → Gravity ×10/6.
* Miss iff `rand % 100 + 1 > hitRate` → hit chance `min(hitRate, 100) %`.
* `CheckMoveHitOverrides`: Protect; Lock-On / No Guard (either side) clear the miss; Thunder in rain and
  Blizzard in hail clear it (NO_CLOUD_NINE); then semi-invulnerable targets (Fly/Bounce, Dig, Dive, Shadow
  Force) are unhittable unless the effect script set `SYSCTL_HIT_DURING_*` (Gust, Twister, Thunder, Sky
  Uppercut / Earthquake, Magnitude / Surf, Whirlpool) or `MOVE_STATUS_BYPASSED_ACCURACY` (only OHKO with
  Lock-On / No Guard, `battle_script.c:4374`) — so No Guard does **not** reach a Fly target with a normal
  move.
* OHKO (`BtlCmd_TryOHKOMove`, `battle_script.c:4334-4395`): Sturdy *(MB)* blocks; No Guard / Lock-On hit
  if Lu ≥ Lt; else `hit = 30 + (Lu − Lt)`, `rand % 100 < hit` and Lu ≥ Lt (30 % at equal level).

### 3.5 Complete effect-ID → script list (generated by grepping the scripts)
Every effect script is `P:res/battle/scripts/effects/effect_script_<id>.s`; ids 0..276 as enumerated in `P:build/generated/battle_move_effects.h` (names listed there).

- Scripts containing `CalcDamage` (standard pipeline, §0/§1): 0 2 3 4 5 6 7 8 12 14 15 17 21 22 27 29 31 34 36 39 42 43 44 45 48 55 56 61 63 64 68 69 70 71 72 73 74 75 76 77 78 80 81 92 96 99 101 103 104 105 110 117 119 121 122 123 125 126 128 129 131 133 134 135 138 139 140 141 145 146 147 149 150 151 152 155 157 158 159 163 169 170 171 182 185 186 188 190 196 197 198 200 202 203 204 207 209 217 218 219 221 222 223 224 228 229 230 231 233 235 237 245 246 248 253 254 255 256 257 260 261 262 263 267 268 269 271 272 273 274 275 276.
- `CalcMaxDamage` (no random roll): 161 (Spit Up).
- Set `SYSCTL_IGNORE_TYPE_CHECKS` (fixed damage; immunities still apply): 40 (Super Fang), 41 (Dragon Rage), 87 (Seismic Toss/Night Shade), 88 (Psywave), 89 (Counter), 130 (SonicBoom), 144 (Mirror Coat), 189 (Endeavor), 227 (Metal Burst).
- Set `SYSCTL_IGNORE_IMMUNITIES` (type chart never consulted): 113 (Foresight), 122 (Present, heal branch only), 148 (Future Sight/Doom Desire), 154 (Beat Up), 216 (Miracle Eye).
- Write `BTLVAR_POWER_MULTI` (`powerMul`): 45 (Jump Kick/Hi Jump Kick — Reckless 12), 48 (Reckless 12), 126 (Magnitude vs Dig 20), 146/149 (vs Fly 20), 147 (vs Dig 20), 150 (vs Minimize 20), 169 (Facade 20), 171 (Smelling Salt 20), 198/253/262/269 (Reckless 12), 217 (Wake-Up Slap 20), 221 (Brine 20), 257/261 (vs Dive 20). Revenge (185) and Pursuit-on-switch set `powerMul` from C instead (`battle_script.c:6531`, `6928`).
- Add `BTLVAR_CRITICAL_BOOSTS`: 39 (Razor Wind), 43 (high-crit), 75 (Sky Attack), 200 (Blaze Kick), 209 (Poison Tail / Cross Poison).
- Damage set directly by C without `CalcDamage`: 26 (Bide, controller), 38 (OHKO), 89, 144, 227 (above).
- All other ids contain no damage command (status/utility effects).

---

## 4. Type chart and immunities

`sTypeMatchupMultipliers` (`P:src/battle/battle_lib.c:2399-2520`), entries `{attackType, defendType, mul}` with `TYPE_MULTI_IMMUNE = 0`, `NOT_VERY_EFF = 5`, `SUPER_EFF = 20` (`P:include/constants/battle.h:144-146`); applied as `damage = BattleSystem_Divide(damage * mul, 10)` per matching entry, once for type1 and once for type2 (only if type2 != type1).

Full table (attacker → defender: SE list / NVE list / immune):
```
Normal:   NVE Rock, Steel | immune Ghost*
Fire:     SE Grass, Ice, Bug, Steel | NVE Fire, Water, Rock, Dragon
Water:    SE Fire, Ground, Rock | NVE Water, Grass, Dragon
Electric: SE Water, Flying | NVE Electric, Grass, Dragon | immune Ground
Grass:    SE Water, Ground, Rock | NVE Fire, Grass, Poison, Flying, Bug, Dragon, Steel
Ice:      SE Grass, Ground, Flying, Dragon | NVE Water, Ice, Steel, Fire
Fighting: SE Normal, Ice, Rock, Dark, Steel | NVE Poison, Flying, Psychic, Bug | immune Ghost*
Poison:   SE Grass | NVE Poison, Ground, Rock, Ghost | immune Steel
Ground:   SE Fire, Electric, Poison, Rock, Steel | NVE Grass, Bug | immune Flying
Flying:   SE Grass, Fighting, Bug | NVE Electric, Rock, Steel
Psychic:  SE Fighting, Poison | NVE Psychic, Steel | immune Dark
Bug:      SE Grass, Psychic, Dark | NVE Fire, Fighting, Poison, Flying, Ghost, Steel
Rock:     SE Fire, Ice, Flying, Bug | NVE Fighting, Ground, Steel
Ghost:    SE Psychic, Ghost | NVE Dark, Steel | (Normal immune — listed under Normal)
Dragon:   SE Dragon | NVE Steel
Dark:     SE Psychic, Ghost | NVE Fighting, Dark, Steel
Steel:    SE Ice, Rock | NVE Fire, Water, Electric, Steel
```
`*` The two Ghost immunities (Normal→Ghost, Fighting→Ghost) sit after a `{0xFE,0xFE}` sentinel (2514-2517) and are skipped entirely when the defender has `VOLATILE_CONDITION_FORESIGHT` (Foresight / Odor Sleuth) or the attacker has **Scrappy** (2613-2622).

Per-entry override `BasicTypeMulApplies` (`P:src/battle/battle_lib.c:2529-2557`) returns FALSE (entry ignored) when:
- entry is Ground→Flying immune and defender holds **Iron Ball** (`HOLD_EFFECT_SPEED_DOWN_GROUNDED`) or has **Ingrain**;
- defender is **Roosting** this turn and entry's defend type is Flying (all Flying matchups vanish: Roost makes it non-Flying);
- **Gravity** active and entry is Ground→Flying immune;
- defender has **Miracle Eye** and entry is Psychic→Dark immune.

Ability immunities (in `ApplyTypeChart`, 2600-2608): **Levitate** *(MB)* vs Ground unless Iron Ball (Levitate is also nulled under Gravity or Ingrain by `Battler_Ability`, `battle_lib.c:3095-3104`); **Magnet Rise** vs Ground unless Ingrain / Iron Ball. **Wonder Guard** *(MB)* (2649-2655): blocks unless the move is flagged super effective (or both SE and NVE flags set, i.e. 4×½=neutral counts as "SE"), only on a damaging turn (`MoveIsOnDamagingTurn` 7588-7605 — bug: Fire Fang effect 273 is in that list, so Fire Fang always bypasses Wonder Guard, `P:docs/bugs_and_glitches.md:100`), and only if data power != 0.

Absorb-type abilities are separate (`BattleSystem_TriggerImmunityAbility`, `P:src/battle/battle_lib.c:3488-3548`, run in `TRY_MOVE_STATE_TRIGGER_IMMUNITY_ABILITIES` after the type chart; all *(MB)*): **Volt Absorb** (Electric, not self-targeted) heals ¼ max HP; **Water Absorb** (Water, power > 0, not first turn of Dive) heals ¼; **Flash Fire** (Fire, not frozen, power > 0 or Will-O-Wisp) sets the boost; **Motor Drive** (Electric) Speed +1; **Dry Skin** (Water, power > 0) heals ¼; **Soundproof** blocks `sSoundMoves`. Heal amount = `BattleSystem_Divide(maxHP, 4)`.

The type chart is applied to `battleCtx->damage` (negative) — so a ½ step on −1 stays −1, a ×0 step gives 0 and sets `MOVE_STATUS_INEFFECTIVE` → `moveFailFlags.noEffect` (`battle_controller_player.c:2367-2369`).

---

## 5. HGSS and DP differences

**HGSS** (`H:src/battle/overlay_12_0224E4FC.c`): `CalcMoveDamage` (5537-5947), `ApplyDamageRange` (5949-5958), `TryCriticalHit` (5964-5994, `sCritChance {16,8,4,3,2}` 5960), type chart `ov12_02251D28` (2228-2330) with `ov12_022583B4` (6450, per-entry `DamageDivide(damage*mul,10)`), `DamageDivide` (3110), `sTypeEffectiveness` (2083). Script side: `DamageCalcDefault` / `BtlCmd_CalcDamage` / `BtlCmd_CalcDamageRaw` (`H:src/battle/battle_command.c:747-798`) — crit ×, Life Orb, Metronome, Me First, then random, then negate. Controller applies the type chart at `H:src/battle/battle_controller_player.c:2094` (same TryMove stage).

A statement-by-statement comparison shows **no differences** from Platinum in: input gathering, the 37 power/stat modifiers and their order, stage table use, crit stage rules, ÷50, burn, screens (½ / ⅔), spread ¾, weather, Solar Beam, Flash Fire, `+2`, random 85-100, crit table, Sniper, STAB/Adaptability, type-chart walk, Foresight/Scrappy, Filter/Solid Rock (`DamageDivide(damage*3,4)`), Expert Belt, Tinted Lens, Wonder Guard. (The HGSS source writes Iron Fist as `movePower * BATTLE_SUBSCRIPT_UPDATE_STAT_STAGE / 10` — that constant is 12, `H:include/constants/battle_subscript.h:17` — a decomp naming artefact, same ×12/10.) Item parameters are read from HGSS's own item table; the values used by the calculator (type items/plates 20, Muscle Band/Wise Glasses 10, Expert Belt 20, Life Orb 30, orbs 20) are the same across gen 4 games per the Platinum data and the HGSS code paths; verify against HGSS `files/itemtool` if paranoid.

**DP**: `pokediamond` contains no decompiled battle engine (only `arm9/overlays/12/asm/overlay_12.s`, raw asm; `arm9/src/itemtool.c` is the only battle-adjacent C). No code-level diff is possible from these repos; the Platinum routine should be treated as the gen 4 reference. (Known documented DP-vs-Pt gameplay differences do not touch the damage formula itself.)

---

## 6. Checklist for a Gen 4 calculator

Each rule cites Platinum (`P:src/battle/battle_lib.c` unless noted).

1. Classify by **move class** (`MOVE_DATA.class`), not by type. Physical → Atk/Def, Special → SpA/SpD. [6704, 6947, 6992]
2. Start with `power = movePower` (script-supplied, else move data; 0 → data power, which is 1 for variable moves). [6680-6684]
3. Apply `powerMul` (10 normal, 20 for Facade/Revenge/Brine/Payback-style doubling via scripts, 12 Reckless, 20 Pursuit-on-switch): `power = power * powerMul / 10`. [6688; scripts]
4. Power modifiers in this exact order, each `x = x * a / b` truncating: Charge ×2 (Electric) → Helping Hand ×15/10 → Technician ×15/10 (if power ≤ 60 at this point, not Struggle) → type-boost item/plate ×120/100 → Light Ball ×2 (Pikachu, either class) → Adamant/Lustrous/Griseous Orb ×120/100 → Muscle Band/Wise Glasses ×110/100 → Thick Fat ÷2 (Fire/Ice, MB) → Mud/Water Sport ÷2 → Overgrow/Blaze/Torrent/Swarm ×150/100 (HP ≤ maxHP/3, truncated) → Heatproof ÷2 (MB) → Dry Skin ×125/100 (Fire, MB) → Rivalry ×125/100 or ×75/100 → Iron Fist ×12/10. [6690-6919]
5. Stat modifiers (applied to the raw stat, order): Huge/Pure Power Atk×2 → Slow Start Atk÷2 (first 5 turns) → Choice Band Atk×150/100 / Choice Specs SpA×150/100 → Soul Dew SpA ×150/100 (attacker) / SpD ×150/100 (defender), Lati only, not Frontier → Deep Sea Tooth SpA×2 / Scale SpD×2 → Metal Powder Def×2 (Ditto) → Thick Club Atk×2 → Hustle Atk×150/100 → Guts Atk×150/100 (any status) → Marvel Scale Def×150/100 (MB) → Plus/Minus SpA×150/100 → (weather, if no Cloud Nine/Air Lock) Solar Power SpA×15/10, **Sandstorm: Rock-type defender SpD×15/10**, Flower Gift Atk×15/10 (any living Flower Gift on attacker's side), Flower Gift SpD×15/10 (defender's side, attacker not Mold Breaker) → Explosion/Self-Destruct Def÷2. [6706-6945]
6. Stages: Simple doubles the holder's relevant stages (clamped ±6); Unaware on the defender zeroes attacker's offensive stages, Unaware on the attacker zeroes defender's defensive stages. [6850-6894]
7. Stage multiplier table `{10,40},{10,35},{10,30},{10,25},{10,20},{10,15},{10,10},{15,10},{20,10},{25,10},{30,10},{35,10},{40,10}`, applied as one `stat*num/den`. [6550-6563]
8. On a crit: attacker's stage used only if > 0; defender's stage used only if < 0. [6948-6958, 6963-6973]
9. `damage = A' * power * (floor(L*2/5)+2) / D' / 50` — `A'` already stage-adjusted; each `/` truncates in that order. [6960-6976]
10. Physical only: burned attacker without Guts → `damage /= 2`. [6978-6980]
11. Reflect (physical) / Light Screen (special): not on crit, not Brick Break; `÷2` in singles, `*2/3` in doubles with two living defenders on that side. [6982-6990, 7023-7031]
12. Doubles spread: `*3/4` for `RANGE_ADJACENT_OPPONENTS` when defender's side has 2 alive, and for `RANGE_ALL_ADJACENT` when ≥ 2 other battlers alive. [7034-7043]
13. Weather (no Cloud Nine/Air Lock): Rain Fire ÷2 / Water ×15/10; Solar Beam ÷2 in rain/sand/hail/fog; Sun Fire ×15/10 / Water ÷2. [7045-7072]
14. Flash Fire boosted user, Fire move: ×15/10. [7074-7076]
15. **Then** `+2`. [7078]
16. `× criticalMul` (2, or 3 with Sniper). [`battle_script.c:1344`]
17. Life Orb ×130/100; Metronome item ×(10+n)/10 (n = 0..10 consecutive uses); Me First ×15/10. [`battle_script.c:1346-1362`]
18. Random: `damage = damage * (100 − r) / 100`, r ∈ 0..15, then min 1. Spit Up and Future Sight's stored value differ (Spit Up: no random). [7081-7094; `battle_script.c:1402-1409`]
19. STAB: `×15/10` (`×2` Adaptability) if attacker's type1 or type2 equals the (possibly changed) move type; never for Struggle or IGNORE_TYPE_CHECKS moves. [2573, 2591-2597]
20. Type chart: walk the table (§4); each matching entry `damage = Divide(damage*mul, 10)` with mul 20/5/0; `Divide` returns ±1 instead of 0 for non-zero input. Type2 processed only if ≠ type1. Handle Foresight/Odor Sleuth/Scrappy (drop Ghost immunities), Iron Ball/Ingrain/Gravity (drop Ground→Flying immunity), Roost (drop all Flying entries), Miracle Eye (drop Psychic→Dark). [2399-2557, 2612-2646, 7542-7580, 3599-3617]
21. Levitate/Magnet Rise Ground immunity unless Iron Ball (Levitate also off under Gravity/Ingrain). [2600-2608, 3095-3104]
22. Wonder Guard: immune unless flagged super effective (needs data power > 0). [2649-2655]
23. If SE (and data power > 0): Filter/Solid Rock `Divide(damage*3, 4)`, then Expert Belt ×120/100. If NVE: Tinted Lens ×2. Neither when IGNORE_TYPE_CHECKS / IGNORE_IMMUNITIES. [2657-2676]
24. Absorb abilities (Volt/Water Absorb, Flash Fire, Motor Drive, Dry Skin) cancel the hit after the type chart; heal = `Divide(maxHP, 4)`. [3488-3548]
25. HP application: Endure / Focus Sash (full HP) / Focus Band (10 %) / False Swipe leave 1 HP; type-resist berry halves (min 1) after everything; Substitute absorbs. [`battle_controller_player.c:3341-3462`; `subscript_type_resist_berry.s`]
26. Multi-hit: re-roll crit/random/type per hit; 2-5 distribution 3/8,3/8,1/8,1/8, Skill Link 5; Triple Kick 10/20/30 with per-hit accuracy. [`battle_script.c:2634-2660`, `effect_script_0104.s`, `battle_controller_player.c:3777-3820`]
27. Fixed-damage moves (§3.1) skip everything above except immunities (Ghost vs Seismic Toss/Counter, Normal vs Night Shade) and Wonder Guard; Beat Up and Future Sight skip type and immunities entirely (IGNORE_IMMUNITIES). [scripts; `battle_controller_player.c:2352-2358`]
28. Bide: `2 × HP lost`, then (per code) STAB and type chart still apply because no ignore flag is set. [`battle_controller_player.c:2695-2702`, `subscript_bide_end.s`]
29. No badge boosts, no gems, no Sheer Force, no burn halving of special moves, no crit ignoring of items/abilities. [absence in 6601-7079]
30. Items are ignored entirely for a holder with Klutz or under Embargo. [5352-5362]
31. Hit chance (KO odds only): combined stage (Simple ×2, Unaware, Foresight/Miracle Eye) → ratio → Compound
    Eyes ×130/100 → Sand Veil / Snow Cloak ×80/100 → Hustle ×80/100 → Bright Powder / Lax Incense ×90/100 →
    Wide Lens ×110/100 / Zoom Lens ×120/100 → Gravity ×10/6, each truncated; hit iff `rand%100+1 ≤ rate`;
    accuracy 0 never misses; No Guard, Thunder/rain, Blizzard/hail sure; semi-invulnerable exceptions; OHKO
    `rand%100 < 30 + (Lu−Lt)` with Lu ≥ Lt, Sturdy blocks, No Guard bypasses (§3.4b).
