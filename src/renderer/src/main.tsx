import React, { Component, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installRendererErrorCapture } from './utils/issues/errorLog'
import IssueReporter from './components/issues/IssueReporter'
import { loadGame, preloadAllData } from './data'
import { resolveInitialSelection } from './utils/initialSelection'

installRendererErrorCapture()

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; reporting: boolean }> {
  state = { error: null as Error | null, reporting: false }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const { message, stack } = this.state.error
      return (
        <div style={{
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          background: '#111',
          color: '#fcc',
          minHeight: '100vh',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <strong>Something went wrong</strong>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => this.setState({ reporting: true })}
              style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 4, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}
            >
              Report this problem
            </button>
          </div>
          <pre style={{ marginTop: 12, fontSize: 12 }}>{message}</pre>
          <pre style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>{stack}</pre>
          {this.state.reporting && (
            <IssueReporter
              request={{
                source: 'error-boundary',
                prefill: { title: `Crash: ${message.slice(0, 90)}`, description: `The app showed "Something went wrong".\n\n${message}\n\n${stack ?? ''}` },
              }}
              onClose={() => this.setState({ reporting: false })}
            />
          )}
        </div>
      )
    }
    return this.props.children
  }
}

async function boot(): Promise<void> {
  // Only the game the app opens on is loaded before the first render (a few
  // ms); every other game, trainer and encounter table streams in afterwards.
  const initial = resolveInitialSelection()
  if (initial?.game) {
    try {
      await loadGame(initial.game)
    } catch (err) {
      console.error('[Solodex] failed to load initial game data:', err)
    }
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )

  // Warm the remaining tables once the first frame is on screen.
  requestAnimationFrame(() => setTimeout(() => { void preloadAllData() }, 250))
}

void boot()
