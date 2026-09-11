import type { IssueRecord, RemoteStatus } from '../../../../shared/issues'
import { STATUS_TEXT } from '../../../../shared/issues'

type PillKind = RemoteStatus | 'local-only' | 'pending' | 'failed' | 'failed-permanent'

const STYLES: Record<PillKind, { text: string; cls: string }> = {
  'open':             { text: STATUS_TEXT.open,          cls: 'text-blue-300 bg-blue-900/30 border-blue-700/50' },
  'fix-applied':      { text: STATUS_TEXT['fix-applied'], cls: 'text-amber-300 bg-amber-900/30 border-amber-700/50' },
  'needs-info':       { text: STATUS_TEXT['needs-info'],  cls: 'text-purple-300 bg-purple-900/30 border-purple-700/50' },
  'decision':         { text: STATUS_TEXT.decision,      cls: 'text-gray-300 bg-gray-700/40 border-gray-600/60' },
  'resolved':         { text: STATUS_TEXT.resolved,      cls: 'text-emerald-300 bg-emerald-900/30 border-emerald-700/50' },
  'not-planned':      { text: STATUS_TEXT['not-planned'], cls: 'text-gray-400 bg-gray-700/40 border-gray-600/60' },
  'local-only':       { text: 'Saved locally',           cls: 'text-gray-300 bg-gray-700/40 border-gray-600/60' },
  'pending':          { text: 'Sending…',                cls: 'text-gray-300 bg-gray-700/40 border-gray-600/60' },
  'failed':           { text: 'Not sent yet',            cls: 'text-orange-300 bg-orange-900/30 border-orange-700/50' },
  'failed-permanent': { text: 'Not sent',                cls: 'text-red-300 bg-red-900/30 border-red-700/50' },
}

/** The one status a local report should show: remote status once sent, otherwise the send state. */
export function pillKindFor(record: IssueRecord): PillKind {
  if (record.send === 'sent' && record.remote) return record.remote.status
  if (record.send === 'sent') return 'open'
  return record.send
}

export default function StatusPill({ kind, className = '' }: { kind: PillKind; className?: string }) {
  const s = STYLES[kind]
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls} ${className}`}>
      {s.text}
    </span>
  )
}
