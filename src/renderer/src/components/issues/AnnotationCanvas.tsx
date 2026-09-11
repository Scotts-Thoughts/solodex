import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type Stroke,
  type Tool,
  type Point,
  fitRect,
  toImagePoint,
  paintStrokes,
  thinPoints,
  strokeWidthFor,
  strokeIsVisible,
} from '../../utils/issues/annotation'

export interface Shot {
  captureId: string | null
  dataUrl: string
  width: number
  height: number
}

interface Props {
  shot: Shot
  strokes: Stroke[]
  tool: Tool
  color: string
  onCommitStroke: (stroke: Stroke) => void
}

/**
 * The screenshot scaled to fit, with a canvas on top. Everything is drawn in
 * image coordinates; the canvas transform maps them to device pixels, so the
 * strokes line up with the full-resolution composite exactly.
 */
export default function AnnotationCanvas({ shot, strokes, tool, color, onCommitStroke }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const inProgress = useRef<Stroke | null>(null)
  const frame = useRef<number | null>(null)

  const dpr = window.devicePixelRatio || 1
  const fit = useMemo(() => fitRect(box.w, box.h, shot.width, shot.height), [box, shot.width, shot.height])
  // The capture's pixels per CSS pixel; the window can straddle monitors, so
  // derive it from the image rather than trusting devicePixelRatio alone.
  const captureScale = useMemo(() => shot.width / Math.max(1, window.innerWidth), [shot.width])

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const draw = useCallback(() => {
    frame.current = null
    const canvas = canvasRef.current
    if (!canvas || fit.width === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr * fit.scale, 0, 0, dpr * fit.scale, 0, 0)
    paintStrokes(ctx, strokes)
    if (inProgress.current) paintStrokes(ctx, [inProgress.current])
  }, [strokes, fit, dpr])

  useEffect(() => { draw() }, [draw])

  const scheduleDraw = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])

  const pointFromEvent = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return toImagePoint(e.clientX, e.clientY, rect, shot.width, shot.height)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = pointFromEvent(e)
    inProgress.current = { tool, color, width: strokeWidthFor(captureScale), points: [p] }
    scheduleDraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = inProgress.current
    if (!s) return
    const p = pointFromEvent(e)
    if (s.tool === 'pen') s.points.push(p)
    else s.points = [s.points[0], p]
    scheduleDraw()
  }

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = inProgress.current
    if (!s) return
    inProgress.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (s.tool === 'pen') s.points = thinPoints(s.points, s.width * 0.75)
    if (strokeIsVisible(s)) onCommitStroke(s)
    else scheduleDraw()
  }

  return (
    <div ref={boxRef} className="flex-1 min-h-0 relative overflow-hidden">
      {fit.width > 0 && (
        <>
          <img
            src={shot.dataUrl}
            alt="Screenshot"
            draggable={false}
            className="absolute select-none pointer-events-none shadow-2xl"
            style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height }}
          />
          <canvas
            ref={canvasRef}
            width={Math.round(fit.width * dpr)}
            height={Math.round(fit.height * dpr)}
            className="absolute cursor-crosshair"
            style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height, touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onContextMenu={e => e.preventDefault()}
          />
        </>
      )}
    </div>
  )
}
