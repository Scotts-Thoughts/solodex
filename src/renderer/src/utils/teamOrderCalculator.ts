// Trainer send-out order — gen 2, gen 3, and gen 4.
//
// Gen 2 (pokecrystal — Gold/Silver/Crystal):
//   See A:/Cygwin/home/scott/stp-pokecrystal/docs/enemy_trainer_send_out_logic.md
//   Lead = slot 0. Faint replacement uses a +1/0/-1 scoring on every slot:
//     +1 = has a super-effective move AND player is not super-effective vs me
//      0 = neutral (mutual SE, or mutual none)
//     -1 = no SE move AND player is super-effective vs me (or current/fainted)
//   Pick rule: lowest-indexed +1 ; else lowest-indexed 0 ; else uniform random
//   over alive non-current slots (deterministic only if exactly one remains).
//
// Gen 3 (pokeemerald — Ruby/Sapphire/Emerald/FireRed/LeafGreen):
//   See A:/decomps/stp-pokeemerald/docs/enemy_trainer_send_out_logic.md
//   Lead = slot 0 (hardcoded — no scoring). Faint replacement runs
//   GetMostSuitableMonToSwitchInto:
//     Phase 1: pick the alive non-active candidate whose typeDmg score is
//       highest, where typeDmg = 10 multiplied by ModulateByTypeEffectiveness
//       called once per opponent type against the candidate's two types.
//       (Counter-intuitively, this picks the mon that takes the *most* damage
//       from the player's STAB — flagged as a probable bug in the source.)
//       That mon must also have at least one super-effective move; if not it
//       is marked invalid and the sweep is repeated.
//       Tie-break: lowest party slot (first-encountered wins).
//       Candidates with typeDmg = 0 (immune to both player types) are never
//       selected by Phase 1 — the comparison is `bestDmg < typeDmg` and
//       bestDmg starts at 0.
//     Phase 2: damage-based fallback using AI_CalcDmg. The source uses
//       gActiveBattler's stats (a known bug) and bestDmg is u8 unless BUGFIX
//       is defined (overflow on damage > 255). We surface this step as
//       non-deterministic rather than guessing.
//
// Gen 4 (pokeplatinum — Diamond/Pearl/Platinum/HeartGold/SoulSilver):
//   See A:/decomps/stp-pokeplatinum/docs/trainer_switch_ai.md
//   Lead = slot 0. Faint replacement runs BattleAI_PostKOSwitchIn:
//     Stage 1: sum BattleSystem_TypeMatchupMultiplier(candType1, defT1, defT2)
//       and (candType2, defT1, defT2). The helper starts at mul = 40 (= 1×)
//       and applies SE/NVE chart rows (NO_EFFECT immunity rows are NOT in
//       the chart used here — handled separately by ApplyTypeChart). This
//       fixes Gen 3's defensive scoring bug — Gen 4 picks the candidate
//       whose *attacks* deal the most type damage to the defender.
//       Mono-type candidates have type1 == type2 → both passes return the
//       same value → score is doubled (intentional per source comment).
//       Pick the highest score that also has at least one SE move; on
//       failure mark slot disregarded and retry. Tie-break: lowest slot.
//       BUG: score is u8, so summed values above 255 wrap silently. We
//       reproduce the bug by comparing on (score & 0xFF), which can put
//       genuinely-stronger candidates behind weaker ones whose 8-bit score
//       happens to be higher.
//     Stage 2: damage fallback (also u8-wrapped, also uses outgoing mon's
//       stats). Surfaced as non-deterministic.
//
// Move power is not consulted in any gen for the SE-move check — status
// moves with SE typing still count.

import { getMoveData, getPokemonData, getTypeMatchups, GAME_TO_GEN } from '../data'
import type { TrainerPokemon } from '../types/pokemon'

export type SlotScore = 1 | 0 | -1

export type StepReason =
  | 'lead'
  | 'gen2-se-pick'
  | 'gen2-neutral-pick'
  | 'gen2-forced-random'
  | 'gen2-random'
  | 'gen3-phase1'
  | 'gen3-forced-linear'
  | 'gen3-phase2'
  | 'gen4-stage1'
  | 'gen4-forced-linear'
  | 'gen4-stage2'

