import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { PokemonData } from '../types/pokemon'
import { getPokemonData, getGamesForPokemon, GEN_GROUPS, GAME_ABBREV, GAME_COLOR, GAME_TO_GEN, displayName } from '../data'
import GrowthRatePopover from './GrowthRatePopover'
import BaseStats from './BaseStats'
import Movepool from './Movepool'
import type { GenGameData } from './Movepool'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import TypeEffectivenessPanel from './TypeEffectivenessPanel'
import { STAT_CONFIG } from '../constants/stats'
import { getArtworkUrl } from '../utils/sprites'

function renderEvYield(ev: PokemonData['ev_yield']) {
  const entries = STAT_CONFIG
    .map(cfg => ({ ...cfg, value: ev[cfg.key] }))
    .filter(entry => entry.value && entry.value > 0)

  if (entries.length === 0) {
    return <span className="text-gray-500">0</span>
  }

  return (
    <div className="space-y-0.5">
      {entries.map(({ key, label, color, value }) => (
        <div key={key as string} className="text-sm" style={{ color }}>
          {value} {label}
        </div>
      ))}
    </div>
  )
}

function SpriteImage({ name, dexNumber }: { name: string; dexNumber: number }) {
  const [src, setSrc] = useState(getArtworkUrl(name, dexNumber))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(getArtworkUrl(name, dexNumber))
    setFailed(false)
  }, [name, dexNumber])

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

function SpriteLightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleDownload = useCallback(() => {
    const fileName = `${name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.png`
    window.electronAPI.saveImage(src, fileName)
  }, [src, name])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative max-w-[80vh] max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleDownload}
          className="absolute -top-2 -right-2 z-10 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg p-2 transition-colors"
          title="Save image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
          </svg>
        </button>
        <img
          src={src}
          alt={name}
          className="max-w-[80vh] max-h-[80vh] object-contain drop-shadow-2xl"
        />
      </div>
    </div>,
    document.body
  )
}

interface Props {
  pokemonName: string
  selectedGame: string
  onSelect: (name: string) => void
  filteredNames?: string[]
  onSelfCompare?: () => void
}

