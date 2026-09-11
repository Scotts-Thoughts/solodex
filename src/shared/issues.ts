// Types and pure helpers for the in-app bug reporter ("Issues"), shared by the
// main process, the renderer and the helper scripts. Nothing in here may
// import Electron, Node or DOM APIs — both tsconfigs include this directory.
// See docs/issues/README.md for the data contracts these types implement.

export const ISSUES_REPO = 'Scotts-Thoughts/solodex'
/** GitHub login whose comments carry the trusted note markers. */
export const DEVELOPER_LOGIN = 'Scotts-Thoughts'

export type IssueSendState = 'sent' | 'pending' | 'failed' | 'failed-permanent' | 'local-only'
export type RemoteStatus = 'open' | 'fix-applied' | 'needs-info' | 'decision' | 'resolved' | 'not-planned'
export type IssueSource = 'button' | 'shortcut' | 'menu' | 'error-boundary' | 'import'

export interface RecentError {
  at: string
  source: 'renderer' | 'console'
  message: string
  stack?: string
}

/** The part of the diagnostics block the renderer can fill in. */
export interface RendererDiagnostics {
  source: IssueSource
  window: { width: number; height: number; scaleFactor: number }
  state: { view: string; game: string; species: string | null; trainer?: string | null }
  recentErrors: RecentError[]
}

/** The JSON block posted inside the GitHub issue body (`solodex-report/1`). */
export interface IssueDiagnostics {
  schema: 'solodex-report/1'
  reportId: string
  createdAt: string
  receivedAt?: string
  source: IssueSource
  app: { version: string; packaged: boolean }
  runtime: { electron: string; chrome: string; node: string; platform: string; arch: string; osRelease: string; locale: string }
  window: { width: number; height: number; scaleFactor: number; maximized: boolean }
  state: { view: string; game: string; species: string | null; trainer?: string | null }
  settings?: Record<string, boolean>
  recentErrors: RecentError[]
  attachments?: { kind: 'screenshot' | 'image' | 'text'; name: string; mime: string; bytes: number; url: string }[]
}

export interface IssueAttachmentMeta {
  name: string
  mime: string
  bytes: number
  /** Path relative to the issue folder, e.g. `attachments/photo.jpg`. */
  file: string
  /** Raw URL in the attachments repo once uploaded. */
  url?: string
}

export interface IssueRemote {
  number: number
  url: string
  status: RemoteStatus
  resolutionMarkdown?: string
  needsInfoMarkdown?: string
  fixMarkdown?: string
  etag?: string
  commentsCount?: number
  lastCheckedAt: string
  remoteUpdatedAt?: string
}

export interface IssueRecord {
  schema: 1
  id: string
  createdAt: string
  title: string
  description: string
  diagnostics: IssueDiagnostics
  screenshot: { file: 'screenshot.png'; original: 'screenshot-original.png' | null; width: number; height: number } | null
  attachments: IssueAttachmentMeta[]
  sendToDeveloper: boolean
  send: IssueSendState
  sendAttempts: number
  lastSendAttemptAt?: string
  nextRetryAt?: string
  sendError?: string
  remote?: IssueRemote
}

/** What the renderer hands to `issue-create`. Binary data travels as Uint8Array. */
export interface NewIssueInput {
  title: string
  description: string
  diagnostics: RendererDiagnostics
  sendToDeveloper: boolean
  captureId: string | null
  screenshotPng: Uint8Array | null
  screenshotSize: { width: number; height: number } | null
  attachments: { name: string; mime: string; data: Uint8Array }[]
}

/** Summary of a GitHub issue as listed by `gh` in Developer Mode. */
export interface GhIssueSummary {
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  status: RemoteStatus
  labels: string[]
  updatedAt: string
  body: string
  resolutionMarkdown?: string
  needsInfoMarkdown?: string
  fixMarkdown?: string
}

export type DevResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'not-developer' | 'gh-missing' | 'gh-unauthenticated' | 'gh-failed'; error: string }

export const ISSUE_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxTitle: 120,
  maxDescription: 10_000,
  maxDiagnosticsBytes: 32 * 1024,
  maxRecentErrors: 10,
} as const

export const ACCEPTED_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
}

export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

/** Names an attachment may not use — they are taken by the report itself. */
export const RESERVED_ATTACHMENT_NAMES = new Set(['screenshot.png', 'screenshot-original.png', 'report.json', 'issue.json'])

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** MIME type by extension; `File.type` is unreliable (empty for .log/.md on Windows). */
export function mimeFromName(name: string): string | null {
  return ACCEPTED_EXTENSIONS[extensionOf(name)] ?? null
}

export function isImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(name))
}

/**
 * URL- and filesystem-safe attachment name: basename only, `[A-Za-z0-9._-]`
 * characters, stem capped at 64 chars, lowercase extension. Stricter than the
 * export filename sanitiser in main because the name becomes part of a
 * raw.githubusercontent.com URL.
 */
export function sanitizeAttachmentName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  let stem = dot > 0 ? base.slice(0, dot) : base
  let ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
  stem = stem.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_{2,}/g, '_').replace(/^[._-]+|[._-]+$/g, '')
  ext = ext.replace(/[^a-z0-9]+/g, '')
  if (stem.length > 64) stem = stem.slice(0, 64).replace(/[._-]+$/g, '')
  if (!stem) stem = 'file'
  return ext ? `${stem}.${ext}` : stem
}

