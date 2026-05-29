import { isMajorTrainer, isRivalName, isBossTrainer } from '../data'

// Trainer name colors, shared by the Trainers tab list and the Stats/Scouting
// list so a given trainer reads the same color everywhere.
const E4_CLASSES = new Set(['Elite Four', 'ELITE FOUR', 'LORELEI', 'BRUNO', 'AGATHA', 'LANCE'])
const CHAMPION_CLASSES = new Set(['Champion', 'CHAMPION', 'RIVAL3'])

function isRival(name: string, trainerClass: string, game: string): boolean {
  if (trainerClass === 'RIVAL3') return false
  if (trainerClass === 'Rival' || trainerClass === 'RIVAL' ||
      trainerClass === 'RIVAL1' || trainerClass === 'RIVAL2') return true
  if (name.includes('Rival')) return true
  if (isRivalName(name, game)) return true
  return false
}

function isEliteFour(name: string, trainerClass: string): boolean {
  return E4_CLASSES.has(trainerClass) || name.startsWith('Elite Four ')
}

function isChampion(name: string, trainerClass: string): boolean {
  return CHAMPION_CLASSES.has(trainerClass) || name.startsWith('Champion ')
}

export function trainerNameColor(name: string, trainerClass: string, game: string): string {
  if (isChampion(name, trainerClass) || isBossTrainer(name)) return '#2DD4BF'  // teal
  if (isRival(name, trainerClass, game)) return '#60A5FA'  // blue
  if (isEliteFour(name, trainerClass)) return '#C084FC'  // purple
  if (isMajorTrainer(name, trainerClass, game)) return '#FACC15'  // gold
  return '#E5E7EB'  // gray-200
}
