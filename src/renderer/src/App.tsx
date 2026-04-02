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
import MoveSpotlightSearch from './components/MoveSpotlightSearch'
import TrainerSpotlightSearch from './components/TrainerSpotlightSearch'
import NaturesView from './components/NaturesView'
import UpdateBanner from './components/UpdateBanner'
import { getAllPokemon, getGamesForPokemon, GAMES_WITH_TRAINERS, GAMES, GEN_GROUPS } from './data'
import { useDragResize } from './hooks/useDragResize'
import { setTransparentExport } from './utils/exportSettings'
import { FadeUnobtainableContext } from './contexts/FadeUnobtainableContext'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'
import { useKeybindings } from './hooks/useKeybindings'
import { matchesShortcut, formatKeyForDisplay } from './keybindings'

// Derived from GEN_GROUPS — Cmd/Ctrl+1–9 cycles within a gen
const GEN_GAMES: Record<number, string[]> = Object.fromEntries(
  GEN_GROUPS.map((g, i) => [i + 1, g.games])
)

const IS_MAC = (process.platform as string) === 'darwin'
const VIEW_MODE_IDS = ['viewPokedex', 'viewEVs', 'viewTrainers', 'viewMovedex', 'viewNatures'] as const

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
  const [moveSpotlight, setMoveSpotlight] = useState(false)
  const [trainerSpotlight, setTrainerSpotlight] = useState(false)
  const [focusedMove, setFocusedMove]   = useState<string | null>(null)
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null)
  const [listWidth, setListWidth]       = useState(() => {
    const saved = localStorage.getItem('listWidth')
    return saved ? Number(saved) : 288 // 288px = w-72
  })
  const listRef = useRef<PokemonListHandle>(null)
  const { bindings, overrides, setBinding, resetBinding, resetAll } = useKeybindings()
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [fadeUnobtainable, setFadeUnobtainable] = useState(false)

  useEffect(() => {
    return window.electronAPI.subscribeOpenShortcuts(() => setShowShortcutsModal(true))
  }, [])

  useEffect(() => {
    window.electronAPI.getTransparentExport().then(setTransparentExport)
    return window.electronAPI.subscribeTransparentExport(setTransparentExport)
  }, [])

  useEffect(() => {
    window.electronAPI.getFadeUnobtainable().then(setFadeUnobtainable)
    return window.electronAPI.subscribeFadeUnobtainable(setFadeUnobtainable)
  }, [])

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
    if (mode !== 'movedex') setFocusedMove(null)
    if (mode === 'trainers') {
      setSelectedTrainer(null)
      setSelectedGame(g => GAMES_WITH_TRAINERS.includes(g) ? g : GAMES_WITH_TRAINERS[GAMES_WITH_TRAINERS.length - 1])
    } else if (mode === 'evs' || mode === 'movedex' || mode === 'natures') {
      setSelectedGame(g => GAMES.includes(g) ? g : GAMES[0])
    }
  }, [])

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

  // Consolidated keyboard handler using configurable keybindings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't process shortcuts while the shortcuts modal is open
      if (showShortcutsModal) return

      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

      // View mode shortcuts
      if (!inInput) {
        const viewModes = [
          { binding: bindings.viewPokedex, mode: 'pokemon' as const },
          { binding: bindings.viewEVs, mode: 'evs' as const },
          { binding: bindings.viewTrainers, mode: 'trainers' as const },
          { binding: bindings.viewMovedex, mode: 'movedex' as const },
          { binding: bindings.viewNatures, mode: 'natures' as const },
        ]
        for (const { binding, mode } of viewModes) {
          if (matchesShortcut(e, binding)) {
            e.preventDefault()
            handleViewModeChange(mode)
            return
          }
        }
      }

      // Trainer spotlight (works from anywhere)
      if (matchesShortcut(e, bindings.trainerSpotlight)) {
        e.preventDefault()
        setTrainerSpotlight(true)
        return
      }

      // Move spotlight (works from anywhere)
      if (matchesShortcut(e, bindings.moveSpotlight)) {
        e.preventDefault()
        setMoveSpotlight(true)
        return
      }

      // Compare spotlight
      if (matchesShortcut(e, bindings.spotlightCompare) && !inInput && selected && viewMode === 'pokemon') {
        e.preventDefault()
        setSpotlightCompare(true)
        setSpotlight(true)
        return
      }

      // Cmd/Ctrl+1–9: cycle through available games in that generation (not rebindable)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && !inInput) {
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
          return
        }
      }

      if (inInput) return

      // Exit comparison
      if (matchesShortcut(e, bindings.exitCompare)) {
        if (comparingWith) { handleExitCompare(); return }
        if (selfCompare) { handleExitSelfCompare(); return }
      }

      // Navigation and spotlight search
      if (matchesShortcut(e, bindings.hideList)) {
        e.preventDefault()
        setListOpen(false)
      } else if (matchesShortcut(e, bindings.showList)) {
        e.preventDefault()
        setListOpen(true)
      } else if (matchesShortcut(e, bindings.navigateUp) || matchesShortcut(e, bindings.navigateDown)) {
        e.preventDefault()
        const isUp = matchesShortcut(e, bindings.navigateUp)
        const list = filteredNames.length > 0 ? filteredNames : getAllPokemon().map(p => p.name)
        const idx = list.indexOf(selected ?? '')
        if (idx === -1) return
        const nextIdx = isUp ? idx - 1 : idx + 1
        if (nextIdx >= 0 && nextIdx < list.length) clearCompareOnSelect(list[nextIdx])
      } else if (matchesShortcut(e, bindings.spotlightSearch) && viewMode !== 'movedex') {
        e.preventDefault()
        setSpotlight(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, filteredNames, viewMode, clearCompareOnSelect, comparingWith, selfCompare, handleExitCompare, handleExitSelfCompare, handleViewModeChange, bindings, showShortcutsModal])

  const handleSpotlightSelect = (name: string) => {
    if (spotlightCompare && selected) {
      handleCompare(name)
    } else {
      clearCompareOnSelect(name)
    }
    setSpotlight(false)
    setSpotlightCompare(false)
  }

  const handleTrainerSpotlightSelect = useCallback((trainerId: string, game: string) => {
    setViewMode('trainers')
    setSelectedGame(game)
    setSelectedTrainer(trainerId)
    setTrainerSpotlight(false)
  }, [])

  const handleMoveSpotlightSelect = useCallback((moveName: string) => {
    setFocusedMove(moveName)
    setViewMode('movedex')
    setSelectedGame(g => GAMES.includes(g) ? g : GAMES[0])
    setMoveSpotlight(false)
  }, [])

  return (
    <FadeUnobtainableContext.Provider value={fadeUnobtainable}>
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
                const fKey = formatKeyForDisplay(bindings[VIEW_MODE_IDS[index]])
                const isActive = viewMode === mode
                const disabled = false
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
            <MovedexView selectedGame={selectedGame} focusedMove={focusedMove} onClearFocusedMove={() => setFocusedMove(null)} />
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
                  onNavigate={clearCompareOnSelect}
                  onCompare={handleCompare}
                  onSelfCompare={handleSelfCompare}
                  onTripleCompare={handleTripleCompare}
                />
              ) : selected && comparingWith ? (
                <ComparisonView
                  leftName={selected}
                  rightName={comparingWith}
                  selectedGame={selectedGame}
                  onSelectLeft={setSelected}
                  onSelectRight={setComparingWith}
                  onExit={handleExitCompare}
                  onNavigate={clearCompareOnSelect}
                  onCompare={handleCompare}
                  onSelfCompare={handleSelfCompare}
                  onTripleCompare={handleTripleCompare}
                />
              ) : selected && selfCompare ? (
                <SelfComparisonView
                  key={`${selected}-${selectedGame}`}
                  pokemonName={selected}
                  initialGame={selectedGame}
                  onExit={handleExitSelfCompare}
                  onNavigate={clearCompareOnSelect}
                  onCompare={handleCompare}
                  onSelfCompare={handleSelfCompare}
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

      {trainerSpotlight && (
        <TrainerSpotlightSearch
          currentGame={selectedGame}
          onSelect={handleTrainerSpotlightSelect}
          onClose={() => setTrainerSpotlight(false)}
        />
      )}

      {moveSpotlight && (
        <MoveSpotlightSearch
          onSelect={handleMoveSpotlightSelect}
          onClose={() => setMoveSpotlight(false)}
        />
      )}

      {showShortcutsModal && (
        <KeyboardShortcutsModal
          bindings={bindings}
          overrides={overrides}
          onSetBinding={setBinding}
          onResetBinding={resetBinding}
          onResetAll={resetAll}
          onClose={() => setShowShortcutsModal(false)}
        />
      )}

      <UpdateBanner />
    </div>
    </FadeUnobtainableContext.Provider>
  )
}
