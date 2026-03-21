import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { PokemonData, MoveData } from '../types/pokemon'
import { getMoveData, getTmHmCode } from '../data'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TmPopover from './TmPopover'
import TutorPopover from './TutorPopover'
import TypeCoveragePanel from './TypeCoveragePanel'
import SortableTableHeader from './SortableTableHeader'
import ExportModeToggle from './ExportModeToggle'
import type { ExportMode } from './ExportModeToggle'
import { getCategoryColor } from '../constants/ui'
import { compareTmHmPrefix } from '../utils/tmhmSort'
import { downloadTableImage } from '../utils/exportTable'
import { useMultiMoveSort, sortMoveRows } from '../hooks/useMoveSort'

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
  const isTutorRow = row.prefix === 'Tutor'

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
          : isTutorRow
          ? <TutorPopover game={game}>{row.prefix}</TutorPopover>
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

function syncColumnWidths(container: HTMLElement | null) {
  if (!container) return
  const tables = container.querySelectorAll<HTMLTableElement>('table[data-move-table]')
  if (tables.length < 2) return

  tables.forEach(table => {
    table.style.tableLayout = ''
    table.style.width = 'auto'
    const cg = table.querySelector('colgroup')
    if (cg) cg.remove()
  })

  const maxWidths: number[] = []
  tables.forEach(table => {
    const row = table.querySelector('thead tr') ?? table.querySelector('tr')
    if (!row) return
    const cells = row.children
    for (let i = 0; i < cells.length; i++) {
      const w = (cells[i] as HTMLElement).offsetWidth
      maxWidths[i] = Math.max(maxWidths[i] ?? 0, w)
    }
  })

  tables.forEach(table => {
    table.style.width = 'auto'
    const cg = document.createElement('colgroup')
    maxWidths.forEach(w => {
      const col = document.createElement('col')
      col.style.width = `${w}px`
      cg.appendChild(col)
    })
    table.prepend(cg)
    table.style.tableLayout = 'fixed'
  })
}

function CopyableHeader({ label, getTsv, exportMode, tableRef }: {
  label: string
  getTsv: () => string
  exportMode: ExportMode
  tableRef?: React.RefObject<HTMLElement | null>
}) {
  const [feedback, setFeedback] = useState(false)

  const handleClick = useCallback(() => {
    if (exportMode === 'download') {
      downloadTableImage(tableRef?.current ?? null, `${label.replace(/\s+/g, '_').toLowerCase()}.png`, label)
        .then(() => { setFeedback(true); setTimeout(() => setFeedback(false), 1500) })
    } else {
      navigator.clipboard.writeText(getTsv()).then(() => {
        setFeedback(true)
        setTimeout(() => setFeedback(false), 1500)
      })
    }
  }, [getTsv, exportMode, tableRef, label])

  return (
    <button
      data-export-ignore
      onClick={handleClick}
      className="flex items-center gap-2 mb-1 group"
      title={exportMode === 'download' ? 'Click to download as image' : 'Click to copy as spreadsheet'}
    >
      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest group-hover:text-gray-300 transition-colors">
        {label}
      </span>
      <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
        {feedback
          ? (exportMode === 'download' ? '✓ Saved' : '✓ Copied')
          : (exportMode === 'download' ? '↓ Download' : '⎘ Copy')}
      </span>
    </button>
  )
}

