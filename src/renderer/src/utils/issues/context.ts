// What the renderer knows about the moment a report is filed: which screen
// the user was on and what the window looked like. `useIssuesUi` keeps the
// app state fresh; the reporter reads it when the form is submitted.
import type { IssueSource, RendererDiagnostics } from '../../../../shared/issues'
import { getRecentErrors } from './errorLog'

interface AppState {
  view: string
  game: string
  species: string | null
  trainer: string | null
}

let appState: AppState = { view: 'pokemon', game: '', species: null, trainer: null }

export function setIssueAppState(next: Partial<AppState>): void {
  appState = { ...appState, ...next }
}

export function buildDiagnostics(source: IssueSource): RendererDiagnostics {
  return {
    source,
    window: { width: window.innerWidth, height: window.innerHeight, scaleFactor: window.devicePixelRatio },
    state: { ...appState },
    recentErrors: getRecentErrors().slice(-10),
  }
}
