/**
 * Hit chance per generation: hand-computed from the routines cited in
 * accuracy.ts (byte maths for Gen 1–2, percent maths for Gen 3–4, Showdown's
 * 4096-scale chain for Gen 5).
 */
import { describe, it, expect } from 'vitest'
import { calc, mon, move, field } from './helpers'
import type { StatStages } from '../types'

const fireBlast = move({ move: 'Fire Blast', type: 'Fire', category: 'Special', power: 120, accuracy: 85, effect: 'may_burn' })
const takeDown  = move({ move: 'Take Down', power: 90, accuracy: 85, effect: 'quarter_recoil_on_hit' })
const thunder   = move({ move: 'Thunder', type: 'Electric', category: 'Special', power: 120, accuracy: 70, effect: 'thunder' })
const blizzard  = move({ move: 'Blizzard', type: 'Ice', category: 'Special', power: 120, accuracy: 70, effect: 'blizzard' })
const swift     = move({ move: 'Swift', power: 60, accuracy: null, effect: 'always_hit' })
const fissure   = move({ move: 'Fissure', type: 'Ground', power: null, accuracy: 30, effect: 'one_hit_ko' })
const tackle    = move({ move: 'Tackle', power: 35, accuracy: 100 })

// Fire-type attackers keep the Normal-type test moves STAB-free and simple.
const fire = () => mon({ types: ['Fire', 'Fire'] })
// mon() fills the missing stages with zeros.
const stages = (accuracy = 0, evasion = 0) => ({ accuracy, evasion } as StatStages)

