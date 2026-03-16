import { useMemo, useState, useCallback, useEffect } from 'react'
import type { PokemonData, MoveData } from '../types/pokemon'
import { getMoveData, getTmHmCode } from '../data'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TmPopover from './TmPopover'
import TypeCoveragePanel from './TypeCoveragePanel'
import { getCategoryColor } from '../constants/ui'
import { compareTmHmPrefix } from '../utils/tmhmSort'

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

function applyRemindLabels(rows: RowData[]): RowData[] {
  const level1Indices = rows.reduce<number[]>((acc, row, i) => {
    if (row.prefix === '1') acc.push(i)
    return acc
  }, [])
  if (level1Indices.length >= 5) {
    const remindCount = level1Indices.length - 4
    for (let i = 0; i < remindCount; i++) {
      const row = rows[level1Indices[i]]
      rows[level1Indices[i]] = { ...row, prefix: 'Rem', sortKey: 0.5 }
    }
    rows.sort((a, b) => a.sortKey - b.sortKey)
  }
  return rows
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

  const rows = Array.from(map.values())
    .map(({ level, moveName, games }) => {
      const allGames = games.size === total
      const gameTags = allGames
        ? []
        : genData.filter(gd => games.has(gd.game)).map(gd => ({ abbrev: gd.abbrev, color: gd.color }))
      return { moveName, sortKey: level === 0 ? 1.5 : level, prefix: level === 0 ? 'Evo' : String(level), gameTags }
    })
    .sort((a, b) => a.sortKey - b.sortKey)
  return applyRemindLabels(rows)
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
  const rows = pokemon.level_up_learnset.map(([level, moveName]) => ({
    moveName, sortKey: level === 0 ? 1.5 : level, prefix: level === 0 ? 'Evo' : String(level), gameTags: [] as { abbrev: string; color: string }[],
  })).sort((a, b) => a.sortKey - b.sortKey)
  return applyRemindLabels(rows)
}

function singleSimpleRows(moves: string[]): RowData[] {
  return moves.map(moveName => ({ moveName, sortKey: 0, prefix: '', gameTags: [] }))
}

function buildTsv(rows: RowData[], game: string, prefixLabel: string): string {
  const header = [prefixLabel, 'Move', 'Type', 'Category', 'Power', 'Accuracy', 'PP'].join('\t')
  const dataRows = rows.map(row => {
    const move = getMoveData(row.moveName, game)
    return [
      row.prefix || '',
      row.moveName,
      move?.type ?? '—',
      move?.category ?? '—',
      move?.power ?? '—',
      move?.accuracy ?? '—',
      move?.pp ?? '—',
    ].join('\t')
  })
  return [header, ...dataRows].join('\n')
}

function buildMultiGameLevelTsv(genData: GenGameData[]): string {
  const header = ['Game', 'Level', 'Move', 'Type', 'Category', 'Power', 'Accuracy', 'PP'].join('\t')
  const dataRows = genData.flatMap(({ abbrev, pokemon, game }) =>
    pokemon.level_up_learnset.map(([level, moveName]) => {
      const move = getMoveData(moveName, game)
      return [abbrev, level === 0 ? 'Evo' : level, moveName, move?.type ?? '—', move?.category ?? '—', move?.power ?? '—', move?.accuracy ?? '—', move?.pp ?? '—'].join('\t')
    })
  )
  return [header, ...dataRows].join('\n')
}

function levelUpLearnsetsDiffer(genData: GenGameData[]): boolean {
  if (genData.length <= 1) return false
  const first = JSON.stringify(genData[0].pokemon.level_up_learnset)
  return genData.some(gd => JSON.stringify(gd.pokemon.level_up_learnset) !== first)
}

const TH = 'sticky top-0 bg-gray-900 z-10 py-1 px-1 text-sm text-gray-600 font-semibold'

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
      style={{ color, border: `1px solid ${color}60`, fontSize: '11px' }}
      className="inline-block px-1 rounded font-bold leading-4 tracking-wide"
    >
      {abbrev}
    </span>
  )
}

