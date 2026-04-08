import { useState, useEffect, useMemo, useRef } from 'react'
import {
  GAME_TO_GEN,
  getAllPokemonForGame,
  getPokemonData,
  getMoveData,
  getTrainer,
  getTrainerList,
  getPokemonDefenseMatchups,
  displayName,
  isMajorTrainer,
  getMovesForGen,
} from '../data'
import {
  calcGen12Stats,
  calcGen3PlusStats,
  calcDamageRange,
  getMoveCategory,
  deriveHpDv,
  type CalcStats,
  type DamageRange,
  type Gen12DVs,
  type Gen12StatExps,
  type Gen3IVs,
  type Gen3EVs,
  DEFAULT_GEN12_DVS,
  DEFAULT_GEN12_STATEXPS,
  DEFAULT_GEN3_IVS,
  DEFAULT_GEN3_EVS,
} from '../utils/damageCalc'
import { TYPE_COLORS } from './TypeBadge'
import type { PokemonData, MoveData } from '../types/pokemon'

interface Props {
  selectedGame: string
  initialPokemon?: string | null
  initialTrainerId?: string | null
}

// ─── Small helpers ────────────────────────────────────────────────────────────

/**
 * Simulate which moves a Pokemon would know at a given level by replaying the
 * level-up learnset in order (each new move pushes the oldest out when the
 * Pokemon already knows 4). Matches Gen 1–5 default moveset behavior.
 */
function getDefaultMovesAtLevel(data: PokemonData, level: number): string[] {
  const queue: string[] = []
  for (const [l, m] of data.level_up_learnset) {
    if (l > level) continue
    const i = queue.indexOf(m)
    if (i !== -1) queue.splice(i, 1)
    queue.push(m)
    if (queue.length > 4) queue.shift()
  }
  return queue
}

/** All moves a Pokemon can learn in this game (for suggestion ordering). */
function buildLearnset(data: PokemonData): Set<string> {
  return new Set([
    ...data.level_up_learnset.map(([, m]) => m),
    ...data.tm_hm_learnset,
    ...data.tutor_learnset,
    ...data.egg_moves,
    ...(data.transfer_learnset ?? []),
  ])
}

