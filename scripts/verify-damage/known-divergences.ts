/**
 * Places where @smogon/calc and the decomps disagree. Each entry cites the
 * decomp rule that our pipeline follows. `matches` must be specific: an entry
 * that matches everything would hide real regressions.
 */
import type { BattlerState, DamageResult, Gen } from '@/utils/damage'
import { GEN1_TYPE_ROWS, gen234Rows } from '@/utils/damage/typechart'
import { typeBoostParam } from '@/utils/damage/items'

export interface DivergenceCase {
  game: string
  gen: Gen
  attacker: BattlerState
  defender: BattlerState
  move: string
  crit: boolean
  ours: number[]
  theirs: number[]
  result: DamageResult
}

export interface Divergence {
  id: string
  why: string
  matches: (c: DivergenceCase) => boolean
}

const ratio = (c: DivergenceCase) => c.theirs[c.theirs.length - 1] / Math.max(1, c.ours[c.ours.length - 1])
const relDiff = (c: DivergenceCase) => {
  const om = c.ours[c.ours.length - 1], tm = c.theirs[c.theirs.length - 1]
  const o0 = c.ours[0], t0 = c.theirs[0]
  return Math.max(Math.abs(om - tm) / Math.max(1, tm), Math.abs(o0 - t0) / Math.max(1, t0))
}
const absDiff = (c: DivergenceCase) =>
  Math.max(Math.abs(c.ours[c.ours.length - 1] - c.theirs[c.theirs.length - 1]), Math.abs(c.ours[0] - c.theirs[0]))
const sameSet = (a: number[], b: number[]) => {
  const ua = [...new Set(a)].sort((x, y) => x - y), ub = [...new Set(b)].sort((x, y) => x - y)
  return ua.length === ub.length && ua.every((v, i) => v === ub[i])
}

/** Move type hits one defender type ×2 and the other ×½ (net neutral). */
function neutralDualType(c: DivergenceCase): boolean {
  const [t1, t2] = c.defender.types
  if (t1 === t2) return false
  const rows = c.gen === 1 ? GEN1_TYPE_ROWS : gen234Rows()
  const m1 = rows.find(r => r[0] === c.result.moveType && r[1] === t1)?.[2] ?? 10
  const m2 = rows.find(r => r[0] === c.result.moveType && r[1] === t2)?.[2] ?? 10
  return (m1 === 20 && m2 === 5) || (m1 === 5 && m2 === 20)
}

