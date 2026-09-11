import { useCallback, useEffect, useRef, useState } from 'react'
import type { IssueRecord, IssueSource, NewIssueInput } from '../../../../shared/issues'
import { type Stroke, compositeAnnotated } from '../../utils/issues/annotation'
import { buildDiagnostics } from '../../utils/issues/context'
import { releaseAttachment } from '../../utils/issues/attachments'
import AnnotationOverlay from './AnnotationOverlay'
import type { Shot } from './AnnotationCanvas'
import IssueForm, { type Draft } from './IssueForm'
import IssueSubmitResult from './IssueSubmitResult'

export interface ReporterRequest {
  source: IssueSource
  prefill?: { title?: string; description?: string }
}

interface Props {
  request: ReporterRequest
  onClose: () => void
  onOpenPanel?: () => void
}

type State =
  | { step: 'capturing' }
  | { step: 'annotating'; shot: Shot; strokes: Stroke[]; draft: Draft }
  | { step: 'form'; shot: Shot | null; strokes: Stroke[]; draft: Draft; annotatedPng: Uint8Array | null; error: string | null }
  | { step: 'submitting'; shot: Shot | null; strokes: Stroke[]; draft: Draft; annotatedPng: Uint8Array | null }
  | { step: 'done'; record: IssueRecord }
  | { step: 'error'; message: string; shot: Shot | null; strokes: Stroke[]; draft: Draft; annotatedPng: Uint8Array | null }

function nextFrames(n: number): Promise<void> {
  return new Promise(resolve => {
    const tick = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1)))
    tick(n)
  })
}

