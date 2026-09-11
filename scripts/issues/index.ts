#!/usr/bin/env node
/**
 * Solodex bug-report queue helpers, used by the `/issues` Claude Code skill
 * and by hand. Talks to GitHub through the logged-in `gh` CLI.
 *
 *   npm run issues:list                        # actionable issues (status:open), oldest first
 *   npm run issues:list -- --state all         # everything, incl. closed
 *   npm run issues:list -- --json              # machine-readable
 *   npm run issues:fetch -- 12                 # dump #12 + download its screenshot/attachments
 *   npm run issues:fetch -- 12 --out DIR       # (default: <tmp>/solodex-issues/issue-12)
 *   npm run issues:labels                      # create/update the status:* labels (idempotent)
 *   npm run issues:import -- FOLDER_OR_ZIP     # file a report exported from the app as an issue
 *   npm run issues:import -- FOLDER --dry-run  # print what would be filed
 *
 * Run through vite-node (see package.json) so the TypeScript imports from
 * relay/src and src/shared resolve. See docs/issues/README.md.
 */
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  ISSUES_REPO,
  DEVELOPER_LOGIN,
  STATUS_LABELS,
  NOTE_MARKERS,
  extractNotes,
  mapRemoteStatus,
  type IssueRecord,
  type RemoteStatus,
} from '../../src/shared/issues'
import { ATTACH_REPO, ATTACH_BRANCH } from '../../src/main/issues/config'
import { buildIssueBody, parseDiagnostics, extractImages, attachmentPath, rawUrl, type CreateInput } from '../../relay/src/format'
import { createIssue, getContents, putContents, decodeContent, GitHubError } from '../../relay/src/github'

const args = process.argv.slice(2)
const command = args.find(a => !a.startsWith('--')) ?? 'list'
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  ?? (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined)

// ---------------------------------------------------------------------------
// gh CLI

function gh(cliArgs: string[]): string {
  let r = spawnSync('gh', cliArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT' && process.platform === 'win32') {
    r = spawnSync('gh', cliArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true })
  }
  if (r.error) {
    console.error(`FAIL gh not available: ${r.error.message}\n     Install GitHub CLI (https://cli.github.com) and run: gh auth login`)
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(`FAIL gh ${cliArgs.slice(0, 3).join(' ')} …\n${(r.stderr || '').trim()}`)
    process.exit(1)
  }
  return r.stdout
}

const REPO = ['-R', ISSUES_REPO]

interface GhComment { body: string; author?: { login?: string }; createdAt: string; url?: string }
interface GhIssue {
  number: number
  title: string
  body: string
  state: string
  stateReason?: string | null
  labels: { name: string }[]
  createdAt: string
  updatedAt: string
  url: string
  author?: { login?: string }
  comments: GhComment[]
}

const ISSUE_FIELDS = 'number,title,body,state,stateReason,labels,createdAt,updatedAt,url,author,comments'

function statusOf(i: GhIssue): RemoteStatus {
  return mapRemoteStatus(i.state, i.stateReason ?? null, i.labels.map(l => l.name))
}

/** A fix note exists and the issue is open again → the earlier fix did not hold. */
function fixNotes(i: GhIssue): GhComment[] {
  return i.comments.filter(c => (c.author?.login ?? '').toLowerCase() === DEVELOPER_LOGIN.toLowerCase() && c.body.trimStart().startsWith(NOTE_MARKERS.fix))
}

