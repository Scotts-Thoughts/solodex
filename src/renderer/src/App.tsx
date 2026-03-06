import { useState, useEffect } from 'react'
import PokemonList from './components/PokemonList'
import PokemonDetail from './components/PokemonDetail'
import GameToggle from './components/GameToggle'
import { getAllPokemon, getGamesForPokemon } from './data'

const GEN_GAMES: Record<number, string[]> = {
  1: ['Red and Blue', 'Yellow'],
  2: ['Gold and Silver', 'Crystal'],
  3: ['Ruby and Sapphire', 'Emerald', 'FireRed and LeafGreen'],
  4: ['Diamond and Pearl', 'Platinum', 'HeartGold and SoulSilver'],
  5: ['Black'],
}

export default function App() {
  const [selected, setSelected]       = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState('')

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

  // Cmd/Ctrl+1–5: cycle through available games in that generation
  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const gen = Number(e.key)
      if (!meta || gen < 1 || gen > 5) return
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
        <div className="w-72 flex-shrink-0 flex flex-col overflow-hidden border-r border-gray-700">
          <PokemonList selected={selected} onSelect={setSelected} />
        </div>

        {/* Species detail */}
        <div className="flex-1 overflow-hidden">
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
    </div>
  )
}
