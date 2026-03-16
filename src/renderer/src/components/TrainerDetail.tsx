import { useMemo, useState, useEffect } from 'react'
import type { Trainer, TrainerPokemon } from '../types/pokemon'
import { getTrainer, getMoveData, getNatureInfo, GAME_TO_GEN, getPokemonData, displayName, getTrainerGroup, isBossTrainer, getPokemonDefenseMatchups } from '../data'
import TypeBadge, { TYPE_COLORS } from './TypeBadge'
import WikiPopover from './WikiPopover'
import { STAT_CONFIG, GEN1_STAT_CONFIG, GEN1_GAMES } from '../constants/stats'
import { getArtworkUrl } from '../utils/sprites'

const CLASS_COLORS: Record<string, string> = {
  Leader:         '#FFD700',
  'Gym Leader':   '#FFD700',
  LEADER:         '#FFD700',
  'Elite Four':   '#C084FC',
  'ELITE FOUR':   '#C084FC',
  LORELEI:        '#C084FC',
  BRUNO:          '#C084FC',
  AGATHA:         '#C084FC',
  LANCE:          '#C084FC',
  Champion:       '#2DD4BF',
  CHAMPION:       '#2DD4BF',
  Rival:          '#60A5FA',
  RIVAL:          '#60A5FA',
  RIVAL1:         '#60A5FA',
  RIVAL2:         '#60A5FA',
  RIVAL3:         '#2DD4BF',
  Player:         '#60A5FA',
}

function formatLocation(loc: string | null): string {
  if (!loc) return 'Unknown'
  return loc.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
}

function getTrainerSpriteUrl(species: string, game: string): string {
  const pokemonData = getPokemonData(species, game)
  if (pokemonData) {
    return getArtworkUrl(species, pokemonData.national_dex_number)
  }
  return ''
}

function NatureDisplay({ nature }: { nature: string }) {
  const info = getNatureInfo(nature)
  if (!info || (!info.increased && !info.decreased)) {
    return <span className="text-gray-400">{nature}</span>
  }
  const labels: Record<string, string> = {
    attack: 'Atk', defense: 'Def', speed: 'Spe',
    specialAttack: 'SpA', specialDefense: 'SpD',
  }
  return (
    <span className="text-gray-300">
      {nature}{' '}
      (<span className="text-red-400">+{labels[info.increased!]}</span>
      /<span className="text-blue-400">-{labels[info.decreased!]}</span>)
    </span>
  )
}

interface PartyCardProps {
  pokemon: TrainerPokemon
  game: string
  index: number
}