function reportIdOf(body: string): string | null {
  const m = body.match(/<!-- solodex:report v1 ([0-9a-z-]+) -->/)
  return m ? m[1] : null
}

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  const d = Math.floor(ms / 86_400_000)
  if (d >= 1) return `${d}d`
  const h = Math.floor(ms / 3_600_000)
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`
}

// ---------------------------------------------------------------------------
// list

function cmdList(): void {
  const state = option('state') ?? 'open'
  const raw = JSON.parse(gh(['issue', 'list', ...REPO, '--state', state, '--limit', '100', '--json', ISSUE_FIELDS])) as GhIssue[]
  const rows = raw
    .map(i => {
      const status = statusOf(i)
      const fixes = fixNotes(i)
      return {
        number: i.number,
        title: i.title,
        url: i.url,
        state: i.state.toLowerCase(),
        status,
        labels: i.labels.map(l => l.name),
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        comments: i.comments.length,
        reopened: status === 'open' && fixes.length > 0,
        reportId: reportIdOf(i.body),
        actionable: status === 'open',
      }
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))

  const seen = new Map<string, number>()
  const duplicates: string[] = []
  for (const r of rows) {
    if (!r.reportId) continue
    const first = seen.get(r.reportId)
    if (first) duplicates.push(`#${r.number} duplicates #${first} (report ${r.reportId})`)
    else seen.set(r.reportId, r.number)
  }

  if (flag('json')) {
    console.log(JSON.stringify({ rows, duplicates }, null, 2))
    return
  }
  if (rows.length === 0) {
    console.log(state === 'open' ? 'No open issues.' : 'No issues.')
    return
  }
  console.log(`── ${ISSUES_REPO} issues (${state}, oldest first) ──`)
  for (const r of rows) {
    const mark = r.actionable ? (r.reopened ? 'REOPEN' : 'OPEN  ') : r.status === 'fix-applied' ? 'FIXED ' : r.status === 'needs-info' ? 'INFO  ' : r.status === 'decision' ? 'PARKED' : 'CLOSED'
    console.log(`${mark} #${String(r.number).padEnd(5)} ${ago(r.createdAt).padStart(4)}  ${String(r.comments).padStart(2)}c  ${r.title}`)
  }
  const actionable = rows.filter(r => r.actionable).length
  console.log(`${rows.length} issue(s), ${actionable} actionable (OPEN/REOPEN)`)
  for (const d of duplicates) console.log(`WARN ${d}`)
}

// ---------------------------------------------------------------------------
// fetch

async function download(url: string, dest: string, token: string | null): Promise<boolean> {
  const attempt = async (headers: Record<string, string>) => {
    const res = await fetch(url, { headers, redirect: 'follow' })
    if (!res.ok) return false
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    return true
  }
  try {
    if (await attempt({ 'User-Agent': 'solodex-issues-script' })) return true
    if (token && await attempt({ 'User-Agent': 'solodex-issues-script', Authorization: `Bearer ${token}` })) return true
  } catch {
    // fall through
  }
  return false
}

