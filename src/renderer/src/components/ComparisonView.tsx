import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData, getGamesForPokemon, GEN_GROUPS, GAME_ABBREV, GAME_COLOR, getMoveData, getTmHmCode, getPokemonStatRanking, getPokemonTotalRanking, displayName, getPokemonDefenseMatchups } from '../data'
import type { StatRankEntry } from '../data'
import type { BaseStats as BaseStatsType, MoveData as MoveDataType } from '../types/pokemon'
import { getExportBgColor } from '../utils/exportSettings'
import { getHomeSpriteUrl } from '../utils/sprites'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TmPopover from './TmPopover'
import TutorPopover from './TutorPopover'
import SortableTableHeader from './SortableTableHeader'
import ExportModeToggle from './ExportModeToggle'
import type { ExportMode } from './ExportModeToggle'
import type { GenGameData } from './Movepool'
import { createPortal } from 'react-dom'
import { STAT_CONFIG, GEN1_STAT_CONFIG, MAX_STAT, GEN1_GAMES } from '../constants/stats'
import { EFF_GROUPS, getAbilityImmunityType } from '../constants/effectiveness'
import { POPOVER_Z, getCategoryColor } from '../constants/ui'
import { getArtworkUrl } from '../utils/sprites'
import { compareTmHmPrefix } from '../utils/tmhmSort'
import { downloadTableImage } from '../utils/exportTable'
import { buildExportFilename } from '../utils/exportFilename'
import { useMultiMoveSort, sortMoveRows } from '../hooks/useMoveSort'
import type { SortState, SortColumn } from '../hooks/useMoveSort'
import PokemonContextMenu from './PokemonContextMenu'
import { useShowMovepoolDiff } from '../contexts/ShowMovepoolDiffContext'
import { useIncludeTypeEffInExports } from '../contexts/IncludeTypeEffInExportsContext'

function getSpriteScale(pokemon: PokemonData): number {
  const family = pokemon.evolution_family
  if (!family || family.length <= 1) return 1
  if (pokemon.species.startsWith('Mega ') || pokemon.species.startsWith('Primal ') || pokemon.species.includes('(Mega Z)')) return 1
  const evolvedFromSet = new Set(family.filter(e => e.method !== null).map(e => e.species))
  const evolvesInto = family.some(e => e.species !== pokemon.species && e.method !== null)
  const isEvolvedFrom = evolvedFromSet.has(pokemon.species)
  if (evolvesInto && !isEvolvedFrom) return 0.75  // first stage
  if (evolvesInto && isEvolvedFrom) return 0.9    // middle stage
  return 1
}

function ComparisonSprite({ name, dexNumber, scale = 1 }: { name: string; dexNumber: number; scale?: number }) {
  const [src, setSrc] = useState(getArtworkUrl(name, dexNumber))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(getArtworkUrl(name, dexNumber))
    setFailed(false)
  }, [name, dexNumber])

  if (failed) {
    return (
      <div className="w-36 h-36 flex items-center justify-center text-gray-700 text-4xl select-none">?</div>
    )
  }
  return <img src={src} alt="" className="w-36 h-36 object-contain drop-shadow-lg" style={scale !== 1 ? { transform: `scale(${scale})` } : undefined} onError={() => setFailed(true)} />
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
      const gameTags = allGames ? [] : genData.filter(gd => games.has(gd.game)).map(gd => ({ abbrev: gd.abbrev, color: gd.color }))
      return { moveName, sortKey: level === 0 ? 1.5 : level, prefix: level === 0 ? 'Evo' : String(level), gameTags }
    })
    .sort((a, b) => a.sortKey - b.sortKey || a.moveName.localeCompare(b.moveName))
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
    const gameTags = allGames ? [] : genData.filter(gd => games.includes(gd.game)).map(gd => ({ abbrev: gd.abbrev, color: gd.color }))
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

