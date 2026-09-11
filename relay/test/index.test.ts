import { describe, it, expect } from 'vitest'
import { handleRequest, type Env } from '../src/index'

const id = '20260911-093012-abcdefgh'
const attachUrl = (name: string) => `https://raw.githubusercontent.com/o/a/main/issues/2026/${id}/${name}`

function env(over: Partial<Env> = {}): Env {
  return {
    GH_TOKEN_ISSUES: 'tok-issues',
    GH_TOKEN_ATTACH: 'tok-attach',
    APP_KEY: 'key',
    ISSUES_REPO: 'o/solodex',
    ATTACH_REPO: 'o/a',
    ATTACH_BRANCH: 'main',
    ...over,
  }
}

interface Call { method: string; url: string; body: string | null; auth: string | null }

/** Fake GitHub: records calls and answers per path. */
function fakeGitHub(opts: { markerExists?: boolean; putStatus?: number; putBody?: string; failCreateOnce?: boolean } = {}) {
  const calls: Call[] = []
  let createAttempts = 0
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const headers = init?.headers as Record<string, string> | undefined
    calls.push({ method, url, body: typeof init?.body === 'string' ? init.body : null, auth: headers?.Authorization ?? null })
    if (method === 'GET' && url.includes('/contents/') && url.includes('report.json')) {
      if (!opts.markerExists) return new Response('{"message":"Not Found"}', { status: 404 })
      const content = btoa(JSON.stringify({ number: 7, url: 'https://github.com/o/solodex/issues/7' }))
      return new Response(JSON.stringify({ sha: 'x', encoding: 'base64', content }), { status: 200 })
    }
    if (method === 'PUT' && url.includes('/contents/')) {
      return new Response(opts.putBody ?? '{"content":{}}', { status: opts.putStatus ?? 201 })
    }
    if (method === 'POST' && url.endsWith('/issues')) {
      createAttempts++
      if (opts.failCreateOnce && createAttempts === 1) return new Response('boom', { status: 502 })
      return new Response(JSON.stringify({ number: 12, html_url: 'https://github.com/o/solodex/issues/12' }), { status: 201 })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch
  return { fetch: f, calls }
}

function req(method: string, path: string, body?: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://relay.test${path}`, {
    method,
    headers: { 'x-solodex-key': 'key', ...(body !== undefined ? { 'content-length': String(body.length) } : {}), ...headers },
    body,
  })
}

const createPayload = () => JSON.stringify({
  reportId: id,
  title: 'It broke',
  description: 'details',
  diagnostics: { schema: 'solodex-report/1', app: { version: '1.8.16' } },
  screenshot: { url: attachUrl('screenshot.png'), width: 1400, height: 860 },
  attachments: [{ name: 'notes.log', mime: 'text/plain', bytes: 5, url: attachUrl('notes.log') }],
})

describe('gate', () => {
  it('refuses without the key, when disabled, and when rate limited', async () => {
    const gh = fakeGitHub()
    expect((await handleRequest(req('POST', '/v1/issues', '{}', { 'x-solodex-key': 'wrong' }), env(), gh.fetch)).status).toBe(401)
    expect((await handleRequest(req('POST', '/v1/issues', '{}'), env({ DISABLED: '1' }), gh.fetch)).status).toBe(503)
    const limited = { limit: async () => ({ success: false }) }
    const res = await handleRequest(req('POST', '/v1/issues', '{}'), env({ REPORT_RL: limited }), gh.fetch)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ ok: false, error: 'rate_limited', retryable: true })
    expect(gh.calls).toHaveLength(0)
  })
  it('answers health without a key', async () => {
    const res = await handleRequest(new Request('https://relay.test/v1/health'), env(), fakeGitHub().fetch)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, disabled: false })
  })
})

describe('PUT /v1/files', () => {
  it('forwards the body to the attachments repo untouched', async () => {
    const gh = fakeGitHub()
    const body = JSON.stringify({ message: 'm', content: 'AAAA' })
    const res = await handleRequest(req('PUT', `/v1/files/2026/${id}/notes.log`, body), env(), gh.fetch)
    expect(res.status).toBe(201)
    expect(gh.calls[0]).toMatchObject({ method: 'PUT', url: `https://api.github.com/repos/o/a/contents/issues/2026/${id}/notes.log`, body, auth: 'Bearer tok-attach' })
  })
  it('treats an existing file as success and rejects bad paths and sizes', async () => {
    const exists = fakeGitHub({ putStatus: 422, putBody: '{"message":"Invalid request.\\n\\n\\"sha\\" wasn\'t supplied."}' })
    expect((await handleRequest(req('PUT', `/v1/files/2026/${id}/notes.log`, '{"a":1}'), env(), exists.fetch)).status).toBe(200)
    const gh = fakeGitHub()
    expect((await handleRequest(req('PUT', `/v1/files/2026/${id}/evil.exe`, '{"a":1}'), env(), gh.fetch)).status).toBe(400)
    expect((await handleRequest(req('PUT', `/v1/files/2025/${id}/notes.log`, '{"a":1}'), env(), gh.fetch)).status).toBe(400)
    const big = req('PUT', `/v1/files/2026/${id}/notes.log`, '{}', { 'content-length': String(20 * 1024 * 1024) })
    expect((await handleRequest(big, env(), gh.fetch)).status).toBe(413)
    expect(gh.calls).toHaveLength(0)
  })
})

describe('POST /v1/issues', () => {
  it('checks the marker, creates the issue with labels and writes the marker', async () => {
    const gh = fakeGitHub()
    const res = await handleRequest(req('POST', '/v1/issues', createPayload()), env(), gh.fetch)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ ok: true, number: 12, duplicate: false, reportId: id })
    expect(gh.calls.map(c => `${c.method} ${c.url}`)).toEqual([
      `GET https://api.github.com/repos/o/a/contents/issues/2026/${id}/report.json?ref=main`,
      'POST https://api.github.com/repos/o/solodex/issues',
      `PUT https://api.github.com/repos/o/a/contents/issues/2026/${id}/report.json`,
    ])
    const created = JSON.parse(gh.calls[1].body!) as { title: string; body: string; labels: string[] }
    expect(created.labels).toEqual(['status:open', 'from:app'])
    expect(created.body).toContain(`![screenshot](${attachUrl('screenshot.png')})`)
    expect(created.body).toContain('<!-- solodex:diagnostics:start -->')
    expect(gh.calls[1].auth).toBe('Bearer tok-issues')
  })
  it('returns the existing issue when the marker exists', async () => {
    const gh = fakeGitHub({ markerExists: true })
    const res = await handleRequest(req('POST', '/v1/issues', createPayload()), env(), gh.fetch)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, number: 7, duplicate: true })
    expect(gh.calls).toHaveLength(1)
  })
  it('retries a 502 from GitHub and rejects invalid payloads', async () => {
    const gh = fakeGitHub({ failCreateOnce: true })
    const res = await handleRequest(req('POST', '/v1/issues', createPayload()), env(), gh.fetch)
    expect(res.status).toBe(201)
    const bad = await handleRequest(req('POST', '/v1/issues', '{"reportId":"x"}'), env(), fakeGitHub().fetch)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ ok: false, error: 'bad_request', retryable: false })
    const notJson = await handleRequest(req('POST', '/v1/issues', 'nope'), env(), fakeGitHub().fetch)
    expect(notJson.status).toBe(400)
  })
})
