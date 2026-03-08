import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData, getGamesForPokemon, GEN_GROUPS, GAME_ABBREV, GAME_COLOR, getMoveData, getTmHmCode, getPokemonStatRanking, getPokemonTotalRanking } from '../data'
import type { StatRankEntry } from '../data'
import { FORM_SPRITE_IDS } from '../data/formSprites'
import type { BaseStats as BaseStatsType } from '../types/pokemon'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TmPopover from './TmPopover'
import { getPokemonDefenseMatchups } from '../data'
import type { GenGameData } from './Movepool'
import type { MoveData as MoveDataType } from '../types/pokemon'
import { createPortal } from 'react-dom'

const ARTWORK_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

function ComparisonSprite({ name, dexNumber }: { name: string; dexNumber: number }) {
  const [src, setSrc] = useState(`${ARTWORK_BASE}/${FORM_SPRITE_IDS[name] ?? dexNumber}.png`)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const id = FORM_SPRITE_IDS[name] ?? dexNumber
    setSrc(`${ARTWORK_BASE}/${id}.png`)
    setFailed(false)
  }, [name, dexNumber])

  if (failed) {
    return (
      <div className="w-28 h-28 flex items-center justify-center text-gray-700 text-4xl select-none">?</div>
    )
  }
  return <img src={src} alt="" className="w-28 h-28 object-contain drop-shadow-lg" onError={() => setFailed(true)} />
}

const STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',              label: 'HP',     color: '#78C850' },
  { key: 'attack',          label: 'Atk',    color: '#F8D030' },
  { key: 'defense',         label: 'Def',    color: '#F08030' },
  { key: 'special_attack',  label: 'Sp.Atk', color: '#6890F0' },
  { key: 'special_defense', label: 'Sp.Def', color: '#7038F8' },
  { key: 'speed',           label: 'Spd',    color: '#F85888' },
]

const GEN1_STAT_CONFIG: { key: keyof BaseStatsType; label: string; color: string }[] = [
  { key: 'hp',             label: 'HP',      color: '#78C850' },
  { key: 'attack',         label: 'Atk',     color: '#F8D030' },
  { key: 'defense',        label: 'Def',     color: '#F08030' },
  { key: 'special_attack', label: 'Special', color: '#6890F0' },
  { key: 'speed',          label: 'Spd',     color: '#F85888' },
]

const MAX_STAT = 255
const GEN1_GAMES = new Set(['Red and Blue', 'Yellow'])

interface RowData {
  moveName: string
  sortKey: number
  prefix: string
  gameTags: { abbrev: string; color: string }[]
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
  return Array.from(map.values())
    .map(({ level, moveName, games }) => {
      const allGames = games.size === total
      const gameTags = allGames ? [] : genData.filter(gd => games.has(gd.game)).map(gd => ({ abbrev: gd.abbrev, color: gd.color }))
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
    const gameTags = allGames ? [] : genData.filter(gd => games.includes(gd.game)).map(gd => ({ abbrev: gd.abbrev, color: gd.color }))
    return { moveName, sortKey: 0, prefix: '', gameTags }
  })
}

