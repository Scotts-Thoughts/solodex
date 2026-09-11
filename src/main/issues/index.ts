// IPC surface of the issue reporter (main-process side). Registered once from
// src/main/index.ts; everything else in this folder is reached through here.
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import {
  type DevResult,
  type IssueRecord,
  type NewIssueInput,
  ISSUE_LIMITS,
  redactHome,
} from '../../shared/issues'
import { createIssue, deleteIssue, getIssue, listIssues, readScreenshotDataUrl, readIssueFile, resolveIssuePath, issueDir } from './store'
import { RelayGitHubTransport } from './transport'
import { IssueSync } from './sync'
import { ghCloseIssue, ghListIssues, ghReopenIssue, setGhPath } from './gh'
import { buildIssueMarkdown } from './pure'
import { buildZip, type ZipEntry } from './zip'
import { resolveRelayUrl } from './config'

export interface IssueIpcDeps {
  getWindow: () => BrowserWindow | null
  loadSettings: () => Record<string, unknown>
  saveSetting: (key: string, value: unknown) => void
  restoreRendererFocus: (win: BrowserWindow | null) => void
  isDev: boolean
}

interface CaptureSlot { id: string; png: Buffer; at: number }

const CAPTURE_TTL_MS = 5 * 60_000
const STARTUP_SYNC_DELAY_MS = 15_000
const PERIODIC_SYNC_MS = 30 * 60_000

/** Settings keys copied into the diagnostics block (booleans only). */
const SETTINGS_WHITELIST = ['showBulk', 'showMovepoolDiff', 'showWbst', 'showUbst', 'crossOutBanned', 'crossOutPostgame', 'crossOutConditional']

let deps: IssueIpcDeps | null = null
let sync: IssueSync | null = null
let captureSlot: CaptureSlot | null = null

export function isDeveloperMode(): boolean {
  if (!deps) return false
  return deps.isDev || deps.loadSettings().developerMode === true
}

export function notifyIssuesChanged(ids: string[]): void {
  const win = deps?.getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('issues-changed', { ids })
}

function currentSync(): IssueSync {
  if (!deps) throw new Error('issues IPC not registered')
  if (!sync) {
    const transport = new RelayGitHubTransport(resolveRelayUrl(deps.loadSettings(), app.isPackaged), app.getVersion())
    sync = new IssueSync(transport, notifyIssuesChanged)
  }
  return sync
}

function relayConfigured(): boolean {
  return deps ? resolveRelayUrl(deps.loadSettings(), app.isPackaged) !== '' : false
}

function serverDiagnostics(win: BrowserWindow | null) {
  const settings = deps?.loadSettings() ?? {}
  const picked: Record<string, boolean> = {}
  for (const k of SETTINGS_WHITELIST) if (typeof settings[k] === 'boolean') picked[k] = settings[k] as boolean
  return {
    app: { version: app.getVersion(), packaged: app.isPackaged },
    runtime: {
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node ?? '',
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      locale: app.getLocale(),
    },
    maximized: win ? win.isMaximized() : false,
    settings: picked,
  }
}

function notDeveloper<T>(): DevResult<T> {
  return { ok: false, code: 'not-developer', error: 'Developer Mode is off' }
}