export interface SlotEvaluation {
  slot: number
  isFainted: boolean
  hasSEMove: boolean
  seMove: string | null
  // Gen 2 only:
  gen2Score?: SlotScore
  playerSEvsMe?: boolean
  // Gen 3 only:
  typeDmg?: number      // engine units; 10 = 1×, 20 = 2×, 5 = 0.5×, 0 = 0×
  // Gen 4 only:
  gen4Score?: number      // true (un-truncated) sum of two TypeMatchupMultiplier calls
  gen4Score8bit?: number  // gen4Score & 0xFF — the value the engine actually compares
}

export interface SimStep {
  // sentOut === null means the pick is non-deterministic (gen 2 random
  // fallback or gen 3 Phase 2). Candidates are listed in fallbackCandidates
  // and the simulation stops.
  sentOut: number | null
  reason: StepReason
  evaluations: SlotEvaluation[]
  fallbackCandidates: number[]
}

export type SupportedGen = '2' | '3' | '4'

export function getSupportedGen(game: string): SupportedGen | null {
  const gen = GAME_TO_GEN[game]
  if (gen === '2' || gen === '3' || gen === '4') return gen
  return null
}

// ── Shared type-chart helpers ─────────────────────────────────────────────

const matchupCache = new Map<string, ReturnType<typeof getTypeMatchups>>()
function cachedMatchups(type: string, game: string) {
  const key = `${game}::${type}`
  let m = matchupCache.get(key)
  if (!m) {
    m = getTypeMatchups(type, game)
    matchupCache.set(key, m)
  }
  return m
}

function singleTypeMultiplier(matchups: ReturnType<typeof getTypeMatchups>, defType: string): number {
  if (matchups.superEffVs.includes(defType)) return 2
  if (matchups.notEffVs.includes(defType))   return 0.5
  if (matchups.noEffVs.includes(defType))    return 0
  return 1
}

// Multiplier of a single attacker type vs a (possibly dual) defender, using
// the same row-iteration model the engines use: each chart row that matches
// (atk, def) fires once. For single-type defenders (defType2 === defType1
// or null), only one row matches → one multiplication.
function combinedMultiplier(atkType: string, defType1: string, defType2: string | null, game: string): number {
  const m = cachedMatchups(atkType, game)
  let mult = singleTypeMultiplier(m, defType1)
  if (defType2 && defType2 !== defType1) {
    mult *= singleTypeMultiplier(m, defType2)
  }
  return mult
}

function defenderTypes(species: string, game: string): { t1: string; t2: string | null } | null {
  const data = getPokemonData(species, game)
  if (!data) return null
  const t1 = data.type_1
  const t2 = data.type_2 && data.type_2 !== data.type_1 ? data.type_2 : null
  return { t1, t2 }
}

// ── Gen 2 ────────────────────────────────────────────────────────────────

function evaluateSlotGen2(
  pokemon: TrainerPokemon,
  slot: number,
  game: string,
  playerType1: string,
  playerType2: string | null,
  isFainted: boolean,
): SlotEvaluation {
  if (isFainted) {
    return { slot, isFainted: true, hasSEMove: false, seMove: null, gen2Score: -1, playerSEvsMe: false }
  }
  const types = defenderTypes(pokemon.species, game)
  if (!types) {
    return { slot, isFainted: false, hasSEMove: false, seMove: null, gen2Score: 0, playerSEvsMe: false }
  }

  let seMove: string | null = null
  for (const moveName of pokemon.moves) {
    if (!moveName) continue
    const md = getMoveData(moveName, game)
    if (!md) continue
    if (combinedMultiplier(md.type, playerType1, playerType2, game) > 1) {
      seMove = moveName
      break
    }
  }
  const hasSEMove = seMove !== null

  let playerSEvsMe = combinedMultiplier(playerType1, types.t1, types.t2, game) > 1
  if (!playerSEvsMe && playerType2 && playerType2 !== playerType1) {
    playerSEvsMe = combinedMultiplier(playerType2, types.t1, types.t2, game) > 1
  }

  let score: SlotScore = 0
  if (hasSEMove && !playerSEvsMe) score = 1
  else if (!hasSEMove && playerSEvsMe) score = -1

  return { slot, isFainted: false, hasSEMove, seMove, gen2Score: score, playerSEvsMe }
}

