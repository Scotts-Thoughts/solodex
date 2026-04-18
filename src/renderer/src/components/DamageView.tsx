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
  applyHeldItemAttackBoost,
  applyBadgeStatBoost,
  hasBadgeTypeBoost,
  applyStageMultiplier,
  HELD_ITEMS,
  BADGES_BY_GAME,
  type CalcStats,
  type DamageRange,
  type Gen12DVs,
  type Gen12StatExps,
  type Gen3IVs,
  type Gen3EVs,
  type StatStages,
  type Weather,
  DEFAULT_GEN12_DVS,
  DEFAULT_GEN12_STATEXPS,
  DEFAULT_GEN3_IVS,
  DEFAULT_GEN3_EVS,
  DEFAULT_STAT_STAGES,
} from '../utils/damageCalc'
import TypeBadge, { TYPE_COLORS } from './TypeBadge'
import { getHomeSpriteUrl } from '../utils/sprites'
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
  critRange,
  game,
}: {
  moveName: string
  moveData: MoveData
  range: DamageRange
  critRange?: DamageRange
  game: string
}) {
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
        <div className="flex-shrink-0"><TypeBadge type={md.type} small game={game} /></div>
        <span className="flex-1 truncate">{moveName}</span>
        <span>No effect</span>
      </div>
    )
  }

  // HP bar range
  const alwaysKO = range.minPercent >= 100
  const barMin = Math.min(range.minPercent, 100)
  const barMax = Math.min(range.maxPercent, 100)
  // color: always-KO (bright green) → possible KO (green) → yellow → orange → red
  const barColor = alwaysKO ? '#22c55e'
    : barMax >= 100 ? '#84cc16'
    : barMax >= 50  ? '#eab308'
    : barMax >= 25  ? '#f97316'
    :                 '#ef4444'
  const critMaxBar = critRange ? Math.min(critRange.maxPercent, 100) : null
  const critTitle = critRange
    ? `Crit: ${critRange.min}–${critRange.max} (${critRange.minPercent}%–${critRange.maxPercent}%) — bypasses stages/badges`
    : undefined

  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* Type badge */}
      <div className="flex-shrink-0"><TypeBadge type={md.type} small game={game} /></div>

      {/* Move name */}
      <span className="text-xs text-gray-200 w-24 truncate flex-shrink-0">{moveName}</span>

      {/* Power */}
      <span className="text-xs text-gray-500 w-6 text-right flex-shrink-0">{md.power ?? '—'}</span>

      {/* Damage range bar */}
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden" title={critTitle}>
          {alwaysKO ? (
            <div className="absolute inset-0 rounded-full" style={{ background: barColor }} />
          ) : (
            <>
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
            </>
          )}
          {critMaxBar !== null && (
            <div
              className="absolute h-full w-0.5"
              style={{ left: `${critMaxBar}%`, background: '#fbbf24' }}
            />
          )}
        </div>
      </div>

      {/* Numbers */}
      <span className="text-xs text-gray-200 w-14 text-right flex-shrink-0">
        {range.min === range.max ? range.min : `${range.min}–${range.max}`}
      </span>
      <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
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
  critRange?: DamageRange  // Gen 1 only — crit bypasses stages + badges, doubles level
}