export const KNOWN_DIVERGENCES: Divergence[] = [
  {
    id: 'gen1-high-crit-shown-as-crit',
    why: 'Gen 1 high-crit moves crit at 8× the normal rate (255/256 on base Speed ≥ 64; G1 §2.1). Smogon reports the crit damage as the normal result; we report both with the chance.',
    matches: c => c.gen === 1 && !c.crit && !!c.result.crit && (sameSet(c.result.crit.rolls, c.theirs)
      || (neutralDualType(c) && Math.abs(c.result.crit.max - c.theirs[c.theirs.length - 1]) <= 2)),
  },
  {
    id: 'gen1234-neutral-dual-type-row-order',
    why: 'Gen 1–4 apply type rows in ROM order with truncation per row (G1 #11, G2 #21, G3 #16, G4 #20); ×2 then ×½ differs from ×½ then ×2 on odd damage. Smogon uses defender-slot order (Gen 1) or one combined ×1.',
    matches: c => c.gen <= 4 && neutralDualType(c) && absDiff(c) <= (c.crit ? 4 : 2),
  },
  {
    id: 'gen2-type-item-before-crit',
    why: 'Gen 2 applies the type-boost item ×110/100 before the crit ×2 (G2 #14–#15, pokecrystal EC:2983-3023). Smogon doubles first.',
    matches: c => c.gen === 2 && c.crit && !!c.attacker.item && typeBoostParam(c.attacker.item, c.result.moveType, 2) != null,
  },
  {
    id: 'gen1-explosion-defense-halved-after-scaling',
    why: 'Gen 1 halves the 8-bit Defense after Reflect doubling and the ≥256 scaling (G1 #8, pokered core:4313-4319). Smogon halves the full stat first.',
    matches: c => c.gen === 1 && (c.move === 'Explosion' || c.move === 'Self-Destruct' || c.move === 'Selfdestruct'),
  },
  {
    id: 'conditional-doubler-default',
    why: 'Smogon assumes the boosting condition is met for Payback / Assurance / Avalanche / Revenge; we default to "not met" and expose it as a pill.',
    matches: c => ['Payback', 'Assurance', 'Avalanche', 'Revenge'].includes(c.move)
      && ratio(c) > 1.6 && ratio(c) < 2.4,
  },
  {
    id: 'friendship-defaults',
    why: "Return/Frustration use the attacker's friendship: trainer Pokémon have their species' base friendship (pokeemerald CreateBoxMon, pokeplatinum Pokemon_Init); Smogon assumes max for Return and min for Frustration.",
    matches: c => c.move === 'Return' || c.move === 'Frustration',
  },
  {
    id: 'gen4-gyro-ball-plus-one',
    why: 'Gen 4 Gyro Ball is 1 + 25·targetSpeed/userSpeed (pokeplatinum battle_script.c:7123-7133 BtlCmd_CalcGyroBallPower). Smogon omits the +1 in Gen 4.',
    matches: c => c.gen === 4 && c.move === 'Gyro Ball',
  },
  {
    id: 'gen4-divide-never-zero',
    why: 'Gen 4 type-chart steps go through BattleSystem_Divide, which returns ±1 instead of 0 (G4 #20, battle_lib.c:3599-3617), so tiny hits floor at 1 per step. Smogon floors once at the end.',
    matches: c => c.gen === 4 && c.ours[c.ours.length - 1] <= 4 && c.theirs[0] < c.ours[0],
  },
  {
    id: 'download-assumed-active',
    why: "Smogon applies Download's +1 on switch-in automatically; we leave stages to the user.",
    matches: c => c.attacker.ability === 'download' || (c.defender.ability === 'download' && c.move === 'Punishment'),
  },
  {
    id: 'sleep-gated-moves-shown',
    why: 'Dream Eater / Snore need a sleeping target or user; we show the damage with a note, Smogon shows 0.',
    matches: c => (c.move === 'Dream Eater' || c.move === 'Snore') && c.theirs.every(v => v === 0),
  },
  {
    id: 'gen2-explosion-halves-after-screens',
    why: 'Gen 2 halves the 8-bit Defense after Reflect doubling and truncation (G2 #11, pokecrystal EC:2907-2914). Smogon halves before Reflect.',
    matches: c => c.gen === 2 && (c.move === 'Explosion' || c.move === 'Self-Destruct') && (!!c.defender.flags.reflect || !!c.defender.flags.lightScreen),
  },
  {
    id: 'gen3-facade-damage-doubler',
    why: 'Gen 3 Facade doubles damage after the +2 via sDMG_MULTIPLIER (G3 §4.4, bs1:2252-2258); Smogon doubles the base power.',
    matches: c => c.gen === 3 && c.move === 'Facade' && ['burn', 'poison', 'toxic', 'paralysis'].includes(c.attacker.status),
  },
  {
    id: 'gen4-stat-item-before-stage',
    why: 'Gen 4 applies Choice Band/Specs, Huge Power etc. to the raw stat and then the stage ratio (G4 #5, #7; battle_lib.c:6706-6976). Smogon applies the stage first; the two truncations differ by ±1.',
    matches: c => c.gen === 4 && (relDiff(c) < 0.08 || absDiff(c) <= 2) && (c.attacker.stages.attack !== 0 || c.attacker.stages.spattack !== 0 || c.defender.stages.defense !== 0 || c.defender.stages.spdefense !== 0),
  },
  {
    id: 'gen4-crit-unaware-simple',
    why: "Gen 4 applies Unaware / Simple to the stages before the crit rule ignores negative attack / positive defense stages (G4 #6, #8). Smogon applies the (doubled) stages on a crit when either ability is involved.",
    matches: c => c.gen === 4 && c.crit && ['unaware', 'simple'].some(ab => c.attacker.ability === ab || c.defender.ability === ab),
  },
  {
    id: 'gen5-no-minimum-after-final-modifier',
    why: 'Gen 5 sets damage to 1 before the final modifier chain and never after it, so 1 damage behind Reflect becomes 0 (G5 §3.10, §9; Showdown reproduces this). Smogon clamps to 1.',
    matches: c => c.gen === 5 && c.ours[0] === 0 && c.theirs.every(v => v <= 1),
  },
  {
    id: 'gen234-beat-up-base-stats',
    why: "Gen 2–4 Beat Up uses each party member's base Attack against the target's base Defense, typeless and without STAB (G2 #35, G3 #22, G4 §3.2 SYSCTL_IGNORE_IMMUNITIES). Smogon runs it as a normal Dark move.",
    matches: c => c.gen <= 4 && c.move === 'Beat Up',
  },
  {
    id: 'gen234-future-sight-no-type',
    why: 'Future Sight / Doom Desire skip STAB and the type chart in Gen 2–4 (G2 #36; G3 #23 pokeemerald bs1:3508-3535 has no typecalc; G4 §3.4 SYSCTL_IGNORE_IMMUNITIES). Smogon applies both.',
    matches: c => c.gen <= 4 && (c.move === 'Future Sight' || c.move === 'Doom Desire'),
  },
  {
    id: 'gen3-weather-ball-physical-when-normal',
    why: 'Gen 3 category follows the effective type: Normal-type Weather Ball is physical (pokeemerald pokemon.c:3232 IS_TYPE_PHYSICAL). Smogon uses the modern Special category.',
    matches: c => c.gen === 3 && c.move === 'Weather Ball',
  },
]
