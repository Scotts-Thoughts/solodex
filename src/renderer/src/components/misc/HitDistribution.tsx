import { useMemo, useState } from 'react'
import { distribution, atLeast, atMost, expectedHits, stdDeviation } from '../../utils/hitProbability'
import { formatPercent, formatNumber } from './format'
import { MISC_ACCENT } from './uiStyles'

interface Props {
  n: number
  p: number
  k: number
  /** Click a bar/row to set k. */
  onSelectK?: (k: number) => void
}

/**
 * Shared results display for a binomial hit distribution: the three headline
 * framings (exactly / at least / at most K), expected hits, a horizontal bar
 * chart over 0..n, and an optional cumulative table. Presentation only — all
 * numbers come from the pure functions in utils/hitProbability.
 */
export default function HitDistribution({ n, p, k, onSelectK }: Props) {
  const [showTable, setShowTable] = useState(false)

  const dist = useMemo(() => distribution(n, p), [n, p])
  const maxP = useMemo(() => dist.reduce((m, v) => Math.max(m, v), 0), [dist])
  const least = useMemo(() => atLeast(k, n, p), [k, n, p])
  const most = useMemo(() => atMost(k, n, p), [k, n, p])

  const exactly = dist[k] ?? 0
  const ev = expectedHits(n, p)
  const sd = stdDeviation(n, p)

  return (
    <div className="flex flex-col gap-4">
      {/* Headline framings */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={`Exactly ${k}`} sub={`P(X = ${k})`} value={formatPercent(exactly)} highlight />
        <StatCard label={`At least ${k}`} sub={`P(X ≥ ${k})`} value={formatPercent(least)} />
        <StatCard label={`At most ${k}`} sub={`P(X ≤ ${k})`} value={formatPercent(most)} />
      </div>

      {/* Summary stats */}
      <div className="flex items-center gap-5 text-sm">
        <span className="text-gray-400">
          Expected hits:{' '}
          <span className="font-bold text-white tabular-nums">{formatNumber(ev)}</span>
          <span className="text-gray-500"> of {n}</span>
        </span>
        <span className="text-gray-500">
          σ = <span className="tabular-nums">{formatNumber(sd)}</span>
        </span>
      </div>

      {/* Distribution bar chart */}
      <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Distribution — P(X = i)
        </div>
        <div className="flex max-h-[360px] flex-col gap-1 overflow-y-auto pr-1">
          {dist.map((prob, i) => {
            const selected = i === k
            const widthPct = maxP > 0 ? (prob / maxP) * 100 : 0
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectK?.(i)}
                className="flex items-center gap-2 text-left"
                title={`P(X = ${i}) = ${formatPercent(prob)}`}
              >
                <span
                  className={`w-6 shrink-0 text-right text-xs tabular-nums ${selected ? 'font-bold' : 'text-gray-500'}`}
                  style={selected ? { color: MISC_ACCENT } : undefined}
                >
                  {i}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-800">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${widthPct}%`,
                      minWidth: prob > 0 ? '2px' : '0',
                      backgroundColor: selected ? MISC_ACCENT : '#4b5563',
                    }}
                  />
                </div>
                <span
                  className={`w-20 shrink-0 text-right text-xs tabular-nums ${selected ? 'font-semibold text-white' : 'text-gray-400'}`}
                >
                  {formatPercent(prob)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Optional cumulative table */}
      <div>
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          className="text-xs text-gray-400 transition-colors hover:text-white"
        >
          {showTable ? '▾ Hide full table' : '▸ Show full table'}
        </button>
        {showTable && (
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="border border-gray-700 px-2 py-1 text-right font-semibold">Hits k</th>
                <th className="border border-gray-700 px-2 py-1 text-right font-semibold">P(X = k)</th>
                <th className="border border-gray-700 px-2 py-1 text-right font-semibold">P(X ≥ k)</th>
                <th className="border border-gray-700 px-2 py-1 text-right font-semibold">P(X ≤ k)</th>
              </tr>
            </thead>
            <tbody>
              {dist.map((prob, i) => (
                <tr
                  key={i}
                  style={i === k ? { backgroundColor: 'rgba(139,92,246,0.15)' } : undefined}
                >
                  <td className="border border-gray-700 px-2 py-1 text-right tabular-nums text-gray-300">{i}</td>
                  <td className="border border-gray-700 px-2 py-1 text-right tabular-nums text-gray-200">{formatPercent(prob)}</td>
                  <td className="border border-gray-700 px-2 py-1 text-right tabular-nums text-gray-400">{formatPercent(atLeast(i, n, p))}</td>
                  <td className="border border-gray-700 px-2 py-1 text-right tabular-nums text-gray-400">{formatPercent(atMost(i, n, p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  sub,
  value,
  highlight = false,
}: {
  label: string
  sub: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg border p-3"
      style={{
        borderColor: highlight ? MISC_ACCENT : '#374151',
        backgroundColor: highlight ? 'rgba(139,92,246,0.08)' : 'rgba(17,24,39,0.5)',
      }}
    >
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-2xl font-bold tabular-nums text-white">{value}</span>
      <span className="font-mono text-[10px] text-gray-500">{sub}</span>
    </div>
  )
}
