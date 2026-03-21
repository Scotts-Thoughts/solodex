import { useState, useEffect, useRef, useCallback } from 'react'
import PokemonList, { type PokemonListHandle } from './components/PokemonList'
import PokemonDetail from './components/PokemonDetail'
import ComparisonView from './components/ComparisonView'
import TripleComparisonView from './components/TripleComparisonView'
import SelfComparisonView from './components/SelfComparisonView'
import GameToggle from './components/GameToggle'
import SpotlightSearch from './components/SpotlightSearch'
import TrainerList from './components/TrainerList'
import TrainerDetail from './components/TrainerDetail'
import TrainerSpeedList from './components/TrainerSpeedList'
import EVComparisonView from './components/EVComparisonView'
import MovedexView from './components/MovedexView'
import NaturesView from './components/NaturesView'
import UpdateBanner from './components/UpdateBanner'
import { getAllPokemon, getGamesForPokemon, GAMES_WITH_TRAINERS, GAMES, GEN_GROUPS } from './data'
import { useDragResize } from './hooks/useDragResize'

// Derived from GEN_GROUPS — Cmd/Ctrl+1–9 cycles within a gen
const GEN_GAMES: Record<number, string[]> = Object.fromEntries(
  GEN_GROUPS.map((g, i) => [i + 1, g.games])
)

const IS_MAC = (process.platform as string) === 'darwin'

