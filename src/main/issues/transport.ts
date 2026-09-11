// Outbound side of the issue reporter: sending a report through the relay and
// reading its status back from the public GitHub API. Kept behind an
// interface so the store/outbox logic never knows about HTTP details.
import { net } from 'electron'
import {
  type IssueRecord,
  type IssueNotes,
  type RemoteStatus,
  ISSUES_REPO,
  DEVELOPER_LOGIN,
  extractNotes,
  mapRemoteStatus,
  isImageName,
  yearOfId,
} from '../../shared/issues'
import { contentsBody, rawUrlFor } from './pure'
import { ATTACH_REPO, ATTACH_BRANCH, ISSUES_APP_KEY } from './config'

export class TransportError extends Error {
  retryable: boolean
  retryAfterSeconds?: number
  status?: number
  constructor(message: string, opts: { retryable: boolean; retryAfterSeconds?: number; status?: number }) {
    super(message)
    this.name = 'TransportError'
    this.retryable = opts.retryable
    this.retryAfterSeconds = opts.retryAfterSeconds
    this.status = opts.status
  }
}

export interface SubmitFiles {
  screenshotPng: Buffer | null
  attachments: { name: string; mime: string; data: Buffer }[]
}

export interface SubmitResult {
  number: number
  url: string
  duplicate: boolean
  screenshotUrl?: string
  attachmentUrls: Record<string, string>
}

export type StatusResult =
  | 'not-modified'
  | { kind: 'rate-limited'; resetAt?: number }
  | { kind: 'gone' }
  | { kind: 'ok'; status: RemoteStatus; url: string; etag?: string; commentsCount: number; updatedAt: string; notes: IssueNotes }

export interface IssueTransport {
  readonly enabled: boolean
  submit(record: IssueRecord, files: SubmitFiles): Promise<SubmitResult>
  fetchStatus(number: number, etag: string | undefined): Promise<StatusResult>
  health(): Promise<{ ok: boolean; disabled: boolean } | null>
}

const GITHUB_API = 'https://api.github.com'
const FILE_TIMEOUT_MS = 120_000
const JSON_TIMEOUT_MS = 30_000

interface RelayError { ok: false; error?: string; message?: string; field?: string; retryable?: boolean; retryAfterSeconds?: number }
interface RelayCreated { ok: true; number: number; url: string; duplicate?: boolean }

export class RelayGitHubTransport implements IssueTransport {
  constructor(private readonly relayUrl: string, private readonly appVersion: string) {}

