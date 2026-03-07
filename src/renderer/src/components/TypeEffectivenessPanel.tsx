import { getPokemonDefenseMatchups } from '../data'
import { TYPE_COLORS } from './TypeBadge'

const GROUPS = [
  { label: 'Weak',    value: 4,    multiplierLabel: '×4', bg: '#7f1d1d', text: '#fca5a5' },
  { label: 'Weak',    value: 2,    multiplierLabel: '×2', bg: '#451a03', text: '#fdba74' },
  { label: 'Resists', value: 0.5,  multiplierLabel: '½×', bg: '#14532d', text: '#86efac' },
  { label: 'Resists', value: 0.25, multiplierLabel: '¼×', bg: '#1e3a5f', text: '#93c5fd' },
  { label: 'Immune',  value: 0,    multiplierLabel: '0×', bg: '#1f2937', text: '#9ca3af' },
]

// Abilities that grant complete immunity to a type
const ABILITY_IMMUNITIES: Record<string, string> = {
  'Levitate':        'Ground',
  'Flash Fire':      'Fire',
  'Water Absorb':    'Water',
  'Dry Skin':        'Water',
  'Storm Drain':     'Water',
  'Volt Absorb':     'Electric',
  'Motor Drive':     'Electric',
  'Lightning Rod':   'Electric',
  'Sap Sipper':      'Grass',
  'Earth Eater':     'Ground',
  'Well-Baked Body': 'Fire',
  'Wind Rider':      'Flying',
}

interface Props {
  type1: string
  type2: string
  game: string
  abilities: string[]
}

export default function TypeEffectivenessPanel({ type1, type2, game, abilities }: Props) {
  const matchups = getPokemonDefenseMatchups(type1, type2, game)

  // Map from type → ability name for abilities this pokemon has that grant immunity
  const abilityImmunityMap: Record<string, string> = {}
  for (const ability of abilities) {
    const immuneType = ABILITY_IMMUNITIES[ability]
    if (immuneType) abilityImmunityMap[immuneType] = ability
  }

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
            const immunityAbility = abilityImmunityMap[type]
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

                {/* Ability immunity hint */}
                {immunityAbility && (
                  <span className="text-xs text-gray-500 italic">
                    ({immunityAbility})
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
