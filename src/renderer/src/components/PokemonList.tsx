import { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { PokemonListEntry } from '../types/pokemon'
import { getAllPokemon } from '../data'
import TypeBadge from './TypeBadge'

interface Props {
  selected: string | null
  onSelect: (name: string) => void
  onFilteredChange?: (names: string[]) => void
}

export interface PokemonListHandle {
  getMinWidth: () => number
}

const ALL_TYPES = [
  'Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison',
  'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'
]
const ALL_GROWTH_RATES = ['Fast', 'Medium Fast', 'Medium Slow', 'Slow']
const ALL_EVO_STAGES = [
  { value: 'first',  label: 'First Stage' },
  { value: 'middle', label: 'Middle Stage' },
  { value: 'final',  label: 'Final Stage' },
  { value: 'single', label: 'Single Stage' },
  { value: 'mega',   label: 'Mega Evolution' },
]

const PokemonList = forwardRef<PokemonListHandle, Props>(function PokemonList({ selected, onSelect, onFilteredChange }, ref) {
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterGrowth, setFilterGrowth] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const filterRowRef = useRef<HTMLDivElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    getMinWidth: () => {
      const row = filterRowRef.current
      const container = searchContainerRef.current
      if (!row || !container) return 160
      // scrollWidth reflects the minimum the row can compress to before selects overflow
      const paddingX = container.offsetWidth - container.clientWidth +
        parseFloat(getComputedStyle(container).paddingLeft) +
        parseFloat(getComputedStyle(container).paddingRight)
      return row.scrollWidth + paddingX
    }
  }))

  const allPokemon: PokemonListEntry[] = useMemo(() => getAllPokemon(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allPokemon.filter((p) => {
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        p.national_dex_number.toString() === q ||
        p.type_1.toLowerCase().includes(q) ||
        p.type_2.toLowerCase().includes(q)
      )) return false
      if (filterType && p.type_1 !== filterType && p.type_2 !== filterType) return false
      if (filterGrowth && p.growth_rate !== filterGrowth) return false
      if (filterStage && p.evolution_stage !== filterStage) return false
      return true
    })
  }, [query, filterType, filterGrowth, filterStage, allPokemon])

  useEffect(() => {
    onFilteredChange?.(filtered.map(p => p.name))
  }, [filtered, onFilteredChange])

  // Scroll selected into view when it changes externally
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-700">
      {/* Search */}
      <div ref={searchContainerRef} className="p-3 border-b border-gray-700">
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
        <div ref={filterRowRef} className="flex gap-1.5 mt-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-1 focus:outline-none focus:border-gray-500"
          >
            <option value="">All Types</option>
            {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterGrowth}
            onChange={(e) => setFilterGrowth(e.target.value)}
            className="flex-1 text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-1 focus:outline-none focus:border-gray-500"
          >
            <option value="">All Growth</option>
            {ALL_GROWTH_RATES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="flex-1 text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-1 focus:outline-none focus:border-gray-500"
          >
            <option value="">All Stages</option>
            {ALL_EVO_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
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
              <span className="text-sm text-gray-600 font-mono w-8 flex-shrink-0 text-right">
                {String(p.national_dex_number).padStart(3, '0')}
              </span>
              <span className="flex-1 text-sm font-medium text-white truncate">{p.name}</span>
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
})

export default PokemonList
