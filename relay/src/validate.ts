// Validation of the small `POST /v1/issues` payload. Everything the app sends
// is untrusted; sizes and counts are capped here and the attachment URLs must
// point into the attachments repo under this report's own folder.
import { LIMITS, REPORT_ID_RE, isAllowedName, attachmentPath, rawUrl, type CreateInput, type CreateAttachment } from './format'

export class ValidationError extends Error {
  constructor(public code: 'bad_request' | 'unsupported_type', public field: string, message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

interface RepoConfig {
  attachRepo: string
  attachBranch: string
}

// Control characters other than tab and newline.
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}]`, 'g')

function str(v: unknown, field: string, max: number, required: boolean): string {
  if (v === undefined || v === null) {
    if (required) throw new ValidationError('bad_request', field, `${field} is required`)
    return ''
  }
  if (typeof v !== 'string') throw new ValidationError('bad_request', field, `${field} must be a string`)
  const cleaned = v.replace(/\r\n/g, '\n').replace(CONTROL_CHARS, '')
  if (cleaned.length > max) throw new ValidationError('bad_request', field, `${field} is longer than ${max} characters`)
  return cleaned
}

export function parseCreate(raw: unknown, repo: RepoConfig): CreateInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ValidationError('bad_request', 'body', 'body must be a JSON object')
  const o = raw as Record<string, unknown>

  const reportId = str(o.reportId, 'reportId', 40, true)
  if (!REPORT_ID_RE.test(reportId)) throw new ValidationError('bad_request', 'reportId', 'reportId has an unexpected format')
  const year = reportId.slice(0, 4)
  if (!/^\d{4}$/.test(year)) throw new ValidationError('bad_request', 'reportId', 'reportId must start with the year')

  const title = str(o.title, 'title', LIMITS.title, true).replace(/\s+/g, ' ').trim()
  if (!title) throw new ValidationError('bad_request', 'title', 'title is required')
  const description = str(o.description, 'description', LIMITS.description, false)

  const diagnostics = o.diagnostics
  if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) throw new ValidationError('bad_request', 'diagnostics', 'diagnostics must be an object')
  if (JSON.stringify(diagnostics).length > LIMITS.diagnosticsBytes) throw new ValidationError('bad_request', 'diagnostics', `diagnostics is larger than ${LIMITS.diagnosticsBytes} bytes`)

  const expectUrl = (name: string, field: string, url: unknown): string => {
    if (typeof url !== 'string') throw new ValidationError('bad_request', field, `${field}.url must be a string`)
    const expected = rawUrl(repo.attachRepo, repo.attachBranch, attachmentPath(year, reportId, name))
    if (url !== expected) throw new ValidationError('bad_request', field, `${field}.url must be the report's own attachment URL`)
    return url
  }

  let screenshot: CreateInput['screenshot'] = null
  if (o.screenshot !== undefined && o.screenshot !== null) {
    const s = o.screenshot as Record<string, unknown>
    if (typeof s !== 'object') throw new ValidationError('bad_request', 'screenshot', 'screenshot must be an object')
    const width = Number(s.width), height = Number(s.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 20000 || height > 20000) {
      throw new ValidationError('bad_request', 'screenshot', 'screenshot size is invalid')
    }
    screenshot = { url: expectUrl('screenshot.png', 'screenshot', s.url), width: Math.round(width), height: Math.round(height) }
  }

  const rawAttachments = o.attachments ?? []
  if (!Array.isArray(rawAttachments)) throw new ValidationError('bad_request', 'attachments', 'attachments must be an array')
  if (rawAttachments.length > LIMITS.attachments) throw new ValidationError('bad_request', 'attachments', `up to ${LIMITS.attachments} attachments are allowed`)
  const attachments: CreateAttachment[] = []
  const seen = new Set<string>()
  let total = 0
  rawAttachments.forEach((a, i) => {
    const field = `attachments[${i}]`
    if (!a || typeof a !== 'object') throw new ValidationError('bad_request', field, `${field} must be an object`)
    const r = a as Record<string, unknown>
    const name = str(r.name, `${field}.name`, 100, true)
    if (!isAllowedName(name)) throw new ValidationError('unsupported_type', `${field}.name`, `${name} is not an allowed file name/type`)
    if (name === 'screenshot.png' || name === 'report.json' || seen.has(name.toLowerCase())) throw new ValidationError('bad_request', `${field}.name`, `duplicate attachment name ${name}`)
    seen.add(name.toLowerCase())
    const bytes = Number(r.bytes)
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > LIMITS.fileBytes) throw new ValidationError('bad_request', `${field}.bytes`, `${name} is larger than ${LIMITS.fileBytes} bytes`)
    total += bytes
    const mime = str(r.mime, `${field}.mime`, 100, false) || 'application/octet-stream'
    attachments.push({ name, mime, bytes: Math.round(bytes), url: expectUrl(name, field, r.url) })
  })
  if (total > LIMITS.totalBytes) throw new ValidationError('bad_request', 'attachments', `attachments total more than ${LIMITS.totalBytes} bytes`)

  return { reportId, title, description, diagnostics: diagnostics as Record<string, unknown>, screenshot, attachments }
}
