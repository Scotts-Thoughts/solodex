import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getAllPokemon, displayName } from '../data'

interface Props {
  onSelect: (name: string) => void
  onClose: () => void
  comparingName?: string | null
}

export default function SpotlightSearch({ onSelect, onClose, comparingName }: Props) {
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allPokemon = useMemo(() => getAllPokemon(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allPokemon
    return allPokemon.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        displayName(p.name).toLowerCase().includes(q) ||
        p.national_dex_number.toString() === q
    )
  }, [query, allPokemon])

  // Auto-select on exact name match
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) return
    const exact = filtered.find(p => p.name.toLowerCase() === q)
    if (exact) {
      onSelect(exact.name)
      onClose()
    }
  }, [query, filtered])

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0)
  }, [filtered])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keyboard navigation
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
        if (filtered.length > 0) {
          onSelect(filtered[highlightIdx].name)
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [filtered, highlightIdx, onClose, onSelect])

  // Scroll highlighted item into view
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${highlightIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(3px)',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[540px] rounded-xl shadow-2xl overflow-hidden border border-gray-700" style={{ backgroundColor: '#1a1f29' }}>

        {/* Search input */}
        <div className="flex items-center px-5 border-b border-gray-700">
          <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder={comparingName ? `Compare ${displayName(comparingName)} to…` : 'Search Pokémon…'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 px-4 py-4 text-base bg-transparent text-white placeholder-gray-500 outline-none"
          />
          <span className="text-xs text-gray-600 shrink-0">{filtered.length}</span>
        </div>

        {/* Results list */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '320px' }}>
          {filtered.map((p, i) => (
            <button
              key={p.name}
              data-idx={i}
              onClick={() => { onSelect(p.name); onClose() }}
              className={`w-full text-left px-5 py-2.5 flex items-center gap-3 transition-colors ${
                i === highlightIdx
                  ? 'text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
              style={i === highlightIdx ? { backgroundColor: '#1d9bf0' } : undefined}
            >
              <span className="text-xs font-mono w-8 text-right shrink-0" style={{ color: i === highlightIdx ? 'rgba(255,255,255,0.65)' : '#5c6470' }}>
                {String(p.national_dex_number).padStart(4, '0')}
              </span>
              <span className="font-medium text-sm">{displayName(p.name)}</span>
            </button>
          ))}
          {query && filtered.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">No results</p>
          )}
        </div>

      </div>
    </div>,
    document.body
  )
}
