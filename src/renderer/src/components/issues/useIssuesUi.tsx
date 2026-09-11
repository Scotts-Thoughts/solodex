import { useCallback, useEffect, useState } from 'react'
import type { IssueSource } from '../../../../shared/issues'
import { setIssueAppState } from '../../utils/issues/context'
import IssueReporter, { type ReporterRequest } from './IssueReporter'
import IssuesPanel from './IssuesPanel'

interface AppState {
  selectedGame: string
  selected: string | null
  viewMode: string
  selectedTrainer: string | null
}

/**
 * Owns the reporter / panel open state and the menu subscriptions so App.tsx
 * only has to mount `ui`, guard its shortcut handler with `anyOpen`, and call
 * `openReporter` from the button and the keyboard shortcut.
 */
export function useIssuesUi(appState: AppState) {
  const [request, setRequest] = useState<ReporterRequest | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    setIssueAppState({ view: appState.viewMode, game: appState.selectedGame, species: appState.selected, trainer: appState.selectedTrainer })
  }, [appState.viewMode, appState.selectedGame, appState.selected, appState.selectedTrainer])

  const openReporter = useCallback((source: IssueSource) => {
    setPanelOpen(false)
    setRequest(prev => prev ?? { source })
  }, [])
  const openPanel = useCallback(() => setPanelOpen(true), [])

  useEffect(() => window.electronAPI.subscribeOpenIssueReporter(() => openReporter('menu')), [openReporter])
  useEffect(() => window.electronAPI.subscribeOpenIssuesPanel(openPanel), [openPanel])

  const ui = (
    <>
      {request && (
        <IssueReporter
          request={request}
          onClose={() => setRequest(null)}
          onOpenPanel={() => { setRequest(null); setPanelOpen(true) }}
        />
      )}
      {panelOpen && <IssuesPanel onClose={() => setPanelOpen(false)} onNewReport={() => openReporter('button')} />}
    </>
  )

  return { anyOpen: request !== null || panelOpen, openReporter, openPanel, ui }
}
