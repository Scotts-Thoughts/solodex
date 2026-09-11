import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IssueRecord } from '../../../../shared/issues'

type Phase =
  | { kind: 'submitting' }
  | { kind: 'done'; record: IssueRecord }
  | { kind: 'error'; message: string }

interface Props {
  phase: Phase
  onClose: () => void
  onRetry: () => void
  onBack: () => void
  onOpenPanel?: () => void
}

const BTN = 'px-3 py-1.5 rounded text-sm transition-colors'
const SECONDARY = `${BTN} bg-gray-700 text-gray-200 hover:bg-gray-600`
const PRIMARY = `${BTN} bg-emerald-600 hover:bg-emerald-500 text-white font-semibold`

export default function IssueSubmitResult({ phase, onClose, onRetry, onBack, onOpenPanel }: Props) {
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)

  useEffect(() => {
    if (phase.kind === 'submitting') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && phase.kind === 'done')) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [phase.kind, onClose])

  const exportZip = async (id: string) => {
    setExporting(true)
    try {
      const r = await window.electronAPI.exportIssueZip(id)
      setExportNote(r.ok ? `Saved ${r.path}` : r.error ? `Export failed: ${r.error}` : null)
    } finally {
      setExporting(false)
    }
  }

  let body: React.ReactNode
  let actions: React.ReactNode
  if (phase.kind === 'submitting') {
    body = (
      <div className="flex items-center gap-3 text-sm text-gray-300">
        <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Saving your report…
      </div>
    )
    actions = null
  } else if (phase.kind === 'error') {
    body = (
      <div className="text-sm text-red-300 select-text">
        <div className="font-semibold mb-1">The report could not be saved</div>
        <div className="text-red-200/80">{phase.message}</div>
      </div>
    )
    actions = (
      <>
        <button type="button" onClick={onBack} className={SECONDARY}>Back</button>
        <button type="button" onClick={onRetry} className={PRIMARY}>Try again</button>
      </>
    )
  } else {
    const r = phase.record
    const sent = r.send === 'sent' && r.remote
    body = (
      <div className="text-sm text-gray-300 space-y-2 select-text">
        {sent ? (
          <>
            <div className="text-white font-semibold">Thanks — your report was sent.</div>
            <div>
              It is issue <span className="font-mono text-gray-100">#{r.remote!.number}</span> on GitHub. When a fix is applied, the
              Issues panel in this app will show what changed.
            </div>
          </>
        ) : r.send === 'local-only' ? (
          <>
            <div className="text-white font-semibold">Your report was saved on this computer.</div>
            <div>It was not sent to the developer. You can export it as a .zip to share it another way.</div>
          </>
        ) : r.send === 'failed' ? (
          <>
            <div className="text-white font-semibold">Your report was saved, but could not be sent yet.</div>
            <div className="text-gray-400">{r.sendError}</div>
            <div>The app will keep trying in the background. You can also export it as a .zip to share it another way.</div>
          </>
        ) : (
          <>
            <div className="text-white font-semibold">Your report was saved, but it cannot be sent from this app.</div>
            <div className="text-gray-400">{r.sendError}</div>
            <div>Export it as a .zip to share it another way.</div>
          </>
        )}
        {exportNote && <div className="text-xs text-gray-400">{exportNote}</div>}
      </div>
    )
    actions = (
      <>
        {onOpenPanel && <button type="button" onClick={onOpenPanel} className={SECONDARY}>View my reports</button>}
        {sent && <button type="button" onClick={() => window.electronAPI.openExternal(r.remote!.url)} className={SECONDARY}>Open on GitHub</button>}
        {!sent && <button type="button" onClick={() => exportZip(r.id)} disabled={exporting} className={`${SECONDARY} disabled:opacity-50`}>Export .zip…</button>}
        <button type="button" onClick={onClose} className={PRIMARY}>Done <span className="text-white/70 font-normal">[⏎]</span></button>
      </>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60" role="dialog" aria-label="Report status">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-[520px] border border-gray-700">
        <div className="px-6 py-5">{body}</div>
        {actions && <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-700">{actions}</div>}
      </div>
    </div>,
    document.body
  )
}
