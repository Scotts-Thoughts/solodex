import { useRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { displayName, getPokemonDefenseMatchups } from '../data'
import { EFF_GROUPS, ABILITY_IMMUNITIES } from '../constants/effectiveness'
import { TYPE_COLORS } from './TypeBadge'
import { getArtworkUrl } from '../utils/sprites'
import { getExportBgColor } from '../utils/exportSettings'

interface Props {
  species: string
  dexNumber: number
  type1: string
  type2: string
  game: string
  abilities: string[]
  onClose: () => void
}

export default function EffectivenessCard({ species, dexNumber, type1, type2, game, abilities, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const isDualType = type1 !== type2
  const name = displayName(species)
  const matchups = getPokemonDefenseMatchups(type1, type2, game)

  const abilityImmunityMap: Record<string, string> = {}
  for (const ability of abilities) {
    const immuneType = ABILITY_IMMUNITIES[ability]
    if (immuneType) abilityImmunityMap[immuneType] = ability
  }

  const rows = EFF_GROUPS.flatMap(group => {
    const types = Object.entries(matchups)
      .filter(([, v]) => v === group.value)
      .map(([t]) => t)
    if (types.length === 0) return []
    return [{ ...group, types }]
  })

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
        backgroundColor: getExportBgColor(),
        filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
      })
      const link = document.createElement('a')
      link.download = `${name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}_effectiveness.png`
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

          {/* Right: effectiveness table */}
          <div className="flex flex-col gap-3">
            {rows.map((group, gi) => (
              <div key={group.value}>
                {gi > 0 && <div style={{ borderTop: '1px solid rgba(75,85,99,0.5)' }} className="mb-3" />}
                <div className="flex flex-wrap gap-1.5">
                  {group.types.map(type => {
                    const immunityAbility = abilityImmunityMap[type]
                    return (
                      <div key={type} className="flex items-center gap-1">
                        <TypeChip type={type} />
                        <span
                          className="text-xs font-bold text-center rounded py-0.5 shrink-0"
                          style={{
                            backgroundColor: group.bg,
                            color: group.text,
                            width: '28px',
                          }}
                        >
                          {group.multiplierLabel}
                        </span>
                        {immunityAbility && (
                          <span className="text-xs text-gray-400 italic">
                            ({immunityAbility})
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
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
