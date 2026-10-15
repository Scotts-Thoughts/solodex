/**
 * In-battle Speed as each generation's turn-order routine computes it, and the
 * player-vs-enemy comparison the calculator shows on each matchup card.
 *
 *   Gen 1  stage → Soul Badge (player) → paralysis ÷4, min 1 — the stored
 *          wBattleMonSpeed (pokered core.asm CalculateModifiedStat,
 *          ApplyBadgeStatBoosts, QuarterSpeedDueToParalysis)
 *   Gen 2  same order, Speed badge per BadgeStatBoosts (pokecrystal
 *          core.asm:6768, ApplyPrzEffectOnSpeed :6585); compared as 16-bit
 *          values in DetermineMoveOrder.speed_check (:533)
 *   Gen 3  speed × Swift Swim/Chlorophyll ×2 (weather active) × stage ratio →
 *          badge ×110/100 (player, not link) → Macho Brace ÷2 → paralysis ÷4
 *          (pokeemerald battle_main.c:4595 GetWhoStrikesFirst)
 *   Gen 4  stage (Simple doubles it) → Swift Swim/Chlorophyll ×2 (no Cloud
 *          Nine) → Macho Brace / Power items / Iron Ball ÷2 (not negated by
 *          Klutz) → Choice Scarf ×15/10 → Quick Powder (Ditto) ×2 → Quick Feet
 *          ×15/10 if statused, else paralysis ÷4 → Slow Start ÷2 → Unburden
 *          ×2 → Tailwind ×2 (pokeplatinum battle_lib.c:1188
 *          BattleSystem_CompareBattlerSpeed)
 *   Gen 5  stage → one 4096-scale chain (Tailwind; Chlorophyll/Swift Swim/
 *          Sand Rush/Unburden, else Quick Feet, else Slow Start; Choice Scarf,
 *          else Iron Ball / Macho Brace / Power items, else Quick Powder) →
 *          paralysis ×25/100 unless Quick Feet (G5 §2, Smogon getFinalSpeed)
 *
 * Not modelled: Quick Claw / Custap Berry / Lagging Tail / Full Incense and
 * move priority (they change who moves first, not Speed), Trick Room, the
 * Gen 1 paralysis re-application on every stat change (README).
 */
import type { BattlerState, Field } from './types'
import { applyStage, clampStage, stageMultiplier } from './stages'
import { badgeBoostsStat, gen12BadgeBoost, gen3BadgeBoost } from './badges'
import { holderItem } from './moves'
import { chainMods, OF32 } from './math'

const POWER_ITEMS = new Set(['machobrace', 'powerweight', 'powerbracer', 'powerbelt', 'powerlens', 'powerband', 'poweranklet', 'ironball'])

function weatherDoubles(b: BattlerState, field: Field, other: BattlerState): boolean {
  const cloudNine = [b.ability, other.ability].some(x => x === 'cloudnine' || x === 'airlock')
  if (cloudNine) return false
  return (b.ability === 'swiftswim' && field.weather === 'rain')
    || (b.ability === 'chlorophyll' && field.weather === 'sun')
    || (field.gen >= 5 && b.ability === 'sandrush' && field.weather === 'sand')
}

/**
 * Speed `b` moves with in this battle state. `other` is the opposing battler
 * (Cloud Nine / Air Lock on either side cancels the weather abilities).
 */
export function battleSpeed(b: BattlerState, other: BattlerState, field: Field): number {
  const gen = field.gen
  const raw = b.stats.speed
  const par = b.status === 'paralysis'

  if (gen <= 2) {
    let s = applyStage(gen, raw, b.stages.speed)
    if (b.isPlayer && badgeBoostsStat('speed', b.badges, field.game)) s = gen12BadgeBoost(s)
    if (par) s = Math.max(1, s >> 2)
    return s
  }

  if (gen === 3) {
    const [num, den] = stageMultiplier(3, b.stages.speed)
    let s = Math.floor(raw * (weatherDoubles(b, field, other) ? 2 : 1) * num / den)
    if (b.isPlayer && badgeBoostsStat('speed', b.badges, field.game)) s = gen3BadgeBoost(s)
    if (holderItem(b, 3) === 'machobrace') s = Math.floor(s / 2)
    if (par) s = Math.floor(s / 4)
    return s
  }

  const stage = b.ability === 'simple' ? clampStage(b.stages.speed * 2) : b.stages.speed
  const item = holderItem(b, gen)
  const statused = b.status !== 'none'
  const unburden = b.ability === 'unburden' && !!b.flags.unburdened

  if (gen === 4) {
    let s = applyStage(4, raw, stage)
    if (weatherDoubles(b, field, other)) s *= 2
    if (b.item && POWER_ITEMS.has(b.item)) s = Math.floor(s / 2)   // raw item: Klutz does not negate it
    if (item === 'choicescarf') s = Math.floor(s * 15 / 10)
    if (item === 'quickpowder' && b.species === 'Ditto') s *= 2
    if (b.ability === 'quickfeet' && statused) s = Math.floor(s * 15 / 10)
    else if (par) s = Math.floor(s / 4)
    if (b.ability === 'slowstart' && b.flags.slowStartActive) s = Math.floor(s / 2)
    if (unburden) s *= 2
    if (b.flags.tailwind) s *= 2
    return s
  }

  // Gen 5
  let s = applyStage(5, raw, stage)
  const mods: number[] = []
  if (b.flags.tailwind) mods.push(8192)
  if (weatherDoubles(b, field, other) || unburden) mods.push(8192)
  else if (b.ability === 'quickfeet' && statused) mods.push(6144)
  else if (b.ability === 'slowstart' && b.flags.slowStartActive) mods.push(2048)
  if (item === 'choicescarf') mods.push(6144)
  else if (item && POWER_ITEMS.has(item)) mods.push(2048)
  else if (item === 'quickpowder' && b.species === 'Ditto') mods.push(8192)
  s = OF32(pokeRound(s * chainMods(mods, 410, 131172) / 4096))
  if (par && b.ability !== 'quickfeet') s = Math.floor(OF32(s * 25) / 100)
  return Math.min(10000, Math.max(0, s))
}

/** Round half down (Gen 5 `pokeRound`). */
const pokeRound = (n: number): number => (n % 1 > 0.5 ? Math.ceil(n) : Math.floor(n))

export type SpeedOrder = 'faster' | 'tie' | 'slower'

export interface SpeedComparison {
  player: number
  enemy:  number
  /** From the player's point of view. */
  order:  SpeedOrder
}

export function compareSpeed(player: BattlerState, enemy: BattlerState, field: Field): SpeedComparison {
  const p = battleSpeed(player, enemy, field)
  const e = battleSpeed(enemy, player, field)
  return { player: p, enemy: e, order: p > e ? 'faster' : p < e ? 'slower' : 'tie' }
}
