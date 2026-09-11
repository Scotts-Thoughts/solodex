import { useMemo } from 'react'
import TypeBadge from '../TypeBadge'
import type { Assumption, DamageResult, MoveOptions } from '../../utils/damage'
import { koChances, koBreakdown, koSummary, koName, fmtChance } from '../../utils/damage'

export interface RowEdit {
  /** Update a per-move option (assumption pill). */
  setOption: (patch: MoveOptions) => void
  /** Update a per-battler counter (Rollout turn, stockpiles…). */
  setCounter: (key: string, value: number) => void
  counters: Partial<Record<string, number>>
  options: MoveOptions
}

const COUNTER_KEYS = new Set(['rolloutTurn', 'furyCutterTurn', 'echoedVoiceTurn', 'rageCounter', 'stockpile', 'metronomeUses', 'trumpCardPP'])
const COUNTER_MAX: Record<string, number> = {
  rolloutTurn: 4, furyCutterTurn: 4, echoedVoiceTurn: 4, rageCounter: 6, stockpile: 3, metronomeUses: 10, trumpCardPP: 5,
}

function fmtRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`
}

const fmtPct = (p: number): string => `${Math.round(p * 1000) / 10}%`

/** "hit 84.38%" for moves that can miss, "never misses" for bypasses, nothing for a plain 100%. */
function HitChance({ r }: { r: DamageResult }) {
  const note = r.hitNotes.join('\n')
  if (r.hitChance <= 0) return <span className="text-red-400/80" title={note}>{r.hitNotes[0] ?? 'Cannot hit'}</span>
  if (r.hitChance < 1) return <span title={note}><span className="text-gray-400">hit</span> {fmtChance(r.hitChance)}</span>
  if (r.hitNotes.length === 1 && !/^\d/.test(r.hitNotes[0])) return <span className="text-gray-600" title={note}>never misses</span>
  return null
}

function Pill({ a, edit }: { a: Assumption; edit?: RowEdit }) {
  const base = 'text-[9px] px-1 py-px rounded bg-gray-800 border border-gray-700 text-gray-400 flex items-center gap-1'
  if (!edit) return <span className={base}>{a.label}: {String(a.value)}</span>

  if (a.key === 'conditionMet') {
    const on = !!edit.options.conditionMet
    return (
      <button
        onClick={() => edit.setOption({ conditionMet: !on })}
        className={`${base} hover:border-gray-500 ${on ? 'text-green-300 border-green-800' : ''}`}
        title="Toggle the boosting condition"
      >
        {a.label}: {on ? 'yes' : 'no'}
      </button>
    )
  }
  if (a.key === 'incomingDamage') {
    return (
      <span className={base}>
        {a.label}
        <input
          type="number" min={0} max={9999}
          value={edit.options.incomingDamage ?? 0}
          onChange={e => edit.setOption({ incomingDamage: Math.max(0, parseInt(e.target.value) || 0) })}
          className="w-12 bg-gray-700 text-white text-[9px] rounded px-1 outline-none"
        />
      </span>
    )
  }
  if (a.key === 'hits') {
    return (
      <span className={base}>
        {a.label}
        <input
          type="number" min={2} max={5}
          value={edit.options.hits ?? 2}
          onChange={e => edit.setOption({ hits: Math.max(2, Math.min(5, parseInt(e.target.value) || 2)) })}
          className="w-8 bg-gray-700 text-white text-[9px] rounded px-1 outline-none"
        />
      </span>
    )
  }
  if (COUNTER_KEYS.has(a.key)) {
    const v = edit.counters[a.key] ?? 0
    const max = COUNTER_MAX[a.key] ?? 5
    return (
      <span className={base}>
        {a.label}
        <button onClick={() => edit.setCounter(a.key, Math.max(0, v - 1))} className="px-1 hover:text-white">−</button>
        <span className="font-mono text-gray-200">{v}</span>
        <button onClick={() => edit.setCounter(a.key, Math.min(max, v + 1))} className="px-1 hover:text-white">+</button>
      </span>
    )
  }
  return <span className={base}>{a.label}: {String(a.value)}</span>
}

export default function DamageRow({
  result: r,
  game,
  defenderHp,
  edit,
}: {
  result: DamageResult
  game: string
  /** Defender's current HP (for KO chances). */
  defenderHp: number
  edit?: RowEdit
}) {
  const effText =
    r.effectiveness === 4    ? '4×'  :
    r.effectiveness === 2    ? '2×'  :
    r.effectiveness === 0.5  ? '½×'  :
    r.effectiveness === 0.25 ? '¼×'  : ''
  const effColor =
    r.effectiveness >= 2   ? 'text-green-400' :
    r.effectiveness <= 0.5 && r.effectiveness > 0 ? 'text-orange-400' : 'text-gray-500'

  // KO odds: miss chance × damage rolls × crits, for 1..n uses (ko.ts).
  const ko = useMemo(() => {
    const lethal = (r.kind === 'range' || r.kind === 'fixed' || r.kind === 'reflect') && !r.nonLethal
    if (!lethal) return null
    const all = koChances(r, defenderHp)
    if (all.length === 0) return null
    const b = koBreakdown(r, defenderHp)
    const hit = `Hit chance ${fmtChance(r.hitChance)}${r.hitNotes.length ? ` — ${r.hitNotes.join(' · ')}` : ''}`
    const onHit = b.onCrit == null
      ? `On hit: ${fmtChance(b.onHit)} of damage rolls KO`
      : `On hit: ${fmtChance(b.noCrit)} of damage rolls KO · on a crit (${fmtPct(r.critChance)}): ${fmtChance(b.onCrit)}`
    const title = [
      'Chance to KO — miss chance, damage rolls and critical hits included',
      ...all.map(c => `${c.uses === 1 ? '1 use' : `${c.uses} uses`}: ${fmtChance(c.chance)}`),
      hit, onHit,
    ].join('\n')
    return { shown: koSummary(all), title }
  }, [r, defenderHp])

  const header = (
    <div className="flex items-center gap-2">
      <div className="flex-shrink-0"><TypeBadge type={r.moveType} small game={game} /></div>
      <span className="text-xs text-gray-200 w-24 truncate flex-shrink-0" title={r.move}>{r.move}</span>
      <span className="text-xs text-gray-500 w-6 text-right flex-shrink-0">{r.power > 0 ? r.power : '—'}</span>
    </div>
  )

  // ── Non-range kinds ──────────────────────────────────────────────────────
  if (r.kind === 'immune' || r.kind === 'none') {
    return (
      <div className="py-0.5">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {header}
          <span className="flex-1 truncate">{r.kind === 'immune' ? 'No effect' : r.notes[0] ?? 'No damage'}</span>
        </div>
      </div>
    )
  }
  if (r.kind === 'ohko') {
    return (
      <div className="py-0.5">
        <div className="flex items-center gap-2 text-xs">
          {header}
          <span className="flex-1 text-red-300 font-semibold" title={r.hitNotes.join('\n')}>
            OHKO <span className={r.hitChance > 0 ? 'text-gray-200' : 'text-red-400/80'}>{fmtChance(r.hitChance)}</span>
          </span>
          <span className="text-[10px] text-gray-500 truncate max-w-[14rem]" title={[...r.hitNotes, ...r.notes].join(' · ')}>{r.hitChance > 0 ? r.notes[0] : r.hitNotes[0]}</span>
        </div>
      </div>
    )
  }

  // ── Range / fixed / reflect ──────────────────────────────────────────────
  const alwaysKO = r.minPercent >= 100
  const barMin = Math.min(r.minPercent, 100)
  const barMax = Math.min(r.maxPercent, 100)
  const barColor = alwaysKO ? '#22c55e'
    : barMax >= 100 ? '#84cc16'
    : barMax >= 50  ? '#eab308'
    : barMax >= 25  ? '#f97316'
    :                 '#ef4444'
  const critMaxBar = r.crit ? Math.min(r.crit.max / Math.max(1, defenderHp) * 100, 100) : null
  const hits = r.hits
  const total = hits && hits.totalMin != null && hits.totalMax != null ? fmtRange(hits.totalMin, hits.totalMax) : null

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-2">
        {header}
        <div className="flex-1 min-w-0">
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            {alwaysKO ? (
              <div className="absolute inset-0 rounded-full" style={{ background: barColor }} />
            ) : (
              <>
                <div className="absolute h-full rounded-full opacity-30" style={{ left: `${barMin}%`, right: `${100 - barMax}%`, background: barColor }} />
                <div className="absolute h-full w-0.5 rounded-full" style={{ left: `${barMin}%`, background: barColor }} />
                <div className="absolute h-full w-0.5 rounded-full" style={{ left: `${barMax}%`, background: barColor }} />
              </>
            )}
            {critMaxBar !== null && <div className="absolute h-full w-0.5" style={{ left: `${critMaxBar}%`, background: '#fbbf24' }} />}
          </div>
        </div>
        <span className="text-xs text-gray-200 w-14 text-right flex-shrink-0">{fmtRange(r.min, r.max)}</span>
        <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
          {r.minPercent === r.maxPercent ? `${r.minPercent}%` : `${r.minPercent}%–${r.maxPercent}%`}
        </span>
        <div className="flex items-center gap-1 w-12 justify-end flex-shrink-0">
          {effText && <span className={`text-[10px] font-bold ${effColor}`}>{effText}</span>}
          {r.stab && <span className="text-yellow-400 text-[9px] font-bold">S</span>}
        </div>
      </div>

      {/* Secondary line: KO odds, hit chance, crit, hits, recoil, pills, notes */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-24 text-[10px] text-gray-500 leading-4">
        {ko && ko.shown.length > 0 && (
          <span className="text-gray-300 cursor-help" title={ko.title}>
            {ko.shown.map((c, i) => (
              <span key={c.uses}>
                {i > 0 && <span className="text-gray-600"> · </span>}
                <span className={i === 0 ? 'font-semibold text-gray-200' : ''}>{koName(c.uses)} {fmtChance(c.chance)}</span>
              </span>
            ))}
          </span>
        )}
        <HitChance r={r} />
        {r.crit && r.critChance > 0 && (
          <span title="Critical hit range">
            <span className="text-yellow-500">crit</span> {fmtRange(r.crit.min, r.crit.max)}
            <span className="text-gray-600"> ({Math.round(r.critChance * 1000) / 10}%)</span>
          </span>
        )}
        {hits && (
          <span title="Number of hits">
            {hits.min === hits.max ? `${hits.max} hits` : `${hits.min}–${hits.max} hits`}
            {total && <span className="text-gray-400"> · total {total}</span>}
          </span>
        )}
        {r.recoil && <span className="text-red-400/80">recoil {fmtRange(r.recoil.min, r.recoil.max)}</span>}
        {r.drain && <span className="text-green-400/80">heals {fmtRange(r.drain.min, r.drain.max)}</span>}
        {r.assumptions.map((a, i) => <Pill key={`${a.key}-${i}`} a={a} edit={edit} />)}
        {r.notes.map((n, i) => <span key={i} className="text-gray-600 italic truncate max-w-[16rem]" title={n}>{n}</span>)}
      </div>
    </div>
  )
}
