import { useState, useEffect, useMemo, useRef } from 'react'

export interface ComboOption {
  id: string
  label: string
  sublabel?: string
  color?: string
  badge?: string  // e.g. "★" for learnset moves
}

/**
 * Searchable single-select combobox with keyboard navigation. Shows up to 80
 * options, filtered by label/sublabel as the user types. Shared by DamageView
 * and StatsView.
 */
export default function Combobox({
  value,
  options,
  onSelect,
  placeholder,
  className = '',
}: {
  value: string
  options: ComboOption[]
  onSelect: (id: string) => void
  placeholder: string
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hilite, setHilite] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 80)
    return options
      .filter(o => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
      .slice(0, 80)
  }, [query, options])

  useEffect(() => { setHilite(0) }, [filtered])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHilite(h => Math.min(h + 1, filtered.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHilite(h => Math.max(h - 1, 0)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[hilite]) { onSelect(filtered[hilite].id); setOpen(false); setQuery('') }
      } else if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, filtered, hilite, onSelect])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hilite}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hilite])

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={open ? query : value}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHilite(0) }}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className="w-full bg-gray-700 text-white text-sm rounded px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-gray-500 placeholder-gray-500"
        autoComplete="off"
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-30 top-full mt-0.5 left-0 right-0 bg-gray-800 border border-gray-600 rounded shadow-xl max-h-52 overflow-y-auto"
        >
          {filtered.map((opt, i) => (
            <button
              key={opt.id}
              data-idx={i}
              onMouseDown={e => {
                e.preventDefault()
                onSelect(opt.id)
                setOpen(false)
                setQuery('')
              }}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-sm transition-colors ${i === hilite ? 'bg-gray-600' : 'hover:bg-gray-700'}`}
            >
              {opt.color && (
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: opt.color }}
                />
              )}
              <span className="text-white truncate flex-1">{opt.label}</span>
              {opt.badge && (
                <span className="text-yellow-400 text-[10px] flex-shrink-0">{opt.badge}</span>
              )}
              {opt.sublabel && (
                <span className="text-gray-400 text-xs flex-shrink-0 ml-auto">{opt.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
