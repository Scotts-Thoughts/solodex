import { useMemo } from 'react'
import type { PokemonData, MoveData } from '../types/pokemon'
import { getMoveData, getTmHmCode } from '../data'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TmPopover from './TmPopover'

export interface GenGameData {
  game: string
  abbrev: string
  color: string
  pokemon: PokemonData
}

interface RowData {
  moveName: string
  sortKey: number
  prefix: string
  gameTags: { abbrev: string; color: string }[]
}

function buildLevelUpRows(genData: GenGameData[]): RowData[] {
  const total = genData.length
  // Key by (level, moveName) so duplicate-level entries (e.g. RB [1,Confusion] and [16,Confusion]) are separate rows
  const map = new Map<string, { level: number; moveName: string; games: Set<string> }>()
  for (const { game, pokemon } of genData) {
    for (const [level, moveName] of pokemon.level_up_learnset) {
      const key = `${level}:${moveName}`
      if (!map.has(key)) map.set(key, { level, moveName, games: new Set() })
      map.get(key)!.games.add(game)
    }
  }

  return Array.from(map.values())
    .map(({ level, moveName, games }) => {
      const allGames = games.size === total
      const gameTags = allGames
        ? []
        : genData.filter(gd => games.has(gd.game)).map(gd => ({ abbrev: gd.abbrev, color: gd.color }))
      return { moveName, sortKey: level, prefix: String(level), gameTags }
    })
    .sort((a, b) => a.sortKey - b.sortKey || a.moveName.localeCompare(b.moveName))
}

function buildSimpleRows(genData: GenGameData[], getList: (p: PokemonData) => string[]): RowData[] {
  const total = genData.length
  const moveGames = new Map<string, string[]>()
  for (const { game, pokemon } of genData) {
    for (const moveName of getList(pokemon)) {
      if (!moveGames.has(moveName)) moveGames.set(moveName, [])
      moveGames.get(moveName)!.push(game)
    }
  }

  return Array.from(moveGames.entries()).map(([moveName, games]) => {
    const allGames = games.length === total
    const gameTags = allGames
      ? []
      : genData.filter(gd => games.includes(gd.game)).map(gd => ({ abbrev: gd.abbrev, color: gd.color }))
    return { moveName, sortKey: 0, prefix: '', gameTags }
  })
}

function singleLevelRows(pokemon: PokemonData): RowData[] {
  return pokemon.level_up_learnset.map(([level, moveName]) => ({
    moveName, sortKey: level, prefix: String(level), gameTags: [] as { abbrev: string; color: string }[],
  }))
}

function singleSimpleRows(moves: string[]): RowData[] {
  return moves.map(moveName => ({ moveName, sortKey: 0, prefix: '', gameTags: [] }))
}

const TH = 'sticky top-0 bg-gray-900 z-10 py-1 px-1 text-xs text-gray-600 font-semibold'

const TABLE_HEADER = (
  <thead>
    <tr>
      <th className={`${TH} text-left w-10`}>Lv</th>
      <th className={`${TH} text-left`}>Move</th>
      <th className={`${TH} text-left`}>Type</th>
      <th className={`${TH} text-left`}>Cat</th>
      <th className={`${TH} text-right`}>Pwr</th>
      <th className={`${TH} text-right`}>Acc</th>
      <th className={`${TH} text-right`}>PP</th>
    </tr>
  </thead>
)

function GameTag({ abbrev, color }: { abbrev: string; color: string }) {
  return (
    <span
      style={{ color, border: `1px solid ${color}60`, fontSize: '9px' }}
      className="inline-block px-1 rounded font-bold leading-4 tracking-wide"
    >
      {abbrev}
    </span>
  )
}

