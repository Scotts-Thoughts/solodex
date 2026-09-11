import { describe, expect, it } from 'vitest'
import { classifyForm, isMegaForm } from '../forms'

describe('classifyForm', () => {
  it('leaves plain species alone', () => {
    const f = classifyForm('Pikachu')
    expect(f.isBase).toBe(true)
    expect(f.base).toBe('Pikachu')
    expect(f.introducedGen).toBe(1)
  })

  it('recognises mega and primal prefixes and the (Mega Z) suffix', () => {
    expect(classifyForm('Mega Venusaur')).toMatchObject({ isMega: true, base: 'Venusaur', introducedGen: 6 })
    expect(classifyForm('Mega Charizard X')).toMatchObject({ isMega: true, base: 'Charizard' })
    expect(classifyForm('Primal Kyogre')).toMatchObject({ isMega: true, base: 'Kyogre' })
    expect(classifyForm('Absol (Mega Z)')).toMatchObject({ isMega: true, isVariant: false, base: 'Absol' })
    expect(isMegaForm('Mega Absol Z')).toBe(true)
  })

  it('recognises regional prefixes, alone or with a suffix', () => {
    expect(classifyForm('Alolan Raichu')).toMatchObject({ isRegional: true, region: 'Alolan', base: 'Raichu', introducedGen: 7 })
    expect(classifyForm('Galarian Darmanitan (Zen)')).toMatchObject({
      isRegional: true, region: 'Galarian', isVariant: true, variant: 'Zen', base: 'Darmanitan', introducedGen: 8,
    })
    expect(classifyForm('Paldean Tauros (Combat Breed)')).toMatchObject({ isRegional: true, isVariant: true, base: 'Tauros', introducedGen: 9 })
  })

  it('separates gigantamax from other variants', () => {
    expect(classifyForm('Venusaur (Gmax)')).toMatchObject({ isGmax: true, isVariant: false, introducedGen: 8 })
    expect(classifyForm('Toxtricity (Low Key Gmax)')).toMatchObject({ isGmax: true, base: 'Toxtricity' })
    expect(classifyForm('Pumpkaboo (Small)')).toMatchObject({ isGmax: false, isVariant: true, variant: 'Small', base: 'Pumpkaboo' })
    expect(classifyForm('Giratina (Origin)')).toMatchObject({ isVariant: true, isBase: false })
  })
})
