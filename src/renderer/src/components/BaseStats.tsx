import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BaseStats as BaseStatsType } from '../types/pokemon'
import { getPokemonStatRanking, getPokemonTotalRanking, displayName } from '../data'
import type { StatRankEntry } from '../data'

const STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',              label: 'HP',  color: '#78C850' },
  { key: 'attack',          label: 'Atk', color: '#F8D030' },
  { key: 'defense',         label: 'Def', color: '#F08030' },
  { key: 'special_attack',  label: 'SpA', color: '#6890F0' },
  { key: 'special_defense', label: 'SpD', color: '#7038F8' },
  { key: 'speed',           label: 'Spe', color: '#F85888' }
]

const GEN1_STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',             label: 'HP',   color: '#78C850' },
  { key: 'attack',         label: 'Atk', color: '#F8D030' },
  { key: 'defense',        label: 'Def', color: '#F08030' },
  { key: 'special_attack', label: 'Spc', color: '#6890F0' },
  { key: 'speed',          label: 'Spe', color: '#F85888' }
]

const MAX_STAT = 255
const GEN1_GAMES = new Set(['Red and Blue', 'Yellow'])

interface RankingPopoverProps {
  title: string
  statColor: string
  ranking: StatRankEntry[]
  currentName: string
  anchorRect: DOMRect
  onClose: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

function RankingPopover({ title, statColor, ranking, currentName, anchorRect, onClose, onMouseEnter, onMouseLeave }: RankingPopoverProps) {
  const currentRef = useRef<HTMLTableRowElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current
        const target = currentRef.current
        if (container && target) {
          const containerRect = container.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const offsetInScroll = targetRect.top - containerRect.top + container.scrollTop
          container.scrollTop = offsetInScroll - container.clientHeight / 2 + target.clientHeight / 2
        }
      })
    })
  }, [currentName])

  const POPOVER_WIDTH = 260
  const POPOVER_HEIGHT = 400
  const left = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
    ? anchorRect.right + 6
    : anchorRect.left - POPOVER_WIDTH - 6
  const top = Math.min(Math.max(6, anchorRect.top - POPOVER_HEIGHT / 2), window.innerHeight - POPOVER_HEIGHT - 6)

  return createPortal(
    <div
      data-stat-popover
      style={{ position: 'fixed', top, left, zIndex: 9999, width: `${POPOVER_WIDTH}px` }}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl flex flex-col"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: statColor }}>
          {title}
        </p>
      </div>
      <div ref={scrollContainerRef} style={{ height: `${POPOVER_HEIGHT}px`, overflowY: 'auto' }}>
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-left text-gray-500 font-semibold w-8">#</th>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-left text-gray-500 font-semibold">Pokémon</th>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-right text-gray-500 font-semibold w-10">Val</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map(({ name, value, rank }) => {
              const isCurrent = name === currentName
              return (
                <tr
                  key={name}
                  ref={isCurrent ? currentRef : undefined}
                  style={{ backgroundColor: isCurrent ? `${statColor}22` : 'transparent' }}
                >
                  <td className="py-0.5 px-2 tabular-nums text-gray-500">{rank}</td>
                  <td
                    className="py-0.5 px-2 font-medium"
                    style={{ color: isCurrent ? statColor : '#a8b6c2' }}
                  >
                    {displayName(name)}
                  </td>
                  <td className="py-0.5 px-2 tabular-nums text-right text-gray-300">{value}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>,
    document.body
  )
}

interface Props {
  stats: BaseStatsType
  game?: string
  pokemonName?: string
  filteredNames?: string[]
}

