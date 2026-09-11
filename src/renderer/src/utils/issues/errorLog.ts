// Ring buffer of recent renderer errors, attached to bug reports as
// diagnostics. Installed once from main.tsx; nothing here ever throws into
// the app.
import { type RecentError, pushBounded } from '../../../../shared/issues'

const MAX_ENTRIES = 30
const MAX_MESSAGE = 2000
const MAX_STACK = 4000

let entries: RecentError[] = []
let installed = false

export function getRecentErrors(): RecentError[] {
  return entries.slice()
}

export function recordError(entry: RecentError): void {
  entries = pushBounded(entries, {
    ...entry,
    message: entry.message.slice(0, MAX_MESSAGE),
    stack: entry.stack ? entry.stack.slice(0, MAX_STACK) : undefined,
  }, MAX_ENTRIES)
}

/** Flatten console.error arguments into one line plus the first stack found. */
export function formatConsoleArgs(args: unknown[]): { message: string; stack?: string } {
  let stack: string | undefined
  const parts = args.map(a => {
    if (a instanceof Error) {
      stack ??= a.stack
      return a.message
    }
    if (typeof a === 'string') return a
    try {
      return JSON.stringify(a)
    } catch {
      return Object.prototype.toString.call(a)
    }
  })
  return { message: parts.join(' '), stack }
}

export function installRendererErrorCapture(): void {
  if (installed) return
  installed = true
  window.addEventListener('error', (ev: ErrorEvent) => {
    const err = ev.error as { stack?: string } | undefined
    recordError({ at: new Date().toISOString(), source: 'renderer', message: ev.message || String(ev.error ?? 'error'), stack: err?.stack })
  })
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason = ev.reason as { message?: string; stack?: string } | undefined
    const message = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : JSON.stringify(reason ?? null)
    recordError({ at: new Date().toISOString(), source: 'renderer', message: `Unhandled rejection: ${message}`, stack: reason?.stack })
  })
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    try {
      recordError({ at: new Date().toISOString(), source: 'console', ...formatConsoleArgs(args) })
    } catch {
      // never let diagnostics break the app
    }
    original(...args)
  }
}
