/**
 * KO odds: miss chance, damage rolls, crits and hit counts folded into one
 * per-use distribution. Vectors are worked by hand in the comments.
 */
import { describe, it, expect } from 'vitest'
import type { DamageResult } from '../types'
import { koChances, koBreakdown, koSummary, useDistribution, fmtChance } from '../ko'
import { calc, mon, move } from './helpers'

const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)

function result(over: Partial<DamageResult> & { rolls: number[] }): DamageResult {
  const rolls = over.rolls
  return {
    kind: 'range', move: 'Test', moveType: 'Normal', category: 'physical', power: 90, effectiveness: 1, stab: false,
    min: rolls[0], max: rolls[rolls.length - 1], minPercent: 0, maxPercent: 0,
    critChance: 0, hitChance: 1, hitNotes: [], notes: [], assumptions: [],
    ...over,
  }
}

const mass = (d: Array<[number, number]>, hp: number) => d.reduce((s, [v, p]) => (v >= hp ? s + p : s), 0)

describe('single hit', () => {
  // 16 rolls 90..105 against 100 HP: 6 of 16 KO.
  const r = result({ rolls: range(90, 105), hitChance: 0.85 })
  it('OHKO = hit chance × fraction of rolls that KO', () => {
    expect(koChances(r, 100)[0].chance).toBeCloseTo(0.85 * 6 / 16, 12)
  })
  it('later uses add the earlier damage: any hit after a 90+ hit finishes', () => {
    // no KO within 2: miss·miss + miss·nonKO + nonKO·miss
    const nonKo = 0.85 * 10 / 16
    expect(koChances(r, 100)[1].chance).toBeCloseTo(1 - 0.15 * 0.15 - 2 * 0.15 * nonKo, 12)
  })
  it('crit rolls are mixed in by the crit chance', () => {
    const c = result({ rolls: range(90, 105), hitChance: 0.85, critChance: 1 / 16, crit: { rolls: range(180, 195), min: 180, max: 195 } })
    expect(koChances(c, 100)[0].chance).toBeCloseTo(0.85 * (15 / 16 * 6 / 16 + 1 / 16), 12)
    const b = koBreakdown(c, 100)
    expect(b.noCrit).toBeCloseTo(6 / 16, 12)
    expect(b.onCrit).toBe(1)
    expect(b.onHit).toBeCloseTo(15 / 16 * 6 / 16 + 1 / 16, 12)
  })
  it('a certain KO is exactly 1 and stops the list', () => {
    const sure = result({ rolls: range(100, 115) })
    expect(koChances(sure, 100)).toEqual([{ uses: 1, chance: 1 }])
    expect(fmtChance(koChances(sure, 100)[0].chance)).toBe('100%')
  })
  it('a move that cannot hit has no KO odds', () => {
    expect(koChances(result({ rolls: range(100, 115), hitChance: 0 }), 100)).toEqual([])
  })
})

describe('OHKO moves', () => {
  it('1 − (1 − p)^n', () => {
    const r = result({ kind: 'ohko', rolls: [100], hitChance: 0.3 })
    const c = koChances(r, 100)
    expect(c[0].chance).toBeCloseTo(0.3, 12)
    expect(c[1].chance).toBeCloseTo(0.51, 12)
    expect(c[2].chance).toBeCloseTo(0.657, 12)
  })
})

