import { useMemo, Fragment } from 'react'
import TypeBadge from './TypeBadge'
import WikiPopover from './WikiPopover'
import { getMoveAcrossGens } from '../data'
import { getCategoryColor } from '../constants/ui'
import type { MoveData } from '../types/pokemon'

interface Props {
  moveName: string
  onBack: () => void
}

const BOOL_FLAGS: { key: keyof MoveData; label: string }[] = [
  { key: 'makes_contact', label: 'Contact' },
  { key: 'affected_by_protect', label: 'Protect' },
  { key: 'affected_by_magic_coat', label: 'Magic Coat' },
  { key: 'affected_by_snatch', label: 'Snatch' },
  { key: 'affected_by_mirror_move', label: 'Mirror Move' },
  { key: 'affected_by_kings_rock', label: "King's Rock" },
]

// Keys we track for change callouts (excludes effect text — schema too inconsistent across gens)
const CHANGE_KEYS: (keyof MoveData)[] = [
  'type', 'category', 'power', 'accuracy', 'pp', 'priority',
  'effect_chance', 'target', 'makes_contact',
  'affected_by_protect', 'affected_by_magic_coat', 'affected_by_snatch',
  'affected_by_mirror_move', 'affected_by_kings_rock',
]

function formatEffect(effect: string): string {
  return effect
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function fmtVal(v: number | boolean | null): string {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  return v != null ? String(v) : '—'
}

const FIELD_LABEL: Partial<Record<keyof MoveData, string>> = {
  type: 'Type',
  category: 'Category',
  power: 'Power',
  accuracy: 'Accuracy',
  pp: 'PP',
  priority: 'Priority',
  effect_chance: 'Effect %',
  target: 'Target',
  makes_contact: 'Contact',
  affected_by_protect: 'Protect',
  affected_by_magic_coat: 'Magic Coat',
  affected_by_snatch: 'Snatch',
  affected_by_mirror_move: 'Mirror Move',
  affected_by_kings_rock: "King's Rock",
}

interface Change {
  key: keyof MoveData
  label: string
  oldVal: MoveData[keyof MoveData]
  newVal: MoveData[keyof MoveData]
}

function getChanges(prev: MoveData, curr: MoveData): Change[] {
  const changes: Change[] = []
  for (const key of CHANGE_KEYS) {
    if (prev[key] !== curr[key]) {
      changes.push({ key, label: FIELD_LABEL[key] ?? key, oldVal: prev[key], newVal: curr[key] })
    }
  }
  return changes
}

// Collapse consecutive unchanged generations into a single group
interface GenGroup {
  startGen: string
  endGen: string
  data: MoveData
}

function collapseGens(history: { gen: string; data: MoveData }[]): { group: GenGroup; changesFromPrev: Change[] }[] {
  if (history.length === 0) return []

  const result: { group: GenGroup; changesFromPrev: Change[] }[] = []
  let current: GenGroup = { startGen: history[0].gen, endGen: history[0].gen, data: history[0].data }
  let currentChanges: Change[] = []

  for (let i = 1; i < history.length; i++) {
    const changes = getChanges(current.data, history[i].data)
    if (changes.length === 0) {
      // No tracked changes — extend the current group
      current.endGen = history[i].gen
    } else {
      // Push the current group, start a new one
      result.push({ group: current, changesFromPrev: currentChanges })
      currentChanges = changes
      current = { startGen: history[i].gen, endGen: history[i].gen, data: history[i].data }
    }
  }
  // Push the final group
  result.push({ group: current, changesFromPrev: currentChanges })

  return result
}

export default function MoveDetailView({ moveName, onBack }: Props) {
  const genHistory = useMemo(() => getMoveAcrossGens(moveName), [moveName])
  const collapsed = useMemo(() => collapseGens(genHistory), [genHistory])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-800 px-5 py-3 shrink-0 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          &larr; Back
        </button>
        <WikiPopover name={moveName} type="move">
          <h1 className="text-lg font-bold text-white cursor-pointer hover:text-gray-200">{moveName}</h1>
        </WikiPopover>
        {genHistory.length > 0 && (
          <span className="text-xs text-gray-500">
            Gen {genHistory[0].gen}{genHistory.length > 1 ? `\u2013${genHistory[genHistory.length - 1].gen}` : ''}
          </span>
        )}
      </div>

      {/* Generation cards with change callouts between them */}
      <div className="flex-1 overflow-auto px-5 py-4 scrollbar-thin">
        <div className="max-w-2xl mx-auto space-y-0">
          {collapsed.map(({ group, changesFromPrev }, idx) => {
            const prevGroup = idx > 0 ? collapsed[idx - 1].group : null

            return (
              <Fragment key={group.startGen}>
                {/* Change callout between groups */}
                {changesFromPrev.length > 0 && prevGroup && (
                  <div className="relative py-3">
                    <div className="absolute inset-x-0 top-1/2 border-t border-yellow-500/30" />
                    <div className="relative flex flex-wrap items-center justify-center gap-2 px-4">
                      <span className="bg-gray-900 px-2 text-xs font-semibold text-yellow-500">
                        Gen {prevGroup.endGen} &rarr; {group.startGen}
                      </span>
                      {changesFromPrev.map(({ key, label, oldVal, newVal }) => (
                        <span key={key} className="bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-0.5 text-xs flex items-center gap-1.5">
                          <span className="text-yellow-500/70 font-medium">{label}</span>
                          {key === 'type' ? (
                            <>
                              <span className="opacity-60"><TypeBadge type={oldVal as string} small game="" /></span>
                              <span className="text-yellow-400">&rarr;</span>
                              <TypeBadge type={newVal as string} small game="" />
                            </>
                          ) : key === 'category' ? (
                            <>
                              <span className="opacity-60" style={{ color: getCategoryColor(oldVal as string) }}>{oldVal as string}</span>
                              <span className="text-yellow-400">&rarr;</span>
                              <span style={{ color: getCategoryColor(newVal as string) }}>{newVal as string}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-400">{fmtVal(oldVal as number | boolean | null)}</span>
                              <span className="text-yellow-400">&rarr;</span>
                              <span className="text-yellow-300 font-semibold">{fmtVal(newVal as number | boolean | null)}</span>
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Spacer between groups when no changes */}
                {idx > 0 && changesFromPrev.length === 0 && <div className="h-3" />}

                {/* Gen card */}
                <GenCard startGen={group.startGen} endGen={group.endGen} data={group.data} />
              </Fragment>
            )
          })}

          {genHistory.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              No data found for this move.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GenCard({ startGen, endGen, data }: { startGen: string; endGen: string; data: MoveData }) {
  const genLabel = startGen === endGen ? `Generation ${startGen}` : `Generations ${startGen}\u2013${endGen}`
  return (
    <div className="rounded-lg border border-gray-700/60 overflow-hidden">
      {/* Gen header */}
      <div className="bg-gray-800/60 px-4 py-2 flex items-center gap-3">
        <span className="text-sm font-bold text-gray-200">{genLabel}</span>
        <div className="ml-auto flex items-center gap-3">
          <TypeBadge type={data.type} small game="" />
          <span className="text-xs font-semibold" style={{ color: getCategoryColor(data.category) }}>
            {data.category}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-4 py-3 grid grid-cols-5 gap-3 border-b border-gray-800/60">
        <StatCell label="Power" value={data.power} />
        <StatCell label="Accuracy" value={data.accuracy} />
        <StatCell label="PP" value={data.pp} />
        <StatCell label="Priority" value={data.priority} />
        <StatCell label="Effect %" value={data.effect_chance} />
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 shrink-0 w-16">Effect</span>
          <span className="text-xs text-gray-300">{formatEffect(data.effect)}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 shrink-0 w-16">Target</span>
          <span className="text-xs text-gray-300">{data.target}</span>
        </div>

        {/* Boolean flags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {BOOL_FLAGS.map(({ key, label }) => {
            const val = data[key] as boolean
            return (
              <span
                key={key}
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  val
                    ? 'bg-green-900/40 border-green-700/40 text-green-400'
                    : 'bg-gray-800/60 border-gray-700/40 text-gray-600'
                }`}
              >
                {label}
              </span>
            )
          })}
        </div>

        {/* Description */}
        <div className="pt-1">
          <p className="text-xs italic text-gray-500">{data.description}</p>
        </div>
      </div>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${value != null ? 'text-gray-100' : 'text-gray-600'}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}
