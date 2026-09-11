import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Stroke, type Tool, ANNOTATION_COLORS } from '../../utils/issues/annotation'
import AnnotationCanvas, { type Shot } from './AnnotationCanvas'

interface Props {
  shot: Shot
  strokes: Stroke[]
  onCommitStroke: (stroke: Stroke) => void
  onUndo: () => void
  onClear: () => void
  onContinue: () => void
  onCancel: () => void
}

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
]

const IS_MAC = (process.platform as string) === 'darwin'
const MOD = IS_MAC ? '⌘' : 'Ctrl'

/**
 * Full-window annotation step. Sits above every popover (z 10001) and
 * swallows all keyboard input in the capture phase so Space / F-keys / arrows
 * never reach the app's global shortcut handler while it is open.
 */
export default function AnnotationOverlay({ shot, strokes, onCommitStroke, onUndo, onClear, onContinue, onCancel }: Props) {
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(ANNOTATION_COLORS[0].value)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      const mod = e.metaKey || e.ctrlKey
      if (e.key === 'Enter' && !mod) onContinue()
      else if (e.key === 'Escape') onCancel()
      else if (mod && (e.key === 'z' || e.key === 'Z')) onUndo()
      else if (!mod) {
        const k = e.key.toLowerCase()
        if (k === 'p') setTool('pen')
        else if (k === 'r') setTool('rect')
        else if (k === 'a') setTool('arrow')
        else {
          const c = ANNOTATION_COLORS.find(x => x.key === k)
          if (c) setColor(c.value)
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onContinue, onCancel, onUndo])

  const btn = 'px-2.5 py-1 rounded text-xs font-semibold transition-colors'

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex flex-col bg-black/80" role="dialog" aria-label="Annotate screenshot">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 select-none">
        <span className="text-sm font-bold text-white mr-2">Mark up the screenshot</span>
        <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-900">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              className={`${btn} rounded-none ${tool === t.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
              title={`${t.label} [${t.key}]`}
            >
              {t.label} <span className={tool === t.id ? 'text-white/60' : 'text-gray-500'}>[{t.key}]</span>
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1.5 ml-1">
          {ANNOTATION_COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c.value ? 'border-white scale-110' : 'border-gray-600 hover:scale-105'}`}
              style={{ backgroundColor: c.value }}
              title={`${c.label} [${c.key}]`}
              aria-label={c.label}
            />
          ))}
        </div>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <button type="button" onClick={onUndo} disabled={strokes.length === 0} className={`${btn} bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed`} title={`Undo [${MOD}+Z]`}>
          Undo
        </button>
        <button type="button" onClick={onClear} disabled={strokes.length === 0} className={`${btn} bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed`}>
          Clear
        </button>
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className={`${btn} bg-gray-700 text-gray-200 hover:bg-gray-600`}>
          Cancel <span className="text-gray-400">[Esc]</span>
        </button>
        <button type="button" onClick={onContinue} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}>
          Continue <span className="text-white/70">[Enter]</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-4">
        <AnnotationCanvas shot={shot} strokes={strokes} tool={tool} color={color} onCommitStroke={onCommitStroke} />
      </div>
      <div className="px-4 py-1.5 text-xs text-gray-400 bg-gray-800 border-t border-gray-700 select-none">
        Draw on the screenshot to point out the problem · Enter to continue · Esc to cancel · {MOD}+Z undo
      </div>
    </div>,
    document.body
  )
}
