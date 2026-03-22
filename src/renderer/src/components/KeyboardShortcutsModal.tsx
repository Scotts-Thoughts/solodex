import { useState, useEffect, useRef } from 'react'
import {
  SHORTCUT_DEFS,
  CATEGORIES,
  keyEventToString,
  formatKeyForDisplay,
  type ShortcutOverrides,
} from '../keybindings'

interface Props {
  bindings: Record<string, string>
  overrides: ShortcutOverrides
  onSetBinding: (id: string, key: string) => void
  onResetBinding: (id: string) => void
  onResetAll: () => void
  onClose: () => void
}

export default function KeyboardShortcutsModal({
  bindings,
  overrides,
  onSetBinding,
  onResetBinding,
  onResetAll,
  onClose,
}: Props) {
  const [recording, setRecording] = useState<string | null>(null)
  const [swapMsg, setSwapMsg] = useState<string | null>(null)
  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings

  // Close modal on Escape (when not recording)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !recording) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, onClose])

  // Recording handler — capture phase to intercept before app handler
  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore standalone modifier presses
      if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return

      // Escape cancels recording
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        setRecording(null)
        return
      }

      const keyStr = keyEventToString(e)
      if (!keyStr) return

      const cur = bindingsRef.current
      const oldKey = cur[recording]

      // Check for conflict with another rebindable shortcut
      const conflict = SHORTCUT_DEFS.find(
        (d) => d.id !== recording && d.rebindable && cur[d.id] === keyStr
      )

      onSetBinding(recording, keyStr)
      if (conflict) {
        onSetBinding(conflict.id, oldKey)
        setSwapMsg(`Swapped: ${conflict.label} moved to ${formatKeyForDisplay(oldKey)}`)
        setTimeout(() => setSwapMsg(null), 3000)
      } else {
        setSwapMsg(null)
      }
      setRecording(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, onSetBinding])

  const hasOverrides = Object.keys(overrides).length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-label="Keyboard Shortcuts"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl w-[620px] max-h-[80vh] flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-1">
                {cat}
              </h3>
              {SHORTCUT_DEFS.filter((d) => d.category === cat).map((def) => {
                const currentKey = bindings[def.id] ?? def.defaultKey
                const isModified = def.rebindable && overrides[def.id] !== undefined
                const isRecording = recording === def.id

                return (
                  <div
                    key={def.id}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-gray-300">{def.label}</span>
                    <div className="flex items-center gap-2">
                      {isRecording ? (
                        <span className="px-3 py-1 rounded bg-blue-600/20 border border-blue-500 text-blue-300 text-xs font-mono animate-pulse min-w-[120px] text-center">
                          Press keys&hellip; <span className="text-blue-500 text-[10px]">Esc to cancel</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => def.rebindable && setRecording(def.id)}
                          className={[
                            'px-3 py-1 rounded text-xs font-mono min-w-[120px] text-center transition-colors',
                            def.rebindable
                              ? 'bg-gray-700 border border-gray-600 text-gray-200 hover:border-gray-400 cursor-pointer'
                              : 'bg-gray-800 border border-gray-700 text-gray-500 cursor-default',
                            isModified ? 'border-yellow-600/50' : '',
                          ].join(' ')}
                          disabled={!def.rebindable}
                          title={def.rebindable ? 'Click to rebind' : ''}
                        >
                          {formatKeyForDisplay(currentKey)}
                        </button>
                      )}
                      {isModified && !isRecording ? (
                        <button
                          onClick={() => onResetBinding(def.id)}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors w-[36px]"
                          title={`Reset to ${formatKeyForDisplay(def.defaultKey)}`}
                        >
                          Reset
                        </button>
                      ) : (
                        def.rebindable && (
                          <span className="w-[36px]" />
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {swapMsg && (
            <div className="text-xs text-yellow-400 mt-1 mb-2">{swapMsg}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 flex justify-between items-center">
          <button
            onClick={onResetAll}
            className={[
              'text-xs transition-colors',
              hasOverrides
                ? 'text-gray-400 hover:text-red-400'
                : 'text-gray-600 cursor-default',
            ].join(' ')}
            disabled={!hasOverrides}
          >
            Reset All to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-gray-700 text-sm text-gray-200 hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
