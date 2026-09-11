import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  GAME_TO_GEN,
  getAllPokemonForGame,
  getPokemonData,
  getMoveData,
  getTrainer,
  getTrainerList,
  displayName,
  isMajorTrainer,
  getMovesForGen,
} from '../data'
import {
  calcGen12Stats,
  calcGen3PlusStats,
  deriveHpDv,
  getNatureMods,
  NEUTRAL_NATURE,
  DEFAULT_GEN12_DVS,
  DEFAULT_GEN12_STATEXPS,
  DEFAULT_GEN3_IVS,
  DEFAULT_GEN3_EVS,
  type CalcStats,
  type Gen12DVs,
  type Gen12StatExps,
  type Gen3IVs,
  type Gen3EVs,
} from '../utils/damage/stats'
import {
  BADGES_BY_GAME, allBadgeIds, applyBadgeStatBoost, badgeBoostsStat,
  itemsForGen, itemName, itemId, abilityId, abilityInfo,
  hiddenPowerGen2, hiddenPowerGen3, HIDDEN_POWER_TYPES, moveCategory,
  ZERO_STAGES,
  type Gen, type StatStages, type MoveOptions, type CounterKey,
} from '../utils/damage'
import {
  genOfGame, toBattler, trainerMonToBattler, makeField, computeMatchup, type MoveOptionMap,
} from '../utils/damage/matchup'
import { natures } from '@data/natures'
import TypeBadge, { TYPE_COLORS } from './TypeBadge'
import Combobox, { type ComboOption } from './Combobox'
import NatureSelector from './NatureSelector'
import { exportSpreadCardImage } from '../utils/bulkExport'
import MatchupCard from './damage/MatchupCard'
import type { RowEdit } from './damage/DamageRow'
import {
  SectionLabel, StagesPanel, ConditionPanel, FieldPanel,
  DEFAULT_CONDITION, DEFAULT_FIELD_SETTINGS, type Condition, type FieldSettings,
} from './damage/panels'
import type { PokemonData } from '../types/pokemon'

interface Props {
  selectedGame: string
  initialPokemon?: string | null
  initialTrainerId?: string | null
  /** Moves to pre-fill the player's slots (e.g. right-clicked from the Pokedex). */
  initialMoves?: string[]
}

/** Take up to 4 non-empty move names and pad out to exactly 4 slots. */
function padMoves(list?: string[]): string[] {
  const filled = (list ?? []).filter(Boolean).slice(0, 4)
  return [...filled, '', '', '', ''].slice(0, 4)
}

const NATURE_TABLE = natures as Record<string, { increased: string | null; decreased: string | null }>

/**
 * Simulate which moves a Pokemon would know at a given level by replaying the
 * level-up learnset in order (each new move pushes the oldest out when the
 * Pokemon already knows 4). Matches Gen 1–5 default moveset behavior.
 */