function pickReplacementGen2(evals: SlotEvaluation[]): { slot: number | null; reason: StepReason; fallbackCandidates: number[] } {
  for (const s of evals) {
    if (s.gen2Score === 1) return { slot: s.slot, reason: 'gen2-se-pick', fallbackCandidates: [] }
  }
  for (const s of evals) {
    if (s.gen2Score === 0 && !s.isFainted) return { slot: s.slot, reason: 'gen2-neutral-pick', fallbackCandidates: [] }
  }
  const candidates = evals.filter(s => !s.isFainted).map(s => s.slot)
  if (candidates.length === 1) {
    return { slot: candidates[0], reason: 'gen2-forced-random', fallbackCandidates: [] }
  }
  return { slot: null, reason: 'gen2-random', fallbackCandidates: candidates }
}

function simulateOrderGen2(
  party: TrainerPokemon[],
  game: string,
  playerType1: string,
  playerType2: string | null,
): SimStep[] {
  if (party.length === 0) return []
  const steps: SimStep[] = []
  const fainted = new Set<number>()

  steps.push({ sentOut: 0, reason: 'lead', evaluations: [], fallbackCandidates: [] })
  let current = 0

  while (true) {
    fainted.add(current)
    if (fainted.size >= party.length) break

    const evals = party.map((p, i) => evaluateSlotGen2(p, i, game, playerType1, playerType2, fainted.has(i)))
    const pick = pickReplacementGen2(evals)

    steps.push({
      sentOut: pick.slot,
      reason: pick.reason,
      evaluations: evals,
      fallbackCandidates: pick.fallbackCandidates,
    })

    if (pick.slot === null) break
    current = pick.slot
  }
  return steps
}

// ── Gen 3 ────────────────────────────────────────────────────────────────

// One call of ModulateByTypeEffectiveness: walks the chart for rows whose
// attacker matches atkType and whose defender matches one of the (deduped)
// candidate types, multiplying the running typeDmg by `multiplier / 10`
// (integer division) per match.
function applyModulate(atkType: string, defT1: string, defT2: string, typeDmg: number, game: string): number {
  const m = cachedMatchups(atkType, game)
  const defs = defT1 === defT2 ? [defT1] : [defT1, defT2]
  for (const dt of defs) {
    let chartMult = -1
    if (m.superEffVs.includes(dt)) chartMult = 20
    else if (m.notEffVs.includes(dt)) chartMult = 5
    else if (m.noEffVs.includes(dt)) chartMult = 0
    if (chartMult >= 0) {
      typeDmg = Math.floor(typeDmg * chartMult / 10)
    }
  }
  return typeDmg
}

function evaluateSlotGen3(
  pokemon: TrainerPokemon,
  slot: number,
  game: string,
  oppType1: string,
  oppType2: string,    // caller passes oppType1 again when player is single-typed
  isFainted: boolean,
): SlotEvaluation {
  if (isFainted) {
    return { slot, isFainted: true, hasSEMove: false, seMove: null, typeDmg: 0 }
  }
  const types = defenderTypes(pokemon.species, game)
  // Mimic gSpeciesInfo: single-type pokemon have type1 === type2
  const t1 = types?.t1 ?? ''
  const t2 = types?.t2 ?? t1

  let typeDmg = 10
  typeDmg = applyModulate(oppType1, t1, t2, typeDmg, game)
  typeDmg = applyModulate(oppType2, t1, t2, typeDmg, game)

  // SE-move check uses standard TypeCalc: combined multiplier of move type
  // against opp's two types. When opp is single-typed (oppType2 === oppType1),
  // pass null as the second so the row-iteration model only fires once.
  const oppT2ForMove = oppType2 === oppType1 ? null : oppType2
  let seMove: string | null = null
  for (const moveName of pokemon.moves) {
    if (!moveName) continue
    const md = getMoveData(moveName, game)
    if (!md) continue
    if (combinedMultiplier(md.type, oppType1, oppT2ForMove, game) > 1) {
      seMove = moveName
      break
    }
  }

  return { slot, isFainted: false, hasSEMove: seMove !== null, seMove, typeDmg }
}

