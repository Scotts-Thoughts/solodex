// Shared Tailwind class fragments for the Misc calculators. The violet accent
// (#8b5cf6 / violet-500/600) is the Misc area's color, distinct from the
// per-game tab colors used elsewhere.

export const MISC_ACCENT = '#8b5cf6' // violet-500

export const NUMBER_INPUT_CLS =
  'w-16 rounded bg-gray-800 border border-gray-600 px-2 py-1 text-sm text-white text-right tabular-nums focus:outline-none focus:border-violet-500'

export const LABEL_CLS = 'text-xs font-semibold text-gray-400 uppercase tracking-wider'

/** Pill-style toggle button (quick-set accuracies, modifier chips, segmented choices). */
export function pillCls(active: boolean, disabled = false): string {
  if (disabled) {
    return 'px-2.5 py-1 rounded text-xs font-semibold border bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
  }
  return [
    'px-2.5 py-1 rounded text-xs font-semibold border transition-colors',
    active
      ? 'bg-violet-600 border-violet-500 text-white'
      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500',
  ].join(' ')
}