export default function BaseStats({ stats, game, pokemonName, filteredNames }: Props) {
  const isGen1 = game ? GEN1_GAMES.has(game) : false
  const config = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG
  const total = isGen1
    ? stats.hp + stats.attack + stats.defense + stats.special_attack + stats.speed
    : Object.values(stats).reduce((sum, v) => sum + v, 0)

  const [openPopover, setOpenPopover] = useState<{ id: string; title: string; color: string; ranking: StatRankEntry[]; rect: DOMRect } | null>(null)
  const [useFilteredComparison, setUseFilteredComparison] = useState(false)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasFilters = filteredNames !== undefined && filteredNames.length > 0

  const handleStatEnter = useCallback((e: React.MouseEvent, key: keyof BaseStatsType, label: string, color: string) => {
    if (!game || !pokemonName) return
    const rect = e.currentTarget.getBoundingClientRect()
    const filter = useFilteredComparison && filteredNames?.length ? new Set(filteredNames) : undefined
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpenPopover({
      id: key,
      title: `${label} Ranking — ${game}`,
      color,
      ranking: getPokemonStatRanking(key, game, filter),
      rect,
    })
  }, [game, pokemonName, useFilteredComparison, filteredNames])

  const handleTotalEnter = useCallback((e: React.MouseEvent) => {
    if (!game || !pokemonName) return
    const rect = e.currentTarget.getBoundingClientRect()
    const filter = useFilteredComparison && filteredNames?.length ? new Set(filteredNames) : undefined
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpenPopover({
      id: '__total__',
      title: `Total Ranking — ${game}`,
      color: '#94a3b8',
      ranking: getPokemonTotalRanking(game, filter),
      rect,
    })
  }, [game, pokemonName, useFilteredComparison, filteredNames])

  const handleStatLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setOpenPopover(null), 200)
  }, [])

  return (
    <>
      {hasFilters && (
        <label className="flex items-center gap-2 mb-2 cursor-pointer select-none">
          <div
            className={`w-7 h-4 rounded-full transition-colors relative ${useFilteredComparison ? 'bg-blue-500' : 'bg-gray-600'}`}
            onClick={() => setUseFilteredComparison(v => !v)}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${useFilteredComparison ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-xs text-gray-400">Use filters for comparison</span>
        </label>
      )}
      <div className="space-y-2">
        {config.map(({ key, label, color }) => {
          const value = stats[key]
          const pct = Math.min((value / MAX_STAT) * 100, 100)
          const isOpen = openPopover?.id === key
          return (
            <div
              key={key}
              className="flex items-center gap-2.5 cursor-pointer rounded"
              onMouseEnter={e => handleStatEnter(e, key, label, color)}
              onMouseLeave={handleStatLeave}
              title={`Rank all Pokémon by ${label}`}
            >
              <span className="w-14 text-right text-sm font-semibold text-gray-500 shrink-0">
                {label}
              </span>
              <span className="w-8 text-right text-sm font-bold text-gray-200 tabular-nums shrink-0">
                {value}
              </span>
              <div className="flex-1 h-3.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-opacity"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: isOpen ? 1 : 0.85 }}
                />
              </div>
            </div>
          )
        })}
        <div
          className="flex items-center gap-2.5 pt-1.5 border-t border-gray-700 mt-1 cursor-pointer rounded"
          onMouseEnter={handleTotalEnter}
          onMouseLeave={handleStatLeave}
          title="Rank all Pokémon by Base Stat Total"
        >
          <span className="w-14 text-right text-sm font-semibold text-gray-500 shrink-0">Total</span>
          <span
            className="w-8 text-right text-sm font-bold tabular-nums shrink-0"
            style={{ color: openPopover?.id === '__total__' ? '#94a3b8' : '#fff' }}
          >{total}</span>
        </div>
      </div>

      {openPopover && pokemonName && (
        <RankingPopover
          key={openPopover.id}
          title={openPopover.title}
          statColor={openPopover.color}
          ranking={openPopover.ranking}
          currentName={pokemonName}
          anchorRect={openPopover.rect}
          onClose={() => setOpenPopover(null)}
          onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current) }}
          onMouseLeave={handleStatLeave}
        />
      )}
    </>
  )
}
