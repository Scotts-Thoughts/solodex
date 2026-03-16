import { useMemo, useState } from 'react'
import { getTrainers, isMajorTrainer, isRivalName, isBossTrainer } from '@/data'

interface TrainerSpeedEntry {
  trainerId: string
  trainerName: string
  trainerClass: string
  species: string
  speed: number
}

const E4_CLASSES = new Set(['Elite Four', 'ELITE FOUR', 'LORELEI', 'BRUNO', 'AGATHA', 'LANCE'])
const CHAMPION_CLASSES = new Set(['Champion', 'CHAMPION', 'RIVAL3'])

function entryColor(e: TrainerSpeedEntry, game: string): string {
  const cls = e.trainerClass
  if (CHAMPION_CLASSES.has(cls) || e.trainerName.startsWith('Champion ') || isBossTrainer(e.trainerName)) return '#2DD4BF' // teal
  if (cls === 'Rival' || cls === 'RIVAL' || cls === 'RIVAL1' || cls === 'RIVAL2' ||
      e.trainerName.includes('Rival') || isRivalName(e.trainerName, game)) return '#60A5FA' // blue
  if (E4_CLASSES.has(cls) || e.trainerName.startsWith('Elite Four ')) return '#C084FC' // purple
  if (isMajorTrainer(e.trainerName, cls, game)) return '#FACC15' // gold
  return '' // not important
}

function isMajorBattle(e: TrainerSpeedEntry, game: string): boolean {
  return entryColor(e, game) !== ''
}

export default function TrainerSpeedList({ selectedGame, onSelect }: { selectedGame: string; onSelect: (id: string) => void }) {
  const [majorOnly, setMajorOnly] = useState(false)
  const [r1Only, setR1Only] = useState(false)
  const entries = useMemo(() => {
    const trainers = getTrainers(selectedGame)
    const list: TrainerSpeedEntry[] = []
    for (const t of trainers) {
      for (const p of t.party) {
        list.push({
          trainerId: t.id,
          trainerName: t.name,
          trainerClass: t.trainer_class,
          species: p.species,
          speed: p.stats.speed,
        })
      }
    }
    list.sort((a, b) => b.speed - a.speed)
    return list
  }, [selectedGame])

  const filtered = useMemo(() => {
    let list = entries
    if (majorOnly) list = list.filter(e => isMajorBattle(e, selectedGame))
    if (r1Only) list = list.filter(e => !e.trainerName.includes('Rematch'))
    return list
  }, [entries, majorOnly, r1Only, selectedGame])

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200 text-sm">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="font-semibold text-gray-400 uppercase text-xs tracking-wide">Speed Rankings</span>
        <button
          onClick={() => setMajorOnly(o => !o)}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            majorOnly ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-800 text-gray-500 hover:text-gray-400'
          }`}
        >
          Major Battles
        </button>
        <button
          onClick={() => setR1Only(o => !o)}
          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
            r1Only ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-500 hover:text-gray-400'
          }`}
        >
          R1
        </button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] px-3 py-1.5 border-b border-gray-700 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <span>Trainer</span>
        <span>Pokemon</span>
        <span className="text-right">Spd</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((e, i) => (
          <div
            key={i}
            onClick={() => onSelect(e.trainerId)}
            className="grid grid-cols-[1fr_1fr_auto] px-3 py-1 border-b border-gray-800 hover:bg-gray-800/50 items-center cursor-pointer"
          >
            <span
              className="truncate pr-2"
              title={`${e.trainerClass} ${e.trainerName}`}
              style={{ color: entryColor(e, selectedGame) || '#9CA3AF' }}
            >
              {e.trainerName}
            </span>
            <span className="truncate pr-2">{e.species}</span>
            <span className="text-right font-mono text-gray-300 w-8">{e.speed}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