async function cmdFetch(): Promise<void> {
  const numberArg = args.find(a => /^\d+$/.test(a))
  if (!numberArg) {
    console.error('FAIL usage: npm run issues:fetch -- <number> [--out DIR]')
    process.exit(1)
  }
  const number = Number(numberArg)
  const out = path.resolve(option('out') ?? path.join(os.tmpdir(), 'solodex-issues', `issue-${number}`))
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(path.join(out, 'attachments'), { recursive: true })

  const issue = JSON.parse(gh(['issue', 'view', String(number), ...REPO, '--json', ISSUE_FIELDS])) as GhIssue
  const status = statusOf(issue)
  const diagnostics = parseDiagnostics(issue.body)
  const fixes = fixNotes(issue)
  const lastFixAt = fixes.length ? fixes[fixes.length - 1].createdAt : null
  const notes = extractNotes(issue.comments.map(c => ({ body: c.body, author: c.author?.login })), DEVELOPER_LOGIN)

  fs.writeFileSync(path.join(out, 'issue.json'), JSON.stringify(issue, null, 2))
  fs.writeFileSync(path.join(out, 'body.md'), issue.body)
  fs.writeFileSync(path.join(out, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2))
  fs.writeFileSync(path.join(out, 'comments.md'), issue.comments.length
    ? issue.comments.map(c => `## ${c.author?.login ?? 'unknown'} — ${c.createdAt}\n\n${c.body}\n`).join('\n---\n\n')
    : '_No comments._\n')

  // Files: prefer the diagnostics attachment list (kind/name/url); fall back
  // to the images embedded in the body (hand-filed issues).
  type Att = { kind: string; name: string; url: string }
  const listed = Array.isArray(diagnostics?.attachments) ? (diagnostics!.attachments as Att[]).filter(a => a && typeof a.url === 'string') : []
  const files: Att[] = listed.length
    ? listed
    : extractImages(issue.body).map((img, i) => ({ kind: i === 0 ? 'screenshot' : 'image', name: img.alt || `image-${i + 1}.png`, url: img.url }))
  let token: string | null = null
  try { token = gh(['auth', 'token']).trim() || null } catch { token = null }
  const downloaded: { name: string; file: string; kind: string }[] = []
  for (const f of files) {
    const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'file'
    const file = f.kind === 'screenshot' ? 'screenshot.png' : path.join('attachments', safe)
    const ok = await download(f.url, path.join(out, file), token)
    console.log(`${ok ? 'OK  ' : 'SKIP'} ${file.padEnd(40)} ${f.url}`)
    if (ok) downloaded.push({ name: f.name, file, kind: f.kind })
  }

  const meta = {
    number,
    title: issue.title,
    url: issue.url,
    state: issue.state.toLowerCase(),
    status,
    labels: issue.labels.map(l => l.name),
    reporter: issue.author?.login ?? null,
    createdAt: issue.createdAt,
    reportId: reportIdOf(issue.body),
    hasDiagnostics: diagnostics !== null,
    reopened: status === 'open' && fixes.length > 0,
    previousFixNotes: fixes.map(c => ({ at: c.createdAt, body: c.body })),
    humanCommentsAfterFix: lastFixAt
      ? issue.comments.filter(c => c.createdAt > lastFixAt && !c.body.trimStart().startsWith('<!-- solodex:')).map(c => ({ at: c.createdAt, author: c.author?.login ?? null, body: c.body }))
      : [],
    notes,
    files: downloaded,
    out,
  }
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 2))
  console.log(`OK   #${number} ${issue.title}`)
  console.log(`     status=${status}${meta.reopened ? ' (REOPENED — read previousFixNotes in meta.json first)' : ''} diagnostics=${diagnostics ? 'yes' : 'no'} files=${downloaded.length}`)
  console.log(`     ${out}`)
}

// ---------------------------------------------------------------------------
// labels

const LABELS: { name: string; color: string; description: string }[] = [
  { name: STATUS_LABELS.open, color: 'd93f0b', description: 'Reported or reopened; not yet worked' },
  { name: STATUS_LABELS.fixApplied, color: '1d76db', description: 'Fixed in the repo; awaiting release and verification' },
  { name: STATUS_LABELS.needsInfo, color: 'fbca04', description: 'Waiting for more information from the reporter' },
  { name: STATUS_LABELS.decision, color: 'c5def5', description: 'Parked for a product decision' },
  { name: STATUS_LABELS.fromApp, color: '5319e7', description: 'Filed from inside Solodex' },
]

function cmdLabels(): void {
  for (const l of LABELS) {
    gh(['label', 'create', l.name, ...REPO, '--color', l.color, '--description', l.description, '--force'])
    console.log(`OK   ${l.name.padEnd(20)} #${l.color}  ${l.description}`)
  }
}

// ---------------------------------------------------------------------------
// import

function extractZip(zipPath: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'solodex-import-'))
  const r = spawnSync('tar', ['-xf', zipPath, '-C', dir], { encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`FAIL could not extract ${zipPath} with tar: ${(r.stderr || r.error?.message || '').trim()}`)
    process.exit(1)
  }
  return dir
}

