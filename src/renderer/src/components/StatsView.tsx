import { useState, useEffect, useMemo } from 'react'
import {
  GAME_TO_GEN,
  getAllPokemonForGame,
  getPokemonData,
  getNatureInfo,
  getMajorBattles,
  getTrainer,
  displayName,
} from '../data'
import {
  calcGen12Stats,
  calcGen3PlusStats,
  deriveHpDv,
  getNatureMods,
  NEUTRAL_NATURE,
  type CalcStats,
  type NatureMods,
  type Gen12DVs,
  type Gen12StatExps,
  type Gen3IVs,
  type Gen3EVs,
  DEFAULT_GEN12_DVS,
  DEFAULT_GEN12_STATEXPS,
  DEFAULT_GEN3_IVS,
  DEFAULT_GEN3_EVS,
} from '../utils/damageCalc'
import Combobox, { type ComboOption } from './Combobox'
import TypeBadge, { TYPE_COLORS } from './TypeBadge'
import NatureSelector from './NatureSelector'
import { trainerNameColor } from '../utils/trainerColor'
import { getHomeSpriteUrl } from '../utils/sprites'
import type { BaseStats, TrainerPokemon } from '../types/pokemon'

interface Props {
  selectedGame: string
  initialPokemon?: string | null
}

// Max trainable speed investment per generation.
const MAX_STATEXP = 65535 // Gen 1–2
const MAX_EV = 252        // Gen 3+

/**
 * Compute a Pokemon's Speed at a given level, overriding only the speed
 * EV/StatExp (other stats are irrelevant). Gen-aware.
 */
function speedAtLevel(
  base: BaseStats,
  gen: number,
  level: number,
  speedInvestment: number,
  dvs: Gen12DVs,
  statExps: Gen12StatExps,
  ivs: Gen3IVs,
  evs: Gen3EVs,
  natureMods: NatureMods,
): number {
  if (gen <= 2) {
    return calcGen12Stats(base, level, dvs, { ...statExps, speed: speedInvestment }).speed
  }
  return calcGen3PlusStats(base, level, ivs, { ...evs, speed: speedInvestment }, natureMods).speed
}

/**
 * Lowest level (1–100) at which the player strictly outspeeds `targetSpeed`,
 * or null if Lv100 still isn't enough. A tie does not count as outspeeding.
 */
function minLevelToOutspeed(
  base: BaseStats,
  gen: number,
  targetSpeed: number,
  speedInvestment: number,
  dvs: Gen12DVs,
  statExps: Gen12StatExps,
  ivs: Gen3IVs,
  evs: Gen3EVs,
  natureMods: NatureMods,
): number | null {
  for (let lvl = 1; lvl <= 100; lvl++) {
    const spd = speedAtLevel(base, gen, lvl, speedInvestment, dvs, statExps, ivs, evs, natureMods)
    if (spd > targetSpeed) return lvl
  }
  return null
}

