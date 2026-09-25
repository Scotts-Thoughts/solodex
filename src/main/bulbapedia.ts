import { BrowserWindow, session, type Session } from 'electron'

// Bulbapedia sits behind a Cloudflare managed challenge that answers net.fetch
// with a 403 "Just a moment..." page — even with a valid cf_clearance cookie,
// because Cloudflare also checks that the request comes from a real page. A
// hidden, sandboxed window on its own persistent partition passes the
// challenge by itself in a couple of seconds (the cookie then lasts a year),
// and API requests are issued with fetch() from inside that page.

const ORIGIN = 'https://bulbapedia.bulbagarden.net'
export const BULBAPEDIA_API = `${ORIGIN}/w/api.php`
// The window only needs to sit on Bulbapedia's origin; this is the smallest
// response the site has.
const LANDING_URL = `${BULBAPEDIA_API}?action=query&format=json`
const PARTITION = 'persist:bulbapedia'
// Cloudflare's challenge scripts come from cloudflare.com; nothing else is needed.
const ALLOWED_HOSTS = /(^|\.)(bulbagarden\.net|cloudflare\.com)$/i
const AUTO_CLEAR_MS = 20_000      // a managed challenge normally clears in ~2 s
const MANUAL_CLEAR_MS = 180_000   // after that, show the window for a checkbox click
const MIN_GAP_MS = 500            // Cloudflare re-challenges clients that fetch faster than ~2/s
const REQUEST_TIMEOUT_MS = 15_000
// MediaWiki's stand-in for User-Agent, which page scripts cannot set.
const API_USER_AGENT = 'Solodex (Pokemon reference app)'

interface PageResponse { status: number; challenged: boolean; body: string }

let win: BrowserWindow | null = null
let cleared = false
let queue: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0
const cache = new Map<string, unknown>()

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function isAllowed(url: string): boolean {
  try { return ALLOWED_HOSTS.test(new URL(url).hostname) } catch { return false }
}

let partition: Session | null = null
function getSession(): Session {
  if (partition) return partition
  partition = session.fromPartition(PARTITION)
  partition.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowed(details.url) }))
  partition.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  return partition
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    show: false,
    width: 480,
    height: 600,
    title: 'Solodex — Bulbapedia check',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { session: getSession(), sandbox: true, backgroundThrottling: false },
  })
  w.removeMenu()
  w.on('page-title-updated', e => e.preventDefault())
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e, url) => { if (!isAllowed(url)) e.preventDefault() })
  w.on('closed', () => {
    if (win === w) { win = null; cleared = false }
  })
  return w
}

async function pastChallenge(w: BrowserWindow): Promise<boolean> {
  if (w.isDestroyed()) return false
  try {
    return await w.webContents.executeJavaScript(
      `location.origin === ${JSON.stringify(ORIGIN)} && !/just a moment/i.test(document.title)`
    )
  } catch {
    return false
  }
}

async function waitForClearance(w: BrowserWindow, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await pastChallenge(w)) return true
    if (w.isDestroyed()) return false
    await sleep(500)
  }
  return false
}

// Load (or reload) the landing page and wait until Cloudflare lets it through.
async function openOnBulbapedia(): Promise<boolean> {
  if (!win || win.isDestroyed()) win = createWindow()
  const w = win
  try {
    await w.loadURL(LANDING_URL)
  } catch (err) {
    // ERR_ABORTED only means the challenge navigated on; anything else is a
    // network failure the popovers report as "not found".
    if ((err as { code?: string }).code !== 'ERR_ABORTED') return false
  }
  if (await waitForClearance(w, AUTO_CLEAR_MS)) return true
  if (w.isDestroyed()) return false
  // Cloudflare wants an interactive check; let the user click it.
  w.center()
  w.show()
  w.focus()
  const ok = await waitForClearance(w, MANUAL_CLEAR_MS)
  if (!w.isDestroyed()) w.hide()
  return ok
}

async function fetchInPage(w: BrowserWindow, url: string): Promise<PageResponse> {
  const failed: PageResponse = { status: 0, challenged: false, body: '' }
  if (w.isDestroyed()) return failed
  const script = `
    fetch(${JSON.stringify(url)}, {
      headers: { 'Api-User-Agent': ${JSON.stringify(API_USER_AGENT)} },
      signal: AbortSignal.timeout(${REQUEST_TIMEOUT_MS}),
    })
      .then(async r => ({ status: r.status, challenged: r.headers.get('cf-mitigated') === 'challenge', body: await r.text() }))
      .catch(() => (${JSON.stringify(failed)}))
  `
  try {
    return await w.webContents.executeJavaScript(script)
  } catch {
    return failed
  }
}

async function fetchSerial(url: string): Promise<unknown | null> {
  if (cache.has(url)) return cache.get(url)
  // A second attempt covers an expired or revoked clearance.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!cleared) cleared = await openOnBulbapedia()
    if (!cleared || !win) return null
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const res = await fetchInPage(win, url)
    if (res.status === 403 && res.challenged) { cleared = false; continue }
    if (res.status !== 200) return null
    try {
      const data = JSON.parse(res.body)
      cache.set(url, data)
      return data
    } catch {
      return null
    }
  }
  return null
}

/**
 * GET a Bulbapedia URL that returns JSON (the MediaWiki API). Requests run one
 * at a time; successful responses are cached for the session. Resolves to null
 * on any failure.
 */
export function fetchBulbapediaJson<T>(url: string): Promise<T | null> {
  const job = queue.then(() => fetchSerial(url))
  queue = job.catch(() => undefined)
  return job as Promise<T | null>
}

/** Destroy the hidden window (it would otherwise keep the app alive). */
export function closeBulbapedia(): void {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  cleared = false
}
