import { formatKeyForDisplay } from '../../keybindings'

interface Props {
  onClick: () => void
  shortcut?: string
}

/**
 * Top-bar "report an issue" button. Stops mouse events from reaching the
 * document so open popovers (dismissed on document mousedown) are still on
 * screen when the screenshot is taken.
 */
export default function IssueButton({ onClick, shortcut }: Props) {
  return (
    <button
      type="button"
      data-export-ignore
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick() }}
      className="p-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700"
      title={`Report an issue${shortcut ? ` [${formatKeyForDisplay(shortcut)}]` : ''}`}
      aria-label="Report an issue"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1" />
        <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z" />
        <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
      </svg>
    </button>
  )
}
