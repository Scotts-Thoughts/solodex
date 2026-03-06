import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BaseStats as BaseStatsType } from '../types/pokemon'
import { getPokemonStatRanking, getPokemonTotalRanking } from '../data'
import type { StatRankEntry } from '../data'

const STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',              label: 'HP',     color: '#78C850' },
  { key: 'attack',          label: 'Atk',    color: '#F8D030' },
  { key: 'defense',         label: 'Def',    color: '#F08030' },
  { key: 'special_attack',  label: 'Sp.Atk', color: '#6890F0' },
  { key: 'special_defense', label: 'Sp.Def', color: '#7038F8' },
  { key: 'speed',           label: 'Spd',    color: '#F85888' }
]

const GEN1_STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',             label: 'HP',      color: '#78C850' },
  { key: 'attack',         label: 'Atk',     color: '#F8D030' },
  { key: 'defense',        label: 'Def',     color: '#F08030' },
  { key: 'special_attack', label: 'Special', color: '#6890F0' },
  { key: 'speed',          label: 'Spd',     color: '#F85888' }
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
}

function RankingPopover({ title, statColor, ranking, currentName, anchorRect, onClose }: RankingPopoverProps) {
  const currentRef = useRef<HTMLTableRowElement>(null)

  // Scroll current pokemon to center on mount
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-stat-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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
    >
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: statColor }}>
          {title}
        </p>
      </div>
      <div style={{ height: `${POPOVER_HEIGHT}px`, overflowY: 'auto' }}>
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
                    {name}
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
}

export default function BaseStats({ stats, game, pokemonName }: Props) {
  const isGen1 = game ? GEN1_GAMES.has(game) : false
  const config = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG
  const total = isGen1
    ? stats.hp + stats.attack + stats.defense + stats.special_attack + stats.speed
    : Object.values(stats).reduce((sum, v) => sum + v, 0)

  const [openPopover, setOpenPopover] = useState<{ id: string; title: string; color: string; ranking: StatRankEntry[]; rect: DOMRect } | null>(null)

  const handleStatClick = useCallback((e: React.MouseEvent, key: keyof BaseStatsType, label: string, color: string) => {
    if (!game || !pokemonName) return
    const rect = e.currentTarget.getBoundingClientRect()
    setOpenPopover(prev => prev?.id === key ? null : {
      id: key,
      title: `${label} Ranking — ${game}`,
      color,
      ranking: getPokemonStatRanking(key, game),
      rect,
    })
  }, [game, pokemonName])

  const handleTotalClick = useCallback((e: React.MouseEvent) => {
    if (!game || !pokemonName) return
    const rect = e.currentTarget.getBoundingClientRect()
    setOpenPopover(prev => prev?.id === '__total__' ? null : {
      id: '__total__',
      title: `Total Ranking — ${game}`,
      color: '#94a3b8',
      ranking: getPokemonTotalRanking(game),
      rect,
    })
  }, [game, pokemonName])

  return (
    <>
      <div className="space-y-1.5">
        {config.map(({ key, label, color }) => {
          const value = stats[key]
          const pct = Math.min((value / MAX_STAT) * 100, 100)
          const isOpen = openPopover?.id === key
          return (
            <div
              key={key}
              className="flex items-center gap-2 cursor-pointer rounded"
              onClick={e => handleStatClick(e, key, label, color)}
              title={`Rank all Pokémon by ${label}`}
            >
              <span className="w-12 text-right text-xs font-semibold text-gray-500 shrink-0">
                {label}
              </span>
              <span className="w-7 text-right text-xs font-bold text-gray-200 tabular-nums shrink-0">
                {value}
              </span>
              <div className="flex-1 h-2.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-opacity"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: isOpen ? 1 : 0.85 }}
                />
              </div>
            </div>
          )
        })}
        <div
          className="flex items-center gap-2 pt-1 border-t border-gray-700 mt-1 cursor-pointer rounded"
          onClick={handleTotalClick}
          title="Rank all Pokémon by Base Stat Total"
        >
          <span className="w-12 text-right text-xs font-semibold text-gray-500 shrink-0">Total</span>
          <span
            className="w-7 text-right text-xs font-bold tabular-nums shrink-0"
            style={{ color: openPopover?.id === '__total__' ? '#94a3b8' : '#fff' }}
          >{total}</span>
        </div>
      </div>

      {openPopover && pokemonName && (
        <RankingPopover
          title={openPopover.title}
          statColor={openPopover.color}
          ranking={openPopover.ranking}
          currentName={pokemonName}
          anchorRect={openPopover.rect}
          onClose={() => setOpenPopover(null)}
        />
      )}
    </>
  )
}
