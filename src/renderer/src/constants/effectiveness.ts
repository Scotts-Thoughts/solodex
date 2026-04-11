export const EFF_GROUPS = [
  { label: 'Weak',    value: 4,    multiplierLabel: '\u00d74', bg: '#7f1d1d', text: '#fca5a5' },
  { label: 'Weak',    value: 2,    multiplierLabel: '\u00d72', bg: '#451a03', text: '#fdba74' },
  { label: 'Resists', value: 0.5,  multiplierLabel: '\u00bd\u00d7', bg: '#14532d', text: '#86efac' },
  { label: 'Resists', value: 0.25, multiplierLabel: '\u00bc\u00d7', bg: '#1e3a5f', text: '#93c5fd' },
  { label: 'Immune',  value: 0,    multiplierLabel: '0\u00d7', bg: '#1f2937', text: '#9ca3af' },
] as const

import { GAME_TO_GEN } from '../data'

export const ABILITY_IMMUNITIES: Record<string, string> = {
  'Levitate':        'Ground',
  'Flash Fire':      'Fire',
  'Water Absorb':    'Water',
  'Dry Skin':        'Water',
  'Storm Drain':     'Water',
  'Volt Absorb':     'Electric',
  'Motor Drive':     'Electric',
  'Lightning Rod':   'Electric',
  'Sap Sipper':      'Grass',
  'Earth Eater':     'Ground',
  'Well-Baked Body': 'Fire',
  'Wind Rider':      'Flying',
}

// Abilities whose immunity only started applying at a given generation.
// Water Absorb existed in gens 3-4 but did not grant immunity until gen 5.
const ABILITY_IMMUNITY_MIN_GEN: Record<string, number> = {
  'Water Absorb': 5,
}

export function getAbilityImmunityType(ability: string, game: string): string | null {
  const immuneType = ABILITY_IMMUNITIES[ability]
  if (!immuneType) return null
  const minGen = ABILITY_IMMUNITY_MIN_GEN[ability]
  if (minGen !== undefined) {
    const gen = parseInt(GAME_TO_GEN[game] ?? '0', 10)
    if (gen < minGen) return null
  }
  return immuneType
}
