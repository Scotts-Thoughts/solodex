import { useState, useEffect } from 'react'

type Phase = 'checking' | 'prompt' | 'dismissed' | 'hidden'

export default function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [latestVersion, setLatestVersion] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [showButton, setShowButton] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const neverRemind = await window.electronAPI.getUpdatePreference()
      if (cancelled) return
      if (neverRemind) {
        setPhase('hidden')
        // Still check silently so the button can appear
        const info = await window.electronAPI.checkForUpdates()
        if (cancelled) return
        if (info.hasUpdate) {
          setLatestVersion(info.latestVersion)
          setDownloadUrl(info.downloadUrl)
          setShowButton(true)
        }
        return
      }
      const info = await window.electronAPI.checkForUpdates()
      if (cancelled) return
      if (info.hasUpdate) {
        setLatestVersion(info.latestVersion)
        setDownloadUrl(info.downloadUrl)
        setPhase('prompt')
      } else {
        setPhase('hidden')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleUpdate = () => {
    window.electronAPI.openDownloadPage(downloadUrl)
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

  // Floating update button (shown after dismissal or "never remind")
  if ((phase === 'dismissed' || phase === 'hidden') && showButton) {
    return (
      <button
        onClick={handleUpdate}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg transition-colors"
        title={`Update to v${latestVersion}`}
      >
        Update Available (v{latestVersion})
      </button>
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

  return null
}
