/**
 * Generation 5 damage pipeline (Black/White, Black 2/White 2).
 * No local decomp exists. Source: docs/damage/gen5_damage_reference.md,
 * built from Smogon's disassembly-based "Complete Damage Formula for Black &
 * White" and cross-checked against @smogon/calc gen56.ts and Showdown
 * (rules cited as G5 #n).
 *
 *   attack  = stage (skip if target Unaware / crit & negative) → OF16 →
 *             Hustle ×1.5 direct → chain(attack mods) → applyMod → OF16    (#3)
 *   defense = stage (skip if attacker Unaware / crit & positive) → OF16 →
 *             Sandstorm Rock SpD ×1.5 direct → chain(def mods) → OF16      (#4)
 *   BP      = variable power → chain(BP mods) → applyMod → OF16, min 1     (#5)
 *   D = floor(floor(floor(2L/5+2)·BP·A/D)/50)+2                            (#6)
 *   spread 0xC00 → weather 0x1800|0x800 → crit ×2 → random (85+i)/100 →
 *   STAB 0x1800|0x2000 → type shifts → burn ÷2 → min 1 →
 *   applyMod(chain(final mods)) → OF16 (no min-1 after)                  (#7–#15)
 */
import type { CalcContext, PipelineOutput } from './types'
import { applyStage } from './stages'
import { combinedEffectiveness } from './typechart'
import { applyMod, chainMods, OF16, OF32 } from './math'
import { getItem, speciesItem } from './items'
import { holderItem } from './moves'
import { effectiveDefenderAbility } from './abilities'

const M = { x0_5: 0x800, x0_75: 0xC00, x1_1: 0x1199, x1_2: 0x1333, x1_25: 0x1400, x1_3: 0x14CD, x1_5: 0x1800, x2: 0x2000 }

