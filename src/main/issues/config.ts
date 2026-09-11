// Where bug reports go. The relay is the Cloudflare Worker in `relay/`; until
// it is deployed and its URL pasted here, reports are kept locally only.
// See docs/issues/README.md ("Setup").

/** Deployed Worker URL, e.g. `https://solodex-issues.<subdomain>.workers.dev`. Empty = relay disabled. */
export const ISSUES_RELAY_URL = ''

/**
 * Shared key the Worker checks before doing anything. It ships inside the app,
 * so it only keeps drive-by scanners out — the real controls are the Worker's
 * rate limits and its DISABLED switch. Must match the Worker's APP_KEY secret.
 */
export const ISSUES_APP_KEY = 'sdx_b82dbd50871b69c669c111e785826a8b6928c23b'

/** Public repo that holds screenshots and attachments (raw URLs are embedded in issues). */
export const ATTACH_REPO = 'Scotts-Thoughts/solodex-issue-attachments'
export const ATTACH_BRANCH = 'main'

/**
 * Effective relay URL: an env override for local `wrangler dev` runs (dev
 * builds only), then a settings override, then the constant.
 */
export function resolveRelayUrl(settings: Record<string, unknown>, isPackaged: boolean): string {
  if (!isPackaged && process.env.SOLODEX_RELAY_URL) return process.env.SOLODEX_RELAY_URL.replace(/\/+$/, '')
  if (typeof settings.issueRelayUrl === 'string' && settings.issueRelayUrl) return settings.issueRelayUrl.replace(/\/+$/, '')
  return ISSUES_RELAY_URL
}
