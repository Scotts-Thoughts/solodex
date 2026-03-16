import { useCallback, useEffect, useRef } from 'react'

interface UseDragResizeOptions {
  width: number
  setWidth: (w: number) => void
  minWidth: number
  maxWidth?: number
  onDragEnd?: (width: number) => void
}

export function useDragResize({ width, setWidth, minWidth, maxWidth = 480, onDragEnd }: UseDragResizeOptions) {
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - dragStartX.current
      const next = Math.max(minWidth, Math.min(maxWidth, dragStartWidth.current + delta))
      setWidth(next)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onDragEnd?.(width)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [minWidth, maxWidth, setWidth, onDragEnd, width])

  return { onDragStart }
}