function pickReplacementGen3(evals: SlotEvaluation[]): { slot: number | null; reason: StepReason; fallbackCandidates: number[] } {
  // Phase 1: viable candidates with typeDmg > 0, sorted by typeDmg desc,
  // slot asc; first one with an SE move is picked.
  const phase1Pool = evals
    .filter(e => !e.isFainted && (e.typeDmg ?? 0) > 0)
    .sort((a, b) => ((b.typeDmg ?? 0) - (a.typeDmg ?? 0)) || (a.slot - b.slot))
  for (const ev of phase1Pool) {
    if (ev.hasSEMove) {
      return { slot: ev.slot, reason: 'gen3-phase1', fallbackCandidates: [] }
    }
  }
  // Phase 2 fallback: damage-based, engine-dependent. If only one alive
  // non-active candidate remains the engine will pick it regardless.
  const remaining = evals.filter(e => !e.isFainted).map(e => e.slot)
  if (remaining.length === 1) {
    return { slot: remaining[0], reason: 'gen3-forced-linear', fallbackCandidates: [] }
  }
  return { slot: null, reason: 'gen3-phase2', fallbackCandidates: remaining }
}

function simulateOrderGen3(
  party: TrainerPokemon[],
  game: string,
  oppType1: string,
  oppType2: string | null,
): SimStep[] {
  if (party.length === 0) return []
  const steps: SimStep[] = []
  const fainted = new Set<number>()

  steps.push({ sentOut: 0, reason: 'lead', evaluations: [], fallbackCandidates: [] })
  let current = 0

  // Engine treats single-type pokemon as type1 === type2; mimic that so
  // ModulateByTypeEffectiveness gets called twice with the same attacker
  // type and the multiplier double-applies (a faithful reproduction of the
  // stock-Emerald scoring quirk).
  const effOppType2 = oppType2 ?? oppType1

  while (true) {
    fainted.add(current)
    if (fainted.size >= party.length) break

    const evals = party.map((p, i) => evaluateSlotGen3(p, i, game, oppType1, effOppType2, fainted.has(i)))
    const pick = pickReplacementGen3(evals)

    steps.push({
      sentOut: pick.slot,
      reason: pick.reason,
      evaluations: evals,
      fallbackCandidates: pick.fallbackCandidates,
    })

    if (pick.slot === null) break
    current = pick.slot
  }
  return steps
}

// ── Gen 4 ────────────────────────────────────────────────────────────────

// BattleSystem_TypeMatchupMultiplier from battle_lib.c. Starts at mul = 40
// (engine's representation of 1×), then for each chart row whose attacker
// matches and whose defender matches one of (defT1, defT2) — with the
// defT1 != defT2 dedupe — multiplies by row.mult / 10.
//
// Per the doc, NO_EFFECT (immunity) rows are NOT in this routine's chart;
// they're handled by ApplyTypeChart elsewhere. So we skip noEffVs entries
// here — a Ground attacker against a Flying defender contributes ×1, not ×0.
function gen4TypeMatchupMultiplier(atkType: string, defT1: string, defT2: string, game: string): number {
  const m = cachedMatchups(atkType, game)
  let mul = 40
  const defs = defT1 === defT2 ? [defT1] : [defT1, defT2]
  for (const dt of defs) {
    let chartMult = -1
    if (m.superEffVs.includes(dt)) chartMult = 20
    else if (m.notEffVs.includes(dt)) chartMult = 5
    if (chartMult >= 0) {
      mul = Math.floor(mul * chartMult / 10)
    }
  }
  return mul
}

