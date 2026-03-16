import type { BaseStats as BaseStatsType } from '../types/pokemon'

export const STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',              label: 'HP',  color: '#78C850' },
  { key: 'attack',          label: 'Atk', color: '#F8D030' },
  { key: 'defense',         label: 'Def', color: '#F08030' },
  { key: 'special_attack',  label: 'SpA', color: '#6890F0' },
  { key: 'special_defense', label: 'SpD', color: '#7038F8' },
  { key: 'speed',           label: 'Spe', color: '#F85888' },
]

export const GEN1_STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',             label: 'HP',  color: '#78C850' },
  { key: 'attack',         label: 'Atk', color: '#F8D030' },
  { key: 'defense',        label: 'Def', color: '#F08030' },
  { key: 'special_attack', label: 'Spc', color: '#6890F0' },
  { key: 'speed',          label: 'Spe', color: '#F85888' },
]

export const MAX_STAT = 255

export const GEN1_GAMES = new Set(['Red and Blue', 'Yellow'])