  get enabled(): boolean {
    return this.relayUrl !== ''
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'User-Agent': `Solodex/${this.appVersion}`,
      'X-Solodex-Key': ISSUES_APP_KEY,
      'X-Solodex-Version': this.appVersion,
      ...extra,
    }
  }

  async health(): Promise<{ ok: boolean; disabled: boolean } | null> {
    if (!this.enabled) return null
    try {
      const res = await net.fetch(`${this.relayUrl}/v1/health`, { headers: this.headers(), signal: AbortSignal.timeout(JSON_TIMEOUT_MS) })
      if (!res.ok) return null
      const json = await res.json() as { ok?: boolean; disabled?: boolean }
      return { ok: json.ok === true, disabled: json.disabled === true }
    } catch {
      return null
    }
  }

  /** Upload one file as a ready-made Contents-API body; the relay streams it to GitHub. */
  private async putFile(id: string, name: string, data: Buffer): Promise<string> {
    const body = contentsBody(data.toString('base64'), `report ${id}: ${name}`)
    let res: Response
    try {
      res = await net.fetch(`${this.relayUrl}/v1/files/${yearOfId(id)}/${id}/${name}`, {
        method: 'PUT',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body,
        signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
      })
    } catch (err) {
      throw new TransportError(`Could not reach the relay (${(err as Error).message})`, { retryable: true })
    }
    if (res.ok) return rawUrlFor(ATTACH_REPO, ATTACH_BRANCH, id, name)
    throw await this.errorFrom(res, `Uploading ${name}`)
  }

  private async errorFrom(res: Response, what: string): Promise<TransportError> {
    let json: RelayError | null = null
    try { json = await res.json() as RelayError } catch { /* non-JSON body */ }
    const code = json?.error ?? `HTTP ${res.status}`
    const detail = json?.message ? ` — ${json.message}` : ''
    const retryable = json?.retryable ?? (res.status === 429 || res.status >= 500)
    return new TransportError(`${what} failed: ${code}${detail}`, { retryable, retryAfterSeconds: json?.retryAfterSeconds, status: res.status })
  }

  async submit(record: IssueRecord, files: SubmitFiles): Promise<SubmitResult> {
    if (!this.enabled) throw new TransportError('Relay not configured', { retryable: false })

    let screenshotUrl: string | undefined
    if (files.screenshotPng) screenshotUrl = await this.putFile(record.id, 'screenshot.png', files.screenshotPng)
    const attachmentUrls: Record<string, string> = {}
    for (const a of files.attachments) attachmentUrls[a.name] = await this.putFile(record.id, a.name, a.data)

    const payload = {
      reportId: record.id,
      title: record.title,
      description: record.description,
      diagnostics: {
        ...record.diagnostics,
        attachments: [
          ...(screenshotUrl && record.screenshot
            ? [{ kind: 'screenshot' as const, name: 'screenshot.png', mime: 'image/png', bytes: files.screenshotPng!.length, url: screenshotUrl }]
            : []),
          ...record.attachments.map(a => ({
            kind: isImageName(a.name) ? 'image' as const : 'text' as const,
            name: a.name, mime: a.mime, bytes: a.bytes, url: attachmentUrls[a.name],
          })),
        ],
      },
      screenshot: screenshotUrl && record.screenshot
        ? { url: screenshotUrl, width: record.screenshot.width, height: record.screenshot.height }
        : null,
      attachments: record.attachments.map(a => ({ name: a.name, mime: a.mime, bytes: a.bytes, url: attachmentUrls[a.name] })),
    }

    let res: Response
    try {
      res = await net.fetch(`${this.relayUrl}/v1/issues`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
      })
    } catch (err) {
      throw new TransportError(`Could not reach the relay (${(err as Error).message})`, { retryable: true })
    }
    if (!res.ok) throw await this.errorFrom(res, 'Filing the report')
    const json = await res.json() as RelayCreated
    if (!json.ok || typeof json.number !== 'number') throw new TransportError('Relay returned an unexpected response', { retryable: true })
    return { number: json.number, url: json.url, duplicate: json.duplicate === true, screenshotUrl, attachmentUrls }
  }

  private ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'User-Agent': `Solodex/${this.appVersion}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    }
  }

  /**
   * Unauthenticated read of the public issue. A 304 costs nothing against the
   * 60 req/h limit, so the caller keeps the ETag. Comments are only fetched
   * after a 200 (a new comment bumps the issue's updated_at, so a 304 on the
   * issue already implies unchanged comments).
   */
  async fetchStatus(number: number, etag: string | undefined): Promise<StatusResult> {
    const res = await net.fetch(`${GITHUB_API}/repos/${ISSUES_REPO}/issues/${number}`, {
      headers: this.ghHeaders(etag ? { 'If-None-Match': etag } : {}),
      signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
    })
    if (res.status === 304) return 'not-modified'
    if (res.status === 404 || res.status === 410) return { kind: 'gone' }
    if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      return { kind: 'rate-limited', resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : undefined }
    }
    if (!res.ok) throw new Error(`GitHub responded ${res.status}`)
    const issue = await res.json() as {
      html_url: string; state: string; state_reason?: string | null; labels?: { name: string }[]; comments?: number; updated_at: string
    }
    const labels = (issue.labels ?? []).map(l => l.name)
    const status = mapRemoteStatus(issue.state, issue.state_reason ?? null, labels)
    const commentsCount = issue.comments ?? 0
    let notes: IssueNotes = {}
    if (commentsCount > 0) {
      const cres = await net.fetch(`${GITHUB_API}/repos/${ISSUES_REPO}/issues/${number}/comments?per_page=100`, {
        headers: this.ghHeaders(),
        signal: AbortSignal.timeout(JSON_TIMEOUT_MS),
      })
      if (cres.ok) {
        const comments = await cres.json() as { body?: string; user?: { login?: string } }[]
        notes = extractNotes(comments.map(c => ({ body: c.body ?? '', author: c.user?.login })), DEVELOPER_LOGIN)
      }
    }
    return { kind: 'ok', status, url: issue.html_url, etag: res.headers.get('etag') ?? undefined, commentsCount, updatedAt: issue.updated_at, notes }
  }
}
