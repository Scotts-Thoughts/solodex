import { useState, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getTypeMatchups } from '../data'
import { POPOVER_Z } from '../constants/ui'
import { usePopoverDismiss } from '../hooks/usePopoverDismiss'

export const TYPE_COLORS: Record<string, string> = {
  Normal:   '#9fa19f',
  Fighting: '#ff8000',
  Grass:    '#3fa129',
  Fire:     '#e62829',
  Water:    '#2980ef',
  Electric: '#fac000',
  Ground:   '#915121',
  Rock:     '#afa981',
  Psychic:  '#ef4179',
  Poison:   '#9141cb',
  Flying:   '#81b9ef',
  Bug:      '#91a119',
  Ice:      '#3dcef3',
  Ghost:    '#704170',
  Dragon:   '#5060e1',
  Steel:    '#60a1b8',
  Dark:     '#624d4e',
  Fairy:    '#ef70ef',
  'Curse Type': '#68A090',
  Mystery:      '#68A090',
  Unknown:      '#68A090',
}

const CURSE_TYPES = new Set(['Curse Type', 'Mystery', 'Unknown'])

function displayType(type: string): string {
  return CURSE_TYPES.has(type) ? '???' : type
}

// Non-interactive chip used inside the popover to avoid recursion
function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? '#6B7280'
  return (
    <span
      className="inline-block rounded text-xs font-semibold text-center py-px"
      style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)', width: '68px' }}
    >
      {displayType(type)}
    </span>
  )
}

function Row({ label, types }: { label: string; types: string[] }) {
  if (types.length === 0) return null
  return (
    <div className="mb-2">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {types.map(t => <TypeChip key={t} type={t} />)}
      </div>
    </div>
  )
}

interface PopoverProps {
  type: string
  anchorRect: DOMRect
  game?: string
  onClose: () => void
}

function TypePopover({ type, anchorRect, game, onClose }: PopoverProps) {
  const matchups = getTypeMatchups(type, game)
  const ref = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: anchorRect.bottom + 6, left: anchorRect.left })
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    const el = contentRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        backgroundColor: 'transparent',
        filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
      })
      const link = document.createElement('a')
      link.download = `${type}_type_effectiveness.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [exporting, type])

  usePopoverDismiss('[data-type-popover]', onClose)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let { top, left } = pos

    // If overflowing right, shift left
    if (left + rect.width > vw - 8) {
      left = vw - rect.width - 8
    }
    // If overflowing left, clamp to 8
    if (left < 8) left = 8

    // If overflowing bottom, show above the anchor instead
    if (top + rect.height > vh - 8) {
      top = anchorRect.top - rect.height - 6
    }
    // If still overflowing top, clamp to 8
    if (top < 8) top = 8

    if (top !== pos.top || left !== pos.left) {
      setPos({ top, left })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div
      ref={ref}
      data-type-popover
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: POPOVER_Z, minWidth: '220px', maxWidth: '260px' }}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl"
    >
      <div ref={contentRef} className="p-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white uppercase tracking-wide"
             style={{ color: TYPE_COLORS[type] ?? '#fff' }}>
            {type}
          </p>
          <button
            data-export-ignore
            onClick={handleExport}
            disabled={exporting}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded p-1 transition-colors disabled:opacity-50"
            title="Export as PNG"
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
        </div>

        {/* Offensive */}
        <Row label="Super effective vs"   types={matchups.superEffVs} />
        <Row label="Not very effective vs" types={matchups.notEffVs} />
        <Row label="No effect vs"          types={matchups.noEffVs} />

        {/* Divider */}
        {(matchups.superEffVs.length > 0 || matchups.notEffVs.length > 0 || matchups.noEffVs.length > 0) &&
         (matchups.weakTo.length > 0 || matchups.resists.length > 0 || matchups.immuneTo.length > 0) && (
          <div className="border-t border-gray-700 my-2" />
        )}

        {/* Defensive */}
        <Row label="Weak to"   types={matchups.weakTo} />
        <Row label="Resists"   types={matchups.resists} />
        <Row label="Immune to" types={matchups.immuneTo} />
      </div>
    </div>,
    document.body
  )
}

interface Props {
  type: string
  small?: boolean
  game?: string
}

export default function TypeBadge({ type, small, game }: Props) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (open) {
      setOpen(false)
    } else {
      setAnchorRect(e.currentTarget.getBoundingClientRect())
      setOpen(true)
    }
  }, [open])

  const color = TYPE_COLORS[type] ?? '#6B7280'

  return (
    <>
      <button
        onClick={handleClick}
        className={`inline-block rounded font-semibold text-center cursor-pointer transition-opacity hover:opacity-80 ${small ? 'py-px text-xs' : 'py-1 text-xs tracking-wide'}`}
        style={{
          background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`,
          color: '#fff',
          textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          width: small ? '68px' : '80px',
          border: 'none'
        }}
      >
        {displayType(type)}
      </button>
      {open && anchorRect && (
        <TypePopover
          type={type}
          anchorRect={anchorRect}
          game={game}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
