// Thin GitHub REST client with the retry policy the relay needs. Also used by
// scripts/issues/index.ts (`import`) with the developer's own token.

export class GitHubError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string,
    public retryAfter?: number
  ) {
    super(`GitHub ${status} on ${path}: ${body.slice(0, 200)}`)
    this.name = 'GitHubError'
  }
}

export interface GhOptions {
  fetch?: typeof fetch
  timeoutMs?: number
  retries?: number
  /** Extra headers, e.g. a forwarded Content-Length. */
  headers?: Record<string, string>
}

const API = 'https://api.github.com'
const RETRY_STATUSES = new Set([409, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function retryAfterSeconds(res: Response): number | undefined {
  const ra = Number(res.headers.get('retry-after'))
  if (Number.isFinite(ra) && ra > 0) return ra
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    if (Number.isFinite(reset) && reset > 0) return Math.max(1, Math.round(reset - Date.now() / 1000))
  }
  return undefined
}

/**
 * One GitHub API call. Retries 409/5xx/timeouts with exponential backoff;
 * anything else throws `GitHubError` (with `retryAfter` on rate limits).
 */
export async function gh(token: string, method: string, path: string, body: string | null, opts: GhOptions = {}): Promise<Response> {
  const doFetch = opts.fetch ?? fetch
  const retries = opts.retries ?? 3
  const timeoutMs = opts.timeoutMs ?? 30_000
  let attempt = 0
  for (;;) {
    let res: Response | null = null
    let networkError: unknown = null
    try {
      res = await doFetch(`${API}${path}`, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'solodex-issues-relay/1',
          ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
          ...(opts.headers ?? {}),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      networkError = err
    }
    if (res && !RETRY_STATUSES.has(res.status)) {
      if (res.ok) return res
      const text = await res.text().catch(() => '')
      throw new GitHubError(res.status, path, text, retryAfterSeconds(res))
    }
    if (attempt >= retries) {
      if (res) throw new GitHubError(res.status, path, await res.text().catch(() => ''))
      throw new GitHubError(0, path, `network error: ${String(networkError)}`)
    }
    attempt++
    await sleep(500 * 3 ** (attempt - 1) + Math.random() * 250)
  }
}

export interface ContentsFile { sha: string; content: string; encoding: string }

/** GET a file; null when it does not exist. */
export async function getContents(token: string, repo: string, path: string, branch: string, opts?: GhOptions): Promise<ContentsFile | null> {
  try {
    const res = await gh(token, 'GET', `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, null, opts)
    return await res.json() as ContentsFile
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null
    throw err
  }
}

/**
 * PUT a file body that is already the Contents-API JSON (`{message, content}`).
 * A 422 mentioning `sha` means the file exists — a retry of an earlier partial
 * run — and counts as success because the path is deterministic.
 */
export async function putContentsRaw(token: string, repo: string, path: string, jsonBody: string, opts?: GhOptions): Promise<'created' | 'exists'> {
  try {
    await gh(token, 'PUT', `/repos/${repo}/contents/${path}`, jsonBody, opts)
    return 'created'
  } catch (err) {
    if (err instanceof GitHubError && err.status === 422 && /sha/i.test(err.body)) return 'exists'
    throw err
  }
}

export async function putContents(token: string, repo: string, path: string, base64: string, message: string, opts?: GhOptions): Promise<'created' | 'exists'> {
  return putContentsRaw(token, repo, path, JSON.stringify({ message, content: base64 }), opts)
}

export interface CreatedIssue { number: number; html_url: string }

export async function createIssue(token: string, repo: string, title: string, body: string, labels: string[], opts?: GhOptions): Promise<CreatedIssue> {
  const res = await gh(token, 'POST', `/repos/${repo}/issues`, JSON.stringify({ title, body, labels }), opts)
  const json = await res.json() as CreatedIssue
  return { number: json.number, html_url: json.html_url }
}

export function decodeContent(file: ContentsFile): string {
  if (file.encoding !== 'base64') return file.content
  const clean = file.content.replace(/\s+/g, '')
  return atob(clean)
}
