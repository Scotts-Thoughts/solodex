export type ExportMode = 'copy' | 'download'

const STORAGE_KEY = 'exportMode'

export function getStoredExportMode(): ExportMode {
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'download' ? 'download' : 'copy'
}

export default function ExportModeToggle({ mode, onChange }: { mode: ExportMode; onChange: (mode: ExportMode) => void }) {
  const handleChange = (m: ExportMode) => {
    localStorage.setItem(STORAGE_KEY, m)
    onChange(m)
  }
  return (
    <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-800 text-[11px]">
      <button
        onClick={() => handleChange('copy')}
        className={`px-2 py-0.5 font-semibold transition-colors ${mode === 'copy' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
      >
        Copy
      </button>
      <button
        onClick={() => handleChange('download')}
        className={`px-2 py-0.5 font-semibold transition-colors ${mode === 'download' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
      >
        Export
      </button>
    </div>
  )
}
