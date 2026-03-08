import { useState, useMemo } from 'react'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData, getGamesForPokemon, GEN_GROUPS, GAME_ABBREV, GAME_COLOR, GAME_TO_GEN, getMoveData, getTmHmCode, getPokemonStatRanking, getPokemonTotalRanking, getPokemonDefenseMatchups } from '../data'
import type { StatRankEntry } from '../data'
import { FORM_SPRITE_IDS } from '../data/formSprites'
import type { BaseStats as BaseStatsType, MoveData as MoveDataType } from '../types/pokemon'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TmPopover from './TmPopover'
import type { GenGameData } from './Movepool'
import { createPortal } from 'react-dom'
import { useCallback, useEffect } from 'react'

const ARTWORK_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'

function SelfCompSprite({ name, dexNumber }: { name: string; dexNumber: number }) {
  const [src, setSrc] = useState(`${ARTWORK_BASE}/${FORM_SPRITE_IDS[name] ?? dexNumber}.png`)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const id = FORM_SPRITE_IDS[name] ?? dexNumber
    setSrc(`${ARTWORK_BASE}/${id}.png`)
    setFailed(false)
  }, [name, dexNumber])
  if (failed) return <div className="w-28 h-28 flex items-center justify-center text-gray-700 text-4xl select-none">?</div>
  return <img src={src} alt="" className="w-28 h-28 object-contain drop-shadow-lg" onError={() => setFailed(true)} />
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

