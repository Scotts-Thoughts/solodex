import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { GAMES, getAllPokemonForGame, getPokemonData, displayName } from '../data'
import { useGameData } from '../data/useGameData'
import { getHomeSpriteUrl } from '../utils/sprites'
import { listVersusGraphics, type VersusGraphic } from '../utils/bulkExport'
import Combobox, { type ComboOption } from './Combobox'

export interface VersusExportRequest {
  left: string
  right: string
  game: string
  graphics: VersusGraphic[]
  leftArt?: string
  rightArt?: string
}

interface Props {
  initialLeft: string | null
  initialRight: string | null
  initialGame: string
  onConfirm: (request: VersusExportRequest) => void
  onClose: () => void
}

const GRAPHIC_OPTIONS: { key: VersusGraphic; label: string; hint: string }[] = [
  { key: 'stats', label: 'Base stats', hint: 'Base stats side by side' },
  { key: 'typeEffectiveness', label: 'Type effectiveness', hint: 'Damage taken from each attacking type' },
  { key: 'levelUp', label: 'Level up learnset', hint: 'Moves only one learns are tinted' },
  { key: 'tmHm', label: 'TM / HM learnset', hint: 'Moves only one learns are tinted' },
  { key: 'misc', label: 'Misc learnsets', hint: 'Tutor, egg, transfer and prior-evolution moves' },
]

const ALL_GRAPHICS = GRAPHIC_OPTIONS.map(o => o.key)

