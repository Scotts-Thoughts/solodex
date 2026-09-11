// Developer Mode backend: the developer's own machine has the GitHub CLI
// logged in, so Resolve / Reopen / list-all go through `gh` instead of a
// token stored in the app. Never reached for end users (handlers check
// `isDeveloperMode()` first).
import { execFile } from 'child_process'
import { ISSUES_REPO, DEVELOPER_LOGIN, STATUS_LABELS, type DevResult, type GhIssueSummary } from '../../shared/issues'
import { parseGhIssueList, classifyGhError } from './pure'

interface GhRun { stdout: string; stderr: string }

let ghPathOverride: string | null = null

/** GUI apps on macOS get a minimal PATH; let settings point at the binary. */
export function setGhPath(p: string | null): void {
  ghPathOverride = p && p.trim() ? p.trim() : null
}

function spawnGh(args: string[], shell: boolean): Promise<GhRun> {
  return new Promise((resolve, reject) => {
    execFile(ghPathOverride ?? 'gh', args, { windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024, shell }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: String(stderr ?? '') }))
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

async function runGh(args: string[]): Promise<DevResult<GhRun>> {
  try {
    return { ok: true, value: await spawnGh(args, false) }
  } catch (err) {
    const e = err as { code?: string | number | null; message?: string; stderr?: string }
    // On Windows a `.cmd` shim cannot be spawned without a shell; retry once.
    if (e.code === 'ENOENT' && process.platform === 'win32') {
      try {
        return { ok: true, value: await spawnGh(args, true) }
      } catch (err2) {
        const e2 = err2 as { code?: string | number | null; message?: string; stderr?: string }
        return { ok: false, ...classifyGhError(e2, e2.stderr ?? '') }
      }
    }
    return { ok: false, ...classifyGhError(e, e.stderr ?? '') }
  }
}

const REPO_ARGS = ['-R', ISSUES_REPO]

export async function ghListIssues(): Promise<DevResult<GhIssueSummary[]>> {
  const run = await runGh([
    'issue', 'list', ...REPO_ARGS, '--state', 'all', '--limit', '100',
    '--json', 'number,title,labels,state,stateReason,updatedAt,url,body,comments',
  ])
  if (!run.ok) return run
  try {
    return { ok: true, value: parseGhIssueList(run.value.stdout, DEVELOPER_LOGIN) }
  } catch (err) {
    return { ok: false, code: 'gh-failed', error: `Could not parse gh output: ${(err as Error).message}` }
  }
}

const LABELS: { name: string; color: string; description: string }[] = [
  { name: STATUS_LABELS.open, color: 'd93f0b', description: 'Reported or reopened; not yet worked' },
  { name: STATUS_LABELS.fixApplied, color: '1d76db', description: 'Fixed in the repo; awaiting release and verification' },
  { name: STATUS_LABELS.needsInfo, color: 'fbca04', description: 'Waiting for more information from the reporter' },
  { name: STATUS_LABELS.decision, color: 'c5def5', description: 'Parked for a product decision' },
  { name: STATUS_LABELS.fromApp, color: '5319e7', description: 'Filed from inside Solodex' },
]

let labelsEnsured = false

/** Idempotent; `--force` updates colour/description if the label already exists. */
export async function ghEnsureLabels(): Promise<DevResult<void>> {
  if (labelsEnsured) return { ok: true, value: undefined }
  for (const l of LABELS) {
    const run = await runGh(['label', 'create', l.name, ...REPO_ARGS, '--color', l.color, '--description', l.description, '--force'])
    if (!run.ok) return run
  }
  labelsEnsured = true
  return { ok: true, value: undefined }
}

/** Resolved = closed as completed. The GitHub Action drops the status labels; we also do it here so the UI is right immediately. */
export async function ghCloseIssue(number: number): Promise<DevResult<void>> {
  const close = await runGh(['issue', 'close', String(number), ...REPO_ARGS, '--reason', 'completed'])
  if (!close.ok) return close
  await runGh(['issue', 'edit', String(number), ...REPO_ARGS,
    '--remove-label', STATUS_LABELS.open, '--remove-label', STATUS_LABELS.fixApplied,
    '--remove-label', STATUS_LABELS.needsInfo, '--remove-label', STATUS_LABELS.decision])
  return { ok: true, value: undefined }
}

export async function ghReopenIssue(number: number): Promise<DevResult<void>> {
  const labels = await ghEnsureLabels()
  if (!labels.ok) return labels
  const reopen = await runGh(['issue', 'reopen', String(number), ...REPO_ARGS])
  if (!reopen.ok) return reopen
  const edit = await runGh(['issue', 'edit', String(number), ...REPO_ARGS,
    '--add-label', STATUS_LABELS.open,
    '--remove-label', STATUS_LABELS.fixApplied, '--remove-label', STATUS_LABELS.needsInfo, '--remove-label', STATUS_LABELS.decision])
  if (!edit.ok) return edit
  return { ok: true, value: undefined }
}
