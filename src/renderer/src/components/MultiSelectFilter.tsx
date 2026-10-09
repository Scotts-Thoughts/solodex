import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { POPOVER_Z } from '../constants/ui'

export interface FilterOption {
  value: string
  label: string
  /** Shorter text for the button summary (defaults to label) */
  short?: string
}

/**
 * Compact dropdown that toggles any number of options on and off. Selecting
 * nothing means "no filter". Used by the Pokédex list filters, where options
 * inside one dropdown are OR'd together and separate dropdowns are AND'd.
 */
export default function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  footer,
}: {
  label: string
  options: FilterOption[]
  value: string[]
  onChange: (next: string[]) => void
  /** Extra controls rendered under the option list (e.g. a match mode toggle) */
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // The list panel clips overflow, so the popover is fixed-positioned under the button
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const r = buttonRef.current.getBoundingClientRect()
    setPos({ left: r.left, top: r.bottom + 2, minWidth: r.width })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const toggle = (v: string) => {
    // Keep the selection in option order so the button summary reads naturally
    const next = value.includes(v) ? value.filter(x => x !== v) : [...value, v]
    onChange(options.map(o => o.value).filter(x => next.includes(x)))
  }

  const selectedOpts = options.filter(o => value.includes(o.value))
  const summary = selectedOpts.length === 0
    ? label
    : selectedOpts.length <= 2
      ? selectedOpts.map(o => o.short ?? o.label).join(', ')
      : `${label} (${selectedOpts.length})`

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title={selectedOpts.length ? selectedOpts.map(o => o.label).join(', ') : undefined}
        className={`min-w-0 flex-1 flex items-center gap-0.5 text-left text-[11px] bg-gray-800 border rounded px-1 py-0.5 focus:outline-none ${
          open ? 'border-gray-500' : 'border-gray-700'
        } ${selectedOpts.length ? 'text-gray-300' : 'text-gray-500'}`}
      >
        <span className="flex-1 truncate">{summary}</span>
        <svg className="w-2.5 h-2.5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && pos && (
        <div
          ref={popRef}
          style={{ position: 'fixed', left: pos.left, top: pos.top, minWidth: pos.minWidth, zIndex: POPOVER_Z }}
          className="bg-gray-800 border border-gray-600 rounded shadow-lg py-1 text-[11px] flex flex-col"
        >
          <div className="max-h-72 overflow-y-auto">
          {options.map(o => (
            <label
              key={o.value}
              className="flex items-center gap-1.5 px-2 py-0.5 text-gray-300 hover:bg-gray-700 cursor-pointer select-none whitespace-nowrap"
            >
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="accent-gray-500 w-3 h-3"
              />
              {o.label}
            </label>
          ))}
          </div>
          {footer}
          <div className="border-t border-gray-700 mt-1 pt-1 px-2 flex gap-2">
            <button
              type="button"
              onClick={() => onChange(options.map(o => o.value))}
              className="text-gray-400 hover:text-gray-200"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={value.length === 0}
              className="text-gray-400 hover:text-gray-200 disabled:text-gray-600"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </>
  )
}
