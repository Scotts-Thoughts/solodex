import { useState, useCallback, useRef } from 'react'
import { natures } from '@data/natures'
import { getExportBgColor } from '../utils/exportSettings'
import { buildExportFilename } from '../utils/exportFilename'

interface NatureData {
  nature: string
  index: number
  increased: string | null
  decreased: string | null
  favorite_flavor: string | null
  disliked_flavor: string | null
}

const naturesData = natures as Record<string, NatureData>

const STAT_LABELS: Record<string, string> = {
  attack: 'Attack',
  defense: 'Defense',
  speed: 'Speed',
  specialAttack: 'Special Attack',
  specialDefense: 'Special Defense',
}

// Match the stat colors used in STAT_CONFIG (constants/stats.ts)
const STAT_COLOR: Record<string, string> = {
  attack: '#F8D030',      // Atk — yellow
  defense: '#F08030',     // Def — orange
  speed: '#F85888',       // Spe — pink
  specialAttack: '#6890F0',  // SpA — blue
  specialDefense: '#7038F8', // SpD — purple
}

// Darkened versions for cell backgrounds (25% opacity over dark bg)
const STAT_BG: Record<string, string> = {
  attack: '#3d3312',
  defense: '#3d2412',
  speed: '#3d1522',
  specialAttack: '#1a243d',
  specialDefense: '#1e103d',
}

const FLAVOR_BG: Record<string, string> = {
  spicy: '#3d2412',
  sour: '#333312',
  sweet: '#3d1522',
  dry: '#1a243d',
  bitter: '#1e103d',
}

const naturesList = Object.entries(naturesData).sort((a, b) => a[1].index - b[1].index)

const CELL = 'border border-gray-600 px-2 py-1 text-[13px] whitespace-nowrap'

const STAT_KEYS = ['attack', 'defense', 'speed', 'specialAttack', 'specialDefense'] as const
type StatKey = typeof STAT_KEYS[number]

const SHORT_STAT_LABELS: Record<StatKey, string> = {
  attack: 'Atk',
  defense: 'Def',
  speed: 'Spe',
  specialAttack: 'SpA',
  specialDefense: 'SpD',
}