/** All damaging moves available up to and including this generation. */
function buildDamagingMoves(gen: number): Array<{ name: string; type: string; power: number; category: string }> {
  const cap = Math.min(gen, 5) // move data exists through Gen 5 only
  const map = new Map<string, { type: string; power: number; category: string }>()
  for (let g = 1; g <= cap; g++) {
    for (const { name, data } of getMovesForGen(String(g))) {
      if (data.power !== null && data.power > 0) {
        map.set(name, { type: data.type, power: data.power, category: data.category })
      }
    }
  }
  return [...map.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Shared Combobox ──────────────────────────────────────────────────────────

interface ComboOption {
  id: string
  label: string
  sublabel?: string
  color?: string
  badge?: string  // e.g. "★" for learnset moves
}

function Combobox({
  value,
  options,
  onSelect,
  placeholder,
  className = '',
}: {
  value: string
  options: ComboOption[]
  onSelect: (id: string) => void
  placeholder: string
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hilite, setHilite] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 80)
    return options
      .filter(o => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
      .slice(0, 80)
  }, [query, options])

  useEffect(() => { setHilite(0) }, [filtered])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHilite(h => Math.min(h + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHilite(h => Math.max(h - 1, 0)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[hilite]) { onSelect(filtered[hilite].id); setOpen(false); setQuery('') }
      } else if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, filtered, hilite, onSelect])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hilite}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hilite])

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={open ? query : value}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHilite(0) }}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className="w-full bg-gray-700 text-white text-sm rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-gray-500 placeholder-gray-500"
        autoComplete="off"
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-30 top-full mt-0.5 left-0 right-0 bg-gray-800 border border-gray-600 rounded shadow-xl max-h-52 overflow-y-auto"
        >
          {filtered.map((opt, i) => (
            <button
              key={opt.id}
              data-idx={i}
              onMouseDown={e => {
                e.preventDefault()
                onSelect(opt.id)
                setOpen(false)
                setQuery('')
              }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-sm transition-colors ${i === hilite ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
            >
              {opt.color && (
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: opt.color }}
                />
              )}
              <span className="text-white truncate flex-1">{opt.label}</span>
              {opt.badge && (
                <span className="text-yellow-400 text-[10px] flex-shrink-0">{opt.badge}</span>
              )}
              {opt.sublabel && (
                <span className="text-gray-400 text-xs flex-shrink-0 ml-auto">{opt.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Move slot ────────────────────────────────────────────────────────────────

function MoveSlot({
  value,
  moveOptions,
  onChange,
  index,
}: {
  value: string
  moveOptions: ComboOption[]
  onChange: (move: string) => void
  index: number
}) {
  const md = value ? getMoveData(value, 'Red and Blue') : null // just for display type/power
  const color = md ? (TYPE_COLORS[md.type] ?? '#6b7280') : undefined

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600 text-xs w-3">{index + 1}.</span>
      <Combobox
        value={value}
        options={moveOptions}
        onSelect={onChange}
        placeholder="— empty —"
        className="flex-1"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="text-gray-600 hover:text-gray-400 text-xs leading-none w-4 flex-shrink-0"
          title="Clear"
        >
          ✕
        </button>
      )}
      {!value && <span className="w-4 flex-shrink-0" />}
      {md && (
        <span
          className="text-[10px] font-bold rounded px-1 py-0.5 flex-shrink-0 w-8 text-center"
          style={{ background: color, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
        >
          {md.power ?? '—'}
        </span>
      )}
      {!md && <span className="w-8 flex-shrink-0" />}
    </div>
  )
}

// ─── Matchup row ──────────────────────────────────────────────────────────────

function DmgRow({
  moveName,
  moveData: md,
  range,
}: {
  moveName: string
  moveData: MoveData
  range: DamageRange
}) {
  const typeColor = TYPE_COLORS[md.type] ?? '#6b7280'

  // Effectiveness label
  const effText =
    range.effectiveness === 4    ? '4×'  :
    range.effectiveness === 2    ? '2×'  :
    range.effectiveness === 0.5  ? '½×'  :
    range.effectiveness === 0.25 ? '¼×'  : ''
  const effColor =
    range.effectiveness >= 2   ? 'text-green-400' :
    range.effectiveness <= 0.5 ? 'text-orange-400' : 'text-gray-500'

  if (range.effectiveness === 0) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs text-gray-600">
        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: typeColor }} />
        <span className="flex-1 truncate">{moveName}</span>
        <span>No effect</span>
      </div>
    )
  }

  // HP bar range
  const barMin = Math.min(range.minPercent, 100)
  const barMax = Math.min(range.maxPercent, 100)
  // color: green → yellow → red based on max%
  const barColor = barMax >= 100 ? '#22c55e' : barMax >= 50 ? '#eab308' : barMax >= 25 ? '#f97316' : '#ef4444'

  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* Type dot */}
      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: typeColor }} />

      {/* Move name */}
      <span className="text-xs text-gray-200 w-28 truncate flex-shrink-0">{moveName}</span>

      {/* Power */}
      <span className="text-xs text-gray-500 w-6 text-right flex-shrink-0">{md.power ?? '—'}</span>

      {/* Damage range bar */}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="absolute h-full rounded-full opacity-30"
            style={{ left: `${barMin}%`, right: `${100 - barMax}%`, background: barColor }}
          />
          <div
            className="absolute h-full w-0.5 rounded-full"
            style={{ left: `${barMin}%`, background: barColor }}
          />
          <div
            className="absolute h-full w-0.5 rounded-full"
            style={{ left: `${barMax}%`, background: barColor }}
          />
        </div>
      </div>

      {/* Numbers */}
      <span className="text-xs text-gray-200 w-16 text-right flex-shrink-0">
        {range.min === range.max ? range.min : `${range.min}–${range.max}`}
      </span>
      <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0">
        {range.minPercent === range.maxPercent
          ? `${range.minPercent}%`
          : `${range.minPercent}%–${range.maxPercent}%`}
      </span>

      {/* Effectiveness + STAB */}
      <div className="flex items-center gap-1 w-12 justify-end flex-shrink-0">
        {effText && <span className={`text-[10px] font-bold ${effColor}`}>{effText}</span>}
        {range.stab && <span className="text-yellow-400 text-[9px] font-bold">S</span>}
      </div>
    </div>
  )
}

