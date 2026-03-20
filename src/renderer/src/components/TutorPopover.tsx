import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { GAME_TO_GEN } from '../data'
import { POPOVER_Z } from '../constants/ui'
import { usePopoverDismiss } from '../hooks/usePopoverDismiss'

interface VersionOption {
  game: string
  label: string
  slug: string
}

// Versions within each generation that have Serebii move tutor pages
const GEN_TUTOR_VERSIONS: Record<string, VersionOption[]> = {
  '2': [
    { game: 'Crystal', label: 'Crystal', slug: 'crystalversion' },
  ],
  '3': [
    { game: 'Ruby and Sapphire', label: 'Ruby & Sapphire', slug: 'rubysapphire' },
    { game: 'Emerald', label: 'Emerald', slug: 'emerald' },
    { game: 'FireRed and LeafGreen', label: 'FireRed & LeafGreen', slug: 'fireredleafgreen' },
  ],
  '4': [
    { game: 'Diamond and Pearl', label: 'Diamond & Pearl', slug: 'diamondpearl' },
    { game: 'Platinum', label: 'Platinum', slug: 'platinum' },
    { game: 'HeartGold and SoulSilver', label: 'HeartGold & SoulSilver', slug: 'heartgoldsoulsilver' },
  ],
  '5': [
    { game: 'Black', label: 'Black & White', slug: 'blackwhite' },
    { game: 'Black 2 and White 2', label: 'Black 2 & White 2', slug: 'black2white2' },
  ],
  '6': [
    { game: 'X and Y', label: 'X & Y', slug: 'xy' },
    { game: 'Omega Ruby and Alpha Sapphire', label: 'Omega Ruby & Alpha Sapphire', slug: 'omegarubyalphasapphire' },
  ],
  '7': [
    { game: 'Sun and Moon', label: 'Sun & Moon', slug: 'sunmoon' },
    { game: 'Ultra Sun and Ultra Moon', label: 'Ultra Sun & Ultra Moon', slug: 'ultrasunultramoon' },
  ],
  '8': [
    { game: 'Sword and Shield', label: 'Sword & Shield', slug: 'swordshield' },
  ],
  '9': [
    { game: 'Scarlet and Violet', label: 'Scarlet & Violet', slug: 'scarletviolet' },
  ],
}

function getVersionsForGame(game: string): VersionOption[] {
  const gen = GAME_TO_GEN[game]
  return gen ? (GEN_TUTOR_VERSIONS[gen] ?? []) : []
}

function getSerebiiUrl(slug: string): string {
  return `https://www.serebii.net/${slug}/movetutor.shtml`
}

interface InnerProps {
  game: string
  anchorRect: DOMRect
  onClose: () => void
}

function PopoverInner({ game, anchorRect, onClose }: InnerProps) {
  const versions = getVersionsForGame(game)
  const autoSelect = versions.length === 1 ? versions[0] : null
  const [selected, setSelected] = useState<VersionOption | null>(autoSelect)
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setHtml(null)
    window.electronAPI.fetchSerebiiTutor(selected.game).then(result => {
      if (cancelled) return
      setHtml(result)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selected])

  usePopoverDismiss('[data-tutor-popover]', onClose)

  const showingPage = selected != null
  const POPOVER_WIDTH = showingPage ? 780 : 320
  const POPOVER_HEIGHT = showingPage ? 540 : undefined
  const left = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
    ? anchorRect.right + 6
    : anchorRect.left - POPOVER_WIDTH - 6
  const top = Math.min(
    Math.max(6, anchorRect.top - (showingPage ? 120 : 0)),
    window.innerHeight - (POPOVER_HEIGHT ?? 200) - 6
  )

  const serebiiUrl = selected ? getSerebiiUrl(selected.slug) : null

  return createPortal(
    <div
      data-tutor-popover
      style={{ position: 'fixed', top, left, zIndex: POPOVER_Z, width: `${POPOVER_WIDTH}px` }}
      className="bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {selected && versions.length > 1 && (
            <button
              onClick={() => { setSelected(null); setHtml(null) }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="Back to version selection"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <p className="text-sm font-bold text-white">
            {selected ? `Move Tutor — ${selected.label}` : 'Select Version'}
          </p>
        </div>
        {serebiiUrl && (
          <button
            onClick={() => window.electronAPI.openExternal(serebiiUrl)}
            className="text-xs text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1 shrink-0 ml-3"
            title="Open on Serebii"
          >
            Serebii
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
      </div>

      {!selected ? (
        <div className="flex flex-col gap-2">
          {versions.map(v => (
            <button
              key={v.game}
              onClick={() => setSelected(v)}
              className="text-left text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded px-3 py-2 transition-colors"
            >
              {v.label}
            </button>
          ))}
          {versions.length === 0 && (
            <p className="text-xs text-gray-500">No move tutor data available for this generation.</p>
          )}
        </div>
      ) : loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : !html ? (
        <p className="text-xs text-gray-500">No move tutor location data available for this game.</p>
      ) : (
        <iframe
          srcDoc={html}
          style={{ width: '100%', height: `${(POPOVER_HEIGHT ?? 540) - 60}px`, border: 'none', borderRadius: '6px', backgroundColor: 'white' }}
          sandbox="allow-same-origin"
          title="Move Tutor Locations"
        />
      )}
    </div>,
    document.body
  )
}

interface Props {
  game: string
  children: React.ReactNode
}

export default function TutorPopover({ game, children }: Props) {
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
        className="text-left hover:text-blue-400 transition-colors"
      >
        {children}
      </button>
      {anchorRect && (
        <PopoverInner
          game={game}
          anchorRect={anchorRect}
          onClose={() => setAnchorRect(null)}
        />
      )}
    </>
  )
}
