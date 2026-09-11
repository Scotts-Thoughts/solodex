/**
 * Move resolution: variable-power formulas at their thresholds, fixed damage,
 * multi-hit distributions and reflect moves. Rule citations are in moves.ts.
 */
import { describe, it, expect } from 'vitest'
import { calc, mon, move } from './helpers'
import { hiddenPowerGen2, hiddenPowerGen3 } from '../moves'

const flail = move({ move: 'Flail', power: null, effect: 'reversal' })
const lowKick = move({ move: 'Low Kick', type: 'Fighting', power: null, effect: 'weight_based_power' })

describe('HP-based power', () => {
  it('Flail 48-scale thresholds (Gen 3)', () => {
    const at = (hp: number) => calc(3, { attacker: mon({ hp: 100, currentHp: hp, types: ['Fire', 'Fire'] }), moveData: flail }).power
    expect(at(100)).toBe(20)   // q=48
    expect(at(66)).toBe(40)    // q=31
    expect(at(33)).toBe(80)    // q=15
    expect(at(20)).toBe(100)   // q=9
    expect(at(9)).toBe(150)    // q=4
    expect(at(3)).toBe(200)    // q=1
  })
  it('Flail 64-scale thresholds (Gen 4)', () => {
    const at = (hp: number) => calc(4, { attacker: mon({ hp: 100, currentHp: hp, types: ['Fire', 'Fire'] }), moveData: flail }).power
    expect(at(100)).toBe(20)   // p=64
    expect(at(65)).toBe(40)    // p=41
    expect(at(33)).toBe(80)    // p=21
    expect(at(18)).toBe(100)   // p=11
    expect(at(8)).toBe(150)    // p=5
    expect(at(2)).toBe(200)    // p=1
  })
  it('Eruption power = hp*150/maxHP, min 1', () => {
    const r = calc(3, { attacker: mon({ hp: 100, currentHp: 1, types: ['Water', 'Water'] }), moveData: move({ move: 'Eruption', type: 'Fire', power: 150, effect: 'eruption' }) })
    expect(r.power).toBe(1)
  })
})

describe('weight-based power', () => {
  it('Low Kick table', () => {
    const at = (gen: 3 | 4 | 5, kg: number) => calc(gen, { attacker: mon({ types: ['Fire', 'Fire'] }), defender: mon({ weight: kg }), moveData: lowKick }).power
    expect(at(3, 9.9)).toBe(20)
    expect(at(3, 10)).toBe(40)
    expect(at(4, 10)).toBe(20)   // Gen 4 uses <= 100 (0.1 kg units)
    expect(at(4, 10.1)).toBe(40)
    expect(at(5, 199.9)).toBe(100)
    expect(at(5, 200)).toBe(120)
  })
  it('Low Kick is fixed 50 in Gen 1–2', () => {
    expect(calc(2, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: move({ move: 'Low Kick', type: 'Fighting', power: 50, effect: 'may_flinch' }) }).power).toBe(50)
  })
})

describe('Hidden Power', () => {
  it('Gen 2 from DVs: all 15s is Dark 70', () => {
    expect(hiddenPowerGen2({ attack: 15, defense: 15, speed: 15, special: 15 })).toEqual({ type: 'Dark', power: 70 })
    expect(hiddenPowerGen2({ attack: 0, defense: 0, speed: 0, special: 0 })).toEqual({ type: 'Fighting', power: 31 })
  })
  it('Gen 3+ from IVs: all 31s is Dark 70', () => {
    expect(hiddenPowerGen3({ hp: 31, attack: 31, defense: 31, spattack: 31, spdefense: 31, speed: 31 })).toEqual({ type: 'Dark', power: 70 })
    expect(hiddenPowerGen3({ hp: 0, attack: 0, defense: 0, spattack: 0, spdefense: 0, speed: 0 })).toEqual({ type: 'Fighting', power: 30 })
  })
  it('Gen 2–3 Hidden Power category follows the type', () => {
    const md = move({ move: 'Hidden Power', power: 60, effect: 'hidden_power' })
    const rock = calc(3, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: md, options: { hiddenPowerType: 'Rock' } })
    const fire = calc(3, { attacker: mon({ types: ['Water', 'Water'] }), moveData: md, options: { hiddenPowerType: 'Fire' } })
    expect(rock.category).toBe('physical')
    expect(fire.category).toBe('special')
    expect(calc(4, { attacker: mon(), moveData: move({ ...md, category: 'Special' }), options: { hiddenPowerType: 'Rock' } }).category).toBe('special')
  })
})

