import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData, getGamesForPokemon, GAME_TO_GEN, GAME_ABBREV, GAME_COLOR, getMoveData, getTmHmCode, getPokemonStatRanking, getPokemonTotalRanking, getPokemonDefenseMatchups, displayName } from '../data'
import type { StatRankEntry } from '../data'
import type { BaseStats as BaseStatsType, MoveData as MoveDataType } from '../types/pokemon'
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
import { usePopoverDismiss } from '../hooks/usePopoverDismiss'
import { useShowMovepoolDiff } from '../contexts/ShowMovepoolDiffContext'
import { compareTmHmPrefix } from '../utils/tmhmSort'
import { downloadTableImage, downloadMovepoolImage } from '../utils/exportTable'
import { useMultiMoveSort, sortMoveRows } from '../hooks/useMoveSort'
import type { SortState, SortColumn } from '../hooks/useMoveSort'
import PokemonContextMenu from './PokemonContextMenu'

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

function SelfCompSprite({ name, dexNumber, scale = 1 }: { name: string; dexNumber: number; scale?: number }) {
  const [src, setSrc] = useState(getArtworkUrl(name, dexNumber))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setSrc(getArtworkUrl(name, dexNumber))
    setFailed(false)
  }, [name, dexNumber])
  if (failed) return <div className="w-36 h-36 flex items-center justify-center text-gray-700 text-4xl select-none">?</div>
  return <img src={src} alt="" className="w-36 h-36 object-contain drop-shadow-lg" style={scale !== 1 ? { transform: `scale(${scale})` } : undefined} onError={() => setFailed(true)} />
}


