import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

type WikiType = 'move' | 'ability' | 'tm'

interface PopoverProps {
  name: string
  type: WikiType
  anchorRect: DOMRect
  onClose: () => void
}

function Popover({ name, type, anchorRect, onClose }: PopoverProps) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    try {
      window.electronAPI.fetchWiki(name, type).then(result => {
        if (!cancelled) { setText(result); setLoading(false) }
      }).catch(() => {
        if (!cancelled) setLoading(false)
      })
    } catch {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [name, type])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-wiki-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const bulbaTitle = type === 'tm'
    ? name
    : name.replace(/ /g, '_') + (type === 'move' ? '_(move)' : '_(Ability)')
  const bulbaUrl = `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(bulbaTitle)}`

  // Position to the right of the anchor; flip left if near the right edge
  const POPOVER_WIDTH = 520
  const POPOVER_HEIGHT = 480
  const left = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
    ? anchorRect.right + 6
    : anchorRect.left - POPOVER_WIDTH - 6
  const top = Math.min(
    Math.max(6, anchorRect.top),
    window.innerHeight - POPOVER_HEIGHT - 6
  )

  return createPortal(
    <div
      data-wiki-popover
      style={{ position: 'fixed', top, left, zIndex: 9999, width: '520px' }}
      className="bg-gray-800 border border-gray-600 rounded-lg p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-base font-bold text-white">{name}</p>
        <button
          onClick={() => window.electronAPI.openExternal(bulbaUrl)}
          className="text-xs text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1 shrink-0 ml-4"
          title="Open on Bulbapedia"
        >
          Bulbapedia
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>
      <div className="overflow-y-auto max-h-96">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : text ? (
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{text}</p>
        ) : (
          <p className="text-sm text-gray-500">No description found.</p>
        )}
      </div>
    </div>,
    document.body
  )
}

interface Props {
  name: string
  type: WikiType
  children: React.ReactNode
  className?: string
}

export default function WikiPopover({ name, type, children, className }: Props) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchorRect(prev => prev ? null : rect)
  }, [])

  return (
    <>
      <button
        onClick={handleClick}
        className={`text-left hover:text-blue-400 transition-colors ${className ?? ''}`}
      >
        {children}
      </button>
      {anchorRect && (
        <Popover
          name={name}
          type={type}
          anchorRect={anchorRect}
          onClose={() => setAnchorRect(null)}
        />
      )}
    </>
  )
}
