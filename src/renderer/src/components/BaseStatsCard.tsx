import { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BaseStats as BaseStatsType } from '../types/pokemon'
import { displayName } from '../data'
import { STAT_CONFIG, GEN1_STAT_CONFIG, MAX_STAT, GEN1_GAMES } from '../constants/stats'
import { TYPE_COLORS } from './TypeBadge'
import { getArtworkUrl } from '../utils/sprites'

interface Props {
  stats: BaseStatsType
  species: string
  dexNumber: number
  type1: string
  type2: string
  game: string
  onClose: () => void
}

export default function BaseStatsCard({ stats, species, dexNumber, type1, type2, game, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const isGen1 = GEN1_GAMES.has(game)
  const config = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG
  const total = isGen1
    ? stats.hp + stats.attack + stats.defense + stats.special_attack + stats.speed
    : Object.values(stats).reduce((sum, v) => sum + v, 0)
  const isDualType = type1 !== type2
  const name = displayName(species)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleExport = useCallback(async () => {
    const el = cardRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      const { toPng: convertToPng } = await import('html-to-image')
      const dataUrl = await convertToPng(el, {
        pixelRatio: 3,
        backgroundColor: 'transparent',
        filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
      })
      const link = document.createElement('a')
      link.download = `${name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}_stats.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [exporting, name])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} className="relative">
        {/* Export button */}
        <button
          data-export-ignore
          onClick={handleExport}
          disabled={exporting}
          className="absolute -top-3 -right-3 z-10 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg p-2 transition-colors disabled:opacity-50"
          title="Export as PNG"
        >
          {exporting ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
          )}
        </button>

        {/* The card that gets exported */}
        <div
          ref={cardRef}
          className="flex items-end gap-6 rounded-2xl px-8 py-6"
          style={{ background: 'transparent' }}
        >
          {/* Left: sprite + name + types */}
          <div className="flex flex-col items-center gap-2" style={{ width: '180px' }}>
            <img
              src={getArtworkUrl(species, dexNumber)}
              alt={name}
              className="w-40 h-40 object-contain drop-shadow-lg"
              crossOrigin="anonymous"
            />
            <p className="text-xl font-bold text-white text-center leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {name}
            </p>
            <div className="flex gap-1.5 justify-center">
              <TypeChip type={type1} />
              {isDualType && <TypeChip type={type2} />}
            </div>
          </div>

          {/* Right: stat table */}
          <div className="flex flex-col gap-1.5" style={{ width: '280px' }}>
            {config.map(({ key, label, color }) => {
              const value = stats[key]
              const pct = Math.min((value / MAX_STAT) * 100, 100)
              return (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold uppercase tracking-wider text-right shrink-0"
                    style={{ color, width: '44px' }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums text-right shrink-0"
                    style={{ color, width: '32px' }}
                  >
                    {value}
                  </span>
                  <div className="flex-1 h-4 rounded-sm overflow-hidden" style={{ backgroundColor: 'rgba(55,65,81,0.8)' }}>
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${pct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.9 }}
                    />
                  </div>
                </div>
              )
            })}
            {/* Total */}
            <div className="flex items-center gap-2 pt-1.5 mt-0.5" style={{ borderTop: '1px solid rgba(75,85,99,0.6)' }}>
              <span className="text-xs font-bold uppercase tracking-wider text-right shrink-0 text-gray-400" style={{ width: '44px' }}>
                Total
              </span>
              <span className="text-sm font-bold tabular-nums text-right text-white shrink-0" style={{ width: '32px' }}>
                {total}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? '#6B7280'
  return (
    <span
      className="inline-block rounded text-xs font-semibold text-center py-0.5 px-3"
      style={{
        backgroundColor: color,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        minWidth: '68px',
      }}
    >
      {type}
    </span>
  )
}