describe('friendship', () => {
  it('Return 102 at max, Frustration 1 (Gen 3+) / 0 damage (Gen 2)', () => {
    const ret = move({ move: 'Return', power: null, effect: 'return' })
    const fru = move({ move: 'Frustration', power: null, effect: 'frustration' })
    expect(calc(3, { attacker: mon({ friendship: 255, types: ['Fire', 'Fire'] }), moveData: ret }).power).toBe(102)
    expect(calc(3, { attacker: mon({ friendship: 255, types: ['Fire', 'Fire'] }), moveData: fru }).power).toBe(1)
    expect(calc(2, { attacker: mon({ friendship: 255, types: ['Fire', 'Fire'] }), moveData: fru }).kind).toBe('none')
  })
})

describe('fixed damage and OHKO', () => {
  it('Seismic Toss = level, Sonic Boom 20, Dragon Rage 40, Super Fang half current HP', () => {
    expect(calc(3, { moveData: move({ move: 'Seismic Toss', type: 'Fighting', power: null, effect: 'level_based_damage' }) }).max).toBe(50)
    expect(calc(3, { moveData: move({ move: 'Sonic Boom', power: null, effect: 'basic_hit' }) }).max).toBe(20)
    expect(calc(3, { moveData: move({ move: 'Dragon Rage', type: 'Dragon', power: null, effect: 'fixed_damage' }) }).max).toBe(40)
    expect(calc(3, { defender: mon({ hp: 150, currentHp: 75 }), moveData: move({ move: 'Super Fang', power: null, effect: 'super_fang' }) }).max).toBe(37)
  })
  it('fixed damage respects immunity from Gen 2 (not Gen 1)', () => {
    const st = move({ move: 'Seismic Toss', type: 'Fighting', power: null, effect: 'level_based_damage' })
    expect(calc(1, { defender: mon({ types: ['Ghost', 'Ghost'] }), moveData: st }).kind).toBe('fixed')
    expect(calc(2, { defender: mon({ types: ['Ghost', 'Ghost'] }), moveData: st }).kind).toBe('immune')
  })
  it('Psywave ranges per gen', () => {
    const pw = move({ move: 'Psywave', type: 'Psychic', power: null, effect: 'psywave' })
    expect(calc(1, { moveData: pw }).min).toBe(1)
    expect(calc(1, { moveData: pw }).max).toBe(74)          // < L + L/2 = 75
    expect(calc(3, { moveData: pw }).min).toBe(25)          // 50 · 0.5
    expect(calc(3, { moveData: pw }).max).toBe(75)          // 50 · 1.5
    expect(calc(5, { moveData: pw }).rolls.length).toBe(101)
  })
  it('OHKO kind and Sheer Cold', () => {
    const r = calc(3, { moveData: move({ move: 'Fissure', type: 'Ground', power: null, effect: 'one_hit_ko' }) })
    expect(r.kind).toBe('ohko')
    expect(calc(3, { defender: mon({ types: ['Flying', 'Flying'] }), moveData: move({ move: 'Fissure', type: 'Ground', power: null, effect: 'one_hit_ko' }) }).kind).toBe('immune')
  })
  it('Counter doubles the incoming damage', () => {
    const r = calc(3, { moveData: move({ move: 'Counter', type: 'Fighting', power: null, effect: 'counter' }), options: { incomingDamage: 37 } })
    expect(r.kind).toBe('reflect')
    expect(r.max).toBe(74)
  })
})

