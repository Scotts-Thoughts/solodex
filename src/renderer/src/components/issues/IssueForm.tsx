import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ISSUE_LIMITS } from '../../../../shared/issues'
import { filesToAttachments, releaseAttachment, type PendingAttachment } from '../../utils/issues/attachments'
import AttachmentDropZone from './AttachmentDropZone'

export interface Draft {
  title: string
  description: string
  sendToDeveloper: boolean
  attachments: PendingAttachment[]
}

interface Props {
  draft: Draft
  onChange: (draft: Draft) => void
  /** Object URL of the annotated screenshot, or null when there is none. */
  previewUrl: string | null
  relayConfigured: boolean
  onBack: (() => void) | null
  onCancel: () => void
  onSubmit: () => void
  error: string | null
}

const IS_MAC = (process.platform as string) === 'darwin'
const MOD = IS_MAC ? '⌘' : 'Ctrl'
const INPUT = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 select-text'

export default function IssueForm({ draft, onChange, previewUrl, relayConfigured, onBack, onCancel, onSubmit, error }: Props) {
  const titleRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const messageTimer = useRef<number | null>(null)
  const canSubmit = draft.title.trim().length > 0

  useEffect(() => { titleRef.current?.focus() }, [])

  // Esc goes back to the markup step (or cancels); Ctrl/Cmd+Enter submits.
  // Everything else must reach the inputs, so only those two are intercepted.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (onBack) onBack()
        else onCancel()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
        if (canSubmit) onSubmit()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onBack, onCancel, onSubmit, canSubmit])

  useEffect(() => () => { if (messageTimer.current) window.clearTimeout(messageTimer.current) }, [])

  const showMessage = (text: string) => {
    setMessage(text)
    if (messageTimer.current) window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(null), 5000)
  }

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    const { accepted, rejected } = await filesToAttachments(files, draft.attachments)
    if (accepted.length) onChange({ ...draft, attachments: [...draft.attachments, ...accepted] })
    if (rejected.length) showMessage(rejected.map(r => `${r.name}: ${r.reason}`).join(' · '))
  }

  const removeFile = (index: number) => {
    const next = draft.attachments.slice()
    const [removed] = next.splice(index, 1)
    if (removed) releaseAttachment(removed)
    onChange({ ...draft, attachments: next })
  }

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60" role="dialog" aria-label="Report an issue">
      <div className="bg-gray-800 rounded-lg shadow-2xl w-[680px] max-h-[90vh] flex flex-col border border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Report an issue</h2>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white text-xl leading-none px-1" aria-label="Close">&times;</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="w-44 shrink-0">
              {previewUrl
                ? <img src={previewUrl} alt="Annotated screenshot" className="w-44 rounded border border-gray-700 object-contain bg-gray-900" />
                : <div className="w-44 h-28 rounded border border-dashed border-gray-600 flex items-center justify-center text-xs text-gray-500 text-center px-2">Screenshot unavailable</div>}
              {onBack && (
                <button type="button" onClick={onBack} className="mt-2 w-full px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 transition-colors">
                  Back to markup <span className="text-gray-400">[Esc]</span>
                </button>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              <label className="block">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">What went wrong?</span>
                <input
                  ref={titleRef}
                  type="text"
                  value={draft.title}
                  maxLength={ISSUE_LIMITS.maxTitle}
                  onChange={e => onChange({ ...draft, title: e.target.value })}
                  placeholder="Short summary, e.g. “Damage view goes blank after switching game”"
                  className={`${INPUT} mt-1`}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Details</span>
                <textarea
                  value={draft.description}
                  maxLength={ISSUE_LIMITS.maxDescription}
                  onChange={e => onChange({ ...draft, description: e.target.value })}
                  placeholder="What did you do, what did you expect, and what happened instead?"
                  rows={6}
                  className={`${INPUT} mt-1 resize-y min-h-[96px]`}
                />
              </label>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Attachments</div>
            <AttachmentDropZone attachments={draft.attachments} onFiles={addFiles} onRemove={removeFile} message={message} />
          </div>

          {relayConfigured ? (
            <label className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.sendToDeveloper}
                onChange={e => onChange({ ...draft, sendToDeveloper: e.target.checked })}
                className="mt-0.5 accent-blue-500"
              />
              <span>
                Send to the developer
                <span className="block text-xs text-gray-400 mt-0.5">
                  Reports are posted publicly on GitHub: your screenshot, text, attachments and basic diagnostics
                  (app version, operating system, current screen). Nothing else is collected. Untick to keep the report on this computer only.
                </span>
              </span>
            </label>
          ) : (
            <div className="text-xs text-gray-400">
              Sending is not set up in this build, so the report is saved on this computer. You can export it as a .zip afterwards.
            </div>
          )}

          {error && <div className="text-sm text-red-400 select-text">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-700">
          <button type="button" onClick={onCancel} className="px-4 py-1.5 rounded bg-gray-700 text-sm text-gray-200 hover:bg-gray-600 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Submit [${MOD}+Enter]`}
          >
            Submit report <span className="text-white/70 font-normal">[{MOD}+⏎]</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
