import { useState, useEffect } from 'react'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData } from '../data'
import BaseStats from './BaseStats'
import Movepool from './Movepool'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'

function SpriteImage({ dexNumber }: { dexNumber: number }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [dexNumber])

  const src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNumber}.png`

  if (failed) {
    return (
      <div className="w-36 h-36 flex items-center justify-center text-gray-700 text-5xl select-none">
        ?
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      className="w-36 h-36 object-contain drop-shadow-lg"
      onError={() => setFailed(true)}
    />
  )
}

interface Props {
  pokemonName: string
  selectedGame: string
  onSelect: (name: string) => void
}

export default function PokemonDetail({ pokemonName, selectedGame, onSelect }: Props) {
  const [pokemon, setPokemon] = useState<PokemonData | null>(null)

  useEffect(() => {
    if (selectedGame) setPokemon(getPokemonData(pokemonName, selectedGame))
  }, [pokemonName, selectedGame])

  if (!pokemon) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
  }

  const isDualType = pokemon.type_1 !== pokemon.type_2

  return (
    <div className="flex h-full bg-gray-900 overflow-hidden">

      {/* ── Left column: identity + stats ── */}
      <div className="w-64 shrink-0 flex flex-col overflow-y-auto border-r border-gray-700 bg-gray-900 px-4 py-4 gap-4">

        {/* Sprite */}
        <div className="flex justify-center">
          <SpriteImage dexNumber={pokemon.national_dex_number} />
        </div>

        {/* Identity */}
        <div>
          <p className="text-xs font-mono text-gray-600 mb-0.5">
            #{String(pokemon.national_dex_number).padStart(3, '0')}
          </p>
          <h1 className="text-xl font-bold text-white leading-tight">{pokemon.species}</h1>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <TypeBadge type={pokemon.type_1} game={selectedGame} />
            {isDualType && <TypeBadge type={pokemon.type_2} game={selectedGame} />}
          </div>
        </div>

        {/* Meta */}
        <div className="text-xs space-y-1 border-t border-gray-800 pt-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Growth Rate</span>
            <span className="text-gray-300 font-medium">{pokemon.growth_rate}</span>
          </div>
          {pokemon.abilities.length > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-600 shrink-0">
                {pokemon.abilities.length === 1 ? 'Ability' : 'Abilities'}
              </span>
              <span className="text-gray-300 text-right flex flex-wrap gap-x-1 justify-end">
                {pokemon.abilities.map((ability, i) => (
                  <span key={ability}>
                    <WikiPopover name={ability} type="ability">
                      {ability}
                    </WikiPopover>
                    {i < pokemon.abilities.length - 1 && <span className="text-gray-600">,</span>}
                  </span>
                ))}
              </span>
            </div>
          )}
          {pokemon.egg_group_1 && pokemon.egg_group_1 !== 'NoEggsDiscovered' && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-600 shrink-0">Egg Groups</span>
              <span className="text-gray-300 text-right">
                {[pokemon.egg_group_1, pokemon.egg_group_2]
                  .filter(Boolean)
                  .filter(g => g !== 'NoEggsDiscovered')
                  .join(', ')}
              </span>
            </div>
          )}
          {pokemon.common_item && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-600 shrink-0">Held Item</span>
              <span className="text-gray-300 text-right">{pokemon.common_item}</span>
            </div>
          )}
        </div>

        {/* Base Stats */}
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Base Stats</p>
          <BaseStats stats={pokemon.base_stats} />
        </div>

        {/* Evolution Family */}
        {pokemon.evolution_family.length > 1 && (
          <div className="border-t border-gray-800 pt-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Evolution</p>
            <div className="flex flex-col gap-1">
              {pokemon.evolution_family.map((evo, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {i > 0 && evo.method && (
                    <span className="text-xs text-gray-600">
                      {evo.method === 'level' ? `Lv.${evo.parameter}` : evo.method} →
                    </span>
                  )}
                  <button
                    onClick={() => onSelect(evo.species)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      evo.species === pokemonName
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

      {/* ── Right column: full movepool ── */}
      <div className="flex-1 overflow-y-auto px-4 pt-1 pb-4 bg-gray-900">
        <Movepool pokemon={pokemon} game={selectedGame} />
      </div>

    </div>
  )
}
