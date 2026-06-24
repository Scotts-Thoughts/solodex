import { useState } from 'react'
import { clamp } from '../../utils/hitProbability'
import HitDistribution from './HitDistribution'
import NumberField from './NumberField'
import { LABEL_CLS, NUMBER_INPUT_CLS, pillCls } from './uiStyles'

const QUICK_ACCURACIES = [50, 70, 75, 80, 85, 90, 95, 100]
const MAX_USES = 50

/**
 * MVP binomial calculator: given a per-use accuracy and N uses, show the chance
 * of exactly / at least / at most K hits, plus the full distribution.
 */
export default function HitProbabilityCalculator() {
  const [accuracy, setAccuracy] = useState(70) // percent
  const [n, setN] = useState(5)
  const [k, setK] = useState(3)

  // Clamp everything used for computation so outputs can never be NaN.
  const safeN = clamp(Math.round(n), 1, MAX_USES)
  const safeK = clamp(Math.round(k), 0, safeN)
  const p = clamp(accuracy, 0, 100) / 100

  const setNClamped = (v: number): void => {
    const nn = clamp(Math.round(v), 1, MAX_USES)
    setN(nn)
    if (k > nn) setK(nn) // keep k in 0..n
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <header>
        <h2 className="text-lg font-bold text-white">Hit Probability</h2>
        <p className="text-sm text-gray-400">
          If a move has accuracy X% and you use it N times, how likely is it to hit exactly, at
          least, or at most K times?
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
        {/* Accuracy */}
        <div className="flex flex-col gap-2">
          <label className={LABEL_CLS}>Accuracy</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={clamp(accuracy, 0, 100)}
              onChange={(e) => setAccuracy(Number(e.target.value))}
              className="flex-1 accent-violet-500"
              aria-label="Accuracy slider"
            />
            <div className="flex items-center gap-1">
              <NumberField
                value={accuracy}
                min={0}
                max={100}
                onChange={setAccuracy}
                className={NUMBER_INPUT_CLS}
                ariaLabel="Accuracy percent"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACCURACIES.map((a) => (
              <button key={a} type="button" onClick={() => setAccuracy(a)} className={pillCls(accuracy === a)}>
                {a}%
              </button>
            ))}
          </div>
        </div>

        {/* N and K */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={LABEL_CLS}>Number of uses (N)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={MAX_USES}
                value={safeN}
                onChange={(e) => setNClamped(Number(e.target.value))}
                className="flex-1 accent-violet-500"
                aria-label="Number of uses slider"
              />
              <NumberField
                value={safeN}
                min={1}
                max={MAX_USES}
                integer
                onChange={setNClamped}
                className={NUMBER_INPUT_CLS}
                ariaLabel="Number of uses"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className={LABEL_CLS}>Target hits (K)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={safeN}
                value={safeK}
                onChange={(e) => setK(Number(e.target.value))}
                className="flex-1 accent-violet-500"
                aria-label="Target hits slider"
              />
              <NumberField
                value={safeK}
                min={0}
                max={safeN}
                integer
                onChange={setK}
                className={NUMBER_INPUT_CLS}
                ariaLabel="Target hits"
              />
            </div>
          </div>
        </div>
      </div>

      <HitDistribution n={safeN} p={p} k={safeK} onSelectK={setK} />
    </div>
  )
}
