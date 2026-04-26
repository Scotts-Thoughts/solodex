import { useCallback, useMemo, useRef, useState } from 'react'
import type { PokemonData, MoveData } from '../types/pokemon'
import { getMoveData, getAllPokemonForGame, getPokemonDefenseMatchups, getTypesForGame, getOffensiveMultiplier } from '../data'
import TypeBadge from './TypeBadge'
import { getHomeSpriteUrl } from '../utils/sprites'
import { getExportBgColor } from '../utils/exportSettings'
import { buildExportFilename } from '../utils/exportFilename'

interface CoverageBucket {
  label: string
  shortLabel: string
  pokemon: PokemonData[]
  color: string
  showSprites: boolean
}

function computeCoverage(testSet: string[], game: string): CoverageBucket[] | null {
  // Get attacking types from non-Status moves
  const attackTypes: string[] = []
  for (const moveName of testSet) {
    const move = getMoveData(moveName, game)
    if (move && move.category !== 'Status') {
      attackTypes.push(move.type)
    }
  }

  if (attackTypes.length === 0) return null

  const uniqueTypes = [...new Set(attackTypes)]
  const allPokemon = getAllPokemonForGame(game)

  const buckets: Record<string, PokemonData[]> = {
    '0': [],
    '0.25': [],
    '0.5': [],
    '1': [],
    '2': [],
    '4': [],
  }

  for (const poke of allPokemon) {
    const defMatchups = getPokemonDefenseMatchups(poke.type_1, poke.type_2, game)
    let bestMult = 0
    for (const atkType of uniqueTypes) {
      const mult = defMatchups[atkType] ?? 1
      if (mult > bestMult) bestMult = mult
    }

    let key: string
    if (bestMult === 0) key = '0'
    else if (bestMult <= 0.25) key = '0.25'
    else if (bestMult <= 0.5) key = '0.5'
    else if (bestMult <= 1) key = '1'
    else if (bestMult <= 2) key = '2'
    else key = '4'

    buckets[key].push(poke)
  }

  return [
    { label: 'No effect', shortLabel: '0x', pokemon: buckets['0'], color: '#4b5563', showSprites: true },
    { label: '1/4x', shortLabel: '\u00bc\u00d7', pokemon: buckets['0.25'], color: '#991b1b', showSprites: true },
    { label: '1/2x', shortLabel: '\u00bd\u00d7', pokemon: buckets['0.5'], color: '#b45309', showSprites: true },
    { label: 'Neutral', shortLabel: '1x', pokemon: buckets['1'], color: '#6b7280', showSprites: false },
    { label: '2x', shortLabel: '2x', pokemon: buckets['2'], color: '#15803d', showSprites: false },
    { label: '4x', shortLabel: '4x', pokemon: buckets['4'], color: '#047857', showSprites: false },
  ]
}

interface WeakCombo {
  type1: string
  type2: string | null  // null = mono-type
  best: number
}

/** Find all type combos (single + dual) present in the game's Pokedex
 *  where the move set's best coverage is worse than neutral (< 1). */
function computeWeakCombos(testSet: string[], game: string): WeakCombo[] | null {
  const attackTypes: string[] = []
  for (const moveName of testSet) {
    const move = getMoveData(moveName, game)
    if (move && move.category !== 'Status') {
      attackTypes.push(move.type)
    }
  }
  if (attackTypes.length === 0) return null

  const uniqueAtk = [...new Set(attackTypes)]

  // Best multiplier against a single defending type
  function bestVsSingle(defType: string): number {
    let best = 0
    for (const atkType of uniqueAtk) {
      const mult = getOffensiveMultiplier(atkType, defType, game)
      if (mult > best) best = mult
    }
    return best
  }

  // Single-type weaknesses from the type chart (not Pokedex-dependent)
  const allTypes = getTypesForGame(game)
  const singleWeakSet = new Set<string>()
  const weak: WeakCombo[] = []
  for (const defType of allTypes) {
    const best = bestVsSingle(defType)
    if (best < 1) {
      singleWeakSet.add(defType)
      weak.push({ type1: defType, type2: null, best })
    }
  }

  // Dual-type combos from the Pokedex — only if both individual types
  // have >= 1x coverage, meaning the combo itself creates the weakness
  const allPokemon = getAllPokemonForGame(game)
  const dualSeen = new Set<string>()
  for (const poke of allPokemon) {
    if (poke.type_1 === poke.type_2) continue
    const types = [poke.type_1, poke.type_2].sort()
    const key = types.join('/')
    if (dualSeen.has(key)) continue
    dualSeen.add(key)

    // Skip if either single type is already weak — the single entry covers it
    if (singleWeakSet.has(types[0]) || singleWeakSet.has(types[1])) continue

    const defMatchups = getPokemonDefenseMatchups(types[0], types[1], game)
    let best = 0
    for (const atkType of uniqueAtk) {
      const mult = defMatchups[atkType] ?? 1
      if (mult > best) best = mult
    }
    if (best < 1) {
      weak.push({ type1: types[0], type2: types[1], best })
    }
  }

  // Sort: immunities first, then 1/4x, then 1/2x
  weak.sort((a, b) => a.best - b.best)
  return weak
}

