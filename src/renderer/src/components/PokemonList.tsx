import { useState, useMemo, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { PokemonListEntry } from '../types/pokemon'
import { getAllPokemon, getGamesForPokemon, getPokemonData, displayName } from '../data'
import TypeBadge from './TypeBadge'
import { POPOVER_Z } from '../constants/ui'
import { getHomeSpriteUrl } from '../utils/sprites'

interface Props {
  selected: string | null
  selectedGame: string
  onSelect: (name: string) => void
  onFilteredChange?: (names: string[]) => void
  onCompare?: (name: string) => void
  onSelfCompare?: (name: string) => void
  onTripleCompare?: (name: string) => void
  comparingWith?: string | null
  width?: number
}

export interface PokemonListHandle {
  getMinWidth: () => number
}

const ALL_TYPES = [
  'Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison',
  'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'
]
const ALL_GROWTH_RATES = ['Erratic', 'Fast', 'Medium Fast', 'Medium Slow', 'Slow', 'Fluctuating']
const GEN_RANGES: [number, number][] = [
  [1, 151], [152, 251], [252, 386], [387, 493],
  [494, 649], [650, 721], [722, 809], [810, 905], [906, 1025],
]

const ALL_EVO_STAGES = [
  { value: 'first',  label: 'First Stage' },
  { value: 'middle', label: 'Middle Stage' },
  { value: 'final',  label: 'Final Stage' },
  { value: 'single', label: 'Single Stage' },
  { value: 'mega',   label: 'Mega Evolution' },
]

const SHOW_TYPES_MIN_WIDTH = 280

function loadFilter<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`filter_${key}`)
    if (v === null) return fallback
    return JSON.parse(v) as T
  } catch { return fallback }
}

function usePersistentState<T>(key: string, fallback: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadFilter(key, fallback))
  useEffect(() => {
    localStorage.setItem(`filter_${key}`, JSON.stringify(value))
  }, [key, value])
  return [value, setValue]
}

