import type { PokemonData, MoveData } from '../types/pokemon'
import { getMoveData } from '../data'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'

interface MoveRowProps {
  moveName: string
  game: string
  prefix?: string
}

function MoveRow({ moveName, game, prefix }: MoveRowProps) {
  const move: MoveData | null = getMoveData(moveName, game)

  return (
    <tr
      className="border-b border-gray-800"
      style={{ backgroundColor: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1f2937')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <td className="py-0 px-1 text-xs text-gray-500 w-8 tabular-nums shrink-0">{prefix ?? ''}</td>
      <td className="py-0 px-1 text-xs font-medium text-white whitespace-nowrap">
        <WikiPopover name={moveName} type="move">
          {moveName}
        </WikiPopover>
      </td>
      <td className="py-0 px-1">
        {move ? <TypeBadge type={move.type} small game={game} /> : <span className="text-gray-600 text-xs">—</span>}
      </td>
      <td className="py-0 px-1 text-xs text-gray-500">{move?.category ?? '—'}</td>
      <td className="py-0 px-1 text-xs text-gray-300 tabular-nums text-right">{move?.power ?? '—'}</td>
      <td className="py-0 px-1 text-xs text-gray-300 tabular-nums text-right">
        {move?.accuracy != null ? `${move.accuracy}` : '—'}
      </td>
      <td className="py-0 px-1 text-xs text-gray-300 tabular-nums text-right">{move?.pp ?? '—'}</td>
    </tr>
  )
}

const TH = 'sticky top-0 bg-gray-900 z-10 py-1 px-1 text-xs text-gray-600 font-semibold'

const TABLE_HEADER = (
  <thead>
    <tr>
      <th className={`${TH} text-left w-8`}>Lv</th>
      <th className={`${TH} text-left`}>Move</th>
      <th className={`${TH} text-left`}>Type</th>
      <th className={`${TH} text-left`}>Cat</th>
      <th className={`${TH} text-right`}>Pwr</th>
      <th className={`${TH} text-right`}>Acc</th>
      <th className={`${TH} text-right`}>PP</th>
    </tr>
  </thead>
)

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <tr>
      <td colSpan={7} className="pt-3 pb-1 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
          <span className="text-xs text-gray-600">({count})</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>
      </td>
    </tr>
  )
}

interface MoveTableProps {
  pokemon: PokemonData
  game: string
}

function LevelTable({ pokemon, game }: MoveTableProps) {
  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      {TABLE_HEADER}
      <tbody>
        {pokemon.level_up_learnset.map(([level, moveName], i) => (
          <MoveRow key={i} moveName={moveName} game={game} prefix={String(level)} />
        ))}
      </tbody>
    </table>
  )
}

function TmHmTable({ pokemon, game }: MoveTableProps) {
  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      {TABLE_HEADER}
      <tbody>
        {pokemon.tm_hm_learnset.map((moveName, i) => (
          <MoveRow key={i} moveName={moveName} game={game} />
        ))}
      </tbody>
    </table>
  )
}

interface Props {
  pokemon: PokemonData
  game: string
}

export default function Movepool({ pokemon, game }: Props) {
  const hasLevel = pokemon.level_up_learnset.length > 0
  const hasTmHm  = pokemon.tm_hm_learnset.length > 0
  const hasTutor = pokemon.tutor_learnset.length > 0
  const hasEgg   = pokemon.egg_moves.length > 0

  if (!hasLevel && !hasTmHm && !hasTutor && !hasEgg) {
    return <p className="text-gray-600 text-xs py-2">No move data available.</p>
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Level-up and TM/HM side by side */}
      {(hasLevel || hasTmHm) && (
        <div className="flex gap-4 items-start">
          {hasLevel && (
            <div className="flex-1 min-w-0">
              <LevelTable pokemon={pokemon} game={game} />
            </div>
          )}
          {hasTmHm && (
            <div className="flex-1 min-w-0">
              <TmHmTable pokemon={pokemon} game={game} />
            </div>
          )}
        </div>
      )}

      {/* Tutor and Egg moves below, also side by side if both present */}
      {(hasTutor || hasEgg) && (
        <div className="flex gap-4 items-start">
          {hasTutor && (
            <div className="flex-1 min-w-0">
              <table className="w-full text-sm border-separate border-spacing-0">
                {TABLE_HEADER}
                <tbody>
                  <SectionHeader label="Move Tutor" count={pokemon.tutor_learnset.length} />
                  {pokemon.tutor_learnset.map((moveName, i) => (
                    <MoveRow key={i} moveName={moveName} game={game} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasEgg && (
            <div className="flex-1 min-w-0">
              <table className="w-full text-sm border-separate border-spacing-0">
                {TABLE_HEADER}
                <tbody>
                  <SectionHeader label="Egg Moves" count={pokemon.egg_moves.length} />
                  {pokemon.egg_moves.map((moveName, i) => (
                    <MoveRow key={i} moveName={moveName} game={game} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
