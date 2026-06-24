import { useState } from 'react'
import {
  clamp,
  ACCURACY_MODIFIERS,
  effectiveAccuracy,
} from '../../utils/hitProbability'
import HitDistribution from './HitDistribution'
import NumberField from './NumberField'
import { LABEL_CLS, NUMBER_INPUT_CLS, pillCls } from './uiStyles'
import { formatNumber, formatPercent } from './format'

const QUICK_ACCURACIES = [50, 70, 75, 80, 85, 90, 95, 100]
const MAX_USES = 50

/**
 * §7a effective-accuracy helper. Derives the real per-use accuracy from
 * in-battle conditions (Gen 6+ accuracy/evasion stages, abilities, items), then
 * runs the same binomial distribution on the result.
 */
export default function EffectiveAccuracyCalculator() {
  const [baseAccuracy, setBaseAccuracy] = useState(100)
  const [accuracyStages, setAccuracyStages] = useState(0)
  const [evasionStages, setEvasionStages] = useState(0)
  const [active, setActive] = useState<Record<string, boolean>>({})
  const [alwaysHits, setAlwaysHits] = useState(false)
  const [n, setN] = useState(5)
  const [k, setK] = useState(3)

  const factors = ACCURACY_MODIFIERS.filter((m) => active[m.id]).map((m) => m.factor)
  const result = effectiveAccuracy({
    baseAccuracy: clamp(baseAccuracy, 0, 100),
    accuracyStages,
    evasionStages,
    factors,
    alwaysHits,
  })

  const p = result.effective / 100
  const safeN = clamp(Math.round(n), 1, MAX_USES)
  const safeK = clamp(Math.round(k), 0, safeN)
  const setNClamped = (v: number): void => {
    const nn = clamp(Math.round(v), 1, MAX_USES)
    setN(nn)
    if (k > nn) setK(nn)
  }

  const toggle = (id: string): void => setActive((prev) => ({ ...prev, [id]: !prev[id] }))
  const activeMods = ACCURACY_MODIFIERS.filter((m) => active[m.id])
  const dimmed = alwaysHits ? 'opacity-40 pointer-events-none' : ''

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <header>
        <h2 className="text-lg font-bold text-white">Effective Accuracy</h2>
        <p className="text-sm text-gray-400">
          Build the real per-use accuracy from battle conditions, then see the hit distribution
          over N uses. Accuracy/evasion multipliers are Gen 6+.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
        {/* No Guard / always-hit override */}
        <label className="flex items-center gap-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={alwaysHits}
            onChange={(e) => setAlwaysHits(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
          <span className="font-semibold">No Guard / Lock-On</span>
          <span className="text-gray-500">— move always hits (forces 100%)</span>
        </label>

        <div className={`flex flex-col gap-4 ${dimmed}`}>
          {/* Base accuracy */}
          <div className="flex flex-col gap-2">
            <label className={LABEL_CLS}>Base accuracy</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={clamp(baseAccuracy, 0, 100)}
                onChange={(e) => setBaseAccuracy(Number(e.target.value))}
                className="flex-1 accent-violet-500"
                aria-label="Base accuracy slider"
              />
              <div className="flex items-center gap-1">
                <NumberField
                  value={baseAccuracy}
                  min={0}
                  max={100}
                  onChange={setBaseAccuracy}
                  className={NUMBER_INPUT_CLS}
                  ariaLabel="Base accuracy percent"
                />
                <span className="text-sm text-gray-400">%</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACCURACIES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setBaseAccuracy(a)}
                  className={pillCls(baseAccuracy === a)}
                >
                  {a}%
                </button>
              ))}
            </div>
          </div>

          {/* Stat stages */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StageStepper label="Your accuracy stages" value={accuracyStages} onChange={setAccuracyStages} />
            <StageStepper label="Target evasion stages" value={evasionStages} onChange={setEvasionStages} />
          </div>

          {/* Modifiers */}
          <div className="flex flex-col gap-2">
            <label className={LABEL_CLS}>Other modifiers</label>
            <div className="flex flex-wrap gap-1.5">
              {ACCURACY_MODIFIERS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={pillCls(!!active[m.id])}
                  title={`${m.label} ${m.note}`}
                >
                  {m.label} <span className="opacity-70">{m.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Effective accuracy readout + breakdown */}
      <div className="rounded-lg border p-4" style={{ borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)' }}>
        <div className="flex items-baseline justify-between">
          <span className={LABEL_CLS}>Effective accuracy</span>
          <span className="text-3xl font-bold tabular-nums text-white">
            {formatPercent(p)}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {result.alwaysHits ? (
            <span>No Guard / Lock-On — the move always hits.</span>
          ) : (
            <span className="font-mono">
              {formatNumber(clamp(baseAccuracy, 0, 100))}%
              {' × '}stage {result.combinedStage >= 0 ? `+${result.combinedStage}` : result.combinedStage}{' '}
              (×{formatNumber(result.stageMultiplier, 3)})
              {activeMods.map((m) => (
                <span key={m.id}>
                  {' × '}
                  {m.label} (×{m.factor})
                </span>
              ))}
              {result.cappedAt100 && <span className="text-amber-400"> → capped at 100%</span>}
            </span>
          )}
        </div>
      </div>

      {/* Distribution over N uses at the effective accuracy */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
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
              <NumberField value={safeN} min={1} max={MAX_USES} integer onChange={setNClamped} className={NUMBER_INPUT_CLS} ariaLabel="Number of uses" />
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
              <NumberField value={safeK} min={0} max={safeN} integer onChange={setK} className={NUMBER_INPUT_CLS} ariaLabel="Target hits" />
            </div>
          </div>
        </div>
      </div>

      <HitDistribution n={safeN} p={p} k={safeK} onSelectK={setK} />
    </div>
  )
}

function StageStepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const set = (v: number) => onChange(clamp(v, -6, 6))
  return (
    <div className="flex flex-col gap-2">
      <label className={LABEL_CLS}>{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(value - 1)}
          disabled={value <= -6}
          className="h-8 w-8 rounded border border-gray-600 bg-gray-800 text-lg leading-none text-gray-200 hover:border-gray-400 disabled:opacity-40"
        >
          −
        </button>
        <span className="w-12 text-center text-lg font-bold tabular-nums text-white">
          {value > 0 ? `+${value}` : value}
        </span>
        <button
          type="button"
          onClick={() => set(value + 1)}
          disabled={value >= 6}
          className="h-8 w-8 rounded border border-gray-600 bg-gray-800 text-lg leading-none text-gray-200 hover:border-gray-400 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  )
}
