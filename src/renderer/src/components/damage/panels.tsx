/**
 * Small controls shared by the player and enemy sides of the damage
 * calculator: stat stages, status / HP / screens / flags, and the field.
 */
import type { BattlerFlags, Gen, StatStages, Status, Weather } from '../../utils/damage'
import { stageLabel, accuracyStageLabel, ZERO_STAGES } from '../../utils/damage'
import { TYPE_COLORS } from '../TypeBadge'

export const SectionLabel = ({ children, hint, right }: { children: React.ReactNode; hint?: string; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-2">
    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
      {children}
      {hint && <span className="text-gray-600 ml-1 font-normal normal-case tracking-normal">— {hint}</span>}
    </p>
    {right}
  </div>
)

export function Toggle({ on, onChange, label, title, color }: { on: boolean; onChange: (v: boolean) => void; label: string; title?: string; color?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      title={title}
      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${on ? 'text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'}`}
      style={on ? { background: color ?? '#4b5563' } : undefined}
    >
      {label}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ v: T; label: string; color?: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-800 flex-wrap">
      {options.map(o => {
        const active = value === o.v
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`px-2 py-1 text-[11px] font-semibold transition-colors ${active ? 'text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
            style={active ? { background: o.color ?? '#4b5563' } : undefined}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Stat stages ─────────────────────────────────────────────────────────────

type StageKey = keyof StatStages
const STAGE_KEYS_GEN1: StageKey[] = ['attack', 'defense', 'spattack', 'speed', 'accuracy', 'evasion']
const STAGE_KEYS: StageKey[] = ['attack', 'defense', 'spattack', 'spdefense', 'speed', 'accuracy', 'evasion']

export function StagesPanel({ gen, stages, onChange, title = 'Stat Stages', hint = 'after setup' }: {
  gen: Gen
  stages: StatStages
  onChange: (s: StatStages) => void
  title?: string
  hint?: string
}) {
  const keys = gen === 1 ? STAGE_KEYS_GEN1 : STAGE_KEYS
  const dirty = keys.some(k => stages[k] !== 0)
  const set = (k: StageKey, val: number) => {
    const v = Math.max(-6, Math.min(6, val))
    const next = { ...stages, [k]: v }
    if (gen === 1 && k === 'spattack') next.spdefense = v   // one Special stage in Gen 1
    onChange(next)
  }
  const label = (k: StageKey) =>
    k === 'attack' ? 'Atk' : k === 'defense' ? 'Def' : k === 'spattack' ? (gen === 1 ? 'Spc' : 'SpA') : k === 'spdefense' ? 'SpD'
    : k === 'speed' ? 'Spe' : k === 'accuracy' ? 'Acc' : 'Eva'
  // Accuracy and evasion stages scale the hit chance, not a stat; evasion is
  // shown as what it does to the opponent's accuracy.
  const mult = (k: StageKey, v: number) =>
    k === 'accuracy' ? accuracyStageLabel(gen, v) : k === 'evasion' ? accuracyStageLabel(gen, -v) : stageLabel(gen, v)
  const rowTitle = (k: StageKey) =>
    k === 'accuracy' ? 'Accuracy stage: multiplies the hit chance of every move' : k === 'evasion' ? "Evasion stage: divides the opponent's hit chance" : undefined
  return (
    <div>
      <SectionLabel hint={hint} right={dirty && (
        <button onClick={() => onChange({ ...ZERO_STAGES })} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">Clear</button>
      )}>{title}</SectionLabel>
      <div className="space-y-1">
        {keys.map(k => {
          const v = stages[k]
          return (
            <div key={k} className="flex items-center gap-1.5" title={rowTitle(k)}>
              <label className="text-[10px] text-gray-500 w-7 flex-shrink-0">{label(k)}</label>
              <button type="button" onClick={() => set(k, v - 1)} disabled={v <= -6}
                className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded px-1.5 py-0.5 text-xs leading-none disabled:opacity-30 disabled:cursor-not-allowed">−</button>
              <span className={`text-xs w-7 text-center font-mono ${v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-gray-500'}`}>{v > 0 ? `+${v}` : v}</span>
              <button type="button" onClick={() => set(k, v + 1)} disabled={v >= 6}
                className="text-gray-400 hover:text-white hover:bg-gray-600 bg-gray-700 rounded px-1.5 py-0.5 text-xs leading-none disabled:opacity-30 disabled:cursor-not-allowed">+</button>
              <span className="text-[10px] text-gray-600 ml-1 font-mono">{mult(k, v)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Status / HP / screens / flags ───────────────────────────────────────────

export interface Condition {
  status: Status
  hpPercent: number
  flags: BattlerFlags
}

export const DEFAULT_CONDITION: Condition = { status: 'none', hpPercent: 100, flags: {} }

const STATUS_OPTIONS: Array<{ v: Status; label: string; color?: string }> = [
  { v: 'none', label: 'None' },
  { v: 'burn', label: 'Burn', color: '#ef4444' },
  { v: 'paralysis', label: 'Para', color: '#eab308' },
  { v: 'poison', label: 'Psn', color: '#a855f7' },
  { v: 'toxic', label: 'Tox', color: '#7e22ce' },
  { v: 'sleep', label: 'Slp', color: '#6b7280' },
  { v: 'freeze', label: 'Frz', color: '#38bdf8' },
]

export function ConditionPanel({ gen, cond, onChange, side }: {
  gen: Gen
  cond: Condition
  onChange: (c: Condition) => void
  side: 'player' | 'enemy'
}) {
  const setFlag = (k: keyof BattlerFlags, v: boolean) => onChange({ ...cond, flags: { ...cond.flags, [k]: v } })
  const f = cond.flags
  const you = side === 'player'
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-gray-500 w-10 flex-shrink-0">Status</label>
        <Segmented value={cond.status} options={STATUS_OPTIONS} onChange={v => onChange({ ...cond, status: v })} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-gray-500 w-10 flex-shrink-0">HP</label>
        <input
          type="range" min={1} max={100} value={cond.hpPercent}
          onChange={e => onChange({ ...cond, hpPercent: parseInt(e.target.value) })}
          className="flex-1 accent-green-500"
        />
        <input
          type="number" min={1} max={100} value={cond.hpPercent}
          onChange={e => onChange({ ...cond, hpPercent: Math.max(1, Math.min(100, parseInt(e.target.value) || 100)) })}
          className="w-12 bg-gray-700 text-white text-[10px] text-right rounded px-1 py-0.5 outline-none"
        />
        <span className="text-[10px] text-gray-500">%</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Toggle on={!!f.reflect} onChange={v => setFlag('reflect', v)} label="Reflect" title={`Reflect on ${you ? 'your' : 'their'} side`} color="#6366f1" />
        <Toggle on={!!f.lightScreen} onChange={v => setFlag('lightScreen', v)} label="Light Screen" title={`Light Screen on ${you ? 'your' : 'their'} side`} color="#eab308" />
        <Toggle on={!!f.focusEnergy} onChange={v => setFlag('focusEnergy', v)} label="Focus Energy" title={gen === 1 ? 'Gen 1 bug: quarters the crit rate' : '+2 crit stages (Gen 2: +1)'} color="#f97316" />
        {gen >= 3 && <Toggle on={!!f.charge} onChange={v => setFlag('charge', v)} label="Charge" title="Electric moves ×2" color="#facc15" />}
        {gen >= 3 && <Toggle on={!!f.flashFire} onChange={v => setFlag('flashFire', v)} label="Flash Fire" title="Fire ×1.5 once activated" color="#ef4444" />}
        {gen >= 2 && <Toggle on={!!f.defenseCurl} onChange={v => setFlag('defenseCurl', v)} label="Defense Curl" title="Rollout / Ice Ball ×2" color="#60a5fa" />}
        {gen >= 2 && <Toggle on={!!f.identified} onChange={v => setFlag('identified', v)} label="Foresight" title="Ghost immunities dropped (target)" color="#a3a3a3" />}
        {gen >= 2 && <Toggle on={!!f.minimized} onChange={v => setFlag('minimized', v)} label="Minimized" title="Stomp-class moves ×2 (target)" color="#a3a3a3" />}
        {gen >= 2 && <Toggle on={!!f.flying} onChange={v => setFlag('flying', v)} label="In Fly" title="Gust / Twister ×2 (target)" color={TYPE_COLORS.Flying} />}
        {gen >= 2 && <Toggle on={!!f.underground} onChange={v => setFlag('underground', v)} label="In Dig" title="Earthquake / Magnitude ×2 (target)" color={TYPE_COLORS.Ground} />}
        {gen >= 3 && <Toggle on={!!f.underwater} onChange={v => setFlag('underwater', v)} label="In Dive" title="Surf / Whirlpool ×2 (target)" color={TYPE_COLORS.Water} />}
        {gen >= 4 && <Toggle on={!!f.grounded} onChange={v => setFlag('grounded', v)} label="Grounded" title="Ingrain / Gravity / Iron Ball: Ground hits Flying (target)" color="#a3a3a3" />}
        {gen >= 4 && <Toggle on={!!f.slowStartActive} onChange={v => setFlag('slowStartActive', v)} label="Slow Start" title="First five turns (Regigigas)" color="#a3a3a3" />}
      </div>
    </div>
  )
}

// ─── Field ───────────────────────────────────────────────────────────────────

export interface FieldSettings {
  weather: Weather
  isDoubles: boolean
  mudSport: boolean
  waterSport: boolean
  gravity: boolean
}

export const DEFAULT_FIELD_SETTINGS: FieldSettings = { weather: 'none', isDoubles: false, mudSport: false, waterSport: false, gravity: false }

export function FieldPanel({ gen, field, onChange }: { gen: Gen; field: FieldSettings; onChange: (f: FieldSettings) => void }) {
  const weatherOptions: Array<{ v: Weather; label: string; color?: string }> = [
    { v: 'none', label: 'None' },
    { v: 'sun', label: 'Sun', color: '#eab308' },
    { v: 'rain', label: 'Rain', color: '#3b82f6' },
    ...(gen >= 3 ? [{ v: 'sand' as Weather, label: 'Sand', color: '#a16207' }, { v: 'hail' as Weather, label: 'Hail', color: '#38bdf8' }] : []),
  ]
  const weatherNote =
    field.weather === 'rain' ? 'Water ×1.5 · Fire ×0.5' + (gen >= 2 ? ' · Solar Beam ×0.5' : '') :
    field.weather === 'sun'  ? 'Fire ×1.5 · Water ×0.5' :
    field.weather === 'sand' ? (gen >= 4 ? 'Rock-types Sp. Def ×1.5 · Solar Beam ×0.5' : 'Solar Beam ×0.5') :
    field.weather === 'hail' ? 'Solar Beam ×0.5' : ''
  return (
    <div>
      <SectionLabel>Field</SectionLabel>
      {gen >= 2 && (
        <div className="flex items-center gap-2 mb-2">
          <label className="text-[10px] text-gray-500 w-14 flex-shrink-0">Weather</label>
          <Segmented value={field.weather} options={weatherOptions} onChange={v => onChange({ ...field, weather: v })} />
        </div>
      )}
      {weatherNote && <p className="text-[10px] text-gray-600 mb-2 pl-16">{weatherNote}</p>}
      <div className="flex flex-wrap gap-1 pl-16">
        {gen >= 3 && <Toggle on={field.isDoubles} onChange={v => onChange({ ...field, isDoubles: v })} label="Double battle" title="Spread moves reduced; screens ⅔ (Gen 3–4)" color="#0ea5e9" />}
        {gen >= 3 && <Toggle on={field.mudSport} onChange={v => onChange({ ...field, mudSport: v })} label="Mud Sport" title="Electric moves weakened" color={TYPE_COLORS.Ground} />}
        {gen >= 3 && <Toggle on={field.waterSport} onChange={v => onChange({ ...field, waterSport: v })} label="Water Sport" title="Fire moves weakened" color={TYPE_COLORS.Water} />}
        {gen >= 4 && <Toggle on={field.gravity} onChange={v => onChange({ ...field, gravity: v })} label="Gravity" title="Ground hits Flying / Levitate" color="#a3a3a3" />}
      </div>
    </div>
  )
}