function getDefaultMovesAtLevel(data: PokemonData, level: number): string[] {
  const queue: string[] = []
  for (const [l, m] of data.level_up_learnset) {
    if (l > level || l < 0) continue   // -1 = Move Reminder only, never a default move
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

/**
 * All damaging moves available up to and including this generation, including
 * variable / fixed-damage moves (the calculator resolves them).
 */
function buildDamagingMoves(gen: number): Array<{ name: string; type: string; power: number | null; category: string }> {
  const cap = Math.min(gen, 5)
  const map = new Map<string, { type: string; power: number | null; category: string }>()
  for (let g = 1; g <= cap; g++) {
    for (const { name, data } of getMovesForGen(String(g))) {
      if (String(data.category).toLowerCase() !== 'status') {
        map.set(name, { type: data.type, power: data.power, category: data.category })
      }
    }
  }
  return [...map.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Move slot ────────────────────────────────────────────────────────────────

function MoveSlot({ value, moveOptions, onChange, index, game }: {
  value: string
  moveOptions: ComboOption[]
  onChange: (move: string) => void
  index: number
  game: string
}) {
  const md = value ? getMoveData(value, game) : null
  const color = md ? (TYPE_COLORS[md.type] ?? '#6b7280') : undefined
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600 text-xs w-3">{index + 1}.</span>
      <Combobox value={value} options={moveOptions} onSelect={onChange} placeholder="— empty —" className="flex-1" />
      {value ? (
        <button onClick={() => onChange('')} className="text-gray-600 hover:text-gray-400 text-xs leading-none w-4 flex-shrink-0" title="Clear">✕</button>
      ) : <span className="w-4 flex-shrink-0" />}
      {md ? (
        <span className="text-[10px] font-bold rounded px-1 py-0.5 flex-shrink-0 w-8 text-center" style={{ background: color, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
          {md.power ?? '—'}
        </span>
      ) : <span className="w-8 flex-shrink-0" />}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DamageView({ selectedGame, initialPokemon, initialTrainerId, initialMoves }: Props) {
  const gen = (genOfGame(selectedGame) ?? Math.min(5, parseInt(GAME_TO_GEN[selectedGame] ?? '1'))) as Gen
  const supported = genOfGame(selectedGame) !== null

  // ── Player state ──────────────────────────────────────────────────────────
  const [species, setSpecies]     = useState(initialPokemon ?? '')
  const [level, setLevel]         = useState(50)
  const [stats, setStats]         = useState<CalcStats | null>(null)
  const [statsLocked, setStatsLocked] = useState(false)
  const [moves, setMoves]         = useState<string[]>(() => padMoves(initialMoves))
  const [heldItem, setHeldItem]   = useState('')
  const [ability, setAbility]     = useState('')
  const [badges, setBadges]       = useState<Set<string>>(() => allBadgeIds(selectedGame))
  const [stages, setStages]       = useState<StatStages>({ ...ZERO_STAGES })
  const [cond, setCond]           = useState<Condition>(DEFAULT_CONDITION)
  const [counters, setCounters]   = useState<Partial<Record<CounterKey, number>>>({})
  const [friendship, setFriendship] = useState(255)
  const [hiddenPowerOverride, setHiddenPowerOverride] = useState<string | null>(null)
  const [playerMoveOptions, setPlayerMoveOptions] = useState<MoveOptionMap>({})

  const [dvs, setDvs]           = useState<Gen12DVs>(DEFAULT_GEN12_DVS)
  const [statExps, setStatExps] = useState<Gen12StatExps>(DEFAULT_GEN12_STATEXPS)
  const [ivs, setIvs]           = useState<Gen3IVs>(DEFAULT_GEN3_IVS)
  const [evs, setEvs]           = useState<Gen3EVs>(DEFAULT_GEN3_EVS)
  const [natureName, setNatureName] = useState('Hardy')
  const natureMods = useMemo(() => {
    const n = NATURE_TABLE[natureName]
    return n ? getNatureMods(n.increased, n.decreased) : NEUTRAL_NATURE
  }, [natureName])

  // ── Enemy side / field state ──────────────────────────────────────────────
  const [trainerId, setTrainerId] = useState(initialTrainerId ?? '')
  const [enemyStages, setEnemyStages] = useState<StatStages>({ ...ZERO_STAGES })
  const [enemyCond, setEnemyCond] = useState<Condition>(DEFAULT_CONDITION)
  const [enemyCounters, setEnemyCounters] = useState<Partial<Record<CounterKey, number>>>({})
  const [enemyMoveOptions, setEnemyMoveOptions] = useState<MoveOptionMap>({})
  const [fieldSettings, setFieldSettings] = useState<FieldSettings>(DEFAULT_FIELD_SETTINGS)
  const [showEnemyPanel, setShowEnemyPanel] = useState(false)

  // ── Derived data ──────────────────────────────────────────────────────────
  const playerPokeData = useMemo(() => (species ? getPokemonData(species, selectedGame) : null), [species, selectedGame])
  const trainer = useMemo(() => (trainerId ? getTrainer(selectedGame, trainerId) : null), [trainerId, selectedGame])
  const damagingMoves = useMemo(() => buildDamagingMoves(gen), [gen])
  const learnset = useMemo(() => (playerPokeData ? buildLearnset(playerPokeData) : new Set<string>()), [playerPokeData])
  const items = useMemo(() => itemsForGen(gen), [gen])
  const abilityChoices = useMemo(() => {
    if (!playerPokeData || gen < 3) return []
    const list = [...playerPokeData.abilities]
    if (playerPokeData.hidden_ability && gen >= 5) list.push(playerPokeData.hidden_ability)
    return [...new Set(list)]
  }, [playerPokeData, gen])

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
    return [...major, ...others].map(t => ({ id: t.id, label: t.name, sublabel: `${t.trainer_class} · Lv${t.maxLevel}` }))
  }, [selectedGame])

  const moveOptions = useMemo((): ComboOption[] => {
    const inLearnset = damagingMoves.filter(m => learnset.has(m.name))
    const notInLearnset = damagingMoves.filter(m => !learnset.has(m.name))
    const toOption = (m: typeof damagingMoves[0], inSet: boolean): ComboOption => ({
      id: m.name,
      label: m.name,
      sublabel: `${m.type} · ${m.power ?? 'var'}`,
      color: TYPE_COLORS[m.type] ?? '#6b7280',
      badge: inSet ? '★' : undefined,
    })
    return [...inLearnset.map(m => toOption(m, true)), ...notInLearnset.map(m => toOption(m, false))]
  }, [damagingMoves, learnset])

  // ── Effects ───────────────────────────────────────────────────────────────

  // Default the player to the Pokemon being viewed in the Pokedex. A change to
  // that selection resets the player setup; the trainer is kept.
  useEffect(() => {
    if (!initialPokemon) return
    setSpecies(initialPokemon)
    setStatsLocked(false)
    setMoves(['', '', '', ''])
    setLevel(50)
    setHeldItem('')
    setAbility('')
    setStages({ ...ZERO_STAGES })
    setCond(DEFAULT_CONDITION)
    setCounters({})
    setDvs(DEFAULT_GEN12_DVS)
    setStatExps(DEFAULT_GEN12_STATEXPS)
    setIvs(DEFAULT_GEN3_IVS)
    setEvs(DEFAULT_GEN3_EVS)
    setNatureName('Hardy')
    setHiddenPowerOverride(null)
    setPlayerMoveOptions({})
    setBadges(allBadgeIds(selectedGame))
  }, [initialPokemon])

  // Recalculate stats when species, level, or DV/IV/StatExp/EV changes (unless locked)
  useEffect(() => {
    if (statsLocked) return
    if (!playerPokeData) { setStats(null); return }
    const s = gen <= 2
      ? calcGen12Stats(playerPokeData.base_stats, level, dvs, statExps)
      : calcGen3PlusStats(playerPokeData.base_stats, level, ivs, evs, natureMods, species)
    setStats(s)
  }, [playerPokeData, level, gen, statsLocked, dvs, statExps, ivs, evs, natureMods])

  // Default ability to the species' first ability when it changes.
  useEffect(() => {
    if (gen < 3) { setAbility(''); return }
    setAbility(prev => (prev && abilityChoices.includes(prev) ? prev : abilityChoices[0] ?? ''))
  }, [abilityChoices, gen])

  // Load the Pokedex "test set" (right-clicked moves) into the slots.
  const testSetPokemonRef = useRef(initialPokemon)
  useEffect(() => {
    if (testSetPokemonRef.current !== initialPokemon) {
      testSetPokemonRef.current = initialPokemon
      return
    }
    if ((initialMoves ?? []).some(Boolean)) setMoves(padMoves(initialMoves))
  }, [initialMoves, initialPokemon])

  // Auto-populate moves when a new Pokemon is selected
  useEffect(() => {
    if (!playerPokeData) return
    const defaults = getDefaultMovesAtLevel(playerPokeData, level)
    setMoves(prev => (prev.every(m => !m) ? [...defaults, '', '', '', ''].slice(0, 4) : prev))
  }, [playerPokeData]) // intentionally not including level — only trigger on species change

  // Clear trainer when game changes
  useEffect(() => {
    setTrainerId(prev => (prev && getTrainer(selectedGame, prev) ? prev : ''))
  }, [selectedGame])

  useEffect(() => { setStatsLocked(false) }, [selectedGame])
  useEffect(() => { setBadges(allBadgeIds(selectedGame)) }, [selectedGame])
  useEffect(() => { setHeldItem(prev => (items.some(i => i.id === prev) ? prev : '')) }, [items])

  // Doubles default follows the trainer.
  useEffect(() => {
    setFieldSettings(f => ({ ...f, isDoubles: !!trainer?.is_double_battle }))
  }, [trainer])

  // ── Hidden Power (derived from DVs/IVs; override via the type grid) ──────
  const derivedHiddenPower = useMemo(() => (gen === 1 ? null : gen === 2 ? hiddenPowerGen2(dvs) : hiddenPowerGen3(ivs)), [gen, dvs, ivs])

  // ── Matchup calculations ──────────────────────────────────────────────────
  const field = useMemo(() => makeField(selectedGame, {
    weather: fieldSettings.weather,
    isDoubles: fieldSettings.isDoubles,
    defendersAlive: fieldSettings.isDoubles ? 2 : 1,
    otherBattlersAlive: fieldSettings.isDoubles ? 3 : 1,
    mudSport: fieldSettings.mudSport,
    waterSport: fieldSettings.waterSport,
    gravity: fieldSettings.gravity,
  }), [selectedGame, fieldSettings])

  const playerBattler = useMemo(() => {
    if (!playerPokeData || !stats) return null
    return toBattler({
      species, data: playerPokeData, level, stats,
      stages, item: heldItem || null, ability: ability || null,
      status: cond.status, hpPercent: cond.hpPercent, friendship,
      dvs, ivs, badges, isPlayer: true, flags: cond.flags, counters,
    })
  }, [playerPokeData, stats, species, level, stages, heldItem, ability, cond, friendship, dvs, ivs, badges, counters])

  const playerOpts = useMemo((): MoveOptionMap => {
    const o: MoveOptionMap = { ...playerMoveOptions }
    if (hiddenPowerOverride) o['Hidden Power'] = { ...(o['Hidden Power'] ?? {}), hiddenPowerType: hiddenPowerOverride }
    return o
  }, [playerMoveOptions, hiddenPowerOverride])

  const matchups = useMemo(() => {
    if (!trainer || !playerBattler || !supported) return []
    return trainer.party.map((enemyMon, idx) => {
      const enemyPokeData = getPokemonData(enemyMon.species, selectedGame)
      if (!enemyPokeData) return null
      const enemy = trainerMonToBattler(enemyMon, enemyPokeData, {
        stages: enemyStages, status: enemyCond.status, hpPercent: enemyCond.hpPercent, flags: enemyCond.flags, counters: enemyCounters,
      })
      const storedMoves = enemyMon.moves.filter(Boolean) as string[]
      const enemyMoves = storedMoves.length > 0 ? storedMoves : getDefaultMovesAtLevel(enemyPokeData, enemyMon.level)
      const m = computeMatchup(playerBattler, enemy, moves, enemyMoves, field, playerOpts, enemyMoveOptions)
      return {
        key: `${enemyMon.species}-${idx}`,
        enemy: {
          species: enemyMon.species, level: enemyMon.level, hp: enemy.stats.hp, currentHp: enemy.currentHp,
          type1: enemy.types[0], type2: enemy.types[1], nationalDexNumber: enemyPokeData.national_dex_number,
          itemLabel: enemyMon.held_item, abilityLabel: enemyMon.ability, ability: enemy.ability,
        },
        ...m,
      }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
  }, [trainer, playerBattler, supported, selectedGame, enemyStages, enemyCond, enemyCounters, moves, field, playerOpts, enemyMoveOptions])

  const playerEdit = useCallback((move: string): RowEdit => ({
    options: playerOpts[move] ?? {},
    counters,
    setOption: patch => setPlayerMoveOptions(prev => ({ ...prev, [move]: { ...(prev[move] ?? {}), ...patch } })),
    setCounter: (k, v) => setCounters(prev => ({ ...prev, [k]: v })),
  }), [playerOpts, counters])

  const enemyEdit = useCallback((move: string): RowEdit => ({
    options: enemyMoveOptions[move] ?? {},
    counters: enemyCounters,
    setOption: patch => setEnemyMoveOptions(prev => ({ ...prev, [move]: { ...(prev[move] ?? {}), ...patch } })),
    setCounter: (k, v) => setEnemyCounters(prev => ({ ...prev, [k]: v })),
  }), [enemyMoveOptions, enemyCounters])

  const hpDv = deriveHpDv(dvs)

  // ── Spread export ─────────────────────────────────────────────────────────
  const [exportingSpread, setExportingSpread] = useState(false)
  const canExportSpread = Boolean(playerPokeData && stats)
  const handleExportSpread = useCallback(async () => {
    if (exportingSpread || !playerPokeData || !stats) return
    setExportingSpread(true)
    try {
      await exportSpreadCardImage({
        species, dexNumber: playerPokeData.national_dex_number, type1: playerPokeData.type_1, type2: playerPokeData.type_2,
        game: selectedGame, gen, level, baseStats: playerPokeData.base_stats, stats, ivs, evs, dvs, statExps, natureName, natureMods,
        heldItemName: heldItem ? itemName(heldItem) : null, badges, statsLocked,
      })
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExportingSpread(false)
    }
  }, [exportingSpread, playerPokeData, stats, species, selectedGame, gen, level, ivs, evs, dvs, statExps, natureName, natureMods, heldItem, badges, statsLocked])

  // ── Stat field ────────────────────────────────────────────────────────────
  // Fields edit the raw stat; the calculator applies badge boosts itself, and
  // the boosted in-battle value is shown alongside when a badge applies.
  const StatField = ({ label, field: key }: { label: string; field: keyof CalcStats }) => {
    const raw = stats?.[key]
    const boosted = raw != null && key !== 'hp' && badgeBoostsStat(key, badges, selectedGame) ? applyBadgeStatBoost(raw, key, badges, selectedGame) : null
    return (
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] text-gray-500 uppercase tracking-wider">
          {label}{boosted != null && boosted !== raw && <span className="text-green-400 ml-1 normal-case" title="With badge boost">→{boosted}</span>}
        </label>
        <input
          type="number" min={1} max={999}
          value={raw ?? ''}
          onChange={e => {
            const v = parseInt(e.target.value)
            if (isNaN(v)) return
            setStats(prev => prev ? { ...prev, [key]: Math.max(1, v) } : null)
            setStatsLocked(true)
          }}
          className="w-full bg-gray-700 text-xs text-right rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500 text-white"
          disabled={!stats}
        />
      </div>
    )
  }

  const stepLevel = (dir: number, ctrl: boolean, shift: boolean) => {
    const amt = ctrl && shift ? 10 : ctrl ? 5 : 1
    setLevel(prev => Math.max(1, Math.min(100, prev + dir * amt)))
    setStatsLocked(false)
  }

  const numInput = 'w-full bg-gray-700 text-white text-[10px] text-right rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500'
  const stepBtn = 'text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 px-0.5 text-[10px] leading-none flex items-center justify-center'

  // ── Render ────────────────────────────────────────────────────────────────

  if (!supported) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 text-sm px-8 text-center">
        The damage calculator supports Gen 1–5 games: those have trainer data and a damage formula verified against the game code.
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden text-white">

      {/* ── Left panel: player setup ── */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto border-r border-gray-700 bg-gray-900" style={{ width: 400 }}>
        <div className="p-4 space-y-5">

          {/* Pokemon + Level + Item + Ability */}
          <div>
            <SectionLabel>Your Pokemon</SectionLabel>
            <Combobox
              value={species ? displayName(species) : ''}
              options={pokemonOptions}
              onSelect={s => { setSpecies(s); setStatsLocked(false); setMoves(['', '', '', '']) }}
              placeholder="Select a Pokemon…"
            />
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs text-gray-500 flex-shrink-0">Level</label>
              <button type="button" onClick={e => stepLevel(-1, e.ctrlKey, e.shiftKey)} disabled={level <= 1} title="−1 (Ctrl −5, Ctrl+Shift −10)"
                className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded px-2 py-1 text-sm leading-none disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">−</button>
              <input type="number" min={1} max={100} value={level}
                onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 1 && v <= 100) { setLevel(v); setStatsLocked(false) } }}
                className="w-16 bg-gray-700 text-white text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500" />
              <button type="button" onClick={e => stepLevel(1, e.ctrlKey, e.shiftKey)} disabled={level >= 100} title="+1 (Ctrl +5, Ctrl+Shift +10)"
                className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded px-2 py-1 text-sm leading-none disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">+</button>
              {statsLocked && (
                <button onClick={() => setStatsLocked(false)} className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors" title="Recalculate stats from base stats">Recalc</button>
              )}
            </div>
            {gen >= 2 && (
              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs text-gray-500 flex-shrink-0 w-10">Item</label>
                <select value={heldItem} onChange={e => setHeldItem(e.target.value)}
                  className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500">
                  <option value="">— none —</option>
                  {(['typeboost', 'choice', 'general', 'species', 'crit', 'accuracy', 'gem', 'other'] as const).map(kind => {
                    const group = items.filter(i => i.kind === kind && (kind !== 'species' || !playerPokeData || !i.species || i.species.includes(species)))
                    if (group.length === 0) return null
                    const label = kind === 'typeboost' ? 'Type boost' : kind === 'choice' ? 'Choice' : kind === 'general' ? 'General'
                      : kind === 'species' ? 'Species-specific' : kind === 'crit' ? 'Critical hits' : kind === 'accuracy' ? 'Accuracy' : kind === 'gem' ? 'Gems' : 'Other'
                    return (
                      <optgroup key={kind} label={label}>
                        {group.map(i => <option key={i.id} value={i.id}>{i.name}{i.type && kind === 'typeboost' ? ` (${i.type})` : ''}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
                {heldItem && <button onClick={() => setHeldItem('')} className="text-gray-600 hover:text-gray-400 text-xs leading-none w-4 flex-shrink-0" title="Clear item">✕</button>}
              </div>
            )}
            {gen >= 3 && abilityChoices.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs text-gray-500 flex-shrink-0 w-10">Ability</label>
                <select value={ability} onChange={e => setAbility(e.target.value)}
                  className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500">
                  {abilityChoices.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {abilityInfo(abilityId(ability)) && (
                  <span className="text-[10px] text-gray-500 truncate max-w-[9rem]" title={abilityInfo(abilityId(ability))!.effect}>{abilityInfo(abilityId(ability))!.effect}</span>
                )}
              </div>
            )}
          </div>

          {/* Per-stat DV/IV and StatExp/EV grid */}
          <div>
            <SectionLabel>{gen <= 2 ? 'DVs & Stat Exp' : 'IVs & EVs'}</SectionLabel>
            {gen <= 2 ? (
              <div className="grid" style={{ gridTemplateColumns: '28px repeat(5, 1fr)', gap: '3px 4px' }}>
                <div />
                {['HP', 'Atk', 'Def', 'Spe', 'Spc'].map(h => <div key={h} className="text-[9px] text-gray-500 text-center">{h}</div>)}
                <div className="text-[9px] text-gray-500 flex items-center">DV</div>
                <input type="number" value={hpDv} disabled title="Derived from ATK/DEF/SPE/SPC parity bits"
                  className="w-full bg-gray-800 text-gray-500 text-[10px] text-right rounded px-1 py-1 outline-none cursor-default" />
                {(['attack', 'defense', 'speed', 'special'] as const).map(stat => (
                  <input key={stat} type="number" min={0} max={15} value={dvs[stat]}
                    onChange={e => { const v = Math.max(0, Math.min(15, parseInt(e.target.value) || 0)); setDvs(prev => ({ ...prev, [stat]: v })); setStatsLocked(false) }}
                    className={numInput} />
                ))}
                <div className="text-[9px] text-gray-500 flex items-center">Exp</div>
                {(['hp', 'attack', 'defense', 'speed', 'special'] as const).map(stat => (
                  <div key={stat} className="flex items-stretch min-w-0">
                    <button type="button" onClick={() => { setStatExps(prev => ({ ...prev, [stat]: Math.max(0, prev[stat] - 2560) })); setStatsLocked(false) }} className={`${stepBtn} rounded-l`} title="−1 vitamin (2560)">−</button>
                    <input type="number" min={0} max={65535} value={statExps[stat]}
                      onChange={e => { const v = Math.max(0, Math.min(65535, parseInt(e.target.value) || 0)); setStatExps(prev => ({ ...prev, [stat]: v })); setStatsLocked(false) }}
                      className="flex-1 min-w-0 bg-gray-700 text-white text-[10px] text-right px-0.5 py-1 outline-none focus:ring-1 focus:ring-gray-500" />
                    <button type="button" onClick={() => { setStatExps(prev => ({ ...prev, [stat]: Math.min(65535, prev[stat] + 2560) })); setStatsLocked(false) }} className={`${stepBtn} rounded-r`} title="+1 vitamin (2560)">+</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: '28px repeat(6, 1fr)', gap: '3px 4px' }}>
                <div />
                {['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'].map(h => <div key={h} className="text-[9px] text-gray-500 text-center">{h}</div>)}
                <div className="text-[9px] text-gray-500 flex items-center">IV</div>
                {(['hp', 'attack', 'defense', 'spattack', 'spdefense', 'speed'] as const).map(stat => (
                  <input key={stat} type="number" min={0} max={31} value={ivs[stat]}
                    onChange={e => { const v = Math.max(0, Math.min(31, parseInt(e.target.value) || 0)); setIvs(prev => ({ ...prev, [stat]: v })); setStatsLocked(false) }}
                    className={numInput} />
                ))}
                <div className="text-[9px] text-gray-500 flex items-center">EV</div>
                {(['hp', 'attack', 'defense', 'spattack', 'spdefense', 'speed'] as const).map(stat => (
                  <div key={stat} className="flex items-stretch min-w-0">
                    <button type="button" onClick={() => { setEvs(prev => ({ ...prev, [stat]: Math.max(0, prev[stat] - 10) })); setStatsLocked(false) }} className={`${stepBtn} rounded-l`} title="−1 vitamin (10 EVs)">−</button>
                    <input type="number" min={0} max={252} value={evs[stat]}
                      onChange={e => { const v = Math.max(0, Math.min(252, parseInt(e.target.value) || 0)); setEvs(prev => ({ ...prev, [stat]: v })); setStatsLocked(false) }}
                      className="flex-1 min-w-0 bg-gray-700 text-white text-[10px] text-right px-0.5 py-1 outline-none focus:ring-1 focus:ring-gray-500" />
                    <button type="button" onClick={() => { setEvs(prev => ({ ...prev, [stat]: Math.min(252, prev[stat] + 10) })); setStatsLocked(false) }} className={`${stepBtn} rounded-r`} title="+1 vitamin (10 EVs)">+</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nature (Gen 3+) */}
          {gen >= 3 && (
            <div>
              <SectionLabel hint="±10% to two stats">Nature</SectionLabel>
              <NatureSelector value={natureName} onChange={n => { setNatureName(n); setStatsLocked(false) }} />
            </div>
          )}

          {/* Badges */}
          {BADGES_BY_GAME[selectedGame] && (
            <div>
              <SectionLabel hint={`${gen >= 3 ? '10%' : '12.5%'} boost`} right={
                <button onClick={() => setBadges(badges.size > 0 ? new Set() : allBadgeIds(selectedGame))} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                  {badges.size > 0 ? 'Clear' : 'All'}
                </button>
              }>Badges</SectionLabel>
              <div className="grid grid-cols-2 gap-1">
                {BADGES_BY_GAME[selectedGame].map(b => {
                  const active = badges.has(b.id)
                  const statsLabel = b.stats
                    ? b.stats.map(s => s === 'attack' ? 'Atk' : s === 'defense' ? 'Def' : s === 'speed' ? 'Spe' : s === 'spattack' ? 'SpA' : 'SpD').join('/')
                    : ''
                  const title = [b.leader, statsLabel && `+${statsLabel}`, b.type && gen === 2 && `+${b.type} moves`].filter(Boolean).join(' · ')
                  const bg = active && b.type ? TYPE_COLORS[b.type] : undefined
                  return (
                    <button key={b.id}
                      onClick={() => setBadges(prev => { const next = new Set(prev); if (next.has(b.id)) next.delete(b.id); else next.add(b.id); return next })}
                      title={title}
                      className={`text-[10px] px-1.5 py-0.5 rounded flex items-center justify-between gap-1 transition-colors ${active ? 'text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'}`}
                      style={active ? { background: bg ?? '#4b5563' } : undefined}>
                      <span className="truncate">{b.name}</span>
                      {statsLabel && <span className="text-[9px] opacity-80 flex-shrink-0">{statsLabel}</span>}
                    </button>
                  )
                })}
              </div>
              {gen === 2 && badges.has('glacier') && (
                <p className="text-[10px] text-gray-600 mt-1">Glacier's Sp. Def boost only applies for some Sp. Atk values (game bug); the calculator follows the game.</p>
              )}
            </div>
          )}

          {/* Stats */}
          <div>
            <SectionLabel right={canExportSpread && (
              <button onClick={handleExportSpread} disabled={exportingSpread}
                className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                title="Export spread as PNG" aria-label="Export spread as PNG">
                {exportingSpread ? (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                )}
              </button>
            )}>Stats</SectionLabel>
            {!species && <p className="text-xs text-gray-600 italic">Select a Pokemon above</p>}
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
            <SectionLabel hint={species ? '★ = can learn' : undefined}>Moves</SectionLabel>
            <div className="space-y-1.5">
              {moves.map((m, i) => (
                <MoveSlot key={i} value={m} moveOptions={moveOptions} game={selectedGame} index={i}
                  onChange={v => setMoves(prev => { const n = [...prev]; n[i] = v; return n })} />
              ))}
            </div>

            {moves.includes('Hidden Power') && gen >= 2 && derivedHiddenPower && (
              <div className="mt-3">
                <SectionLabel hint={`from ${gen === 2 ? 'DVs' : 'IVs'}: ${derivedHiddenPower.type} ${derivedHiddenPower.power}${gen >= 4 ? ' · special' : ''}`} right={hiddenPowerOverride && (
                  <button onClick={() => setHiddenPowerOverride(null)} className="text-[10px] text-gray-600 hover:text-gray-400">Use {gen === 2 ? 'DVs' : 'IVs'}</button>
                )}>Hidden Power type</SectionLabel>
                <div className="grid grid-cols-4 gap-1">
                  {HIDDEN_POWER_TYPES.map(t => {
                    const active = (hiddenPowerOverride ?? derivedHiddenPower.type) === t
                    return (
                      <button key={t} onClick={() => setHiddenPowerOverride(t === derivedHiddenPower.type ? null : t)}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate transition-colors ${active ? 'text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'}`}
                        style={active ? { background: TYPE_COLORS[t] ?? '#4b5563' } : undefined}
                        title={gen <= 3 ? `${t} · ${moveCategory(gen, t, 'Physical')}` : t}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {(moves.includes('Return') || moves.includes('Frustration')) && gen >= 2 && (
              <div className="flex items-center gap-2 mt-3">
                <label className="text-[10px] text-gray-500 w-16 flex-shrink-0">Friendship</label>
                <input type="range" min={0} max={255} value={friendship} onChange={e => setFriendship(parseInt(e.target.value))} className="flex-1 accent-pink-400" />
                <input type="number" min={0} max={255} value={friendship} onChange={e => setFriendship(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
                  className="w-12 bg-gray-700 text-white text-[10px] text-right rounded px-1 py-0.5 outline-none" />
              </div>
            )}
          </div>

          {/* Stat stages */}
          <StagesPanel gen={gen} stages={stages} onChange={setStages} />

          {/* Condition */}
          <div>
            <SectionLabel hint="status, HP, screens">Condition</SectionLabel>
            <ConditionPanel gen={gen} cond={cond} onChange={setCond} side="player" />
          </div>

          {/* Field */}
          {gen >= 2 && <FieldPanel gen={gen} field={fieldSettings} onChange={setFieldSettings} />}

        </div>
      </div>

      {/* ── Right panel: trainer + matchups ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-700 bg-gray-900 flex items-center gap-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex-shrink-0">Trainer</p>
          <div className="flex-1 max-w-sm">
            <Combobox value={trainer ? `${trainer.trainer_class} ${trainer.name}` : ''} options={trainerOptions} onSelect={setTrainerId} placeholder="Select a trainer…" />
          </div>
          {trainer && (
            <div className="flex items-center gap-3 text-xs text-gray-400 ml-2">
              {trainer.location && <span>{trainer.location}</span>}
              <span>{trainer.party.length} Pokémon</span>
              <span>Max Lv{Math.max(...trainer.party.map(p => p.level))}</span>
              {trainer.is_double_battle && <span className="text-sky-400">Doubles</span>}
              <button onClick={() => setTrainerId('')} className="text-gray-600 hover:text-gray-400 text-xs" title="Clear trainer">✕</button>
            </div>
          )}
          <button onClick={() => setShowEnemyPanel(v => !v)}
            className={`ml-auto text-[10px] px-2 py-1 rounded border transition-colors ${showEnemyPanel ? 'border-gray-500 text-gray-200 bg-gray-800' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}
            title="Stages, status, HP and screens applied to every opposing Pokémon">
            Their side {(enemyCond.status !== 'none' || enemyCond.hpPercent !== 100 || Object.values(enemyCond.flags).some(Boolean) || Object.values(enemyStages).some(v => v !== 0)) ? '●' : ''}
          </button>
        </div>

        {showEnemyPanel && (
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-700 bg-gray-900/60 grid grid-cols-2 gap-6">
            <StagesPanel gen={gen} stages={enemyStages} onChange={setEnemyStages} title="Their stat stages" hint="applies to all their Pokémon" />
            <div>
              <SectionLabel hint="applies to all their Pokémon">Their condition</SectionLabel>
              <ConditionPanel gen={gen} cond={enemyCond} onChange={setEnemyCond} side="enemy" />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {!species && !trainerId && <div className="flex items-center justify-center h-full text-gray-600 text-sm">Select a Pokemon and trainer to see matchups</div>}
          {species && !trainerId && <div className="flex items-center justify-center h-full text-gray-600 text-sm">Select a trainer to see matchups</div>}
          {!species && trainerId && <div className="flex items-center justify-center h-full text-gray-600 text-sm">Select your Pokemon to see matchups</div>}
          {species && trainerId && !stats && <div className="flex items-center justify-center h-full text-gray-600 text-sm">Stats not available for {displayName(species)} in this game</div>}

          {species && trainerId && stats && playerBattler && matchups.length > 0 && (
            <div className="space-y-3">
              {matchups.map(m => (
                <MatchupCard key={m.key} enemy={m.enemy} playerAttacks={m.playerAttacks} enemyAttacks={m.enemyAttacks}
                  playerHp={playerBattler.currentHp} game={selectedGame} playerEdit={playerEdit} enemyEdit={enemyEdit} />
              ))}
              <p className="text-[10px] text-gray-600 pt-2">
                {gen === 5 ? 'Gen 5 formula from documented disassembly research (no local decomp); ' : 'Formula verified against the game code; '}
                {selectedGame === 'Diamond and Pearl' ? 'Diamond/Pearl assumed identical to Platinum. ' : ''}
                KO odds fold in the chance to miss, every damage roll and critical hits; hover a figure for the breakdown.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