describe('Gen 1 (byte / 256, 255 cap)', () => {
  it('85% is 216/256, 100% is 255/256', () => {
    expect(calc(1, { moveData: fireBlast }).hitChance).toBeCloseTo(216 / 256, 10)
    expect(calc(1, { moveData: tackle }).hitChance).toBeCloseTo(255 / 256, 10)
  })
  it('stat-table ratios, floored per step, capped at 255', () => {
    expect(calc(1, { moveData: tackle, defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(168 / 256, 10)   // 255*66/100
    expect(calc(1, { moveData: tackle, attacker: mon({ stages: stages(-1) }), defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(110 / 256, 10) // 168*66/100
    expect(calc(1, { moveData: fireBlast, attacker: mon({ stages: stages(1) }) }).hitChance).toBeCloseTo(255 / 256, 10) // 216*15/10 = 324 → 255
    expect(calc(1, { moveData: tackle, attacker: mon({ stages: stages(-6) }), defender: mon({ stages: stages(0, 6) }) }).hitChance).toBeCloseTo(15 / 256, 10) // 63 → 15
  })
  it('Swift skips the test and reaches a Fly target; nothing else does', () => {
    expect(calc(1, { moveData: swift }).hitChance).toBe(1)
    expect(calc(1, { moveData: swift, defender: mon({ flags: { flying: true } }) }).hitChance).toBe(1)
    expect(calc(1, { moveData: fireBlast, defender: mon({ flags: { flying: true } }) }).hitChance).toBe(0)
  })
  it('OHKO: 76/256, only when the in-battle Speed is not lower', () => {
    expect(calc(1, { moveData: fissure, attacker: mon({ spe: 100 }), defender: mon({ spe: 90 }) }).hitChance).toBeCloseTo(76 / 256, 10)
    expect(calc(1, { moveData: fissure, attacker: mon({ spe: 90 }), defender: mon({ spe: 100 }) }).hitChance).toBe(0)
    expect(calc(1, { moveData: fissure, attacker: mon({ spe: 100, status: 'paralysis' }), defender: mon({ spe: 90 }) }).hitChance).toBe(0) // 100 >> 2
    expect(calc(1, { moveData: fissure, attacker: mon({ spe: 90, stages: { speed: 1 } as StatStages }), defender: mon({ spe: 100 }) }).hitChance).toBeCloseTo(76 / 256, 10) // 135
  })
})

describe('Gen 2 (byte / 256, 255 always hits)', () => {
  it('85% is 216/256; 100% cannot miss', () => {
    expect(calc(2, { moveData: fireBlast }).hitChance).toBeCloseTo(216 / 256, 10)
    expect(calc(2, { moveData: tackle }).hitChance).toBe(1)
  })
  it('accuracy table and Bright Powder −20', () => {
    expect(calc(2, { moveData: tackle, defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(191 / 256, 10)  // 255*75/100
    expect(calc(2, { moveData: tackle, defender: mon({ item: 'brightpowder' }) }).hitChance).toBeCloseTo(235 / 256, 10)
    expect(calc(2, { moveData: fireBlast, defender: mon({ item: 'brightpowder' }) }).hitChance).toBeCloseTo(196 / 256, 10)
  })
  it('Foresight skips the stages when evasion ≥ accuracy stage', () => {
    expect(calc(2, { moveData: fireBlast, defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(162 / 256, 10)   // 216*75/100
    expect(calc(2, { moveData: fireBlast, defender: mon({ stages: stages(0, 1), flags: { identified: true } }) }).hitChance).toBeCloseTo(216 / 256, 10)
  })
  it('Thunder: rain always hits, sun is 128/256 before stages', () => {
    expect(calc(2, { moveData: thunder, field: field(2, { weather: 'rain' }) }).hitChance).toBe(1)
    expect(calc(2, { moveData: thunder, field: field(2, { weather: 'sun' }) }).hitChance).toBeCloseTo(128 / 256, 10)
    expect(calc(2, { moveData: thunder, field: field(2, { weather: 'sun' }), defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(96 / 256, 10)
  })
  it('OHKO: 76 + 2 × level difference, fails from below', () => {
    expect(calc(2, { moveData: fissure }).hitChance).toBeCloseTo(76 / 256, 10)
    expect(calc(2, { moveData: fissure, attacker: mon({ level: 60 }) }).hitChance).toBeCloseTo(96 / 256, 10)
    expect(calc(2, { moveData: fissure, attacker: mon({ level: 49 }) }).hitChance).toBe(0)
    expect(calc(2, { moveData: fissure, attacker: mon({ level: 100 }), defender: mon({ level: 5 }) }).hitChance).toBe(1)   // 76 + 190 → 255
  })
})

describe('Gen 3 (percent, floor per modifier)', () => {
  it('stages: one combined ratio', () => {
    expect(calc(3, { moveData: fireBlast, attacker: fire() }).hitChance).toBeCloseTo(0.85, 10)
    expect(calc(3, { moveData: fireBlast, attacker: mon({ ...fire(), stages: stages(-1) }) }).hitChance).toBeCloseTo(0.63, 10)   // 75*85/100
    expect(calc(3, { moveData: fireBlast, attacker: fire(), defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(0.63, 10)
    expect(calc(3, { moveData: fireBlast, attacker: mon({ ...fire(), stages: stages(1) }) }).hitChance).toBe(1)                // 113 → 100
    expect(calc(3, { moveData: tackle, defender: mon({ stages: stages(0, 2) }) }).hitChance).toBeCloseTo(0.6, 10)
    expect(calc(3, { moveData: tackle, defender: mon({ stages: stages(0, 2), flags: { identified: true } }) }).hitChance).toBe(1)
  })
  it('Compound Eyes ×1.3, Hustle ×0.8 on physical, Sand Veil ×0.8 (not under Cloud Nine)', () => {
    expect(calc(3, { moveData: thunder, attacker: mon({ ...fire(), ability: 'compoundeyes' }) }).hitChance).toBeCloseTo(0.91, 10)
    expect(calc(3, { moveData: takeDown, attacker: mon({ ...fire(), ability: 'hustle' }) }).hitChance).toBeCloseTo(0.68, 10)
    expect(calc(3, { moveData: fireBlast, attacker: mon({ ...fire(), ability: 'hustle' }) }).hitChance).toBeCloseTo(0.85, 10)
    expect(calc(3, { moveData: tackle, defender: mon({ ability: 'sandveil' }), field: field(3, { weather: 'sand' }) }).hitChance).toBeCloseTo(0.8, 10)
    expect(calc(3, { moveData: tackle, attacker: mon({ ability: 'cloudnine' }), defender: mon({ ability: 'sandveil' }), field: field(3, { weather: 'sand' }) }).hitChance).toBe(1)
  })
  it('Bright Powder ×0.9, Lax Incense ×0.95, after the stage ratio', () => {
    expect(calc(3, { moveData: tackle, defender: mon({ item: 'brightpowder' }) }).hitChance).toBeCloseTo(0.9, 10)
    expect(calc(3, { moveData: tackle, defender: mon({ item: 'laxincense' }) }).hitChance).toBeCloseTo(0.95, 10)
    expect(calc(3, { moveData: tackle, attacker: mon({ stages: stages(-1) }), defender: mon({ item: 'brightpowder' }) }).hitChance).toBeCloseTo(0.67, 10) // 75 → 67
  })
  it('Thunder in sun 50, in rain always; Vital Throw never misses', () => {
    expect(calc(3, { moveData: thunder, field: field(3, { weather: 'sun' }) }).hitChance).toBeCloseTo(0.5, 10)
    expect(calc(3, { moveData: thunder, field: field(3, { weather: 'rain' }) }).hitChance).toBe(1)
    expect(calc(3, { moveData: move({ move: 'Vital Throw', type: 'Fighting', power: 70, accuracy: null }), attacker: fire() }).hitChance).toBe(1)
  })
  it('OHKO: rand+1 < 30 + diff (29% at equal level); Sturdy blocks', () => {
    expect(calc(3, { moveData: fissure, attacker: fire() }).hitChance).toBeCloseTo(0.29, 10)
    expect(calc(3, { moveData: fissure, attacker: mon({ ...fire(), level: 60 }) }).hitChance).toBeCloseTo(0.39, 10)
    expect(calc(3, { moveData: fissure, attacker: mon({ ...fire(), level: 49 }) }).hitChance).toBe(0)
    expect(calc(3, { moveData: fissure, attacker: fire(), defender: mon({ ability: 'sturdy' }) }).hitChance).toBe(0)
    expect(calc(3, { moveData: fissure, attacker: mon({ ...fire(), level: 100 }), defender: mon({ level: 20 }) }).hitChance).toBe(1)
  })
})

describe('Gen 4 (percent, floor per modifier)', () => {
  it('Simple doubles a side\'s stages, Unaware ignores the other side\'s', () => {
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), ability: 'simple', stages: stages(-1) }) }).hitChance).toBeCloseTo(0.51, 10) // stage −2: 60%
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), stages: stages(2) }), defender: mon({ ability: 'unaware' }) }).hitChance).toBeCloseTo(0.85, 10)
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), ability: 'unaware' }), defender: mon({ stages: stages(0, 2) }) }).hitChance).toBeCloseTo(0.85, 10)
  })
  it('Foresight drops positive evasion only', () => {
    expect(calc(4, { moveData: fireBlast, attacker: fire(), defender: mon({ stages: stages(0, 1), flags: { identified: true } }) }).hitChance).toBeCloseTo(0.85, 10)
    expect(calc(4, { moveData: fireBlast, attacker: fire(), defender: mon({ stages: stages(0, -1), flags: { identified: true } }) }).hitChance).toBe(1) // 113
  })
  it('Hustle by class; Snow Cloak in hail unless Mold Breaker', () => {
    expect(calc(4, { moveData: takeDown, attacker: mon({ ...fire(), ability: 'hustle' }) }).hitChance).toBeCloseTo(0.68, 10)
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), ability: 'hustle' }) }).hitChance).toBeCloseTo(0.85, 10)
    expect(calc(4, { moveData: tackle, defender: mon({ ability: 'snowcloak' }), field: field(4, { weather: 'hail' }) }).hitChance).toBeCloseTo(0.8, 10)
    expect(calc(4, { moveData: tackle, attacker: mon({ ability: 'moldbreaker' }), defender: mon({ ability: 'snowcloak' }), field: field(4, { weather: 'hail' }) }).hitChance).toBe(1)
  })
  it('items: Bright Powder / Lax Incense ×0.9, Wide Lens ×1.1, Zoom Lens ×1.2 once the target moved', () => {
    expect(calc(4, { moveData: tackle, defender: mon({ item: 'laxincense' }) }).hitChance).toBeCloseTo(0.9, 10)
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), item: 'widelens' }) }).hitChance).toBeCloseTo(0.93, 10)
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), item: 'zoomlens' }) }).hitChance).toBeCloseTo(0.85, 10)
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), item: 'zoomlens' }), defender: mon({ flags: { movedThisTurn: true } }) }).hitChance).toBe(1) // 102
  })
  it('Gravity ×10/6 last; weather rules; No Guard', () => {
    expect(calc(4, { moveData: thunder, defender: mon({ stages: stages(0, 2) }), field: field(4, { gravity: true }) }).hitChance).toBeCloseTo(0.7, 10) // 42 → 70
    expect(calc(4, { moveData: thunder, field: field(4, { weather: 'sun' }) }).hitChance).toBeCloseTo(0.5, 10)
    expect(calc(4, { moveData: blizzard, field: field(4, { weather: 'hail' }) }).hitChance).toBe(1)
    expect(calc(4, { moveData: blizzard, field: field(4, { weather: 'hail' }), defender: mon({ flags: { flying: true } }) }).hitChance).toBe(0)
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), ability: 'noguard' }) }).hitChance).toBe(1)
  })
  it('OHKO: rand < 30 + diff; Sturdy; No Guard', () => {
    expect(calc(4, { moveData: fissure, attacker: fire() }).hitChance).toBeCloseTo(0.3, 10)
    expect(calc(4, { moveData: fissure, attacker: mon({ ...fire(), level: 60 }) }).hitChance).toBeCloseTo(0.4, 10)
    expect(calc(4, { moveData: fissure, attacker: fire(), defender: mon({ ability: 'sturdy' }) }).hitChance).toBe(0)
    expect(calc(4, { moveData: fissure, attacker: mon({ ...fire(), ability: 'noguard' }) }).hitChance).toBe(1)
    expect(calc(4, { moveData: fissure, attacker: mon({ ...fire(), ability: 'noguard', level: 49 }) }).hitChance).toBe(0)
  })
})

