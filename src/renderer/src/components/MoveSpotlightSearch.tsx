import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getAllMoveNames } from '../data'

interface Props {
  onSelect: (moveName: string) => void
  onClose: () => void
}

export default function MoveSpotlightSearch({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allMoves = useMemo(() => getAllMoveNames(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allMoves
    return allMoves.filter(name => name.toLowerCase().includes(q))
  }, [query, allMoves])

  useEffect(() => { setHighlightIdx(0) }, [filtered])
  useEffect(() => { inputRef.current?.focus() }, [])

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
          onSelect(filtered[highlightIdx])
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [filtered, highlightIdx, onClose, onSelect])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${highlightIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[540px] rounded-xl shadow-2xl overflow-hidden border border-gray-700" style={{ backgroundColor: '#1a1f29' }}>
        <div className="flex items-center px-5 border-b border-gray-700">
          <svg className="w-5 h-5 text-yellow-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search moves..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 px-4 py-4 text-base bg-transparent text-white placeholder-gray-500 outline-none"
          />
          <span className="text-xs text-gray-600 shrink-0">{filtered.length}</span>
        </div>
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: '320px' }}>
          {filtered.map((name, i) => (
            <button
              key={name}
              data-idx={i}
              onClick={() => onSelect(name)}
              className={`w-full text-left px-5 py-2.5 flex items-center gap-3 transition-colors ${
                i === highlightIdx ? 'text-white' : 'text-gray-300 hover:text-white'
              }`}
              style={i === highlightIdx ? { backgroundColor: '#d97706' } : undefined}
            >
              <span className="font-medium text-sm">{name}</span>
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
