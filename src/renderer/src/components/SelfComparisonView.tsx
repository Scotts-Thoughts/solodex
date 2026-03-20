import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData, getGamesForPokemon, GEN_GROUPS, GAME_TO_GEN, getMoveData, getTmHmCode, getPokemonStatRanking, getPokemonTotalRanking, getPokemonDefenseMatchups, displayName } from '../data'
import type { StatRankEntry } from '../data'
import type { BaseStats as BaseStatsType, MoveData as MoveDataType } from '../types/pokemon'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TmPopover from './TmPopover'
import TutorPopover from './TutorPopover'
import type { GenGameData } from './Movepool'
import { createPortal } from 'react-dom'
import { STAT_CONFIG, GEN1_STAT_CONFIG, MAX_STAT, GEN1_GAMES } from '../constants/stats'
import { EFF_GROUPS, ABILITY_IMMUNITIES } from '../constants/effectiveness'
import { POPOVER_Z, getCategoryColor, ARTWORK_BASE } from '../constants/ui'
import { getArtworkUrl } from '../utils/sprites'
import { usePopoverDismiss } from '../hooks/usePopoverDismiss'
import { compareTmHmPrefix } from '../utils/tmhmSort'

function SelfCompSprite({ name, dexNumber }: { name: string; dexNumber: number }) {
  const [src, setSrc] = useState(getArtworkUrl(name, dexNumber))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setSrc(getArtworkUrl(name, dexNumber))
    setFailed(false)
  }, [name, dexNumber])
  if (failed) return <div className="w-36 h-36 flex items-center justify-center text-gray-700 text-4xl select-none">?</div>
  return <img src={src} alt="" className="w-36 h-36 object-contain drop-shadow-lg" onError={() => setFailed(true)} />
}

