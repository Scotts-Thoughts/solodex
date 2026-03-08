import { useState, useMemo, useEffect, useRef } from 'react'
import { getTrainerList, getTrainerClasses, getTrainerLocations, displayName } from '../data'
import type { TrainerListEntry } from '../types/pokemon'

interface Props {
  selectedGame: string
  selected: string | null
  onSelect: (id: string) => void
  width: number
}

const IMPORTANT_CLASSES = new Set([
  'Leader', 'Elite Four', 'Champion', 'Rival', 'Gym Leader',
  'RIVAL', 'RIVAL1', 'RIVAL2', 'RIVAL3', 'LEADER', 'ELITE FOUR', 'CHAMPION',
  'LORELEI', 'BRUNO', 'AGATHA', 'LANCE',
])

function isRival(t: TrainerListEntry): boolean {
  return (t.trainer_class === 'Rival' || t.trainer_class === 'RIVAL' ||
    t.trainer_class === 'RIVAL1' || t.trainer_class === 'RIVAL2' ||
    t.name.includes('Rival')) && t.trainer_class !== 'RIVAL3'
}

function isChampionRival(t: TrainerListEntry): boolean {
  return t.trainer_class === 'RIVAL3'
}

function isImportantTrainer(t: TrainerListEntry): boolean {
  return IMPORTANT_CLASSES.has(t.trainer_class) ||
    t.name.startsWith('Leader ') ||
    t.name.startsWith('Elite Four ') ||
    t.name.startsWith('Champion ') ||
    isRival(t) || isChampionRival(t)
}

function trainerNameColor(t: TrainerListEntry): string {
  if (isChampionRival(t)) return '#FACC15'  // gold — champion
  if (isRival(t)) return '#60A5FA'  // blue
  if (isImportantTrainer(t)) return '#FACC15'  // gold
  return '#E5E7EB'  // gray-200
}

export default function TrainerList({ selectedGame, selected, onSelect, width }: Props) {
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'level' | 'class'>('name')
  const selectedRef = useRef<HTMLButtonElement>(null)

  const allTrainers = useMemo(() => getTrainerList(selectedGame), [selectedGame])
  const classes = useMemo(() => getTrainerClasses(selectedGame), [selectedGame])
  const locations = useMemo(() => getTrainerLocations(selectedGame), [selectedGame])

  const filtered = useMemo(() => {
    let list = allTrainers
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.trainer_class.toLowerCase().includes(q) ||
        (t.location && t.location.toLowerCase().includes(q))
      )
    }
    if (classFilter) {
      list = list.filter(t => t.trainer_class === classFilter)
    }
    if (locationFilter) {
      list = list.filter(t => t.location === locationFilter)
    }

    if (sortBy === 'level') {
      list = [...list].sort((a, b) => a.maxLevel - b.maxLevel)
    } else if (sortBy === 'class') {
      list = [...list].sort((a, b) => a.trainer_class.localeCompare(b.trainer_class) || a.name.localeCompare(b.name))
    } else {
      // Default: leaders/E4/champs/RIVAL3 first, then rivals, then the rest
      list = [...list].sort((a, b) => {
        const tier = (t: TrainerListEntry) =>
          isChampionRival(t) ? 0 : isRival(t) ? 1 : isImportantTrainer(t) ? 0 : 2
        const at = tier(a), bt = tier(b)
        if (at !== bt) return at - bt
        return a.name.localeCompare(b.name)
      })
    }
    return list
  }, [allTrainers, search, classFilter, locationFilter, sortBy])

  // Reset filters when game changes
  useEffect(() => {
    setSearch('')
    setClassFilter('')
    setLocationFilter('')
  }, [selectedGame])

  // Scroll selected into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }, [selected])

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Search */}
      <div className="p-2 space-y-1.5 border-b border-gray-700 shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search trainers..."
          className="w-full bg-gray-800 text-sm text-white rounded px-2.5 py-1.5 outline-none border border-gray-700 focus:border-blue-500 transition-colors"
        />
        <div className="flex gap-1">
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="flex-1 bg-gray-800 text-xs text-gray-300 rounded px-1.5 py-1 outline-none border border-gray-700 cursor-pointer"
          >
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            className="flex-1 bg-gray-800 text-xs text-gray-300 rounded px-1.5 py-1 outline-none border border-gray-700 cursor-pointer"
            style={{ maxWidth: width * 0.5 }}
          >
            <option value="">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex gap-1">
          {(['name', 'level', 'class'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`flex-1 text-xs py-0.5 rounded transition-colors ${
                sortBy === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {s === 'name' ? 'Name' : s === 'level' ? 'Level' : 'Class'}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="px-2.5 py-1 text-xs text-gray-500 border-b border-gray-800 shrink-0">
        {filtered.length} trainer{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map(t => {
          const isSel = t.id === selected
          return (
            <button
              key={t.id}
              ref={isSel ? selectedRef : undefined}
              onClick={() => onSelect(t.id)}
              className={`w-full text-left px-2.5 py-1.5 border-b border-gray-800 transition-colors ${
                isSel
                  ? 'bg-blue-900/40 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-800/60 border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: trainerNameColor(t) }}
                >
                  {t.name}
                </span>
                <span className="text-xs text-gray-500 tabular-nums shrink-0 ml-2">
                  Lv{t.maxLevel}
                </span>
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {t.party.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-gray-700"> / </span>}
                    <span className="text-gray-400">{displayName(p.species)}</span>
                    <span className="text-gray-600 ml-0.5">{p.level}</span>
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
