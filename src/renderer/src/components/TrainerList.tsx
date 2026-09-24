import { useState, useMemo, useEffect, useCallback } from 'react'
import { getTrainerList, getTrainerClasses, getTrainerLocations, displayName, getGroupedTrainerIds, isMajorTrainer } from '../data'
import type { TrainerListEntry } from '../types/pokemon'
import { trainerNameColor } from '../utils/trainerColor'
import VirtualList from './VirtualList'

interface Props {
  selectedGame: string
  selected: string | null
  onSelect: (id: string) => void
  width: number
}

// py-1.5 + name line (text-sm) + mt-0.5 + party line (text-xs) + 1px border;
// rows are windowed so each must be exactly this tall
const ROW_HEIGHT = 51

export default function TrainerList({ selectedGame, selected, onSelect, width }: Props) {
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')

  const grouped = useMemo(() => getGroupedTrainerIds(selectedGame), [selectedGame])

  const allTrainers = useMemo(() => {
    const list = getTrainerList(selectedGame)
    if (grouped.size === 0) return list
    const seen = new Set<string>()
    return list.filter(t => {
      const group = grouped.get(t.id)
      if (!group) return true
      // Show only the first trainer in the group, with the group's display name
      const primaryId = group.trainerIds[0]
      if (seen.has(primaryId)) return false
      seen.add(primaryId)
      if (t.id === primaryId) {
        t.name = group.name
      }
      return t.id === primaryId
    })
  }, [selectedGame, grouped])
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

    // Major battles first, then non-major; both sorted by ace (max) level ascending
    list = [...list].sort((a, b) => {
      const aMajor = isMajorTrainer(a.name, a.trainer_class, selectedGame) ? 0 : 1
      const bMajor = isMajorTrainer(b.name, b.trainer_class, selectedGame) ? 0 : 1
      if (aMajor !== bMajor) return aMajor - bMajor
      return a.maxLevel - b.maxLevel
    })
    return list
  }, [allTrainers, search, classFilter, locationFilter, selectedGame])

  // Reset filters when game changes
  useEffect(() => {
    setSearch('')
    setClassFilter('')
    setLocationFilter('')
  }, [selectedGame])

  const isSelectedRow = useCallback((t: TrainerListEntry) => {
    const group = grouped.get(t.id)
    return t.id === selected || (!!group && !!selected && group.trainerIds.includes(selected))
  }, [grouped, selected])

  // Keep the selected trainer in view
  const selectedIndex = useMemo(() => filtered.findIndex(isSelectedRow), [filtered, isSelectedRow])

  const renderRow = useCallback((t: TrainerListEntry) => {
    const isSel = isSelectedRow(t)
    return (
      <button
        key={t.id}
        onClick={() => onSelect(t.id)}
        style={{ height: ROW_HEIGHT }}
        className={`w-full text-left px-2.5 py-1.5 border-b border-gray-800 overflow-hidden transition-colors ${
          isSel
            ? 'bg-blue-900/40 border-l-2 border-l-blue-500'
            : 'hover:bg-gray-800/60 border-l-2 border-l-transparent'
        }`}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-medium truncate"
            style={{ color: trainerNameColor(t.name, t.trainer_class, selectedGame) }}
          >
            {t.name} <span className="text-gray-600">({t.rom_id})</span>
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
  }, [isSelectedRow, onSelect, selectedGame])

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
      </div>

      {/* Count */}
      <div className="px-2.5 py-1 text-xs text-gray-500 border-b border-gray-800 shrink-0">
        {filtered.length} trainer{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* List (windowed) */}
      <VirtualList
        items={filtered}
        rowHeight={ROW_HEIGHT}
        renderRow={renderRow}
        scrollToIndex={selectedIndex}
        className="flex-1 overflow-y-auto"
      />
    </div>
  )
}
