import { useState, useEffect, useRef, useCallback } from 'react'
import PokemonList, { type PokemonListHandle } from './components/PokemonList'
import PokemonDetail from './components/PokemonDetail'
import ComparisonView from './components/ComparisonView'
import SelfComparisonView from './components/SelfComparisonView'
import GameToggle from './components/GameToggle'
import SpotlightSearch from './components/SpotlightSearch'
import TrainerList from './components/TrainerList'
import TrainerDetail from './components/TrainerDetail'
import EVComparisonView from './components/EVComparisonView'
import MovedexView from './components/MovedexView'
import UpdateBanner from './components/UpdateBanner'
import { getAllPokemon, getGamesForPokemon, GAMES_WITH_TRAINERS, GAMES } from './data'

// Matches the GEN_GROUPS order in GameToggle — Cmd/Ctrl+1–5 cycles within a gen
const GEN_GAMES: Record<number, string[]> = {
  1: ['Red and Blue', 'Yellow'],
  2: ['Gold and Silver', 'Crystal'],
  3: ['Ruby and Sapphire', 'Emerald', 'FireRed and LeafGreen'],
  4: ['Diamond and Pearl', 'Platinum', 'HeartGold and SoulSilver'],
  5: ['Black', 'Black 2 and White 2'],
  6: ['X and Y', 'Omega Ruby and Alpha Sapphire'],
  7: ['Sun and Moon', 'Ultra Sun and Ultra Moon'],
  8: ['Sword and Shield'],
  9: ['Scarlet and Violet'],
}

