import { useState, useEffect } from 'react'

type Phase = 'checking' | 'prompt' | 'dismissed' | 'hidden'
type UpdateStatus = 'downloading' | 'restarting'

function hasUpdateAPI(): boolean {
  const api = (typeof window !== 'undefined' && window.electronAPI)
  return Boolean(
    api &&
    typeof api.subscribeUpdateStatus === 'function' &&
    typeof api.getUpdatePreference === 'function' &&
    typeof api.checkForUpdates === 'function'
  )
}

export default function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [latestVersion, setLatestVersion] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [showButton, setShowButton] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null)
  const [isDev, setIsDev] = useState(false)
  const [hasAPI, setHasAPI] = useState(false)

  useEffect(() => {
    const ok = hasUpdateAPI()
    setHasAPI(ok)
    if (!ok) setPhase('hidden')
  }, [])

  useEffect(() => {
    if (!hasAPI) return
    const api = window.electronAPI
    if (typeof api.subscribeUpdateStatus !== 'function') return
    const unsubscribe = api.subscribeUpdateStatus((event: { type: string; percent?: number }) => {
      if (event.type === 'download-progress') {
        setUpdateStatus('downloading')
        if (event.percent != null) setDownloadPercent(Math.round(event.percent))
      } else if (event.type === 'restarting') {
        setUpdateStatus('restarting')
      } else if (event.type === 'simulation-done') {
        setUpdateStatus(null)
        setDownloadPercent(null)
      }
    })
    return unsubscribe
  }, [hasAPI])

  useEffect(() => {
    if (!hasAPI) return
    const api = window.electronAPI
    if (typeof api.getIsDev !== 'function') return
    api.getIsDev().then(setIsDev).catch(() => setIsDev(false))
  }, [hasAPI])

  useEffect(() => {
    if (!hasAPI) return
    let cancelled = false
    const api = window.electronAPI
    ;(async () => {
      try {
        const neverRemind = await api.getUpdatePreference()
        if (cancelled) return
        if (neverRemind) {
          setPhase('hidden')
          const info = await api.checkForUpdates()
          if (cancelled) return
          if (info.hasUpdate) {
            setLatestVersion(info.latestVersion)
            setDownloadUrl(info.downloadUrl)
            setShowButton(true)
          }
          return
        }
        const info = await api.checkForUpdates()
        if (cancelled) return
        if (info.hasUpdate) {
          setLatestVersion(info.latestVersion)
          setDownloadUrl(info.downloadUrl)
          setPhase('prompt')
        } else {
          setPhase('hidden')
        }
      } catch {
        if (!cancelled) setPhase('hidden')
      }
    })()
    return () => { cancelled = true }
  }, [hasAPI])

  const handleUpdate = async () => {
    setUpdateStatus('downloading')
    setDownloadPercent(null)
    try {
      const result = await window.electronAPI.performAutoUpdate()
      // In dev mode or if auto-update couldn't start, fall back to browser download
      if (!result?.started) {
        setUpdateStatus(null)
        window.electronAPI.openDownloadPage(downloadUrl)
      }
    } catch {
      // If anything goes wrong with auto-update, fall back to manual download
      setUpdateStatus(null)
      window.electronAPI.openDownloadPage(downloadUrl)
    }
  }

  const handleNotNow = () => {
    setPhase('dismissed')
    setShowButton(true)
  }

  const handleNever = () => {
    window.electronAPI.setUpdatePreference(true)
    setPhase('dismissed')
    setShowButton(true)
  }

  const handleSimulateUpdate = () => {
    setUpdateStatus('downloading')
    setDownloadPercent(null)
    window.electronAPI.simulateUpdateProgress()
  }

  // Progress banner (downloading or restarting)
  if (updateStatus) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-800 border-t border-gray-700 px-4 py-3 flex items-center gap-3 shadow-xl">
        <span className="inline-block w-5 h-5 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" aria-hidden />
        <span className="text-sm text-gray-200">
          {updateStatus === 'downloading' && (
            <>Downloading update{downloadPercent != null ? `… ${downloadPercent}%` : '…'} The app will restart when ready.</>
          )}
          {updateStatus === 'restarting' && <>Restarting…</>}
        </span>
      </div>
    )
  }

  // Floating update button (shown after dismissal or "never remind")
  if ((phase === 'dismissed' || phase === 'hidden') && showButton) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        {isDev && (
          <button
            onClick={handleSimulateUpdate}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded shadow-lg transition-colors"
            title="Simulate update flow (dev only)"
          >
            Simulate update
          </button>
        )}
        <button
          onClick={handleUpdate}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg transition-colors"
          title={`Update to v${latestVersion}`}
        >
          Update Available (v{latestVersion})
        </button>
      </div>
    )
  }

  // Prompt banner
  if (phase === 'prompt') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-800 border-t border-gray-700 px-4 py-2.5 flex items-center justify-between shadow-xl">
        <span className="text-sm text-gray-200">
          Solodex <span className="font-bold text-white">v{latestVersion}</span> is available.
        </span>
        <div className="flex items-center gap-2">
          {isDev && (
            <button
              onClick={handleSimulateUpdate}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors"
              title="Simulate update flow (dev only)"
            >
              Simulate update
            </button>
          )}
          <button
            onClick={handleUpdate}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors"
          >
            Update
          </button>
          <button
            onClick={handleNotNow}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded transition-colors"
          >
            Not Now
          </button>
          <button
            onClick={handleNever}
            className="px-3 py-1 text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            Never Remind Me
          </button>
        </div>
      </div>
    )
  }

  // Dev-only: simulate update flow when no update is available
  if (isDev && phase === 'hidden') {
    return (
      <button
        onClick={handleSimulateUpdate}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded shadow-lg transition-colors"
        title="Simulate update flow (dev only)"
      >
        Simulate update
      </button>
    )
  }

  return null
}

