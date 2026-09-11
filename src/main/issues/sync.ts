// Outbox (send / retry with backoff) and status refresh (GitHub polling with
// ETags) for the local report store. One instance lives in the main process;
// every mutation it makes is announced through `notify` so an open Issues
// panel re-reads the store.
import type { IssueRecord } from '../../shared/issues'
import { listIssues, getIssue, patchIssue, readIssueFile } from './store'
import { TransportError, type IssueTransport, type SubmitFiles } from './transport'
import { isSendDue, hasGivenUp, nextRetryDelayMs, shouldRefresh } from './pure'

const GLOBAL_REFRESH_GUARD_MS = 60_000

export class IssueSync {
  private refreshing: Promise<{ checked: number; changed: number }> | null = null
  private sending: Promise<void> | null = null
  private lastRefreshAt = 0
  private rateLimitedUntil = 0

  constructor(
    private readonly transport: IssueTransport,
    private readonly notify: (ids: string[]) => void
  ) {}

  private loadFiles(record: IssueRecord): SubmitFiles {
    const screenshotPng = record.screenshot ? readIssueFile(record.id, record.screenshot.file) : null
    const attachments = record.attachments.flatMap(a => {
      const data = readIssueFile(record.id, a.file)
      return data ? [{ name: a.name, mime: a.mime, data }] : []
    })
    return { screenshotPng, attachments }
  }

  /** One send attempt for one report; the record ends as sent / failed / failed-permanent. */
  async sendNow(id: string): Promise<IssueRecord> {
    const record = getIssue(id)
    if (!record) throw new Error(`Report ${id} no longer exists`)
    if (record.send === 'sent' || !record.sendToDeveloper) return record

    const attemptedAt = new Date().toISOString()
    if (!this.transport.enabled) {
      return patchIssue(id, r => ({
        ...r, send: 'failed-permanent', lastSendAttemptAt: attemptedAt,
        sendError: 'Sending is not set up in this build (no relay configured). You can export the report instead.',
      }))
    }

    try {
      const result = await this.transport.submit(record, this.loadFiles(record))
      const updated = await patchIssue(id, r => ({
        ...r,
        send: 'sent',
        sendAttempts: r.sendAttempts + 1,
        lastSendAttemptAt: attemptedAt,
        nextRetryAt: undefined,
        sendError: undefined,
        attachments: r.attachments.map(a => ({ ...a, url: result.attachmentUrls[a.name] ?? a.url })),
        remote: { number: result.number, url: result.url, status: 'open', lastCheckedAt: attemptedAt },
      }))
      this.notify([id])
      return updated
    } catch (err) {
      const attempts = record.sendAttempts + 1
      const retryable = err instanceof TransportError ? err.retryable : true
      const retryAfter = err instanceof TransportError && err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : 0
      const delay = Math.max(retryAfter, nextRetryDelayMs(attempts))
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[Solodex] issues: send of ${id} failed (attempt ${attempts}): ${message}`)
      const updated = await patchIssue(id, r => ({
        ...r,
        send: retryable && !hasGivenUp(r, Date.now()) ? 'failed' : 'failed-permanent',
        sendAttempts: attempts,
        lastSendAttemptAt: attemptedAt,
        nextRetryAt: new Date(Date.now() + delay).toISOString(),
        sendError: message,
      }))
      this.notify([id])
      return updated
    }
  }

  /** Retry every queued report that is due. Runs one at a time. */
  retryPendingSends(reason: string): Promise<void> {
    if (this.sending) return this.sending
    this.sending = (async () => {
      const now = Date.now()
      const due = listIssues().filter(r => isSendDue(r, now))
      if (due.length === 0) return
      const health = await this.transport.health()
      if (health?.disabled) {
        console.warn(`[Solodex] issues: relay is disabled, skipping ${due.length} queued report(s) (${reason})`)
        return
      }
      for (const r of due) {
        try { await this.sendNow(r.id) } catch (err) { console.warn('[Solodex] issues: retry failed:', err) }
      }
    })().finally(() => { this.sending = null })
    return this.sending
  }

  /** Re-read one issue's status from GitHub (forced: ignores the 10-minute throttle). */
  async refreshOne(id: string, force = false): Promise<IssueRecord> {
    const record = getIssue(id)
    if (!record) throw new Error(`Report ${id} no longer exists`)
    if (!record.remote || !shouldRefresh(record.remote, Date.now(), force)) return record
    if (!force && Date.now() < this.rateLimitedUntil) return record
    const result = await this.transport.fetchStatus(record.remote.number, record.remote.etag)
    const checkedAt = new Date().toISOString()
    if (result === 'not-modified') {
      return patchIssue(id, r => (r.remote ? { ...r, remote: { ...r.remote, lastCheckedAt: checkedAt } } : r))
    }
    if (result.kind === 'rate-limited') {
      this.rateLimitedUntil = result.resetAt ?? Date.now() + 15 * 60_000
      return record
    }
    if (result.kind === 'gone') {
      return patchIssue(id, r => (r.remote ? { ...r, remote: { ...r.remote, lastCheckedAt: checkedAt } } : r))
    }
    const updated = await patchIssue(id, r => (r.remote ? {
      ...r,
      remote: {
        ...r.remote,
        status: result.status,
        url: result.url,
        etag: result.etag,
        commentsCount: result.commentsCount,
        remoteUpdatedAt: result.updatedAt,
        lastCheckedAt: checkedAt,
        resolutionMarkdown: result.notes.resolution ?? r.remote.resolutionMarkdown,
        needsInfoMarkdown: result.notes.needsInfo ?? r.remote.needsInfoMarkdown,
        fixMarkdown: result.notes.fix ?? r.remote.fixMarkdown,
      },
    } : r))
    const changed = updated.remote?.status !== record.remote.status
      || updated.remote?.resolutionMarkdown !== record.remote.resolutionMarkdown
      || updated.remote?.needsInfoMarkdown !== record.remote.needsInfoMarkdown
    if (changed) this.notify([id])
    return updated
  }

  /** Refresh every unresolved sent report, at most once a minute overall. */
  refreshStatuses(reason: string, force = false): Promise<{ checked: number; changed: number }> {
    if (this.refreshing) return this.refreshing
    if (!force && Date.now() - this.lastRefreshAt < GLOBAL_REFRESH_GUARD_MS) return Promise.resolve({ checked: 0, changed: 0 })
    this.lastRefreshAt = Date.now()
    this.refreshing = (async () => {
      let checked = 0
      let changed = 0
      const now = Date.now()
      for (const r of listIssues()) {
        if (!r.remote || !shouldRefresh(r.remote, now, force)) continue
        if (Date.now() < this.rateLimitedUntil) break
        try {
          const before = r.remote.status
          const after = await this.refreshOne(r.id, force)
          checked++
          if (after.remote?.status !== before) changed++
        } catch (err) {
          console.warn(`[Solodex] issues: status refresh for ${r.id} failed (${reason}):`, err)
        }
      }
      return { checked, changed }
    })().finally(() => { this.refreshing = null })
    return this.refreshing
  }
}
