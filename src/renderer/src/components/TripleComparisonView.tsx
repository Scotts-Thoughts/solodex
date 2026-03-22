import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData, getGamesForPokemon, GEN_GROUPS, GAME_ABBREV, GAME_COLOR, getMoveData, getTmHmCode, getPokemonStatRanking, getPokemonTotalRanking, displayName, getPokemonDefenseMatchups } from '../data'
import type { StatRankEntry } from '../data'
import type { BaseStats as BaseStatsType, MoveData as MoveDataType } from '../types/pokemon'
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
import { EFF_GROUPS, ABILITY_IMMUNITIES } from '../constants/effectiveness'
import { POPOVER_Z, getCategoryColor } from '../constants/ui'
import { getArtworkUrl, getHomeSpriteUrl } from '../utils/sprites'
import { compareTmHmPrefix } from '../utils/tmhmSort'
import { downloadTableImage } from '../utils/exportTable'
import { useMultiMoveSort, sortMoveRows } from '../hooks/useMoveSort'
import type { SortState, SortColumn } from '../hooks/useMoveSort'
import PokemonContextMenu from './PokemonContextMenu'

// --- Shared helpers (same as ComparisonView) ---

function TripleSprite({ name, dexNumber }: { name: string; dexNumber: number }) {
  const [src, setSrc] = useState(getArtworkUrl(name, dexNumber))
  const [failed, setFailed] = useState(false)
  useEffect(() => { setSrc(getArtworkUrl(name, dexNumber)); setFailed(false) }, [name, dexNumber])
  if (failed) return <div className="w-28 h-28 flex items-center justify-center text-gray-700 text-3xl select-none">?</div>
  return <img src={src} alt="" className="w-28 h-28 object-contain drop-shadow-lg" onError={() => setFailed(true)} />
}

interface RowData {
  moveName: string
  sortKey: number
  prefix: string
  gameTags: { abbrev: string; color: string }[]
}

function applyRemindLabels(rows: RowData[]): RowData[] {
  const level1Indices = rows.reduce<number[]>((acc, row, i) => { if (row.prefix === '1') acc.push(i); return acc }, [])
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
    <span style={{ color, border: `1px solid ${color}60`, fontSize: '11px' }} className="inline-block px-1 rounded font-bold leading-4 tracking-wide">{abbrev}</span>
  )
}

