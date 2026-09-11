import { useEffect, useMemo, useState } from 'react'
import type { GhIssueSummary, IssueRecord } from '../../../../shared/issues'
import { formatBytes, isImageName } from '../../../../shared/issues'
import { splitIssueBody } from '../../utils/issues/issueBody'
import StatusPill, { pillKindFor } from './StatusPill'
import MiniMarkdown from './MiniMarkdown'
import ImageLightbox from './ImageLightbox'

const BTN = 'px-3 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const SECONDARY = `${BTN} bg-gray-700 text-gray-200 hover:bg-gray-600`
const LABEL = 'text-xs font-semibold text-gray-400 uppercase tracking-wider'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function NoteBox({ title, markdown, tone }: { title: string; markdown: string; tone: 'emerald' | 'purple' | 'gray' }) {
  const cls = tone === 'emerald'
    ? 'border-emerald-700/50 bg-emerald-900/20'
    : tone === 'purple' ? 'border-purple-700/50 bg-purple-900/20' : 'border-gray-700 bg-gray-900/40'
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className={`${LABEL} mb-1`}>{title}</div>
      <MiniMarkdown source={markdown} />
    </div>
  )
}

interface LocalProps {
  record: IssueRecord
  developerMode: boolean
  onLightbox: (open: boolean) => void
  onChanged: () => void
}

