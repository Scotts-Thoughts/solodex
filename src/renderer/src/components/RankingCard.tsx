import { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { displayName } from '../data'
import type { StatRankEntry } from '../data'
import { getHomeSpriteUrl } from '../utils/sprites'

interface Props {
  title: string
  statColor: string
  ranking: StatRankEntry[]
  currentName: string
  onClose: () => void
  onNavigate?: (name: string) => void
}

export default function RankingCard({ title, statColor, ranking, currentName, onClose, onNavigate }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLTableRowElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Auto-scroll to current Pokemon
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current
        const target = currentRef.current
        if (container && target) {
          const containerRect = container.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const offsetInScroll = targetRect.top - containerRect.top + container.scrollTop
          container.scrollTop = offsetInScroll - container.clientHeight / 2 + target.clientHeight / 2
        }
      })
    })
  }, [currentName])

  const handleExport = useCallback(async () => {
    const el = cardRef.current
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
      const safeName = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
      link.download = `${safeName}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [exporting, title])

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

        {/* The card */}
        <div
          ref={cardRef}
          className="rounded-2xl overflow-hidden flex flex-col"
          style={{ width: '420px', maxHeight: '80vh' }}
        >
          {/* Header */}
          <div className="px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(75,85,99,0.6)' }}>
            <p className="text-sm font-bold uppercase tracking-widest" style={{ color: statColor }}>
              {title}
            </p>
          </div>

          {/* Scrollable table */}
          <div ref={scrollContainerRef} className="overflow-y-auto flex-1">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky top-0 py-2 px-4 text-left text-gray-500 font-semibold w-12" style={{ backgroundColor: 'rgba(31,41,55,0.95)' }}>#</th>
                  <th className="sticky top-0 py-2 px-4 text-left text-gray-500 font-semibold" style={{ backgroundColor: 'rgba(31,41,55,0.95)' }}>Pokémon</th>
                  <th className="sticky top-0 py-2 px-4 text-right text-gray-500 font-semibold w-16" style={{ backgroundColor: 'rgba(31,41,55,0.95)' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(({ name, dex, value, rank }) => {
                  const isCurrent = name === currentName
                  return (
                    <tr
                      key={name}
                      ref={isCurrent ? currentRef : undefined}
                      style={{ backgroundColor: isCurrent ? `${statColor}22` : 'transparent' }}
                      className={!isCurrent && onNavigate ? 'cursor-pointer hover:bg-gray-700/50' : ''}
                      onClick={() => {
                        if (!isCurrent && onNavigate) {
                          onNavigate(name)
                          onClose()
                        }
                      }}
                    >
                      <td className="py-1.5 px-4 tabular-nums text-gray-500">{rank}</td>
                      <td className="py-1.5 px-4 font-medium" style={{ color: isCurrent ? statColor : '#a8b6c2' }}>
                        <span className="inline-flex items-center gap-2">
                          <img
                            src={getHomeSpriteUrl(name, dex)}
                            alt=""
                            className="w-7 h-7 object-contain"
                            loading="lazy"
                            crossOrigin="anonymous"
                          />
                          {displayName(name)}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 tabular-nums text-right font-bold" style={{ color: isCurrent ? statColor : '#d1d5db' }}>{value}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
