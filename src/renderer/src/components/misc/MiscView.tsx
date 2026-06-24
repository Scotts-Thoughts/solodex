import { useState } from 'react'
import HitProbabilityCalculator from './HitProbabilityCalculator'
import EffectiveAccuracyCalculator from './EffectiveAccuracyCalculator'
import MultiHitCalculator from './MultiHitCalculator'
import { MISC_ACCENT } from './uiStyles'

type MiscTab = 'hitProb' | 'effAcc' | 'multiHit'

const TABS: { id: MiscTab; label: string }[] = [
  { id: 'hitProb', label: 'Hit Probability' },
  { id: 'effAcc', label: 'Effective Accuracy' },
  { id: 'multiHit', label: 'Multi-Hit Moves' },
]

/**
 * Container for the Misc area (F9). Holds miscellaneous tools as sub-tabs; the
 * binomial hit-probability calculator is the first. The active tab is persisted.
 */
export default function MiscView() {
  const [tab, setTab] = useState<MiscTab>(() => {
    const saved = localStorage.getItem('miscTab')
    return TABS.some((t) => t.id === saved) ? (saved as MiscTab) : 'hitProb'
  })

  const select = (t: MiscTab): void => {
    setTab(t)
    localStorage.setItem('miscTab', t)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex flex-shrink-0 gap-1 border-b border-gray-700 px-4 pt-2">
        {TABS.map((t) => {
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={[
                'rounded-t px-4 py-2 text-sm font-semibold transition-colors focus:outline-none',
                isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200',
              ].join(' ')}
              style={isActive ? { borderBottom: `2px solid ${MISC_ACCENT}`, marginBottom: '-1px' } : undefined}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Active tab */}
      <div className="flex-1 overflow-auto">
        {tab === 'hitProb' && <HitProbabilityCalculator />}
        {tab === 'effAcc' && <EffectiveAccuracyCalculator />}
        {tab === 'multiHit' && <MultiHitCalculator />}
      </div>
    </div>
  )
}