function CompMoveRow({ row, game, isUnique }: { row: RowData; game: string; isUnique?: boolean }) {
  const move: MoveDataType | null = getMoveData(row.moveName, game)
  const isTmRow = row.prefix.startsWith('TM') || row.prefix.startsWith('HM')
  const isTutorRow = row.prefix === 'Tutor'
  const defaultBg = isUnique ? '#1e3a5f' : 'transparent'
  return (
    <tr
      className="border-b border-gray-800"
      style={{ backgroundColor: defaultBg }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1f29')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = defaultBg)}
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
          <WikiPopover name={row.moveName} type="move">{row.moveName}</WikiPopover>
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


function buildTsv(rows: RowData[], game: string, prefixLabel: string): string {
  const header = [prefixLabel, 'Move', 'Type', 'Category', 'Power', 'Accuracy', 'PP'].join('\t')
  const dataRows = rows.map(row => {
    const move = getMoveData(row.moveName, game)
    return [
      row.prefix || '', row.moveName, move?.type ?? '', move?.category ?? '',
      move?.power ?? '', move?.accuracy ?? '', move?.pp ?? '',
    ].join('\t')
  })
  return [header, ...dataRows].join('\n')
}

function CopyableSectionHeader({ label, count, game, getTsv, exportMode, tableRef }: { label: string; count: number; game: string; getTsv: () => string; exportMode: ExportMode; tableRef?: React.RefObject<HTMLElement | null> }) {
  const [feedback, setFeedback] = useState(false)
  const handleClick = useCallback(() => {
    if (exportMode === 'download') {
      downloadTableImage(tableRef?.current ?? null, label.replace(/\s+/g, '_').toLowerCase(), label, game)
        .then(() => { setFeedback(true); setTimeout(() => setFeedback(false), 1500) })
    } else {
      navigator.clipboard.writeText(getTsv()).then(() => {
        setFeedback(true)
        setTimeout(() => setFeedback(false), 1500)
      })
    }
  }, [getTsv, exportMode, tableRef, label, game])
  return (
    <div data-export-ignore className="flex items-center gap-2 pt-3 pb-1 px-1">
      <div className="flex-1 h-px bg-gray-700" />
      <button onClick={handleClick} className="flex items-center gap-2 group shrink-0" title={exportMode === 'download' ? 'Click to export as image' : 'Click to copy as spreadsheet'}>
        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-300 transition-colors">{label}</span>
        <span className="text-sm text-gray-600">({count})</span>
        <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
          {feedback
            ? (exportMode === 'download' ? '✓ Saved' : '✓ Copied')
            : (exportMode === 'download' ? '↓ Export' : '⎘ Copy')}
        </span>
      </button>
      <div className="flex-1 h-px bg-gray-700" />
    </div>
  )
}

interface MovepoolSections {
  levelRows: RowData[]
  tmHmRows: RowData[]
  tutorRows: RowData[]
  eggRows: RowData[]
  transferRows: RowData[]
}

function useMovepoolSections(pokemon: PokemonData, game: string, genData: GenGameData[]): MovepoolSections {
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

  const tutorRows = useMemo(() => {
    const rows = multi ? buildSimpleRows(genData, p => p.tutor_learnset) : singleSimpleRows(pokemon.tutor_learnset)
    return rows.map(row => ({ ...row, prefix: 'Tutor' }))
  }, [multi, genData, pokemon])

  const eggRows = useMemo(
    () => multi ? buildSimpleRows(genData, p => p.egg_moves) : singleSimpleRows(pokemon.egg_moves),
    [multi, genData, pokemon]
  )

  const transferRows = useMemo(
    () => multi ? buildSimpleRows(genData, p => p.transfer_learnset) : singleSimpleRows(pokemon.transfer_learnset),
    [multi, genData, pokemon]
  )

  return { levelRows, tmHmRows, tutorRows, eggRows, transferRows }
}

function MoveSection({ label, rows, game, prefixLabel, col1, otherMoveNames, sort, onSort, exportMode }: { label: string; rows: RowData[]; game: string; prefixLabel: string; col1?: string; otherMoveNames?: Set<string>; sort: SortState; onSort: (col: SortColumn) => void; exportMode: ExportMode }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  if (rows.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 pt-3 pb-1 px-1">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-sm font-bold text-gray-600 uppercase tracking-widest">{label}</span>
          <span className="text-sm text-gray-700">(0)</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>
      </div>
    )
  }
  const sorted = sortMoveRows(rows, sort, game)
  return (
    <div ref={sectionRef}>
      <CopyableSectionHeader label={label} count={rows.length} game={game} getTsv={() => buildTsv(rows, game, prefixLabel)} exportMode={exportMode} tableRef={sectionRef} />
      <table data-move-table className="w-full text-sm border-separate border-spacing-0">
        <SortableTableHeader sort={sort} onSort={onSort} col1={col1} />
        <tbody>
          {sorted.map((row, i) => <CompMoveRow key={i} row={row} game={game} isUnique={otherMoveNames ? !otherMoveNames.has(row.moveName) : undefined} />)}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonRankingPopover({ title, statColor, ranking, highlightNames, scrollToName, anchorRect, side, onMouseEnter, onMouseLeave, onNavigate, onClose, selected, selectedGame, comparingWith, onCompare, onSelfCompare, onTripleCompare }: {
  title: string; statColor: string; ranking: StatRankEntry[]; highlightNames: string[]; scrollToName: string; anchorRect: DOMRect; side: 'left' | 'right'; onMouseEnter?: () => void; onMouseLeave?: () => void
  onNavigate?: (name: string) => void; onClose?: () => void; selected?: string | null; selectedGame?: string; comparingWith?: string | null; onCompare?: (name: string) => void; onSelfCompare?: (name: string) => void; onTripleCompare?: (name: string) => void
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollTargetRef = useRef<HTMLTableRowElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; name: string } | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current
        const target = scrollTargetRef.current
        if (container && target) {
          const containerRect = container.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const offsetInScroll = targetRect.top - containerRect.top + container.scrollTop
          container.scrollTop = offsetInScroll - container.clientHeight / 2 + target.clientHeight / 2
        }
      })
    })
  }, [scrollToName])

  const POPOVER_WIDTH = 260
  const POPOVER_HEIGHT = 400
  const left = side === 'left'
    ? Math.max(6, anchorRect.left - POPOVER_WIDTH - 6)
    : Math.min(anchorRect.right + 6, window.innerWidth - POPOVER_WIDTH - 6)
  const top = Math.min(Math.max(6, anchorRect.top - POPOVER_HEIGHT / 2), window.innerHeight - POPOVER_HEIGHT - 6)
  const nameSet = new Set(highlightNames)

  return createPortal(
    <div
      data-comp-stat-popover
      style={{ position: 'fixed', top, left, zIndex: POPOVER_Z, width: `${POPOVER_WIDTH}px` }}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl flex flex-col"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: statColor }}>{title}</p>
      </div>
      <div ref={scrollContainerRef} style={{ height: `${POPOVER_HEIGHT}px`, overflowY: 'auto' }}>
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-left text-gray-500 font-semibold w-8">#</th>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-left text-gray-500 font-semibold">Pokemon</th>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-right text-gray-500 font-semibold w-10">Val</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map(({ name, dex, value, rank }) => {
              const isCurrent = nameSet.has(name)
              return (
                <tr
                  key={name}
                  ref={name === scrollToName ? scrollTargetRef : undefined}
                  style={{ backgroundColor: isCurrent ? `${statColor}22` : 'transparent' }}
                  className={!isCurrent && onNavigate ? 'cursor-pointer hover:bg-gray-700/50' : ''}
                  onClick={() => {
                    if (!isCurrent && onNavigate) {
                      onNavigate(name)
                      onClose?.()
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onMouseEnter?.()
                    setContextMenu({ x: e.clientX, y: e.clientY, name })
                  }}
                >
                  <td className="py-0.5 px-2 tabular-nums text-gray-500">{rank}</td>
                  <td className="py-0.5 px-2 font-medium" style={{ color: isCurrent ? statColor : '#a8b6c2' }}>
                    <span className="inline-flex items-center gap-1">
                      <img src={getHomeSpriteUrl(name, dex)} alt="" className="w-4 h-4 object-contain" loading="lazy" />
                      {displayName(name)}
                    </span>
                  </td>
                  <td className="py-0.5 px-2 tabular-nums text-right text-gray-300">{value}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {contextMenu && selectedGame && (
        <PokemonContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetName={contextMenu.name}
          selected={selected ?? null}
          selectedGame={selectedGame}
          comparingWith={comparingWith ?? null}
          onCompare={onCompare}
          onSelfCompare={onSelfCompare}
          onTripleCompare={onTripleCompare}
          onClose={() => {
            setContextMenu(null)
            onMouseLeave?.()
          }}
        />
      )}
    </div>,
    document.body
  )
}

function StatComparison({ left, right, game, leftName, rightName, onNavigate, onCompare, onSelfCompare, onTripleCompare }: { left: BaseStatsType; right: BaseStatsType; game: string; leftName: string; rightName: string; onNavigate?: (name: string) => void; onCompare?: (name: string) => void; onSelfCompare?: (name: string) => void; onTripleCompare?: (name: string) => void }) {
  const [openPopover, setOpenPopover] = useState<{ id: string; title: string; color: string; ranking: StatRankEntry[]; rect: DOMRect } | null>(null)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isGen1 = GEN1_GAMES.has(game)
  const config = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG
  const totalL = isGen1
    ? left.hp + left.attack + left.defense + left.special_attack + left.speed
    : Object.values(left).reduce((s, v) => s + v, 0)
  const totalR = isGen1
    ? right.hp + right.attack + right.defense + right.special_attack + right.speed
    : Object.values(right).reduce((s, v) => s + v, 0)

  const handleStatEnter = useCallback((e: React.MouseEvent, key: keyof BaseStatsType, label: string, color: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpenPopover({
      id: key, title: `${label} Ranking — ${game}`, color,
      ranking: getPokemonStatRanking(key, game), rect,
    })
  }, [game])

  const handleTotalEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpenPopover({
      id: '__total__', title: `Total Ranking — ${game}`, color: '#94a3b8',
      ranking: getPokemonTotalRanking(game), rect,
    })
  }, [game])

  const handleStatLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setOpenPopover(null), 200)
  }, [])

  return (
    <>
      <div className="space-y-1">
        {config.map(({ key, label, color }) => {
          const lv = left[key]
          const rv = right[key]
          const diff = lv - rv
          const lPct = Math.min((lv / MAX_STAT) * 100, 100)
          const rPct = Math.min((rv / MAX_STAT) * 100, 100)
          return (
            <div
              key={key}
              className="flex items-center gap-1.5 cursor-pointer rounded hover:bg-gray-800/50"
              onMouseEnter={e => handleStatEnter(e, key, label, color)}
              onMouseLeave={handleStatLeave}
              title=""
            >
              {/* Left diff */}
              <span className={`w-9 text-right text-sm font-bold tabular-nums shrink-0 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
              </span>
              {/* Left value + bar (right-aligned) */}
              <div className="flex-1 flex items-center gap-1.5 justify-end">
                <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden flex justify-end">
                  <div className="h-full rounded-sm" style={{ width: `${lPct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.85 }} />
                </div>
                <span className={`w-7 text-right text-sm font-bold tabular-nums ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : ''}`} style={diff === 0 ? { color } : undefined}>
                  {lv}
                </span>
              </div>
              {/* Label */}
              <span className="w-12 text-center text-xs font-semibold text-gray-500 shrink-0">{label}</span>
              {/* Right value + bar (left-aligned) */}
              <div className="flex-1 flex items-center gap-1.5">
                <span className={`w-7 text-left text-sm font-bold tabular-nums ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : ''}`} style={diff === 0 ? { color } : undefined}>
                  {rv}
                </span>
                <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${rPct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.85 }} />
                </div>
              </div>
              {/* Right diff */}
              <span className={`w-9 text-left text-sm font-bold tabular-nums shrink-0 ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {diff < 0 ? `+${-diff}` : diff === 0 ? '—' : `${-diff}`}
              </span>
            </div>
          )
        })}
        {/* Total */}
        <div
          className="flex items-center gap-1.5 pt-1 border-t border-gray-700 mt-1 cursor-pointer rounded hover:bg-gray-800/50"
          onMouseEnter={handleTotalEnter}
          onMouseLeave={handleStatLeave}
          title=""
        >
          {(() => { const td = totalL - totalR; return (
            <>
              <span className={`w-9 text-right text-sm font-bold tabular-nums shrink-0 ${td > 0 ? 'text-green-400' : td < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {td > 0 ? `+${td}` : td === 0 ? '—' : td}
              </span>
              <div className="flex-1 flex justify-end">
                <span className={`w-7 text-right text-sm font-bold tabular-nums ${td > 0 ? 'text-green-400' : td < 0 ? 'text-red-400' : 'text-white'}`}>
                  {totalL}
                </span>
              </div>
              <span className="w-12 text-center text-xs font-semibold text-gray-500 shrink-0">Total</span>
              <div className="flex-1">
                <span className={`w-7 text-left text-sm font-bold tabular-nums ${td < 0 ? 'text-green-400' : td > 0 ? 'text-red-400' : 'text-white'}`}>
                  {totalR}
                </span>
              </div>
              <span className={`w-9 text-left text-sm font-bold tabular-nums shrink-0 ${td < 0 ? 'text-green-400' : td > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {td < 0 ? `+${-td}` : td === 0 ? '—' : `${-td}`}
              </span>
            </>
          ) })()}
        </div>
      </div>

      {openPopover && (
        <>
          <ComparisonRankingPopover
            key={`left-${openPopover.id}`}
            title={openPopover.title}
            statColor={openPopover.color}
            ranking={openPopover.ranking}
            highlightNames={[leftName, rightName]}
            scrollToName={leftName}
            anchorRect={openPopover.rect}
            side="left"
            onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current) }}
            onMouseLeave={handleStatLeave}
            onNavigate={onNavigate}
            onClose={() => setOpenPopover(null)}
            selected={leftName}
            selectedGame={game}
            comparingWith={rightName}
            onCompare={onCompare}
            onSelfCompare={onSelfCompare}
            onTripleCompare={onTripleCompare}
          />
          <ComparisonRankingPopover
            key={`right-${openPopover.id}`}
            title={openPopover.title}
            statColor={openPopover.color}
            ranking={openPopover.ranking}
            highlightNames={[leftName, rightName]}
            scrollToName={rightName}
            anchorRect={openPopover.rect}
            side="right"
            onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current) }}
            onMouseLeave={handleStatLeave}
            onNavigate={onNavigate}
            onClose={() => setOpenPopover(null)}
            selected={leftName}
            selectedGame={game}
            comparingWith={rightName}
            onCompare={onCompare}
            onSelfCompare={onSelfCompare}
            onTripleCompare={onTripleCompare}
          />
        </>
      )}
    </>
  )
}


function ComparisonEffectiveness({ type1, type2, game, abilities, align }: { type1: string; type2: string; game: string; abilities: string[]; align: 'left' | 'right' }) {
  const matchups = getPokemonDefenseMatchups(type1, type2, game)
  const abilityImmunityMap: Record<string, string> = {}
  for (const ability of abilities) {
    const immuneType = getAbilityImmunityType(ability, game)
    if (immuneType) abilityImmunityMap[immuneType] = ability
  }
  const rows = EFF_GROUPS.flatMap(group => {
    const types = Object.entries(matchups).filter(([, v]) => v === group.value).map(([t]) => t)
    if (types.length === 0) return []
    return [{ ...group, types }]
  })
  if (rows.length === 0) return null
  const isRight = align === 'right'
  return (
    <div>
      {rows.map((group, gi) => (
        <div key={group.value} className={gi > 0 ? 'mt-2 pt-2 border-t border-gray-800' : ''}>
          {group.types.map(type => {
            const immunityAbility = abilityImmunityMap[type]
            return (
              <div key={type} className={`flex items-center gap-2 py-0.5 ${isRight ? 'flex-row-reverse' : ''}`}>
                <TypeBadge type={type} game={game} small />
                <span
                  style={{ backgroundColor: group.bg, color: group.text, width: '28px', flexShrink: 0 }}
                  className="text-xs font-bold text-center rounded py-0.5"
                >
                  {group.multiplierLabel}
                </span>
                {immunityAbility && (
                  <span className="text-xs text-gray-500 italic">({immunityAbility})</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function PokemonIdentity({ pokemon, game, onSelect }: { pokemon: PokemonData; game: string; onSelect: (name: string) => void }) {
  const isDualType = pokemon.type_1 !== pokemon.type_2
  return (
    <div className="flex flex-col items-center gap-1.5">
      <h2 className="text-center text-lg font-bold text-white leading-tight">{displayName(pokemon.species)}</h2>
      <div className="flex justify-center">
        <ComparisonSprite name={pokemon.species} dexNumber={pokemon.national_dex_number} scale={getSpriteScale(pokemon)} />
      </div>
      <div className="flex gap-1.5 justify-center -mt-5 relative z-10">
        <TypeBadge type={pokemon.type_1} game={game} />
        {isDualType && <TypeBadge type={pokemon.type_2} game={game} />}
      </div>
    </div>
  )
}

const SECTIONS: { key: keyof MovepoolSections; label: string; prefixLabel: string; col1?: string }[] = [
  { key: 'levelRows', label: 'Level Up Learnset', prefixLabel: 'Lv' },
  { key: 'tmHmRows',  label: 'TM / HM',  prefixLabel: 'TM/HM', col1: '' },
  { key: 'tutorRows', label: 'Move Tutor', prefixLabel: 'Tutor', col1: '' },
  { key: 'eggRows',   label: 'Egg Moves', prefixLabel: '', col1: '' },
  { key: 'transferRows', label: 'Transfer Moves', prefixLabel: '', col1: '' },
]

function syncColumnWidths(container: HTMLElement | null) {
  if (!container) return
  const tables = container.querySelectorAll<HTMLTableElement>('table[data-move-table]')
  if (tables.length < 2) return

  // Reset to auto layout with shrink-to-fit width so columns size to content
  tables.forEach(table => {
    table.style.tableLayout = ''
    table.style.width = 'auto'
    const cg = table.querySelector('colgroup')
    if (cg) cg.remove()
  })

  // Measure max natural content width per column across all tables
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

  // Apply fixed layout with max widths for all columns
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

function ComparisonMovepools({ leftPokemon, rightPokemon, game, leftGenData, rightGenData, leftEvolutionFamily, rightEvolutionFamily, onSelectLeft, onSelectRight }: {
  leftPokemon: PokemonData; rightPokemon: PokemonData; game: string; leftGenData: GenGameData[]; rightGenData: GenGameData[]
  leftEvolutionFamily: PokemonData['evolution_family']; rightEvolutionFamily: PokemonData['evolution_family']
  onSelectLeft: (name: string) => void; onSelectRight: (name: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [exportMode, setExportMode] = useState<ExportMode>('copy')
  const leftSections = useMovepoolSections(leftPokemon, game, leftGenData)
  const rightSections = useMovepoolSections(rightPokemon, game, rightGenData)
  const { getSort, handleSort: onSort } = useMultiMoveSort()
  const showDiff = useShowMovepoolDiff()

  useLayoutEffect(() => {
    syncColumnWidths(containerRef.current)
    if (containerRef.current) {
      const table = containerRef.current.querySelector<HTMLTableElement>('table[data-move-table]')
      if (table) {
        const w = table.offsetWidth
        containerRef.current.querySelectorAll<HTMLElement>('[data-match-table-width]').forEach(el => {
          el.style.width = `${w}px`
        })
      }
    }
  })

  const hasEvolutions = leftEvolutionFamily.length > 1 || rightEvolutionFamily.length > 1

  const sectionRows = SECTIONS.map(({ key, label, prefixLabel, col1 }) => {
    const lRows = leftSections[key]
    const rRows = rightSections[key]
    if (lRows.length === 0 && rRows.length === 0) return null
    const highlightDiff = showDiff && (key === 'tmHmRows' || key === 'levelRows')
    const lMoveNames = highlightDiff ? new Set(lRows.map(r => r.moveName)) : undefined
    const rMoveNames = highlightDiff ? new Set(rRows.map(r => r.moveName)) : undefined
    return { key, label, prefixLabel, col1, lRows, rRows, lMoveNames, rMoveNames }
  }).filter(Boolean) as { key: string; label: string; prefixLabel: string; col1?: string; lRows: RowData[]; rRows: RowData[]; lMoveNames?: Set<string>; rMoveNames?: Set<string> }[]

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="px-4 pt-2">
        <ExportModeToggle mode={exportMode} onChange={setExportMode} />
      </div>
      {/* Evolution families row */}
      {hasEvolutions && (
        <div className="flex justify-center px-4">
          <div className="w-full max-w-md ml-auto py-2">
            {leftEvolutionFamily.length > 1 && (
              <div data-match-table-width className="flex flex-wrap items-center justify-center gap-1 ml-auto">
                {leftEvolutionFamily.map((evo, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && evo.method && (
                      <span className="text-xs text-gray-600">
                        {evo.method === 'level' ? `Lv.${evo.parameter}` : evo.method === 'item' ? String(evo.parameter) : evo.method}
                      </span>
                    )}
                    <button
                      onClick={() => onSelectLeft(evo.species)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        evo.species === leftPokemon.species
                          ? 'bg-gray-600 text-white font-bold cursor-default'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {displayName(evo.species)}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="w-px bg-gray-700 shrink-0 mx-2" />
          <div className="w-full max-w-md mr-auto py-2">
            {rightEvolutionFamily.length > 1 && (
              <div data-match-table-width className="flex flex-wrap items-center justify-center gap-1">
                {rightEvolutionFamily.map((evo, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && evo.method && (
                      <span className="text-xs text-gray-600">
                        {evo.method === 'level' ? `Lv.${evo.parameter}` : evo.method === 'item' ? String(evo.parameter) : evo.method}
                      </span>
                    )}
                    <button
                      onClick={() => onSelectRight(evo.species)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        evo.species === rightPokemon.species
                          ? 'bg-gray-600 text-white font-bold cursor-default'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {displayName(evo.species)}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Movepool sections — each rendered as a side-by-side row */}
      {sectionRows.map(({ key, label, prefixLabel, col1, lRows, rRows, lMoveNames, rMoveNames }) => (
        <div key={key} className="flex justify-center px-4">
          <div className="w-full max-w-md ml-auto [&>div]:w-fit [&>div]:ml-auto">
            <MoveSection label={label} rows={lRows} game={game} prefixLabel={prefixLabel} col1={col1} otherMoveNames={rMoveNames} sort={getSort(key)} onSort={col => onSort(key, col)} exportMode={exportMode} />
          </div>
          <div className="w-px bg-gray-700 shrink-0 mx-2" />
          <div className="w-full max-w-md mr-auto [&>div]:w-fit">
            <MoveSection label={label} rows={rRows} game={game} prefixLabel={prefixLabel} col1={col1} otherMoveNames={lMoveNames} sort={getSort(key)} onSort={col => onSort(key, col)} exportMode={exportMode} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface Props {
  leftName: string
  rightName: string
  selectedGame: string
  onSelectLeft: (name: string) => void
  onSelectRight: (name: string) => void
  onExit: () => void
  onNavigate?: (name: string) => void
  onCompare?: (name: string) => void
  onSelfCompare?: (name: string) => void
  onTripleCompare?: (name: string) => void
}

export default function ComparisonView({ leftName, rightName, selectedGame, onSelectLeft, onSelectRight, onExit, onNavigate, onCompare, onSelfCompare, onTripleCompare }: Props) {
  const includeTypeEffInExports = useIncludeTypeEffInExports()
  const leftPokemon = useMemo(() => getPokemonData(leftName, selectedGame), [leftName, selectedGame])
  const rightPokemon = useMemo(() => getPokemonData(rightName, selectedGame), [rightName, selectedGame])

  const leftGenData = useMemo((): GenGameData[] => {
    const group = GEN_GROUPS.find(g => g.games.includes(selectedGame))
    if (!group) return []
    const available = getGamesForPokemon(leftName)
    return group.games
      .filter(g => available.includes(g))
      .map(g => {
        const p = getPokemonData(leftName, g)
        return p ? { game: g, abbrev: GAME_ABBREV[g] ?? g, color: GAME_COLOR[g] ?? group.color, pokemon: p } : null
      })
      .filter(Boolean) as GenGameData[]
  }, [leftName, selectedGame])

  const rightGenData = useMemo((): GenGameData[] => {
    const group = GEN_GROUPS.find(g => g.games.includes(selectedGame))
    if (!group) return []
    const available = getGamesForPokemon(rightName)
    return group.games
      .filter(g => available.includes(g))
      .map(g => {
        const p = getPokemonData(rightName, g)
        return p ? { game: g, abbrev: GAME_ABBREV[g] ?? g, color: GAME_COLOR[g] ?? group.color, pokemon: p } : null
      })
      .filter(Boolean) as GenGameData[]
  }, [rightName, selectedGame])

  const exportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    if (!exportRef.current || exporting) return
    setExporting(true)
    try {
      const { toPng } = await import('html-to-image')
      const bgColor = getExportBgColor()

      // Capture with transparent bg so canvas shadow follows each element's contour
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        backgroundColor: 'transparent',
        filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
      })

      // Composite onto a 1920×1080 canvas with drop shadows
      const canvas = document.createElement('canvas')
      canvas.width = 1920
      canvas.height = 1080
      const ctx = canvas.getContext('2d')!
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, 1920, 1080)
      }

      const img = new Image()
      img.src = dataUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
      })

      // Scale to fit within 93% width of the canvas
      const maxW = 1920 * 0.93
      const maxH = 1080 * 0.93
      const scale = Math.min(maxW / img.width, maxH / img.height, 1)
      const drawW = img.width * scale
      const drawH = img.height * scale
      const x = (1920 - drawW) / 2
      const y = (1080 - drawH) / 2

      // Draw with drop shadow — canvas shadows follow alpha contours
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.drawImage(img, x, y, drawW, drawH)

      const link = document.createElement('a')
      link.download = buildExportFilename(selectedGame, `${displayName(leftName)}_vs_${displayName(rightName)}`)
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [exporting, leftName, rightName, selectedGame])

  if (!leftPokemon || !rightPokemon) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>One or both Pokemon not available in this game.</p>
        <button onClick={onExit} className="ml-4 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          Exit Comparison <span className="text-gray-500">[Esc]</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
      {/* Exportable comparison area */}
      <div className="shrink-0 border-b border-gray-700">
      <div ref={exportRef} className="px-3 py-3 overflow-y-auto relative" style={{ maxHeight: '55vh' }}>
        <button
          data-export-ignore
          onClick={handleExport}
          disabled={exporting}
          className="absolute top-2 right-2 z-20 p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
          title="Export as PNG"
        >
          {exporting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
        </button>
        <div className="flex items-start gap-3">
          {/* Left effectiveness */}
          <div className="w-36 shrink-0 flex flex-col items-end self-center">
            <div data-export-ignore={!includeTypeEffInExports ? 'true' : undefined}>
              <ComparisonEffectiveness
                type1={leftPokemon.type_1} type2={leftPokemon.type_2}
                game={selectedGame} abilities={[...new Set(leftPokemon.abilities)]}
                align="right"
              />
            </div>
          </div>

          {/* Left Pokemon identity */}
          <div className="w-40 shrink-0 self-center">
            <PokemonIdentity pokemon={leftPokemon} game={selectedGame} onSelect={onSelectLeft} />
          </div>

          {/* Center: stats comparison */}
          <div className="flex-1 min-w-[280px] self-center">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Base Stats</p>
            <StatComparison left={leftPokemon.base_stats} right={rightPokemon.base_stats} game={selectedGame} leftName={leftName} rightName={rightName} onNavigate={onNavigate} onCompare={onCompare} onSelfCompare={onSelfCompare} onTripleCompare={onTripleCompare} />
          </div>

          {/* Right Pokemon identity */}
          <div className="w-40 shrink-0 self-center">
            <PokemonIdentity pokemon={rightPokemon} game={selectedGame} onSelect={onSelectRight} />
          </div>

          {/* Right effectiveness */}
          <div className="w-36 shrink-0 flex flex-col items-start self-center">
            <div data-export-ignore={!includeTypeEffInExports ? 'true' : undefined}>
              <ComparisonEffectiveness
                type1={rightPokemon.type_1} type2={rightPokemon.type_2}
                game={selectedGame} abilities={[...new Set(rightPokemon.abilities)]}
                align="left"
              />
            </div>
          </div>

        </div>
      </div>
      </div>{/* end exportRef */}

      {/* Scrollable: evolution families + aligned side-by-side movepools */}
      <ComparisonMovepools
        leftEvolutionFamily={leftPokemon.evolution_family}
        rightEvolutionFamily={rightPokemon.evolution_family}
        onSelectLeft={onSelectLeft}
        onSelectRight={onSelectRight}
        leftPokemon={leftPokemon}
        rightPokemon={rightPokemon}
        game={selectedGame}
        leftGenData={leftGenData}
        rightGenData={rightGenData}
      />
    </div>
  )
}
