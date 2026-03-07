import { useState, useEffect, useRef, useCallback } from 'react'
import PokemonList, { type PokemonListHandle } from './components/PokemonList'
import PokemonDetail from './components/PokemonDetail'
import GameToggle from './components/GameToggle'
import SpotlightSearch from './components/SpotlightSearch'
import { getAllPokemon, getGamesForPokemon } from './data'

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
  const [listWidth, setListWidth]       = useState(() => {
    const saved = localStorage.getItem('listWidth')
    return saved ? Number(saved) : 288 // 288px = w-72
  })
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)
  const dragMinWidth = useRef(160)
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
        if (next) setSelected(next.name)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected])

  // Space: open spotlight search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSpotlight(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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

  const handleSpotlightSelect = (name: string) => {
    setSelected(name)
    setSpotlight(false)
  }

  return (
    <div
      className="flex flex-col h-full bg-gray-900 text-white"
      style={{ paddingTop: (process.platform as string) === 'darwin' ? '28px' : '0' }}
    >
      {/* Full-width game toggle */}
      {selected && (
        <GameToggle
          games={availableGames}
          selected={selectedGame}
          onChange={setSelectedGame}
        />
      )}

      {/* Main content row */}
      <div className="flex flex-1 overflow-hidden">
        {/* Species list */}
        {listOpen && (
          <>
            <div style={{ width: listWidth }} className="flex-shrink-0 flex flex-col overflow-hidden">
              <PokemonList ref={listRef} selected={selected} onSelect={setSelected} onFilteredChange={setFilteredNames} />
            </div>
            <div
              onMouseDown={onDragStart}
              className="w-1 flex-shrink-0 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors"
            />
          </>
        )}

        {/* Species detail */}
        <div className="flex-1 overflow-hidden relative">
          {/* List toggle button */}
          <button
            onClick={() => setListOpen(o => !o)}
            className="absolute top-2 left-2 z-10 p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            title={listOpen ? 'Hide list' : 'Show list'}
          >
            {listOpen ? '◀' : '▶'}
          </button>

          {selected ? (
            <PokemonDetail
              pokemonName={selected}
              selectedGame={selectedGame}
              onSelect={setSelected}
              filteredNames={filteredNames}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              Select a Pokémon
            </div>
          )}
        </div>
      </div>

      {spotlight && (
        <SpotlightSearch
          onSelect={handleSpotlightSelect}
          onClose={() => setSpotlight(false)}
        />
      )}
    </div>
  )
}
