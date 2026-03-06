import type { BaseStats as BaseStatsType } from '../types/pokemon'

// Bulbapedia stat colors
const STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',              label: 'HP',     color: '#FF5959' },
  { key: 'attack',          label: 'Atk',    color: '#F5AC78' },
  { key: 'defense',         label: 'Def',    color: '#FAE078' },
  { key: 'special_attack',  label: 'Sp.Atk', color: '#9DB7F5' },
  { key: 'special_defense', label: 'Sp.Def', color: '#A7DB8D' },
  { key: 'speed',           label: 'Spd',    color: '#FA92B2' }
]

const MAX_STAT = 255

interface Props {
  stats: BaseStatsType
}

export default function BaseStats({ stats }: Props) {
  const total = Object.values(stats).reduce((sum, v) => sum + v, 0)

  return (
    <div className="space-y-1.5">
      {STAT_CONFIG.map(({ key, label, color }) => {
        const value = stats[key]
        const pct = Math.min((value / MAX_STAT) * 100, 100)
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="w-12 text-right text-xs font-semibold text-gray-500 shrink-0">
              {label}
            </span>
            <span className="w-7 text-right text-xs font-bold text-gray-200 tabular-nums shrink-0">
              {value}
            </span>
            <div className="flex-1 h-2.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-700 mt-1">
        <span className="w-12 text-right text-xs font-semibold text-gray-500 shrink-0">Total</span>
        <span className="w-7 text-right text-xs font-bold text-white tabular-nums shrink-0">{total}</span>
      </div>
    </div>
  )
}