function MoveRow({ row, game, inTestSet, onToggleTestSet }: { row: RowData; game: string; inTestSet?: boolean; onToggleTestSet?: (moveName: string) => void }) {
  const move: MoveData | null = getMoveData(row.moveName, game)
  const isTmRow = row.prefix.startsWith('TM') || row.prefix.startsWith('HM')

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (onToggleTestSet) {
      e.preventDefault()
      onToggleTestSet(row.moveName)
    }
  }, [onToggleTestSet, row.moveName])

  return (
    <tr
      className="border-b border-gray-800"
      style={{ backgroundColor: inTestSet ? '#1e293b' : 'transparent' }}
      onMouseEnter={e => { if (!inTestSet) e.currentTarget.style.backgroundColor = '#1a1f29' }}
      onMouseLeave={e => { if (!inTestSet) e.currentTarget.style.backgroundColor = 'transparent' }}
      onContextMenu={handleContextMenu}
    >
      <td className="py-0 px-1 text-sm text-gray-500 w-10 tabular-nums shrink-0 whitespace-nowrap">
        {isTmRow
          ? <TmPopover tmCode={row.prefix} game={game}>{row.prefix}</TmPopover>
          : (row.prefix || '')}
      </td>
      <td className="py-0 px-1 text-sm font-medium text-white whitespace-nowrap">
        <span className="flex items-center gap-1">
          {inTestSet && <span className="text-blue-400 text-xs">&#9679;</span>}
          <WikiPopover name={row.moveName} type="move">
            {row.moveName}
          </WikiPopover>
          {row.gameTags.map(t => <GameTag key={t.abbrev} abbrev={t.abbrev} color={t.color} />)}
        </span>
      </td>
      <td className="py-0 px-1 whitespace-nowrap">
        {move ? <TypeBadge type={move.type} small game={game} /> : <span className="text-gray-600 text-xs">—</span>}
      </td>
      <td className="py-0 px-1 text-sm whitespace-nowrap" style={{
        color: getCategoryColor(move?.category)
      }}>{move?.category ?? '—'}</td>
      <td className="py-0 px-1 text-sm text-gray-100 tabular-nums text-right whitespace-nowrap">{move?.power ?? '—'}</td>
      <td className="py-0 px-1 text-sm text-gray-100 tabular-nums text-right whitespace-nowrap">
        {move?.accuracy != null ? `${move.accuracy}` : '—'}
      </td>
      <td className="py-0 px-1 text-sm text-gray-400 tabular-nums text-right whitespace-nowrap">{move?.pp ?? '—'}</td>
    </tr>
  )
}


interface Props {
  pokemon: PokemonData
  game: string
  genData: GenGameData[]
}

function CopyableHeader({ label, getTsv }: {
  label: string
  getTsv: () => string
}) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(getTsv()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [getTsv])

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 mb-1 group"
      title="Click to copy as spreadsheet"
    >
      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest group-hover:text-gray-300 transition-colors">
        {label}
      </span>
      <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
        {copied ? '✓ Copied' : '⎘ Copy'}
      </span>
    </button>
  )
}