async function cmdImport(): Promise<void> {
  const target = args.find(a => !a.startsWith('--') && a !== 'import')
  if (!target) {
    console.error('FAIL usage: npm run issues:import -- <folder-or-zip> [--dry-run]')
    process.exit(1)
  }
  const dir = target.toLowerCase().endsWith('.zip') ? extractZip(path.resolve(target)) : path.resolve(target)
  const recordPath = path.join(dir, 'issue.json')
  if (!fs.existsSync(recordPath)) {
    console.error(`FAIL ${recordPath} not found (export the report from the app's Issues panel first)`)
    process.exit(1)
  }
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8')) as IssueRecord
  const year = record.id.slice(0, 4)
  const url = (name: string) => rawUrl(ATTACH_REPO, ATTACH_BRANCH, attachmentPath(year, record.id, name))
  const screenshotFile = record.screenshot ? path.join(dir, record.screenshot.file) : null
  const hasScreenshot = Boolean(screenshotFile && fs.existsSync(screenshotFile))
  const attachments = record.attachments.filter(a => fs.existsSync(path.join(dir, a.file)))

  const input: CreateInput = {
    reportId: record.id,
    title: record.title,
    description: record.description,
    diagnostics: { ...record.diagnostics, source: 'import' },
    screenshot: hasScreenshot && record.screenshot ? { url: url('screenshot.png'), width: record.screenshot.width, height: record.screenshot.height } : null,
    attachments: attachments.map(a => ({ name: a.name, mime: a.mime, bytes: a.bytes, url: url(a.name) })),
  }
  const body = buildIssueBody(input, new Date().toISOString())

  if (flag('dry-run')) {
    console.log(`── would upload to ${ATTACH_REPO} ──`)
    if (hasScreenshot) console.log(`     ${attachmentPath(year, record.id, 'screenshot.png')}`)
    for (const a of attachments) console.log(`     ${attachmentPath(year, record.id, a.name)}`)
    console.log(`── would create on ${ISSUES_REPO} ──`)
    console.log(`title: ${record.title}\nlabels: ${STATUS_LABELS.open}, ${STATUS_LABELS.fromApp}\n`)
    console.log(body)
    return
  }

  const token = gh(['auth', 'token']).trim()
  const markerPath = attachmentPath(year, record.id, 'report.json')
  try {
    const existing = await getContents(token, ATTACH_REPO, markerPath, ATTACH_BRANCH)
    if (existing) {
      const marker = JSON.parse(decodeContent(existing)) as { number: number; url: string }
      console.log(`SKIP already filed as #${marker.number} ${marker.url}`)
      return
    }
    if (hasScreenshot) {
      const r = await putContents(token, ATTACH_REPO, attachmentPath(year, record.id, 'screenshot.png'), fs.readFileSync(screenshotFile!).toString('base64'), `report ${record.id}: screenshot.png`)
      console.log(`OK   screenshot.png (${r})`)
    }
    for (const a of attachments) {
      const r = await putContents(token, ATTACH_REPO, attachmentPath(year, record.id, a.name), fs.readFileSync(path.join(dir, a.file)).toString('base64'), `report ${record.id}: ${a.name}`)
      console.log(`OK   ${a.name} (${r})`)
    }
    const created = await createIssue(token, ISSUES_REPO, record.title, body, [STATUS_LABELS.open, STATUS_LABELS.fromApp])
    await putContents(token, ATTACH_REPO, markerPath, Buffer.from(JSON.stringify({ number: created.number, url: created.html_url, createdAt: new Date().toISOString() })).toString('base64'), `report ${record.id}: issue #${created.number}`)
    console.log(`OK   #${created.number} ${created.html_url}  (${attachments.length} attachment(s)${hasScreenshot ? ' + screenshot' : ''})`)
  } catch (err) {
    if (err instanceof GitHubError) console.error(`FAIL ${err.message}`)
    else console.error(`FAIL ${(err as Error).message}`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  switch (command) {
    case 'list': cmdList(); break
    case 'fetch': await cmdFetch(); break
    case 'labels': cmdLabels(); break
    case 'import': await cmdImport(); break
    default:
      console.error(`FAIL unknown command "${command}" (list | fetch | labels | import)`)
      process.exit(1)
  }
}

main().catch(err => {
  console.error(`FAIL ${(err as Error).stack ?? err}`)
  process.exit(1)
})