function TripleMoveRow({ row, game, isUnique }: { row: RowData; game: string; isUnique?: boolean }) {
  const move: MoveDataType | null = getMoveData(row.moveName, game)
  const isTmRow = row.prefix.startsWith('TM') || row.prefix.startsWith('HM')
  const isTutorRow = row.prefix === 'Tutor'
  const defaultBg = isUnique ? '#1e3a5f' : 'transparent'
  return (
    <tr className="border-b border-gray-800" style={{ backgroundColor: defaultBg }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1f29')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = defaultBg)}
    >
      <td className="py-0 px-1 text-sm text-gray-500 w-10 tabular-nums shrink-0 whitespace-nowrap">
        {isTmRow ? <TmPopover tmCode={row.prefix} game={game}>{row.prefix}</TmPopover>
          : isTutorRow ? <TutorPopover game={game}>{row.prefix}</TutorPopover>
          : (row.prefix || '')}
      </td>
      <td className="py-0 px-1 text-sm font-medium text-white whitespace-nowrap">
        <span className="flex items-center gap-1">
          <WikiPopover name={row.moveName} type="move">{row.moveName}</WikiPopover>
          {row.gameTags.map(t => <GameTag key={t.abbrev} abbrev={t.abbrev} color={t.color} />)}
        </span>
      </td>
      <td className="py-0 px-1 whitespace-nowrap">{move ? <TypeBadge type={move.type} small game={game} /> : <span className="text-gray-600 text-xs">—</span>}</td>
      <td className="py-0 px-1 text-sm whitespace-nowrap" style={{ color: getCategoryColor(move?.category) }}>{move?.category ?? '—'}</td>
      <td className="py-0 px-1 text-sm text-gray-100 tabular-nums text-right whitespace-nowrap">{move?.power ?? '—'}</td>
      <td className="py-0 px-1 text-sm text-gray-100 tabular-nums text-right whitespace-nowrap">{move?.accuracy != null ? `${move.accuracy}` : '—'}</td>
      <td className="py-0 px-1 text-sm text-gray-400 tabular-nums text-right whitespace-nowrap">{move?.pp ?? '—'}</td>
    </tr>
  )
}

function buildTsv(rows: RowData[], game: string, prefixLabel: string): string {
  const header = [prefixLabel, 'Move', 'Type', 'Category', 'Power', 'Accuracy', 'PP'].join('\t')
  const dataRows = rows.map(row => {
    const move = getMoveData(row.moveName, game)
    return [row.prefix || '', row.moveName, move?.type ?? '', move?.category ?? '', move?.power ?? '', move?.accuracy ?? '', move?.pp ?? ''].join('\t')
  })
  return [header, ...dataRows].join('\n')
}

function TripleSectionHeader({ label, count, getTsv, exportMode, tableRef }: { label: string; count: number; getTsv: () => string; exportMode: ExportMode; tableRef?: React.RefObject<HTMLElement | null> }) {
  const [feedback, setFeedback] = useState(false)
  const handleClick = useCallback(() => {
    if (exportMode === 'download') {
      downloadTableImage(tableRef?.current ?? null, `${label.replace(/\s+/g, '_').toLowerCase()}.png`, label)
        .then(() => { setFeedback(true); setTimeout(() => setFeedback(false), 1500) })
    } else {
      navigator.clipboard.writeText(getTsv()).then(() => { setFeedback(true); setTimeout(() => setFeedback(false), 1500) })
    }
  }, [getTsv, exportMode, tableRef, label])
  return (
    <div data-export-ignore className="flex items-center gap-2 pt-3 pb-1 px-1">
      <div className="flex-1 h-px bg-gray-700" />
      <button onClick={handleClick} className="flex items-center gap-2 group shrink-0" title={exportMode === 'download' ? 'Click to download as image' : 'Click to copy as spreadsheet'}>
        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-300 transition-colors">{label}</span>
        <span className="text-sm text-gray-600">({count})</span>
        <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
          {feedback ? (exportMode === 'download' ? '✓ Saved' : '✓ Copied') : (exportMode === 'download' ? '↓ Download' : '⎘ Copy')}
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
}

function useMovepoolSections(pokemon: PokemonData, game: string, genData: GenGameData[]): MovepoolSections {
  const multi = genData.length > 1
  const levelRows = useMemo(() => multi ? buildLevelUpRows(genData) : singleLevelRows(pokemon), [multi, genData, pokemon])
  const tmHmRows = useMemo(() => {
    const rows = multi ? buildSimpleRows(genData, p => p.tm_hm_learnset) : singleSimpleRows(pokemon.tm_hm_learnset)
    return rows
      .map(row => {
        let prefix = getTmHmCode(row.moveName, game)
        if (!prefix && multi) { for (const gd of genData) { prefix = getTmHmCode(row.moveName, gd.game); if (prefix) break } }
        return { ...row, prefix: prefix ?? '' }
      })
      .sort((a, b) => compareTmHmPrefix(a.prefix, b.prefix))
  }, [multi, genData, pokemon, game])
  const tutorRows = useMemo(() => {
    const rows = multi ? buildSimpleRows(genData, p => p.tutor_learnset) : singleSimpleRows(pokemon.tutor_learnset)
    return rows.map(row => ({ ...row, prefix: 'Tutor' }))
  }, [multi, genData, pokemon])
  const eggRows = useMemo(() => multi ? buildSimpleRows(genData, p => p.egg_moves) : singleSimpleRows(pokemon.egg_moves), [multi, genData, pokemon])
  return { levelRows, tmHmRows, tutorRows, eggRows }
}

function TripleMoveSection({ label, rows, game, prefixLabel, col1, otherMoveNames, sort, onSort, exportMode }: {
  label: string; rows: RowData[]; game: string; prefixLabel: string; col1?: string; otherMoveNames?: Set<string>; sort: SortState; onSort: (col: SortColumn) => void; exportMode: ExportMode
}) {
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
      <TripleSectionHeader label={label} count={rows.length} getTsv={() => buildTsv(rows, game, prefixLabel)} exportMode={exportMode} tableRef={sectionRef} />
      <table data-move-table className="w-full text-sm border-separate border-spacing-0">
        <SortableTableHeader sort={sort} onSort={onSort} col1={col1} />
        <tbody>
          {sorted.map((row, i) => <TripleMoveRow key={i} row={row} game={game} isUnique={otherMoveNames ? !otherMoveNames.has(row.moveName) : undefined} />)}
        </tbody>
      </table>
    </div>
  )
}

// --- Effectiveness ---

function TripleEffectiveness({ type1, type2, game, abilities }: { type1: string; type2: string; game: string; abilities: string[] }) {
  const matchups = getPokemonDefenseMatchups(type1, type2, game)
  const abilityImmunityMap: Record<string, string> = {}
  for (const ability of abilities) { const immuneType = ABILITY_IMMUNITIES[ability]; if (immuneType) abilityImmunityMap[immuneType] = ability }
  const rows = EFF_GROUPS.flatMap(group => {
    const types = Object.entries(matchups).filter(([, v]) => v === group.value).map(([t]) => t)
    if (types.length === 0) return []
    return [{ ...group, types }]
  })
  if (rows.length === 0) return null
  return (
    <div>
      {rows.map((group, gi) => (
        <div key={group.value} className={gi > 0 ? 'mt-1 pt-1 border-t border-gray-800' : ''}>
          {group.types.map(type => {
            const immunityAbility = abilityImmunityMap[type]
            return (
              <div key={type} className="flex items-center gap-1.5 py-0.5">
                <TypeBadge type={type} game={game} small />
                <span style={{ backgroundColor: group.bg, color: group.text, width: '28px', flexShrink: 0 }} className="text-xs font-bold text-center rounded py-0.5">{group.multiplierLabel}</span>
                {immunityAbility && <span className="text-xs text-gray-500 italic">({immunityAbility})</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// --- Identity ---

function PokemonIdentity({ pokemon, game }: { pokemon: PokemonData; game: string }) {
  const isDualType = pokemon.type_1 !== pokemon.type_2
  return (
    <div className="flex flex-col items-center gap-1">
      <h2 className="text-center text-base font-bold text-white leading-tight">{displayName(pokemon.species)}</h2>
      <div className="flex justify-center"><TripleSprite name={pokemon.species} dexNumber={pokemon.national_dex_number} /></div>
      <div className="flex gap-1.5 justify-center -mt-4 relative z-10">
        <TypeBadge type={pokemon.type_1} game={game} />
        {isDualType && <TypeBadge type={pokemon.type_2} game={game} />}
      </div>
    </div>
  )
}

// --- Stat Comparison (3-way linear) ---

function TripleStatComparison({ stats, game, names, onNavigate, onCompare, onSelfCompare, onTripleCompare }: { stats: [BaseStatsType, BaseStatsType, BaseStatsType]; game: string; names: [string, string, string]; onNavigate?: (name: string) => void; onCompare?: (name: string) => void; onSelfCompare?: (name: string) => void; onTripleCompare?: (name: string) => void }) {
  const [openPopover, setOpenPopover] = useState<{ id: string; title: string; color: string; ranking: StatRankEntry[]; rect: DOMRect } | null>(null)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isGen1 = GEN1_GAMES.has(game)
  const config = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG

  const totals = stats.map(s => isGen1
    ? s.hp + s.attack + s.defense + s.special_attack + s.speed
    : Object.values(s).reduce((sum, v) => sum + v, 0)
  )

  const handleStatEnter = useCallback((e: React.MouseEvent, key: keyof BaseStatsType, label: string, color: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpenPopover({ id: key, title: `${label} Ranking — ${game}`, color, ranking: getPokemonStatRanking(key, game), rect })
  }, [game])

  const handleTotalEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setOpenPopover({ id: '__total__', title: `Total Ranking — ${game}`, color: '#94a3b8', ranking: getPokemonTotalRanking(game), rect })
  }, [game])

  const handleStatLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setOpenPopover(null), 200)
  }, [])

  return (
    <>
      <div className="space-y-1">
        {config.map(({ key, label, color }) => {
          const vals = stats.map(s => s[key])
          const maxVal = Math.max(...vals)
          const minVal = Math.min(...vals)
          return (
            <div key={key} className="flex items-center gap-2 cursor-pointer rounded hover:bg-gray-800/50 py-0.5"
              onMouseEnter={e => handleStatEnter(e, key, label, color)}
              onMouseLeave={handleStatLeave}
            >
              <span className="w-8 text-xs font-semibold text-gray-500 shrink-0 text-right">{label}</span>
              {vals.map((v, i) => {
                const pct = Math.min((v / MAX_STAT) * 100, 100)
                const isBest = v === maxVal && maxVal !== minVal
                const isWorst = v === minVal && maxVal !== minVal
                return (
                  <div key={i} className="flex-1 flex items-center gap-1">
                    <span className={`w-7 text-right text-sm font-bold tabular-nums ${isBest ? 'text-green-400' : isWorst ? 'text-red-400' : ''}`} style={!isBest && !isWorst ? { color } : undefined}>
                      {v}
                    </span>
                    <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.85 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
        {/* Total */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-700 mt-1 cursor-pointer rounded hover:bg-gray-800/50 py-0.5"
          onMouseEnter={handleTotalEnter}
          onMouseLeave={handleStatLeave}
        >
          <span className="w-8 text-xs font-semibold text-gray-500 shrink-0 text-right">Total</span>
          {totals.map((t, i) => {
            const maxT = Math.max(...totals)
            const minT = Math.min(...totals)
            const isBest = t === maxT && maxT !== minT
            const isWorst = t === minT && maxT !== minT
            return (
              <div key={i} className="flex-1 flex items-center gap-1">
                <span className={`w-7 text-right text-sm font-bold tabular-nums ${isBest ? 'text-green-400' : isWorst ? 'text-red-400' : 'text-white'}`}>{t}</span>
                <div className="flex-1" />
              </div>
            )
          })}
        </div>
      </div>

      {openPopover && (
        <TripleRankingPopover
          title={openPopover.title}
          statColor={openPopover.color}
          ranking={openPopover.ranking}
          highlightNames={names}
          anchorRect={openPopover.rect}
          onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current) }}
          onMouseLeave={handleStatLeave}
          onNavigate={onNavigate}
          onClose={() => setOpenPopover(null)}
          selected={names[0]}
          selectedGame={game}
          comparingWith={names[1]}
          onCompare={onCompare}
          onSelfCompare={onSelfCompare}
          onTripleCompare={onTripleCompare}
        />
      )}
    </>
  )
}

function TripleRankingPopover({ title, statColor, ranking, highlightNames, anchorRect, onMouseEnter, onMouseLeave, onNavigate, onClose, selected, selectedGame, comparingWith, onCompare, onSelfCompare, onTripleCompare }: {
  title: string; statColor: string; ranking: StatRankEntry[]; highlightNames: string[]; anchorRect: DOMRect; onMouseEnter?: () => void; onMouseLeave?: () => void
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
          container.scrollTop = targetRect.top - containerRect.top + container.scrollTop - container.clientHeight / 2 + target.clientHeight / 2
        }
      })
    })
  }, [highlightNames[0]])

  const W = 260, H = 400
  const left = anchorRect.right + 6 + W <= window.innerWidth ? anchorRect.right + 6 : Math.max(6, anchorRect.left - W - 6)
  const top = Math.min(Math.max(6, anchorRect.top - H / 2), window.innerHeight - H - 6)
  const nameSet = new Set(highlightNames)
  let firstDone = false

  return createPortal(
    <div data-triple-stat-popover style={{ position: 'fixed', top, left, zIndex: POPOVER_Z, width: `${W}px` }}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl flex flex-col"
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: statColor }}>{title}</p>
      </div>
      <div ref={scrollContainerRef} style={{ height: `${H}px`, overflowY: 'auto' }}>
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
              let ref: typeof scrollTargetRef | undefined
              if (isCurrent && !firstDone) { ref = scrollTargetRef; firstDone = true }
              return (
                <tr
                  key={name}
                  ref={ref}
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

// --- Column widths sync ---

function syncColumnWidths(container: HTMLElement | null) {
  if (!container) return
  const tables = container.querySelectorAll<HTMLTableElement>('table[data-move-table]')
  if (tables.length < 2) return
  tables.forEach(table => { table.style.tableLayout = ''; table.style.width = 'auto'; const cg = table.querySelector('colgroup'); if (cg) cg.remove() })
  const maxWidths: number[] = []
  tables.forEach(table => {
    const row = table.querySelector('thead tr') ?? table.querySelector('tr')
    if (!row) return
    for (let i = 0; i < row.children.length; i++) {
      const w = (row.children[i] as HTMLElement).offsetWidth
      maxWidths[i] = Math.max(maxWidths[i] ?? 0, w)
    }
  })
  tables.forEach(table => {
    table.style.width = 'auto'
    const cg = document.createElement('colgroup')
    maxWidths.forEach(w => { const col = document.createElement('col'); col.style.width = `${w}px`; cg.appendChild(col) })
    table.prepend(cg)
    table.style.tableLayout = 'fixed'
  })
}

// --- Movepools ---

const SECTIONS: { key: keyof MovepoolSections; label: string; prefixLabel: string; col1?: string }[] = [
  { key: 'levelRows', label: 'Level Up Learnset', prefixLabel: 'Lv' },
  { key: 'tmHmRows', label: 'TM / HM', prefixLabel: 'TM/HM', col1: '' },
  { key: 'tutorRows', label: 'Move Tutor', prefixLabel: 'Tutor', col1: '' },
  { key: 'eggRows', label: 'Egg Moves', prefixLabel: '', col1: '' },
]

function TripleMovepools({ pokemons, game, genDatas, evolutions, onSelects }: {
  pokemons: [PokemonData, PokemonData, PokemonData]
  game: string
  genDatas: [GenGameData[], GenGameData[], GenGameData[]]
  evolutions: [PokemonData['evolution_family'], PokemonData['evolution_family'], PokemonData['evolution_family']]
  onSelects: [(name: string) => void, (name: string) => void, (name: string) => void]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [exportMode, setExportMode] = useState<ExportMode>('copy')
  const sections = [
    useMovepoolSections(pokemons[0], game, genDatas[0]),
    useMovepoolSections(pokemons[1], game, genDatas[1]),
    useMovepoolSections(pokemons[2], game, genDatas[2]),
  ]
  const { getSort, handleSort: onSort } = useMultiMoveSort()

  useLayoutEffect(() => { syncColumnWidths(containerRef.current) })

  const hasEvolutions = evolutions.some(e => e.length > 1)

  const sectionRows = SECTIONS.map(({ key, label, prefixLabel, col1 }) => {
    const allRows = sections.map(s => s[key])
    if (allRows.every(r => r.length === 0)) return null
    return { key, label, prefixLabel, col1, allRows }
  }).filter(Boolean) as { key: string; label: string; prefixLabel: string; col1?: string; allRows: RowData[][] }[]

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="px-4 pt-2">
        <ExportModeToggle mode={exportMode} onChange={setExportMode} />
      </div>

      {/* Evolution families */}
      {hasEvolutions && (
        <div className="flex justify-center px-4">
          {evolutions.map((evoFamily, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <div className="w-px bg-gray-700 shrink-0 mx-2" />}
              <div className="w-full max-w-sm py-2">
                {evoFamily.length > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {evoFamily.map((evo, i) => (
                      <div key={i} className="flex items-center gap-1">
                        {i > 0 && evo.method && (
                          <span className="text-xs text-gray-600">
                            {evo.method === 'level' ? `Lv.${evo.parameter}` : evo.method === 'item' ? String(evo.parameter) : evo.method}
                          </span>
                        )}
                        <button
                          onClick={() => onSelects[idx](evo.species)}
                          className={`text-xs px-2 py-0.5 rounded transition-colors ${
                            evo.species === pokemons[idx].species ? 'bg-gray-600 text-white font-bold cursor-default' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                          }`}
                        >{displayName(evo.species)}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Movepool sections */}
      {sectionRows.map(({ key, label, prefixLabel, col1, allRows }) => {
        // Build combined move name sets for uniqueness highlighting
        const moveNameSets = allRows.map(rows => new Set(rows.map(r => r.moveName)))
        return (
          <div key={key} className="flex justify-center px-4">
            {allRows.map((rows, idx) => {
              const otherNames = new Set<string>()
              moveNameSets.forEach((s, j) => { if (j !== idx) s.forEach(n => otherNames.add(n)) })
              return (
                <React.Fragment key={idx}>
                  {idx > 0 && <div className="w-px bg-gray-700 shrink-0 mx-2" />}
                  <div className="w-full max-w-sm">
                    <TripleMoveSection label={label} rows={rows} game={game} prefixLabel={prefixLabel} col1={col1}
                      otherMoveNames={key === 'tmHmRows' ? otherNames : undefined}
                      sort={getSort(key)} onSort={col => onSort(key, col)} exportMode={exportMode}
                    />
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Need React for Fragment usage
import React from 'react'

// --- Main Component ---

interface Props {
  name1: string
  name2: string
  name3: string
  selectedGame: string
  onSelect1: (name: string) => void
  onSelect2: (name: string) => void
  onSelect3: (name: string) => void
  onExit: () => void
  onNavigate?: (name: string) => void
  onCompare?: (name: string) => void
  onSelfCompare?: (name: string) => void
  onTripleCompare?: (name: string) => void
}

export default function TripleComparisonView({ name1, name2, name3, selectedGame, onSelect1, onSelect2, onSelect3, onExit, onNavigate, onCompare, onSelfCompare, onTripleCompare }: Props) {
  const names: [string, string, string] = [name1, name2, name3]

  const pokemons = useMemo(() => names.map(n => getPokemonData(n, selectedGame)) as [PokemonData | null, PokemonData | null, PokemonData | null], [name1, name2, name3, selectedGame])

  const genDatas = useMemo((): [GenGameData[], GenGameData[], GenGameData[]] => {
    return names.map(name => {
      const group = GEN_GROUPS.find(g => g.games.includes(selectedGame))
      if (!group) return []
      const available = getGamesForPokemon(name)
      return group.games
        .filter(g => available.includes(g))
        .map(g => {
          const p = getPokemonData(name, g)
          return p ? { game: g, abbrev: GAME_ABBREV[g] ?? g, color: GAME_COLOR[g] ?? group.color, pokemon: p } : null
        })
        .filter(Boolean) as GenGameData[]
    }) as [GenGameData[], GenGameData[], GenGameData[]]
  }, [name1, name2, name3, selectedGame])

  if (pokemons.some(p => !p)) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>One or more Pokemon not available in this game.</p>
        <button onClick={onExit} className="ml-4 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">Exit Comparison</button>
      </div>
    )
  }

  const [p1, p2, p3] = pokemons as [PokemonData, PokemonData, PokemonData]
  const onSelects: [(name: string) => void, (name: string) => void, (name: string) => void] = [onSelect1, onSelect2, onSelect3]

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
      {/* Top: identities + stats + effectiveness */}
      <div className="shrink-0 border-b border-gray-700 px-3 py-3 overflow-y-auto" style={{ maxHeight: '55vh' }}>
        <div className="flex items-start gap-2">
          {/* Pokemon 1 */}
          <div className="w-28 shrink-0 self-center">
            <PokemonIdentity pokemon={p1} game={selectedGame} />
          </div>
          <div className="w-28 shrink-0 self-center">
            <TripleEffectiveness type1={p1.type_1} type2={p1.type_2} game={selectedGame} abilities={[...new Set(p1.abilities)]} />
          </div>

          {/* Pokemon 2 */}
          <div className="w-28 shrink-0 self-center">
            <PokemonIdentity pokemon={p2} game={selectedGame} />
          </div>
          <div className="w-28 shrink-0 self-center">
            <TripleEffectiveness type1={p2.type_1} type2={p2.type_2} game={selectedGame} abilities={[...new Set(p2.abilities)]} />
          </div>

          {/* Pokemon 3 */}
          <div className="w-28 shrink-0 self-center">
            <PokemonIdentity pokemon={p3} game={selectedGame} />
          </div>
          <div className="w-28 shrink-0 self-center">
            <TripleEffectiveness type1={p3.type_1} type2={p3.type_2} game={selectedGame} abilities={[...new Set(p3.abilities)]} />
          </div>

          {/* Stats */}
          <div className="flex-1 min-w-[300px] self-center">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Base Stats</p>
            <TripleStatComparison stats={[p1.base_stats, p2.base_stats, p3.base_stats]} game={selectedGame} names={names} onNavigate={onNavigate} onCompare={onCompare} onSelfCompare={onSelfCompare} onTripleCompare={onTripleCompare} />
          </div>
        </div>
      </div>

      {/* Bottom: movepools */}
      <TripleMovepools
        pokemons={[p1, p2, p3]}
        game={selectedGame}
        genDatas={genDatas}
        evolutions={[p1.evolution_family, p2.evolution_family, p3.evolution_family]}
        onSelects={onSelects}
      />
    </div>
  )
}
