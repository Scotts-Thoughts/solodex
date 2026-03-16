import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { POPOVER_Z } from '../constants/ui'
import { usePopoverDismiss } from '../hooks/usePopoverDismiss'

type WikiType = 'move' | 'ability' | 'tm'

interface PopoverProps {
  name: string
  type: WikiType
  anchorRect: DOMRect
  onClose: () => void
}

function renderExtract(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  type Sub = { h3: string; paras: string[] }
  type Section = { h2: string | null; directParas: string[]; subs: Sub[] }

  const sections: Section[] = []
  let currentSection: Section = { h2: null, directParas: [], subs: [] }
  let currentSub: Sub | null = null

  for (const line of lines) {
    // Match any heading level (==, ===, ====, …) using backreference so open/close must match
    const hm = line.match(/^(={2,})\s*(.+?)\s*\1$/)
    const isH2 = hm && hm[1].length === 2
    const isH3 = hm && hm[1].length >= 3

    if (isH2) {
      if (currentSub) { currentSection.subs.push(currentSub); currentSub = null }
      sections.push(currentSection)
      currentSection = { h2: hm![2], directParas: [], subs: [] }
    } else if (isH3) {
      if (currentSub) currentSection.subs.push(currentSub)
      currentSub = { h3: hm![2], paras: [] }
    } else {
      if (currentSub) currentSub.paras.push(line)
      else currentSection.directParas.push(line)
    }
  }
  if (currentSub) currentSection.subs.push(currentSub)
  sections.push(currentSection)

  // Strip h3 sections with no text, then h2 sections with no content
  const filtered = sections
    .map(sec => ({ ...sec, subs: sec.subs.filter(sub => sub.paras.length > 0) }))
    .filter(sec => sec.h2 === null || sec.directParas.length > 0 || sec.subs.length > 0)

  return (
    <div className="flex flex-col gap-3">
      {filtered.map((sec, i) => (
        <div key={i}>
          {sec.h2 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{sec.h2}</span>
              <div className="flex-1 h-px bg-gray-700" />
            </div>
          )}
          {sec.directParas.map((p, j) => (
            <p key={j} className="text-sm text-gray-300 leading-relaxed mb-1">{p}</p>
          ))}
          {sec.subs.map((sub, j) => (
            <div key={j} className={j > 0 || sec.directParas.length > 0 ? 'mt-2' : ''}>
              <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-1">{sub.h3}</p>
              {sub.paras.map((p, k) => (
                <p key={k} className="text-sm text-gray-300 leading-relaxed">{p}</p>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
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

  usePopoverDismiss('[data-wiki-popover]', onClose)

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
      style={{ position: 'fixed', top, left, zIndex: POPOVER_Z, width: '520px' }}
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
          renderExtract(text)
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
