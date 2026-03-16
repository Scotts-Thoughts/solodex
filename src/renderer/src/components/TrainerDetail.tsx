import { useMemo } from 'react'
import type { Trainer, TrainerPokemon } from '../types/pokemon'
import { getTrainer, getMoveData, getNatureInfo, GAME_TO_GEN, getPokemonData, displayName } from '../data'
import TypeBadge, { TYPE_COLORS } from './TypeBadge'
import WikiPopover from './WikiPopover'
import { STAT_CONFIG, GEN1_STAT_CONFIG, GEN1_GAMES } from '../constants/stats'
import { getArtworkUrl } from '../utils/sprites'

const CLASS_COLORS: Record<string, string> = {
  Leader:         '#FFD700',
  'Gym Leader':   '#FFD700',
  LEADER:         '#FFD700',
  'Elite Four':   '#C0C0C0',
  'ELITE FOUR':   '#C0C0C0',
  Champion:       '#E5E4E2',
  CHAMPION:       '#E5E4E2',
  Rival:          '#60A5FA',
  RIVAL:          '#60A5FA',
  RIVAL1:         '#60A5FA',
  RIVAL2:         '#60A5FA',
  RIVAL3:         '#FFD700',
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

      {/* Bottom: stats + moves side by side */}
      <div className="flex-1 flex gap-3 px-3 pb-3 pt-1">
        {/* Stats */}
        <div className="w-44 shrink-0">
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
        <div className="flex-1 min-w-0">
          <div className="space-y-1">
            {pokemon.moves.map((moveName, i) => {
              const move = getMoveData(moveName, game)
              return (
                <div key={`${moveName}-${i}`} className="flex items-center gap-2">
                  {move && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[move.type] ?? '#6B7280' }}
                    />
                  )}
                  <WikiPopover name={moveName} type="move">
                    <span className="text-sm text-gray-200 hover:text-white cursor-pointer">{moveName}</span>
                  </WikiPopover>
                </div>
              )
            })}
          </div>
        </div>
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
  const trainer = useMemo(() => getTrainer(selectedGame, trainerId), [selectedGame, trainerId])

  if (!trainer) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600">
        Select a trainer
      </div>
    )
  }

  const classColor = CLASS_COLORS[trainer.trainer_class] ?? '#94A3B8'
  const totalXp = trainer.party.reduce((sum, p) => sum + p.experience_yield, 0)
  const avgLevel = trainer.party.length > 0
    ? Math.round(trainer.party.reduce((s, p) => s + p.level, 0) / trainer.party.length)
    : 0

  // Use 3 columns for 4+ pokemon, 2 for 2-3, 1 for 1
  const cols = trainer.party.length >= 4 ? 3 : trainer.party.length >= 2 ? 2 : 1

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
    </div>
  )
}