describe('multi-hit', () => {
  it('independent hits convolve; a fixed two-hit at 50+ always reaches 100', () => {
    const r = result({ rolls: range(50, 65), hitChance: 0.9, hits: { distribution: [[2, 1]], min: 2, max: 2 } })
    expect(koChances(r, 100)[0].chance).toBeCloseTo(0.9, 12)
  })
  it('2–5 hits: only the five-hit outcome can reach the target', () => {
    const r = result({ rolls: range(20, 24), hits: { distribution: [[2, 3 / 8], [3, 3 / 8], [4, 1 / 8], [5, 1 / 8]], min: 2, max: 5 } })
    expect(koChances(r, 100)[0].chance).toBeCloseTo(1 / 8, 12)   // 5 × 20 = 100
    expect(koChances(r, 121)[0].chance).toBe(0)                  // 5 × 24 = 120
  })
  it('Gen 1 reuses one roll for every hit', () => {
    // 3 × v ≥ 100 ⇔ v ≥ 34: 12 of the 16 rolls 30..45.
    const same = result({ rolls: range(30, 45), hits: { distribution: [[3, 1]], min: 3, max: 3, sameRoll: true } })
    expect(koChances(same, 100)[0].chance).toBeCloseTo(12 / 16, 12)
    const indep = result({ rolls: range(30, 45), hits: { distribution: [[3, 1]], min: 3, max: 3 } })
    expect(koChances(indep, 100)[0].chance).not.toBeCloseTo(12 / 16, 3)
  })
  it('per-hit accuracy: the first miss ends the move', () => {
    // 0.9 per kick. Two kicks (p = 0.9²·0.1) reach 100 on 66 of 256 pairs of 40..55; three kicks (0.9³) always do.
    const r = result({ rolls: range(40, 55), hitChance: 0.9, hits: { distribution: [[3, 1]], min: 3, max: 3, perHitAccuracy: true } })
    expect(koChances(r, 100)[0].chance).toBeCloseTo(0.81 * 0.1 * 66 / 256 + 0.729, 12)
    const d = useDistribution(r)
    expect(mass(d, 1)).toBeCloseTo(0.9, 12)          // anything lands
    expect(d.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1, 12)
  })
})

describe('non-uniform outcomes', () => {
  it("Present's heal outcome counts as 0 damage: full mass, odds never fall with more uses", () => {
    const present = move({ move: 'Present', power: null, accuracy: 90, effect: 'present' })
    const r = calc(3, { moveData: present, attacker: mon({ types: ['Fire', 'Fire'], atk: 300 }), defender: mon({ hp: 60, def: 40 }) })
    const d = useDistribution(r, 60)
    expect(d.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1, 12)
    // 90% to hit × 204/256 to deal damage at all.
    expect(mass(d, 1)).toBeCloseTo(0.9 * 204 / 256, 12)
    const ko = koChances(r, 60)
    for (let i = 1; i < ko.length; i++) expect(ko[i].chance).toBeGreaterThanOrEqual(ko[i - 1].chance)
  })
})

describe('through calcDamage', () => {
  it('Gen 3 Fire Blast: 85% × (crit-weighted KO fraction of the pipeline rolls)', () => {
    const fb = move({ move: 'Fire Blast', type: 'Fire', category: 'Special', power: 120, accuracy: 85, effect: 'may_burn' })
    const r = calc(3, { moveData: fb, attacker: mon({ types: ['Fire', 'Fire'], spa: 200 }), defender: mon({ hp: 150, spd: 60 }) })
    expect(r.hitChance).toBeCloseTo(0.85, 12)
    const frac = (rolls: number[]) => rolls.filter(v => v >= 150).length / rolls.length
    const expected = 0.85 * ((1 - r.critChance) * frac(r.rolls) + r.critChance * frac(r.crit!.rolls))
    expect(koChances(r, 150)[0].chance).toBeCloseTo(expected, 12)
    expect(expected).toBeGreaterThan(0)
  })
})

describe('display helpers', () => {
  it('koSummary starts at the first real chance and stops once practically certain', () => {
    const all = [{ uses: 1, chance: 0 }, { uses: 2, chance: 0.004 }, { uses: 3, chance: 0.4 }, { uses: 4, chance: 0.9 }, { uses: 5, chance: 0.996 }, { uses: 6, chance: 1 }]
    expect(koSummary(all).map(c => c.uses)).toEqual([3, 4, 5])
    expect(koSummary(all, 2).map(c => c.uses)).toEqual([3, 4])
    // A crit-only OHKO chance is worth a mention even when tiny.
    expect(koSummary([{ uses: 1, chance: 0.004 }, { uses: 2, chance: 1 }]).map(c => c.uses)).toEqual([1, 2])
  })
  it('fmtChance: two decimals, trimmed, honest at the ends', () => {
    expect(fmtChance(0.7456)).toBe('74.56%')
    expect(fmtChance(0.5)).toBe('50%')
    expect(fmtChance(0.981)).toBe('98.1%')
    expect(fmtChance(0.99999)).toBe('>99.99%')
    expect(fmtChance(0.00001)).toBe('<0.01%')
    expect(fmtChance(1)).toBe('100%')
    expect(fmtChance(0)).toBe('0%')
  })
})
