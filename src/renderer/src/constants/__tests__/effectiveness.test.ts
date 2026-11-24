import { describe, expect, it } from 'vitest'
import { getAbilityImmunityType } from '../effectiveness'

// One game per generation.
const GEN3 = 'Emerald'
const GEN4 = 'Platinum'
const GEN5 = 'Black'

describe('getAbilityImmunityType', () => {
  it('gives Water Absorb, Volt Absorb and Flash Fire their immunity from gen 3', () => {
    for (const game of [GEN3, GEN4, GEN5]) {
      expect(getAbilityImmunityType('Water Absorb', game)).toBe('Water')
      expect(getAbilityImmunityType('Volt Absorb', game)).toBe('Electric')
      expect(getAbilityImmunityType('Flash Fire', game)).toBe('Fire')
      expect(getAbilityImmunityType('Levitate', game)).toBe('Ground')
    }
  })

  it('gives Dry Skin and Motor Drive their immunity from gen 4', () => {
    expect(getAbilityImmunityType('Dry Skin', GEN4)).toBe('Water')
    expect(getAbilityImmunityType('Motor Drive', GEN4)).toBe('Electric')
  })

  it('treats Lightning Rod and Storm Drain as immunities only from gen 5', () => {
    expect(getAbilityImmunityType('Lightningrod', GEN3)).toBeNull()
    expect(getAbilityImmunityType('Lightning Rod', GEN4)).toBeNull()
    expect(getAbilityImmunityType('Storm Drain', GEN4)).toBeNull()
    expect(getAbilityImmunityType('Lightning Rod', GEN5)).toBe('Electric')
    expect(getAbilityImmunityType('Lightningrod', GEN5)).toBe('Electric')
    expect(getAbilityImmunityType('Storm Drain', GEN5)).toBe('Water')
    expect(getAbilityImmunityType('Sap Sipper', GEN5)).toBe('Grass')
  })

  it('does not treat Wind Rider as a Flying immunity', () => {
    expect(getAbilityImmunityType('Wind Rider', 'Scarlet and Violet')).toBeNull()
  })
})
