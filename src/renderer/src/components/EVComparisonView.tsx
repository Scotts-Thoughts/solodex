import { useState, useMemo, useCallback, useEffect } from 'react'
import type { PokemonData } from '../types/pokemon'
import type { BaseStats as BaseStatsType } from '../types/pokemon'
import { getAllPokemonForGame, displayName } from '../data'
import { FORM_SPRITE_IDS } from '../data/formSprites'

const POKEMON_SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

const EV_COLUMNS: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',              label: 'HP',  color: '#78C850' },
  { key: 'attack',          label: 'Atk', color: '#F8D030' },
  { key: 'defense',         label: 'Def', color: '#F08030' },
  { key: 'special_attack',  label: 'SpA', color: '#6890F0' },
  { key: 'special_defense', label: 'SpD', color: '#7038F8' },
  { key: 'speed',           label: 'Spe', color: '#F85888' },
]

const GEN1_EV_COLUMNS: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',             label: 'HP',  color: '#78C850' },
  { key: 'attack',         label: 'Atk', color: '#F8D030' },
  { key: 'defense',        label: 'Def', color: '#F08030' },
  { key: 'special_attack', label: 'Spc', color: '#6890F0' },
  { key: 'speed',          label: 'Spe', color: '#F85888' },
]

const GEN1_GAMES = new Set(['Red and Blue', 'Yellow'])

/** National dex ranges by generation (inclusive). */
const GEN_RANGES: { gen: number; min: number; max: number }[] = [
  { gen: 1, min: 1, max: 151 },
  { gen: 2, min: 152, max: 251 },
  { gen: 3, min: 252, max: 386 },
  { gen: 4, min: 387, max: 493 },
  { gen: 5, min: 494, max: 649 },
  { gen: 6, min: 650, max: 721 },
  { gen: 7, min: 722, max: 809 },
  { gen: 8, min: 810, max: 905 },
  { gen: 9, min: 906, max: 1025 },
]

const TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
]

function getSpriteUrl(species: string, nationalDexNumber: number): string {
  const id = FORM_SPRITE_IDS[species] ?? nationalDexNumber
  return `${POKEMON_SPRITE_BASE}/${id}.png`
}

interface Props {
  selectedGame: string
  onSelectPokemon?: (name: string) => void
}

