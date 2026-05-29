import type { BaseStats as BaseStatsType } from '../types/pokemon'

export const STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',              label: 'HP',  color: '#69dc12' },
  { key: 'attack',          label: 'Atk', color: '#efcc18' },
  { key: 'defense',         label: 'Def', color: '#e86412' },
  { key: 'special_attack',  label: 'SpA', color: '#14c3f1' },
  { key: 'special_defense', label: 'SpD', color: '#4a6adf' },
  { key: 'speed',           label: 'Spe', color: '#d51dad' },
]

export const GEN1_STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',             label: 'HP',  color: '#69dc12' },
  { key: 'attack',         label: 'Atk', color: '#efcc18' },
  { key: 'defense',        label: 'Def', color: '#e86412' },
  { key: 'special_attack', label: 'Spc', color: '#56b2a2' },
  { key: 'speed',          label: 'Spe', color: '#d51dad' },
]

export const MAX_STAT = 255

export const GEN1_GAMES = new Set(['Red and Blue', 'Yellow'])

// Color for the Gen 1 "Weighted Base Stat Total" row (ties to the Special stat).
export const WBST_COLOR = '#56b2a2'

// Color for the Gen 1 "Useful Base Stat Total" row.
export const UBST_COLOR = '#a78bfa'
