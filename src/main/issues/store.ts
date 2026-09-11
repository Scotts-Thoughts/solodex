// On-disk store for bug reports: one folder per report under
// `<userData>/issues/<id>/` holding issue.json, the screenshots and the
// attachments. Every machine has this store — for end users it is "My
// reports", for the developer it is also the outbox that feeds the relay.
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import {
  type IssueRecord,
  type IssueDiagnostics,
  type NewIssueInput,
  ISSUE_LIMITS,
  LOCAL_ID_RE,
  makeLocalId,
  mimeFromName,
  sanitizeAttachmentName,
  dedupeAttachmentName,
  validateAttachmentSet,
} from '../../shared/issues'
import { isPng } from './pure'

export function issuesRoot(): string {
  return path.join(app.getPath('userData'), 'issues')
}

export function issueDir(id: string): string {
  if (!LOCAL_ID_RE.test(id)) throw new Error(`Invalid issue id: ${id}`)
  return path.join(issuesRoot(), id)
}

function recordPath(id: string): string {
  return path.join(issueDir(id), 'issue.json')
}

/** Write issue.json atomically (temp file + rename) so a crash never leaves it half-written. */
function writeRecord(record: IssueRecord): void {
  const target = recordPath(record.id)
  const tmp = `${target}.new`
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2))
  fs.renameSync(tmp, target)
}

export function getIssue(id: string): IssueRecord | null {
  try {
    const raw = fs.readFileSync(recordPath(id), 'utf-8')
    const rec = JSON.parse(raw) as IssueRecord
    return rec && rec.schema === 1 && rec.id === id ? rec : null
  } catch {
    return null
  }
}

export function listIssues(): IssueRecord[] {
  const root = issuesRoot()
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const out: IssueRecord[] = []
  for (const e of entries) {
    if (!e.isDirectory() || !LOCAL_ID_RE.test(e.name)) continue
    const rec = getIssue(e.name)
    if (rec) out.push(rec)
    else console.warn(`[Solodex] issues: skipping unreadable report ${e.name}`)
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return out
}

// Patches are serialised per id so the outbox, the status refresh and the
// Developer Mode actions can never interleave their read-modify-write cycles.
const chains = new Map<string, Promise<unknown>>()

export function patchIssue(id: string, fn: (record: IssueRecord) => IssueRecord | void): Promise<IssueRecord> {
  const prev = chains.get(id) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(() => {
    const current = getIssue(id)
    if (!current) throw new Error(`Report ${id} no longer exists`)
    const updated = fn(current) ?? current
    writeRecord(updated)
    return updated
  })
  chains.set(id, next)
  next.finally(() => { if (chains.get(id) === next) chains.delete(id) })
  return next
}

export function readScreenshotDataUrl(id: string): string | null {
  try {
    const png = fs.readFileSync(path.join(issueDir(id), 'screenshot.png'))
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

export function readIssueFile(id: string, file: string): Buffer | null {
  try {
    return fs.readFileSync(resolveIssuePath(id, file))
  } catch {
    return null
  }
}

/** Resolve a path inside the report folder, refusing anything that escapes it. */
export function resolveIssuePath(id: string, file: string): string {
  const dir = issueDir(id)
  const resolved = path.resolve(dir, file)
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) throw new Error('Invalid attachment path')
  return resolved
}

export function deleteIssue(id: string): boolean {
  try {
    fs.rmSync(issueDir(id), { recursive: true, force: true })
    return true
  } catch (err) {
    console.error('[Solodex] issues: delete failed:', err)
    return false
  }
}

export interface ServerDiagnostics {
  app: IssueDiagnostics['app']
  runtime: IssueDiagnostics['runtime']
  maximized: boolean
  settings?: Record<string, boolean>
}

/**
 * Validate the renderer's input, write the files and the record. The record
 * starts as `pending` (or `local-only`); the caller attempts the send.
 */
export function createIssue(input: NewIssueInput, server: ServerDiagnostics, originalPng: Buffer | null): IssueRecord {
  const title = input.title.trim().slice(0, ISSUE_LIMITS.maxTitle)
  if (!title) throw new Error('A title is required')
  const description = input.description.replace(/\r\n/g, '\n').slice(0, ISSUE_LIMITS.maxDescription)

  // Re-sanitise and re-validate — the renderer already did, but it is the untrusted side.
  const attachments = input.attachments.map(a => ({
    name: sanitizeAttachmentName(a.name),
    data: Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength),
  }))
  const error = validateAttachmentSet(attachments.map(a => ({ name: a.name, bytes: a.data.length })))
  if (error) throw new Error(error)
  const taken: string[] = []
  for (const a of attachments) {
    a.name = dedupeAttachmentName(a.name, taken)
    taken.push(a.name)
  }

  const screenshotPng = input.screenshotPng
    ? Buffer.from(input.screenshotPng.buffer, input.screenshotPng.byteOffset, input.screenshotPng.byteLength)
    : null
  if (screenshotPng && !isPng(screenshotPng)) throw new Error('Screenshot is not a PNG')

  let id = makeLocalId()
  while (fs.existsSync(issueDir(id))) id = makeLocalId()
  const dir = issueDir(id)
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true })

  if (screenshotPng) fs.writeFileSync(path.join(dir, 'screenshot.png'), screenshotPng)
  const hasOriginal = Boolean(screenshotPng && originalPng)
  if (hasOriginal) fs.writeFileSync(path.join(dir, 'screenshot-original.png'), originalPng!)
  for (const a of attachments) fs.writeFileSync(path.join(dir, 'attachments', a.name), a.data)

  const createdAt = new Date().toISOString()
  const d = input.diagnostics
  const diagnostics: IssueDiagnostics = {
    schema: 'solodex-report/1',
    reportId: id,
    createdAt,
    source: d.source,
    app: server.app,
    runtime: server.runtime,
    window: { ...d.window, maximized: server.maximized },
    state: d.state,
    settings: server.settings,
    recentErrors: d.recentErrors.slice(-ISSUE_LIMITS.maxRecentErrors),
  }

  const record: IssueRecord = {
    schema: 1,
    id,
    createdAt,
    title,
    description,
    diagnostics,
    screenshot: screenshotPng && input.screenshotSize
      ? { file: 'screenshot.png', original: hasOriginal ? 'screenshot-original.png' : null, width: input.screenshotSize.width, height: input.screenshotSize.height }
      : null,
    attachments: attachments.map(a => ({
      name: a.name,
      mime: mimeFromName(a.name) ?? 'application/octet-stream',
      bytes: a.data.length,
      file: `attachments/${a.name}`,
    })),
    sendToDeveloper: input.sendToDeveloper,
    send: input.sendToDeveloper ? 'pending' : 'local-only',
    sendAttempts: 0,
  }
  writeRecord(record)
  return record
}
