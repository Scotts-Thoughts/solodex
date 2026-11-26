import TypeBadge from '../TypeBadge'
import { displayName } from '../../data'
import { getHomeSpriteUrl } from '../../utils/sprites'
import type { MatchupSide } from '../../utils/damageMatchup'
import { abilityInfo, type SpeedComparison } from '@stp/damage-calc'
import DamageRow, { type RowEdit } from './DamageRow'
import GenderIcon from '../GenderIcon'

export interface EnemySummary {
  species: string
  level: number
  hp: number
  currentHp: number
  type1: string
  type2: string
  nationalDexNumber: number
  /** Display names as stored in the trainer data. */
  itemLabel: string | null
  abilityLabel: string | null
  ability: string | null
  gender?: 'M' | 'F' | null
}

const SPEED_STYLE = {
  faster: { cls: 'text-blue-300 bg-blue-500/15 border-blue-500/40',       text: 'You outspeed' },
  tie:    { cls: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/40', text: 'Speed tie' },
  slower: { cls: 'text-red-300 bg-red-500/15 border-red-500/40',          text: 'You underspeed' },
} as const

function SpeedChip({ speed }: { speed: SpeedComparison }) {
  const s = SPEED_STYLE[speed.order]
  return (
    <span
      className={`text-[10px] font-mono px-1.5 py-px rounded border ${s.cls}`}
      title={`${s.text}: your Speed ${speed.player} vs their ${speed.enemy} (stages, status, items, abilities, weather and badges included; Quick Claw and move priority not)`}
    >
      Spe {speed.enemy}
    </span>
  )
}

export default function MatchupCard({
  enemy,
  speed,
  playerAttacks,
  enemyAttacks,
  playerHp,
  game,
  playerEdit,
  enemyEdit,
  orderLabel = null,
}: {
  enemy: EnemySummary
  speed: SpeedComparison
  playerAttacks: MatchupSide[]
  enemyAttacks: MatchupSide[]
  playerHp: number
  game: string
  playerEdit: (move: string) => RowEdit
  enemyEdit: (move: string) => RowEdit
  /** Where this Pokémon comes in the trainer's send-out order, e.g. "#2 out". */
  orderLabel?: string | null
}) {
  const isDualType = enemy.type1 !== enemy.type2
  const hasPlayerDamage = playerAttacks.some(r => r.result.max > 0 || r.result.kind === 'ohko')
  const hasEnemyDamage = enemyAttacks.some(r => r.result.max > 0 || r.result.kind === 'ohko')
  const ab = abilityInfo(enemy.ability)

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800">
        {orderLabel && (
          <span className="text-[10px] font-mono text-gray-400 flex-shrink-0 w-10" title="Predicted send-out position against your species' typing">{orderLabel}</span>
        )}
        <img
          src={getHomeSpriteUrl(enemy.species, enemy.nationalDexNumber)}
          alt=""
          className="pokemon-icon-stroke w-7 h-7 flex-shrink-0 object-contain"
          onError={(e) => {
            const fallback = getHomeSpriteUrl('', enemy.nationalDexNumber)
            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
            else e.currentTarget.style.visibility = 'hidden'
          }}
        />
        <span className="text-sm font-semibold text-white">{displayName(enemy.species)}<GenderIcon gender={enemy.gender} className="ml-1" /></span>
        <div className="flex gap-1">
          <TypeBadge type={enemy.type1} small game={game} />
          {isDualType && <TypeBadge type={enemy.type2} small game={game} />}
        </div>
        <span className="text-xs text-gray-400">Lv{enemy.level}</span>
        {enemy.abilityLabel && (
          <span className={`text-[10px] ${ab ? 'text-gray-300' : 'text-gray-500'}`} title={ab?.effect ?? undefined}>{enemy.abilityLabel}</span>
        )}
        {enemy.itemLabel && <span className="text-[10px] text-amber-300/80">{enemy.itemLabel}</span>}
        <span className="ml-auto"><SpeedChip speed={speed} /></span>
        <span className="text-xs text-gray-400">
          {enemy.currentHp < enemy.hp ? `${enemy.currentHp}/${enemy.hp} HP` : `${enemy.hp} HP`}
        </span>
      </div>

      <div className="px-3 py-2 grid grid-cols-2 gap-x-4">
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Your attacks</p>
          {playerAttacks.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No moves selected</p>
          ) : !hasPlayerDamage ? (
            <p className="text-xs text-gray-600 italic">No damaging moves selected</p>
          ) : (
            playerAttacks.map(({ move, result }) => (
              <DamageRow key={move} result={result} game={game} defenderHp={enemy.currentHp} edit={playerEdit(move)} />
            ))
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Their attacks</p>
          {enemyAttacks.length === 0 ? (
            <p className="text-xs text-gray-600 italic">Move data not available</p>
          ) : !hasEnemyDamage ? (
            <p className="text-xs text-gray-600 italic">No damaging moves</p>
          ) : (
            enemyAttacks.map(({ move, result }) => (
              <DamageRow key={move} result={result} game={game} defenderHp={playerHp} edit={enemyEdit(move)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
