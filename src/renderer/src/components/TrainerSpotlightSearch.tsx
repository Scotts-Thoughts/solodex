import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getTrainerList, GAMES_WITH_TRAINERS, getGroupedTrainerIds, isMajorTrainer, isBossTrainer } from '../data'
import type { TrainerListEntry } from '../types/pokemon'

interface TrainerResult {
  name: string
  game: string
  id: string
  trainer_class: string
  maxLevel: number
  partySize: number
}

interface Props {
  currentGame: string
  onSelect: (trainerId: string, game: string) => void
  onClose: () => void
}

export default function TrainerSpotlightSearch({ currentGame, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build a deduplicated list of all trainers across all games (grouped)
  const allTrainers = useMemo(() => {
    const results: TrainerResult[] = []
    for (const game of GAMES_WITH_TRAINERS) {
      const list = getTrainerList(game)
      const grouped = getGroupedTrainerIds(game)
      const seen = new Set<string>()
      for (const t of list) {
        const group = grouped.get(t.id)
        if (group) {
          const primaryId = group.trainerIds[0]
          if (seen.has(primaryId)) continue
          seen.add(primaryId)
          results.push({
            name: group.name,
            game,
            id: primaryId,
            trainer_class: t.trainer_class,
            maxLevel: t.maxLevel,
            partySize: t.party.length,
          })
        } else {
          results.push({
            name: t.name,
            game,
            id: t.id,
            trainer_class: t.trainer_class,
            maxLevel: t.maxLevel,
            partySize: t.party.length,
          })
        }
      }
    }
    return results
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // No query: show major trainers from current game (or latest game with trainers)
      const game = GAMES_WITH_TRAINERS.includes(currentGame)
        ? currentGame
        : GAMES_WITH_TRAINERS[GAMES_WITH_TRAINERS.length - 1]
      return allTrainers
        .filter(t => t.game === game && isMajorTrainer(t.name, t.trainer_class, game))
        .sort((a, b) => a.maxLevel - b.maxLevel)
    }

    const matches = allTrainers.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.trainer_class.toLowerCase().includes(q)
    )

    // Deduplicate: prefer current game, then latest game
    const byName = new Map<string, TrainerResult[]>()
    for (const m of matches) {
      const key = m.name.toLowerCase()
      if (!byName.has(key)) byName.set(key, [])
      byName.get(key)!.push(m)
    }

    const deduped: TrainerResult[] = []
    for (const [, entries] of byName) {
      // Pick the entry from the current game if available, otherwise the latest game
      const inCurrent = entries.find(e => e.game === currentGame)
      if (inCurrent) {
        deduped.push(inCurrent)
      } else {
        // Latest game = last in GAMES_WITH_TRAINERS order
        const sorted = entries.sort((a, b) =>
          GAMES_WITH_TRAINERS.indexOf(b.game) - GAMES_WITH_TRAINERS.indexOf(a.game)
        )
        deduped.push(sorted[0])
      }
    }

    // Sort: major trainers first, then by name
    return deduped.sort((a, b) => {
      const aMajor = isMajorTrainer(a.name, a.trainer_class, a.game) || isBossTrainer(a.name) ? 0 : 1
      const bMajor = isMajorTrainer(b.name, b.trainer_class, b.game) || isBossTrainer(b.name) ? 0 : 1
      if (aMajor !== bMajor) return aMajor - bMajor
      return a.name.localeCompare(b.name)
    })
  }, [query, allTrainers, currentGame])

  useEffect(() => { setHighlightIdx(0) }, [filtered])
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        if (filtered.length > 0) {
          const t = filtered[highlightIdx]
          onSelect(t.id, t.game)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [filtered, highlightIdx, onClose, onSelect])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${highlightIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[540px] rounded-xl shadow-2xl overflow-hidden border border-gray-700" style={{ backgroundColor: '#1a1f29' }}>
        <div className="flex items-center px-5 border-b border-gray-700">
          {/* Blue — matches Trainers tab (Pokemon Blue in the game-color scheme) */}
          <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search trainers..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 px-4 py-4 text-base bg-transparent text-white placeholder-gray-500 outline-none"
          />
          <span className="text-xs text-gray-600 shrink-0">{filtered.length}</span>
        </div>
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '320px' }}>
          {filtered.map((t, i) => (
            <button
              key={`${t.id}-${t.game}`}
              data-idx={i}
              onClick={() => onSelect(t.id, t.game)}
              className={`w-full text-left px-5 py-2.5 flex items-center gap-3 transition-colors ${
                i === highlightIdx ? 'text-white' : 'text-gray-300 hover:text-white'
              }`}
              style={i === highlightIdx ? { backgroundColor: '#2563eb' } : undefined}
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{t.name}</span>
                <span className="text-xs ml-2" style={{ color: i === highlightIdx ? 'rgba(255,255,255,0.6)' : '#6b7280' }}>
                  {t.trainer_class}
                </span>
              </div>
              <span className="text-xs shrink-0 tabular-nums" style={{ color: i === highlightIdx ? 'rgba(255,255,255,0.6)' : '#6b7280' }}>
                Lv{t.maxLevel}
              </span>
              <span className="text-xs shrink-0" style={{ color: i === highlightIdx ? 'rgba(255,255,255,0.5)' : '#4b5563' }}>
                {t.game}
              </span>
            </button>
          ))}
          {query && filtered.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">No results</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
