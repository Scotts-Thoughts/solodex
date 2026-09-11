import { describe, it, expect } from 'vitest'
import { fitRect, toImagePoint, normalizeRect, arrowHeadPoints, thinPoints, strokeWidthFor, strokeIsVisible } from '../annotation'

describe('fitRect', () => {
  it('fits landscape and portrait images without upscaling', () => {
    expect(fitRect(1000, 500, 2000, 1000)).toEqual({ left: 0, top: 0, width: 1000, height: 500, scale: 0.5 })
    expect(fitRect(1000, 1000, 500, 1000)).toEqual({ left: 250, top: 0, width: 500, height: 1000, scale: 1 })
    expect(fitRect(1000, 1000, 100, 50).scale).toBe(1)
  })
  it('handles degenerate boxes', () => {
    expect(fitRect(0, 100, 10, 10).width).toBe(0)
  })
})

describe('toImagePoint', () => {
  it('maps display coordinates to image pixels and clamps', () => {
    const rect = { left: 100, top: 50, width: 700, height: 430 }
    expect(toImagePoint(100, 50, rect, 1400, 860)).toEqual({ x: 0, y: 0 })
    expect(toImagePoint(450, 265, rect, 1400, 860)).toEqual({ x: 700, y: 430 })
    expect(toImagePoint(5000, -10, rect, 1400, 860)).toEqual({ x: 1400, y: 0 })
  })
})

describe('shapes', () => {
  it('normalises rectangles dragged up/left', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 4, y: 2 })).toEqual({ x: 4, y: 2, w: 6, h: 18 })
  })
  it('builds a symmetric arrow head', () => {
    const [h1, h2] = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)
    expect(h1.x).toBeCloseTo(h2.x)
    expect(h1.y).toBeCloseTo(-h2.y)
    expect(h1.x).toBeLessThan(100)
  })
  it('thins dense pen points but keeps the endpoints', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 10, y: 0 }, { x: 11, y: 0 }]
    expect(thinPoints(pts, 5)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 11, y: 0 }])
    expect(thinPoints(pts.slice(0, 2), 5)).toHaveLength(2)
  })
  it('scales the stroke width with the capture and rejects invisible strokes', () => {
    expect(strokeWidthFor(1)).toBe(3)
    expect(strokeWidthFor(1.5)).toBe(5)
    expect(strokeWidthFor(0.1)).toBe(2)
    expect(strokeIsVisible({ tool: 'rect', color: '#f00', width: 3, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBe(false)
    expect(strokeIsVisible({ tool: 'pen', color: '#f00', width: 3, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBe(true)
  })
})
