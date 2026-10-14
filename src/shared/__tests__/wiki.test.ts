import { describe, it, expect } from 'vitest'
import { tmPageTitle, wikiKey, wikiNameCandidates, wikiTitle } from '../wiki'

describe('wikiKey', () => {
  it('maps every period spelling of a move to one key', () => {
    const keys = ['SolarBeam', 'Solar Beam'].map(wikiKey)
    expect(new Set(keys).size).toBe(1)
    expect(wikiKey('Faint Attack')).toBe(wikiKey('Feint Attack'))
    expect(wikiKey('ViceGrip')).toBe(wikiKey('Vise Grip'))
    expect(wikiKey('Hi Jump Kick')).toBe(wikiKey('High Jump Kick'))
    expect(wikiKey('SelfDestruct')).toBe(wikiKey('Self-Destruct'))
    expect(wikiKey('King’s Shield')).toBe(wikiKey("King's Shield"))
  })

  it('maps ability spellings to one key', () => {
    expect(wikiKey('Compoundeyes')).toBe(wikiKey('Compound Eyes'))
    expect(wikiKey('Minds Eye')).toBe(wikiKey("Mind's Eye"))
    expect(wikiNameCandidates('Beads Of Ruin')).toEqual(['Beads of Ruin'])
  })
})

describe('wikiNameCandidates', () => {
  it('uses the override alone when there is one', () => {
    expect(wikiNameCandidates('Faint Attack')).toEqual(['Feint Attack'])
  })

  it('tries the name, then camelCase split, then dashes as spaces', () => {
    expect(wikiNameCandidates('AncientPower')).toEqual(['AncientPower', 'Ancient Power'])
    expect(wikiNameCandidates('Sand-Attack')).toEqual(['Sand-Attack', 'Sand Attack'])
    expect(wikiNameCandidates('Tackle')).toEqual(['Tackle'])
  })
})

describe('titles', () => {
  it('builds article titles', () => {
    expect(wikiTitle('King’s Shield', 'move')).toBe("King's_Shield_(move)")
    expect(wikiTitle('Intimidate', 'ability')).toBe('Intimidate_(Ability)')
  })

  it('pads TMs to three digits and leaves HMs alone', () => {
    expect(tmPageTitle('TM24')).toBe('TM024')
    expect(tmPageTitle('TM100')).toBe('TM100')
    expect(tmPageTitle('HM04')).toBe('HM04')
    expect(tmPageTitle('TM00')).toBe('TM00')
  })
})