const PokemonList = forwardRef<PokemonListHandle, Props>(function PokemonList({ selected, selectedGame, onSelect, onFilteredChange, onCompare, onSelfCompare, onTripleCompare, comparingWith, width }, ref) {
  const [query, setQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; name: string } | null>(null)
  const [filterGen, setFilterGen] = usePersistentState('gen', '')
  const [filterType, setFilterType] = usePersistentState('type', '')
  const [filterGrowth, setFilterGrowth] = usePersistentState('growth', '')
  const [filterStage, setFilterStage] = usePersistentState('stage', '')
  const [showRegionalForms, setShowRegionalForms] = usePersistentState('regionalForms', true)
  const [showMegas, setShowMegas] = usePersistentState('megas', true)
  const [showPikachuVariants, setShowPikachuVariants] = usePersistentState('pikachuVariants', false)
  const [showTotems, setShowTotems] = usePersistentState('totems', false)
  const [showForms, setShowForms] = usePersistentState('forms', true)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useImperativeHandle(ref, () => ({
    getMinWidth: () => 180
  }))

  const allPokemon: PokemonListEntry[] = useMemo(() => getAllPokemon(), [])

  // Look up game-specific types for each Pokemon (types can change between gens)
  const gameTypes = useMemo(() => {
    if (!selectedGame) return new Map<string, { type_1: string; type_2: string }>()
    const map = new Map<string, { type_1: string; type_2: string }>()
    for (const p of allPokemon) {
      const data = getPokemonData(p.name, selectedGame)
      if (data) {
        map.set(p.name, { type_1: data.type_1, type_2: data.type_2 })
      }
    }
    return map
  }, [allPokemon, selectedGame])

  const getTypes = useCallback((p: PokemonListEntry) => {
    return gameTypes.get(p.name) ?? { type_1: p.type_1, type_2: p.type_2 }
  }, [gameTypes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allPokemon.filter((p) => {
      const types = getTypes(p)
      if (q && !(
        p.name.toLowerCase().includes(q) ||
        displayName(p.name).toLowerCase().includes(q) ||
        p.national_dex_number.toString() === q ||
        types.type_1.toLowerCase().includes(q) ||
        types.type_2.toLowerCase().includes(q)
      )) return false
      if (filterGen) {
        const [lo, hi] = GEN_RANGES[Number(filterGen) - 1]
        if (p.national_dex_number < lo || p.national_dex_number > hi) return false
        const gen = Number(filterGen)
        // Exclude forms introduced in later generations
        if (gen < 6 && /^(Mega|Primal) /.test(p.name)) return false
        if (gen < 7 && /^Alolan /.test(p.name)) return false
        if (gen < 8 && /^(Galarian|Hisuian) /.test(p.name)) return false
        if (gen < 9 && (/^Paldean /.test(p.name) || /^Tauros \(Paldea /.test(p.name))) return false
      }
      if (filterType && types.type_1 !== filterType && types.type_2 !== filterType) return false
      if (filterGrowth && p.growth_rate !== filterGrowth) return false
      if (filterStage && p.evolution_stage !== filterStage) return false
      if (!showRegionalForms && (/^(Alolan|Galarian|Hisuian|Paldean) /.test(p.name) || /^Tauros \(Paldea /.test(p.name))) return false
      if (!showMegas && (/^(Mega|Primal) /.test(p.name) || /\(Mega Z\)/.test(p.name))) return false
      if (!showPikachuVariants && /^Pikachu \(/.test(p.name)) return false
      if (!showTotems && /Totem/.test(p.name)) return false
      if (/^Minior \(/.test(p.name)) return false
      if (/^(Pumpkaboo|Gourgeist|Koraidon|Miraidon) \(/.test(p.name)) return false
      if (/^Zygarde \(\d+ Power Construct\)$/.test(p.name)) return false
      if (!showForms && /\(/.test(p.name) && !/^Pikachu \(/.test(p.name) && !/Totem/.test(p.name) && !/\(Mega Z\)/.test(p.name) && !/^Tauros \(Paldea /.test(p.name)) return false
      return true
    })
  }, [query, filterGen, filterType, filterGrowth, filterStage, showRegionalForms, showMegas, showPikachuVariants, showTotems, showForms, allPokemon, getTypes])

  useEffect(() => {
    onFilteredChange?.(filtered.map(p => p.name))
  }, [filtered, onFilteredChange])

  // Scroll selected into view when it changes externally
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  // Close context menu on click elsewhere or Escape
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-700">
      {/* Search */}
      <div className="p-2 border-b border-gray-700">
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
        <div className="flex flex-wrap gap-1 mt-1.5">
          <select
            value={filterGen}
            onChange={(e) => setFilterGen(e.target.value)}
            className={`min-w-0 flex-1 text-[11px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5 focus:outline-none focus:border-gray-500 ${filterGen ? 'text-gray-300' : 'text-gray-500'}`}
          >
            <option value="">Gen</option>
            {GEN_RANGES.map((_, i) => <option key={i + 1} value={i + 1}>Gen {i + 1}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={`min-w-0 flex-1 text-[11px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5 focus:outline-none focus:border-gray-500 ${filterType ? 'text-gray-300' : 'text-gray-500'}`}
          >
            <option value="">Type</option>
            {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterGrowth}
            onChange={(e) => setFilterGrowth(e.target.value)}
            className={`min-w-0 flex-1 text-[11px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5 focus:outline-none focus:border-gray-500 ${filterGrowth ? 'text-gray-300' : 'text-gray-500'}`}
          >
            <option value="">Growth</option>
            {ALL_GROWTH_RATES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className={`min-w-0 flex-1 text-[11px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5 focus:outline-none focus:border-gray-500 ${filterStage ? 'text-gray-300' : 'text-gray-500'}`}
          >
            <option value="">Stage</option>
            {ALL_EVO_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex gap-3 mt-1.5 pl-0.5">
          <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showRegionalForms}
              onChange={(e) => setShowRegionalForms(e.target.checked)}
              className="accent-gray-500 w-3 h-3"
            />
            Regional
          </label>
          <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showMegas}
              onChange={(e) => setShowMegas(e.target.checked)}
              className="accent-gray-500 w-3 h-3"
            />
            Megas
          </label>
          <label className="flex items-center gap-1 text-[11px] text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showForms}
              onChange={(e) => setShowForms(e.target.checked)}
              className="accent-gray-500 w-3 h-3"
            />
            Forms
          </label>
        </div>
        <p className="text-[11px] text-gray-600 mt-1 pl-0.5">{filtered.length} Pokémon</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((p) => {
          const isSelected = p.name === selected
          const types = getTypes(p)
          const isDualType = types.type_1 !== types.type_2
          return (
            <button
              key={p.name}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelect(p.name)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, name: p.name })
              }}
              className={`w-full text-left px-1 py-0 flex items-center gap-1 border-b border-gray-800 transition-colors ${
                isSelected ? 'bg-gray-700' : 'hover:bg-gray-800'
              }`}
            >
              <span className="text-sm text-gray-600 font-mono w-8 flex-shrink-0 text-right">
                {String(p.national_dex_number).padStart(4, '0')}
              </span>
              <img
                src={getHomeSpriteUrl(p.name, p.national_dex_number)}
                alt=""
                className="w-6 h-6 flex-shrink-0 object-contain transition-opacity duration-150"
                style={{ opacity: 0 }}
                onLoad={(e) => { e.currentTarget.style.opacity = '1' }}
                onError={(e) => {
                  const fallback = getHomeSpriteUrl('', p.national_dex_number)
                  if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                  else e.currentTarget.style.visibility = 'hidden'
                }}
              />
              <span className="flex-1 text-sm font-medium text-white truncate">{displayName(p.name)}</span>
              {(!width || width >= SHOW_TYPES_MIN_WIDTH) && (
                <div className="flex gap-1 flex-shrink-0">
                  <TypeBadge type={types.type_1} small game={selectedGame} />
                  {isDualType && <TypeBadge type={types.type_2} small game={selectedGame} />}
                </div>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-center text-gray-600 text-sm py-8">No results</p>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (() => {
        const isSelf = contextMenu.name === selected
        const targetGames = getGamesForPokemon(contextMenu.name)
        const selectedGames = selected ? getGamesForPokemon(selected) : []
        const compareDisabled = isSelf || !selected || !targetGames.includes(selectedGame) || !selectedGames.includes(selectedGame)
        const selfCompareDisabled = targetGames.length <= 1
        const tripleDisabled = !comparingWith || contextMenu.name === selected || contextMenu.name === comparingWith || !targetGames.includes(selectedGame)
        return (
          <div
            style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: POPOVER_Z }}
            className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[220px]"
          >
            <button
              disabled={compareDisabled}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                compareDisabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                if (!compareDisabled) {
                  onCompare?.(contextMenu.name)
                  setContextMenu(null)
                }
              }}
            >
              Compare {selected ?? '…'} to {contextMenu.name}
            </button>
            <button
              disabled={tripleDisabled}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                tripleDisabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                if (!tripleDisabled) {
                  onTripleCompare?.(contextMenu.name)
                  setContextMenu(null)
                }
              }}
            >
              Add {contextMenu.name} to comparison
            </button>
            <button
              disabled={selfCompareDisabled}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                selfCompareDisabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                if (!selfCompareDisabled) {
                  onSelfCompare?.(contextMenu.name)
                  setContextMenu(null)
                }
              }}
            >
              Compare {contextMenu.name} across generations
            </button>
          </div>
        )
      })()}
    </div>
  )
})

export default PokemonList