describe('multi-hit', () => {
  it('2–5 hit distribution Gen 1–4 and Skill Link', () => {
    const fa = move({ move: 'Fury Attack', power: 15, effect: 'two_to_five_hits' })
    expect(calc(3, { moveData: fa }).hits?.distribution).toEqual([[2, 3 / 8], [3, 3 / 8], [4, 1 / 8], [5, 1 / 8]])
    expect(calc(4, { attacker: mon({ ability: 'skilllink' }), moveData: fa }).hits?.distribution).toEqual([[5, 1]])
  })
  it('Triple Kick 10/20/30 with totals', () => {
    const r = calc(3, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: move({ move: 'Triple Kick', type: 'Fighting', power: 10, effect: 'triple_kick' }) })
    expect(r.hits?.perHitPower).toEqual([10, 20, 30])
    expect(r.hits?.totalMax).toBeGreaterThan(r.max * 2)
  })
  it('Gen 2 Triple Kick multiplies the DamageCalc output by kick number', () => {
    // base D at power 10: q=22; 22·10·100/80 = 275/50 = 5 → +2 = 7 → ×kick → Fighting vs Normal ×2
    const r = calc(2, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: move({ move: 'Triple Kick', type: 'Fighting', power: 10, effect: 'triple_kick' }) })
    expect(r.rolls[r.rolls.length - 1]).toBe(14)
    expect(r.hits?.totalMax).toBe(14 + 28 + 42)
  })
  it('Beat Up per party member (Gen 3 base stats, Gen 5 baseAtk/10+5)', () => {
    const party = [
      { species: 'A', level: 50, baseStats: { hp: 1, attack: 100, defense: 1, special_attack: 1, special_defense: 1, speed: 1 }, usable: true },
      { species: 'B', level: 50, baseStats: { hp: 1, attack: 50, defense: 1, special_attack: 1, special_defense: 1, speed: 1 }, usable: true },
    ]
    const bu = move({ move: 'Beat Up', type: 'Dark', power: 10, effect: 'beat_up' })
    const g3 = calc(3, { attacker: mon({ party }), defender: mon({ baseStats: { hp: 1, attack: 1, defense: 60, special_attack: 1, special_defense: 1, speed: 1 } }), moveData: bu })
    // member A: 100·10·22/60 = 366 /50 = 7 → 9 ; member B: 50·10·22/60 = 183/50 = 3 → 5
    expect(g3.max).toBe(9)
    expect(g3.hits?.totalMax).toBe(9 + 5)
    const g5 = calc(5, { attacker: mon({ party }), moveData: { ...bu, power: null } })
    expect(g5.hits?.perHitPower).toEqual([15, 10])
  })
})

describe('random-power moves', () => {
  it('Present yields a weighted distribution', () => {
    const r = calc(3, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: move({ move: 'Present', power: null, effect: 'present' }) })
    expect(r.dist).toBeDefined()
    const total = r.dist!.reduce((s, [, p]) => s + p, 0)
    expect(total).toBeCloseTo((102 + 76 + 26) / 256)
  })
  it('Magnitude 4–10', () => {
    const r = calc(3, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: move({ move: 'Magnitude', type: 'Ground', power: null, effect: 'magnitude' }) })
    expect(r.dist!.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1)
  })
})

describe('conditional doublers', () => {
  it('Facade doubles when statused (Gen 4: power; Gen 3: damage)', () => {
    const fc = move({ move: 'Facade', power: 70, effect: 'facade' })
    const plain = calc(4, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: fc }).max
    const psn = calc(4, { attacker: mon({ types: ['Fire', 'Fire'], status: 'poison' }), moveData: fc }).max
    expect(psn).toBeGreaterThan(plain * 1.9)
    expect(psn).toBeLessThan(plain * 2.1)
  })
  it('Payback via the condition pill', () => {
    const pb = move({ move: 'Payback', type: 'Dark', power: 50, effect: 'payback' })
    const off = calc(4, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: pb })
    const on = calc(4, { attacker: mon({ types: ['Fire', 'Fire'] }), moveData: pb, options: { conditionMet: true } })
    expect(on.max).toBeGreaterThan(off.max)
    expect(off.assumptions.some(a => a.key === 'conditionMet')).toBe(true)
  })
})