export default function EVComparisonView({ selectedGame, onSelectPokemon }: Props) {
  type SortKey = keyof BaseStatsType | null
  const [sort, setSort] = useState<{ by: SortKey; dir: 'asc' | 'desc' }>({ by: null, dir: 'asc' })
  const [filterGen, setFilterGen] = useState<number | 'all'>('all')
  const [filterType, setFilterType] = useState<string | 'all'>('all')
  const [filterEvMin, setFilterEvMin] = useState<1 | 2 | 3 | 'all'>('all')

  const sortBy = sort.by
  const sortDir = sort.dir

  const isGen1 = GEN1_GAMES.has(selectedGame)
  const columns = isGen1 ? GEN1_EV_COLUMNS : EV_COLUMNS

  const list = useMemo(
    () => getAllPokemonForGame(selectedGame),
    [selectedGame]
  )

  // Which generations and types actually exist in this game's Pokédex
  const availableGens = useMemo(() => {
    const set = new Set<number>()
    for (const p of list) {
      for (const { gen, min, max } of GEN_RANGES) {
        if (p.national_dex_number >= min && p.national_dex_number <= max) {
          set.add(gen)
        }
      }
    }
    return set
  }, [list])

  const availableTypes = useMemo(() => {
    const set = new Set<string>()
    for (const p of list) {
      if (p.type_1) set.add(p.type_1)
      if (p.type_2) set.add(p.type_2)
    }
    return set
  }, [list])

  // If current filters become invalid for the selected game, reset them to "All"
  useEffect(() => {
    if (filterGen !== 'all') {
      const range = GEN_RANGES.find(r => r.gen === filterGen)
      const hasAnyInGen = !!range && list.some(p => p.national_dex_number >= range.min && p.national_dex_number <= range.max)
      if (!hasAnyInGen) setFilterGen('all')
    }
    if (filterType !== 'all') {
      const hasAnyOfType = list.some(p => p.type_1 === filterType || p.type_2 === filterType)
      if (!hasAnyOfType) setFilterType('all')
    }
  }, [list])

  const filteredList = useMemo(() => {
    return list.filter((p) => {
      if (filterGen !== 'all') {
        const range = GEN_RANGES.find((r) => r.gen === filterGen)
        if (!range || p.national_dex_number < range.min || p.national_dex_number > range.max) return false
      }
      if (filterType !== 'all') {
        if (p.type_1 !== filterType && p.type_2 !== filterType) return false
      }
      if (filterEvMin !== 'all') {
        const maxEv = Math.max(
          p.ev_yield.hp ?? 0,
          p.ev_yield.attack ?? 0,
          p.ev_yield.defense ?? 0,
          p.ev_yield.special_attack ?? 0,
          p.ev_yield.special_defense ?? 0,
          p.ev_yield.speed ?? 0
        )
        if (maxEv < filterEvMin) return false
      }
      return true
    })
  }, [list, filterGen, filterType, filterEvMin])

  const sortedList = useMemo(() => {
    if (!sortBy) {
      const cmp = sortDir === 'desc'
        ? (a: PokemonData, b: PokemonData) => b.national_dex_number - a.national_dex_number
        : (a: PokemonData, b: PokemonData) => a.national_dex_number - b.national_dex_number
      return [...filteredList].sort(cmp)
    }
    return [...filteredList].sort((a, b) => {
      const va = a.ev_yield[sortBy] ?? 0
      const vb = b.ev_yield[sortBy] ?? 0
      if (va !== vb) return sortDir === 'desc' ? vb - va : va - vb
      return a.national_dex_number - b.national_dex_number
    })
  }, [filteredList, sortBy, sortDir])

  const handleStatHeaderClick = useCallback((key: keyof BaseStatsType) => {
    setSort(prev => {
      if (prev.by === key) {
        return { ...prev, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      }
      return { by: key, dir: 'desc' }
    })
  }, [])

  const handleSortByDex = useCallback(() => {
    setSort(prev => {
      if (prev.by === null) {
        return { ...prev, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      }
      return { by: null, dir: 'asc' }
    })
  }, [])

  const TH = 'sticky top-0 bg-gray-900 z-10 py-1.5 px-1 text-sm font-semibold cursor-pointer select-none hover:bg-gray-800 transition-colors border-b border-gray-700'

  // Fixed total width: #(28) + sprite(36) + Pokémon(100) + 6 stat cols(32 each) = 356px
  const tableWidth = 356
  const spriteColWidth = 36

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-900">
      {/* Filters - match Movedex / Pokedex styling */}
      <div className="border-b border-gray-800 px-4 py-3 space-y-2 shrink-0">
        <div className="flex flex-wrap gap-3 items-end justify-center text-center">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Generation</label>
            <select
              value={filterGen}
              onChange={(e) => setFilterGen(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-gray-500"
            >
              <option value="all">All</option>
              {GEN_RANGES.map(({ gen }) => {
                const enabled = availableGens.has(gen)
                return (
                  <option
                    key={gen}
                    value={gen}
                    disabled={!enabled}
                  >
                    Gen {gen}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 min-w-[96px] focus:outline-none focus:border-gray-500"
            >
              <option value="all">All</option>
              {TYPES.map((t) => {
                const enabled = availableTypes.has(t)
                return (
                  <option
                    key={t}
                    value={t}
                    disabled={!enabled}
                  >
                    {t}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">EV yield</label>
            <select
              value={filterEvMin}
              onChange={(e) => setFilterEvMin(e.target.value === 'all' ? 'all' : Number(e.target.value) as 1 | 2 | 3)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-gray-500"
            >
              <option value="all">All</option>
              <option value={1}>≥ 1</option>
              <option value={2}>≥ 2</option>
              <option value={3}>≥ 3</option>
            </select>
          </div>

          <div className="text-xs text-gray-500">
            {sortedList.length} of {list.length}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-2 scrollbar-hide">
        <div className="mx-auto" style={{ width: `min(100%, ${tableWidth}px)` }}>
          <table
            className="text-base table-fixed border-separate border-spacing-0"
            style={{ width: `${tableWidth}px` }}
          >
            <thead>
              <tr>
              <th
                className={`${TH} text-left`}
                style={{ width: 28 }}
                onClick={handleSortByDex}
                title="Sort by Pokedex number (click again to reverse)"
              >
                <span className="inline-flex items-center gap-0.5">
                  #
                  {sortBy === null && <span className="text-gray-500 text-sm">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                </span>
              </th>
              <th className={`${TH} text-center`} style={{ width: spriteColWidth }} aria-label="Sprite" />
              <th
                className={`${TH} text-left`}
                style={{ width: 100 }}
                onClick={handleSortByDex}
                title="Sort by Pokedex number (click again to reverse)"
              >
                <span className="inline-flex items-center gap-0.5">
                  Pokémon
                  {sortBy === null && <span className="text-gray-500 text-sm">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                </span>
              </th>
              {columns.map(({ key, label, color }) => (
                <th
                  key={key}
                  className={`${TH} text-right tabular-nums`}
                  style={{ color, width: 32 }}
                  onClick={() => handleStatHeaderClick(key)}
                  title={`Sort by ${label} EV (click: high first, again: low first)`}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {label}
                    {sortBy === key && (
                      <span className="text-gray-500 text-sm">
                        {sortDir === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedList.map((p: PokemonData) => (
              <tr
                key={p.species}
                className={`border-b border-gray-800 ${onSelectPokemon ? 'cursor-pointer hover:bg-gray-800/70' : ''}`}
                onClick={() => onSelectPokemon?.(p.species)}
              >
                <td className="py-0.5 px-1 text-gray-500 tabular-nums font-mono text-sm" style={{ width: 28 }}>
                  {p.national_dex_number}
                </td>
                <td className="py-0.5 px-1 text-center align-middle" style={{ width: spriteColWidth }}>
                  <img
                    src={getSpriteUrl(p.species, p.national_dex_number)}
                    alt=""
                    className="w-8 h-8 object-contain inline-block"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </td>
                <td className="py-0.5 px-1 font-medium text-white truncate" style={{ width: 100 }}>
                  {displayName(p.species)}
                </td>
                {columns.map(({ key, color }) => (
                  <td
                    key={key}
                    className="py-0.5 px-1 text-right tabular-nums text-gray-300"
                    style={{ width: 32, color: (p.ev_yield[key] ?? 0) > 0 ? color : undefined }}
                  >
                    {p.ev_yield[key] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