// --- Stat comparison (reused pattern from ComparisonView) ---
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
                <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden flex justify-end">
                  <div className="h-full rounded-full" style={{ width: `${lPct}%`, backgroundColor: color, opacity: 0.85 }} />
                </div>
                <span className={`w-7 text-right text-sm font-bold tabular-nums ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-200'}`}>
                  {lv}
                </span>
              </div>
              <span className="w-12 text-center text-xs font-semibold text-gray-500 shrink-0">{label}</span>
              <div className="flex-1 flex items-center gap-1.5">
                <span className={`w-7 text-left text-sm font-bold tabular-nums ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-gray-200'}`}>
                  {rv}
                </span>
                <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${rPct}%`, backgroundColor: color, opacity: 0.85 }} />
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-self-stat-popover]')) onClose()
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
  const left = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
    ? anchorRect.right + 6
    : anchorRect.left - POPOVER_WIDTH - 6
  const top = Math.min(Math.max(6, anchorRect.top - POPOVER_HEIGHT / 2), window.innerHeight - POPOVER_HEIGHT - 6)
  let firstDone = false

  return createPortal(
    <div
      data-self-stat-popover
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
              const isCurrent = name === highlightName
              let ref: ((el: HTMLTableRowElement | null) => void) | undefined
              if (isCurrent && !firstDone) { ref = firstRef; firstDone = true }
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

function singleLevelRows(pokemon: PokemonData): RowData[] {
  return pokemon.level_up_learnset.map(([level, moveName]) => ({
    moveName, sortKey: level, prefix: String(level), gameTags: [],
  }))
}

function singleSimpleRows(moves: string[]): RowData[] {
  return moves.map(moveName => ({ moveName, sortKey: 0, prefix: '', gameTags: [] }))
}

function SelfMoveRow({ row, game }: { row: RowData; game: string }) {
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
        {isTmRow ? <TmPopover tmCode={row.prefix} game={game}>{row.prefix}</TmPopover> : (row.prefix || '')}
      </td>
      <td className="py-0 px-1 text-sm font-medium text-white whitespace-nowrap">
        <WikiPopover name={row.moveName} type="move">{row.moveName}</WikiPopover>
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

function SelfMoveSection({ label, rows, game }: { label: string; rows: RowData[]; game: string }) {
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
      <div className="flex items-center gap-2 pt-3 pb-1 px-1">
        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">{label}</span>
        <span className="text-sm text-gray-600">({rows.length})</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>
      <table className="w-full text-sm border-separate border-spacing-0">
        {TABLE_HEADER}
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
      .sort((a, b) => {
        const order = (p: string) => p.startsWith('TM') ? 0 : p.startsWith('TR') ? 1 : p.startsWith('HM') ? 2 : 3
        const oa = order(a.prefix), ob = order(b.prefix)
        if (oa !== ob) return oa - ob
        return parseInt(a.prefix.slice(2) || '0') - parseInt(b.prefix.slice(2) || '0')
      })
  }, [pokemon, game])
  const tutorRows = useMemo(() => singleSimpleRows(pokemon.tutor_learnset), [pokemon])
  const eggRows = useMemo(() => singleSimpleRows(pokemon.egg_moves), [pokemon])
  return { levelRows, tmHmRows, tutorRows, eggRows }
}

const MOVE_SECTIONS: { key: 'levelRows' | 'tmHmRows' | 'tutorRows' | 'eggRows'; label: string }[] = [
  { key: 'levelRows', label: 'Level Up' },
  { key: 'tmHmRows',  label: 'TM / HM' },
  { key: 'tutorRows', label: 'Move Tutor' },
  { key: 'eggRows',   label: 'Egg Moves' },
]

function SelfComparisonMovepools({ leftPokemon, rightPokemon, leftGame, rightGame }: {
  leftPokemon: PokemonData; rightPokemon: PokemonData; leftGame: string; rightGame: string
}) {
  const leftSections = useSingleMovepoolSections(leftPokemon, leftGame)
  const rightSections = useSingleMovepoolSections(rightPokemon, rightGame)

  return (
    <div className="flex-1 overflow-y-auto">
      {MOVE_SECTIONS.map(({ key, label }) => {
        const lRows = leftSections[key]
        const rRows = rightSections[key]
        if (lRows.length === 0 && rRows.length === 0) return null
        return (
          <div key={key} className="flex gap-4 px-4">
            <div className="flex-1 min-w-0">
              <SelfMoveSection label={label} rows={lRows} game={leftGame} />
            </div>
            <div className="w-px bg-gray-700 shrink-0" />
            <div className="flex-1 min-w-0">
              <SelfMoveSection label={label} rows={rRows} game={rightGame} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Side identity with gen selector ---
function SideIdentity({ pokemon, game, availableGens, selectedGen, otherGen, onGenChange }: {
  pokemon: PokemonData; game: string
  availableGens: { gen: string; label: string; color: string; firstGame: string }[]
  selectedGen: string; otherGen: string
  onGenChange: (gen: string) => void
}) {
  const isDualType = pokemon.type_1 !== pokemon.type_2
  return (
    <div className="flex flex-col items-center gap-1.5">
      <SelfCompSprite name={pokemon.species} dexNumber={pokemon.national_dex_number} />
      <div className="text-center">
        <p className="text-xs font-mono text-gray-600">#{String(pokemon.national_dex_number).padStart(3, '0')}</p>
        <h2 className="text-lg font-bold text-white leading-tight">{pokemon.species}</h2>
        <div className="flex gap-1.5 mt-1 justify-center">
          <TypeBadge type={pokemon.type_1} game={game} />
          {isDualType && <TypeBadge type={pokemon.type_2} game={game} />}
        </div>
      </div>
      <div className="w-full mt-1">
        <GenSelector
          availableGens={availableGens}
          selectedGen={selectedGen}
          disabledGen={otherGen}
          onChange={onGenChange}
        />
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

  const initialGen = GAME_TO_GEN[initialGame] ?? availableGens[0]?.gen ?? '1'

  const [leftGen, setLeftGen] = useState(initialGen)
  const [rightGen, setRightGen] = useState(() => {
    // Default to the last available gen that isn't the initial one
    const other = availableGens.filter(g => g.gen !== initialGen)
    return other.length > 0 ? other[other.length - 1].gen : availableGens[0]?.gen ?? initialGen
  })

  // Resolve gen to a game (first available game in that gen)
  const leftGame = useMemo(() => {
    return availableGens.find(g => g.gen === leftGen)?.firstGame ?? initialGame
  }, [leftGen, availableGens, initialGame])

  const rightGame = useMemo(() => {
    return availableGens.find(g => g.gen === rightGen)?.firstGame ?? initialGame
  }, [rightGen, availableGens, initialGame])

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
          <div className="w-36 shrink-0 flex flex-col items-end pt-2">
            <SelfEffectiveness
              type1={leftPokemon.type_1} type2={leftPokemon.type_2}
              game={leftGame} abilities={[...new Set(leftPokemon.abilities)]}
              align="right"
              otherMatchups={rightMatchups}
            />
          </div>

          {/* Left identity + gen selector */}
          <div className="w-48 shrink-0">
            <SideIdentity
              pokemon={leftPokemon} game={leftGame}
              availableGens={availableGens} selectedGen={leftGen} otherGen={rightGen}
              onGenChange={setLeftGen}
            />
          </div>

          {/* Center: stats comparison */}
          <div className="flex-1 min-w-[280px] pt-6">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Base Stats</p>
            <SelfStatComparison left={leftPokemon.base_stats} right={rightPokemon.base_stats} leftGame={leftGame} rightGame={rightGame} name={pokemonName} />
          </div>

          {/* Right identity + gen selector */}
          <div className="w-48 shrink-0">
            <SideIdentity
              pokemon={rightPokemon} game={rightGame}
              availableGens={availableGens} selectedGen={rightGen} otherGen={leftGen}
              onGenChange={setRightGen}
            />
          </div>

          {/* Right effectiveness */}
          <div className="w-36 shrink-0 flex flex-col items-start pt-2">
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
      />
    </div>
  )
}