function singleLevelRows(pokemon: PokemonData): RowData[] {
  return pokemon.level_up_learnset.map(([level, moveName]) => ({
    moveName, sortKey: level, prefix: String(level), gameTags: [],
  }))
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

function CompMoveRow({ row, game }: { row: RowData; game: string }) {
  const move: MoveDataType | null = getMoveData(row.moveName, game)
  const isTmRow = row.prefix.startsWith('TM') || row.prefix.startsWith('HM')
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
        color: move?.category === 'Physical' ? '#fb923c' : move?.category === 'Special' ? '#60a5fa' : '#9ca3af'
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

function CopyableSectionHeader({ label, count, getTsv }: { label: string; count: number; getTsv: () => string }) {
  const [copied, setCopied] = useState(false)
  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(getTsv()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [getTsv])
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 px-1">
      <button onClick={handleClick} className="flex items-center gap-2 group" title="Click to copy as spreadsheet">
        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-300 transition-colors">{label}</span>
        <span className="text-sm text-gray-600">({count})</span>
        <span className="text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
          {copied ? '✓ Copied' : '⎘ Copy'}
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
        const order = (p: string) => p.startsWith('TM') ? 0 : p.startsWith('TR') ? 1 : p.startsWith('HM') ? 2 : 3
        const oa = order(a.prefix), ob = order(b.prefix)
        if (oa !== ob) return oa - ob
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

  return { levelRows, tmHmRows, tutorRows, eggRows }
}

function MoveSection({ label, rows, game, prefixLabel }: { label: string; rows: RowData[]; game: string; prefixLabel: string }) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 pt-3 pb-1 px-1">
          <span className="text-sm font-bold text-gray-600 uppercase tracking-widest">{label}</span>
          <span className="text-sm text-gray-700">(0)</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>
      </div>
    )
  }
  return (
    <div>
      <CopyableSectionHeader label={label} count={rows.length} getTsv={() => buildTsv(rows, game, prefixLabel)} />
      <table className="w-full text-sm border-separate border-spacing-0">
        {TABLE_HEADER}
        <tbody>
          {rows.map((row, i) => <CompMoveRow key={i} row={row} game={game} />)}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonRankingPopover({ title, statColor, ranking, highlightNames, anchorRect, onClose, preferSide = 'right' }: {
  title: string; statColor: string; ranking: StatRankEntry[]; highlightNames: string[]; anchorRect: DOMRect; onClose: () => void; preferSide?: 'left' | 'right'
}) {
  const firstRef = useCallback((el: HTMLTableRowElement | null) => {
    el?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-comp-stat-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const POPOVER_WIDTH = 260
  const POPOVER_HEIGHT = 400
  const fitsRight = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
  const fitsLeft = anchorRect.left - POPOVER_WIDTH - 6 >= 0
  const left = preferSide === 'left'
    ? (fitsLeft ? anchorRect.left - POPOVER_WIDTH - 6 : anchorRect.right + 6)
    : (fitsRight ? anchorRect.right + 6 : anchorRect.left - POPOVER_WIDTH - 6)
  const top = Math.min(Math.max(6, anchorRect.top - POPOVER_HEIGHT / 2), window.innerHeight - POPOVER_HEIGHT - 6)
  const nameSet = new Set(highlightNames)
  let firstHighlightDone = false

  return createPortal(
    <div
      data-comp-stat-popover
      style={{ position: 'fixed', top, left, zIndex: 9999, width: `${POPOVER_WIDTH}px` }}
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
              const isCurrent = nameSet.has(name)
              let ref: ((el: HTMLTableRowElement | null) => void) | undefined
              if (isCurrent && !firstHighlightDone) { ref = firstRef; firstHighlightDone = true }
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

function StatComparison({ left, right, game, leftName, rightName }: { left: BaseStatsType; right: BaseStatsType; game: string; leftName: string; rightName: string }) {
  const [openPopover, setOpenPopover] = useState<{ id: string; title: string; color: string; ranking: StatRankEntry[]; rect: DOMRect; highlightName: string; side: 'left' | 'right' } | null>(null)
  const isGen1 = GEN1_GAMES.has(game)
  const config = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG
  const totalL = isGen1
    ? left.hp + left.attack + left.defense + left.special_attack + left.speed
    : Object.values(left).reduce((s, v) => s + v, 0)
  const totalR = isGen1
    ? right.hp + right.attack + right.defense + right.special_attack + right.speed
    : Object.values(right).reduce((s, v) => s + v, 0)

  const getSide = useCallback((e: React.MouseEvent): 'left' | 'right' => {
    const rect = e.currentTarget.getBoundingClientRect()
    return e.clientX < rect.left + rect.width / 2 ? 'left' : 'right'
  }, [])

  const handleStatClick = useCallback((e: React.MouseEvent, key: keyof BaseStatsType, label: string, color: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const side = getSide(e)
    const name = side === 'left' ? leftName : rightName
    setOpenPopover(prev => prev?.id === `${key}_${side}` ? null : {
      id: `${key}_${side}`, title: `${label} Ranking — ${name}`, color,
      ranking: getPokemonStatRanking(key, game), rect, highlightName: name, side,
    })
  }, [game, leftName, rightName, getSide])

  const handleTotalClick = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const side = getSide(e)
    const name = side === 'left' ? leftName : rightName
    setOpenPopover(prev => prev?.id === `__total__${side}` ? null : {
      id: `__total__${side}`, title: `Total Ranking — ${name}`, color: '#94a3b8',
      ranking: getPokemonTotalRanking(game), rect, highlightName: name, side,
    })
  }, [game, leftName, rightName, getSide])

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
              title={`Rank all Pokemon by ${label}`}
            >
              {/* Left diff */}
              <span className={`w-9 text-right text-sm font-bold tabular-nums shrink-0 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
              </span>
              {/* Left value + bar (right-aligned) */}
              <div className="flex-1 flex items-center gap-1.5 justify-end">
                <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden flex justify-end">
                  <div className="h-full rounded-full" style={{ width: `${lPct}%`, backgroundColor: color, opacity: 0.85 }} />
                </div>
                <span className={`w-7 text-right text-sm font-bold tabular-nums ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-200'}`}>
                  {lv}
                </span>
              </div>
              {/* Label */}
              <span className="w-12 text-center text-xs font-semibold text-gray-500 shrink-0">{label}</span>
              {/* Right value + bar (left-aligned) */}
              <div className="flex-1 flex items-center gap-1.5">
                <span className={`w-7 text-left text-sm font-bold tabular-nums ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-gray-200'}`}>
                  {rv}
                </span>
                <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${rPct}%`, backgroundColor: color, opacity: 0.85 }} />
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
          onClick={handleTotalClick}
          title="Rank all Pokemon by Base Stat Total"
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
        <ComparisonRankingPopover
          title={openPopover.title}
          statColor={openPopover.color}
          ranking={openPopover.ranking}
          highlightNames={[openPopover.highlightName]}
          anchorRect={openPopover.rect}
          onClose={() => setOpenPopover(null)}
          preferSide={openPopover.side}
        />
      )}
    </>
  )
}

const EFF_GROUPS = [
  { label: 'Weak',    value: 4,    multiplierLabel: '×4', bg: '#7f1d1d', text: '#fca5a5' },
  { label: 'Weak',    value: 2,    multiplierLabel: '×2', bg: '#451a03', text: '#fdba74' },
  { label: 'Resists', value: 0.5,  multiplierLabel: '½×', bg: '#14532d', text: '#86efac' },
  { label: 'Resists', value: 0.25, multiplierLabel: '¼×', bg: '#1e3a5f', text: '#93c5fd' },
  { label: 'Immune',  value: 0,    multiplierLabel: '0×', bg: '#1f2937', text: '#9ca3af' },
]

const ABILITY_IMMUNITIES: Record<string, string> = {
  'Levitate': 'Ground', 'Flash Fire': 'Fire', 'Water Absorb': 'Water',
  'Dry Skin': 'Water', 'Storm Drain': 'Water', 'Volt Absorb': 'Electric',
  'Motor Drive': 'Electric', 'Lightning Rod': 'Electric', 'Sap Sipper': 'Grass',
  'Earth Eater': 'Ground', 'Well-Baked Body': 'Fire', 'Wind Rider': 'Flying',
}

function ComparisonEffectiveness({ type1, type2, game, abilities, align }: { type1: string; type2: string; game: string; abilities: string[]; align: 'left' | 'right' }) {
  const matchups = getPokemonDefenseMatchups(type1, type2, game)
  const abilityImmunityMap: Record<string, string> = {}
  for (const ability of abilities) {
    const immuneType = ABILITY_IMMUNITIES[ability]
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
      <ComparisonSprite name={pokemon.species} dexNumber={pokemon.national_dex_number} />
      <div className="text-center">
        <p className="text-xs font-mono text-gray-600">#{String(pokemon.national_dex_number).padStart(3, '0')}</p>
        <h2 className="text-lg font-bold text-white leading-tight">{pokemon.species}</h2>
        <div className="flex gap-1.5 mt-1 justify-center">
          <TypeBadge type={pokemon.type_1} game={game} />
          {isDualType && <TypeBadge type={pokemon.type_2} game={game} />}
        </div>
      </div>
      {pokemon.evolution_family.length > 1 && (
        <div className="w-full border-t border-gray-800 pt-1.5 mt-0.5">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-1 text-center">Evolution</p>
          <div className="flex flex-col gap-0.5 items-center">
            {pokemon.evolution_family.map((evo, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && evo.method && (
                  <span className="text-xs text-gray-600">
                    {evo.method === 'level' ? `Lv.${evo.parameter}` : evo.method} →
                  </span>
                )}
                <button
                  onClick={() => onSelect(evo.species)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    evo.species === pokemon.species
                      ? 'bg-gray-600 text-white font-bold cursor-default'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {evo.species}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const SECTIONS: { key: keyof MovepoolSections; label: string; prefixLabel: string }[] = [
  { key: 'levelRows', label: 'Level Up', prefixLabel: 'Level' },
  { key: 'tmHmRows',  label: 'TM / HM',  prefixLabel: 'TM/HM' },
  { key: 'tutorRows', label: 'Move Tutor', prefixLabel: '' },
  { key: 'eggRows',   label: 'Egg Moves', prefixLabel: '' },
]

function ComparisonMovepools({ leftPokemon, rightPokemon, game, leftGenData, rightGenData }: {
  leftPokemon: PokemonData; rightPokemon: PokemonData; game: string; leftGenData: GenGameData[]; rightGenData: GenGameData[]
}) {
  const leftSections = useMovepoolSections(leftPokemon, game, leftGenData)
  const rightSections = useMovepoolSections(rightPokemon, game, rightGenData)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex gap-4 px-4 py-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-400 mb-1">{leftPokemon.species} Moves</h3>
        </div>
        <div className="w-px bg-gray-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-400 mb-1">{rightPokemon.species} Moves</h3>
        </div>
      </div>
      {SECTIONS.map(({ key, label, prefixLabel }) => {
        const lRows = leftSections[key]
        const rRows = rightSections[key]
        if (lRows.length === 0 && rRows.length === 0) return null
        return (
          <div key={key} className="flex gap-4 px-4">
            <div className="flex-1 min-w-0">
              <MoveSection label={label} rows={lRows} game={game} prefixLabel={prefixLabel} />
            </div>
            <div className="w-px bg-gray-700 shrink-0" />
            <div className="flex-1 min-w-0">
              <MoveSection label={label} rows={rRows} game={game} prefixLabel={prefixLabel} />
            </div>
          </div>
        )
      })}
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
}

export default function ComparisonView({ leftName, rightName, selectedGame, onSelectLeft, onSelectRight, onExit }: Props) {
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

  if (!leftPokemon || !rightPokemon) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>One or both Pokemon not available in this game.</p>
        <button onClick={onExit} className="ml-4 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          Exit Comparison
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
      {/* Sticky top: Effectiveness | Pokemon | Stats | Stats | Pokemon | Effectiveness */}
      <div className="shrink-0 border-b border-gray-700 px-3 py-3 overflow-y-auto" style={{ maxHeight: '55vh' }}>
        <div className="flex items-start gap-3">
          {/* Left effectiveness */}
          <div className="w-36 shrink-0 flex flex-col items-end pt-2">
            <ComparisonEffectiveness
              type1={leftPokemon.type_1} type2={leftPokemon.type_2}
              game={selectedGame} abilities={[...new Set(leftPokemon.abilities)]}
              align="right"
            />
          </div>

          {/* Left Pokemon identity */}
          <div className="w-40 shrink-0">
            <PokemonIdentity pokemon={leftPokemon} game={selectedGame} onSelect={onSelectLeft} />
          </div>

          {/* Center: stats comparison */}
          <div className="flex-1 min-w-[280px] pt-6">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Base Stats</p>
            <StatComparison left={leftPokemon.base_stats} right={rightPokemon.base_stats} game={selectedGame} leftName={leftName} rightName={rightName} />
          </div>

          {/* Right Pokemon identity */}
          <div className="w-40 shrink-0">
            <PokemonIdentity pokemon={rightPokemon} game={selectedGame} onSelect={onSelectRight} />
          </div>

          {/* Right effectiveness */}
          <div className="w-36 shrink-0 flex flex-col items-start pt-2">
            <ComparisonEffectiveness
              type1={rightPokemon.type_1} type2={rightPokemon.type_2}
              game={selectedGame} abilities={[...new Set(rightPokemon.abilities)]}
              align="left"
            />
          </div>

        </div>
      </div>

      {/* Scrollable: aligned side-by-side movepools */}
      <ComparisonMovepools
        leftPokemon={leftPokemon}
        rightPokemon={rightPokemon}
        game={selectedGame}
        leftGenData={leftGenData}
        rightGenData={rightGenData}
      />
    </div>
  )
}
