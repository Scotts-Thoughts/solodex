import { useMemo, useState } from 'react'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import { GAME_TO_GEN, isMoveNewInGen, getMovesForGen } from '../data'

type Category = 'All' | 'Physical' | 'Special' | 'Status'

interface Props {
  selectedGame: string
}

export default function MovedexView({ selectedGame }: Props) {
  const gen = GAME_TO_GEN[selectedGame]

  const allMoves = useMemo(() => {
    if (!gen) return []
    return getMovesForGen(gen)
  }, [gen])

  const [typeFilter, setTypeFilter] = useState<string>('All')
  const [categoryFilter, setCategoryFilter] = useState<Category>('All')
  const [minPower, setMinPower] = useState<string>('')
  const [maxPower, setMaxPower] = useState<string>('')
  const [minAccuracy, setMinAccuracy] = useState<string>('')
  const [maxAccuracy, setMaxAccuracy] = useState<string>('')
  const [minPp, setMinPp] = useState<string>('')
  const [maxPp, setMaxPp] = useState<string>('')
  const [onlyNewInGen, setOnlyNewInGen] = useState(false)

  const filteredMoves = useMemo(() => {
    const minPwr = minPower === '' ? null : Number(minPower)
    const maxPwr = maxPower === '' ? null : Number(maxPower)
    const minAcc = minAccuracy === '' ? null : Number(minAccuracy)
    const maxAcc = maxAccuracy === '' ? null : Number(maxAccuracy)
    const minPP  = minPp === '' ? null : Number(minPp)
    const maxPP  = maxPp === '' ? null : Number(maxPp)

    return allMoves
      .filter(({ name, data }) => {
        if (typeFilter !== 'All' && data.type !== typeFilter) return false
        if (categoryFilter !== 'All' && data.category !== categoryFilter) return false

        if (minPwr !== null && (data.power == null || data.power < minPwr)) return false
        if (maxPwr !== null && (data.power == null || data.power > maxPwr)) return false

        if (minAcc !== null) {
          if (data.accuracy == null) return false
          if (data.accuracy < minAcc) return false
        }
        if (maxAcc !== null) {
          if (data.accuracy == null) return false
          if (data.accuracy > maxAcc) return false
        }

        if (minPP !== null && (data.pp == null || data.pp < minPP)) return false
        if (maxPP !== null && (data.pp == null || data.pp > maxPP)) return false

        if (onlyNewInGen && gen) {
          if (!isMoveNewInGen(name, gen)) return false
        }

        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allMoves, typeFilter, categoryFilter, minPower, maxPower, minAccuracy, maxAccuracy, minPp, maxPp, onlyNewInGen, gen])

  const TYPES = [
    'All',
    'Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock',
    'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass',
    'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy',
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-900">
      {/* Filters */}
      <div className="border-b border-gray-800 px-4 py-3 space-y-3 shrink-0">
        <div className="max-w-2xl mx-auto">
        <div className="flex flex-wrap justify-center gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
            >
              {TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as Category)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
            >
              <option value="All">All</option>
              <option value="Physical">Physical</option>
              <option value="Special">Special</option>
              <option value="Status">Status</option>
            </select>
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-semibold text-gray-500 mb-1">Power</span>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="Min"
                value={minPower}
                onChange={e => setMinPower(e.target.value)}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
              />
              <input
                type="number"
                placeholder="Max"
                value={maxPower}
                onChange={e => setMaxPower(e.target.value)}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-500 mb-1">Accuracy</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={minAccuracy}
                  onChange={e => setMinAccuracy(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={maxAccuracy}
                  onChange={e => setMaxAccuracy(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                />
              </div>
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-500 mb-1">PP</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPp}
                  onChange={e => setMinPp(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPp}
                  onChange={e => setMaxPp(e.target.value)}
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200"
                />
              </div>
            </div>
          </div>
        </div>

        <label className="flex items-center justify-center gap-2 cursor-pointer select-none mt-1 w-full">
          <div
            className={`w-7 h-4 rounded-full transition-colors relative ${onlyNewInGen ? 'bg-blue-500' : 'bg-gray-600'}`}
            onClick={() => setOnlyNewInGen(v => !v)}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${onlyNewInGen ? 'translate-x-3.5' : 'translate-x-0.5'}`}
            />
          </div>
          <span className="text-xs text-gray-300">Newly introduced in this generation</span>
        </label>
        </div>
      </div>

      {/* Results — same pattern as EVs: overflow-auto + scrollbar-hide so mouse wheel works, no visible scrollbar */}
      <div className="flex-1 overflow-auto px-2 scrollbar-hide">
        <div className="w-max mx-auto py-1">
          <table className="text-sm border-separate border-spacing-0 table-auto">
            <colgroup>
              <col style={{ width: '1%' }} />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-12" />
              <col className="w-12" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr className="bg-gray-900 sticky top-0 z-10">
                <th className="py-1 px-1.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">Move</th>
                <th className="py-1 px-1.5 text-left text-xs font-semibold text-gray-500">Type</th>
                <th className="py-1 px-1.5 text-left text-xs font-semibold text-gray-500">Cat</th>
                <th className="py-1 px-1.5 text-right text-xs font-semibold text-gray-500">Pwr</th>
                <th className="py-1 px-1.5 text-right text-xs font-semibold text-gray-500">Acc</th>
                <th className="py-1 px-1.5 text-right text-xs font-semibold text-gray-500">PP</th>
              </tr>
            </thead>
            <tbody>
              {filteredMoves.map(({ name, data }) => (
                <tr
                  key={name}
                  className="border-t border-gray-800 hover:bg-gray-800/60"
                >
                  <td className="py-1 px-1.5 whitespace-nowrap">
                    <WikiPopover name={name} type="move">
                      <span className="text-gray-100 cursor-pointer hover:text-white">
                        {name}
                      </span>
                    </WikiPopover>
                  </td>
                  <td className="py-1 px-1.5 whitespace-nowrap">
                    <TypeBadge type={data.type} small game={selectedGame} />
                  </td>
                  <td className="py-1 px-1.5 whitespace-nowrap text-xs truncate" style={{
                    color: data.category === 'Physical' ? '#fb923c' : data.category === 'Special' ? '#60a5fa' : '#9ca3af',
                  }}>
                    {data.category ?? '—'}
                  </td>
                  <td className="py-1 px-1.5 text-right tabular-nums text-gray-100 whitespace-nowrap">
                    {data.power ?? '—'}
                  </td>
                  <td className="py-1 px-1.5 text-right tabular-nums text-gray-100 whitespace-nowrap">
                    {data.accuracy != null ? data.accuracy : '—'}
                  </td>
                  <td className="py-1 px-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">
                    {data.pp ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredMoves.length === 0 && (
            <div className="py-8 text-center text-gray-500 text-sm">
              No moves match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
