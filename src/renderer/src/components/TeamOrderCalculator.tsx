import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Trainer } from '../types/pokemon'
import { displayName, getPokemonData, getMoveData } from '../data'
import { TYPE_COLORS } from './TypeBadge'
import { getHomeSpriteUrl } from '../utils/sprites'
import { getExportBgColor } from '../utils/exportSettings'
import { buildExportFilename } from '../utils/exportFilename'
import { simulateOrder, getSupportedGen, type SimStep, type SupportedGen } from '../utils/teamOrderCalculator'

// TYPE_COLORS is tuned for white-text-on-colored-fill badges; several of the
// darker hues (Ghost, Dark, Ground, Dragon, Poison) lose their identity when
// used as text directly on the dark modal background. Override with brighter
// shades that preserve the type's character but read clearly at body text size.
const TYPE_TEXT_COLOR_OVERRIDES: Record<string, string> = {
  Ghost:   '#b497d6',
  Dark:    '#a89392',
  Ground:  '#d2a06a',
  Dragon:  '#8a96e8',
  Poison:  '#c084ee',
  Bug:     '#bcc944',
  Grass:   '#6cd64f',
  Fire:    '#ff5454',
  Water:   '#5da4f5',
  Fighting: '#ff9e3d',
  Normal:  '#c9c9c9',
}

function moveTextColor(type: string | undefined): string | undefined {
  if (!type) return undefined
  return TYPE_TEXT_COLOR_OVERRIDES[type] ?? TYPE_COLORS[type]
}

function MoveName({ name, game }: { name: string; game: string }) {
  const md = getMoveData(name, game)
  const color = moveTextColor(md?.type)
  return (
    <span style={color ? { color, textShadow: '0 1px 2px rgba(0,0,0,0.4)' } : undefined} className="font-semibold">
      {name}
    </span>
  )
}

function MonIcon({ species, game, size = 'md' }: { species: string; game: string; size?: 'sm' | 'md' }) {
  const data = getPokemonData(species, game)
  if (!data) return null
  const cls = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'
  return (
    <img
      src={getHomeSpriteUrl(species, data.national_dex_number)}
      alt=""
      loading="lazy"
      className={`pokemon-icon-stroke ${cls} object-contain shrink-0`}
    />
  )
}

const PRE_FAIRY_TYPES = [
  'Normal','Fire','Water','Electric','Grass','Ice',
  'Fighting','Poison','Ground','Flying','Psychic','Bug',
  'Rock','Ghost','Dragon','Dark','Steel',
]

interface TypeChipButtonProps {
  type: string
  selected: boolean
  onClick: () => void
}

function TypeChipButton({ type, selected, onClick }: TypeChipButtonProps) {
  const color = TYPE_COLORS[type] ?? '#6B7280'
  return (
    <button
      onClick={onClick}
      className="rounded text-xs font-semibold py-1 px-2 transition-all"
      style={{
        background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        outline: selected ? '2px solid #fff' : '2px solid transparent',
        outlineOffset: selected ? '1px' : '0',
        opacity: selected ? 1 : 0.55,
        minWidth: '64px',
      }}
    >
      {type}
    </button>
  )
}

interface NoneButtonProps {
  selected: boolean
  onClick: () => void
}
function NoneButton({ selected, onClick }: NoneButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded text-xs font-semibold py-1 px-2 transition-all bg-gray-700 text-gray-300"
      style={{
        outline: selected ? '2px solid #fff' : '2px solid transparent',
        outlineOffset: selected ? '1px' : '0',
        opacity: selected ? 1 : 0.55,
        minWidth: '64px',
      }}
    >
      None
    </button>
  )
}

function reasonLabel(step: SimStep): string {
  switch (step.reason) {
    case 'lead':                return 'Lead — slot 0 is always sent out first'
    case 'gen2-se-pick':        return 'Has a super-effective move; player not super-effective vs it'
    case 'gen2-neutral-pick':   return 'Neutral matchup (no SE move, player not SE vs it)'
    case 'gen2-forced-random':  return 'Only remaining Pokémon — sent out by elimination'
    case 'gen2-random':         return 'All remaining Pokémon are at a type disadvantage — game picks randomly'
    case 'gen3-phase1':         return 'Phase 1: takes the most damage from your STAB and has a super-effective move'
    case 'gen3-forced-linear':  return 'Only remaining Pokémon — sent out by elimination'
    case 'gen3-phase2':         return "Phase 2 fallback: damage-based pick that depends on engine quirks (uses the active battler's stats and a u8 wraparound) — can't be deterministically predicted"
    case 'gen4-stage1':         return 'Stage 1: highest offensive type score against you AND has a super-effective move'
    case 'gen4-forced-linear':  return 'Only remaining Pokémon — sent out by elimination'
    case 'gen4-stage2':         return "Stage 2 fallback: damage-based pick that depends on engine quirks (uses the active battler's stats and a u8 wraparound) — can't be deterministically predicted"
  }
}