interface Props {
  testSet: string[]
  game: string
  onRemove: (moveName: string) => void
  onClear: () => void
}

export default function TypeCoveragePanel({ testSet, game, onRemove, onClear }: Props) {
  const coverage = useMemo(() => computeCoverage(testSet, game), [testSet, game])
  const weakCombos = useMemo(() => computeWeakCombos(testSet, game), [testSet, game])

  const moveInfos = useMemo(() => {
    return testSet.map(name => ({ name, data: getMoveData(name, game) }))
  }, [testSet, game])

  const allStatus = moveInfos.every(m => m.data?.category === 'Status')

  const panelRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    const el = panelRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      const { toCanvas } = await import('html-to-image')
      const bgColor = getExportBgColor()

      // Expand the panel so the full sprite list is captured, and drop the
      // top border + rounded corners so they don't appear in the export.
      const prevMaxHeight = el.style.maxHeight
      const prevOverflow = el.style.overflow
      const prevBorderTop = el.style.borderTop
      const prevBorderRadius = el.style.borderRadius
      el.style.maxHeight = 'none'
      el.style.overflow = 'visible'
      el.style.borderTop = 'none'
      el.style.borderRadius = '0'

      let srcCanvas: HTMLCanvasElement
      try {
        srcCanvas = await toCanvas(el, {
          pixelRatio: 2,
          backgroundColor: bgColor,
          filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
        })
      } finally {
        el.style.maxHeight = prevMaxHeight
        el.style.overflow = prevOverflow
        el.style.borderTop = prevBorderTop
        el.style.borderRadius = prevBorderRadius
      }

      const out = document.createElement('canvas')
      out.width = 1920
      out.height = 1080
      const ctx = out.getContext('2d')!
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, 1920, 1080)
      }
      const maxW = 1920 * 0.93
      const maxH = 1080 * 0.93
      const scale = Math.min(maxW / srcCanvas.width, maxH / srcCanvas.height)
      const drawW = srcCanvas.width * scale
      const drawH = srcCanvas.height * scale
      ctx.drawImage(srcCanvas, (1920 - drawW) / 2, (1080 - drawH) / 2, drawW, drawH)

      const link = document.createElement('a')
      link.download = buildExportFilename(game, 'type_coverage')
      link.href = out.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [exporting, game])

  return (
    <div ref={panelRef} className="bg-gray-800 border-t border-gray-600 rounded-t-lg px-3 py-2 max-h-[40vh] overflow-y-auto">
      {/* Move chips */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Coverage</span>
        {moveInfos.map(({ name, data }) => (
          <button
            key={name}
            onClick={() => onRemove(name)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
            title="Click to remove"
          >
            {data && <TypeBadge type={data.type} small game={game} />}
            <span className="text-white">{name}</span>
            {data?.category === 'Status' && <span className="text-gray-500 italic ml-0.5">status</span>}
            <span data-export-ignore className="text-gray-500 ml-1">&times;</span>
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto" data-export-ignore>
          <button
            onClick={handleExport}
            disabled={exporting || allStatus || !coverage}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded p-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export as PNG"
            aria-label="Export"
          >
            {exporting ? (
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
          <button
            onClick={onClear}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Coverage breakdown */}
      {allStatus ? (
        <p className="text-xs text-gray-500 italic">All moves are Status — no type coverage to show.</p>
      ) : coverage ? (
        <div>
          {/* Counts row */}
          <div className="flex gap-3 mb-2">
            {coverage.map(bucket => (
              <div key={bucket.label} className="text-center min-w-[56px]">
                <div className="text-xs text-gray-500">{bucket.label}</div>
                <div
                  className="text-lg font-bold tabular-nums"
                  style={{ color: bucket.pokemon.length > 0 ? bucket.color : '#374151' }}
                >
                  {bucket.pokemon.length}
                </div>
              </div>
            ))}
          </div>

          {/* Weak coverage type combos */}
          {weakCombos && weakCombos.length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-gray-500 mb-1">Weak coverage against</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {weakCombos.map(({ type1, type2, best }) => (
                  <span key={type2 ? `${type1}/${type2}` : type1} className="flex items-center gap-1">
                    <TypeBadge type={type1} small game={game} />
                    {type2 && <TypeBadge type={type2} small game={game} />}
                    <span className="text-xs text-gray-500">
                      {best === 0 ? '0x' : best <= 0.25 ? '\u00bcx' : '\u00bdx'}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sprite rows for bad matchups */}
          {coverage.filter(b => b.showSprites && b.pokemon.length > 0).map(bucket => (
            <div key={bucket.label} className="mb-1.5">
              <div className="text-xs text-gray-500 mb-0.5" style={{ color: bucket.color }}>
                {bucket.label} ({bucket.pokemon.length})
              </div>
              <div className="flex flex-wrap gap-0.5">
                {bucket.pokemon.map(poke => (
                  <img
                    key={poke.species}
                    src={getHomeSpriteUrl(poke.species, poke.national_dex_number)}
                    alt={poke.species}
                    title={`${poke.species} (${poke.type_1}${poke.type_1 !== poke.type_2 ? '/' + poke.type_2 : ''})`}
                    className="pokemon-icon-stroke w-11 h-11 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
