import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import MoveDetailView from './MoveDetailView'
import { GAME_TO_GEN, isMoveNewInGen, getMovesForGen, getAllPokemonForGame, getTmHmCode, getTypesForGame } from '../data'
import { getCategoryColor } from '../constants/ui'

type Category = 'All' | 'Physical' | 'Special' | 'Status'

interface LearnMethod {
  pokemon: string
  nationalDex: number
  methods: string[]  // e.g. ["Level 12", "TM45", "Egg"]
}

interface Props {
  selectedGame: string
  focusedMove?: string | null
  onClearFocusedMove?: () => void
}

export default function MovedexView({ selectedGame, focusedMove, onClearFocusedMove }: Props) {
  if (focusedMove) {
    return <MoveDetailView moveName={focusedMove} onBack={() => onClearFocusedMove?.()} />
  }

  const gen = GAME_TO_GEN[selectedGame]

  const allMoves = useMemo(() => {
    if (!gen) return []
    return getMovesForGen(gen)
  }, [gen])

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('All')
  const [categoryFilter, setCategoryFilter] = useState<Category>('All')
  const [minPower, setMinPower] = useState<string>('')
  const [maxPower, setMaxPower] = useState<string>('')
  const [minAccuracy, setMinAccuracy] = useState<string>('')
  const [maxAccuracy, setMaxAccuracy] = useState<string>('')
  const [minPp, setMinPp] = useState<string>('')
  const [maxPp, setMaxPp] = useState<string>('')
  const [onlyNewInGen, setOnlyNewInGen] = useState(false)
  const [selectedMove, setSelectedMove] = useState<string | null>(null)

  const filteredMoves = useMemo(() => {
    const minPwr = minPower === '' ? null : Number(minPower)
    const maxPwr = maxPower === '' ? null : Number(maxPower)
    const minAcc = minAccuracy === '' ? null : Number(minAccuracy)
    const maxAcc = maxAccuracy === '' ? null : Number(maxAccuracy)
    const minPP  = minPp === '' ? null : Number(minPp)
    const maxPP  = maxPp === '' ? null : Number(maxPp)

    const query = searchQuery.toLowerCase().trim()

    return allMoves
      .filter(({ name, data }) => {
        if (query && !name.toLowerCase().includes(query)) return false
        if (typeFilter !== 'All' && data.type !== typeFilter) return false
        if (categoryFilter !== 'All' && data.category !== categoryFilter) return false

        if (minPwr !== null && (data.power == null || data.power < minPwr)) return false
        if (maxPwr !== null && (data.power == null || data.power > maxPwr)) return false

        if (minAcc !== null) {
          if (data.accuracy == null) return false
          if (data.accuracy < minAcc) return false
        }
        if (maxAcc !== null) {
          if (data.accuracy == null) return false
          if (data.accuracy > maxAcc) return false
        }

        if (minPP !== null && (data.pp == null || data.pp < minPP)) return false
        if (maxPP !== null && (data.pp == null || data.pp > maxPP)) return false

        if (onlyNewInGen && gen) {
          if (!isMoveNewInGen(name, gen)) return false
        }

        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allMoves, searchQuery, typeFilter, categoryFilter, minPower, maxPower, minAccuracy, maxAccuracy, minPp, maxPp, onlyNewInGen, gen])

  // Build learner data for the selected move
  const moveLearners = useMemo<LearnMethod[]>(() => {
    if (!selectedMove) return []
    const allPokemon = getAllPokemonForGame(selectedGame)
    const tmCode = getTmHmCode(selectedMove, selectedGame)
    const learners: LearnMethod[] = []

    for (const poke of allPokemon) {
      const methods: string[] = []

      // Level-up
      for (const [level, moveName] of poke.level_up_learnset) {
        if (moveName === selectedMove) {
          methods.push(level === 0 ? 'Evo' : `Lv ${level}`)
        }
      }

      // TM/HM
      if (poke.tm_hm_learnset.includes(selectedMove)) {
        methods.push(tmCode ?? 'TM/HM')
      }

      // Tutor
      if (poke.tutor_learnset.includes(selectedMove)) {
        methods.push('Tutor')
      }

      // Egg
      if (poke.egg_moves.includes(selectedMove)) {
        methods.push('Egg')
      }

      if (methods.length > 0) {
        learners.push({ pokemon: poke.species, nationalDex: poke.national_dex_number, methods })
      }
    }

    return learners.sort((a, b) => a.nationalDex - b.nationalDex)
  }, [selectedMove, selectedGame])

  const handleRightClick = useCallback((e: React.MouseEvent, moveName: string) => {
    e.preventDefault()
    setSelectedMove(prev => prev === moveName ? null : moveName)
  }, [])

  // Jump-to-move spotlight (spacebar)
  const [jumpVisible, setJumpVisible] = useState(false)
  const [highlightedMove, setHighlightedMove] = useState<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const scrollToMove = useCallback((moveName: string) => {
    setHighlightedMove(moveName)
    // Wait a tick for state to settle, then scroll
    requestAnimationFrame(() => {
      const row = rowRefs.current.get(moveName)
      const container = scrollContainerRef.current
      if (row && container) {
        const rowTop = row.offsetTop - container.offsetTop
        const containerHeight = container.clientHeight
        container.scrollTop = rowTop - containerHeight / 2 + row.clientHeight / 2
      }
    })
  }, [])

  const handleJumpSelect = useCallback((moveName: string) => {
    setJumpVisible(false)
    scrollToMove(moveName)
  }, [scrollToMove])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        setJumpVisible(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const gameTypes = useMemo(() => {
    if (!selectedGame) return [] as string[]
    return getTypesForGame(selectedGame)
  }, [selectedGame])
  const TYPES = ['All', ...gameTypes]

  return (
    <div className="flex h-full overflow-hidden bg-gray-900">
      {/* Move list panel */}
      <div className="flex flex-col overflow-hidden transition-all duration-300" style={{ width: selectedMove ? 'calc(100% - 280px)' : '100%' }}>
        {/* Filters */}
        <div className="border-b border-gray-800 px-4 py-3 space-y-3 shrink-0">
          <div className="flex flex-col items-center max-w-2xl mx-auto">
          <div className="flex items-stretch justify-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Search moves…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500" style={{ width: '178px' }}
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
            >
              {TYPES.map(t => (
                <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as Category)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
            >
              <option value="All">All Categories</option>
              <option value="Physical">Physical</option>
              <option value="Special">Special</option>
              <option value="Status">Status</option>
            </select>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-500 mb-1">Power</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPower}
                  onChange={e => setMinPower(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPower}
                  onChange={e => setMaxPower(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-500 mb-1">Accuracy</span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minAccuracy}
                    onChange={e => setMinAccuracy(e.target.value)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxAccuracy}
                    onChange={e => setMaxAccuracy(e.target.value)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-500 mb-1">PP</span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minPp}
                    onChange={e => setMinPp(e.target.value)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxPp}
                    onChange={e => setMaxPp(e.target.value)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                  />
                </div>
              </div>
            </div>
          </div>

          <label className="flex items-center justify-center gap-2 cursor-pointer select-none mt-1 w-full">
            <div
              className={`w-7 h-4 rounded-full transition-colors relative ${onlyNewInGen ? 'bg-blue-500' : 'bg-gray-600'}`}
              onClick={() => setOnlyNewInGen(v => !v)}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${onlyNewInGen ? 'translate-x-3.5' : 'translate-x-0.5'}`}
              />
            </div>
            <span className="text-xs text-gray-300">Newly introduced in this generation</span>
          </label>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-hidden flex justify-center relative" onWheel={e => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop += e.deltaY }}>
          <div ref={scrollContainerRef} className="overflow-auto scrollbar-thin pb-1">
            <table className="text-sm border-separate border-spacing-0 table-auto">
              <colgroup>
                <col style={{ width: '1%' }} />
                <col className="w-20" />
                <col className="w-20" />
                <col className="w-12" />
                <col className="w-12" />
                <col className="w-12" />
              </colgroup>
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="py-1 px-1.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap bg-gray-900">Move</th>
                  <th className="py-1 px-1.5 text-left text-xs font-semibold text-gray-500 bg-gray-900">Type</th>
                  <th className="py-1 px-1.5 text-left text-xs font-semibold text-gray-500 bg-gray-900">Cat</th>
                  <th className="py-1 px-1.5 text-right text-xs font-semibold text-gray-500 bg-gray-900">Pwr</th>
                  <th className="py-1 px-1.5 text-right text-xs font-semibold text-gray-500 bg-gray-900">Acc</th>
                  <th className="py-1 px-1.5 text-right text-xs font-semibold text-gray-500 bg-gray-900">PP</th>
                </tr>
              </thead>
              <tbody>
                {filteredMoves.map(({ name, data }) => (
                  <tr
                    key={name}
                    ref={el => { if (el) rowRefs.current.set(name, el); else rowRefs.current.delete(name) }}
                    className={`border-t border-gray-800 hover:bg-gray-800/60 cursor-context-menu ${selectedMove === name ? 'bg-gray-800' : ''} ${highlightedMove === name ? 'bg-blue-900/40' : ''}`}
                    onContextMenu={e => handleRightClick(e, name)}
                  >
                    <td className="py-1 px-1.5 whitespace-nowrap">
                      <WikiPopover name={name} type="move">
                        <span className="text-gray-100 cursor-pointer hover:text-white">
                          {name}
                        </span>
                      </WikiPopover>
                    </td>
                    <td className="py-1 px-1.5 whitespace-nowrap">
                      <TypeBadge type={data.type} small game={selectedGame} />
                    </td>
                    <td className="py-1 px-1.5 whitespace-nowrap text-xs truncate" style={{
                      color: getCategoryColor(data.category),
                    }}>
                      {data.category ?? '—'}
                    </td>
                    <td className="py-1 px-1.5 text-right tabular-nums text-gray-100 whitespace-nowrap">
                      {data.power ?? '—'}
                    </td>
                    <td className="py-1 px-1.5 text-right tabular-nums text-gray-100 whitespace-nowrap">
                      {data.accuracy != null ? data.accuracy : '—'}
                    </td>
                    <td className="py-1 px-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">
                      {data.pp ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredMoves.length === 0 && (
              <div className="py-8 text-center text-gray-500 text-sm">
                No moves match the current filters.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Learner detail panel — always mounted, width animated */}
      <div
        className="flex flex-col border-l border-gray-700 overflow-hidden transition-all duration-300"
        style={{ width: selectedMove ? '280px' : '0px', minWidth: selectedMove ? '280px' : '0px', borderLeftWidth: selectedMove ? undefined : '0px' }}
      >
        {selectedMove && (
        <div className="flex flex-col h-full overflow-hidden min-w-0" style={{ minWidth: 'max-content' }}>
          {/* Header */}
          <div className="border-b border-gray-800 px-3 py-2 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-100 font-semibold text-sm truncate">{selectedMove}</span>
              <span className="text-xs text-gray-500 shrink-0">{moveLearners.length}</span>
            </div>
            <button
              onClick={() => setSelectedMove(null)}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none px-1 shrink-0"
            >
              ×
            </button>
          </div>

          {/* Learner table */}
          <div className="flex-1 overflow-auto px-1 scrollbar-thin">
            <table className="text-sm border-separate border-spacing-0 table-auto">
              <thead>
                <tr className="bg-gray-900 sticky top-0 z-10">
                  <th className="py-1 px-1 text-left text-xs font-semibold text-gray-500">Pokemon</th>
                  <th className="py-1 px-1 text-left text-xs font-semibold text-gray-500">Method</th>
                </tr>
              </thead>
              <tbody>
                {moveLearners.map(({ pokemon, methods }) => (
                  <tr
                    key={pokemon}
                    className="border-t border-gray-800 hover:bg-gray-800/60"
                  >
                    <td className="py-1 px-1 text-gray-100 whitespace-nowrap text-xs">
                      {pokemon}
                    </td>
                    <td className="py-1 px-1">
                      <div className="flex flex-wrap gap-1">
                        {methods.map((method, i) => (
                          <span
                            key={i}
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              method.startsWith('Lv') || method === 'Evo'
                                ? 'bg-green-900/50 text-green-300'
                                : method.startsWith('TM') || method.startsWith('HM')
                                  ? 'bg-blue-900/50 text-blue-300'
                                  : method === 'Egg'
                                    ? 'bg-yellow-900/50 text-yellow-300'
                                    : 'bg-purple-900/50 text-purple-300'
                            }`}
                          >
                            {method}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {moveLearners.length === 0 && (
              <div className="py-8 text-center text-gray-500 text-sm">
                No Pokemon learn this move in {selectedGame}.
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Move spotlight search */}
      {jumpVisible && (
        <MoveSpotlight
          moves={filteredMoves}
          onSelect={handleJumpSelect}
          onClose={() => setJumpVisible(false)}
        />
      )}
    </div>
  )
}

function MoveSpotlight({ moves, onSelect, onClose }: {
  moves: { name: string; data: { type: string; category: string; power: number | null; accuracy: number | null } }[]
  onSelect: (name: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return moves
    return moves.filter(m => m.name.toLowerCase().includes(q))
  }, [query, moves])

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
          onSelect(filtered[highlightIdx].name)
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
          <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search moves…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 px-4 py-4 text-base bg-transparent text-white placeholder-gray-500 outline-none"
          />
          <span className="text-xs text-gray-600 shrink-0">{filtered.length}</span>
        </div>
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '320px' }}>
          {filtered.map((m, i) => (
            <button
              key={m.name}
              data-idx={i}
              onClick={() => onSelect(m.name)}
              className={`w-full text-left px-5 py-2.5 flex items-center gap-3 transition-colors ${
                i === highlightIdx ? 'text-white' : 'text-gray-300 hover:text-white'
              }`}
              style={i === highlightIdx ? { backgroundColor: '#1d9bf0' } : undefined}
            >
              <span className="font-medium text-sm">{m.name}</span>
              <span className="text-xs ml-auto" style={{ color: i === highlightIdx ? 'rgba(255,255,255,0.65)' : '#5c6470' }}>
                {m.data.type}
                {m.data.power != null ? ` · ${m.data.power}` : ''}
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