describe('Gen 5 (Showdown: 4096-scale chain, then stage truncation)', () => {
  it('modifiers round half down on the chained product', () => {
    expect(calc(5, { moveData: thunder, attacker: mon({ ...fire(), ability: 'compoundeyes' }) }).hitChance).toBeCloseTo(0.91, 10)
    expect(calc(5, { moveData: takeDown, attacker: mon({ ...fire(), ability: 'hustle' }) }).hitChance).toBeCloseTo(0.68, 10)
    expect(calc(5, { moveData: tackle, defender: mon({ item: 'brightpowder' }) }).hitChance).toBeCloseTo(0.9, 10)
    expect(calc(5, { moveData: thunder, attacker: mon({ ...fire(), ability: 'compoundeyes' }), defender: mon({ item: 'brightpowder' }) }).hitChance).toBeCloseTo(0.82, 10) // chain 4792
    expect(calc(5, { moveData: thunder, attacker: mon({ ...fire(), ability: 'victorystar' }) }).hitChance).toBeCloseTo(0.77, 10)
  })
  it('stages: combined boost, (3+n)/3 or 3/(3+n), truncated', () => {
    expect(calc(5, { moveData: tackle, defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(0.75, 10)
    expect(calc(5, { moveData: fireBlast, attacker: fire(), defender: mon({ stages: stages(0, 2) }) }).hitChance).toBeCloseTo(0.51, 10)
    expect(calc(5, { moveData: tackle, attacker: mon({ stages: stages(-6) }), defender: mon({ stages: stages(0, 6) }) }).hitChance).toBeCloseTo(0.33, 10)
    expect(calc(5, { moveData: tackle, defender: mon({ stages: stages(0, 1), item: 'brightpowder' }) }).hitChance).toBeCloseTo(0.67, 10) // 90 → 67
  })
  it('Gravity, weather moves, No Guard through Fly', () => {
    expect(calc(5, { moveData: thunder, defender: mon({ stages: stages(0, 2) }), field: field(5, { gravity: true }) }).hitChance).toBeCloseTo(0.7, 10) // 117 → 70
    expect(calc(5, { moveData: move({ ...thunder, move: 'Hurricane', type: 'Flying', effect: 'may_confuse' }), field: field(5, { weather: 'sun' }) }).hitChance).toBeCloseTo(0.5, 10)
    expect(calc(5, { moveData: fireBlast, attacker: mon({ ...fire(), ability: 'noguard' }), defender: mon({ flags: { flying: true } }) }).hitChance).toBe(1)
    expect(calc(4, { moveData: fireBlast, attacker: mon({ ...fire(), ability: 'noguard' }), defender: mon({ flags: { flying: true } }) }).hitChance).toBe(0)
  })
  it('OHKO: 30 + diff; Mold Breaker ignores Sturdy', () => {
    expect(calc(5, { moveData: fissure, attacker: fire() }).hitChance).toBeCloseTo(0.3, 10)
    expect(calc(5, { moveData: fissure, attacker: fire(), defender: mon({ ability: 'sturdy' }) }).hitChance).toBe(0)
    expect(calc(5, { moveData: fissure, attacker: mon({ ...fire(), ability: 'moldbreaker' }), defender: mon({ ability: 'sturdy' }) }).hitChance).toBeCloseTo(0.3, 10)
  })
})

describe('data quirks', () => {
  it('Struggle is 100% through Gen 3 and cannot miss from Gen 4', () => {
    const struggle = move({ move: 'Struggle', power: 50, accuracy: null, effect: 'half_recoil_on_hit' })
    expect(calc(1, { moveData: struggle }).hitChance).toBeCloseTo(255 / 256, 10)
    expect(calc(3, { moveData: struggle, defender: mon({ stages: stages(0, 1) }) }).hitChance).toBeCloseTo(0.75, 10)
    expect(calc(4, { moveData: struggle, defender: mon({ stages: stages(0, 1) }) }).hitChance).toBe(1)
  })
  it('semi-invulnerable exceptions per gen', () => {
    const eq = move({ move: 'Earthquake', type: 'Ground', power: 100, effect: 'double_damage_underground_targets' })
    expect(calc(2, { moveData: eq, attacker: fire(), defender: mon({ flags: { underground: true } }) }).hitChance).toBe(1)
    expect(calc(2, { moveData: fissure, attacker: fire(), defender: mon({ flags: { underground: true } }) }).hitChance).toBeCloseTo(76 / 256, 10)
    expect(calc(3, { moveData: fissure, attacker: fire(), defender: mon({ flags: { underground: true } }) }).hitChance).toBe(0)
    expect(calc(3, { moveData: move({ move: 'Surf', type: 'Water', category: 'Special', power: 95 }), attacker: fire(), defender: mon({ flags: { underwater: true } }) }).hitChance).toBe(1)
  })
})
