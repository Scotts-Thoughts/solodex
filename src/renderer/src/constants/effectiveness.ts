export const EFF_GROUPS = [
  { label: 'Weak',    value: 4,    multiplierLabel: '\u00d74', bg: '#7f1d1d', text: '#fca5a5' },
  { label: 'Weak',    value: 2,    multiplierLabel: '\u00d72', bg: '#451a03', text: '#fdba74' },
  { label: 'Resists', value: 0.5,  multiplierLabel: '\u00bd\u00d7', bg: '#14532d', text: '#86efac' },
  { label: 'Resists', value: 0.25, multiplierLabel: '\u00bc\u00d7', bg: '#1e3a5f', text: '#93c5fd' },
  { label: 'Immune',  value: 0,    multiplierLabel: '0\u00d7', bg: '#1f2937', text: '#9ca3af' },
] as const

import { GAME_TO_GEN } from '../data'

// Abilities that make a Pokémon immune to every damaging move of one type, and
// the first generation in which they do. Matches the damage calculator
// (utils/damage/gen3.ts, gen4.ts, gen5.ts):
// - Water Absorb, Volt Absorb and Flash Fire block their type from gen 3
//   (pokeemerald AbilityBattleEffects, ABILITYEFFECT_ABSORBING).
// - Lightning Rod (gen 3) and Storm Drain (gen 4) only redirected moves in
//   double battles until gen 5, when they also became immunities.
// - Wind Rider is left out: it blocks wind moves, not the whole Flying type.
const ABILITY_IMMUNITY_TABLE: Record<string, { type: string; minGen: number }> = {
  'Levitate':        { type: 'Ground',   minGen: 3 },
  'Flash Fire':      { type: 'Fire',     minGen: 3 },
  'Water Absorb':    { type: 'Water',    minGen: 3 },
  'Volt Absorb':     { type: 'Electric', minGen: 3 },
  'Dry Skin':        { type: 'Water',    minGen: 4 },
  'Motor Drive':     { type: 'Electric', minGen: 4 },
  'Storm Drain':     { type: 'Water',    minGen: 5 },
  'Lightning Rod':   { type: 'Electric', minGen: 5 },
  'Sap Sipper':      { type: 'Grass',    minGen: 5 },
  'Earth Eater':     { type: 'Ground',   minGen: 9 },
  'Well-Baked Body': { type: 'Fire',     minGen: 9 },
}

// Older games' data spells some abilities differently.
const ABILITY_SPELLINGS: Record<string, string> = {
  'Lightningrod': 'Lightning Rod',
}

export const ABILITY_IMMUNITIES: Record<string, string> = Object.fromEntries(
  Object.entries(ABILITY_IMMUNITY_TABLE).map(([name, { type }]) => [name, type]),
)

export function getAbilityImmunityType(ability: string, game: string): string | null {
  const entry = ABILITY_IMMUNITY_TABLE[ABILITY_SPELLINGS[ability] ?? ability]
  if (!entry) return null
  const gen = parseInt(GAME_TO_GEN[game] ?? '0', 10)
  if (gen < entry.minGen) return null
  return entry.type
}