function MatchupCard({
  enemyPokemon,
  enemyMoves,
  playerAttacks,
  enemyAttacks,
  game,
}: {
  enemyPokemon: { species: string; level: number; hp: number; type1: string; type2: string; nationalDexNumber: number }
  enemyMoves: string[]
  playerAttacks: AttackResult[]
  enemyAttacks: AttackResult[]
  game: string
}) {
  const isDualType = enemyPokemon.type1 !== enemyPokemon.type2

  const hasPlayerDamage = playerAttacks.some(r => r.range.max > 0)
  const hasEnemyDamage = enemyAttacks.some(r => r.range.max > 0)

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800">
        <img
          src={getHomeSpriteUrl(enemyPokemon.species, enemyPokemon.nationalDexNumber)}
          alt=""
          className="w-7 h-7 flex-shrink-0 object-contain"
          onError={(e) => {
            const fallback = getHomeSpriteUrl('', enemyPokemon.nationalDexNumber)
            if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
            else e.currentTarget.style.visibility = 'hidden'
          }}
        />
        <span className="text-sm font-semibold text-white">{displayName(enemyPokemon.species)}</span>
        <div className="flex gap-1">
          <TypeBadge type={enemyPokemon.type1} small game={game} />
          {isDualType && <TypeBadge type={enemyPokemon.type2} small game={game} />}
        </div>
        <span className="text-xs text-gray-400">Lv{enemyPokemon.level}</span>
        <span className="ml-auto text-xs text-gray-400">{enemyPokemon.hp} HP</span>
      </div>

      <div className="px-3 py-2 grid grid-cols-2 gap-x-4">
        {/* Your attacks (left) */}
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Your attacks
          </p>
          {playerAttacks.length === 0 || !hasPlayerDamage ? (
            <p className="text-xs text-gray-600 italic">No damaging moves selected</p>
          ) : (
            playerAttacks.map(({ moveName, moveData, range, critRange }) => (
              <DmgRow
                key={moveName}
                moveName={moveName}
                moveData={moveData}
                range={range}
                critRange={critRange}
                game={game}
              />
            ))
          )}
        </div>

        {/* Their attacks (right) */}
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
            Their attacks
          </p>
          {enemyMoves.length === 0 ? (
            <p className="text-xs text-gray-600 italic">Move data not available</p>
          ) : !hasEnemyDamage ? (
            <p className="text-xs text-gray-600 italic">No damaging moves</p>
          ) : (
            enemyAttacks.map(({ moveName, moveData, range, critRange }) => (
              <DmgRow
                key={moveName}
                moveName={moveName}
                moveData={moveData}
                range={range}
                critRange={critRange}
                game={game}
              />
            ))
          )}
        </div>
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
  const [heldItem, setHeldItem]   = useState('')
  const [badges, setBadges]       = useState<Set<string>>(new Set())
  const [stages, setStages]       = useState<StatStages>(DEFAULT_STAT_STAGES)
  const [weather, setWeather]     = useState<Weather>('none')

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

  // Clear badges when switching to a game whose badge list differs
  useEffect(() => {
    setBadges(new Set())
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
      const playerAttacks: AttackResult[] = []
      for (const moveName of moves) {
        if (!moveName) continue
        const md = getMoveData(moveName, selectedGame)
        if (!md || !md.power || md.power <= 0) continue

        const cat     = getMoveCategory(md.type, md.category, gen)
        const atkKey  = cat === 'physical' ? 'attack' as const : 'spattack' as const
        const itemAtk = applyHeldItemAttackBoost(stats[atkKey], heldItem, species, cat, gen)
        const badgeAtk= applyBadgeStatBoost(itemAtk, atkKey, badges, selectedGame)
        const atk     = applyStageMultiplier(badgeAtk, stages[atkKey])
        const def     = cat === 'physical' ? enemyMon.stats.defense : enemyMon.stats.special_defense
        const stab    = md.type === playerType1 || md.type === playerType2
        const eff     = enemyDefMatchups[md.type] ?? 1
        const tboost  = hasBadgeTypeBoost(md.type, badges, selectedGame)

        const range = calcDamageRange(gen, level, atk, def, md.power, stab, eff, cat, enemyMon.stats.hp, heldItem, md.type, tboost, weather)

        // Gen 1 crit: bypass stat stages and badge boosts, double level factor.
        // Item attack boosts (Light Ball/Thick Club) don't exist in Gen 1 so
        // they're effectively no-ops here, but passing through `itemAtk` keeps
        // it correct if those items ever apply in Gen 1.
        let critRange: DamageRange | undefined
        if (gen === 1) {
          critRange = calcDamageRange(
            gen, level, itemAtk, def, md.power, stab, eff, cat, enemyMon.stats.hp,
            heldItem, md.type, false, weather, true,
          )
        }

        playerAttacks.push({ moveName, moveData: md, range, critRange })
      }

      // Enemy's moves attacking the player
      const enemyAttacks: AttackResult[] = []
      for (const moveName of enemyMoves) {
        if (!moveName) continue
        const md = getMoveData(moveName, selectedGame)
        if (!md || !md.power || md.power <= 0) continue

        const cat      = getMoveCategory(md.type, md.category, gen)
        const atk      = cat === 'physical' ? enemyMon.stats.attack : enemyMon.stats.special_attack
        const defKey   = cat === 'physical' ? 'defense' as const : 'spdefense' as const
        const badgeDef = applyBadgeStatBoost(stats[defKey], defKey, badges, selectedGame)
        // In Gen 1, Special is a single stat — the "spattack" stage also raises Spc defense
        const defStage = gen <= 1 && defKey === 'spdefense' ? stages.spattack : stages[defKey]
        const def      = applyStageMultiplier(badgeDef, defStage)
        const stab     = md.type === enemyType1 || md.type === enemyType2
        const eff      = playerDefMatchups[md.type] ?? 1

        const range = calcDamageRange(gen, enemyMon.level, atk, def, md.power, stab, eff, cat, stats.hp, '', md.type, false, weather)

        // Gen 1 crit: bypasses player's defensive badges + stages, doubled level
        let critRange: DamageRange | undefined
        if (gen === 1) {
          critRange = calcDamageRange(
            gen, enemyMon.level, atk, stats[defKey], md.power, stab, eff, cat, stats.hp,
            '', md.type, false, weather, true,
          )
        }

        enemyAttacks.push({ moveName, moveData: md, range, critRange })
      }

      return {
        enemyMon,
        enemyType1,
        enemyType2,
        enemyDexNumber: enemyPokeData?.national_dex_number ?? 0,
        enemyMoves,
        playerAttacks,
        enemyAttacks,
      }
    })
  }, [trainer, stats, moves, selectedGame, gen, level, playerPokeData, heldItem, species, badges, stages, weather])

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
        style={{ width: 400 }}
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
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs text-gray-500 flex-shrink-0">Item</label>
              <select
                value={heldItem}
                onChange={e => setHeldItem(e.target.value)}
                className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value="">— none —</option>
                {(['general', 'species', 'type-boost'] as const).map(group => {
                  const items = HELD_ITEMS.filter(i => i.group === group && gen >= i.minGen)
                  if (items.length === 0) return null
                  const label = group === 'general' ? 'General' : group === 'species' ? 'Species-specific' : 'Type boost'
                  return (
                    <optgroup key={group} label={label}>
                      {items.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.moveType ? ` (${item.moveType})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
              {heldItem && (
                <button
                  onClick={() => setHeldItem('')}
                  className="text-gray-600 hover:text-gray-400 text-xs leading-none w-4 flex-shrink-0"
                  title="Clear item"
                >
                  ✕
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
                  className="w-full bg-gray-800 text-gray-500 text-[10px] text-right rounded px-1 py-1 outline-none cursor-default"
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
                    className="w-full bg-gray-700 text-white text-[10px] text-right rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
                {/* StatExp row */}
                <div className="text-[9px] text-gray-500 flex items-center">Exp</div>
                {(['hp', 'attack', 'defense', 'speed', 'special'] as const).map(stat => (
                  <div key={stat} className="flex items-stretch min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setStatExps(prev => ({ ...prev, [stat]: Math.max(0, prev[stat] - 2560) }))
                        setStatsLocked(false)
                      }}
                      className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded-l px-0.5 text-[10px] leading-none flex items-center justify-center"
                      title="−1 vitamin (2560)"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={65535}
                      value={statExps[stat]}
                      onChange={e => {
                        const v = Math.max(0, Math.min(65535, parseInt(e.target.value) || 0))
                        setStatExps(prev => ({ ...prev, [stat]: v }))
                        setStatsLocked(false)
                      }}
                      className="flex-1 min-w-0 bg-gray-700 text-white text-[10px] text-right px-0.5 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setStatExps(prev => ({ ...prev, [stat]: Math.min(65535, prev[stat] + 2560) }))
                        setStatsLocked(false)
                      }}
                      className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded-r px-0.5 text-[10px] leading-none flex items-center justify-center"
                      title="+1 vitamin (2560)"
                    >
                      +
                    </button>
                  </div>
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
                    className="w-full bg-gray-700 text-white text-[10px] text-right rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
                {/* EV row */}
                <div className="text-[9px] text-gray-500 flex items-center">EV</div>
                {(['hp', 'attack', 'defense', 'spattack', 'spdefense', 'speed'] as const).map(stat => (
                  <div key={stat} className="flex items-stretch min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEvs(prev => ({ ...prev, [stat]: Math.max(0, prev[stat] - 10) }))
                        setStatsLocked(false)
                      }}
                      className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded-l px-0.5 text-[10px] leading-none flex items-center justify-center"
                      title="−1 vitamin (10 EVs)"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={252}
                      value={evs[stat]}
                      onChange={e => {
                        const v = Math.max(0, Math.min(252, parseInt(e.target.value) || 0))
                        setEvs(prev => ({ ...prev, [stat]: v }))
                        setStatsLocked(false)
                      }}
                      className="flex-1 min-w-0 bg-gray-700 text-white text-[10px] text-right px-0.5 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEvs(prev => ({ ...prev, [stat]: Math.min(252, prev[stat] + 10) }))
                        setStatsLocked(false)
                      }}
                      className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded-r px-0.5 text-[10px] leading-none flex items-center justify-center"
                      title="+1 vitamin (10 EVs)"
                    >
                      +
                    </button>
                  </div>
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

          {/* Badges */}
          {BADGES_BY_GAME[selectedGame] && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Badges
                  <span className="text-gray-600 ml-1 font-normal normal-case tracking-normal">
                    — {gen >= 3 ? '10%' : '12.5%'} boost
                  </span>
                </p>
                {badges.size > 0 && (
                  <button
                    onClick={() => setBadges(new Set())}
                    className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {BADGES_BY_GAME[selectedGame].map(b => {
                  const active = badges.has(b.id)
                  const statsLabel = b.stats
                    ? b.stats.map(s => s === 'attack' ? 'Atk' : s === 'defense' ? 'Def' : s === 'speed' ? 'Spe' : s === 'spattack' ? 'SpA' : 'SpD').join('/')
                    : ''
                  const title = [b.leader, statsLabel && `+${statsLabel}`, b.type && gen === 2 && `+${b.type} moves`].filter(Boolean).join(' · ')
                  const bg = active && b.type ? TYPE_COLORS[b.type] : undefined
                  return (
                    <button
                      key={b.id}
                      onClick={() => setBadges(prev => {
                        const next = new Set(prev)
                        if (next.has(b.id)) next.delete(b.id)
                        else next.add(b.id)
                        return next
                      })}
                      title={title}
                      className={`text-[10px] px-1.5 py-0.5 rounded flex items-center justify-between gap-1 transition-colors ${
                        active
                          ? 'text-white'
                          : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                      }`}
                      style={active ? { background: bg ?? '#4b5563' } : undefined}
                    >
                      <span className="truncate">{b.name}</span>
                      {statsLabel && <span className="text-[9px] opacity-80 flex-shrink-0">{statsLabel}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stat stages (Swords Dance / Amnesia / Growl / etc) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Stat Stages
                <span className="text-gray-600 ml-1 font-normal normal-case tracking-normal">
                  — after setup
                </span>
              </p>
              {(stages.attack !== 0 || stages.defense !== 0 || stages.spattack !== 0 || stages.spdefense !== 0) && (
                <button
                  onClick={() => setStages(DEFAULT_STAT_STAGES)}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-1">
              {(gen <= 1
                ? (['attack', 'defense', 'spattack'] as const)
                : (['attack', 'defense', 'spattack', 'spdefense'] as const)
              ).map(k => {
                const v = stages[k]
                const label = k === 'attack' ? 'Atk'
                  : k === 'defense' ? 'Def'
                  : k === 'spattack' ? (gen <= 1 ? 'Spc' : 'SpA')
                  : 'SpD'
                const mult = v === 0 ? '×1.0'
                  : `×${((v > 0 ? (2 + v) : 2) / (v > 0 ? 2 : 2 - v)).toFixed(2)}`
                const setStage = (val: number) => {
                  const clamped = Math.max(-6, Math.min(6, val))
                  setStages(prev => {
                    const next = { ...prev, [k]: clamped }
                    // Gen 1: Special is a single stat — keep spattack/spdefense in sync
                    if (gen <= 1 && k === 'spattack') next.spdefense = clamped
                    return next
                  })
                }
                return (
                  <div key={k} className="flex items-center gap-1.5">
                    <label className="text-[10px] text-gray-500 w-7 flex-shrink-0">{label}</label>
                    <button
                      type="button"
                      onClick={() => setStage(v - 1)}
                      disabled={v <= -6}
                      className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded px-1.5 py-0.5 text-xs leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      −
                    </button>
                    <span className={`text-xs w-7 text-center font-mono ${v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {v > 0 ? `+${v}` : v}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStage(v + 1)}
                      disabled={v >= 6}
                      className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded px-1.5 py-0.5 text-xs leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                    <span className="text-[10px] text-gray-600 ml-1 font-mono">{mult}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Weather (Gen 2+) */}
          {gen >= 2 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Weather
              </p>
              <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-800">
                {(['none', 'sun', 'rain'] as const).map(w => {
                  const active = weather === w
                  const label = w === 'none' ? 'None' : w === 'sun' ? 'Sun' : 'Rain'
                  const bg = active ? (w === 'sun' ? '#eab308' : w === 'rain' ? '#3b82f6' : '#4b5563') : undefined
                  return (
                    <button
                      key={w}
                      onClick={() => setWeather(w)}
                      className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                        active ? 'text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                      style={active ? { background: bg } : undefined}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {weather !== 'none' && (
                <p className="text-[10px] text-gray-600 mt-1">
                  {weather === 'rain' ? 'Water ×1.5 · Fire ×0.5' : 'Fire ×1.5 · Water ×0.5'}
                </p>
              )}
            </div>
          )}

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
              {matchups.map(({ enemyMon, enemyType1, enemyType2, enemyDexNumber, enemyMoves, playerAttacks, enemyAttacks }) => (
                <MatchupCard
                  key={enemyMon.species}
                  enemyPokemon={{
                    species: enemyMon.species,
                    level: enemyMon.level,
                    hp: enemyMon.stats.hp,
                    type1: enemyType1,
                    type2: enemyType2,
                    nationalDexNumber: enemyDexNumber,
                  }}
                  enemyMoves={enemyMoves}
                  playerAttacks={playerAttacks}
                  enemyAttacks={enemyAttacks}
                  game={selectedGame}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
