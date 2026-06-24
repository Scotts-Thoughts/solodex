import { useState } from 'react'
import {
  clamp,
  multiHitOutcomes,
  expectedRolledHits,
  expectedTotalHits,
  type MultiHitGen,
  type MultiHitModifier,
} from '../../utils/hitProbability'
import NumberField from './NumberField'
import { LABEL_CLS, MISC_ACCENT, NUMBER_INPUT_CLS, pillCls } from './uiStyles'
import { formatNumber, formatPercent } from './format'

const QUICK_ACCURACIES = [80, 85, 90, 95, 100]

/**
 * §7b multi-hit move mode. A standard 2–5 hit move makes ONE accuracy check for
 * the whole move; if it passes, the hit count is rolled from a fixed
 * distribution. Different model from the binomial calculator.
 */
export default function MultiHitCalculator() {
  const [accuracy, setAccuracy] = useState(100)
  const [gen, setGen] = useState<MultiHitGen>('gen5plus')
  const [modifier, setModifier] = useState<MultiHitModifier>('none')

  // Loaded Dice is a Gen 9 item — only offered in Gen 5+ mode.
  const loadedDiceAvailable = gen === 'gen5plus'

  const setGenSafe = (g: MultiHitGen): void => {
    setGen(g)
    if (g === 'gen1to4' && modifier === 'loadedDice') setModifier('none')
  }

  const outcomes = multiHitOutcomes(accuracy, gen, modifier)
  const expTotal = expectedTotalHits(accuracy, gen, modifier)
  const expRolled = expectedRolledHits(gen, modifier)
  const maxP = outcomes.reduce((m, o) => Math.max(m, o.probability), 0)

  const MODIFIERS: { id: MultiHitModifier; label: string; note: string; disabled?: boolean }[] = [
    { id: 'none', label: 'None', note: '2–5 hits' },
    { id: 'skillLink', label: 'Skill Link', note: 'always 5' },
    { id: 'loadedDice', label: 'Loaded Dice', note: '≥4 hits (Gen 9)', disabled: !loadedDiceAvailable },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <header>
        <h2 className="text-lg font-bold text-white">Multi-Hit Moves</h2>
        <p className="text-sm text-gray-400">
          Bullet Seed, Rock Blast, Pin Missile, Icicle Spear… make one accuracy check for the whole
          move; if it passes, the number of hits (2–5) is rolled from a fixed distribution.
        </p>
      </header>

      <div className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
        {/* Accuracy */}
        <div className="flex flex-col gap-2">
          <label className={LABEL_CLS}>Move accuracy</label>
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
              <NumberField value={accuracy} min={0} max={100} onChange={setAccuracy} className={NUMBER_INPUT_CLS} ariaLabel="Accuracy percent" />
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

        {/* Generation */}
        <div className="flex flex-col gap-2">
          <label className={LABEL_CLS}>Generation</label>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setGenSafe('gen1to4')} className={pillCls(gen === 'gen1to4')}>
              Gen 1–4
            </button>
            <button type="button" onClick={() => setGenSafe('gen5plus')} className={pillCls(gen === 'gen5plus')}>
              Gen 5+
            </button>
          </div>
        </div>

        {/* Modifier */}
        <div className="flex flex-col gap-2">
          <label className={LABEL_CLS}>Modifier</label>
          <div className="flex flex-wrap gap-1.5">
            {MODIFIERS.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={m.disabled}
                onClick={() => !m.disabled && setModifier(m.id)}
                className={pillCls(modifier === m.id, m.disabled)}
                title={m.disabled ? 'Loaded Dice is a Gen 9 item' : `${m.label} — ${m.note}`}
              >
                {m.label} <span className="opacity-70">{m.note}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5 rounded-lg border p-3" style={{ borderColor: MISC_ACCENT, backgroundColor: 'rgba(139,92,246,0.08)' }}>
          <span className="text-xs text-gray-400">Expected total hits</span>
          <span className="text-2xl font-bold tabular-nums text-white">{formatNumber(expTotal)}</span>
          <span className="font-mono text-[10px] text-gray-500">P(pass) × E[rolled]</span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
          <span className="text-xs text-gray-400">Avg hits if it connects</span>
          <span className="text-2xl font-bold tabular-nums text-white">{formatNumber(expRolled)}</span>
          <span className="font-mono text-[10px] text-gray-500">E[rolled hit count]</span>
        </div>
      </div>

      {/* Outcome distribution */}
      <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Outcome probability — 0 hits means the accuracy check failed
        </div>
        <div className="flex flex-col gap-1.5">
          {outcomes.map((o) => {
            const widthPct = maxP > 0 ? (o.probability / maxP) * 100 : 0
            const isMiss = o.hits === 0
            return (
              <div key={o.hits} className="flex items-center gap-2" title={`${o.hits} hits: ${formatPercent(o.probability)}`}>
                <span className={`w-14 shrink-0 text-right text-xs ${isMiss ? 'text-gray-500' : 'text-gray-300'}`}>
                  {isMiss ? 'Miss' : `${o.hits} hits`}
                </span>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-gray-800">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${widthPct}%`,
                      minWidth: o.probability > 0 ? '2px' : '0',
                      backgroundColor: isMiss ? '#6b7280' : MISC_ACCENT,
                    }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-gray-300">
                  {formatPercent(o.probability)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
