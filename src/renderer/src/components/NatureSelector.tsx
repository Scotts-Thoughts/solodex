import { natures } from '@data/natures'

// Stat keys as stored in natures.js, ordered for display (Atk Def SpA SpD Spe).
const STAT_KEYS = ['attack', 'defense', 'specialAttack', 'specialDefense', 'speed'] as const
type StatKey = typeof STAT_KEYS[number]

const STAT_ABBR: Record<StatKey, string> = {
  attack: 'Atk', defense: 'Def', specialAttack: 'SpA', specialDefense: 'SpD', speed: 'Spe',
}

// Stat colors / cell backgrounds — match the Natures tab (NaturesView).
const STAT_COLOR: Record<StatKey, string> = {
  attack: '#F8D030', defense: '#F08030', speed: '#F85888', specialAttack: '#6890F0', specialDefense: '#7038F8',
}
const STAT_BG: Record<StatKey, string> = {
  attack: '#3d3312', defense: '#3d2412', speed: '#3d1522', specialAttack: '#1a243d', specialDefense: '#1e103d',
}

// Neutral natures sit on the diagonal: index 0→atk, 6→def, 12→spe, 18→spa, 24→spd.
const STAT_BY_INDEX: Record<number, StatKey> = {
  0: 'attack', 6: 'defense', 12: 'speed', 18: 'specialAttack', 24: 'specialDefense',
}

// Build (increase|decrease) → nature name, and the reverse, covering all 25
// natures. Neutral natures map their diagonal stat to both increase and decrease.
const naturesData = natures as Record<string, { index: number; increased: string | null; decreased: string | null }>
const PAIR_TO_NATURE: Record<string, string> = {}
const NATURE_TO_PAIR: Record<string, { inc: StatKey; dec: StatKey }> = {}
for (const [name, d] of Object.entries(naturesData)) {
  let inc: StatKey
  let dec: StatKey
  if (!d.increased || !d.decreased) {
    inc = dec = STAT_BY_INDEX[d.index]
  } else {
    inc = d.increased as StatKey
    dec = d.decreased as StatKey
  }
  PAIR_TO_NATURE[`${inc}|${dec}`] = name
  NATURE_TO_PAIR[name] = { inc, dec }
}

interface Props {
  value: string
  onChange: (nature: string) => void
}

/**
 * Pick a nature via two rows of stat buttons (boost / lower), mirroring the
 * Natures tab. Selecting the same stat for both yields a neutral nature.
 * Shared by StatsView and DamageView.
 */
export default function NatureSelector({ value, onChange }: Props) {
  const pair = NATURE_TO_PAIR[value] ?? { inc: 'attack', dec: 'attack' }
  const neutral = pair.inc === pair.dec

  const pick = (which: 'inc' | 'dec', stat: StatKey) => {
    const inc = which === 'inc' ? stat : pair.inc
    const dec = which === 'dec' ? stat : pair.dec
    const next = PAIR_TO_NATURE[`${inc}|${dec}`]
    if (next) onChange(next)
  }

  const Row = ({ label, accent, which, selected }: {
    label: string; accent: string; which: 'inc' | 'dec'; selected: StatKey | null
  }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold w-3 flex-shrink-0 text-center" style={{ color: accent }}>{label}</span>
      <div className="flex gap-1 flex-1">
        {STAT_KEYS.map(stat => {
          const isSel = selected === stat
          return (
            <button
              key={stat}
              type="button"
              onClick={() => pick(which, stat)}
              className="flex-1 px-1 py-1 rounded text-[10px] font-semibold border transition-colors"
              style={{
                backgroundColor: isSel ? STAT_BG[stat] : '#111827',
                borderColor: isSel ? STAT_COLOR[stat] : '#374151',
                color: isSel ? STAT_COLOR[stat] : '#9ca3af',
              }}
            >
              {STAT_ABBR[stat]}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="space-y-1">
      <Row label="+" accent="#22c55e" which="inc" selected={neutral ? null : pair.inc} />
      <Row label="−" accent="#ef4444" which="dec" selected={neutral ? null : pair.dec} />
      <p className="text-[10px] text-gray-400 pl-4">
        <span className="font-semibold text-gray-200">{value}</span>
        {neutral && <span className="text-gray-600"> · neutral</span>}
      </p>
    </div>
  )
}