export default function App() {
  const [selected, setSelected]         = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState('')
  const [spotlight, setSpotlight]       = useState(false)
  const [listOpen, setListOpen]         = useState(true)
  const [filteredNames, setFilteredNames] = useState<string[]>([])
  const [comparingWith, setComparingWith] = useState<string | null>(() => localStorage.getItem('comparingWith'))
  const [selfCompare, setSelfCompare] = useState(() => localStorage.getItem('selfCompare') === 'true')
  const [viewMode, setViewMode]         = useState<'pokemon' | 'evs' | 'trainers' | 'movedex'>('pokemon')
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null)
  const [listWidth, setListWidth]       = useState(() => {
    const saved = localStorage.getItem('listWidth')
    return saved ? Number(saved) : 288 // 288px = w-72
  })
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const dragMinWidth = useRef(180)
  const listRef = useRef<PokemonListHandle>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = listWidth
    dragMinWidth.current = listRef.current?.getMinWidth() ?? 160
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [listWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - dragStartX.current
      const next = Math.max(dragMinWidth.current, Math.min(480, dragStartWidth.current + delta))
      setListWidth(next)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setListWidth(w => { localStorage.setItem('listWidth', String(w)); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Restore last-viewed Pokemon on load, falling back to first in list
  useEffect(() => {
    const all = getAllPokemon()
    if (all.length === 0) return
    const saved = localStorage.getItem('lastSelected')
    const valid = saved && all.some(p => p.name === saved)
    setSelected(valid ? saved : all[0].name)
  }, [])

  // When species changes: persist selection and keep current game if available
  useEffect(() => {
    if (!selected) return
    localStorage.setItem('lastSelected', selected)
    const available = getGamesForPokemon(selected)
    setSelectedGame(prev => available.includes(prev) ? prev : (available[0] ?? ''))
  }, [selected])

  // Clear compare modes when navigating to a different species via normal selection
  const clearCompareOnSelect = useCallback((name: string) => {
    setSelected(name)
    setSelfCompare(false)
    setComparingWith(null)
    localStorage.setItem('selfCompare', 'false')
    localStorage.removeItem('comparingWith')
  }, [])

  // Arrow keys: Up/Down navigate dex, Left/Right toggle list
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setListOpen(false)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setListOpen(true)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const all = getAllPokemon()
        const idx = all.findIndex(p => p.name === selected)
        if (idx === -1) return
        const next = e.key === 'ArrowUp' ? all[idx - 1] : all[idx + 1]
        if (next) clearCompareOnSelect(next.name)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected])

  // Space: open spotlight search (disabled in movedex — movedex has its own jump-to)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (viewMode === 'movedex') return
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSpotlight(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [viewMode])

  // Cmd/Ctrl+1–5: cycle through available games in that generation
  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const gen = Number(e.key)
      if (!meta || isNaN(gen) || gen < 1 || gen > 9) return
      e.preventDefault()

      const available = getGamesForPokemon(selected)
      const genAvailable = GEN_GAMES[gen].filter(g => available.includes(g))
      if (genAvailable.length === 0) return

      setSelectedGame(prev => {
        const idx = genAvailable.indexOf(prev)
        return genAvailable[(idx + 1) % genAvailable.length]
      })
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected])

  const availableGames = selected ? getGamesForPokemon(selected) : []
  const trainerGameAvailable = GAMES_WITH_TRAINERS.includes(selectedGame)

  const gamesForToggle =
    viewMode === 'trainers' ? GAMES_WITH_TRAINERS
    : (viewMode === 'evs' || viewMode === 'movedex') ? [...GAMES]
    : availableGames

  const handleViewModeChange = useCallback((mode: 'pokemon' | 'evs' | 'trainers' | 'movedex') => {
    setViewMode(mode)
    if (mode === 'trainers') {
      setSelectedTrainer(null)
      setSelectedGame(g => GAMES_WITH_TRAINERS.includes(g) ? g : GAMES_WITH_TRAINERS[0])
    } else if (mode === 'evs' || mode === 'movedex') {
      setSelectedGame(g => GAMES.includes(g) ? g : GAMES[0])
    }
  }, [])

  // F1–F4: switch view mode
  useEffect(() => {
    const modes = ['pokemon', 'evs', 'trainers', 'movedex'] as const
    const handler = (e: KeyboardEvent) => {
      const idx = ['F1', 'F2', 'F3', 'F4'].indexOf(e.key)
      if (idx === -1) return
      e.preventDefault()
      handleViewModeChange(modes[idx])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleViewModeChange])

  const handleCompare = useCallback((rightClickedName: string) => {
    setComparingWith(rightClickedName)
    setSelfCompare(false)
    localStorage.setItem('comparingWith', rightClickedName)
    localStorage.setItem('selfCompare', 'false')
  }, [])

  const handleExitCompare = useCallback(() => {
    setComparingWith(null)
    localStorage.removeItem('comparingWith')
  }, [])

  const handleSelfCompare = useCallback((name?: string) => {
    if (name) setSelected(name)
    setSelfCompare(true)
    setComparingWith(null)
    localStorage.setItem('selfCompare', 'true')
    localStorage.removeItem('comparingWith')
  }, [])

  const handleExitSelfCompare = useCallback(() => {
    setSelfCompare(false)
    localStorage.setItem('selfCompare', 'false')
  }, [])

  const handleSpotlightSelect = (name: string) => {
    clearCompareOnSelect(name)
    setSpotlight(false)
  }

  return (
    <div
      className="flex flex-col h-full bg-gray-900 text-white"
      style={{ paddingTop: (process.platform as string) === 'darwin' ? '28px' : '0' }}
    >
      {/* Full-width game toggle + Pokedex / EVs / Trainers / Movedex */}
      {(selected || viewMode === 'evs' || viewMode === 'trainers' || viewMode === 'movedex') && (
        <div className="flex items-center border-b border-gray-700">
          <div className="flex-1">
            <GameToggle
              games={gamesForToggle}
              selected={selectedGame}
              perGame={viewMode === 'trainers'}
              onChange={(g) => {
                setSelectedGame(g)
                if (viewMode === 'trainers') setSelectedTrainer(null)
              }}
              onExitCompare={comparingWith ? handleExitCompare : selfCompare ? handleExitSelfCompare : undefined}
            />
          </div>
          <div className="mr-3 py-3">
            <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-800">
              {(['pokemon', 'evs', 'trainers', 'movedex'] as const).map((mode, index) => {
                const label = mode === 'pokemon' ? 'Pokedex' : mode === 'evs' ? 'EVs' : mode === 'trainers' ? 'Trainers' : 'Movedex'
                const fKey = `F${index + 1}`
                const isActive = viewMode === mode
                const disabled = mode === 'trainers' && !trainerGameAvailable && !isActive
                return (
                  <button
                    key={mode}
                    onClick={() => !disabled && handleViewModeChange(mode)}
                    disabled={disabled}
                    className={[
                      'w-24 py-1.5 text-xs font-bold transition-colors focus:outline-none text-center',
                      disabled
                        ? 'text-gray-600 cursor-not-allowed'
                        : isActive
                          ? mode === 'pokemon'
                            ? 'bg-red-600 text-white'
                            : mode === 'evs'
                              ? 'bg-green-600 text-white'
                              : mode === 'trainers'
                                ? 'bg-blue-600 text-white'
                                : 'bg-yellow-500 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    ].join(' ')}
                    title={disabled ? 'No trainer data for this game' : label}
                  >
                    {label} <span className="text-gray-500 font-normal">[{fKey}]</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main content row */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'evs' ? (
          <div className="flex-1 overflow-hidden">
            <EVComparisonView
              selectedGame={selectedGame}
              onSelectPokemon={(name) => {
                setSelected(name)
                setViewMode('pokemon')
              }}
            />
          </div>
        ) : viewMode === 'movedex' ? (
          <div className="flex-1 overflow-hidden">
            <MovedexView selectedGame={selectedGame} />
          </div>
        ) : viewMode === 'trainers' ? (
          <>
            {/* Trainer list */}
            {listOpen && (
              <>
                <div style={{ width: listWidth }} className="flex-shrink-0 flex flex-col overflow-hidden">
                  <TrainerList
                    selectedGame={selectedGame}
                    selected={selectedTrainer}
                    onSelect={setSelectedTrainer}
                    width={listWidth}
                  />
                </div>
                <div
                  onMouseDown={onDragStart}
                  className="w-1 flex-shrink-0 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors"
                />
              </>
            )}

            {/* Trainer detail */}
            <div className="flex-1 overflow-hidden relative">
              <button
                onClick={() => setListOpen(o => !o)}
                className="absolute top-2 left-2 z-10 p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title={listOpen ? 'Hide list' : 'Show list'}
              >
                {listOpen ? '◀' : '▶'}
              </button>

              {selectedTrainer ? (
                <TrainerDetail
                  trainerId={selectedTrainer}
                  selectedGame={selectedGame}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600 h-full">
                  Select a trainer
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Species list */}
            {listOpen && (
              <>
                <div style={{ width: listWidth }} className="flex-shrink-0 flex flex-col overflow-hidden">
                  <PokemonList ref={listRef} selected={selected} selectedGame={selectedGame} onSelect={clearCompareOnSelect} onFilteredChange={setFilteredNames} onCompare={handleCompare} onSelfCompare={handleSelfCompare} width={listWidth} />
                </div>
                <div
                  onMouseDown={onDragStart}
                  className="w-1 flex-shrink-0 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors"
                />
              </>
            )}

            {/* Species detail or comparison */}
            <div className="flex-1 overflow-hidden relative">
              <button
                onClick={() => setListOpen(o => !o)}
                className="absolute top-2 left-2 z-10 p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title={listOpen ? 'Hide list' : 'Show list'}
              >
                {listOpen ? '◀' : '▶'}
              </button>

              {selected && comparingWith ? (
                <ComparisonView
                  leftName={selected}
                  rightName={comparingWith}
                  selectedGame={selectedGame}
                  onSelectLeft={setSelected}
                  onSelectRight={setComparingWith}
                  onExit={handleExitCompare}
                />
              ) : selected && selfCompare ? (
                <SelfComparisonView
                  key={`${selected}-${selectedGame}`}
                  pokemonName={selected}
                  initialGame={selectedGame}
                  onExit={handleExitSelfCompare}
                />
              ) : selected ? (
                <PokemonDetail
                  pokemonName={selected}
                  selectedGame={selectedGame}
                  onSelect={setSelected}
                  filteredNames={filteredNames}
                  onSelfCompare={handleSelfCompare}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600">
                  Select a Pokémon
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {spotlight && (
        <SpotlightSearch
          onSelect={handleSpotlightSelect}
          onClose={() => setSpotlight(false)}
        />
      )}

      <UpdateBanner />
    </div>
  )
}
