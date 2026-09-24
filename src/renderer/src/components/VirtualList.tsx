import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface Props<T> {
  items: T[]
  /** Every row must render at exactly this height (px). */
  rowHeight: number
  renderRow: (item: T, index: number) => ReactNode
  /** Row index to keep in view; scrolled to with "nearest" semantics whenever it changes. */
  scrollToIndex?: number
  /** Rows rendered beyond each edge of the viewport. */
  overscan?: number
  className?: string
  /** Rendered after the rows (e.g. an empty-state message). */
  footer?: ReactNode
}

/**
 * Fixed-row-height windowed list: only the rows in (and just around) the
 * visible area are mounted, so a 1,300-row list costs the same as a 40-row one.
 */
export default function VirtualList<T>({ items, rowHeight, renderRow, scrollToIndex, overscan = 8, className, footer }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setViewport(el.clientHeight)
    const observer = new ResizeObserver(() => setViewport(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const onScroll = useCallback(() => {
    const el = ref.current
    if (el) setScrollTop(el.scrollTop)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || scrollToIndex == null || scrollToIndex < 0) return
    const top = scrollToIndex * rowHeight
    const bottom = top + rowHeight
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
  }, [scrollToIndex, rowHeight])

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / rowHeight) + overscan)
  const rows: ReactNode[] = []
  for (let i = start; i < end; i++) rows.push(renderRow(items[i], i))

  return (
    <div ref={ref} onScroll={onScroll} className={className}>
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0 }}>{rows}</div>
      </div>
      {footer}
    </div>
  )
}
