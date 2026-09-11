// Cloudflare Worker that files Solodex bug reports as GitHub issues.
//
//   PUT  /v1/files/<yyyy>/<reportId>/<name>   body = Contents-API JSON built by the app,
//                                             passed to GitHub without parsing
//   POST /v1/issues                           small JSON → creates the issue
//   GET  /v1/health
//
// Designed for the free plan: the Worker never parses a file body, so the
// CPU cost per request stays in the low milliseconds. See relay/README.md.
import { LIMITS, MARK, YEAR_RE, REPORT_ID_RE, isAllowedName, attachmentPath, buildIssueBody } from './format'
import { parseCreate, ValidationError } from './validate'
import { GitHubError, createIssue, getContents, putContentsRaw, putContents, decodeContent } from './github'

interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  GH_TOKEN_ISSUES: string
  GH_TOKEN_ATTACH: string
  APP_KEY: string
  ISSUES_REPO: string
  ATTACH_REPO: string
  ATTACH_BRANCH: string
  DISABLED?: string
  REPORT_RL?: RateLimit
  GLOBAL_RL?: RateLimit
}

type ErrorCode =
  | 'bad_request' | 'unsupported_type' | 'unauthorized' | 'not_found' | 'too_large' | 'rate_limited'
  | 'github_error' | 'github_auth' | 'github_rate_limited' | 'disabled' | 'internal'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-solodex-key, x-solodex-version',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

function fail(code: ErrorCode, status: number, extra: Record<string, unknown> = {}): Response {
  const retryable = ['rate_limited', 'github_error', 'github_auth', 'github_rate_limited', 'disabled', 'internal'].includes(code)
  return json({ ok: false, error: code, retryable, ...extra }, status)
}