function PartyCard({ pokemon, game, index }: PartyCardProps) {
  const spriteUrl = getTrainerSpriteUrl(pokemon.species, game)
  const pokemonData = getPokemonData(pokemon.species, game)
  const isGen1 = GEN1_GAMES.has(game)

  const statTotal = isGen1
    ? pokemon.stats.hp + pokemon.stats.attack + pokemon.stats.defense + pokemon.stats.special_attack + pokemon.stats.speed
    : Object.values(pokemon.stats).reduce((s, v) => s + v, 0)

  const statConfig = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG

  const maxStat = Math.max(...Object.values(pokemon.stats), 1)

  return (
    <div className="bg-gray-800/50 border border-gray-700/60 rounded-lg overflow-hidden flex flex-col">
      {/* Top row: sprite + name/types + level */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        {spriteUrl ? (
          <img
            src={spriteUrl}
            alt={pokemon.species}
            className="w-14 h-14 object-contain shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-14 h-14 bg-gray-700 rounded-full flex items-center justify-center text-gray-500 text-lg font-bold shrink-0">
            {index + 1}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-white truncate">{displayName(pokemon.species)}</span>
            <span className="text-sm text-gray-500 tabular-nums shrink-0">Lv{pokemon.level}</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            {pokemonData && (
              <>
                <TypeBadge type={pokemonData.type_1} small game={game} />
                {pokemonData.type_2 && pokemonData.type_2 !== pokemonData.type_1 && (
                  <TypeBadge type={pokemonData.type_2} small game={game} />
                )}
              </>
            )}
          </div>
          {/* Meta: ability, nature, held item */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs">
            {pokemon.ability && (
              <WikiPopover name={pokemon.ability} type="ability">
                <span className="text-blue-400 hover:text-blue-300 cursor-pointer">{pokemon.ability}</span>
              </WikiPopover>
            )}
            {pokemon.nature && <NatureDisplay nature={pokemon.nature} />}
            {pokemon.held_item && <span className="text-yellow-400">{pokemon.held_item}</span>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 pb-2 pt-1">
        <div className="space-y-1">
          {statConfig.map(({ key, label, color }) => {
            const value = pokemon.stats[key]
            const pct = (value / maxStat) * 100
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-7 text-right text-xs font-semibold text-gray-500">{key === 'special_attack' && isGen1 ? 'Spc' : label}</span>
                <span className="w-7 text-right text-xs font-bold text-gray-300 tabular-nums">{value}</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }} />
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-700/50 mt-0.5">
            <span className="w-7 text-right text-xs font-semibold text-gray-600">Tot</span>
            <span className="w-7 text-right text-xs font-bold text-white tabular-nums">{statTotal}</span>
          </div>
        </div>
      </div>

      {/* Moves */}
      <div className="px-3 pb-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-600">
              <th className="text-left font-normal pb-0.5">Type</th>
              <th className="text-left font-normal pb-0.5">Move</th>
              <th className="text-right font-normal pb-0.5 w-8">Pow</th>
              <th className="text-right font-normal pb-0.5 w-8">Acc</th>
              <th className="text-right font-normal pb-0.5 w-8">PP</th>
            </tr>
          </thead>
          <tbody>
            {pokemon.moves.map((moveName, i) => {
              const move = getMoveData(moveName, game)
              return (
                <tr key={`${moveName}-${i}`}>
                  <td className="py-0.5 pr-2">
                    {move && <TypeBadge type={move.type} small game={game} />}
                  </td>
                  <td className="py-0.5">
                    <WikiPopover name={moveName} type="move">
                      <span className="text-gray-200 hover:text-white cursor-pointer">{moveName}</span>
                    </WikiPopover>
                  </td>
                  <td className="text-right text-xs text-gray-500 tabular-nums py-0.5">{move?.power ?? '—'}</td>
                  <td className="text-right text-xs text-gray-500 tabular-nums py-0.5">{move?.accuracy ?? '—'}</td>
                  <td className="text-right text-xs text-gray-500 tabular-nums py-0.5">{move?.pp ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Colors from attacker's perspective: high multiplier = good for player
function effColor(multiplier: number): string {
  if (multiplier >= 4) return '#86efac'   // bright green — 4x
  if (multiplier >= 2) return '#86efac'   // green — super effective
  if (multiplier === 1) return '#9ca3af'  // gray — neutral
  if (multiplier > 0) return '#fca5a5'    // red — resisted
  return '#6b7280'                        // dark gray — immune
}

function effBg(multiplier: number): string {
  if (multiplier >= 4) return '#14532d'
  if (multiplier >= 2) return '#14532d'
  if (multiplier === 1) return '#374151'
  if (multiplier > 0) return '#7f1d1d'
  return '#1f2937'
}

function effLabel(m: number): string {
  if (m === 0) return '0x'
  if (m === 0.25) return '¼x'
  if (m === 0.5) return '½x'
  if (m === 1) return '1x'
  return `${m}x`
}

function TeamTypeSummary({ party, game }: { party: TrainerPokemon[]; game: string }) {
  const typeData = useMemo(() => {
    // For each party member, get their defensive matchups
    const perMon = party.map(p => {
      const data = getPokemonData(p.species, game)
      if (!data) return null
      return getPokemonDefenseMatchups(data.type_1, data.type_2 ?? data.type_1, game)
    })

    // Collect all attacking types from the first non-null matchup
    const allTypes = Object.keys(perMon.find(m => m !== null) ?? {})

    // For each attacking type, compute per-mon multipliers
    return allTypes.map(atkType => {
      const multipliers = perMon.map(m => m ? (m[atkType] ?? 1) : 1)
      const total = multipliers.reduce((s, v) => s + v, 0)
      return { type: atkType, multipliers, total }
    }).sort((a, b) => b.total - a.total)
  }, [party, game])

  if (typeData.length === 0) return null

  const half = Math.ceil(typeData.length / 2)
  const left = typeData.slice(0, half)
  const right = typeData.slice(half)

  const colTemplate = `auto repeat(${party.length}, 28px)`

  const renderColumn = (items: typeof typeData) => (
    <div className="grid gap-1 items-center" style={{ gridTemplateColumns: colTemplate }}>
      {items.map(({ type, multipliers }) => (
        <div key={type} className="contents">
          <div className="py-0.5"><TypeBadge type={type} small game={game} /></div>
          {multipliers.map((m, i) => (
            <span
              key={i}
              className="text-xs font-bold text-center rounded py-0.5"
              style={{ backgroundColor: effBg(m), color: effColor(m) }}
            >
              {effLabel(m)}
            </span>
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <div className="px-6 py-3 border-t border-gray-800 shrink-0">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type Effectiveness</h3>
      <div className="flex gap-6">
        {renderColumn(left)}
        {renderColumn(right)}
      </div>
    </div>
  )
}

interface Props {
  trainerId: string
  selectedGame: string
  onSelectPokemon?: (name: string) => void
}

export default function TrainerDetail({ trainerId, selectedGame }: Props) {
  const group = useMemo(() => getTrainerGroup(selectedGame, trainerId), [selectedGame, trainerId])
  const [groupIndex, setGroupIndex] = useState(0)

  // Reset group index when trainerId changes, defaulting to the selected member's position
  useEffect(() => {
    if (group) {
      const idx = group.trainerIds.indexOf(trainerId)
      setGroupIndex(idx >= 0 ? idx : 0)
    } else {
      setGroupIndex(0)
    }
  }, [trainerId, group])

  const activeId = group ? group.trainerIds[groupIndex] ?? group.trainerIds[0] : trainerId
  const trainer = useMemo(() => getTrainer(selectedGame, activeId), [selectedGame, activeId])

  // Resolve names for group toggle labels
  const groupTrainers = useMemo(() => {
    if (!group) return []
    return group.trainerIds.map(id => getTrainer(selectedGame, id)).filter((t): t is Trainer => t !== null)
  }, [group, selectedGame])

  if (!trainer) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600">
        Select a trainer
      </div>
    )
  }

  const classColor = isBossTrainer(trainer.name) ? '#2DD4BF' : (CLASS_COLORS[trainer.trainer_class] ?? '#94A3B8')
  const totalXp = trainer.party.reduce((sum, p) => sum + p.experience_yield, 0)
  const avgLevel = trainer.party.length > 0
    ? Math.round(trainer.party.reduce((s, p) => s + p.level, 0) / trainer.party.length)
    : 0

  // Use 3 columns for 4+ pokemon, 2 for 2-3, 1 for 1
  const cols = trainer.party.length >= 4 ? 3 : trainer.party.length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Trainer Header */}
      <div className="flex items-center justify-between px-6 py-3 shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">{trainer.name}</h1>
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${classColor}20`, color: classColor, border: `1px solid ${classColor}40` }}
          >
            {trainer.trainer_class}
          </span>
          {trainer.is_double_battle && (
            <span className="text-xs font-bold text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded-full border border-purple-700/50">
              Double
            </span>
          )}
        </div>
        <div className="flex items-center gap-5 text-sm text-gray-500">
          {trainer.location && <span>{formatLocation(trainer.location)}</span>}
          {trainer.money > 0 && <span className="text-yellow-400/70">${trainer.money.toLocaleString()}</span>}
          <span>{trainer.party.length} Pokemon, avg Lv{avgLevel}</span>
          {totalXp > 0 && <span>{totalXp.toLocaleString()} total xp</span>}
        </div>
      </div>

      {/* Group toggle */}
      {groupTrainers.length > 1 && (
        <div className="flex items-center gap-1 px-6 pt-3">
          {groupTrainers.map((gt, i) => (
            <button
              key={gt.id}
              onClick={() => setGroupIndex(i)}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                i === groupIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {gt.name}
            </button>
          ))}
        </div>
      )}

      {/* Party grid — scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {trainer.party.map((pokemon, index) => (
            <PartyCard
              key={`${pokemon.species}-${index}`}
              pokemon={pokemon}
              game={selectedGame}
              index={index}
            />
          ))}
        </div>
      </div>

      {/* Type effectiveness summary */}
      <TeamTypeSummary party={trainer.party} game={selectedGame} />
    </div>
  )
}