function GameSelector({ availableGames, selectedGame, disabledGame, onChange }: {
  availableGames: string[]
  selectedGame: string
  disabledGame: string
  onChange: (game: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {availableGames.map((game) => {
        const isActive = game === selectedGame
        const isDisabled = game === disabledGame
        const color = GAME_COLOR[game] ?? '#6B7280'
        const abbrev = GAME_ABBREV[game] ?? game
        return (
          <button
            key={game}
            onClick={() => !isDisabled && onChange(game)}
            disabled={isDisabled}
            className={`px-1.5 py-0.5 text-xs font-bold rounded transition-colors ${
              isActive ? 'text-white' : isDisabled ? 'text-gray-700 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200'
            }`}
            style={
              isActive
                ? { backgroundColor: color }
                : isDisabled
                ? undefined
                : { border: `1px solid ${color}40` }
            }
            title={isDisabled ? 'Already shown on the other side' : game}
          >
            {abbrev}
          </button>
        )
      })}
    </div>
  )
}

// Stat config, effectiveness groups, and ability immunities imported from shared constants

function SelfStatComparison({ left, right, leftGame, rightGame, name, onNavigate, onCompare, onSelfCompare }: {
  left: BaseStatsType; right: BaseStatsType; leftGame: string; rightGame: string; name: string
  onNavigate?: (name: string) => void; onCompare?: (name: string) => void; onSelfCompare?: (name: string) => void
}) {
  const [openPopover, setOpenPopover] = useState<{ id: string; title: string; color: string; ranking: StatRankEntry[]; rect: DOMRect; side: 'left' | 'right' } | null>(null)
  // Use the left game's gen to determine config (stat display)
  const isGen1Left = GEN1_GAMES.has(leftGame)
  const isGen1Right = GEN1_GAMES.has(rightGame)
  // Use the broader config (6-stat) if either side is non-gen1
  const config = (isGen1Left && isGen1Right) ? GEN1_STAT_CONFIG : STAT_CONFIG
  const totalL = isGen1Left
    ? left.hp + left.attack + left.defense + left.special_attack + left.speed
    : Object.values(left).reduce((s, v) => s + v, 0)
  const totalR = isGen1Right
    ? right.hp + right.attack + right.defense + right.special_attack + right.speed
    : Object.values(right).reduce((s, v) => s + v, 0)

  const handleStatClick = useCallback((e: React.MouseEvent, key: keyof BaseStatsType, label: string, color: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setOpenPopover(prev => prev?.id === key ? null : {
      id: key, title: `${label} Ranking`, color, side: 'left',
      ranking: getPokemonStatRanking(key, leftGame), rect,
    })
  }, [leftGame])

  const handleTotalClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setOpenPopover(prev => prev?.id === '__total__' ? null : {
      id: '__total__', title: 'Total Ranking', color: '#94a3b8', side: 'left',
      ranking: getPokemonTotalRanking(leftGame), rect,
    })
  }, [leftGame])

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
              onClick={e => handleStatClick(e, key, label, color)}
            >
              <span className={`w-9 text-right text-sm font-bold tabular-nums shrink-0 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
              </span>
              <div className="flex-1 flex items-center gap-1.5 justify-end">
                <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden flex justify-end">
                  <div className="h-full rounded-sm" style={{ width: `${lPct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.85 }} />
                </div>
                <span className={`w-7 text-right text-sm font-bold tabular-nums ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : ''}`} style={diff === 0 ? { color } : undefined}>
                  {lv}
                </span>
              </div>
              <span className="w-12 text-center text-xs font-semibold text-gray-500 shrink-0">{label}</span>
              <div className="flex-1 flex items-center gap-1.5">
                <span className={`w-7 text-left text-sm font-bold tabular-nums ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : ''}`} style={diff === 0 ? { color } : undefined}>
                  {rv}
                </span>
                <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden">
                  <div className="h-full rounded-sm" style={{ width: `${rPct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.85 }} />
                </div>
              </div>
              <span className={`w-9 text-left text-sm font-bold tabular-nums shrink-0 ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {diff < 0 ? `+${-diff}` : diff === 0 ? '—' : `${-diff}`}
              </span>
            </div>
          )
        })}
        {/* Total */}
        <div
          className="flex items-center gap-1.5 pt-1 border-t border-gray-700 mt-1 cursor-pointer rounded hover:bg-gray-800/50"
          onClick={handleTotalClick}
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
        <SelfRankingPopover
          title={openPopover.title}
          statColor={openPopover.color}
          ranking={openPopover.ranking}
          highlightName={name}
          anchorRect={openPopover.rect}
          onClose={() => setOpenPopover(null)}
          onNavigate={onNavigate}
          selected={name}
          selectedGame={leftGame}
          onCompare={onCompare}
          onSelfCompare={onSelfCompare}
        />
      )}
    </>
  )
}

