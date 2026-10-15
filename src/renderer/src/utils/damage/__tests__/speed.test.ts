/**
 * In-battle Speed per generation (speed.ts header has the decomp citations)
 * and the faster / tie / slower comparison.
 */
import { describe, it, expect } from 'vitest'
import { mon } from './helpers'
import { battleSpeed, compareSpeed } from '../speed'
import { DEFAULT_FIELD, type BattlerState, type Field, type Gen } from '../types'

const GAME: Record<Gen, string> = { 1: 'Red and Blue', 2: 'Crystal', 3: 'Emerald', 4: 'Platinum', 5: 'Black' }
const field = (gen: Gen, over: Partial<Field> = {}): Field => ({ ...DEFAULT_FIELD, game: GAME[gen], gen, ...over })
const spe = (gen: Gen, b: BattlerState, f: Partial<Field> = {}, other: BattlerState = mon()) => battleSpeed(b, other, field(gen, f))

describe('Gen 1–2', () => {
  it('stage uses the decimal table, then paralysis >> 2', () => {
    expect(spe(1, mon({ spe: 100, stages: { speed: -1 } }))).toBe(66)
    expect(spe(1, mon({ spe: 100, status: 'paralysis' }))).toBe(25)
    expect(spe(2, mon({ spe: 3, status: 'paralysis' }))).toBe(1)
  })
  it('Soul Badge boosts the player only (stat + stat>>3)', () => {
    const badges = new Set(['soul'])
    expect(spe(1, mon({ spe: 100, badges, isPlayer: true }))).toBe(112)
    expect(spe(1, mon({ spe: 100, badges, isPlayer: false }))).toBe(100)
  })
})

describe('Gen 3', () => {
  it('Swift Swim ×2 before the stage, badge ×110/100, paralysis ÷4', () => {
    expect(spe(3, mon({ spe: 101, ability: 'swiftswim', stages: { speed: 1 } }), { weather: 'rain' })).toBe(303)
    expect(spe(3, mon({ spe: 101, ability: 'swiftswim' }), { weather: 'rain' }, mon({ ability: 'cloudnine' }))).toBe(101)
    expect(spe(3, mon({ spe: 101, status: 'paralysis' }))).toBe(25)
    expect(spe(3, mon({ spe: 101, item: 'machobrace' }))).toBe(50)
  })
})

describe('Gen 4', () => {
  it('Choice Scarf ×15/10, Quick Powder Ditto ×2, Simple doubles the stage', () => {
    expect(spe(4, mon({ spe: 101, item: 'choicescarf' }))).toBe(151)
    expect(spe(4, mon({ spe: 100, item: 'quickpowder', species: 'Ditto' }))).toBe(200)
    expect(spe(4, mon({ spe: 100, ability: 'simple', stages: { speed: 2 } }))).toBe(300)
  })
  it('Iron Ball halves even under Klutz; Scarf does not apply under Klutz', () => {
    expect(spe(4, mon({ spe: 101, item: 'ironball', ability: 'klutz' }))).toBe(50)
    expect(spe(4, mon({ spe: 101, item: 'choicescarf', ability: 'klutz' }))).toBe(101)
  })
  it('Quick Feet replaces the paralysis drop; Tailwind and Unburden double', () => {
    expect(spe(4, mon({ spe: 100, ability: 'quickfeet', status: 'paralysis' }))).toBe(150)
    expect(spe(4, mon({ spe: 100, flags: { tailwind: true } }))).toBe(200)
    expect(spe(4, mon({ spe: 100, ability: 'unburden', flags: { unburdened: true } }))).toBe(200)
  })
})

describe('Gen 5', () => {
  it('4096-scale chain rounds half down, then paralysis ×25/100', () => {
    expect(spe(5, mon({ spe: 101, item: 'choicescarf' }))).toBe(151)   // 151.5 → 151
    expect(spe(5, mon({ spe: 101, item: 'choicescarf', status: 'paralysis' }))).toBe(37)
    expect(spe(5, mon({ spe: 100, ability: 'sandrush' }), { weather: 'sand' })).toBe(200)
    expect(spe(5, mon({ spe: 101, item: 'ironball', ability: 'klutz' }))).toBe(101)
  })
})

describe('compareSpeed', () => {
  it('classifies from the player side', () => {
    const f = field(4)
    expect(compareSpeed(mon({ spe: 90 }), mon({ spe: 80, isPlayer: false }), f).order).toBe('faster')
    expect(compareSpeed(mon({ spe: 80 }), mon({ spe: 80, isPlayer: false }), f).order).toBe('tie')
    expect(compareSpeed(mon({ spe: 80, status: 'paralysis' }), mon({ spe: 30, isPlayer: false }), f)).toEqual({ player: 20, enemy: 30, order: 'slower' })
  })
})