export function registerIssueIpc(d: IssueIpcDeps): void {
  deps = d

  ipcMain.handle('issue-capture-screenshot', async () => {
    const win = d.getWindow()
    if (!win || win.isDestroyed()) return null
    try {
      const img = await win.webContents.capturePage()
      if (img.isEmpty()) return null
      const png = img.toPNG()
      const { width, height } = img.getSize()
      captureSlot = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, png, at: Date.now() }
      return { captureId: captureSlot.id, dataUrl: `data:image/png;base64,${png.toString('base64')}`, width, height }
    } catch (err) {
      console.warn('[Solodex] issues: capturePage failed:', err)
      return null
    }
  })

  ipcMain.handle('issue-app-info', () => ({
    version: app.getVersion(),
    developerMode: isDeveloperMode(),
    relayConfigured: relayConfigured(),
  }))

  ipcMain.handle('issue-create', async (_, input: NewIssueInput) => {
    const win = d.getWindow()
    const original = captureSlot && input.captureId === captureSlot.id && Date.now() - captureSlot.at < CAPTURE_TTL_MS
      ? captureSlot.png
      : null
    captureSlot = null
    const home = os.homedir()
    const safeInput: NewIssueInput = {
      ...input,
      diagnostics: {
        ...input.diagnostics,
        recentErrors: input.diagnostics.recentErrors.slice(-ISSUE_LIMITS.maxRecentErrors).map(e => ({
          ...e,
          message: redactHome(e.message, home).slice(0, 2000),
          stack: e.stack ? redactHome(e.stack, home).slice(0, 4000) : undefined,
        })),
      },
    }
    const record = createIssue(safeInput, serverDiagnostics(win), original)
    notifyIssuesChanged([record.id])
    if (!record.sendToDeveloper) return record
    return currentSync().sendNow(record.id)
  })

  ipcMain.handle('issue-list', () => listIssues())
  ipcMain.handle('issue-get', (_, id: string) => getIssue(id))
  ipcMain.handle('issue-screenshot', (_, id: string) => readScreenshotDataUrl(id))
  ipcMain.handle('issue-get-developer-mode', () => isDeveloperMode())

  ipcMain.handle('issue-open-attachment', async (_, id: string, file: string) => {
    try {
      const p = resolveIssuePath(id, file)
      if (!fs.existsSync(p)) return false
      const err = await shell.openPath(p)
      return err === ''
    } catch {
      return false
    }
  })

  ipcMain.handle('issue-show-in-folder', (_, id: string) => {
    try { shell.showItemInFolder(path.join(issueDir(id), 'issue.json')) } catch { /* invalid id */ }
  })

  // A manual retry ignores the backoff schedule.
  ipcMain.handle('issue-retry-send', (_, id: string) => currentSync().sendNow(id))

  ipcMain.handle('issue-refresh-status', (_, id: string, force?: boolean) => currentSync().refreshOne(id, force === true))
  ipcMain.handle('issue-refresh-all', () => currentSync().refreshStatuses('panel', false))

  ipcMain.handle('issue-export-zip', async (_, id: string) => {
    const record = getIssue(id)
    if (!record) return { ok: false, error: 'Report not found' }
    const win = d.getWindow()
    if (!win) return { ok: false, error: 'No window' }
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: `solodex-report-${id}.zip`,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    })
    d.restoreRendererFocus(win)
    if (canceled || !filePath) return { ok: false }
    try {
      const entries: ZipEntry[] = [
        { name: 'issue.md', data: Buffer.from(buildIssueMarkdown(record), 'utf8') },
        { name: 'issue.json', data: Buffer.from(JSON.stringify(record, null, 2), 'utf8') },
      ]
      for (const f of ['screenshot.png', 'screenshot-original.png']) {
        const data = readIssueFile(id, f)
        if (data) entries.push({ name: f, data })
      }
      for (const a of record.attachments) {
        const data = readIssueFile(id, a.file)
        if (data) entries.push({ name: a.file, data })
      }
      fs.writeFileSync(filePath, buildZip(entries))
      shell.showItemInFolder(filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      console.error('[Solodex] issues: export failed:', err)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('issue-delete', (_, id: string) => {
    const ok = deleteIssue(id)
    if (ok) notifyIssuesChanged([id])
    return ok
  })

  // --- Developer Mode (gh CLI on the developer's machine) ---

  // `settings.ghPath` lets a GUI-launched app (minimal PATH on macOS) find the gh binary.
  const devReady = (): boolean => {
    if (!isDeveloperMode()) return false
    const ghPath = d.loadSettings().ghPath
    setGhPath(typeof ghPath === 'string' ? ghPath : null)
    return true
  }

  ipcMain.handle('dev-list-github-issues', async () => {
    if (!devReady()) return notDeveloper()
    return ghListIssues()
  })

  const afterRemoteChange = async (number: number) => {
    // Force-refresh any local report that points at this issue so pills update immediately.
    const local = listIssues().filter(r => r.remote?.number === number)
    for (const r of local) {
      try { await currentSync().refreshOne(r.id, true) } catch { /* transient */ }
    }
    notifyIssuesChanged(local.map(r => r.id))
  }

  ipcMain.handle('dev-resolve-issue', async (_, number: number) => {
    if (!devReady()) return notDeveloper()
    const result = await ghCloseIssue(number)
    if (result.ok) await afterRemoteChange(number)
    return result
  })

  ipcMain.handle('dev-reopen-issue', async (_, number: number) => {
    if (!devReady()) return notDeveloper()
    const result = await ghReopenIssue(number)
    if (result.ok) await afterRemoteChange(number)
    return result
  })
}

/** Retry queued sends and refresh statuses shortly after launch, then every 30 minutes. */
export function scheduleStartupSync(): void {
  const run = async (reason: string) => {
    try {
      await currentSync().retryPendingSends(reason)
      await currentSync().refreshStatuses(reason)
    } catch (err) {
      console.warn('[Solodex] issues: background sync failed:', err)
    }
  }
  setTimeout(() => void run('startup'), STARTUP_SYNC_DELAY_MS)
  const timer = setInterval(() => void run('periodic'), PERIODIC_SYNC_MS)
  timer.unref?.()
}

export type { IssueRecord }
