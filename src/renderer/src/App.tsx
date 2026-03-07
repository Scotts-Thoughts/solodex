import { useState, useEffect } from 'react'
import PokemonList from './components/PokemonList'
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

  // Auto-select first Pokemon on load
  useEffect(() => {
    const all = getAllPokemon()
    if (all.length > 0) setSelected(all[0].name)
  }, [])

  // When species changes: keep current game if available, otherwise fall back
  useEffect(() => {
    if (!selected) return
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
          <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden border-r border-gray-700">
            <PokemonList selected={selected} onSelect={setSelected} />
          </div>
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
