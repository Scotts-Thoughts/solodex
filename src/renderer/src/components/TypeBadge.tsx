import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getTypeMatchups } from '../data'

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
      style={{ backgroundColor: color, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)', width: '68px' }}
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

  // Close on any outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest('[data-type-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const top  = anchorRect.bottom + 6
  const left = anchorRect.left

  return createPortal(
    <div
      data-type-popover
      style={{ position: 'fixed', top, left, zIndex: 9999, minWidth: '220px', maxWidth: '260px' }}
      className="bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-2xl"
    >
      <p className="text-sm font-bold text-white mb-3 uppercase tracking-wide"
         style={{ color: TYPE_COLORS[type] ?? '#fff' }}>
        {type}
      </p>

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
          backgroundColor: color,
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
