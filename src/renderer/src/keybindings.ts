export interface ShortcutDef {
  id: string
  label: string
  category: string
  defaultKey: string
  rebindable: boolean
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  // View Modes
  { id: 'viewPokedex',  label: 'Pokedex view',  category: 'View Modes', defaultKey: 'F1', rebindable: true },
  { id: 'viewEVs',      label: 'EVs view',      category: 'View Modes', defaultKey: 'F2', rebindable: true },
  { id: 'viewTrainers', label: 'Trainers view', category: 'View Modes', defaultKey: 'F3', rebindable: true },
  { id: 'viewDamage',   label: 'Damage view',   category: 'View Modes', defaultKey: 'F4', rebindable: true },
  { id: 'viewMovedex',  label: 'Movedex view',  category: 'View Modes', defaultKey: 'F5', rebindable: true },
  { id: 'viewNatures',  label: 'Natures view',  category: 'View Modes', defaultKey: 'F6', rebindable: true },

  // Search
  { id: 'spotlightSearch',  label: 'Pokemon search',  category: 'Search', defaultKey: 'Space',                 rebindable: true },
  { id: 'spotlightCompare', label: 'Compare search',   category: 'Search', defaultKey: 'CmdOrCtrl+Space',       rebindable: true },
  { id: 'trainerSpotlight', label: 'Trainer search',    category: 'Search', defaultKey: 'Shift+Space',           rebindable: true },
  { id: 'moveSpotlight',    label: 'Move search',      category: 'Search', defaultKey: 'CmdOrCtrl+Shift+Space', rebindable: true },

  // Navigation
  { id: 'navigateUp',   label: 'Previous Pokemon', category: 'Navigation', defaultKey: 'ArrowUp',    rebindable: true },
  { id: 'navigateDown', label: 'Next Pokemon',     category: 'Navigation', defaultKey: 'ArrowDown',  rebindable: true },
  { id: 'hideList',     label: 'Hide list panel',  category: 'Navigation', defaultKey: 'ArrowLeft',  rebindable: true },
  { id: 'showList',     label: 'Show list panel',  category: 'Navigation', defaultKey: 'ArrowRight', rebindable: true },
  { id: 'exitCompare',  label: 'Exit comparison',  category: 'Navigation', defaultKey: 'Escape',     rebindable: true },

  // Game Selection (read-only)
  { id: 'cycleGenGame', label: 'Cycle game in generation', category: 'Game Selection', defaultKey: 'CmdOrCtrl+1\u20139', rebindable: false },

  // In Search Overlays (read-only)
  { id: 'searchNavUp',   label: 'Previous result', category: 'In Search Overlays', defaultKey: 'ArrowUp',   rebindable: false },
  { id: 'searchNavDown', label: 'Next result',     category: 'In Search Overlays', defaultKey: 'ArrowDown', rebindable: false },
  { id: 'searchSelect',  label: 'Select result',   category: 'In Search Overlays', defaultKey: 'Enter',     rebindable: false },
  { id: 'searchDismiss', label: 'Close search',    category: 'In Search Overlays', defaultKey: 'Escape',    rebindable: false },

  // General (read-only)
  { id: 'closePopover', label: 'Close popover / modal', category: 'General', defaultKey: 'Escape', rebindable: false },
]

export const CATEGORIES = [...new Set(SHORTCUT_DEFS.map(d => d.category))]

export type ShortcutOverrides = Record<string, string>

const IS_MAC = (process.platform as string) === 'darwin'

/** Convert a KeyboardEvent to our shortcut string format. Returns null for standalone modifier presses. */
export function keyEventToString(e: KeyboardEvent): string | null {
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  parts.push(e.key === ' ' ? 'Space' : e.key)
  return parts.join('+')
}

/** Check if a KeyboardEvent matches a shortcut string */
export function matchesShortcut(e: KeyboardEvent, shortcutKey: string): boolean {
  const parts = shortcutKey.split('+')
  const key = parts[parts.length - 1]
  const needsCmdOrCtrl = parts.includes('CmdOrCtrl')
  const needsShift = parts.includes('Shift')
  const needsAlt = parts.includes('Alt')

  if (needsCmdOrCtrl !== (e.metaKey || e.ctrlKey)) return false
  if (needsShift !== e.shiftKey) return false
  if (needsAlt !== e.altKey) return false

  const eventKey = e.key === ' ' ? 'Space' : e.key
  return eventKey === key
}

/** Format a shortcut string for human-readable display */
export function formatKeyForDisplay(shortcutKey: string): string {
  return shortcutKey
    .replace(/CmdOrCtrl/g, IS_MAC ? '\u2318' : 'Ctrl')
    .replace(/Shift/g, IS_MAC ? '\u21E7' : 'Shift')
    .replace(/Alt/g, IS_MAC ? '\u2325' : 'Alt')
    .replace(/ArrowUp/g, '\u2191')
    .replace(/ArrowDown/g, '\u2193')
    .replace(/ArrowLeft/g, '\u2190')
    .replace(/ArrowRight/g, '\u2192')
    .replace(/\+/g, IS_MAC ? '' : ' + ')
}
