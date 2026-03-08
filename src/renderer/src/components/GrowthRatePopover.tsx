import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'

// Standard Pokemon experience formulas by growth rate
function calcExp(rate: string, n: number): number {
  switch (rate) {
    case 'Erratic':
      if (n <= 50) return Math.floor((n * n * n * (100 - n)) / 50)
      if (n <= 68) return Math.floor((n * n * n * (150 - n)) / 100)
      if (n <= 98) return Math.floor((n * n * n * Math.floor((1911 - 10 * n) / 3)) / 500)
      return Math.floor((n * n * n * (160 - n)) / 100)
    case 'Fast':
      return Math.floor((4 * n * n * n) / 5)
    case 'Medium Fast':
      return n * n * n
    case 'Medium Slow':
      return Math.floor((6 / 5) * n * n * n - 15 * n * n + 100 * n - 140)
    case 'Slow':
      return Math.floor((5 * n * n * n) / 4)
    case 'Fluctuating':
      if (n <= 15) return Math.floor((n * n * n * ((Math.floor((n + 1) / 3) + 24) / 50)))
      if (n <= 36) return Math.floor((n * n * n * ((n + 14) / 50)))
      return Math.floor((n * n * n * ((Math.floor(n / 2) + 32) / 50)))
    default:
      return n * n * n
  }
}

const RATE_COLOR: Record<string, string> = {
  Erratic:       '#F59E0B',
  Fast:          '#22C55E',
  'Medium Fast': '#3B82F6',
  'Medium Slow': '#8B5CF6',
  Slow:          '#EF4444',
  Fluctuating:   '#EC4899',
}

// Key levels to show — enough to see the curve without being overwhelming
const LEVELS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
  71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
  91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
]

interface PopoverContentProps {
  growthRate: string
  anchorRect: DOMRect
  onClose: () => void
}

function PopoverContent({ growthRate, anchorRect, onClose }: PopoverContentProps) {
  const color = RATE_COLOR[growthRate] ?? '#6B7280'

  const table = useMemo(() => {
    return LEVELS.map(lv => {
      const total = calcExp(growthRate, lv)
      const prev = lv > 1 ? calcExp(growthRate, lv - 1) : 0
      return { lv, total, toNext: total - prev }
    })
  }, [growthRate])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-growth-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const POPOVER_WIDTH = 240
  const POPOVER_HEIGHT = 400
  const left = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
    ? anchorRect.right + 6
    : anchorRect.left - POPOVER_WIDTH - 6
  const top = Math.min(Math.max(6, anchorRect.top - 40), window.innerHeight - POPOVER_HEIGHT - 6)

  return createPortal(
    <div
      data-growth-popover
      style={{ position: 'fixed', top, left, zIndex: 9999, width: `${POPOVER_WIDTH}px` }}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl flex flex-col"
    >
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color }}>
          {growthRate}
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {table[table.length - 1].total.toLocaleString()} total exp to Lv100
        </p>
      </div>
      <div style={{ height: `${POPOVER_HEIGHT}px`, overflowY: 'auto' }}>
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-left text-gray-500 font-semibold w-10">Lv</th>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-right text-gray-500 font-semibold">Total Exp</th>
              <th className="sticky top-0 bg-gray-800 py-1 px-2 text-right text-gray-500 font-semibold">To Next</th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ lv, total, toNext }) => (
              <tr key={lv} className={lv % 10 === 0 ? 'bg-gray-700/20' : ''}>
                <td className="py-0.5 px-2 tabular-nums text-gray-400">{lv}</td>
                <td className="py-0.5 px-2 tabular-nums text-right text-gray-300">{total.toLocaleString()}</td>
                <td className="py-0.5 px-2 tabular-nums text-right text-gray-500">{toNext.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body
  )
}

interface Props {
  growthRate: string
}

export default function GrowthRatePopover({ growthRate }: Props) {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) {
      setOpen(false)
    } else {
      setAnchorRect(e.currentTarget.getBoundingClientRect())
      setOpen(true)
    }
  }, [open])

  return (
    <>
      <button
        onClick={handleClick}
        className="text-gray-300 font-medium hover:text-white cursor-pointer transition-colors"
      >
        {growthRate}
      </button>
      {open && anchorRect && (
        <PopoverContent
          growthRate={growthRate}
          anchorRect={anchorRect}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