export function calcGen5(ctx: CalcContext): PipelineOutput {
  const { attacker: a, defender: d, move, field, crit } = ctx
  const notes: string[] = []
  const physical = move.category === 'physical'
  const atkItem = holderItem(a, 5)
  const defItem = holderItem(d, 5)
  const defAbility = effectiveDefenderAbility(d.ability, a.ability, 5)
  const weatherOn = a.ability !== 'cloudnine' && a.ability !== 'airlock' && d.ability !== 'cloudnine' && d.ability !== 'airlock'
  const weather = weatherOn ? field.weather : 'none'
  const pinch = a.currentHp <= Math.floor(a.stats.hp / 3)
  const statused = a.status !== 'none'

  // ── Attack (#3) ──────────────────────────────────────────────────────────
  const atkSource = move.flags.useTargetAttack ? d : a
  const atkKey = physical ? 'attack' : 'spattack'
  let attack: number
  const atkStage = atkSource.stages[atkKey]
  if (defAbility === 'unaware' || atkStage === 0 || (crit && atkStage < 0)) attack = atkSource.stats[atkKey]
  else attack = applyStage(5, atkSource.stats[atkKey], atkStage)
  attack = OF16(attack)
  if (a.ability === 'hustle' && physical) attack = applyMod(attack, M.x1_5)
  const atMods: number[] = []
  if (defAbility === 'thickfat' && (move.type === 'Fire' || move.type === 'Ice')) atMods.push(M.x0_5)
  if (a.ability === 'torrent' && pinch && move.type === 'Water') atMods.push(M.x1_5)
  if (a.ability === 'guts' && statused && physical) atMods.push(M.x1_5)
  if (a.ability === 'swarm' && pinch && move.type === 'Bug') atMods.push(M.x1_5)
  if (a.ability === 'overgrow' && pinch && move.type === 'Grass') atMods.push(M.x1_5)
  if ((a.ability === 'plus' || a.ability === 'minus') && a.flags.partnerPlusMinus && !physical) atMods.push(M.x1_5)
  if (a.ability === 'blaze' && pinch && move.type === 'Fire') atMods.push(M.x1_5)
  if (a.ability === 'defeatist' && a.currentHp <= Math.floor(a.stats.hp / 2)) atMods.push(M.x0_5)
  if ((a.ability === 'purepower' || a.ability === 'hugepower') && physical) atMods.push(M.x2)
  if (a.ability === 'solarpower' && weather === 'sun' && !physical) atMods.push(M.x1_5)
  if (a.ability === 'flashfire' && a.flags.flashFire && move.type === 'Fire') atMods.push(M.x1_5)
  if (a.ability === 'slowstart' && a.flags.slowStartActive && physical) atMods.push(M.x0_5)
  if ((a.ability === 'flowergift' || a.flags.flowerGiftAlly) && weather === 'sun' && physical) atMods.push(M.x1_5)
  const aSp = speciesItem(atkItem, a.species), dSp = speciesItem(defItem, d.species)
  if (aSp?.id === 'thickclub' && physical) atMods.push(M.x2)
  if (aSp?.id === 'deepseatooth' && !physical) atMods.push(M.x2)
  if (aSp?.id === 'lightball') atMods.push(M.x2)
  if (aSp?.id === 'souldew' && !physical) atMods.push(M.x1_5)
  if (atkItem === 'choiceband' && physical) atMods.push(M.x1_5)
  if (atkItem === 'choicespecs' && !physical) atMods.push(M.x1_5)
  attack = OF16(Math.max(1, applyMod(attack, chainMods(atMods, 410, 131072))))

  // ── Defense (#4) ─────────────────────────────────────────────────────────
  const hitsDef = physical || move.flags.hitsDefense
  const defKey = hitsDef ? 'defense' : 'spdefense'
  const defStage = d.stages[defKey]
  let defense: number
  if (move.flags.ignoreDefenseStages || a.ability === 'unaware' || defStage === 0 || (crit && defStage > 0)) defense = d.stats[defKey]
  else defense = applyStage(5, d.stats[defKey], defStage)
  defense = OF16(defense)
  if (weather === 'sand' && (d.types[0] === 'Rock' || d.types[1] === 'Rock') && !hitsDef) defense = OF16(applyMod(defense, M.x1_5))
  const dfMods: number[] = []
  if (defAbility === 'marvelscale' && d.status !== 'none' && hitsDef) dfMods.push(M.x1_5)
  if ((defAbility === 'flowergift' || d.flags.flowerGiftAlly) && weather === 'sun' && !hitsDef) dfMods.push(M.x1_5)
  if (dSp?.id === 'deepseascale' && !hitsDef) dfMods.push(M.x1_5)
  if (dSp?.id === 'metalpowder' && !d.flags.transformed && hitsDef) dfMods.push(M.x2)
  if (defItem === 'eviolite' && d.flags.notFullyEvolved) dfMods.push(M.x1_5)
  if (dSp?.id === 'souldew' && !hitsDef) dfMods.push(M.x1_5)
  defense = OF16(Math.max(1, applyMod(defense, chainMods(dfMods, 410, 131072))))

  // ── Base power (#5) ──────────────────────────────────────────────────────
  let bp = move.power
  if (move.flags.doubler === 'power' && move.flags.doublerActive) bp *= 2
  const bpMods: number[] = []
  if (a.ability === 'technician' && bp <= 60) bpMods.push(M.x1_5)
  if (a.ability === 'flareboost' && a.status === 'burn' && !physical) bpMods.push(M.x1_5)
  if (a.ability === 'analytic' && d.flags.movedThisTurn) bpMods.push(M.x1_3)
  if (a.ability === 'reckless' && (move.flags.recoil || move.data.effect === 'recoil_on_miss') && move.name !== 'Struggle') bpMods.push(M.x1_2)
  if (a.ability === 'ironfist' && move.flags.punch) bpMods.push(M.x1_2)
  if (a.ability === 'toxicboost' && (a.status === 'poison' || a.status === 'toxic') && physical) bpMods.push(M.x1_5)
  if (a.ability === 'rivalry' && a.gender !== 'N' && d.gender !== 'N') bpMods.push(a.gender === d.gender ? M.x1_25 : M.x0_75)
  if (a.ability === 'sandforce' && weather === 'sand' && ['Rock', 'Ground', 'Steel'].includes(move.type)) bpMods.push(M.x1_3)
  if (defAbility === 'heatproof' && move.type === 'Fire') bpMods.push(M.x0_5)
  if (defAbility === 'dryskin' && move.type === 'Fire') bpMods.push(M.x1_25)
  if (a.ability === 'sheerforce' && move.flags.hasSecondary) bpMods.push(M.x1_3)
  const item = getItem(atkItem)
  if (item?.kind === 'typeboost' && item.type === move.type) bpMods.push(M.x1_2)
  if (atkItem === 'muscleband' && physical) bpMods.push(M.x1_1)
  if (aSp?.id === 'lustrousorb' && (move.type === 'Water' || move.type === 'Dragon')) bpMods.push(M.x1_2)
  if (atkItem === 'wiseglasses' && !physical) bpMods.push(M.x1_1)
  if (aSp?.id === 'griseousorb' && (move.type === 'Ghost' || move.type === 'Dragon')) bpMods.push(M.x1_2)
  if (aSp?.id === 'adamantorb' && (move.type === 'Steel' || move.type === 'Dragon')) bpMods.push(M.x1_2)
  if (item?.kind === 'gem' && item.type === move.type) bpMods.push(M.x1_5)
  if (move.name === 'Solar Beam' && (weather === 'rain' || weather === 'sand' || weather === 'hail')) bpMods.push(M.x0_5)
  if (a.flags.charge && move.type === 'Electric') bpMods.push(M.x2)
  if (a.flags.helpingHand) bpMods.push(M.x1_5)
  if (field.waterSport && move.type === 'Fire') bpMods.push(0x548)
  if (field.mudSport && move.type === 'Electric') bpMods.push(0x548)
  bp = OF16(Math.max(1, applyMod(bp, chainMods(bpMods, 41, 2097152))))

  // ── Immunities and effectiveness ─────────────────────────────────────────
  let stab = false
  let effectiveness = 1
  const typeless = move.name === 'Struggle' || move.flags.noTypeChart
  if (!typeless) {
    const imm = gen5AbilityImmunity(move.type, defAbility, d, move.power > 0)
    if (imm) return { rolls: [0], effectiveness: 0, stab, immune: true, notes: [...notes, imm] }
    effectiveness = combinedEffectiveness(move.type, d.types, {
      identified: d.flags.identified || a.ability === 'scrappy',
      miracleEyed: d.flags.miracleEyed,
      grounded: d.flags.grounded || defItem === 'ironball' || field.gravity,
      roosted: d.flags.roosted,
    })
    if (effectiveness === 0) return { rolls: [0], effectiveness: 0, stab, immune: true, notes }
    if (defAbility === 'wonderguard' && effectiveness < 2) return { rolls: [0], effectiveness, stab, immune: true, notes: [...notes, 'Wonder Guard'] }
    stab = !move.flags.noStab && (move.type === a.types[0] || move.type === a.types[1])
  }
  const stabMod = !stab ? 4096 : a.ability === 'adaptability' ? M.x2 : M.x1_5

  // ── Base damage (#6) and pre-random modifiers (#7–#9) ────────────────────
  let base = Math.floor(OF32(Math.floor(OF32(OF32((Math.floor(2 * a.level / 5) + 2) * bp) * attack) / defense) / 50) + 2)
  const spread = field.isDoubles && (move.flags.spread === 'both' || move.flags.spread === 'all') && field.defendersAlive === 2
  if (spread) base = applyMod(base, M.x0_75)
  if ((weather === 'sun' && move.type === 'Fire') || (weather === 'rain' && move.type === 'Water')) base = applyMod(base, M.x1_5)
  else if ((weather === 'sun' && move.type === 'Water') || (weather === 'rain' && move.type === 'Fire')) base = applyMod(base, M.x0_5)
  if (crit) base = base * 2

  // ── Final modifier chain (#15) ───────────────────────────────────────────
  const finalMods: number[] = []
  const screen = physical ? d.flags.reflect : d.flags.lightScreen
  if (screen && !crit && a.ability !== 'infiltrator' && move.name !== 'Brick Break') finalMods.push(field.isDoubles ? 0xA8F : M.x0_5)
  if (defAbility === 'multiscale' && d.currentHp >= d.stats.hp) finalMods.push(M.x0_5)
  if (a.ability === 'tintedlens' && effectiveness < 1) finalMods.push(M.x2)
  if (d.flags.friendGuardAlly) finalMods.push(M.x0_75)
  if (a.ability === 'sniper' && crit) finalMods.push(M.x1_5)
  if ((defAbility === 'solidrock' || defAbility === 'filter') && effectiveness > 1) finalMods.push(M.x0_75)
  const metro = a.counters.metronomeUses ?? 0
  if (atkItem === 'metronome' && metro >= 1) finalMods.push(metro <= 4 ? 4096 + metro * 819 : 8192)
  if (atkItem === 'expertbelt' && effectiveness > 1) finalMods.push(M.x1_2)
  if (atkItem === 'lifeorb') finalMods.push(0x14CC)
  const berry = getItem(defItem)
  if (berry?.kind === 'resistberry' && berry.type === move.type && (effectiveness > 1 || move.type === 'Normal') && a.ability !== 'unnerve') finalMods.push(M.x0_5)
  if (move.flags.doubler === 'final' && move.flags.doublerActive) finalMods.push(M.x2)
  const finalMod = chainMods(finalMods, 41, 131072)

  const burn = physical && a.status === 'burn' && a.ability !== 'guts'
  const rolls: number[] = []
  for (let i = 0; i < 16; i++) {
    let D = move.flags.noRandom ? base : Math.floor(OF32(base * (85 + i)) / 100)
    if (stabMod !== 4096) D = applyMod(D, stabMod)
    D = Math.floor(D * effectiveness)
    if (burn) D = Math.floor(D / 2)
    if (D === 0) D = 1
    D = OF16(applyMod(D, finalMod))
    rolls.push(D)
    if (move.flags.noRandom) break
  }
  if (rolls.some(v => v === 0)) notes.push('Damage of 0 is possible: Gen 5 has no minimum after the final modifier (G5 §9)')

  return { rolls, effectiveness, stab, immune: false, notes }
}

/** Gen 5 immunity abilities (G5 §6). */
export function gen5AbilityImmunity(
  moveType: string, defAbility: string | null, d: CalcContext['defender'], hasPower: boolean,
): string | null {
  const ironBall = d.item === 'ironball'
  if (moveType === 'Ground' && !ironBall && !d.flags.grounded) {
    if (defAbility === 'levitate') return 'Levitate'
    if (d.flags.magnetRise) return 'Magnet Rise'
    if (d.item === 'airballoon') return 'Air Balloon'
  }
  if (!hasPower) return null
  if (moveType === 'Electric' && (defAbility === 'voltabsorb' || defAbility === 'motordrive' || defAbility === 'lightningrod')) return 'Immune (ability)'
  if (moveType === 'Water' && (defAbility === 'waterabsorb' || defAbility === 'dryskin' || defAbility === 'stormdrain')) return 'Immune (ability)'
  if (moveType === 'Fire' && defAbility === 'flashfire') return 'Flash Fire'
  if (moveType === 'Grass' && defAbility === 'sapsipper') return 'Sap Sipper'
  return null
}
