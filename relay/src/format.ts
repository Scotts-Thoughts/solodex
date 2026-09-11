// The one place the GitHub issue format lives: limits, attachment paths and
// the body builder/parser. Pure (no Workers APIs) so the helper scripts in
// scripts/issues/ and the tests can import it too.

export const LIMITS = {
  title: 120,
  description: 10_000,
  attachments: 5,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 20 * 1024 * 1024,
  /** Base64 JSON body for one file: 10 MiB × 4/3 plus the JSON wrapper. */
  fileBodyBytes: 14 * 1024 * 1024,
  createBytes: 64 * 1024,
  diagnosticsBytes: 32 * 1024,
} as const

export const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'log', 'md', 'json', 'csv'] as const
export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export const MARK = {
  diagStart: '<!-- solodex:diagnostics:start -->',
  diagEnd: '<!-- solodex:diagnostics:end -->',
  report: (reportId: string) => `<!-- solodex:report v1 ${reportId} -->`,
} as const

export const REPORT_ID_RE = /^[0-9a-z-]{15,40}$/
export const FILE_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/
export const YEAR_RE = /^\d{4}$/

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isAllowedName(name: string): boolean {
  return FILE_NAME_RE.test(name) && (ALLOWED_EXT as readonly string[]).includes(extensionOf(name))
}

/** Same rules as the app's sanitiser: basename, `[A-Za-z0-9._-]`, stem ≤ 64, lowercase extension. */
export function sanitizeFilename(name: string): string {
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

export function attachmentPath(year: string, reportId: string, name: string): string {
  return `issues/${year}/${reportId}/${name}`
}

export function rawUrl(repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export interface CreateAttachment {
  name: string
  mime: string
  bytes: number
  url: string
}

export interface CreateInput {
  reportId: string
  title: string
  description: string
  diagnostics: Record<string, unknown>
  screenshot: { url: string; width: number; height: number } | null
  attachments: CreateAttachment[]
}

function summaryLine(d: Record<string, unknown>): string {
  const app = d.app as { version?: string } | undefined
  const rt = d.runtime as { platform?: string; arch?: string } | undefined
  const st = d.state as { view?: string; game?: string; species?: string | null } | undefined
  const parts = [
    `Solodex ${app?.version ?? '?'}`,
    [rt?.platform, rt?.arch].filter(Boolean).join(' ') || null,
    st?.game || null,
    st?.view ? `${st.view} view` : null,
    st?.species || null,
  ].filter(Boolean)
  return `_Reported from ${parts.join(' · ')}_`
}

/** Markdown body of the GitHub issue. See docs/issues/README.md ("Issue format"). */
export function buildIssueBody(input: CreateInput, receivedAt: string): string {
  const diagnostics = {
    ...input.diagnostics,
    receivedAt,
    attachments: [
      ...(input.screenshot ? [{ kind: 'screenshot', name: 'screenshot.png', mime: 'image/png', url: input.screenshot.url, width: input.screenshot.width, height: input.screenshot.height }] : []),
      ...input.attachments.map(a => ({ kind: IMAGE_EXT.has(extensionOf(a.name)) ? 'image' : 'text', name: a.name, mime: a.mime, bytes: a.bytes, url: a.url })),
    ],
  }
  const lines: string[] = []
  lines.push(summaryLine(input.diagnostics))
  lines.push('')
  lines.push(input.description.trim() || '_No description provided._')
  lines.push('')
  if (input.screenshot) {
    lines.push('### Screenshot')
    lines.push(`![screenshot](${input.screenshot.url})`)
    lines.push('')
  }
  if (input.attachments.length) {
    lines.push('### Attachments')
    for (const a of input.attachments) {
      const link = IMAGE_EXT.has(extensionOf(a.name)) ? `![${a.name}](${a.url})` : `[${a.name}](${a.url})`
      lines.push(`- ${link} — ${formatBytes(a.bytes)}`)
    }
    lines.push('')
  }
  lines.push('<details><summary>Diagnostics</summary>')
  lines.push('')
  lines.push(MARK.diagStart)
  lines.push('````json')
  lines.push(JSON.stringify(diagnostics, null, 2))
  lines.push('````')
  lines.push(MARK.diagEnd)
  lines.push('')
  lines.push('</details>')
  lines.push(MARK.report(input.reportId))
  return lines.join('\n')
}

const DIAG_RE = /<!-- solodex:diagnostics:start -->\s*`{3,}json\s*([\s\S]*?)`{3,}\s*<!-- solodex:diagnostics:end -->/

/** Diagnostics block from an issue body, or null for issues filed by hand. */
export function parseDiagnostics(body: string): Record<string, unknown> | null {
  const m = body.match(DIAG_RE)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1]) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

const IMAGE_MD_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g

/** Every embedded image (screenshot first) in an issue body. */
export function extractImages(body: string): { alt: string; url: string }[] {
  const out: { alt: string; url: string }[] = []
  for (const m of body.matchAll(IMAGE_MD_RE)) out.push({ alt: m[1], url: m[2] })
  return out
}

/** The GitHub REST body for a Contents-API PUT. The app builds this itself and the relay streams it through. */
export function contentsBody(base64: string, message: string): string {
  return JSON.stringify({ message, content: base64 })
}