export default function NaturesView() {
  const tableRef = useRef<HTMLTableElement>(null)
  const [exporting, setExporting] = useState(false)
  const [increaseStat, setIncreaseStat] = useState<StatKey | null>(null)
  const [decreaseStat, setDecreaseStat] = useState<StatKey | null>(null)

  const matchedNature =
    increaseStat && decreaseStat
      ? increaseStat === decreaseStat
        ? naturesList.find(([, d]) => !d.increased && !d.decreased && STAT_BY_INDEX[d.index] === increaseStat)?.[0] ?? null
        : naturesList.find(([, d]) => d.increased === increaseStat && d.decreased === decreaseStat)?.[0] ?? null
      : null

  const handleExport = useCallback(async () => {
    if (!tableRef.current || exporting) return
    setExporting(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(tableRef.current, {
        pixelRatio: 2,
        backgroundColor: getExportBgColor(),
      })
      const link = document.createElement('a')
      link.download = buildExportFilename(null, 'nature_chart')
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [exporting])

  return (
    <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-6 relative">
      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="absolute top-4 right-4 z-20 p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
        title="Export as PNG"
      >
        {exporting ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
      </button>

      {/* Stat selector */}
      <div className="mb-4 flex flex-col gap-2" style={{ width: '680px' }}>
        <StatSelector
          label="Increase"
          selected={increaseStat}
          onSelect={(s) => setIncreaseStat(increaseStat === s ? null : s)}
        />
        <StatSelector
          label="Decrease"
          selected={decreaseStat}
          onSelect={(s) => setDecreaseStat(decreaseStat === s ? null : s)}
        />
      </div>

      <table ref={tableRef} className="border-collapse" style={{ width: '680px', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={`${CELL} bg-gray-800 text-gray-400 font-semibold text-center`} style={{ width: '32px' }}>#</th>
            <th className={`${CELL} bg-gray-800 text-gray-400 font-semibold text-left`}>Nature</th>
            <th className={`${CELL} bg-gray-800 text-gray-400 font-semibold text-center`}>Increased</th>
            <th className={`${CELL} bg-gray-800 text-gray-400 font-semibold text-center`}>Decreased</th>
            <th className={`${CELL} bg-gray-800 text-gray-400 font-semibold text-center`}>Likes</th>
            <th className={`${CELL} bg-gray-800 text-gray-400 font-semibold text-center`}>Dislikes</th>
          </tr>
        </thead>
        <tbody>
          {naturesList.map(([name, data], i) => {
            const isNeutral = !data.increased && !data.decreased
            const isMatched = matchedNature === name
            const rowBg = isMatched ? '#3a3616' : i % 2 === 0 ? '#111827' : '#0d1117'
            return (
              <tr key={name} style={isMatched ? { outline: '2px solid #fbbf24', outlineOffset: '-2px' } : undefined}>
                <td className={`${CELL} text-gray-500 text-center tabular-nums`} style={{ backgroundColor: rowBg }}>{data.index}</td>
                <td className={`${CELL} font-bold text-white`} style={{ backgroundColor: rowBg }}>{name}</td>
                <td className={`${CELL} text-center`} style={{ backgroundColor: data.increased ? STAT_BG[data.increased] : rowBg, color: data.increased ? STAT_COLOR[data.increased] : isNeutral ? STAT_COLOR[STAT_BY_INDEX[data.index]] : '#9ca3af' }}>
                  {data.increased ? STAT_LABELS[data.increased] : isNeutral ? STAT_LABELS[STAT_BY_INDEX[data.index]] : '—'}
                </td>
                <td className={`${CELL} text-center`} style={{ backgroundColor: data.decreased ? STAT_BG[data.decreased] : rowBg, color: data.decreased ? STAT_COLOR[data.decreased] : isNeutral ? STAT_COLOR[STAT_BY_INDEX[data.index]] : '#9ca3af' }}>
                  {data.decreased ? STAT_LABELS[data.decreased] : isNeutral ? STAT_LABELS[STAT_BY_INDEX[data.index]] : '—'}
                </td>
                <td className={`${CELL} text-center text-gray-200 capitalize`} style={{ backgroundColor: data.favorite_flavor ? FLAVOR_BG[data.favorite_flavor] : rowBg }}>
                  {data.favorite_flavor ?? (isNeutral ? neutralFlavor(data.index) : '—')}
                </td>
                <td className={`${CELL} text-center text-gray-200 capitalize`} style={{ backgroundColor: data.disliked_flavor ? FLAVOR_BG[data.disliked_flavor] : rowBg }}>
                  {data.disliked_flavor ?? (isNeutral ? neutralFlavor(data.index) : '—')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Neutral natures map to a stat on the diagonal: index 0→atk, 6→def, 12→spd, 18→spa, 24→spd
const STAT_BY_INDEX: Record<number, string> = {
  0: 'attack',
  6: 'defense',
  12: 'speed',
  18: 'specialAttack',
  24: 'specialDefense',
}

const FLAVOR_BY_INDEX: Record<number, string> = {
  0: 'spicy',
  6: 'sour',
  12: 'sweet',
  18: 'dry',
  24: 'bitter',
}

function neutralFlavor(index: number): string {
  return FLAVOR_BY_INDEX[index] ?? '—'
}

interface StatSelectorProps {
  label: string
  selected: StatKey | null
  onSelect: (stat: StatKey) => void
}

function StatSelector({ label, selected, onSelect }: StatSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 text-[13px] font-semibold w-20 shrink-0">{label}:</span>
      <div className="flex gap-1.5 flex-1">
        {STAT_KEYS.map((stat) => {
          const isSelected = selected === stat
          return (
            <button
              key={stat}
              onClick={() => onSelect(stat)}
              className="flex-1 px-2 py-1.5 rounded text-[12px] font-semibold border transition-colors"
              style={{
                backgroundColor: isSelected ? STAT_BG[stat] : '#111827',
                borderColor: isSelected ? STAT_COLOR[stat] : '#374151',
                color: isSelected ? STAT_COLOR[stat] : '#9ca3af',
              }}
            >
              {SHORT_STAT_LABELS[stat]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