function formatMultiplier(typeDmg: number): string {
  const m = typeDmg / 10
  if (m === 0) return '0×'
  if (Number.isInteger(m)) return `${m}×`
  return `${m}×`
}

interface StepRowProps {
  step: SimStep
  index: number
  trainer: Trainer
  game: string
}

function StepRow({ step, index, trainer, game }: StepRowProps) {
  if (step.reason === 'gen2-random' || step.reason === 'gen3-phase2' || step.reason === 'gen4-stage2') {
    const heading =
      step.reason === 'gen2-random' ? 'Random fallback' :
      step.reason === 'gen3-phase2' ? 'Phase 2 fallback' :
      'Stage 2 fallback'
    return (
      <div className="rounded border border-yellow-700/60 bg-yellow-900/10 p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-yellow-400">#{index + 1}</span>
          <span className="text-sm font-semibold text-yellow-300">{heading}</span>
        </div>
        <p className="text-xs text-gray-400 mb-2">{reasonLabel(step)}</p>
        <div className="flex flex-wrap gap-1.5">
          {step.fallbackCandidates.map(slot => {
            const evalForSlot = step.evaluations.find(e => e.slot === slot)
            return (
              <span key={slot} className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-200 border border-gray-700">
                <MonIcon species={trainer.party[slot].species} game={game} size="sm" />
                <span className="text-gray-500">slot {slot}</span> · {displayName(trainer.party[slot].species)}
                {step.reason === 'gen3-phase2' && evalForSlot?.typeDmg !== undefined && (
                  <span className="text-gray-500">· {formatMultiplier(evalForSlot.typeDmg)}</span>
                )}
                {step.reason === 'gen4-stage2' && evalForSlot?.gen4Score !== undefined && (
                  <span className="text-gray-500">· score {evalForSlot.gen4Score}</span>
                )}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  if (step.sentOut === null) return null
  const mon = trainer.party[step.sentOut]
  const evalForSlot = step.evaluations.find(e => e.slot === step.sentOut)

  return (
    <div className="rounded border border-gray-700 bg-gray-800/40 p-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-gray-500 w-6">#{index + 1}</span>
        <MonIcon species={mon.species} game={game} />
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 font-mono">slot {step.sentOut}</span>
        <span className="text-sm font-semibold text-white">{displayName(mon.species)}</span>
        <span className="text-xs text-gray-500">Lv {mon.level}</span>
      </div>
      <p className="text-xs text-gray-400 mt-1.5 ml-[68px]">{reasonLabel(step)}</p>
      {evalForSlot?.seMove && (
        <p className="text-xs text-gray-500 mt-0.5 ml-[68px]">
          SE move: <MoveName name={evalForSlot.seMove} game={game} />
        </p>
      )}
      {evalForSlot?.typeDmg !== undefined && step.reason === 'gen3-phase1' && (
        <p className="text-xs text-gray-500 mt-0.5 ml-[68px]">
          Damage taken from your STAB: <span className="text-gray-300">{formatMultiplier(evalForSlot.typeDmg)}</span>
        </p>
      )}
      {evalForSlot?.gen4Score !== undefined && step.reason === 'gen4-stage1' && (
        <p className="text-xs text-gray-500 mt-0.5 ml-[68px]">
          Offensive type score: <span className="text-gray-300">{evalForSlot.gen4Score}</span>
          {evalForSlot.gen4Score8bit !== undefined && evalForSlot.gen4Score8bit !== evalForSlot.gen4Score && (
            <span className="text-yellow-500/70"> (8-bit: {evalForSlot.gen4Score8bit} — wraps in stock Platinum)</span>
          )}
        </p>
      )}
    </div>
  )
}

const GEN_NOTE: Record<SupportedGen, string> = {
  '2': "Lead is always slot 0. After each faint, the trainer picks the lowest-slot Pokémon with a super-effective move that you can't super-effectively counter; failing that, the lowest-slot neutral matchup; failing that, a random pick among the remaining. Move power is not consulted.",
  '3': "Lead is always slot 0. After each faint, Phase 1 picks the alive Pokémon that takes the *most* damage from your STAB AND has at least one super-effective move (a counter-intuitive defensive scoring quirk in stock Emerald). If no candidate qualifies, the engine falls back to a damage-based estimate (Phase 2) whose result is hard to predict deterministically.",
  '4': "Lead is always slot 0. After each faint, Stage 1 picks the alive Pokémon whose offensive type score against you is highest AND that has at least one super-effective move (Gen 4 fixed Gen 3's defensive-scoring direction). The score is summed across both of the candidate's types and is held in a u8 — values above 255 wrap silently in stock Platinum, which can flip the winner. If Stage 1 finds nobody, the engine falls back to a damage-based estimate (Stage 2) that can't be deterministically predicted.",
}

interface Props {
  trainer: Trainer
  game: string
  onClose: () => void
}

export default function TeamOrderCalculator({ trainer, game, onClose }: Props) {
  const [type1, setType1] = useState<string>('Normal')
  const [type2, setType2] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const supportedGen = getSupportedGen(game)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const steps = useMemo(
    () => simulateOrder(trainer.party, game, type1, type2),
    [trainer.party, game, type1, type2],
  )

  const handleExport = useCallback(async () => {
    const el = cardRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      const { toCanvas } = await import('html-to-image')
      const bgColor = getExportBgColor()

      // Capture the modal card at its natural size with the scroll area
      // expanded so the full predicted order is visible in the export.
      const scroller = el.querySelector<HTMLElement>('[data-export-scroll]')
      const prevOverflow = scroller?.style.overflow
      const prevMaxHeight = scroller?.style.maxHeight
      const prevCardMaxHeight = el.style.maxHeight
      if (scroller) {
        scroller.style.overflow = 'visible'
        scroller.style.maxHeight = 'none'
      }
      el.style.maxHeight = 'none'

      let srcCanvas: HTMLCanvasElement
      try {
        srcCanvas = await toCanvas(el, {
          pixelRatio: 2,
          backgroundColor: bgColor,
          filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
        })
      } finally {
        if (scroller) {
          scroller.style.overflow = prevOverflow ?? ''
          scroller.style.maxHeight = prevMaxHeight ?? ''
        }
        el.style.maxHeight = prevCardMaxHeight
      }

      // Composite onto a 1920×1080 canvas, scaled to fit 83%
      const out = document.createElement('canvas')
      out.width = 1920
      out.height = 1080
      const ctx = out.getContext('2d')!
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, 1920, 1080)
      }
      const maxW = 1920 * 0.83
      const maxH = 1080 * 0.83
      const scale = Math.min(maxW / srcCanvas.width, maxH / srcCanvas.height)
      const drawW = srcCanvas.width * scale
      const drawH = srcCanvas.height * scale
      ctx.drawImage(srcCanvas, (1920 - drawW) / 2, (1080 - drawH) / 2, drawW, drawH)

      const link = document.createElement('a')
      const safeName = trainer.name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
      const typePart = type2 ? `${type1}_${type2}` : type1
      link.download = buildExportFilename(game, `${safeName}_team_order_vs_${typePart}`)
      link.href = out.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }, [exporting, trainer.name, game, type1, type2])

  if (!supportedGen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={cardRef}
        className="w-full max-w-2xl rounded-xl shadow-2xl border border-gray-700 flex flex-col overflow-hidden"
        style={{ backgroundColor: '#1a1f29', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Team Order Calculator</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {trainer.name} · Gen {supportedGen} send-out logic
            </p>
          </div>
          <div className="flex items-center gap-1" data-export-ignore>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded p-1.5 transition-colors disabled:opacity-50"
              title="Export as PNG"
              aria-label="Export"
            >
              {exporting ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                  <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div data-export-scroll className="overflow-y-auto px-5 py-4 space-y-5">
          {/* Type pickers */}
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Your Pokémon&apos;s type 1</p>
            <div className="flex flex-wrap gap-1.5">
              {PRE_FAIRY_TYPES.map(t => (
                <TypeChipButton
                  key={t}
                  type={t}
                  selected={type1 === t}
                  onClick={() => setType1(t)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Your Pokémon&apos;s type 2 (optional)</p>
            <div className="flex flex-wrap gap-1.5">
              <NoneButton selected={type2 === null} onClick={() => setType2(null)} />
              {PRE_FAIRY_TYPES.map(t => (
                <TypeChipButton
                  key={t}
                  type={t}
                  selected={type2 === t}
                  onClick={() => setType2(t === type2 ? null : t)}
                />
              ))}
            </div>
          </div>

          {/* Predicted order */}
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Predicted send-out order</p>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <StepRow key={i} step={step} index={i} trainer={trainer} game={game} />
              ))}
              {steps.length === 0 && (
                <p className="text-sm text-gray-500">No party.</p>
              )}
            </div>
          </div>

          {/* Footnote */}
          <p className="text-[11px] text-gray-600 leading-relaxed border-t border-gray-800 pt-3">
            {GEN_NOTE[supportedGen]} Assumes your active Pokémon does not switch out.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