// Species picker for "Export versus graphics": choose the two Pokémon (and
// game) for a head-to-head and which comparison graphics to generate. Each
// side can optionally use a custom PNG instead of the standard artwork.
export default function VersusExportDialog({ initialLeft, initialRight, initialGame, onConfirm, onClose }: Props) {
  const [game, setGame] = useState(initialGame)
  const [left, setLeft] = useState(initialLeft ?? '')
  const [right, setRight] = useState(initialRight ?? '')
  const [graphics, setGraphics] = useState<Set<VersusGraphic>>(() => new Set(ALL_GRAPHICS))
  const [art, setArt] = useState<{ left?: string; right?: string }>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingSideRef = useRef<'left' | 'right' | null>(null)
  const ready = useGameData(game)

  // Same Windows/Electron focus fix as the bulk custom-art picker
  useEffect(() => {
    const el = fileInputRef.current
    if (!el) return
    const handler = () => { void window.electronAPI.restoreRendererFocus() }
    el.addEventListener('cancel', handler)
    return () => el.removeEventListener('cancel', handler)
  }, [])

  const options = useMemo<ComboOption[]>(
    () => ready
      ? getAllPokemonForGame(game).map(p => ({
          id: p.species,
          label: displayName(p.species),
          sublabel: `#${String(p.national_dex_number).padStart(4, '0')}`,
        }))
      : [],
    [game, ready]
  )

  const leftData = useMemo(() => (ready && left ? getPokemonData(left, game) : null), [left, game, ready])
  const rightData = useMemo(() => (ready && right ? getPokemonData(right, game) : null), [right, game, ready])

  const orderedGraphics = useMemo(() => ALL_GRAPHICS.filter(g => graphics.has(g)), [graphics])
  const planned = useMemo(
    () => (leftData && rightData ? listVersusGraphics(left, right, game, orderedGraphics) : []),
    [leftData, rightData, left, right, game, orderedGraphics]
  )

  const problem = !ready
    ? 'Loading game data…'
    : !left || !right
      ? 'Choose both Pokémon'
      : !leftData
        ? `${displayName(left)} is not in ${game}`
        : !rightData
          ? `${displayName(right)} is not in ${game}`
          : left === right
            ? 'Choose two different Pokémon'
            : planned.length === 0
              ? 'Nothing to export'
              : null

  const toggleGraphic = useCallback((key: VersusGraphic) => {
    setGraphics(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const swap = useCallback(() => {
    setLeft(right)
    setRight(left)
    setArt(prev => ({ left: prev.right, right: prev.left }))
  }, [left, right])

  const pickArt = useCallback((side: 'left' | 'right') => {
    pendingSideRef.current = side
    fileInputRef.current?.click()
  }, [])

  const handleArtFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const side = pendingSideRef.current
    e.target.value = '' // allow re-picking the same file later
    void window.electronAPI.restoreRendererFocus()
    if (!file || !side) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setArt(prev => ({ ...prev, [side]: reader.result as string }))
    }
    reader.readAsDataURL(file)
  }, [])

  const handleConfirm = useCallback(() => {
    if (problem) return
    onConfirm({ left, right, game, graphics: orderedGraphics, leftArt: art.left, rightArt: art.right })
  }, [problem, onConfirm, left, right, game, orderedGraphics, art])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // First Escape closes an open species dropdown, the next one the dialog
        if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
        else onClose()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleConfirm()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, handleConfirm])

  const renderSide = (side: 'left' | 'right') => {
    const value = side === 'left' ? left : right
    const data = side === 'left' ? leftData : rightData
    const custom = art[side]
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
        <div className="w-20 h-20 flex items-center justify-center">
          {custom ? (
            <img src={custom} alt="" className="max-w-full max-h-full object-contain" />
          ) : data ? (
            <img src={getHomeSpriteUrl(data.species, data.national_dex_number)} alt="" className="w-16 h-16 object-contain" />
          ) : (
            <div className="w-16 h-16 rounded-full border border-dashed border-gray-600" />
          )}
        </div>
        <Combobox
          value={value ? displayName(value) : ''}
          options={options}
          onSelect={id => (side === 'left' ? setLeft(id) : setRight(id))}
          placeholder={side === 'left' ? 'First Pokémon…' : 'Second Pokémon…'}
          className="w-full"
        />
        <div className="flex items-center gap-2 text-[11px]">
          <button
            onClick={() => pickArt(side)}
            className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold transition-colors"
          >
            {custom ? 'Change custom art' : 'Custom art…'}
          </button>
          {custom && (
            <button
              onClick={() => setArt(prev => ({ ...prev, [side]: undefined }))}
              className="text-gray-500 hover:text-white"
              title="Use the standard artwork"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-[600px] rounded-xl shadow-2xl border border-gray-700 flex flex-col"
        style={{ backgroundColor: '#1a1f29' }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-700 flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">Export versus graphics</h2>
            <p className="text-xs text-gray-400 mt-1">
              Generates head-to-head comparison graphics for two Pokémon and saves them to the export folder.
            </p>
          </div>
          <select
            value={game}
            onChange={e => setGame(e.target.value)}
            className="bg-gray-700 text-white text-sm rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-gray-500"
          >
            {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Species pickers */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-start gap-3">
          {renderSide('left')}
          <div className="flex flex-col items-center gap-2 pt-7 shrink-0">
            <span className="text-sm font-bold text-gray-500">VS</span>
            <button
              onClick={swap}
              className="text-gray-400 hover:text-white rounded px-1.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-xs transition-colors"
              title="Swap sides"
            >
              ⇄
            </button>
          </div>
          {renderSide('right')}
        </div>

        {/* Graphic choices */}
        <div className="px-5 py-3 border-b border-gray-700 flex flex-col gap-1.5">
          {GRAPHIC_OPTIONS.map(({ key, label, hint }) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={graphics.has(key)}
                onChange={() => toggleGraphic(key)}
                className="accent-emerald-500"
              />
              <span className="text-sm text-gray-200 group-hover:text-white whitespace-nowrap w-36 shrink-0">{label}</span>
              <span className="text-[11px] text-gray-500 truncate">{hint}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center gap-3">
          <span className="text-[11px] text-gray-500 flex-1 min-w-0">
            {problem ?? planned.join(' · ')}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors shrink-0"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={problem !== null}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {problem ? 'Export' : `Export ${planned.length} graphic${planned.length === 1 ? '' : 's'}`}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={handleArtFile}
        />
      </div>
    </div>,
    document.body
  )
}
