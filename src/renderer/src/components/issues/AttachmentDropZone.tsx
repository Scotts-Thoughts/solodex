import { useRef, useState } from 'react'
import { ISSUE_LIMITS, formatBytes } from '../../../../shared/issues'
import type { PendingAttachment } from '../../utils/issues/attachments'

interface Props {
  attachments: PendingAttachment[]
  onFiles: (files: File[]) => void
  onRemove: (index: number) => void
  message: string | null
}

const ACCEPT = 'image/*,.png,.jpg,.jpeg,.gif,.webp,.txt,.log,.md,.json,.csv'

/** Drop zone + hidden file input + chips. Validation and reading happen in the parent. */
export default function AttachmentDropZone({ attachments, onFiles, onRemove, message }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const full = attachments.length >= ISSUE_LIMITS.maxFiles

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragEnter={e => { e.preventDefault(); setOver(true) }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true) }}
        onDragLeave={e => { e.preventDefault(); if (e.currentTarget === e.target) setOver(false) }}
        onDrop={e => {
          e.preventDefault()
          setOver(false)
          onFiles(Array.from(e.dataTransfer.files))
        }}
        className={[
          'rounded border border-dashed px-3 py-3 text-center text-xs transition-colors cursor-pointer select-none',
          over ? 'border-blue-500 bg-blue-900/20 text-blue-200' : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300',
        ].join(' ')}
      >
        {full
          ? `Up to ${ISSUE_LIMITS.maxFiles} files attached`
          : <>Drop screenshots, photos or text files here, or <span className="text-blue-400 underline">browse</span> · up to {ISSUE_LIMITS.maxFiles} files, {formatBytes(ISSUE_LIMITS.maxFileBytes)} each</>}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={e => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      {message && <div className="mt-1.5 text-xs text-red-400">{message}</div>}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span key={a.name} className="inline-flex items-center gap-1.5 rounded bg-gray-700 pl-1.5 pr-1 py-0.5 text-xs text-gray-200 max-w-[260px]">
              {a.previewUrl
                ? <img src={a.previewUrl} alt="" className="w-6 h-6 object-cover rounded" />
                : <span className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center text-[10px] font-mono text-gray-400">txt</span>}
              <span className="truncate" title={a.name}>{a.name}</span>
              <span className="text-gray-500">{formatBytes(a.data.byteLength)}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-gray-400 hover:text-white px-1 leading-none"
                title="Remove"
                aria-label={`Remove ${a.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
