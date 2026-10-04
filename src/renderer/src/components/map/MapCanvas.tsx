import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { MapRenderer, fitCamera, type Camera, type Layers, type Overlay } from '../../map/renderer'
import type { MapPack } from '../../map/pack'
import type { Rect, Scope } from '../../map/geom'

export interface MapCanvasHandle {
  /** Ease the camera to show a scope rect. */
  fit(r: Rect, opts?: { animate?: boolean; maxZoom?: number; margin?: number }): void
  /** Ease the camera to centre a scope px, optionally at a zoom. */
  centerOn(x: number, y: number, zoom?: number): void
  /** Jump (or ease) to a camera. */
  setView(cam: Camera, animate: boolean): void
  zoomBy(factor: number): void
  camera(): Camera
  size(): { w: number; h: number }
}

interface Props {
  pack: MapPack
  scope: Scope
  layers: Layers
  overlay: Overlay
  version: string | null
  onClick: (x: number, y: number, objectIndex: number | null) => void
  onDoubleClick: (x: number, y: number, objectIndex: number | null) => void
  onHover: (x: number, y: number, objectIndex: number | null) => void
  onCamera: (cam: Camera) => void
  /** The canvas has its size: the camera can be placed. */
  onReady: () => void
}

const MIN_ZOOM = 0.02
const MAX_ZOOM = 10
const EASE_MS = 260

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(props, ref) {
  const { pack, scope, layers, overlay, version } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cam = useRef<Camera>({ x: 0, y: 0, zoom: 1 })
  const anim = useRef<{ from: Camera; to: Camera; start: number } | null>(null)
  const size = useRef({ w: 1, h: 1 })
  const ready = useRef(false)
  const frame = useRef(0)
  const latest = useRef(props)
  latest.current = props
  const renderer = useRef<MapRenderer | null>(null)
  if (!renderer.current || renderer.current.pack !== pack) {
    renderer.current = new MapRenderer(pack, () => requestDraw())
  }

  const draw = useCallback(() => {
    frame.current = 0
    const canvas = canvasRef.current
    const r = renderer.current
    // nothing to draw (or report) until the first measurement has placed the camera
    if (!canvas || !r || !ready.current) return
    const a = anim.current
    if (a) {
      const t = Math.min(1, (performance.now() - a.start) / EASE_MS)
      const e = 1 - (1 - t) ** 3
      // ease zoom geometrically and the centre linearly
      const z = a.from.zoom * (a.to.zoom / a.from.zoom) ** e
      const { w, h } = size.current
      const fc = [a.from.x + w / a.from.zoom / 2, a.from.y + h / a.from.zoom / 2]
      const tc = [a.to.x + w / a.to.zoom / 2, a.to.y + h / a.to.zoom / 2]
      const c = [fc[0] + (tc[0] - fc[0]) * e, fc[1] + (tc[1] - fc[1]) * e]
      cam.current = { zoom: z, x: c[0] - w / z / 2, y: c[1] - h / z / 2 }
      if (t >= 1) anim.current = null
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const p = latest.current
    const dpr = window.devicePixelRatio || 1
    r.draw(ctx, size.current.w, size.current.h, dpr, p.scope, cam.current, p.layers, p.overlay, p.version)
    p.onCamera(cam.current)
    if (anim.current || r.animating) requestDraw()
  }, [])

  const requestDraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current) }, [])
  useEffect(() => { requestDraw() }, [pack, scope, layers, overlay, version, requestDraw])

  // keep the canvas at the container's size (device px)
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      // keep the view centred through a resize
      const c = cam.current
      const cx = c.x + size.current.w / c.zoom / 2
      const cy = c.y + size.current.h / c.zoom / 2
      size.current = { w: Math.max(1, w), h: Math.max(1, h) }
      cam.current = { ...c, x: cx - size.current.w / c.zoom / 2, y: cy - size.current.h / c.zoom / 2 }
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      if (!ready.current && w > 0 && h > 0) {
        ready.current = true
        latest.current.onReady()
      }
      draw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  const setCamera = useCallback((to: Camera, animate: boolean) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, to.zoom))
    const { w, h } = size.current
    const target = { zoom: z, x: to.x + w / to.zoom / 2 - w / z / 2, y: to.y + h / to.zoom / 2 - h / z / 2 }
    if (animate) anim.current = { from: { ...cam.current }, to: target, start: performance.now() }
    else { anim.current = null; cam.current = target }
    requestDraw()
  }, [requestDraw])

  useImperativeHandle(ref, () => ({
    fit(r, opts = {}) {
      const { w, h } = size.current
      setCamera(fitCamera(r, w, h, opts.margin ?? 24, opts.maxZoom ?? 4), opts.animate ?? true)
    },
    centerOn(x, y, zoom) {
      const z = zoom ?? cam.current.zoom
      const { w, h } = size.current
      setCamera({ zoom: z, x: x - w / z / 2, y: y - h / z / 2 }, true)
    },
    setView(c, animate) {
      setCamera(c, animate)
    },
    zoomBy(factor) {
      const c = cam.current
      const { w, h } = size.current
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor))
      setCamera({ zoom: z, x: c.x + w / c.zoom / 2 - w / z / 2, y: c.y + h / c.zoom / 2 - h / z / 2 }, true)
    },
    camera: () => cam.current,
    size: () => size.current,
  }), [setCamera])

  // ── input ──
  const toScope = (e: { clientX: number; clientY: number }): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const c = cam.current
    return [c.x + (e.clientX - rect.left) / c.zoom, c.y + (e.clientY - rect.top) / c.zoom]
  }
  const objectUnder = (x: number, y: number) => {
    const p = latest.current
    return renderer.current!.objectAt(p.scope, x, y, cam.current, p.layers, p.version)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      anim.current = null
      const c = cam.current
      if (e.shiftKey) {
        cam.current = { ...c, x: c.x + e.deltaY / c.zoom, y: c.y }
      } else {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * Math.exp(-dy * 0.0025)))
        // keep the point under the cursor fixed
        const wx = c.x + mx / c.zoom
        const wy = c.y + my / c.zoom
        cam.current = { zoom: z, x: wx - mx / z, y: wy - my / z }
      }
      requestDraw()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [requestDraw])

  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null)
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    anim.current = null
    drag.current = { x: e.clientX, y: e.clientY, cam: { ...cam.current }, moved: false }
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const ddx = e.clientX - d.x
      const ddy = e.clientY - d.y
      if (!d.moved && Math.hypot(ddx, ddy) < 4) return
      d.moved = true
      cam.current = { zoom: d.cam.zoom, x: d.cam.x - ddx / d.cam.zoom, y: d.cam.y - ddy / d.cam.zoom }
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
      requestDraw()
    }
    const onUp = (e: MouseEvent) => {
      const d = drag.current
      drag.current = null
      if (canvasRef.current) canvasRef.current.style.cursor = ''
      if (!d || d.moved || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      if (e.clientX < rect.left || e.clientY < rect.top || e.clientX > rect.right || e.clientY > rect.bottom) return
      const [x, y] = toScope(e)
      latest.current.onClick(x, y, objectUnder(x, y))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [requestDraw])

  const onMouseMove = (e: React.MouseEvent) => {
    if (drag.current?.moved) return
    const [x, y] = toScope(e)
    const obj = objectUnder(x, y)
    if (canvasRef.current) canvasRef.current.style.cursor = obj !== null ? 'pointer' : ''
    latest.current.onHover(x, y, obj)
  }
  const onDoubleClick = (e: React.MouseEvent) => {
    const [x, y] = toScope(e)
    latest.current.onDoubleClick(x, y, objectUnder(x, y))
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-grab"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={() => latest.current.onHover(NaN, NaN, null)}
        onDoubleClick={onDoubleClick}
      />
    </div>
  )
})

export default MapCanvas
