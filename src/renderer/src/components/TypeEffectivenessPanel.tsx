import { getPokemonDefenseMatchups } from '../data'
import TypeBadge from './TypeBadge'
import { EFF_GROUPS, ABILITY_IMMUNITIES } from '../constants/effectiveness'

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

  const rows = EFF_GROUPS.flatMap(group => {
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
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {group.types.map(type => {
              const immunityAbility = abilityImmunityMap[type]
              return (
                <div key={type} className="flex items-center gap-1">
                  <TypeBadge type={type} game={game} small />

                  {/* Multiplier badge */}
                  <span
                    style={{
                      backgroundColor: group.bg,
                      color: group.text,
                    }}
                    className="text-xs font-bold text-center rounded py-0.5 w-7 shrink-0"
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
        </div>
      ))}
    </div>
  )
}
