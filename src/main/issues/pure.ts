// Electron-free logic for the main-process side of the issue reporter, kept
// separate so it can be unit-tested under vitest's node environment.
import {
  type IssueRecord,
  type IssueRemote,
  type GhIssueSummary,
  extractNotes,
  mapRemoteStatus,
  formatBytes,
  isImageName,
  yearOfId,
} from '../../shared/issues'

/** Backoff for the outbox: 1 m, 5 m, 30 m, 2 h, 12 h, then daily. */
const RETRY_DELAYS_MS = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 12 * 3600e3, 24 * 3600e3]
export const GIVE_UP_AFTER_MS = 14 * 24 * 3600e3

export function nextRetryDelayMs(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1]
}

/** Status polling: unresolved issues only, at most every 10 minutes unless forced. */
export const REFRESH_MIN_INTERVAL_MS = 10 * 60e3

export function shouldRefresh(remote: IssueRemote | undefined, nowMs: number, force = false): boolean {
  if (!remote) return false
  if (!force && (remote.status === 'resolved' || remote.status === 'not-planned')) return false
  if (force) return true
  const last = Date.parse(remote.lastCheckedAt || '') || 0
  return nowMs - last >= REFRESH_MIN_INTERVAL_MS
}

/** Whether a queued report is due for another send attempt. */
export function isSendDue(record: IssueRecord, nowMs: number): boolean {
  if (!record.sendToDeveloper) return false
  if (record.send !== 'pending' && record.send !== 'failed') return false
  if (record.nextRetryAt && Date.parse(record.nextRetryAt) > nowMs) return false
  return true
}

export function hasGivenUp(record: IssueRecord, nowMs: number): boolean {
  return nowMs - Date.parse(record.createdAt) > GIVE_UP_AFTER_MS
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_MAGIC.length) return false
  return PNG_MAGIC.every((b, i) => bytes[i] === b)
}

/** Body of the GitHub Contents-API PUT the relay streams through unchanged. */
export function contentsBody(base64: string, message: string): string {
  return JSON.stringify({ message, content: base64 })
}

export function attachmentPath(id: string, name: string): string {
  return `issues/${yearOfId(id)}/${id}/${name}`
}

export function rawUrlFor(repo: string, branch: string, id: string, name: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${attachmentPath(id, name)}`
}

/** Markdown summary written into the exported .zip so a report reads on its own. */
export function buildIssueMarkdown(record: IssueRecord): string {
  const d = record.diagnostics
  const lines: string[] = []
  lines.push(`# ${record.title}`)
  lines.push('')
  lines.push(`_Reported ${record.createdAt} from Solodex ${d.app.version} · ${d.runtime.platform} ${d.runtime.arch} · ${d.state.game || '—'} · ${d.state.view} view${d.state.species ? ` · ${d.state.species}` : ''}_`)
  lines.push('')
  lines.push(record.description.trim() || '_No description provided._')
  lines.push('')
  if (record.screenshot) {
    lines.push('## Screenshot')
    lines.push('')
    lines.push('![screenshot](screenshot.png)')
    lines.push('')
  }
  if (record.attachments.length) {
    lines.push('## Attachments')
    lines.push('')
    for (const a of record.attachments) {
      lines.push(isImageName(a.name) ? `- ![${a.name}](${a.file}) — ${formatBytes(a.bytes)}` : `- [${a.name}](${a.file}) — ${formatBytes(a.bytes)}`)
    }
    lines.push('')
  }
  if (record.remote) {
    lines.push(`GitHub issue: ${record.remote.url}`)
    lines.push('')
  }
  lines.push('## Diagnostics')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(d, null, 2))
  lines.push('```')
  lines.push('')
  return lines.join('\n')
}

interface GhIssueJson {
  number: number
  title: string
  url: string
  state: string
  stateReason?: string | null
  labels?: { name: string }[]
  updatedAt: string
  body?: string
  comments?: { body: string; author?: { login?: string } }[]
}

/** Map `gh issue list --json …` output to the shape the panel renders. */
export function parseGhIssueList(json: string, trustedAuthor?: string): GhIssueSummary[] {
  const raw = JSON.parse(json) as GhIssueJson[]
  if (!Array.isArray(raw)) return []
  return raw.map(i => {
    const labels = (i.labels ?? []).map(l => l.name)
    const state = i.state.toLowerCase() === 'closed' ? 'closed' : 'open'
    const notes = extractNotes((i.comments ?? []).map(c => ({ body: c.body, author: c.author?.login })), trustedAuthor)
    return {
      number: i.number,
      title: i.title,
      url: i.url,
      state,
      status: mapRemoteStatus(state, i.stateReason ?? null, labels),
      labels,
      updatedAt: i.updatedAt,
      body: i.body ?? '',
      resolutionMarkdown: notes.resolution,
      needsInfoMarkdown: notes.needsInfo,
      fixMarkdown: notes.fix,
    }
  })
}

export type GhErrorCode = 'gh-missing' | 'gh-unauthenticated' | 'gh-failed'

/** Turn a failed `gh` spawn into something the panel can explain. */
export function classifyGhError(err: { code?: string | number | null; message?: string } | null, stderr: string): { code: GhErrorCode; error: string } {
  if (err && err.code === 'ENOENT') {
    return { code: 'gh-missing', error: 'GitHub CLI (gh) was not found on PATH. Install it from https://cli.github.com and run `gh auth login`.' }
  }
  const text = `${stderr} ${err?.message ?? ''}`
  if (/gh auth login|not logged in|authentication|HTTP 401|Bad credentials/i.test(text) || err?.code === 4) {
    return { code: 'gh-unauthenticated', error: 'GitHub CLI is not logged in. Run `gh auth login` in a terminal and try again.' }
  }
  const detail = stderr.trim().split('\n').slice(0, 3).join(' ').slice(0, 300) || err?.message || 'unknown error'
  return { code: 'gh-failed', error: `gh failed: ${detail}` }
}