function evaluateSlotGen4(
  pokemon: TrainerPokemon,
  slot: number,
  game: string,
  defType1: string,
  defType2: string,    // caller passes defType1 again when player is single-typed
  isFainted: boolean,
): SlotEvaluation {
  if (isFainted) {
    return { slot, isFainted: true, hasSEMove: false, seMove: null, gen4Score: 0, gen4Score8bit: 0 }
  }
  const types = defenderTypes(pokemon.species, game)
  // Engine treats mono-type as type1 == type2; both passes use that type.
  const monT1 = types?.t1 ?? ''
  const monT2 = types?.t2 ?? monT1

  const score = gen4TypeMatchupMultiplier(monT1, defType1, defType2, game)
              + gen4TypeMatchupMultiplier(monT2, defType1, defType2, game)
  const score8bit = score & 0xFF

  // SE-move check: standard combined multiplier > 1×. Mono-type defender →
  // pass null so the row-iteration model only fires once per chart entry.
  const defT2ForMove = defType2 === defType1 ? null : defType2
  let seMove: string | null = null
  for (const moveName of pokemon.moves) {
    if (!moveName) continue
    const md = getMoveData(moveName, game)
    if (!md) continue
    if (combinedMultiplier(md.type, defType1, defT2ForMove, game) > 1) {
      seMove = moveName
      break
    }
  }

  return { slot, isFainted: false, hasSEMove: seMove !== null, seMove, gen4Score: score, gen4Score8bit: score8bit }
}

function pickReplacementGen4(evals: SlotEvaluation[]): { slot: number | null; reason: StepReason; fallbackCandidates: number[] } {
  // Stage 1: viable candidates with the highest 8-bit score (mirroring the
  // u8 truncation bug). Strict-< comparison vs starting maxScore = 0 means
  // candidates whose 8-bit score is 0 (e.g. true score 256 wraps) are never
  // picked. Ties broken by lowest slot.
  const stage1Pool = evals
    .filter(e => !e.isFainted && (e.gen4Score8bit ?? 0) > 0)
    .sort((a, b) => ((b.gen4Score8bit ?? 0) - (a.gen4Score8bit ?? 0)) || (a.slot - b.slot))
  for (const ev of stage1Pool) {
    if (ev.hasSEMove) {
      return { slot: ev.slot, reason: 'gen4-stage1', fallbackCandidates: [] }
    }
  }
  // Stage 2 fallback: damage-based, engine-dependent.
  const remaining = evals.filter(e => !e.isFainted).map(e => e.slot)
  if (remaining.length === 1) {
    return { slot: remaining[0], reason: 'gen4-forced-linear', fallbackCandidates: [] }
  }
  return { slot: null, reason: 'gen4-stage2', fallbackCandidates: remaining }
}

function simulateOrderGen4(
  party: TrainerPokemon[],
  game: string,
  defType1: string,
  defType2: string | null,
): SimStep[] {
  if (party.length === 0) return []
  const steps: SimStep[] = []
  const fainted = new Set<number>()

  steps.push({ sentOut: 0, reason: 'lead', evaluations: [], fallbackCandidates: [] })
  let current = 0

  // Mono-type defender → both type slots are the same in the engine.
  const effDefType2 = defType2 ?? defType1

  while (true) {
    fainted.add(current)
    if (fainted.size >= party.length) break

    const evals = party.map((p, i) => evaluateSlotGen4(p, i, game, defType1, effDefType2, fainted.has(i)))
    const pick = pickReplacementGen4(evals)

    steps.push({
      sentOut: pick.slot,
      reason: pick.reason,
      evaluations: evals,
      fallbackCandidates: pick.fallbackCandidates,
    })

    if (pick.slot === null) break
    current = pick.slot
  }
  return steps
}

// ── Dispatch ─────────────────────────────────────────────────────────────

export function simulateOrder(
  party: TrainerPokemon[],
  game: string,
  playerType1: string,
  playerType2: string | null,
): SimStep[] {
  const gen = getSupportedGen(game)
  if (gen === '4') return simulateOrderGen4(party, game, playerType1, playerType2)
  if (gen === '3') return simulateOrderGen3(party, game, playerType1, playerType2)
  return simulateOrderGen2(party, game, playerType1, playerType2)
}
