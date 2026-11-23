import { beforeAll, describe, expect, it } from 'vitest'
import { loadGame } from '../../data'
import { predictPartyOrder } from '../teamOrderCalculator'
import type { TrainerPokemon } from '../../types/pokemon'

const mon = (species: string, moves: string[]): TrainerPokemon => ({
  species, level: 20, experience_yield: 0, nature: null, ability: null, held_item: null,
  stats: { hp: 1, attack: 1, defense: 1, speed: 1, special_attack: 1, special_defense: 1 },
  moves,
})

describe('predictPartyOrder', () => {
  beforeAll(async () => {
    await loadGame('Crystal')
    await loadGame('Red and Blue')
  })

  // Gen 2: after the lead, the first slot with a super-effective move (and not
  // weak to the player) comes next, ahead of earlier neutral slots.
  const party = [mon('Pidgey', ['Tackle']), mon('Rattata', ['Tackle']), mon('Geodude', ['Rock Throw'])]

  it('orders the party by the predicted send-out against the player typing', () => {
    expect(predictPartyOrder(party, 'Crystal', 'Fire', 'Flying')).toEqual({ order: [0, 2, 1], predicted: 3 })
  })

  it('treats a mono-typed player (type_2 === type_1) as single-typed', () => {
    expect(predictPartyOrder(party, 'Crystal', 'Fire', 'Fire')).toEqual(predictPartyOrder(party, 'Crystal', 'Fire', null))
  })

  it('returns null for a generation without a simulation', () => {
    expect(predictPartyOrder(party, 'Red and Blue', 'Fire', 'Flying')).toBeNull()
  })
})
