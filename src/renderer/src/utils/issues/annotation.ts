// Geometry and painting for the screenshot annotation overlay. Strokes are
// stored in *image* pixels (the capture's native resolution) so the display
// scale never affects what ends up in the composited PNG. The pure functions
// are unit-tested; the two DOM helpers at the bottom are not.

export type Tool = 'pen' | 'rect' | 'arrow'

export interface Point { x: number; y: number }

export interface Stroke {
  tool: Tool
  color: string
  /** Line width in image pixels. */
  width: number
  points: Point[]
}

export interface FitRect {
  left: number
  top: number
  width: number
  height: number
  /** Display pixels per image pixel (≤ 1). */
  scale: number
}

export const ANNOTATION_COLORS: { key: string; label: string; value: string }[] = [
  { key: '1', label: 'Red', value: '#ef4444' },
  { key: '2', label: 'Yellow', value: '#facc15' },
  { key: '3', label: 'Blue', value: '#3b82f6' },
]

/** Centre an image inside a box without upscaling. */
export function fitRect(boxW: number, boxH: number, imgW: number, imgH: number): FitRect {
  if (boxW <= 0 || boxH <= 0 || imgW <= 0 || imgH <= 0) return { left: 0, top: 0, width: 0, height: 0, scale: 1 }
  const scale = Math.min(1, boxW / imgW, boxH / imgH)
  const width = Math.round(imgW * scale)
  const height = Math.round(imgH * scale)
  return { left: Math.round((boxW - width) / 2), top: Math.round((boxH - height) / 2), width, height, scale }
}

/** Client coordinates → image pixels, clamped to the image. */
export function toImagePoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  imgW: number,
  imgH: number
): Point {
  const scale = rect.width > 0 ? imgW / rect.width : 1
  const x = Math.min(imgW, Math.max(0, (clientX - rect.left) * scale))
  const y = Math.min(imgH, Math.max(0, (clientY - rect.top) * scale))
  return { x, y }
}

/** Rectangle from two corners dragged in any direction. */
export function normalizeRect(a: Point, b: Point): { x: number; y: number; w: number; h: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

/** The two base corners of an arrow head pointing at `b`. */
export function arrowHeadPoints(a: Point, b: Point, headLen: number, spread = Math.PI / 7): [Point, Point] {
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  return [
    { x: b.x - headLen * Math.cos(angle - spread), y: b.y - headLen * Math.sin(angle - spread) },
    { x: b.x - headLen * Math.cos(angle + spread), y: b.y - headLen * Math.sin(angle + spread) },
  ]
}

/** Drop points closer than `minDist` to the previous kept point; endpoints always survive. */
export function thinPoints(points: Point[], minDist: number): Point[] {
  if (points.length <= 2) return points.slice()
  const out: Point[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1]
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDist) out.push(points[i])
  }
  out.push(points[points.length - 1])
  return out
}

/** 3 CSS px on screen, expressed in image pixels for the capture's scale. */
export function strokeWidthFor(captureScale: number): number {
  return Math.max(2, Math.round(3 * captureScale))
}

export function strokeIsVisible(stroke: Stroke): boolean {
  if (stroke.tool === 'pen') return stroke.points.length >= 2
  if (stroke.points.length < 2) return false
  const [a, b] = stroke.points
  return Math.hypot(b.x - a.x, b.y - a.y) >= 3
}

/** Paint strokes in image coordinates on a context whose transform already maps image px → device px. */
export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]): void {
  for (const s of strokes) {
    if (s.points.length === 0) continue
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (s.tool === 'pen') {
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      if (s.points.length === 1) ctx.lineTo(s.points[0].x + 0.01, s.points[0].y)
      ctx.stroke()
    } else if (s.tool === 'rect') {
      if (s.points.length < 2) continue
      const r = normalizeRect(s.points[0], s.points[1])
      ctx.strokeRect(r.x, r.y, r.w, r.h)
    } else {
      if (s.points.length < 2) continue
      const [a, b] = s.points
      const headLen = Math.max(14, s.width * 4.5)
      const [h1, h2] = arrowHeadPoints(a, b, headLen)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(h1.x, h1.y)
      ctx.lineTo(h2.x, h2.y)
      ctx.closePath()
      ctx.fill()
    }
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const bin = atob(dataUrl.slice(comma + 1))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Original screenshot + strokes at native resolution, as PNG bytes. */
export async function compositeAnnotated(
  shot: { dataUrl: string; width: number; height: number },
  strokes: Stroke[]
): Promise<Uint8Array> {
  if (strokes.length === 0) return dataUrlToBytes(shot.dataUrl)
  const img = await loadImage(shot.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = shot.width
  canvas.height = shot.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, shot.width, shot.height)
  paintStrokes(ctx, strokes)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not encode the annotated screenshot')
  return new Uint8Array(await blob.arrayBuffer())
}