// ─── Matchup card ─────────────────────────────────────────────────────────────

interface AttackResult {
  moveName: string
  moveData: MoveData
  range: DamageRange
}

function MatchupCard({
  enemyPokemon,
  enemyMoves,
  playerAttacks,
  enemyAttacks,
}: {
  enemyPokemon: { species: string; level: number; hp: number; type1: string; type2: string }
  enemyMoves: string[]
  playerAttacks: AttackResult[]
  enemyAttacks: AttackResult[]
}) {
  const type1Color = TYPE_COLORS[enemyPokemon.type1] ?? '#6b7280'
  const type2Color = TYPE_COLORS[enemyPokemon.type2] ?? type1Color
  const isDualType = enemyPokemon.type1 !== enemyPokemon.type2

  const hasPlayerDamage = playerAttacks.some(r => r.range.max > 0)
  const hasEnemyDamage = enemyAttacks.some(r => r.range.max > 0)

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800">
        <div className="flex gap-0.5">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ background: type1Color }}
          />
          {isDualType && (
            <span
              className="w-2 h-2 rounded-sm"
              style={{ background: type2Color }}
            />
          )}
        </div>
        <span className="text-sm font-semibold text-white">{displayName(enemyPokemon.species)}</span>
        <span className="text-xs text-gray-400">Lv{enemyPokemon.level}</span>
        <span className="text-xs text-gray-500 ml-1">
          {enemyPokemon.type1}{isDualType ? ` / ${enemyPokemon.type2}` : ''}
        </span>
        <span className="ml-auto text-xs text-gray-400">{enemyPokemon.hp} HP</span>
      </div>

      <div className="px-3 py-2 space-y-4">
        {/* Your attacks */}
        {playerAttacks.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Your attacks
            </p>
            {!hasPlayerDamage && (
              <p className="text-xs text-gray-600 italic">No damaging moves selected</p>
            )}
            {playerAttacks.map(({ moveName, moveData, range }) => (
              <DmgRow
                key={moveName}
                moveName={moveName}
                moveData={moveData}
                range={range}
              />
            ))}
          </div>
        )}

        {/* Their attacks */}
        {enemyMoves.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Their attacks
            </p>
            {!hasEnemyDamage && (
              <p className="text-xs text-gray-600 italic">No damaging moves</p>
            )}
            {enemyAttacks.map(({ moveName, moveData, range }) => (
              <DmgRow
                key={moveName}
                moveName={moveName}
                moveData={moveData}
                range={range}
              />
            ))}
          </div>
        )}
        {enemyMoves.length === 0 && (
          <p className="text-xs text-gray-600 italic">Move data not available</p>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DamageView({ selectedGame, initialPokemon, initialTrainerId }: Props) {
  const gen = parseInt(GAME_TO_GEN[selectedGame] ?? '1')

  // ── Player state ──────────────────────────────────────────────────────────
  const [species, setSpecies]     = useState(initialPokemon ?? '')
  const [level, setLevel]         = useState(50)
  const [stats, setStats]         = useState<CalcStats | null>(null)
  const [statsLocked, setStatsLocked] = useState(false)
  const [moves, setMoves]         = useState<string[]>(['', '', '', ''])

  // Gen 1–2: DVs (0–15 each) and Stat Experience (0–65535 each)
  // Gen 3+:  IVs (0–31 each) and EVs per stat (0–252 each)
  const [dvs, setDvs]           = useState<Gen12DVs>(DEFAULT_GEN12_DVS)
  const [statExps, setStatExps] = useState<Gen12StatExps>(DEFAULT_GEN12_STATEXPS)
  const [ivs, setIvs]           = useState<Gen3IVs>(DEFAULT_GEN3_IVS)
  const [evs, setEvs]           = useState<Gen3EVs>(DEFAULT_GEN3_EVS)

  // ── Trainer state ─────────────────────────────────────────────────────────
  const [trainerId, setTrainerId] = useState(initialTrainerId ?? '')

  // ── Derived data ──────────────────────────────────────────────────────────
  const playerPokeData = useMemo(
    () => (species ? getPokemonData(species, selectedGame) : null),
    [species, selectedGame],
  )

  const trainer = useMemo(
    () => (trainerId ? getTrainer(selectedGame, trainerId) : null),
    [trainerId, selectedGame],
  )

  const damagingMoves = useMemo(() => buildDamagingMoves(gen), [gen])

  const learnset = useMemo(
    () => (playerPokeData ? buildLearnset(playerPokeData) : new Set<string>()),
    [playerPokeData],
  )

  // ── Options for dropdowns ─────────────────────────────────────────────────
  const pokemonOptions = useMemo((): ComboOption[] =>
    getAllPokemonForGame(selectedGame).map(p => ({
      id: p.species,
      label: displayName(p.species),
      sublabel: `#${String(p.national_dex_number).padStart(4, '0')} · ${p.type_1}${p.type_1 !== p.type_2 ? `/${p.type_2}` : ''}`,
      color: TYPE_COLORS[p.type_1] ?? '#6b7280',
    })),
    [selectedGame],
  )

  const trainerOptions = useMemo((): ComboOption[] => {
    const list = getTrainerList(selectedGame)
    const major = list.filter(t => isMajorTrainer(t.name, t.trainer_class, selectedGame))
    const others = list.filter(t => !isMajorTrainer(t.name, t.trainer_class, selectedGame))
    return [...major, ...others].map(t => ({
      id: t.id,
      label: t.name,
      sublabel: `${t.trainer_class} · Lv${t.maxLevel}`,
    }))
  }, [selectedGame])

  const moveOptions = useMemo((): ComboOption[] => {
    // Learnset moves first (with star badge), then all others
    const inLearnset = damagingMoves.filter(m => learnset.has(m.name))
    const notInLearnset = damagingMoves.filter(m => !learnset.has(m.name))
    const toOption = (m: typeof damagingMoves[0], inSet: boolean): ComboOption => ({
      id: m.name,
      label: m.name,
      sublabel: `${m.type} · ${m.power}`,
      color: TYPE_COLORS[m.type] ?? '#6b7280',
      badge: inSet ? '★' : undefined,
    })
    return [
      ...inLearnset.map(m => toOption(m, true)),
      ...notInLearnset.map(m => toOption(m, false)),
    ]
  }, [damagingMoves, learnset])

  // ── Effects ───────────────────────────────────────────────────────────────

  // Recalculate stats when species, level, or DV/IV/StatExp/EV changes (unless locked)
  useEffect(() => {
    if (statsLocked) return
    if (!playerPokeData) { setStats(null); return }
    const s = gen <= 2
      ? calcGen12Stats(playerPokeData.base_stats, level, dvs, statExps)
      : calcGen3PlusStats(playerPokeData.base_stats, level, ivs, evs)
    setStats(s)
  }, [playerPokeData, level, gen, statsLocked, dvs, statExps, ivs, evs])

  // Auto-populate moves when a new Pokemon is selected
  useEffect(() => {
    if (!playerPokeData) return
    const defaults = getDefaultMovesAtLevel(playerPokeData, level)
    // Only auto-populate if all slots are currently empty
    setMoves(prev => {
      const allEmpty = prev.every(m => !m)
      if (!allEmpty) return prev
      const filled = [...defaults, '', '', '', ''].slice(0, 4)
      return filled
    })
  }, [playerPokeData]) // intentionally not including level — only trigger on species change

  // Clear trainer when game changes
  useEffect(() => {
    setTrainerId(prev => {
      if (!prev) return prev
      const exists = getTrainer(selectedGame, prev)
      return exists ? prev : ''
    })
  }, [selectedGame])

  // When switching into the view with a new game, unlock stats so they recalc
  useEffect(() => {
    setStatsLocked(false)
  }, [selectedGame])

  // ── Matchup calculations ──────────────────────────────────────────────────

  const matchups = useMemo(() => {
    if (!trainer || !stats) return []

    return trainer.party.map(enemyMon => {
      const enemyPokeData = getPokemonData(enemyMon.species, selectedGame)
      const enemyType1 = enemyPokeData?.type_1 ?? 'Normal'
      const enemyType2 = enemyPokeData?.type_2 ?? enemyType1
      const enemyDefMatchups = getPokemonDefenseMatchups(enemyType1, enemyType2, selectedGame)

      const playerType1 = playerPokeData?.type_1 ?? ''
      const playerType2 = playerPokeData?.type_2 ?? playerType1
      const playerDefMatchups = getPokemonDefenseMatchups(playerType1, playerType2, selectedGame)

      // Resolve enemy moves — if none stored, use default level-up moves
      const storedMoves = enemyMon.moves.filter(Boolean) as string[]
      const enemyMoves = storedMoves.length > 0
        ? storedMoves
        : enemyPokeData ? getDefaultMovesAtLevel(enemyPokeData, enemyMon.level) : []

      // Player's moves attacking this enemy Pokemon
      const playerAttacks: Array<{ moveName: string; moveData: MoveData; range: DamageRange }> = []
      for (const moveName of moves) {
        if (!moveName) continue
        const md = getMoveData(moveName, selectedGame)
        if (!md || !md.power || md.power <= 0) continue

        const cat  = getMoveCategory(md.type, md.category, gen)
        const atk  = cat === 'physical' ? stats.attack    : stats.spattack
        const def  = cat === 'physical' ? enemyMon.stats.defense : enemyMon.stats.special_defense
        const stab = md.type === playerType1 || md.type === playerType2
        const eff  = enemyDefMatchups[md.type] ?? 1

        playerAttacks.push({
          moveName,
          moveData: md,
          range: calcDamageRange(gen, level, atk, def, md.power, stab, eff, cat, enemyMon.stats.hp),
        })
      }

      // Enemy's moves attacking the player
      const enemyAttacks: Array<{ moveName: string; moveData: MoveData; range: DamageRange }> = []
      for (const moveName of enemyMoves) {
        if (!moveName) continue
        const md = getMoveData(moveName, selectedGame)
        if (!md || !md.power || md.power <= 0) continue

        const cat  = getMoveCategory(md.type, md.category, gen)
        const atk  = cat === 'physical' ? enemyMon.stats.attack : enemyMon.stats.special_attack
        const def  = cat === 'physical' ? stats.defense : stats.spdefense
        const stab = md.type === enemyType1 || md.type === enemyType2
        const eff  = playerDefMatchups[md.type] ?? 1

        enemyAttacks.push({
          moveName,
          moveData: md,
          range: calcDamageRange(gen, enemyMon.level, atk, def, md.power, stab, eff, cat, stats.hp),
        })
      }

      return {
        enemyMon,
        enemyType1,
        enemyType2,
        enemyMoves,
        playerAttacks,
        enemyAttacks,
      }
    })
  }, [trainer, stats, moves, selectedGame, gen, level, playerPokeData])

  // ── Derived HP DV (Gen 1–2 only) ─────────────────────────────────────────
  const hpDv = deriveHpDv(dvs)

  // ── Stat field component ──────────────────────────────────────────────────
  const StatField = ({ label, field }: { label: string; field: keyof CalcStats }) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</label>
      <input
        type="number"
        min={1}
        max={999}
        value={stats?.[field] ?? ''}
        onChange={e => {
          const v = parseInt(e.target.value)
          if (isNaN(v)) return
          setStats(prev => prev ? { ...prev, [field]: Math.max(1, v) } : null)
          setStatsLocked(true)
        }}
        className="w-full bg-gray-700 text-white text-xs text-right rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500"
        disabled={!stats}
      />
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden text-white">

      {/* ── Left panel: player setup ── */}
      <div
        className="flex-shrink-0 flex flex-col overflow-y-auto border-r border-gray-700 bg-gray-900"
        style={{ width: 320 }}
      >
        <div className="p-4 space-y-5">

          {/* Pokemon + Level */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Your Pokemon
            </p>
            <Combobox
              value={species ? displayName(species) : ''}
              options={pokemonOptions}
              onSelect={s => { setSpecies(s); setStatsLocked(false); setMoves(['', '', '', '']) }}
              placeholder="Select a Pokemon…"
            />
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs text-gray-500 flex-shrink-0">Level</label>
              <input
                type="number"
                min={1}
                max={100}
                value={level}
                onChange={e => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v) && v >= 1 && v <= 100) {
                    setLevel(v)
                    setStatsLocked(false)
                  }
                }}
                className="w-16 bg-gray-700 text-white text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500"
              />
              {statsLocked && (
                <button
                  onClick={() => {
                    setStatsLocked(false)
                    if (playerPokeData) {
                      const s = gen <= 2
                        ? calcGen12Stats(playerPokeData.base_stats, level, dvs, statExps)
                        : calcGen3PlusStats(playerPokeData.base_stats, level, ivs, evs)
                      setStats(s)
                    }
                  }}
                  className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors"
                  title="Recalculate stats from base stats"
                >
                  Recalc
                </button>
              )}
            </div>
          </div>

          {/* Per-stat DV/IV and StatExp/EV grid */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {gen <= 2 ? 'DVs & Stat Exp' : 'IVs & EVs'}
            </p>
            {gen <= 2 ? (
              // Gen 1–2: HP | Atk | Def | Spe | Spc
              // HP DV is derived from ATK/DEF/SPE/SPC parity bits — displayed but not editable
              <div className="grid" style={{ gridTemplateColumns: '28px repeat(5, 1fr)', gap: '3px 4px' }}>
                {/* Header row */}
                <div />
                {['HP', 'Atk', 'Def', 'Spe', 'Spc'].map(h => (
                  <div key={h} className="text-[9px] text-gray-500 text-center">{h}</div>
                ))}
                {/* DV row */}
                <div className="text-[9px] text-gray-500 flex items-center">DV</div>
                {/* HP DV — derived, read-only */}
                <input
                  type="number"
                  value={hpDv}
                  disabled
                  title="Derived from ATK/DEF/SPE/SPC parity bits"
                  className="w-full bg-gray-800 text-gray-500 text-[10px] text-center rounded px-1 py-1 outline-none cursor-default"
                />
                {/* Atk, Def, Spe, Spc DVs */}
                {(['attack', 'defense', 'speed', 'special'] as const).map(stat => (
                  <input
                    key={stat}
                    type="number"
                    min={0}
                    max={15}
                    value={dvs[stat]}
                    onChange={e => {
                      const v = Math.max(0, Math.min(15, parseInt(e.target.value) || 0))
                      setDvs(prev => ({ ...prev, [stat]: v }))
                      setStatsLocked(false)
                    }}
                    className="w-full bg-gray-700 text-white text-[10px] text-center rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
                {/* StatExp row */}
                <div className="text-[9px] text-gray-500 flex items-center">Exp</div>
                {(['hp', 'attack', 'defense', 'speed', 'special'] as const).map(stat => (
                  <input
                    key={stat}
                    type="number"
                    min={0}
                    max={65535}
                    value={statExps[stat]}
                    onChange={e => {
                      const v = Math.max(0, Math.min(65535, parseInt(e.target.value) || 0))
                      setStatExps(prev => ({ ...prev, [stat]: v }))
                      setStatsLocked(false)
                    }}
                    className="w-full bg-gray-700 text-white text-[10px] text-center rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
              </div>
            ) : (
              // Gen 3+: HP | Atk | Def | SpA | SpD | Spe
              <div className="grid" style={{ gridTemplateColumns: '28px repeat(6, 1fr)', gap: '3px 4px' }}>
                {/* Header row */}
                <div />
                {['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'].map(h => (
                  <div key={h} className="text-[9px] text-gray-500 text-center">{h}</div>
                ))}
                {/* IV row */}
                <div className="text-[9px] text-gray-500 flex items-center">IV</div>
                {(['hp', 'attack', 'defense', 'spattack', 'spdefense', 'speed'] as const).map(stat => (
                  <input
                    key={stat}
                    type="number"
                    min={0}
                    max={31}
                    value={ivs[stat]}
                    onChange={e => {
                      const v = Math.max(0, Math.min(31, parseInt(e.target.value) || 0))
                      setIvs(prev => ({ ...prev, [stat]: v }))
                      setStatsLocked(false)
                    }}
                    className="w-full bg-gray-700 text-white text-[10px] text-center rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
                {/* EV row */}
                <div className="text-[9px] text-gray-500 flex items-center">EV</div>
                {(['hp', 'attack', 'defense', 'spattack', 'spdefense', 'speed'] as const).map(stat => (
                  <input
                    key={stat}
                    type="number"
                    min={0}
                    max={252}
                    value={evs[stat]}
                    onChange={e => {
                      const v = Math.max(0, Math.min(252, parseInt(e.target.value) || 0))
                      setEvs(prev => ({ ...prev, [stat]: v }))
                      setStatsLocked(false)
                    }}
                    className="w-full bg-gray-700 text-white text-[10px] text-center rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Stats
            </p>
            {!species && (
              <p className="text-xs text-gray-600 italic">Select a Pokemon above</p>
            )}
            {species && (
              <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                <StatField label="HP"  field="hp" />
                <StatField label="Atk" field="attack" />
                <StatField label="Def" field="defense" />
                <StatField label={gen <= 1 ? 'Spc' : 'SpA'} field="spattack" />
                <StatField label={gen <= 1 ? 'Spc' : 'SpD'} field="spdefense" />
                <StatField label="Spe" field="speed" />
              </div>
            )}
          </div>

          {/* Moves */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Moves
              {species && (
                <span className="text-gray-600 ml-1 font-normal normal-case tracking-normal">
                  — ★ = can learn
                </span>
              )}
            </p>
            <div className="space-y-1.5">
              {moves.map((m, i) => (
                <MoveSlot
                  key={i}
                  value={m}
                  moveOptions={moveOptions}
                  onChange={v => setMoves(prev => { const n = [...prev]; n[i] = v; return n })}
                  index={i}
                />
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Right panel: trainer + matchups ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Trainer selector */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-700 bg-gray-900 flex items-center gap-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex-shrink-0">
            Trainer
          </p>
          <div className="flex-1 max-w-sm">
            <Combobox
              value={trainer ? `${trainer.trainer_class} ${trainer.name}` : ''}
              options={trainerOptions}
              onSelect={setTrainerId}
              placeholder="Select a trainer…"
            />
          </div>
          {trainer && (
            <div className="flex items-center gap-3 text-xs text-gray-400 ml-2">
              {trainer.location && <span>{trainer.location}</span>}
              <span>{trainer.party.length} Pokémon</span>
              <span>Max Lv{Math.max(...trainer.party.map(p => p.level))}</span>
              <button
                onClick={() => setTrainerId('')}
                className="text-gray-600 hover:text-gray-400 text-xs"
                title="Clear trainer"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Matchup cards */}
        <div className="flex-1 overflow-y-auto p-4">
          {!species && !trainerId && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select a Pokemon and trainer to see matchups
            </div>
          )}
          {species && !trainerId && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select a trainer to see matchups
            </div>
          )}
          {!species && trainerId && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select your Pokemon to see matchups
            </div>
          )}
          {species && trainerId && !stats && (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Stats not available for {displayName(species)} in this game
            </div>
          )}

          {species && trainerId && stats && matchups.length > 0 && (
            <div className="space-y-3">
              {/* Column header */}
              <div className="flex items-center gap-2 px-2 text-[10px] text-gray-600">
                <span className="w-2" />
                <span className="w-28 flex-shrink-0">Move</span>
                <span className="w-6 text-right flex-shrink-0">Pow</span>
                <span className="flex-1" />
                <span className="w-16 text-right flex-shrink-0">Damage</span>
                <span className="w-20 text-right flex-shrink-0">% HP</span>
                <span className="w-12" />
              </div>

              {matchups.map(({ enemyMon, enemyType1, enemyType2, enemyMoves, playerAttacks, enemyAttacks }) => (
                <MatchupCard
                  key={enemyMon.species}
                  enemyPokemon={{
                    species: enemyMon.species,
                    level: enemyMon.level,
                    hp: enemyMon.stats.hp,
                    type1: enemyType1,
                    type2: enemyType2,
                  }}
                  enemyMoves={enemyMoves}
                  playerAttacks={playerAttacks}
                  enemyAttacks={enemyAttacks}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