export default function StatsView({ selectedGame, initialPokemon }: Props) {
  const gen = parseInt(GAME_TO_GEN[selectedGame] ?? '1')

  const [species, setSpecies] = useState(initialPokemon ?? '')
  const [level, setLevel]     = useState(50)

  // Gen 1–2: DVs (0–15) + Stat Experience (0–65535). Gen 3+: IVs (0–31) + EVs (0–252).
  const [dvs, setDvs]           = useState<Gen12DVs>(DEFAULT_GEN12_DVS)
  const [statExps, setStatExps] = useState<Gen12StatExps>(DEFAULT_GEN12_STATEXPS)
  const [ivs, setIvs]           = useState<Gen3IVs>(DEFAULT_GEN3_IVS)
  const [evs, setEvs]           = useState<Gen3EVs>(DEFAULT_GEN3_EVS)
  const [nature, setNature]     = useState('Hardy')

  const pokeData = useMemo(
    () => (species ? getPokemonData(species, selectedGame) : null),
    [species, selectedGame],
  )

  const natureMods = useMemo<NatureMods>(() => {
    if (gen < 3) return NEUTRAL_NATURE
    const info = getNatureInfo(nature)
    return info ? getNatureMods(info.increased, info.decreased) : NEUTRAL_NATURE
  }, [nature, gen])

  // ── Calculated stats ────────────────────────────────────────────────────────
  const stats = useMemo<CalcStats | null>(() => {
    if (!pokeData) return null
    return gen <= 2
      ? calcGen12Stats(pokeData.base_stats, level, dvs, statExps)
      : calcGen3PlusStats(pokeData.base_stats, level, ivs, evs, natureMods)
  }, [pokeData, level, gen, dvs, statExps, ivs, evs, natureMods])

  const pokemonOptions = useMemo((): ComboOption[] =>
    getAllPokemonForGame(selectedGame).map(p => ({
      id: p.species,
      label: displayName(p.species),
      sublabel: `#${String(p.national_dex_number).padStart(4, '0')} · ${p.type_1}${p.type_1 !== p.type_2 ? `/${p.type_2}` : ''}`,
      color: TYPE_COLORS[p.type_1] ?? '#6b7280',
    })),
    [selectedGame],
  )

  // ── Scouting ──────────────────────────────────────────────────────────────
  const majorBattles = useMemo(() => getMajorBattles(selectedGame), [selectedGame])

  const scouting = useMemo(() => {
    if (!pokeData) return []
    const base = pokeData.base_stats
    const maxInvest = gen <= 2 ? MAX_STATEXP : MAX_EV
    const userInvest = gen <= 2 ? statExps.speed : evs.speed

    return majorBattles.map(battle => {
      // Fastest enemy Pokemon across every trainer in the battle group.
      let fastest: TrainerPokemon | null = null
      for (const id of battle.trainerIds) {
        const t = getTrainer(selectedGame, id)
        if (!t) continue
        for (const mon of t.party) {
          if (!fastest || mon.stats.speed > fastest.stats.speed) fastest = mon
        }
      }
      const targetSpeed = fastest?.stats.speed ?? 0
      const levelMax  = minLevelToOutspeed(base, gen, targetSpeed, maxInvest,  dvs, statExps, ivs, evs, natureMods)
      const levelUser = minLevelToOutspeed(base, gen, targetSpeed, userInvest, dvs, statExps, ivs, evs, natureMods)
      return { battle, fastest, targetSpeed, levelMax, levelUser }
    })
  }, [pokeData, gen, majorBattles, selectedGame, dvs, statExps, ivs, evs, natureMods])

  // Default the picker to the Pokemon being viewed in the Pokedex; following
  // changes to that selection while this tab is open.
  useEffect(() => {
    if (initialPokemon) setSpecies(initialPokemon)
  }, [initialPokemon])

  // Clear nothing on game switch — inputs are intentionally sticky, but a species
  // missing from the new game should reset the picker.
  useEffect(() => {
    if (species && !getPokemonData(species, selectedGame)) setSpecies('')
  }, [selectedGame, species])

  const userSpeedInvest = gen <= 2 ? statExps.speed : evs.speed

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden text-white">

      {/* ── Left: calculator ── */}
      <div
        className="flex-shrink-0 flex flex-col overflow-y-auto border-r border-gray-700 bg-gray-900"
        style={{ width: 420 }}
      >
        <div className="p-4 space-y-5">

          {/* Pokemon + Level */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Pokemon
            </p>
            <Combobox
              value={species ? displayName(species) : ''}
              options={pokemonOptions}
              onSelect={setSpecies}
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
                  if (!isNaN(v) && v >= 1 && v <= 100) setLevel(v)
                }}
                className="w-16 bg-gray-700 text-white text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          {/* Nature (Gen 3+) */}
          {gen >= 3 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Nature
                <span className="text-gray-600 ml-1 font-normal normal-case tracking-normal">
                  — ±10% to two stats
                </span>
              </p>
              <NatureSelector value={nature} onChange={setNature} />
            </div>
          )}

          {/* IV/EV (or DV/StatExp) grid */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {gen <= 2 ? 'DVs & Stat Exp' : 'IVs & EVs'}
            </p>
            {gen <= 2 ? (
              <div className="grid" style={{ gridTemplateColumns: '28px repeat(5, 1fr)', gap: '3px 4px' }}>
                <div />
                {['HP', 'Atk', 'Def', 'Spe', 'Spc'].map(h => (
                  <div key={h} className="text-[9px] text-gray-500 text-center">{h}</div>
                ))}
                <div className="text-[9px] text-gray-500 flex items-center">DV</div>
                <input
                  type="number"
                  value={deriveHpDv(dvs)}
                  disabled
                  title="Derived from ATK/DEF/SPE/SPC parity bits"
                  className="w-full bg-gray-800 text-gray-500 text-[10px] text-right rounded px-1 py-1 outline-none cursor-default"
                />
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
                    }}
                    className="w-full bg-gray-700 text-white text-[10px] text-right rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
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
                    }}
                    className="w-full min-w-0 bg-gray-700 text-white text-[10px] text-right rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: '28px repeat(6, 1fr)', gap: '3px 4px' }}>
                <div />
                {['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'].map(h => (
                  <div key={h} className="text-[9px] text-gray-500 text-center">{h}</div>
                ))}
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
                    }}
                    className="w-full bg-gray-700 text-white text-[10px] text-right rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
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
                    }}
                    className="w-full bg-gray-700 text-white text-[10px] text-right rounded px-1 py-1 outline-none focus:ring-1 focus:ring-gray-500"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Result card */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Calculated Stats
            </p>
            {!pokeData ? (
              <p className="text-xs text-gray-600 italic">Select a Pokemon above</p>
            ) : stats && (
              <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                  <img
                    src={getHomeSpriteUrl(species, pokeData.national_dex_number)}
                    alt=""
                    className="pokemon-icon-stroke w-10 h-10 flex-shrink-0 object-contain"
                    onError={(e) => {
                      const fallback = getHomeSpriteUrl('', pokeData.national_dex_number)
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                      else e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">{displayName(species)}</span>
                  <div className="flex gap-1 ml-auto">
                    <TypeBadge type={pokeData.type_1} small game={selectedGame} />
                    {pokeData.type_1 !== pokeData.type_2 && <TypeBadge type={pokeData.type_2} small game={selectedGame} />}
                  </div>
                </div>
                <div className={`grid ${gen <= 1 ? 'grid-cols-5' : 'grid-cols-6'} text-center`}>
                  {(gen <= 1
                    ? ([['HP', 'hp'], ['Atk', 'attack'], ['Def', 'defense'], ['Spc', 'spattack'], ['Spe', 'speed']] as const)
                    : ([['HP', 'hp'], ['Atk', 'attack'], ['Def', 'defense'], ['SpA', 'spattack'], ['SpD', 'spdefense'], ['Spe', 'speed']] as const)
                  ).map(([label, key]) => {
                    const incKey = natureMods[key as keyof NatureMods]
                    const tint = incKey > 1 ? 'text-green-400' : incKey < 1 ? 'text-red-400' : 'text-white'
                    return (
                      <div key={label} className="px-1 py-2 border-r border-gray-700 last:border-r-0">
                        <div className="text-[10px] text-gray-400 font-semibold">{label}</div>
                        <div className={`text-base font-bold tabular-nums ${gen >= 3 && key !== 'hp' ? tint : 'text-white'}`}>
                          {stats[key]}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Right: scouting ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-700 bg-gray-900">
          <p className="text-sm font-bold text-white">Scouting — outspeed levels</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Minimum level for {species ? displayName(species) : 'your Pokemon'} to outspeed each major battle's fastest
            Pokemon, with <span className="text-gray-300">max Speed {gen <= 2 ? 'Stat Exp' : 'EVs'}</span> vs your
            current Speed {gen <= 2 ? 'Stat Exp' : 'EV'} ({userSpeedInvest}){gen >= 3 ? `, ${nature} nature` : ''}.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!species ? (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              Select a Pokemon to scout
            </div>
          ) : majorBattles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              No trainer data available for {selectedGame}
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Header row */}
              <div className="flex items-center gap-2 px-2 text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
                <span className="flex-1">Battle</span>
                <span className="w-40 flex-shrink-0">Fastest Pokemon</span>
                <span className="w-20 text-center flex-shrink-0">Max {gen <= 2 ? 'Exp' : 'EVs'}</span>
                <span className="w-20 text-center flex-shrink-0">Your {gen <= 2 ? 'Exp' : 'EV'}</span>
              </div>
              {scouting.map(({ battle, fastest, targetSpeed, levelMax, levelUser }) => (
                <div
                  key={battle.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800 border border-gray-700"
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-semibold truncate"
                      style={{ color: trainerNameColor(battle.name, battle.trainerClass, selectedGame) }}
                    >
                      {battle.name}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">{battle.trainerClass} · max Lv{battle.maxLevel}</div>
                  </div>
                  <div className="w-40 flex-shrink-0 flex items-center gap-1.5">
                    {fastest && (
                      <>
                        <img
                          src={getHomeSpriteUrl(fastest.species, getPokemonData(fastest.species, selectedGame)?.national_dex_number ?? 0)}
                          alt=""
                          className="pokemon-icon-stroke w-6 h-6 flex-shrink-0 object-contain"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                        <div className="min-w-0">
                          <div className="text-[11px] text-gray-200 truncate">{displayName(fastest.species)}</div>
                          <div className="text-[10px] text-gray-500">Lv{fastest.level} · {targetSpeed} Spe</div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="w-20 flex-shrink-0 text-center">
                    <LevelPill level={levelMax} />
                  </div>
                  <div className="w-20 flex-shrink-0 text-center">
                    <LevelPill level={levelUser} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LevelPill({ level }: { level: number | null }) {
  if (level === null) {
    return <span className="inline-block text-[11px] font-bold text-red-400" title="Can't outspeed even at Lv100">—</span>
  }
  return <span className="inline-block text-sm font-bold text-emerald-400 tabular-nums">Lv{level}</span>
}