export default function App() {
  const [selected, setSelected]         = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState('')
  const [spotlight, setSpotlight]       = useState(false)
  const [spotlightCompare, setSpotlightCompare] = useState(false)
  const [listOpen, setListOpen]         = useState(true)
  const [filteredNames, setFilteredNames] = useState<string[]>([])
  const [comparingWith, setComparingWith] = useState<string | null>(() => localStorage.getItem('comparingWith'))
  const [comparingThird, setComparingThird] = useState<string | null>(() => localStorage.getItem('comparingThird'))
  const [selfCompare, setSelfCompare] = useState(() => localStorage.getItem('selfCompare') === 'true')
  const [viewMode, setViewMode]         = useState<'pokemon' | 'evs' | 'trainers' | 'movedex' | 'natures'>('pokemon')
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null)
  const [listWidth, setListWidth]       = useState(() => {
    const saved = localStorage.getItem('listWidth')
    return saved ? Number(saved) : 288 // 288px = w-72
  })
  const listRef = useRef<PokemonListHandle>(null)

  // Bug #5 fix: persist listWidth via onDragEnd callback instead of side effect in state updater
  const { onDragStart } = useDragResize({
    width: listWidth,
    setWidth: setListWidth,
    minWidth: listRef.current?.getMinWidth() ?? 180,
    onDragEnd: (w) => localStorage.setItem('listWidth', String(w)),
  })

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
    setComparingThird(null)
    localStorage.setItem('selfCompare', 'false')
    localStorage.removeItem('comparingWith')
    localStorage.removeItem('comparingThird')
  }, [])

  const availableGames = selected ? getGamesForPokemon(selected) : []
  const trainerGameAvailable = GAMES_WITH_TRAINERS.includes(selectedGame)

  const gamesForToggle =
    viewMode === 'trainers' ? GAMES_WITH_TRAINERS
    : (viewMode === 'evs' || viewMode === 'movedex' || viewMode === 'natures') ? [...GAMES]
    : availableGames

  const handleViewModeChange = useCallback((mode: 'pokemon' | 'evs' | 'trainers' | 'movedex' | 'natures') => {
    setViewMode(mode)
    if (mode === 'trainers') {
      setSelectedTrainer(null)
      setSelectedGame(g => GAMES_WITH_TRAINERS.includes(g) ? g : GAMES_WITH_TRAINERS[0])
    } else if (mode === 'evs' || mode === 'movedex' || mode === 'natures') {
      setSelectedGame(g => GAMES.includes(g) ? g : GAMES[0])
    }
  }, [])

  // F1–F4: switch view mode
  useEffect(() => {
    const modes = ['pokemon', 'evs', 'trainers', 'movedex', 'natures'] as const
    const handler = (e: KeyboardEvent) => {
      const idx = ['F1', 'F2', 'F3', 'F4', 'F5'].indexOf(e.key)
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
    setComparingThird(null)
    localStorage.removeItem('comparingWith')
    localStorage.removeItem('comparingThird')
  }, [])

  const handleTripleCompare = useCallback((thirdName: string) => {
    setComparingThird(thirdName)
    localStorage.setItem('comparingThird', thirdName)
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

  // Consolidated keyboard handler: arrows, space, Cmd+1-9, Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

      // Ctrl+Space: open spotlight in comparison mode
      if ((e.metaKey || e.ctrlKey) && e.key === ' ' && !inInput && selected && viewMode === 'pokemon') {
        e.preventDefault()
        setSpotlightCompare(true)
        setSpotlight(true)
        return
      }

      // Cmd/Ctrl+1–9: cycle through available games in that generation
      if ((e.metaKey || e.ctrlKey) && !inInput) {
        const gen = Number(e.key)
        if (!isNaN(gen) && gen >= 1 && gen <= 9 && selected) {
          e.preventDefault()
          const available = getGamesForPokemon(selected)
          const genAvailable = GEN_GAMES[gen]?.filter(g => available.includes(g)) ?? []
          if (genAvailable.length === 0) return
          setSelectedGame(prev => {
            const idx = genAvailable.indexOf(prev)
            return genAvailable[(idx + 1) % genAvailable.length]
          })
        }
        return
      }

      if (inInput) return

      // Escape: exit comparison mode
      if (e.key === 'Escape') {
        if (comparingWith) { handleExitCompare(); return }
        if (selfCompare) { handleExitSelfCompare(); return }
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Arrow keys: Up/Down navigate filtered list, Left/Right toggle list
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setListOpen(false)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setListOpen(true)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        // Bug #2 fix: navigate within filtered list, not all Pokemon
        const list = filteredNames.length > 0 ? filteredNames : getAllPokemon().map(p => p.name)
        const idx = list.indexOf(selected ?? '')
        if (idx === -1) return
        const nextIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1
        if (nextIdx >= 0 && nextIdx < list.length) clearCompareOnSelect(list[nextIdx])
      } else if (e.key === ' ' && viewMode !== 'movedex') {
        e.preventDefault()
        setSpotlight(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, filteredNames, viewMode, clearCompareOnSelect, comparingWith, selfCompare, handleExitCompare, handleExitSelfCompare])

  const handleSpotlightSelect = (name: string) => {
    if (spotlightCompare && selected) {
      handleCompare(name)
    } else {
      clearCompareOnSelect(name)
    }
    setSpotlight(false)
    setSpotlightCompare(false)
  }

  return (
    <div
      className="flex flex-col h-full bg-gray-900 text-white"
      style={{ paddingTop: IS_MAC ? '28px' : '0' }}
    >
      {/* Full-width game toggle + Pokedex / EVs / Trainers / Movedex */}
      {(selected || viewMode === 'evs' || viewMode === 'trainers' || viewMode === 'movedex' || viewMode === 'natures') && (
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
              {(['pokemon', 'evs', 'trainers', 'movedex', 'natures'] as const).map((mode, index) => {
                const label = mode === 'pokemon' ? 'Pokedex' : mode === 'evs' ? 'EVs' : mode === 'trainers' ? 'Trainers' : mode === 'movedex' ? 'Movedex' : 'Natures'
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
                                : mode === 'movedex'
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-amber-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    ].join(' ')}
                    title={disabled ? 'No trainer data for this game' : label}
                  >
                    {label} <span className={`font-normal ${isActive ? 'text-white/60' : 'text-gray-500'}`}>[{fKey}]</span>
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
        ) : viewMode === 'natures' ? (
          <NaturesView />
        ) : viewMode === 'trainers' ? (
          <>
            {/* Trainer list */}
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

            {/* Trainer detail */}
            <div className="flex-1 overflow-hidden">
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

            {/* Speed rankings */}
            <div style={{ width: listWidth }} className="flex-shrink-0 border-l border-gray-700 overflow-hidden">
              <TrainerSpeedList selectedGame={selectedGame} onSelect={setSelectedTrainer} />
            </div>
          </>
        ) : (
          <>
            {/* Species list */}
            {listOpen && (
              <>
                <div style={{ width: listWidth }} className="flex-shrink-0 flex flex-col overflow-hidden">
                  <PokemonList ref={listRef} selected={selected} selectedGame={selectedGame} onSelect={clearCompareOnSelect} onFilteredChange={setFilteredNames} onCompare={handleCompare} onSelfCompare={handleSelfCompare} onTripleCompare={handleTripleCompare} comparingWith={comparingWith} width={listWidth} />
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

              {selected && comparingWith && comparingThird ? (
                <TripleComparisonView
                  name1={selected}
                  name2={comparingWith}
                  name3={comparingThird}
                  selectedGame={selectedGame}
                  onSelect1={setSelected}
                  onSelect2={setComparingWith}
                  onSelect3={setComparingThird}
                  onExit={handleExitCompare}
                />
              ) : selected && comparingWith ? (
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
                  onCompare={handleCompare}
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
          onClose={() => { setSpotlight(false); setSpotlightCompare(false) }}
          comparingName={spotlightCompare ? selected : null}
        />
      )}

      <UpdateBanner />
    </div>
  )
}