/** DOM-based capture for when `capturePage` yields nothing (e.g. GPU init failed). */
async function captureDomFallback(): Promise<Shot | null> {
  try {
    const { toCanvas } = await import('html-to-image')
    const canvas = await toCanvas(document.documentElement, {
      pixelRatio: window.devicePixelRatio || 1,
      backgroundColor: '#0f1419',
      filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
    })
    if (canvas.width === 0 || canvas.height === 0) return null
    return { captureId: null, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
  } catch (err) {
    console.warn('[Solodex] issues: DOM screenshot fallback failed:', err)
    return null
  }
}

/**
 * The "report an issue" flow: capture → annotate → form → submit → result.
 * Depends only on window.electronAPI, so it also runs from the crash screen
 * where the rest of the app is unmounted.
 */
export default function IssueReporter({ request, onClose, onOpenPanel }: Props) {
  const [state, setState] = useState<State>({ step: 'capturing' })
  const [relayConfigured, setRelayConfigured] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const captured = useRef(false)
  const draftRef = useRef<Draft | null>(null)

  const initialDraft = useCallback((): Draft => ({
    title: request.prefill?.title ?? '',
    description: request.prefill?.description ?? '',
    sendToDeveloper: true,
    attachments: [],
  }), [request.prefill])

  // Capture first, before anything of this component is on screen. Two
  // frames let a closing panel unmount so it is not in the shot.
  useEffect(() => {
    if (captured.current) return
    captured.current = true
    let cancelled = false
    ;(async () => {
      const [info] = await Promise.all([window.electronAPI.getIssueAppInfo().catch(() => null), nextFrames(2)])
      if (info) setRelayConfigured(info.relayConfigured)
      let shot: Shot | null = null
      try { shot = await window.electronAPI.captureIssueScreenshot() } catch { shot = null }
      if (!shot) shot = await captureDomFallback()
      if (cancelled) return
      const draft = initialDraft()
      if (shot) setState({ step: 'annotating', shot, strokes: [], draft })
      else setState({ step: 'form', shot: null, strokes: [], draft, annotatedPng: null, error: null })
    })()
    return () => { cancelled = true }
  }, [initialDraft])

  // Keep the current draft reachable for cleanup, and prevent a missed drop
  // from navigating the window while the reporter is open.
  useEffect(() => {
    if ('draft' in state) draftRef.current = state.draft
  }, [state])
  useEffect(() => {
    const block = (e: DragEvent) => { e.preventDefault() }
    document.addEventListener('dragover', block)
    document.addEventListener('drop', block)
    return () => {
      document.removeEventListener('dragover', block)
      document.removeEventListener('drop', block)
    }
  }, [])
  useEffect(() => () => {
    draftRef.current?.attachments.forEach(releaseAttachment)
  }, [])

  // Object URL for the annotated preview in the form.
  useEffect(() => {
    if (state.step !== 'form' || !state.annotatedPng) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(new Blob([state.annotatedPng as BlobPart], { type: 'image/png' }))
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [state.step === 'form' ? state.annotatedPng : null])

  const submit = useCallback(async (shot: Shot | null, strokes: Stroke[], draft: Draft, annotatedPng: Uint8Array | null) => {
    setState({ step: 'submitting', shot, strokes, draft, annotatedPng })
    const input: NewIssueInput = {
      title: draft.title,
      description: draft.description,
      diagnostics: buildDiagnostics(request.source),
      sendToDeveloper: relayConfigured && draft.sendToDeveloper,
      captureId: shot?.captureId ?? null,
      screenshotPng: annotatedPng,
      screenshotSize: shot ? { width: shot.width, height: shot.height } : null,
      attachments: draft.attachments.map(a => ({ name: a.name, mime: a.mime, data: a.data })),
    }
    try {
      const record = await window.electronAPI.createIssue(input)
      setState({ step: 'done', record })
    } catch (err) {
      setState({ step: 'error', message: (err as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''), shot, strokes, draft, annotatedPng })
    }
  }, [request.source, relayConfigured])

  const continueToForm = useCallback(async () => {
    if (state.step !== 'annotating') return
    const { shot, strokes, draft } = state
    try {
      const annotatedPng = await compositeAnnotated(shot, strokes)
      setState({ step: 'form', shot, strokes, draft, annotatedPng, error: null })
    } catch (err) {
      setState({ step: 'form', shot, strokes, draft, annotatedPng: null, error: `Screenshot could not be prepared: ${(err as Error).message}` })
    }
  }, [state])

  const undo = useCallback(() => {
    setState(s => (s.step === 'annotating' ? { ...s, strokes: s.strokes.slice(0, -1) } : s))
  }, [])
  const clear = useCallback(() => {
    setState(s => (s.step === 'annotating' ? { ...s, strokes: [] } : s))
  }, [])
  const commitStroke = useCallback((stroke: Stroke) => {
    setState(s => (s.step === 'annotating' ? { ...s, strokes: [...s.strokes, stroke] } : s))
  }, [])

  switch (state.step) {
    case 'capturing':
      return null
    case 'annotating':
      return (
        <AnnotationOverlay
          shot={state.shot}
          strokes={state.strokes}
          onCommitStroke={commitStroke}
          onUndo={undo}
          onClear={clear}
          onContinue={continueToForm}
          onCancel={onClose}
        />
      )
    case 'form': {
      const { shot, strokes, draft, annotatedPng, error } = state
      return (
        <IssueForm
          draft={draft}
          onChange={d => setState(s => (s.step === 'form' ? { ...s, draft: d } : s))}
          previewUrl={previewUrl}
          relayConfigured={relayConfigured}
          onBack={shot ? () => setState({ step: 'annotating', shot, strokes, draft }) : null}
          onCancel={onClose}
          onSubmit={() => void submit(shot, strokes, draft, annotatedPng)}
          error={error}
        />
      )
    }
    case 'submitting':
      return <IssueSubmitResult phase={{ kind: 'submitting' }} onClose={() => undefined} onRetry={() => undefined} onBack={() => undefined} />
    case 'done':
      return <IssueSubmitResult phase={{ kind: 'done', record: state.record }} onClose={onClose} onRetry={() => undefined} onBack={() => undefined} onOpenPanel={onOpenPanel} />
    case 'error': {
      const { shot, strokes, draft, annotatedPng, message } = state
      return (
        <IssueSubmitResult
          phase={{ kind: 'error', message }}
          onClose={onClose}
          onRetry={() => void submit(shot, strokes, draft, annotatedPng)}
          onBack={() => setState({ step: 'form', shot, strokes, draft, annotatedPng, error: null })}
        />
      )
    }
  }
}