export default function PokemonDetail({ pokemonName, selectedGame, onSelect, filteredNames, onSelfCompare }: Props) {
  const [pokemon, setPokemon] = useState<PokemonData | null>(null)
  const [showLightbox, setShowLightbox] = useState(false)

  useEffect(() => {
    if (selectedGame) setPokemon(getPokemonData(pokemonName, selectedGame))
    setShowLightbox(false)
  }, [pokemonName, selectedGame])

  const genData = useMemo((): GenGameData[] => {
    const group = GEN_GROUPS.find(g => g.games.includes(selectedGame))
    if (!group) return []
    const available = getGamesForPokemon(pokemonName)
    return group.games
      .filter(g => available.includes(g))
      .map(g => {
        const p = getPokemonData(pokemonName, g)
        return p ? { game: g, abbrev: GAME_ABBREV[g] ?? g, color: GAME_COLOR[g] ?? group.color, pokemon: p } : null
      })
      .filter(Boolean) as GenGameData[]
  }, [pokemonName, selectedGame])

  const isGen3Plus = useMemo(() => {
    const gen = parseInt(GAME_TO_GEN[selectedGame] ?? '0', 10)
    return Number.isFinite(gen) && gen >= 3
  }, [selectedGame])

  if (!pokemon) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
  }

  const isDualType = pokemon.type_1 !== pokemon.type_2

  return (
    <div className="flex h-full bg-gray-900 overflow-hidden">

      {/* ── Left column: identity + stats ── */}
      <div className="w-64 shrink-0 flex flex-col overflow-y-auto border-r border-gray-700 bg-gray-900 px-4 py-4 gap-4">

        {/* Sprite — click to open lightbox */}
        <div className="relative flex justify-center">
          <button
            onClick={() => setShowLightbox(true)}
            className="rounded-lg transition-opacity hover:opacity-80 focus:outline-none cursor-zoom-in"
            title="View full artwork"
          >
            <SpriteImage name={pokemon.species} dexNumber={pokemon.national_dex_number} />
          </button>
          {showLightbox && (
            <SpriteLightbox
              src={getArtworkUrl(pokemon.species, pokemon.national_dex_number)}
              name={displayName(pokemon.species)}
              onClose={() => setShowLightbox(false)}
            />
          )}
          <button
            onClick={() => {
              const name = displayName(pokemon.species)
                .replace(/ \(.*\)$/, '')                          // strip parenthetical forms
                .replace(/^(Mega|Primal|Alolan|Galarian|Hisuian|Paldean)\s+/, '')  // strip form prefixes
                .replace(/\s+[XY]$/, '')                          // strip Mega X/Y suffixes
              const url = `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(name)}_(Pok%C3%A9mon)`
              ;(window as any).electronAPI?.openExternal?.(url)
            }}
            className="absolute top-0 right-0 text-gray-600 hover:text-gray-300 transition-colors focus:outline-none"
            title="Open on Bulbapedia"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Evolution Family */}
        {pokemon.evolution_family.length > 1 && (
          <div className="flex flex-wrap gap-1 justify-center">
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
                    evo.species === pokemonName
                      ? 'bg-gray-600 text-white font-bold cursor-default'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {displayName(evo.species)}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Identity */}
        <div>
          <p className="text-xs font-mono text-gray-600 mb-0.5">
            #{String(pokemon.national_dex_number).padStart(3, '0')}
          </p>
          <h1 className="text-xl font-bold text-white leading-tight">{displayName(pokemon.species)}</h1>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <TypeBadge type={pokemon.type_1} game={selectedGame} />
            {isDualType && <TypeBadge type={pokemon.type_2} game={selectedGame} />}
          </div>
          {onSelfCompare && (
            <button
              onClick={() => onSelfCompare()}
              className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="Compare this Pokemon across generations"
            >
              Compare Generations
            </button>
          )}
        </div>

        {/* Type effectiveness panel */}
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Effectiveness</p>
          <TypeEffectivenessPanel
            type1={pokemon.type_1}
            type2={pokemon.type_2}
            game={selectedGame}
            abilities={[...new Set(pokemon.abilities)]}
          />
        </div>

        {/* Meta */}
        <div className="text-sm space-y-1 border-t border-gray-800 pt-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Growth Rate</span>
            <GrowthRatePopover growthRate={pokemon.growth_rate} />
          </div>
          {pokemon.abilities.length > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-600 shrink-0">
                {new Set(pokemon.abilities).size === 1 ? 'Ability' : 'Abilities'}
              </span>
              <span className="text-right">
                <span className="text-gray-300 flex flex-wrap gap-x-1 justify-end">
                  {[...new Set(pokemon.abilities)].map((ability, i, arr) => (
                    <span key={ability}>
                      <WikiPopover name={ability} type="ability">
                        {ability}
                      </WikiPopover>
                      {i < arr.length - 1 && <span className="text-gray-600">,</span>}
                    </span>
                  ))}
                </span>
                {pokemon.hidden_ability && (
                  <span className="text-gray-500 block mt-0.5">
                    <WikiPopover name={pokemon.hidden_ability} type="ability">
                      {pokemon.hidden_ability}
                    </WikiPopover>
                    {' '}(hidden)
                  </span>
                )}
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
          {pokemon.base_friendship != null && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-600 shrink-0">Base Friendship</span>
              <span className="text-gray-300 text-right">{pokemon.base_friendship}</span>
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
          <BaseStats stats={pokemon.base_stats} game={selectedGame} pokemonName={pokemonName} filteredNames={filteredNames} />
        </div>

        {/* Weight & weight-based move power */}
        {pokemon.weight != null && (
          <div className="border-t border-gray-800 pt-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Weight</p>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Weight</span>
                <span className="text-gray-300">{pokemon.weight} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Grass Knot / Low Kick</span>
                <span className="text-gray-300">
                  {pokemon.weight < 10 ? 20 : pokemon.weight < 25 ? 40 : pokemon.weight < 50 ? 60 : pokemon.weight < 100 ? 80 : pokemon.weight < 200 ? 100 : 120} BP
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Gender */}
        {pokemon.gender_ratio != null && (
          <div className="border-t border-gray-800 pt-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Gender</p>
            <div className="text-sm">
              <span className="text-gray-300">
                {pokemon.gender_ratio === 255
                  ? 'Genderless'
                  : pokemon.gender_ratio === 0
                    ? '100% \u2642'
                    : pokemon.gender_ratio === 254
                      ? '100% \u2640'
                      : `${((256 - pokemon.gender_ratio) / 256 * 100).toFixed(1)}% \u2642 / ${(pokemon.gender_ratio / 256 * 100).toFixed(1)}% \u2640`}
              </span>
            </div>
          </div>
        )}
        {isGen3Plus && (
          <div className="border-t border-gray-800 pt-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">EV Yield</p>
            <div className="text-sm">{renderEvYield(pokemon.ev_yield)}</div>
          </div>
        )}
      </div>

      {/* ── Right column: full movepool ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
        <Movepool pokemon={pokemon} game={selectedGame} genData={genData} />
      </div>

    </div>
  )
}
