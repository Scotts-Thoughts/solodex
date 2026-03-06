import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

type WikiType = 'move' | 'ability'

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

  // Position below anchor, flip left if near right edge
  const top  = anchorRect.bottom + 6
  const left = Math.min(anchorRect.left, window.innerWidth - 540)

  return createPortal(
    <div
      data-wiki-popover
      style={{ position: 'fixed', top, left, zIndex: 9999, width: '520px' }}
      className="bg-gray-800 border border-gray-600 rounded-lg p-6 shadow-2xl"
    >
      <p className="text-base font-bold text-white mb-4">{name}</p>
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
    setAnchorRect(prev => prev ? null : e.currentTarget.getBoundingClientRect())
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