export default function Movepool({ pokemon, game, genData }: Props) {
  const [testSet, setTestSet] = useState<string[]>([])

  // Clear test set when pokemon or game changes
  useEffect(() => {
    setTestSet([])
  }, [pokemon.species, game])

  const toggleTestSetMove = useCallback((moveName: string) => {
    setTestSet(prev => {
      if (prev.includes(moveName)) return prev.filter(m => m !== moveName)
      if (prev.length >= 4) return prev
      return [...prev, moveName]
    })
  }, [])

  const testSetLookup = useMemo(() => new Set(testSet), [testSet])

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
      .map(row => {
        let prefix = getTmHmCode(row.moveName, game)
        if (!prefix && multi) {
          for (const gd of genData) {
            prefix = getTmHmCode(row.moveName, gd.game)
            if (prefix) break
          }
        }
        return { ...row, prefix: prefix ?? '' }
      })
      .sort((a, b) => compareTmHmPrefix(a.prefix, b.prefix))
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

  const splitLevel = multi && levelUpLearnsetsDiffer(genData)

  return (
    <div className="flex flex-col h-full min-h-0">
    <div className="flex-1 overflow-y-auto overflow-x-auto px-4 pt-1 pb-4">
    <div className="flex gap-12 items-start">

      {/* Left column: Level Up → Tutor → Egg (single table for aligned columns) */}
      {(hasLevel || hasTutor || hasEgg) && (
        <div className="min-w-[360px] shrink-0">
          {splitLevel ? (
            <div className="flex flex-col gap-4">
              <div>
                <CopyableHeader
                  label="Level Up Learnset"
                  getTsv={() => buildMultiGameLevelTsv(genData)}
                />
                {genData.map(({ game: g, abbrev, color, pokemon: p }) => (
                  <div key={g}>
                    <div
                      className="text-xs font-bold mb-1 px-1 uppercase tracking-widest"
                      style={{ color }}
                    >
                      {abbrev}
                    </div>
                    <table className="w-full text-sm border-separate border-spacing-0">
                      {TABLE_HEADER}
                      <tbody>
                        {singleLevelRows(p).map((row, i) => <MoveRow key={i} row={row} game={g} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              {hasTutor && (
                <div>
                  <CopyableHeader label="Move Tutor" getTsv={() => buildTsv(tutorRows, game, 'Tutor')} />
                  <table className="w-full text-sm border-separate border-spacing-0">
                    {TABLE_HEADER}
                    <tbody>
                      {tutorRows.map((row, i) => <MoveRow key={`t${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
              {hasEgg && (
                <div>
                  <CopyableHeader label="Egg Moves" getTsv={() => buildTsv(eggRows, game, 'Egg')} />
                  <table className="w-full text-sm border-separate border-spacing-0">
                    {TABLE_HEADER}
                    <tbody>
                      {eggRows.map((row, i) => <MoveRow key={`e${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {hasLevel && (
                <div>
                  <CopyableHeader label="Level Up Learnset" getTsv={() => multi ? buildMultiGameLevelTsv(genData) : buildTsv(levelRows, game, 'Lv')} />
                  <table className="w-full text-sm border-separate border-spacing-0">
                    {TABLE_HEADER}
                    <tbody>
                      {levelRows.map((row, i) => <MoveRow key={`l${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
              {hasTutor && (
                <div>
                  <CopyableHeader label="Move Tutor" getTsv={() => buildTsv(tutorRows, game, 'Tutor')} />
                  <table className="w-full text-sm border-separate border-spacing-0">
                    {TABLE_HEADER}
                    <tbody>
                      {tutorRows.map((row, i) => <MoveRow key={`t${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
              {hasEgg && (
                <div>
                  <CopyableHeader label="Egg Moves" getTsv={() => buildTsv(eggRows, game, 'Egg')} />
                  <table className="w-full text-sm border-separate border-spacing-0">
                    {TABLE_HEADER}
                    <tbody>
                      {eggRows.map((row, i) => <MoveRow key={`e${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Right column: TM / HM */}
      {hasTmHm && (
        <div className="w-[360px] shrink-0">
          <CopyableHeader
            label="TM / HM Learnset"
            getTsv={() => buildTsv(tmHmRows, game, 'TM/HM')}
          />
          <table className="w-full text-sm border-separate border-spacing-0">
            {TABLE_HEADER}
            <tbody>
              {tmHmRows.map((row, i) => <MoveRow key={i} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
            </tbody>
          </table>
        </div>
      )}

    </div>
    </div>

    {/* Type Coverage Panel — fixed at bottom, outside scroll area */}
    {testSet.length > 0 && (
      <div className="shrink-0">
        <TypeCoveragePanel
          testSet={testSet}
          game={game}
          onRemove={(name) => setTestSet(prev => prev.filter(m => m !== name))}
          onClear={() => setTestSet([])}
        />
      </div>
    )}

    </div>
  )
}
