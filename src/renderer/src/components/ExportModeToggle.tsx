export type ExportMode = 'copy' | 'download'

export default function ExportModeToggle({ mode, onChange }: { mode: ExportMode; onChange: (mode: ExportMode) => void }) {
  return (
    <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-800 text-[11px]">
      <button
        onClick={() => onChange('copy')}
        className={`px-2 py-0.5 font-semibold transition-colors ${mode === 'copy' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
      >
        Copy
      </button>
      <button
        onClick={() => onChange('download')}
        className={`px-2 py-0.5 font-semibold transition-colors ${mode === 'download' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
      >
        Download
      </button>
    </div>
  )
}