function MoveRow({ row, game }: { row: RowData; game: string }) {
  const move: MoveData | null = getMoveData(row.moveName, game)
  const isTmRow = row.prefix.startsWith('TM') || row.prefix.startsWith('HM')

  return (
    <tr
      className="border-b border-gray-800"
      style={{ backgroundColor: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1f29')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <td className="py-0 px-1 text-xs text-gray-500 w-10 tabular-nums shrink-0">
        {isTmRow
          ? <TmPopover tmCode={row.prefix} game={game}>{row.prefix}</TmPopover>
          : (row.prefix || '')}
      </td>
      <td className="py-0 px-1 text-xs font-medium text-white">
        <span className="flex items-center gap-1 flex-wrap">
          <WikiPopover name={row.moveName} type="move">
            {row.moveName}
          </WikiPopover>
          {row.gameTags.map(t => <GameTag key={t.abbrev} abbrev={t.abbrev} color={t.color} />)}
        </span>
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

interface Props {
  pokemon: PokemonData
  game: string
  genData: GenGameData[]
}

export default function Movepool({ pokemon, game, genData }: Props) {
  const multi = genData.length > 1

  const levelRows = useMemo(
    () => multi ? buildLevelUpRows(genData) : singleLevelRows(pokemon),
    [multi, genData, pokemon]
  )

  const tmHmRows = useMemo(() => {
    const rows = multi
      ? buildSimpleRows(genData, p => p.tm_hm_learnset)
      : singleSimpleRows(pokemon.tm_hm_learnset)
    return rows
      .map(row => ({ ...row, prefix: getTmHmCode(row.moveName, game) ?? '' }))
      .sort((a, b) => {
        const aIsHm = a.prefix.startsWith('HM')
        const bIsHm = b.prefix.startsWith('HM')
        if (aIsHm !== bIsHm) return aIsHm ? 1 : -1
        return parseInt(a.prefix.slice(2) || '0') - parseInt(b.prefix.slice(2) || '0')
      })
  }, [multi, genData, pokemon, game])

  const tutorRows = useMemo(
    () => multi ? buildSimpleRows(genData, p => p.tutor_learnset) : singleSimpleRows(pokemon.tutor_learnset),
    [multi, genData, pokemon]
  )

  const eggRows = useMemo(
    () => multi ? buildSimpleRows(genData, p => p.egg_moves) : singleSimpleRows(pokemon.egg_moves),
    [multi, genData, pokemon]
  )

  const hasLevel = levelRows.length > 0
  const hasTmHm  = tmHmRows.length > 0
  const hasTutor = tutorRows.length > 0
  const hasEgg   = eggRows.length > 0

  if (!hasLevel && !hasTmHm && !hasTutor && !hasEgg) {
    return <p className="text-gray-600 text-xs py-2">No move data available.</p>
  }

  return (
    <div className="flex flex-col gap-3">

      {(hasLevel || hasTmHm) && (
        <div className="flex gap-10 items-start">
          {hasLevel && (
            <div className="flex-1 min-w-[300px]">
              <table className="w-full text-sm border-separate border-spacing-0">
                {TABLE_HEADER}
                <tbody>
                  {levelRows.map((row, i) => <MoveRow key={i} row={row} game={game} />)}
                </tbody>
              </table>
            </div>
          )}
          {hasTmHm && (
            <div className="flex-1 min-w-[300px]">
              <table className="w-full text-sm border-separate border-spacing-0">
                {TABLE_HEADER}
                <tbody>
                  {tmHmRows.map((row, i) => <MoveRow key={i} row={row} game={game} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(hasTutor || hasEgg) && (
        <div className="flex gap-4 items-start">
          {hasTutor && (
            <div className="flex-1 min-w-[300px]">
              <table className="w-full text-sm border-separate border-spacing-0">
                {TABLE_HEADER}
                <tbody>
                  <SectionHeader label="Move Tutor" count={tutorRows.length} />
                  {tutorRows.map((row, i) => <MoveRow key={i} row={row} game={game} />)}
                </tbody>
              </table>
            </div>
          )}
          {hasEgg && (
            <div className="flex-1 min-w-[300px]">
              <table className="w-full text-sm border-separate border-spacing-0">
                {TABLE_HEADER}
                <tbody>
                  <SectionHeader label="Egg Moves" count={eggRows.length} />
                  {eggRows.map((row, i) => <MoveRow key={i} row={row} game={game} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
