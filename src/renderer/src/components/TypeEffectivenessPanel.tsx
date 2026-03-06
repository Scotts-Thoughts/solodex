import { getPokemonDefenseMatchups } from '../data'
import { TYPE_COLORS } from './TypeBadge'

const GROUPS = [
  { label: 'Weak',    value: 4,    multiplierLabel: '×4', bg: '#7f1d1d', text: '#fca5a5' },
  { label: 'Weak',    value: 2,    multiplierLabel: '×2', bg: '#451a03', text: '#fdba74' },
  { label: 'Resists', value: 0.5,  multiplierLabel: '½×', bg: '#14532d', text: '#86efac' },
  { label: 'Resists', value: 0.25, multiplierLabel: '¼×', bg: '#1e3a5f', text: '#93c5fd' },
  { label: 'Immune',  value: 0,    multiplierLabel: '0×', bg: '#1f2937', text: '#9ca3af' },
]

interface Props {
  type1: string
  type2: string
  game: string
}

export default function TypeEffectivenessPanel({ type1, type2, game }: Props) {
  const matchups = getPokemonDefenseMatchups(type1, type2, game)

  const rows = GROUPS.flatMap(group => {
    const types = Object.entries(matchups)
      .filter(([, v]) => v === group.value)
      .map(([t]) => t)
    if (types.length === 0) return []
    return [{ ...group, types }]
  })

  if (rows.length === 0) return null

  return (
    <div>
      {rows.map((group, gi) => (
        <div key={group.value} className={gi > 0 ? 'mt-2 pt-2 border-t border-gray-800' : ''}>
          {group.types.map(type => {
            const typeColor = TYPE_COLORS[type] ?? '#6B7280'
            return (
              <div key={type} className="flex items-center gap-2 py-0.5">
                {/* Type name — fixed width so all names line up */}
                <span
                  style={{
                    backgroundColor: typeColor,
                    color: '#fff',
                    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                    width: '72px',
                    flexShrink: 0,
                  }}
                  className="text-xs font-bold text-center rounded py-0.5"
                >
                  {type}
                </span>

                {/* Multiplier badge — fixed width so all multipliers line up */}
                <span
                  style={{
                    backgroundColor: group.bg,
                    color: group.text,
                    width: '28px',
                    flexShrink: 0,
                  }}
                  className="text-xs font-bold text-center rounded py-0.5"
                >
                  {group.multiplierLabel}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
