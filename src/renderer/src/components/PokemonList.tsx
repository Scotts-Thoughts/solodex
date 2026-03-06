import { useState, useMemo, useRef, useEffect } from 'react'
import type { PokemonListEntry } from '../types/pokemon'
import { getAllPokemon } from '../data'
import TypeBadge from './TypeBadge'

interface Props {
  selected: string | null
  onSelect: (name: string) => void
}

export default function PokemonList({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  const allPokemon: PokemonListEntry[] = useMemo(() => getAllPokemon(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allPokemon
    return allPokemon.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.national_dex_number.toString() === q ||
        p.type_1.toLowerCase().includes(q) ||
        p.type_2.toLowerCase().includes(q)
    )
  }, [query, allPokemon])

  // Scroll selected into view when it changes externally
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-700">
      {/* Search */}
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search name, #, or type…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm bg-gray-800 text-white placeholder-gray-500 rounded border border-gray-700 focus:outline-none focus:border-gray-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-300"
            >
              ✕
            </button>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-1.5 pl-1">{filtered.length} Pokémon</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((p) => {
          const isSelected = p.name === selected
          const isDualType = p.type_1 !== p.type_2
          return (
            <button
              key={p.name}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelect(p.name)}
              className={`w-full text-left px-1 py-0 flex items-center gap-1 border-b border-gray-800 transition-colors ${
                isSelected ? 'bg-gray-700' : 'hover:bg-gray-800'
              }`}
            >
              <span className="text-xs text-gray-600 font-mono w-8 flex-shrink-0 text-right">
                {String(p.national_dex_number).padStart(3, '0')}
              </span>
              <span className="flex-1 text-xs font-medium text-white truncate">{p.name}</span>
              <div className="flex gap-1 flex-shrink-0">
                <TypeBadge type={p.type_1} small />
                {isDualType && <TypeBadge type={p.type_2} small />}
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-center text-gray-600 text-sm py-8">No results</p>
        )}
      </div>
    </div>
  )
}
