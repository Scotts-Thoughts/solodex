import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { getAllPokemonForGame, getPokemonData, displayName } from '../data'

interface Props {
  species: string
  game: string
  /**
   * Custom-art mode: every Pokemon (the base one and each pick) must be given
   * a PNG that replaces the standard artwork in the exported graphics.
   */
  customArt?: boolean
  /** Called with the picked species (may be empty) — the caller runs the export. */
  onConfirm: (compareWith: string[], customArtwork?: Record<string, string>) => void
  onClose: () => void
}

// Species picker shown before the "Export all graphics with comparisons" and
// "with custom art" bulk exports. The user can queue any number of species
// available in the current game; the export then adds an "X vs Y" comparison
// graphic (plus compared movesets) for each. In custom-art mode the user also
// assigns a PNG per Pokemon, and only the picks listed here are compared (no
// automatic evolution-family comparisons, so standard artwork never appears) —
// but the evolution family is pre-added so each member prompts for its own
// art; remove the ones you don't want compared.
export default function BulkCompareExportDialog({ species, game, customArt, onConfirm, onClose }: Props) {
  const [query, setQuery] = useState('')
  // Custom-art mode starts with the evolution-family members (that exist in
  // this game) already picked, so each one asks for custom art up front
  const [selected, setSelected] = useState<string[]>(() => {
    if (!customArt) return []
    const base = getPokemonData(species, game)
    const seen = new Set<string>()
    const family: string[] = []
    for (const entry of base?.evolution_family ?? []) {
      const name = entry.species
      if (!name || name === species || name === base?.species || seen.has(name)) continue
      seen.add(name)
      if (!getPokemonData(name, game)) continue
      family.push(name)
    }
    return family
  })
  const [artMap, setArtMap] = useState<Record<string, string>>({})
  const [artNames, setArtNames] = useState<Record<string, string>>({})
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingArtSpeciesRef = useRef<string | null>(null)

  // Only species that exist in the current game can be compared against
  const candidates = useMemo(
    () => getAllPokemonForGame(game).filter(p => p.species !== species),
    [game, species]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = candidates.filter(p => !selected.includes(p.species))
    if (!q) return pool
    return pool.filter(
      p =>
        p.species.toLowerCase().includes(q) ||
        displayName(p.species).toLowerCase().includes(q) ||
        p.national_dex_number.toString() === q
    )
  }, [query, candidates, selected])

  useEffect(() => { setHighlightIdx(0) }, [query])

  useEffect(() => { inputRef.current?.focus() }, [])

  const addSpecies = useCallback((name: string) => {
    setSelected(prev => (prev.includes(name) ? prev : [...prev, name]))
    setQuery('')
    inputRef.current?.focus()
  }, [])

  const removeSpecies = useCallback((name: string) => {
    setSelected(prev => prev.filter(s => s !== name))
    setArtMap(prev => { const { [name]: _, ...rest } = prev; return rest })
    setArtNames(prev => { const { [name]: _, ...rest } = prev; return rest })
  }, [])

  const pickArt = useCallback((name: string) => {
    pendingArtSpeciesRef.current = name
    fileInputRef.current?.click()
  }, [])

  const handleArtFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const name = pendingArtSpeciesRef.current
    e.target.value = '' // allow re-picking the same file later
    if (!file || !name) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setArtMap(prev => ({ ...prev, [name]: reader.result as string }))
        setArtNames(prev => ({ ...prev, [name]: file.name }))
      }
    }
    reader.readAsDataURL(file)
  }, [])

  // In custom-art mode every involved Pokemon needs an image before exporting
  const missingArt = useMemo(
    () => (customArt ? [species, ...selected].filter(n => !artMap[n]) : []),
    [customArt, species, selected, artMap]
  )
  const canConfirm = missingArt.length === 0

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return
    if (customArt) {
      const artwork: Record<string, string> = {}
      for (const name of [species, ...selected]) {
        if (artMap[name]) artwork[name] = artMap[name]
      }
      onConfirm(selected, artwork)
    } else {
      onConfirm(selected)
    }
  }, [onConfirm, selected, customArt, species, artMap, canConfirm])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (e.metaKey || e.ctrlKey) {
          handleConfirm()
        } else if (filtered.length > 0) {
          addSpecies(filtered[Math.min(highlightIdx, filtered.length - 1)].species)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [filtered, highlightIdx, onClose, handleConfirm, addSpecies])

  // Scroll highlighted item into view
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${highlightIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  const renderArtRow = (name: string, removable: boolean) => (
    <div key={name} className="flex items-center gap-2">
      {artMap[name] ? (
        <img src={artMap[name]} alt="" className="w-8 h-8 object-contain rounded bg-gray-800 shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded border border-dashed border-gray-600 shrink-0" />
      )}
      <span className="text-sm text-gray-200 font-medium shrink-0">{displayName(name)}</span>
      {!removable && <span className="text-[11px] text-gray-500 shrink-0">(current)</span>}
      <span className="text-[11px] text-gray-500 truncate flex-1">{artNames[name] ?? ''}</span>
      <button
        onClick={() => pickArt(name)}
        className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 transition-colors ${
          artMap[name]
            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            : 'bg-emerald-700 hover:bg-emerald-600 text-white'
        }`}
      >
        {artMap[name] ? 'Change image' : 'Choose image'}
      </button>
      {removable && (
        <button
          onClick={() => removeSpecies(name)}
          className="text-gray-400 hover:text-white rounded px-1 leading-none shrink-0"
          title={`Remove ${displayName(name)}`}
        >
          ×
        </button>
      )}
    </div>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[560px] rounded-xl shadow-2xl overflow-hidden border border-gray-700 flex flex-col"
        style={{ backgroundColor: '#1a1f29', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-700">
          <h2 className="text-base font-bold text-white">
            {customArt ? 'Export all graphics with custom art' : 'Export all graphics with comparisons'}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            {customArt ? (
              <>
                Exports every graphic for <span className="font-semibold text-gray-200">{displayName(species)}</span> ({game}) using
                your PNGs instead of the standard artwork, plus a comparison against each Pokémon listed below.
                Evolution-family members are pre-added — give every Pokémon an image, or remove the ones you don't want compared.
              </>
            ) : (
              <>
                Exports every graphic for <span className="font-semibold text-gray-200">{displayName(species)}</span> ({game}),
                plus a comparison graphic against each Pokémon you add below.
                Evolution-family comparisons are always included.
              </>
            )}
          </p>
        </div>

        {/* Custom-art assignment rows / selected species chips */}
        {customArt ? (
          <div className="px-5 py-2.5 border-b border-gray-700 flex flex-col gap-1.5 overflow-y-auto shrink-0" style={{ maxHeight: 190 }}>
            {renderArtRow(species, false)}
            {selected.map(name => renderArtRow(name, true))}
          </div>
        ) : (
          selected.length > 0 && (
            <div className="px-5 py-2.5 border-b border-gray-700 flex flex-wrap gap-1.5">
              {selected.map(name => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded bg-gray-700 pl-2 pr-1 py-0.5 text-sm text-gray-200"
                >
                  {displayName(name)}
                  <button
                    onClick={() => removeSpecies(name)}
                    className="text-gray-400 hover:text-white rounded px-1 leading-none"
                    title={`Remove ${displayName(name)}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )
        )}

        {/* Search input */}
        <div className="flex items-center px-5 border-b border-gray-700 shrink-0">
          <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder={`Compare ${displayName(species)} to…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 px-4 py-3 text-base bg-transparent text-white placeholder-gray-500 outline-none"
          />
          <span className="text-xs text-gray-600 shrink-0">{filtered.length}</span>
        </div>

        {/* Results list */}
        <div ref={listRef} className="overflow-y-auto flex-1" style={{ maxHeight: '260px' }}>
          {filtered.map((p, i) => (
            <button
              key={p.species}
              data-idx={i}
              onClick={() => addSpecies(p.species)}
              className={`w-full text-left px-5 py-2 flex items-center gap-3 transition-colors ${
                i === highlightIdx ? 'text-white' : 'text-gray-300 hover:text-white'
              }`}
              style={i === highlightIdx ? { backgroundColor: '#059669' } : undefined}
            >
              <span
                className="text-xs font-mono w-8 text-right shrink-0"
                style={{ color: i === highlightIdx ? 'rgba(255,255,255,0.65)' : '#5c6470' }}
              >
                {String(p.national_dex_number).padStart(4, '0')}
              </span>
              <span className="font-medium text-sm">{displayName(p.species)}</span>
            </button>
          ))}
          {query && filtered.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">No results</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-gray-500 flex-1">
            {customArt && !canConfirm
              ? 'Choose an image for every Pokémon to export'
              : 'Enter adds the highlighted Pokémon · Ctrl/⌘+Enter exports'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selected.length > 0
              ? `Export (${selected.length} comparison${selected.length === 1 ? '' : 's'})`
              : 'Export'}
          </button>
        </div>

        {/* Hidden file input for custom-art picks */}
        {customArt && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png"
            className="hidden"
            onChange={handleArtFile}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