/** Constant-time string comparison (no timingSafeEqual on all runtimes). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }))
}

async function gate(request: Request, env: Env): Promise<Response | null> {
  if (env.DISABLED === '1') return fail('disabled', 503, { retryAfterSeconds: 86400 })
  if (!env.APP_KEY || !safeEqual(request.headers.get('x-solodex-key') ?? '', env.APP_KEY)) return fail('unauthorized', 401)
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  if (env.REPORT_RL && !(await env.REPORT_RL.limit({ key: ip })).success) return fail('rate_limited', 429, { retryAfterSeconds: 60 })
  if (env.GLOBAL_RL && !(await env.GLOBAL_RL.limit({ key: 'global' })).success) return fail('rate_limited', 429, { retryAfterSeconds: 300 })
  return null
}

function githubFailure(err: unknown, reportId: string | null): Response {
  if (err instanceof GitHubError) {
    log({ ev: 'github_error', status: err.status, path: err.path, body: err.body.slice(0, 300), reportId })
    if (err.status === 401) return fail('github_auth', 502, { retryAfterSeconds: 3600, message: 'GitHub rejected the relay token' })
    if (err.retryAfter) return fail('github_rate_limited', 502, { retryAfterSeconds: err.retryAfter })
    return fail('github_error', 502, { retryAfterSeconds: 600, message: `GitHub responded ${err.status}` })
  }
  log({ ev: 'internal', message: String(err), reportId })
  return fail('internal', 500, { retryAfterSeconds: 600 })
}

async function handleFile(request: Request, env: Env, rest: string, fetchImpl: typeof fetch): Promise<Response> {
  const t0 = Date.now()
  const parts = rest.split('/')
  if (parts.length !== 3) return fail('not_found', 404)
  const [year, reportId, name] = parts
  if (!YEAR_RE.test(year) || !REPORT_ID_RE.test(reportId) || reportId.slice(0, 4) !== year || !isAllowedName(name)) {
    return fail('bad_request', 400, { field: 'path', message: 'unexpected file path' })
  }
  const length = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(length) || length <= 0) return fail('bad_request', 400, { field: 'body', message: 'Content-Length required' })
  if (length > LIMITS.fileBodyBytes) return fail('too_large', 413)
  // Buffer as text (no parsing) so GitHub retries can resend it.
  const body = await request.text()
  if (!body.startsWith('{')) return fail('bad_request', 400, { field: 'body', message: 'expected a Contents-API JSON body' })
  const path = attachmentPath(year, reportId, name)
  try {
    const result = await putContentsRaw(env.GH_TOKEN_ATTACH, env.ATTACH_REPO, path, body, { fetch: fetchImpl })
    log({ ev: 'file', reportId, name, bytes: length, result, ms: Date.now() - t0 })
    return json({ ok: true, path, result }, result === 'created' ? 201 : 200)
  } catch (err) {
    return githubFailure(err, reportId)
  }
}

async function handleCreate(request: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> {
  const t0 = Date.now()
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > LIMITS.createBytes) return fail('too_large', 413)
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return fail('bad_request', 400, { field: 'body', message: 'invalid JSON' })
  }
  let input
  try {
    input = parseCreate(raw, { attachRepo: env.ATTACH_REPO, attachBranch: env.ATTACH_BRANCH })
  } catch (err) {
    if (err instanceof ValidationError) return fail(err.code, 400, { field: err.field, message: err.message })
    throw err
  }
  const year = input.reportId.slice(0, 4)
  const markerPath = attachmentPath(year, input.reportId, 'report.json')
  const ghOpts = { fetch: fetchImpl }
  try {
    // Idempotency: the app retries on timeouts; a marker in the attachments
    // repo tells us the issue already exists.
    const existing = await getContents(env.GH_TOKEN_ATTACH, env.ATTACH_REPO, markerPath, env.ATTACH_BRANCH, ghOpts)
    if (existing) {
      try {
        const marker = JSON.parse(decodeContent(existing)) as { number: number; url: string }
        if (typeof marker.number === 'number') {
          log({ ev: 'duplicate', reportId: input.reportId, number: marker.number, ms: Date.now() - t0 })
          return json({ ok: true, number: marker.number, url: marker.url, reportId: input.reportId, duplicate: true }, 200)
        }
      } catch {
        // unreadable marker: file a new issue
      }
    }
    const body = buildIssueBody(input, new Date().toISOString())
    const created = await createIssue(env.GH_TOKEN_ISSUES, env.ISSUES_REPO, input.title, body, ['status:open', 'from:app'], ghOpts)
    const marker = btoa(JSON.stringify({ number: created.number, url: created.html_url, createdAt: new Date().toISOString() }))
    try {
      await putContents(env.GH_TOKEN_ATTACH, env.ATTACH_REPO, markerPath, marker, `report ${input.reportId}: issue #${created.number}`, ghOpts)
    } catch (err) {
      log({ ev: 'marker_failed', reportId: input.reportId, message: String(err) })
    }
    log({ ev: 'report', reportId: input.reportId, number: created.number, attachments: input.attachments.length, screenshot: Boolean(input.screenshot), ms: Date.now() - t0 })
    return json({ ok: true, number: created.number, url: created.html_url, reportId: input.reportId, duplicate: false }, 201)
  } catch (err) {
    return githubFailure(err, input.reportId)
  }
}

export async function handleRequest(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method === 'GET' && url.pathname === '/v1/health') {
    return json({ ok: true, service: 'solodex-issues', disabled: env.DISABLED === '1', limits: LIMITS, marker: MARK.report('<id>') }, 200)
  }
  if (request.method === 'PUT' && url.pathname.startsWith('/v1/files/')) {
    const gated = await gate(request, env)
    if (gated) return gated
    return handleFile(request, env, url.pathname.slice('/v1/files/'.length), fetchImpl)
  }
  if (request.method === 'POST' && url.pathname === '/v1/issues') {
    const gated = await gate(request, env)
    if (gated) return gated
    return handleCreate(request, env, fetchImpl)
  }
  return fail('not_found', 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (err) {
      log({ ev: 'unhandled', message: String(err) })
      return fail('internal', 500, { retryAfterSeconds: 600 })
    }
  },
}