// --- Generation selector for each side ---
function GenSelector({ availableGens, selectedGen, disabledGen, onChange }: {
  availableGens: { gen: string; label: string; color: string }[]
  selectedGen: string
  disabledGen: string
  onChange: (gen: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {availableGens.map(({ gen, label, color }) => {
        const isActive = gen === selectedGen
        const isDisabled = gen === disabledGen
        return (
          <button
            key={gen}
            onClick={() => !isDisabled && onChange(gen)}
            disabled={isDisabled}
            className={`px-1.5 py-0.5 text-xs font-bold rounded transition-colors ${
              isActive
                ? 'text-white'
                : isDisabled
                  ? 'text-gray-700 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-300'
            }`}
            style={isActive ? { backgroundColor: color } : undefined}
            title={isDisabled ? `Already shown on the other side` : label}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Get the available gens for a species, with the first game per gen */
function getAvailableGens(availableGames: string[]): { gen: string; label: string; color: string; firstGame: string }[] {
  const result: { gen: string; label: string; color: string; firstGame: string }[] = []
  for (const group of GEN_GROUPS) {
    const gamesInGen = group.games.filter(g => availableGames.includes(g))
    if (gamesInGen.length > 0) {
      const gen = GAME_TO_GEN[gamesInGen[0]]
      result.push({ gen, label: group.label, color: group.color, firstGame: gamesInGen[0] })
    }
  }
  return result
}

// Stat config, effectiveness groups, and ability immunities imported from shared constants

function SelfStatComparison({ left, right, leftGame, rightGame, name }: {
  left: BaseStatsType; right: BaseStatsType; leftGame: string; rightGame: string; name: string
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
                  <div className="h-full rounded-sm" style={{ width: `${lPct}%`, backgroundColor: color, opacity: 0.85 }} />
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
                  <div className="h-full rounded-sm" style={{ width: `${rPct}%`, backgroundColor: color, opacity: 0.85 }} />
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
        />
      )}
    </>
  )
}

function SelfRankingPopover({ title, statColor, ranking, highlightName, anchorRect, onClose }: {
  title: string; statColor: string; ranking: StatRankEntry[]; highlightName: string; anchorRect: DOMRect; onClose: () => void
}) {
  const firstRef = useCallback((el: HTMLTableRowElement | null) => {
    el?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [])

  usePopoverDismiss('[data-self-stat-popover]', onClose)

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
            {ranking.map(({ name, value, rank }) => {
              const isCurrent = name === highlightName
              let ref: ((el: HTMLTableRowElement | null) => void) | undefined
              if (isCurrent && !firstDone.current) { ref = firstRef; firstDone.current = true }
              return (
                <tr key={name} ref={ref} style={{ backgroundColor: isCurrent ? `${statColor}22` : 'transparent' }}>
                  <td className="py-0.5 px-2 tabular-nums text-gray-500">{rank}</td>
                  <td className="py-0.5 px-2 font-medium" style={{ color: isCurrent ? statColor : '#a8b6c2' }}>{name}</td>
                  <td className="py-0.5 px-2 tabular-nums text-right text-gray-300">{value}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
    const immuneType = ABILITY_IMMUNITIES[ability]
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

function SelfMoveRow({ row, game }: { row: RowData; game: string }) {
  const move: MoveDataType | null = getMoveData(row.moveName, game)
  const isTmRow = row.prefix.startsWith('TM') || row.prefix.startsWith('HM')
  const isTutorRow = row.prefix === 'Tutor'
  return (
    <tr
      className="border-b border-gray-800"
      style={{ backgroundColor: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1a1f29')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <td className="py-0 px-1 text-sm text-gray-500 w-10 tabular-nums shrink-0 whitespace-nowrap">
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

const TH = 'sticky top-0 bg-gray-900 z-10 py-1 px-1 text-sm text-gray-600 font-semibold'

function TableHeader({ col1 = 'Lv' }: { col1?: string } = {}) {
  return (
    <thead>
      <tr>
        <th className={`${TH} text-left w-10`}>{col1}</th>
        <th className={`${TH} text-left`}>Move</th>
        <th className={`${TH} text-left`}>Type</th>
        <th className={`${TH} text-left`}>Cat</th>
        <th className={`${TH} text-right`}>Pwr</th>
        <th className={`${TH} text-right`}>Acc</th>
        <th className={`${TH} text-right`}>PP</th>
      </tr>
    </thead>
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

function SelfCopyableHeader({ label, count, getTsv }: { label: string; count: number; getTsv: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(getTsv()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [getTsv])

  return (
    <div className="flex items-center gap-2 pt-3 pb-1 px-1">
      <div className="flex-1 h-px bg-gray-700" />
      <button
        onClick={handleClick}
        className="flex items-center gap-2 group shrink-0"
        title="Click to copy as spreadsheet"
      >
        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-300 transition-colors">
          {label}
        </span>
        <span className="text-sm text-gray-600">({count})</span>
        <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
          {copied ? '✓ Copied' : '⎘ Copy'}
        </span>
      </button>
      <div className="flex-1 h-px bg-gray-700" />
    </div>
  )
}

function SelfMoveSection({ label, rows, game, prefixLabel, col1 }: { label: string; rows: RowData[]; game: string; prefixLabel: string; col1?: string }) {
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
  return (
    <div>
      <SelfCopyableHeader label={label} count={rows.length} getTsv={() => buildTsv(rows, game, prefixLabel)} />
      <table data-move-table className="w-full text-sm border-separate border-spacing-0">
        <TableHeader col1={col1} />
        <tbody>
          {rows.map((row, i) => <SelfMoveRow key={i} row={row} game={game} />)}
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
  return { levelRows, tmHmRows, tutorRows, eggRows }
}

const MOVE_SECTIONS: { key: 'levelRows' | 'tmHmRows' | 'tutorRows' | 'eggRows'; label: string; prefixLabel: string; col1?: string }[] = [
  { key: 'levelRows', label: 'Level Up Learnset', prefixLabel: 'Lv' },
  { key: 'tmHmRows',  label: 'TM / HM', prefixLabel: 'TM/HM', col1: '' },
  { key: 'tutorRows', label: 'Move Tutor', prefixLabel: 'Tutor', col1: '' },
  { key: 'eggRows',   label: 'Egg Moves', prefixLabel: '', col1: '' },
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

function SelfComparisonMovepools({ leftPokemon, rightPokemon, leftGame, rightGame, availableGens, leftGen, rightGen, onLeftGenChange, onRightGenChange }: {
  leftPokemon: PokemonData; rightPokemon: PokemonData; leftGame: string; rightGame: string
  availableGens: { gen: string; label: string; color: string; firstGame: string }[]
  leftGen: string; rightGen: string
  onLeftGenChange: (gen: string) => void; onRightGenChange: (gen: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const leftSections = useSingleMovepoolSections(leftPokemon, leftGame)
  const rightSections = useSingleMovepoolSections(rightPokemon, rightGame)

  useLayoutEffect(() => { syncColumnWidths(containerRef.current) })

  const sectionRows = MOVE_SECTIONS.map(({ key, label, prefixLabel, col1 }) => {
    const lRows = leftSections[key]
    const rRows = rightSections[key]
    if (lRows.length === 0 && rRows.length === 0) return null
    return { key, label, prefixLabel, col1, lRows, rRows }
  }).filter(Boolean) as { key: string; label: string; prefixLabel: string; col1?: string; lRows: RowData[]; rRows: RowData[] }[]

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {/* Gen selectors row */}
      <div className="flex justify-center px-4">
        <div className="w-full max-w-md py-2">
          <GenSelector availableGens={availableGens} selectedGen={leftGen} disabledGen={rightGen} onChange={onLeftGenChange} />
        </div>
        <div className="w-px bg-gray-700 shrink-0 mx-2" />
        <div className="w-full max-w-md py-2">
          <GenSelector availableGens={availableGens} selectedGen={rightGen} disabledGen={leftGen} onChange={onRightGenChange} />
        </div>
      </div>

      {/* Movepool sections */}
      {sectionRows.map(({ key, label, prefixLabel, col1, lRows, rRows }) => (
        <div key={key} className="flex justify-center px-4">
          <div className="w-full max-w-md">
            <SelfMoveSection label={label} rows={lRows} game={leftGame} prefixLabel={prefixLabel} col1={col1} />
          </div>
          <div className="w-px bg-gray-700 shrink-0 mx-2" />
          <div className="w-full max-w-md">
            <SelfMoveSection label={label} rows={rRows} game={rightGame} prefixLabel={prefixLabel} col1={col1} />
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
        <SelfCompSprite name={pokemon.species} dexNumber={pokemon.national_dex_number} />
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
  onExit: () => void
}

export default function SelfComparisonView({ pokemonName, initialGame, onExit }: Props) {
  const availableGames = useMemo(() => getGamesForPokemon(pokemonName), [pokemonName])
  const availableGens = useMemo(() => getAvailableGens(availableGames), [availableGames])

  // Use initialGame's gen if that game is available, otherwise fall back to first available gen
  const safeInitialGen = useMemo(() => {
    const gen = GAME_TO_GEN[initialGame]
    if (gen && availableGens.some(g => g.gen === gen)) return gen
    return availableGens[0]?.gen ?? '1'
  }, [initialGame, availableGens])

  const [leftGen, setLeftGen] = useState(safeInitialGen)
  const [rightGen, setRightGen] = useState(() => {
    const other = availableGens.filter(g => g.gen !== safeInitialGen)
    return other.length > 0 ? other[other.length - 1].gen : safeInitialGen
  })

  // Reset gens when the pokemon or available gens change
  useEffect(() => {
    const validGens = new Set(availableGens.map(g => g.gen))
    setLeftGen(prev => validGens.has(prev) ? prev : safeInitialGen)
    setRightGen(prev => {
      if (validGens.has(prev) && prev !== safeInitialGen) return prev
      const other = availableGens.filter(g => g.gen !== safeInitialGen)
      return other.length > 0 ? other[other.length - 1].gen : safeInitialGen
    })
  }, [pokemonName, availableGens, safeInitialGen])

  // Resolve gen to a game — always fall back to first available game, never initialGame
  const fallbackGame = availableGens[0]?.firstGame ?? initialGame

  const leftGame = useMemo(() => {
    return availableGens.find(g => g.gen === leftGen)?.firstGame ?? fallbackGame
  }, [leftGen, availableGens, fallbackGame])

  const rightGame = useMemo(() => {
    return availableGens.find(g => g.gen === rightGen)?.firstGame ?? fallbackGame
  }, [rightGen, availableGens, fallbackGame])

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
          Exit
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
            <SelfStatComparison left={leftPokemon.base_stats} right={rightPokemon.base_stats} leftGame={leftGame} rightGame={rightGame} name={pokemonName} />
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
        availableGens={availableGens}
        leftGen={leftGen}
        rightGen={rightGen}
        onLeftGenChange={setLeftGen}
        onRightGenChange={setRightGen}
      />
    </div>
  )
}