/** `x.txt` → `x-2.txt` → `x-3.txt` until the name is free (case-insensitive). */
export function dedupeAttachmentName(name: string, taken: Iterable<string>): string {
  const used = new Set<string>()
  for (const t of taken) used.add(t.toLowerCase())
  for (const r of RESERVED_ATTACHMENT_NAMES) used.add(r)
  if (!used.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}

/** First problem with an attachment set, or null when it is acceptable. */
export function validateAttachmentSet(files: { name: string; bytes: number }[]): string | null {
  if (files.length > ISSUE_LIMITS.maxFiles) return `Up to ${ISSUE_LIMITS.maxFiles} files can be attached`
  let total = 0
  for (const f of files) {
    if (!mimeFromName(f.name)) return `${f.name}: unsupported file type`
    if (f.bytes > ISSUE_LIMITS.maxFileBytes) return `${f.name} is larger than ${formatBytes(ISSUE_LIMITS.maxFileBytes)}`
    total += f.bytes
  }
  if (total > ISSUE_LIMITS.maxTotalBytes) return `Attachments total more than ${formatBytes(ISSUE_LIMITS.maxTotalBytes)}`
  return null
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'

/** `YYYYMMDD-HHmmss-xxxxxxxx` (UTC) — the local folder name and the remote reportId. */
export function makeLocalId(now: Date = new Date(), rand: () => number = Math.random): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  let suffix = ''
  for (let i = 0; i < 8; i++) suffix += BASE36[Math.floor(rand() * 36) % 36]
  return `${stamp}-${suffix}`
}

export const LOCAL_ID_RE = /^\d{8}-\d{6}-[0-9a-z]{8}$/

/** Year segment of the attachment path, taken from the id so it never drifts. */
export function yearOfId(id: string): string {
  return id.slice(0, 4)
}

export const STATUS_LABELS = {
  open: 'status:open',
  fixApplied: 'status:fix-applied',
  needsInfo: 'status:needs-info',
  decision: 'status:decision',
  fromApp: 'from:app',
} as const

/** One status derivation for the app, the panel and the fetch script. */
export function mapRemoteStatus(
  state: string,
  stateReason: string | null | undefined,
  labels: string[]
): RemoteStatus {
  // REST spells it `not_planned`; gh's GraphQL output spells it `NOT_PLANNED`.
  if (state.toLowerCase() === 'closed') return (stateReason ?? '').toLowerCase() === 'not_planned' ? 'not-planned' : 'resolved'
  const has = (l: string) => labels.some(x => x.toLowerCase() === l)
  if (has(STATUS_LABELS.fixApplied)) return 'fix-applied'
  if (has(STATUS_LABELS.needsInfo)) return 'needs-info'
  if (has(STATUS_LABELS.decision)) return 'decision'
  return 'open'
}

export const STATUS_TEXT: Record<RemoteStatus, string> = {
  'open': 'Open',
  'fix-applied': 'Fix applied',
  'needs-info': 'Needs more information',
  'decision': 'Under review',
  'resolved': 'Resolved',
  'not-planned': 'Closed (not planned)',
}

export const NOTE_MARKERS = {
  fix: '<!-- solodex:fix -->',
  resolution: '<!-- solodex:resolution -->',
  needsInfo: '<!-- solodex:needs-info -->',
  note: '<!-- solodex:note -->',
} as const

export interface IssueNotes {
  fix?: string
  resolution?: string
  needsInfo?: string
  note?: string
}

export interface NoteComment {
  body: string
  author?: string | null
}

/**
 * Pick the latest marker comment of each kind. Only comments by the trusted
 * author count, so a stranger cannot make the app display a fake note. The
 * marker line itself is stripped from the returned markdown.
 */
export function extractNotes(comments: NoteComment[], trustedAuthor: string = DEVELOPER_LOGIN): IssueNotes {
  const notes: IssueNotes = {}
  const trusted = trustedAuthor.toLowerCase()
  for (const c of comments) {
    if ((c.author ?? '').toLowerCase() !== trusted) continue
    const body = c.body.replace(/\r\n/g, '\n').trim()
    for (const [key, marker] of Object.entries(NOTE_MARKERS) as [keyof IssueNotes, string][]) {
      if (body.startsWith(marker)) {
        notes[key] = body.slice(marker.length).trim()
        break
      }
    }
  }
  return notes
}

/** Replace a home directory (any slash style) with `<home>` in stack traces. */
export function redactHome(text: string, home: string): string {
  if (!home) return text
  const variants = new Set([home, home.replace(/\\/g, '/'), home.replace(/\//g, '\\')])
  let out = text
  for (const v of variants) {
    if (!v) continue
    out = out.split(v).join('<home>')
  }
  return out
}

/** Keep the newest `max` entries (newest last). */
export function pushBounded<T>(list: T[], item: T, max: number): T[] {
  const next = list.length >= max ? list.slice(list.length - max + 1) : list.slice()
  next.push(item)
  return next
}
