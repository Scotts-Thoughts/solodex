import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GhIssueSummary, IssueRecord } from '../../../../shared/issues'
import StatusPill, { pillKindFor } from './StatusPill'
import { LocalIssueDetail, GithubIssueDetail } from './IssueDetail'

interface Props {
  onClose: () => void
  onNewReport: () => void
}

type Tab = 'mine' | 'github'

const TAB = 'px-3 py-1.5 text-xs font-bold transition-colors'

function shortDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

/** "My reports" for everyone; "All GitHub issues" with Resolve / Reopen in Developer Mode. */
export default function IssuesPanel({ onClose, onNewReport }: Props) {
  const [records, setRecords] = useState<IssueRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [developerMode, setDeveloperMode] = useState(false)
  const [tab, setTab] = useState<Tab>('mine')
  const [gh, setGh] = useState<{ loading: boolean; issues: GhIssueSummary[] | null; error: string | null }>({ loading: false, issues: null, error: null })
  const [ghSelected, setGhSelected] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)
  const lightboxOpen = useRef(false)

  const reload = useCallback(async () => {
    const list = await window.electronAPI.listIssues()
    setRecords(list)
    setSelectedId(prev => (prev && list.some(r => r.id === prev) ? prev : list[0]?.id ?? null))
  }, [])

  const loadGithub = useCallback(async () => {
    setGh(g => ({ ...g, loading: true, error: null }))
    const result = await window.electronAPI.devListGithubIssues()
    if (result.ok) {
      const sorted = result.value.slice().sort((a, b) => (a.state === b.state ? b.number - a.number : a.state === 'open' ? -1 : 1))
      setGh({ loading: false, issues: sorted, error: null })
      setGhSelected(prev => (prev && sorted.some(i => i.number === prev) ? prev : sorted[0]?.number ?? null))
    } else {
      setGh({ loading: false, issues: null, error: result.error })
    }
  }, [])

  useEffect(() => {
    void reload()
    window.electronAPI.getDeveloperMode().then(setDeveloperMode)
    const unsubChanged = window.electronAPI.subscribeIssuesChanged(() => { void reload() })
    const unsubDev = window.electronAPI.subscribeDeveloperMode(setDeveloperMode)
    // Status check on open (throttled inside main); the store change event re-lists.
    window.electronAPI.refreshIssueStatuses().then(() => reload()).catch(() => undefined)
    return () => { unsubChanged(); unsubDev() }
  }, [reload])

  useEffect(() => {
    if (tab === 'github' && gh.issues === null && !gh.loading) void loadGithub()
  }, [tab, gh.issues, gh.loading, loadGithub])

  useEffect(() => {
    if (!developerMode && tab === 'github') setTab('mine')
  }, [developerMode, tab])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lightboxOpen.current) {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const onLightbox = useCallback((open: boolean) => { lightboxOpen.current = open }, [])

  const checkNow = async () => {
    setChecking(true)
    try {
      for (const r of records) {
        if (r.remote && r.remote.status !== 'resolved' && r.remote.status !== 'not-planned') {
          await window.electronAPI.refreshIssueStatus(r.id, true).catch(() => undefined)
        }
      }
      await reload()
      if (tab === 'github') await loadGithub()
    } finally {
      setChecking(false)
    }
  }

  const selected = records.find(r => r.id === selectedId) ?? null
  const ghIssue = gh.issues?.find(i => i.number === ghSelected) ?? null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-label="Issues" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg shadow-2xl w-[920px] h-[85vh] flex flex-col border border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Issues</h2>
          {developerMode && (
            <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-900">
              <button type="button" onClick={() => setTab('mine')} className={`${TAB} ${tab === 'mine' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>My reports</button>
              <button type="button" onClick={() => setTab('github')} className={`${TAB} ${tab === 'github' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>All GitHub issues</button>
            </div>
          )}
          <div className="flex-1" />
          <button type="button" onClick={checkNow} disabled={checking} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-gray-200 transition-colors disabled:opacity-50">
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
          <button type="button" onClick={onNewReport} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors">
            New report
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-1 ml-1" aria-label="Close">&times;</button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-72 shrink-0 border-r border-gray-700 overflow-y-auto">
            {tab === 'mine' ? (
              records.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  No reports yet. Press the bug button in the top bar (or Help ▸ Report an Issue…) when something looks wrong.
                </div>
              ) : records.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-700/60 transition-colors ${r.id === selectedId ? 'bg-gray-700/60' : 'hover:bg-gray-700/30'}`}
                >
                  <div className="flex items-center gap-2">
                    <StatusPill kind={pillKindFor(r)} />
                    <span className="text-[11px] text-gray-500 ml-auto">{shortDate(r.createdAt)}</span>
                  </div>
                  <div className="text-sm text-gray-200 mt-1 truncate" title={r.title}>{r.title}</div>
                </button>
              ))
            ) : gh.loading ? (
              <div className="p-4 text-sm text-gray-500">Loading from GitHub…</div>
            ) : gh.error ? (
              <div className="p-4 text-sm text-red-300 select-text">
                {gh.error}
                <button type="button" onClick={loadGithub} className="block mt-2 text-xs text-blue-400 hover:underline">Try again</button>
              </div>
            ) : gh.issues && gh.issues.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No issues on GitHub.</div>
            ) : (gh.issues ?? []).map(i => (
              <button
                key={i.number}
                type="button"
                onClick={() => setGhSelected(i.number)}
                className={`w-full text-left px-4 py-2.5 border-b border-gray-700/60 transition-colors ${i.number === ghSelected ? 'bg-gray-700/60' : 'hover:bg-gray-700/30'}`}
              >
                <div className="flex items-center gap-2">
                  <StatusPill kind={i.status} />
                  <span className="text-[11px] text-gray-500 ml-auto font-mono">#{i.number}</span>
                </div>
                <div className="text-sm text-gray-200 mt-1 truncate" title={i.title}>{i.title}</div>
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-4">
            {tab === 'mine'
              ? selected
                ? <LocalIssueDetail record={selected} developerMode={developerMode} onLightbox={onLightbox} onChanged={reload} />
                : null
              : ghIssue
                ? <GithubIssueDetail issue={ghIssue} onLightbox={onLightbox} onChanged={loadGithub} />
                : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