/** Detail pane for a report stored on this computer. */
export function LocalIssueDetail({ record, developerMode, onLightbox, onChanged }: LocalProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const d = record.diagnostics

  useEffect(() => {
    let cancelled = false
    setScreenshot(null)
    if (record.screenshot) {
      window.electronAPI.getIssueScreenshot(record.id).then(url => { if (!cancelled) setScreenshot(url) })
    }
    return () => { cancelled = true }
  }, [record.id, record.screenshot])

  useEffect(() => { onLightbox(lightbox) }, [lightbox, onLightbox])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setNote(null)
    try {
      await fn()
      onChanged()
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remote = record.remote
  const pill = pillKindFor(record)

  return (
    <div className="flex flex-col gap-4 select-text">
      <div>
        <div className="flex items-start gap-3">
          <h3 className="text-base font-bold text-white flex-1 leading-snug">{record.title}</h3>
          <StatusPill kind={pill} />
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Reported {formatDate(record.createdAt)} · Solodex {d.app.version} · {d.state.view} view{d.state.game ? ` · ${d.state.game}` : ''}{d.state.species ? ` · ${d.state.species}` : ''}
          {remote && <> · <button type="button" className="text-blue-400 hover:underline" onClick={() => window.electronAPI.openExternal(remote.url)}>#{remote.number} on GitHub</button></>}
        </div>
      </div>

      {(record.send === 'failed' || record.send === 'failed-permanent' || record.send === 'local-only' || record.send === 'pending') && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-300">
          {record.send === 'local-only' && <div>This report is stored on this computer only.</div>}
          {record.send === 'pending' && <div>Waiting to be sent…</div>}
          {record.send === 'failed' && <div>Not sent yet — the app will keep trying.{record.sendError ? <span className="block text-xs text-gray-500 mt-1">{record.sendError}</span> : null}</div>}
          {record.send === 'failed-permanent' && <div>This report could not be sent from the app.{record.sendError ? <span className="block text-xs text-gray-500 mt-1">{record.sendError}</span> : null}</div>}
          <div className="flex gap-2 mt-2">
            {(record.send === 'failed' || record.send === 'failed-permanent') && (
              <button type="button" disabled={busy !== null} onClick={() => run('retry', () => window.electronAPI.retryIssueSend(record.id))} className={SECONDARY}>
                {busy === 'retry' ? 'Sending…' : 'Try sending again'}
              </button>
            )}
            <button type="button" disabled={busy !== null} onClick={() => run('export', () => window.electronAPI.exportIssueZip(record.id))} className={SECONDARY}>
              Export .zip…
            </button>
          </div>
        </div>
      )}

      {remote?.resolutionMarkdown && <NoteBox title="What was fixed" markdown={remote.resolutionMarkdown} tone="emerald" />}
      {remote?.needsInfoMarkdown && (
        <div className="flex flex-col gap-2">
          <NoteBox title="The developer needs more information" markdown={remote.needsInfoMarkdown} tone="purple" />
          <div className="text-xs text-gray-400">Reply on GitHub, or send a new report from the app that mentions #{remote.number}.</div>
        </div>
      )}
      {remote?.status === 'fix-applied' && !remote.resolutionMarkdown && (
        <div className="text-sm text-amber-200/90">A fix has been applied and will be included in the next update.</div>
      )}

      {screenshot && (
        <div>
          <div className={`${LABEL} mb-1`}>Screenshot</div>
          <img src={screenshot} alt="Screenshot" className="max-h-56 rounded border border-gray-700 cursor-zoom-in bg-gray-900" onClick={() => setLightbox(true)} />
          {lightbox && <ImageLightbox src={screenshot} alt="Screenshot" onClose={() => setLightbox(false)} />}
        </div>
      )}

      {record.description.trim() && (
        <div>
          <div className={`${LABEL} mb-1`}>Details</div>
          <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{record.description}</div>
        </div>
      )}

      {record.attachments.length > 0 && (
        <div>
          <div className={`${LABEL} mb-1`}>Attachments</div>
          <ul className="space-y-0.5">
            {record.attachments.map(a => (
              <li key={a.file}>
                <button type="button" className="text-sm text-blue-400 hover:underline" onClick={() => window.electronAPI.openIssueAttachment(record.id, a.file)}>
                  {a.name}
                </button>
                <span className="text-xs text-gray-500 ml-2">{formatBytes(a.bytes)}{isImageName(a.name) ? ' · image' : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {developerMode && (
        <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 flex flex-col gap-2">
          <div className={LABEL}>Developer</div>
          {remote?.fixMarkdown && (
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-300 hover:text-white">Technical note</summary>
              <div className="mt-2"><MiniMarkdown source={remote.fixMarkdown} /></div>
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            {remote && remote.status !== 'resolved' && remote.status !== 'not-planned' && (
              <button type="button" disabled={busy !== null} onClick={() => run('resolve', () => expectOk(window.electronAPI.devResolveIssue(remote.number)))} className={`${BTN} bg-emerald-600 hover:bg-emerald-500 text-white`}>
                {busy === 'resolve' ? 'Closing…' : 'Resolved'}
              </button>
            )}
            {remote && (remote.status === 'resolved' || remote.status === 'not-planned') && (
              <button type="button" disabled={busy !== null} onClick={() => run('reopen', () => expectOk(window.electronAPI.devReopenIssue(remote.number)))} className={SECONDARY}>
                {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
              </button>
            )}
            {remote && (
              <button type="button" disabled={busy !== null} onClick={() => run('refresh', () => window.electronAPI.refreshIssueStatus(record.id, true))} className={SECONDARY}>
                {busy === 'refresh' ? 'Checking…' : 'Check status now'}
              </button>
            )}
            <button type="button" onClick={() => window.electronAPI.showIssueInFolder(record.id)} className={SECONDARY}>Show in folder</button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run('delete', () => window.electronAPI.deleteIssue(record.id))}
              className={`${BTN} bg-gray-700 text-red-300 hover:bg-red-900/40`}
            >
              Delete local copy
            </button>
          </div>
        </div>
      )}
      {note && <div className="text-xs text-red-400">{note}</div>}
    </div>
  )
}

async function expectOk<T>(p: Promise<{ ok: true; value: T } | { ok: false; error: string }>): Promise<T> {
  const r = await p
  if (!r.ok) throw new Error(r.error)
  return r.value
}

interface GhProps {
  issue: GhIssueSummary
  onLightbox: (open: boolean) => void
  onChanged: () => void
}

/** Detail pane for an issue listed straight from GitHub (Developer Mode). */
export function GithubIssueDetail({ issue, onLightbox, onChanged }: GhProps) {
  const parts = useMemo(() => splitIssueBody(issue.body), [issue.body])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { onLightbox(lightbox !== null) }, [lightbox, onLightbox])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    setNote(null)
    try {
      await fn()
      onChanged()
    } catch (err) {
      setNote((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const closed = issue.state === 'closed'
  return (
    <div className="flex flex-col gap-4 select-text">
      <div>
        <div className="flex items-start gap-3">
          <h3 className="text-base font-bold text-white flex-1 leading-snug">
            <span className="text-gray-500 font-mono mr-2">#{issue.number}</span>{issue.title}
          </h3>
          <StatusPill kind={issue.status} />
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Updated {formatDate(issue.updatedAt)} · {issue.labels.join(', ') || 'no labels'} ·{' '}
          <button type="button" className="text-blue-400 hover:underline" onClick={() => window.electronAPI.openExternal(issue.url)}>Open on GitHub</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!closed && (
          <button type="button" disabled={busy !== null} onClick={() => run('resolve', () => expectOk(window.electronAPI.devResolveIssue(issue.number)))} className={`${BTN} bg-emerald-600 hover:bg-emerald-500 text-white`}>
            {busy === 'resolve' ? 'Closing…' : 'Resolved'}
          </button>
        )}
        {closed && (
          <button type="button" disabled={busy !== null} onClick={() => run('reopen', () => expectOk(window.electronAPI.devReopenIssue(issue.number)))} className={SECONDARY}>
            {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
          </button>
        )}
      </div>
      {note && <div className="text-xs text-red-400">{note}</div>}

      {issue.resolutionMarkdown && <NoteBox title="User-facing note" markdown={issue.resolutionMarkdown} tone="emerald" />}
      {issue.needsInfoMarkdown && <NoteBox title="Questions for the reporter" markdown={issue.needsInfoMarkdown} tone="purple" />}
      {issue.fixMarkdown && <NoteBox title="Technical note" markdown={issue.fixMarkdown} tone="gray" />}

      {parts.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parts.images.map(img => (
            <img key={img.url} src={img.url} alt={img.alt} className="max-h-40 rounded border border-gray-700 cursor-zoom-in bg-gray-900" onClick={() => setLightbox(img.url)} />
          ))}
          {lightbox && <ImageLightbox src={lightbox} alt="Attachment" onClose={() => setLightbox(null)} />}
        </div>
      )}

      {parts.text && (
        <div>
          <div className={`${LABEL} mb-1`}>Report</div>
          <MiniMarkdown source={parts.text} />
        </div>
      )}

      {parts.diagnostics && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-300 hover:text-white">Diagnostics</summary>
          <pre className="mt-2 font-mono text-[11px] bg-gray-900 border border-gray-700 rounded p-2 overflow-x-auto text-gray-300 whitespace-pre">{parts.diagnostics}</pre>
        </details>
      )}
    </div>
  )
}