export default function Movepool({ pokemon, game, genData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [exportMode, setExportMode] = useState<ExportMode>('copy')
  const levelTableRef = useRef<HTMLDivElement>(null)
  const tmhmTableRef = useRef<HTMLDivElement>(null)
  const tutorTableRef = useRef<HTMLDivElement>(null)
  const eggTableRef = useRef<HTMLDivElement>(null)
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

  const { getSort, handleSort: onSort, resetAll: resetSort } = useMultiMoveSort()

  // Reset sort when pokemon or game changes
  useEffect(() => {
    resetSort()
  }, [pokemon.species, game])

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
    () => {
      const rows = multi ? buildSimpleRows(genData, p => p.tutor_learnset) : singleSimpleRows(pokemon.tutor_learnset)
      return rows.map(row => ({ ...row, prefix: 'Tutor' }))
    },
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

  useLayoutEffect(() => { syncColumnWidths(containerRef.current) })

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
    <div className="px-4 pt-1 flex items-center">
      <ExportModeToggle mode={exportMode} onChange={setExportMode} />
    </div>
    <div className="flex-1 overflow-y-auto overflow-x-auto px-4 pt-1 pb-4">
    <div className="flex gap-12 items-start">

      {/* Left column: Level Up → Tutor → Egg (single table for aligned columns) */}
      {(hasLevel || hasTutor || hasEgg) && (
        <div className="min-w-[360px] shrink-0">
          {splitLevel ? (
            <div className="flex flex-col gap-4">
              <div ref={levelTableRef}>
                <CopyableHeader
                  label="Level Up Learnset"
                  getTsv={() => buildMultiGameLevelTsv(genData)}
                  exportMode={exportMode}
                  tableRef={levelTableRef}
                />
                {genData.map(({ game: g, abbrev, color, pokemon: p }) => (
                  <div key={g}>
                    <div
                      className="text-xs font-bold mb-1 px-1 uppercase tracking-widest"
                      style={{ color }}
                    >
                      {abbrev}
                    </div>
                    <table data-move-table className="w-full text-sm border-separate border-spacing-0">
                      <SortableTableHeader sort={getSort('level')} onSort={col => onSort('level', col)} />
                      <tbody>
                        {sortMoveRows(singleLevelRows(p), getSort('level'), g).map((row, i) => <MoveRow key={i} row={row} game={g} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              {hasTutor && (
                <div ref={tutorTableRef}>
                  <CopyableHeader label="Move Tutor" getTsv={() => buildTsv(tutorRows, game, 'Tutor')} exportMode={exportMode} tableRef={tutorTableRef} />
                  <table data-move-table className="w-full text-sm border-separate border-spacing-0">
                    <SortableTableHeader sort={getSort('tutor')} onSort={col => onSort('tutor', col)} col1="" />
                    <tbody>
                      {sortMoveRows(tutorRows, getSort('tutor'), game).map((row, i) => <MoveRow key={`t${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
              {hasEgg && (
                <div ref={eggTableRef}>
                  <CopyableHeader label="Egg Moves" getTsv={() => buildTsv(eggRows, game, 'Egg')} exportMode={exportMode} tableRef={eggTableRef} />
                  <table data-move-table className="w-full text-sm border-separate border-spacing-0">
                    <SortableTableHeader sort={getSort('egg')} onSort={col => onSort('egg', col)} col1="" />
                    <tbody>
                      {sortMoveRows(eggRows, getSort('egg'), game).map((row, i) => <MoveRow key={`e${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {hasLevel && (
                <div ref={levelTableRef}>
                  <CopyableHeader label="Level Up Learnset" getTsv={() => multi ? buildMultiGameLevelTsv(genData) : buildTsv(levelRows, game, 'Lv')} exportMode={exportMode} tableRef={levelTableRef} />
                  <table data-move-table className="w-full text-sm border-separate border-spacing-0">
                    <SortableTableHeader sort={getSort('level')} onSort={col => onSort('level', col)} />
                    <tbody>
                      {sortMoveRows(levelRows, getSort('level'), game).map((row, i) => <MoveRow key={`l${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
              {hasTutor && (
                <div ref={tutorTableRef}>
                  <CopyableHeader label="Move Tutor" getTsv={() => buildTsv(tutorRows, game, 'Tutor')} exportMode={exportMode} tableRef={tutorTableRef} />
                  <table data-move-table className="w-full text-sm border-separate border-spacing-0">
                    <SortableTableHeader sort={getSort('tutor')} onSort={col => onSort('tutor', col)} col1="" />
                    <tbody>
                      {sortMoveRows(tutorRows, getSort('tutor'), game).map((row, i) => <MoveRow key={`t${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
                    </tbody>
                  </table>
                </div>
              )}
              {hasEgg && (
                <div ref={eggTableRef}>
                  <CopyableHeader label="Egg Moves" getTsv={() => buildTsv(eggRows, game, 'Egg')} exportMode={exportMode} tableRef={eggTableRef} />
                  <table data-move-table className="w-full text-sm border-separate border-spacing-0">
                    <SortableTableHeader sort={getSort('egg')} onSort={col => onSort('egg', col)} col1="" />
                    <tbody>
                      {sortMoveRows(eggRows, getSort('egg'), game).map((row, i) => <MoveRow key={`e${i}`} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
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
          <div ref={tmhmTableRef}>
            <CopyableHeader
              label="TM / HM Learnset"
              getTsv={() => buildTsv(tmHmRows, game, 'TM/HM')}
              exportMode={exportMode}
              tableRef={tmhmTableRef}
            />
            <table data-move-table className="w-full text-sm border-separate border-spacing-0">
              <SortableTableHeader sort={getSort('tmhm')} onSort={col => onSort('tmhm', col)} col1="" />
              <tbody>
                {sortMoveRows(tmHmRows, getSort('tmhm'), game).map((row, i) => <MoveRow key={i} row={row} game={game} inTestSet={testSetLookup.has(row.moveName)} onToggleTestSet={toggleTestSetMove} />)}
              </tbody>
            </table>
          </div>
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