function SelfRankingPopover({ title, statColor, ranking, highlightName, anchorRect, onClose, onNavigate, selected, selectedGame, onCompare, onSelfCompare }: {
  title: string; statColor: string; ranking: StatRankEntry[]; highlightName: string; anchorRect: DOMRect; onClose: () => void
  onNavigate?: (name: string) => void; selected?: string | null; selectedGame?: string; onCompare?: (name: string) => void; onSelfCompare?: (name: string) => void
}) {
  const firstRef = useCallback((el: HTMLTableRowElement | null) => {
    el?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; name: string } | null>(null)

  usePopoverDismiss('[data-self-stat-popover],[data-pokemon-context-menu]', onClose)

  const POPOVER_WIDTH = 260
  const POPOVER_HEIGHT = 400
  const left = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
    ? anchorRect.right + 6
    : anchorRect.left - POPOVER_WIDTH - 6
  const top = Math.min(Math.max(6, anchorRect.top - POPOVER_HEIGHT / 2), window.innerHeight - POPOVER_HEIGHT - 6)
  const firstDone = useRef(false)
  // Reset on re-render with new ranking data
  firstDone.current = false

  return createPortal(
    <div
      data-self-stat-popover
      style={{ position: 'fixed', top, left, zIndex: POPOVER_Z, width: `${POPOVER_WIDTH}px` }}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl flex flex-col"
    >
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: statColor }}>{title}</p>
      </div>
      <div style={{ height: `${POPOVER_HEIGHT}px`, overflowY: 'auto' }}>
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
              const isCurrent = name === highlightName
              let ref: ((el: HTMLTableRowElement | null) => void) | undefined
              if (isCurrent && !firstDone.current) { ref = firstRef; firstDone.current = true }
              return (
                <tr
                  key={name}
                  ref={ref}
                  style={{ backgroundColor: isCurrent ? `${statColor}22` : 'transparent' }}
                  className={!isCurrent && onNavigate ? 'cursor-pointer hover:bg-gray-700/50' : ''}
                  onClick={() => {
                    if (!isCurrent && onNavigate) {
                      onNavigate(name)
                      onClose()
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
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
          comparingWith={null}
          onCompare={onCompare}
          onSelfCompare={onSelfCompare}
          onClose={() => {
            setContextMenu(null)
            onClose()
          }}
        />
      )}
    </div>,
    document.body
  )
}

// --- Type effectiveness ---

/** Builds ordered type list for an effectiveness group: shared types first, then side-only types */
function orderEffTypes(types: string[], otherMatchups: Record<string, number>, groupValue: number): { type: string; isUnique: boolean }[] {
  const shared: string[] = []
  const unique: string[] = []
  for (const t of types) {
    if (otherMatchups[t] === groupValue) shared.push(t)
    else unique.push(t)
  }
  return [
    ...shared.map(t => ({ type: t, isUnique: false })),
    ...unique.map(t => ({ type: t, isUnique: true })),
  ]
}

function SelfEffectiveness({ type1, type2, game, abilities, align, otherMatchups }: {
  type1: string; type2: string; game: string; abilities: string[]; align: 'left' | 'right'
  otherMatchups: Record<string, number>
}) {
  const matchups = getPokemonDefenseMatchups(type1, type2, game)
  const abilityImmunityMap: Record<string, string> = {}
  for (const ability of abilities) {
    const immuneType = getAbilityImmunityType(ability, game)
    if (immuneType) abilityImmunityMap[immuneType] = ability
  }
  const rows = EFF_GROUPS.flatMap(group => {
    const rawTypes = Object.entries(matchups).filter(([, v]) => v === group.value).map(([t]) => t)
    if (rawTypes.length === 0) return []
    const ordered = orderEffTypes(rawTypes, otherMatchups, group.value)
    return [{ ...group, entries: ordered }]
  })
  if (rows.length === 0) return null
  const isRight = align === 'right'
  return (
    <div>
      {rows.map((group, gi) => (
        <div key={group.value} className={gi > 0 ? 'mt-2 pt-2 border-t border-gray-800' : ''}>
          {group.entries.map(({ type, isUnique }) => {
            const immunityAbility = abilityImmunityMap[type]
            return (
              <div key={type} className={`flex items-center gap-2 py-0.5 ${isRight ? 'flex-row-reverse' : ''}`}>
                <TypeBadge type={type} game={game} small />
                <span
                  style={{ backgroundColor: group.bg, color: isUnique ? '#facc15' : group.text, width: '28px', flexShrink: 0 }}
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

// --- Movepool ---
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

function singleLevelRows(pokemon: PokemonData): RowData[] {
  const rows = pokemon.level_up_learnset.map(([level, moveName]) => ({
    moveName, sortKey: level === 0 ? 1.5 : level, prefix: level === 0 ? 'Evo' : String(level), gameTags: [] as { abbrev: string; color: string }[],
  })).sort((a, b) => a.sortKey - b.sortKey)
  return applyRemindLabels(rows)
}

function singleSimpleRows(moves: string[]): RowData[] {
  return moves.map(moveName => ({ moveName, sortKey: 0, prefix: '', gameTags: [] }))
}

function SelfMoveRow({ row, game, isUnique, isLevelDiff }: { row: RowData; game: string; isUnique?: boolean; isLevelDiff?: boolean }) {
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
      <td className="py-0 px-1 text-sm w-10 tabular-nums shrink-0 whitespace-nowrap"
          style={{ backgroundColor: isLevelDiff ? '#1e3a5f' : undefined, color: '#6b7280' }}>
        {isTmRow
          ? <TmPopover tmCode={row.prefix} game={game}>{row.prefix}</TmPopover>
          : isTutorRow
          ? <TutorPopover game={game}>{row.prefix}</TutorPopover>
          : (row.prefix || '')}
      </td>
      <td className="py-0 px-1 text-sm font-medium text-white whitespace-nowrap">
        <WikiPopover name={row.moveName} type="move">{row.moveName}</WikiPopover>
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

function SelfCopyableHeader({ label, count, game, getTsv, exportMode, tableRef }: { label: string; count: number; game: string; getTsv: () => string; exportMode: ExportMode; tableRef?: React.RefObject<HTMLElement | null> }) {
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
    <div data-section-header data-export-ignore className="flex items-center gap-2 pt-3 pb-1 px-1">
      <div className="flex-1 h-px bg-gray-700" />
      <button
        onClick={handleClick}
        className="flex items-center gap-2 group shrink-0"
        title={exportMode === 'download' ? 'Click to export as image' : 'Click to copy as spreadsheet'}
      >
        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-300 transition-colors">
          {label}
        </span>
        <span data-section-interactive className="text-sm text-gray-600">({count})</span>
        <span data-section-interactive className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
          {feedback
            ? (exportMode === 'download' ? '✓ Saved' : '✓ Copied')
            : (exportMode === 'download' ? '↓ Export' : '⎘ Copy')}
        </span>
      </button>
      <div className="flex-1 h-px bg-gray-700" />
    </div>
  )
}

function SelfMoveSection({ label, rows, game, prefixLabel, col1, otherMoveNames, levelDiffKeys, sort, onSort, exportMode }: { label: string; rows: RowData[]; game: string; prefixLabel: string; col1?: string; otherMoveNames?: Set<string>; levelDiffKeys?: Set<string>; sort: SortState; onSort: (col: SortColumn) => void; exportMode: ExportMode }) {
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
      <SelfCopyableHeader label={label} count={rows.length} game={game} getTsv={() => buildTsv(rows, game, prefixLabel)} exportMode={exportMode} tableRef={sectionRef} />
      <table data-move-table className="w-full text-sm border-separate border-spacing-0">
        <SortableTableHeader sort={sort} onSort={onSort} col1={col1} />
        <tbody>
          {sorted.map((row, i) => <SelfMoveRow key={i} row={row} game={game} isUnique={otherMoveNames ? !otherMoveNames.has(row.moveName) : undefined} isLevelDiff={levelDiffKeys?.has(`${row.moveName}::${row.sortKey}`)} />)}
        </tbody>
      </table>
    </div>
  )
}

function useSingleMovepoolSections(pokemon: PokemonData, game: string) {
  const levelRows = useMemo(() => singleLevelRows(pokemon), [pokemon])
  const tmHmRows = useMemo(() => {
    return singleSimpleRows(pokemon.tm_hm_learnset)
      .map(row => ({ ...row, prefix: getTmHmCode(row.moveName, game) ?? '' }))
      .sort((a, b) => compareTmHmPrefix(a.prefix, b.prefix))
  }, [pokemon, game])
  const tutorRows = useMemo(() => singleSimpleRows(pokemon.tutor_learnset).map(row => ({ ...row, prefix: 'Tutor' })), [pokemon])
  const eggRows = useMemo(() => singleSimpleRows(pokemon.egg_moves), [pokemon])
  const transferRows = useMemo(() => singleSimpleRows(pokemon.transfer_learnset), [pokemon])
  return { levelRows, tmHmRows, tutorRows, eggRows, transferRows }
}

const MOVE_SECTIONS: { key: 'levelRows' | 'tmHmRows' | 'tutorRows' | 'eggRows' | 'transferRows'; label: string; prefixLabel: string; col1?: string }[] = [
  { key: 'levelRows', label: 'Level Up Learnset', prefixLabel: 'Lv' },
  { key: 'tmHmRows',  label: 'TM / HM', prefixLabel: 'TM/HM', col1: '' },
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

function SelfComparisonMovepools({ leftPokemon, rightPokemon, leftGame, rightGame, availableGames, onLeftGameChange, onRightGameChange, pokemonName }: {
  leftPokemon: PokemonData; rightPokemon: PokemonData; leftGame: string; rightGame: string
  availableGames: string[]
  onLeftGameChange: (game: string) => void; onRightGameChange: (game: string) => void
  pokemonName: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [exportMode, setExportMode] = useState<ExportMode>('copy')
  const [exportingMovepool, setExportingMovepool] = useState(false)

  const handleMovepoolExport = useCallback(async () => {
    if (!containerRef.current || exportingMovepool) return
    setExportingMovepool(true)
    try {
      await downloadMovepoolImage(
        containerRef.current,
        `${displayName(pokemonName)}_${leftGame}_vs_${rightGame}_movepool`,
        leftGame,
      )
    } catch (err) {
      console.error('Movepool export failed:', err)
    } finally {
      setExportingMovepool(false)
    }
  }, [exportingMovepool, pokemonName, leftGame, rightGame])
  const leftSections = useSingleMovepoolSections(leftPokemon, leftGame)
  const rightSections = useSingleMovepoolSections(rightPokemon, rightGame)
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

  const sectionRows = MOVE_SECTIONS.map(({ key, label, prefixLabel, col1 }) => {
    const lRows = leftSections[key]
    const rRows = rightSections[key]
    if (lRows.length === 0 && rRows.length === 0) return null
    const highlightDiff = showDiff && (key === 'tmHmRows' || key === 'levelRows')
    const lMoveNames = highlightDiff ? new Set(lRows.map(r => r.moveName)) : undefined
    const rMoveNames = highlightDiff ? new Set(rRows.map(r => r.moveName)) : undefined

    // For level-up: find rows whose move appears on the other side but at a different level.
    // Key format: "moveName::sortKey" so that duplicate-level entries are compared precisely.
    let lLevelDiffKeys: Set<string> | undefined
    let rLevelDiffKeys: Set<string> | undefined
    if (showDiff && key === 'levelRows') {
      const rExact = new Set(rRows.map(r => `${r.moveName}::${r.sortKey}`))
      const lExact = new Set(lRows.map(r => `${r.moveName}::${r.sortKey}`))
      lLevelDiffKeys = new Set(
        lRows
          .filter(r => rMoveNames!.has(r.moveName) && !rExact.has(`${r.moveName}::${r.sortKey}`))
          .map(r => `${r.moveName}::${r.sortKey}`)
      )
      rLevelDiffKeys = new Set(
        rRows
          .filter(r => lMoveNames!.has(r.moveName) && !lExact.has(`${r.moveName}::${r.sortKey}`))
          .map(r => `${r.moveName}::${r.sortKey}`)
      )
    }

    return { key, label, prefixLabel, col1, lRows, rRows, lMoveNames, rMoveNames, lLevelDiffKeys, rLevelDiffKeys }
  }).filter(Boolean) as { key: string; label: string; prefixLabel: string; col1?: string; lRows: RowData[]; rRows: RowData[]; lMoveNames?: Set<string>; rMoveNames?: Set<string>; lLevelDiffKeys?: Set<string>; rLevelDiffKeys?: Set<string> }[]

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div data-export-ignore className="px-4 pt-2 flex items-center justify-between">
        <ExportModeToggle mode={exportMode} onChange={setExportMode} />
        <button
          onClick={handleMovepoolExport}
          disabled={exportingMovepool}
          className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-60"
          title="Export movepool comparison as PNG"
        >
          {exportingMovepool ? (
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
      </div>
      {/* Gen/game selectors row */}
      <div className="flex justify-center px-4">
        <div className="w-full max-w-md ml-auto py-2">
          <div data-match-table-width className="ml-auto"><GameSelector availableGames={availableGames} selectedGame={leftGame} disabledGame={rightGame} onChange={onLeftGameChange} /></div>
        </div>
        <div className="w-px bg-gray-700 shrink-0 mx-2" />
        <div className="w-full max-w-md mr-auto py-2">
          <div data-match-table-width><GameSelector availableGames={availableGames} selectedGame={rightGame} disabledGame={leftGame} onChange={onRightGameChange} /></div>
        </div>
      </div>

      {/* Movepool sections */}
      {sectionRows.map(({ key, label, prefixLabel, col1, lRows, rRows, lMoveNames, rMoveNames, lLevelDiffKeys, rLevelDiffKeys }) => (
        <div key={key} className="flex justify-center px-4">
          <div className="w-full max-w-md ml-auto [&>div]:w-fit [&>div]:ml-auto">
            <SelfMoveSection label={label} rows={lRows} game={leftGame} prefixLabel={prefixLabel} col1={col1} otherMoveNames={rMoveNames} levelDiffKeys={lLevelDiffKeys} sort={getSort(key)} onSort={col => onSort(key, col)} exportMode={exportMode} />
          </div>
          <div className="w-px bg-gray-700 shrink-0 mx-2" />
          <div className="w-full max-w-md mr-auto [&>div]:w-fit">
            <SelfMoveSection label={label} rows={rRows} game={rightGame} prefixLabel={prefixLabel} col1={col1} otherMoveNames={lMoveNames} levelDiffKeys={rLevelDiffKeys} sort={getSort(key)} onSort={col => onSort(key, col)} exportMode={exportMode} />
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Side identity with gen selector ---
function SideIdentity({ pokemon, game }: {
  pokemon: PokemonData; game: string
}) {
  const isDualType = pokemon.type_1 !== pokemon.type_2
  return (
    <div className="flex flex-col items-center gap-1.5">
      <h2 className="text-center text-lg font-bold text-white leading-tight">{displayName(pokemon.species)}</h2>
      <div className="flex justify-center">
        <SelfCompSprite name={pokemon.species} dexNumber={pokemon.national_dex_number} scale={getSpriteScale(pokemon)} />
      </div>
      <div className="flex gap-1.5 justify-center -mt-5 relative z-10">
        <TypeBadge type={pokemon.type_1} game={game} />
        {isDualType && <TypeBadge type={pokemon.type_2} game={game} />}
      </div>
    </div>
  )
}

// --- Main component ---
interface Props {
  pokemonName: string
  initialGame: string
  initialRightGame?: string
  onExit: () => void
  onNavigate?: (name: string) => void
  onCompare?: (name: string) => void
  onSelfCompare?: (name: string) => void
}

export default function SelfComparisonView({ pokemonName, initialGame, initialRightGame, onExit, onNavigate, onCompare, onSelfCompare }: Props) {
  const availableGames = useMemo(() => getGamesForPokemon(pokemonName), [pokemonName])
  // Safe initial left game: use initialGame if available, else first available game
  const safeLeftGame = useMemo(() => {
    return availableGames.includes(initialGame) ? initialGame : (availableGames[0] ?? initialGame)
  }, [initialGame, availableGames])

  const [leftGame, setLeftGame] = useState(safeLeftGame)
  const [rightGame, setRightGame] = useState(() => {
    const games = getGamesForPokemon(pokemonName)
    if (initialRightGame && games.includes(initialRightGame)) return initialRightGame
    const leftG = games.includes(initialGame) ? initialGame : (games[0] ?? initialGame)
    const leftGenStr = GAME_TO_GEN[leftG]
    // Prefer the last game in a different gen
    const diffGenGame = [...games].reverse().find(g => GAME_TO_GEN[g] !== leftGenStr)
    if (diffGenGame) return diffGenGame
    return games.find(g => g !== leftG) ?? leftG
  })

  // Reset games when the pokemon changes
  useEffect(() => {
    const validSet = new Set(availableGames)
    setLeftGame(prev => validSet.has(prev) ? prev : safeLeftGame)
    setRightGame(prev => {
      if (validSet.has(prev)) return prev
      const leftGenStr = GAME_TO_GEN[safeLeftGame]
      const diffGenGame = [...availableGames].reverse().find(g => GAME_TO_GEN[g] !== leftGenStr)
      if (diffGenGame) return diffGenGame
      return availableGames.find(g => g !== safeLeftGame) ?? safeLeftGame
    })
  }, [pokemonName, availableGames, safeLeftGame])

  const leftPokemon = useMemo(() => getPokemonData(pokemonName, leftGame), [pokemonName, leftGame])
  const rightPokemon = useMemo(() => getPokemonData(pokemonName, rightGame), [pokemonName, rightGame])

  const leftMatchups = useMemo(() =>
    leftPokemon ? getPokemonDefenseMatchups(leftPokemon.type_1, leftPokemon.type_2, leftGame) : {},
    [leftPokemon, leftGame]
  )
  const rightMatchups = useMemo(() =>
    rightPokemon ? getPokemonDefenseMatchups(rightPokemon.type_1, rightPokemon.type_2, rightGame) : {},
    [rightPokemon, rightGame]
  )

  if (!leftPokemon || !rightPokemon) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>Pokemon not available in one of the selected generations.</p>
        <button onClick={onExit} className="ml-4 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          Exit <span className="text-gray-500">[Esc]</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
      {/* Top section: identity + stats + effectiveness */}
      <div className="shrink-0 border-b border-gray-700 px-3 py-3 overflow-y-auto" style={{ maxHeight: '55vh' }}>
        <div className="flex items-start gap-3">
          {/* Left effectiveness */}
          <div className="w-36 shrink-0 flex flex-col items-end self-center">
            <SelfEffectiveness
              type1={leftPokemon.type_1} type2={leftPokemon.type_2}
              game={leftGame} abilities={[...new Set(leftPokemon.abilities)]}
              align="right"
              otherMatchups={rightMatchups}
            />
          </div>

          {/* Left identity */}
          <div className="w-48 shrink-0 self-center">
            <SideIdentity pokemon={leftPokemon} game={leftGame} />
          </div>

          {/* Center: stats comparison */}
          <div className="flex-1 min-w-[280px] self-center">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Base Stats</p>
            <SelfStatComparison left={leftPokemon.base_stats} right={rightPokemon.base_stats} leftGame={leftGame} rightGame={rightGame} name={pokemonName} onNavigate={onNavigate} onCompare={onCompare} onSelfCompare={onSelfCompare} />
          </div>

          {/* Right identity */}
          <div className="w-48 shrink-0 self-center">
            <SideIdentity pokemon={rightPokemon} game={rightGame} />
          </div>

          {/* Right effectiveness */}
          <div className="w-36 shrink-0 flex flex-col items-start self-center">
            <SelfEffectiveness
              type1={rightPokemon.type_1} type2={rightPokemon.type_2}
              game={rightGame} abilities={[...new Set(rightPokemon.abilities)]}
              align="left"
              otherMatchups={leftMatchups}
            />
          </div>

        </div>
      </div>

      {/* Scrollable: side-by-side movepools */}
      <SelfComparisonMovepools
        leftPokemon={leftPokemon}
        rightPokemon={rightPokemon}
        leftGame={leftGame}
        rightGame={rightGame}
        availableGames={availableGames}
        onLeftGameChange={setLeftGame}
        onRightGameChange={setRightGame}
        pokemonName={pokemonName}
      />
    </div>
  )
}
