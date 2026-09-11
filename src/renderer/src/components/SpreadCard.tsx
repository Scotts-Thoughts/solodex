import type { ReactNode } from 'react'
import type { BaseStats } from '../types/pokemon'
import { displayName, splitFormName } from '../data'
import { STAT_CONFIG, GEN1_STAT_CONFIG } from '../constants/stats'
import { TYPE_COLORS } from './TypeBadge'
import { getArtworkUrl } from '../utils/sprites'
import {
  calcGen12Stats,
  calcGen3PlusStats,
  applyBadgeStatBoost,
  deriveHpDv,
  DEFAULT_GEN12_STATEXPS,
  DEFAULT_GEN3_EVS,
  type CalcStats,
  type Gen12DVs,
  type Gen12StatExps,
  type Gen3IVs,
  type Gen3EVs,
  type NatureMods,
  type BadgeStat,
} from '../utils/damageCalc'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SpreadCardProps {
  species: string
  dexNumber: number
  type1: string
  type2: string
  game: string
  gen: number
  level: number
  /** The species' base stats — used to derive the zero-investment baseline. */
  baseStats: BaseStats
  /** Final (unboosted) stats, as held by the damage view's Stats fields. */
  stats: CalcStats
  ivs: Gen3IVs
  evs: Gen3EVs
  dvs: Gen12DVs
  statExps: Gen12StatExps
  natureName: string
  natureMods: NatureMods
  heldItemName: string | null
  badges: Set<string>
  /** True when the user hand-edited a stat, so IV/EV no longer derive it. */
  statsLocked: boolean
}

// ─── Palette / helpers ────────────────────────────────────────────────────────

type StatKey = keyof CalcStats

// CalcStats keys → the BaseStats keys the shared stat config is keyed by, so
// the card's row colors stay tied to STAT_CONFIG / GEN1_STAT_CONFIG.
const BASE_KEY: Record<StatKey, keyof BaseStats> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  spattack: 'special_attack',
  spdefense: 'special_defense',
  speed: 'speed',
}

function statColor(key: StatKey, gen: number): string {
  const config = gen <= 1 ? GEN1_STAT_CONFIG : STAT_CONFIG
  return config.find(c => c.key === BASE_KEY[key])?.color ?? '#9ca3af'
}

/** Blend a hex color toward white — used for the lighter EV segment of a bar. */
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}

const ROWS_GEN1: Array<{ key: StatKey; label: string }> = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Atk' },
  { key: 'defense', label: 'Def' },
  { key: 'spattack', label: 'Spc' },
  { key: 'speed', label: 'Spe' },
]

const ROWS_MODERN: Array<{ key: StatKey; label: string }> = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Atk' },
  { key: 'defense', label: 'Def' },
  { key: 'spattack', label: 'SpA' },
  { key: 'spdefense', label: 'SpD' },
  { key: 'speed', label: 'Spe' },
]

const NATURE_STAT_LABEL: Record<keyof NatureMods, string> = {
  attack: 'Atk', defense: 'Def', spattack: 'SpA', spdefense: 'SpD', speed: 'Spe',
}

// Fixed cell widths for the stat table. Laid out as flex rows rather than one
// CSS grid because html-to-image clones the DOM node-by-node and `display:
// contents` wrappers don't survive that reliably.
const CELL_LABEL = 78
const CELL_IV = 52
const CELL_EV = 66
const CELL_VALUE = 96
const CELL_GAP = 14

// Stat bars match the base-stat graphs elsewhere in the app (BaseStatsCardBody
// / BaseStats): a 16px `rounded-sm` track in gray-700 at 80%, filled with the
// stat color under a top-light sheen at 90% opacity.
const BAR_HEIGHT = 16
const BAR_RADIUS = 2
const BAR_TRACK = 'rgba(55,65,81,0.8)'
const BAR_SHEEN = 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%)'
const BAR_OPACITY = 0.9

// Nature markers follow the games' summary-screen convention: the raised stat
// reads blue, the lowered stat red.
const NATURE_UP_COLOR = '#60a5fa'
const NATURE_DOWN_COLOR = '#f87171'

// ─── Small pieces ─────────────────────────────────────────────────────────────

function TypeChip({ type }: { type: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 84,
        padding: '4px 12px',
        borderRadius: 6,
        background: TYPE_COLORS[type] ?? '#6b7280',
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        textAlign: 'center',
        textShadow: '0 1px 2px rgba(0,0,0,0.45)',
      }}
    >
      {type}
    </span>
  )
}

function Pill({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: 'rgba(148,163,184,0.07)',
        border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: 14,
        padding: '9px 16px 11px',
        textAlign: 'right',
        minWidth: 176,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#6b7280' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

/** The "+SpA / −Atk" mini chips under the nature name. */
function NatureChip({ sign, label }: { sign: '+' | '−'; label: string }) {
  const up = sign === '+'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 700,
        color: up ? '#93c5fd' : '#fca5a5',
        background: up ? 'rgba(59,130,246,0.16)' : 'rgba(239,68,68,0.14)',
        border: `1px solid ${up ? 'rgba(59,130,246,0.32)' : 'rgba(239,68,68,0.3)'}`,
      }}
    >
      {sign}{label}
    </span>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

/**
 * The damage view's spread graphic: artwork, identity, level, nature and the
 * per-stat IV/EV (or DV/Stat Exp) investment next to the resulting stats.
 *
 * Presentational only — it takes plain values so the export pipeline can mount
 * it offscreen. Sized to roughly 16:9 so it centers on the 1920x1080 export
 * canvas with even margins.
 */
export default function SpreadCard(props: SpreadCardProps) {
  const {
    species, dexNumber, type1, type2, game, gen, level, baseStats, stats,
    ivs, evs, dvs, statExps, natureName, natureMods, heldItemName, badges, statsLocked,
  } = props

  const isGen12 = gen <= 2
  const rows = gen <= 1 ? ROWS_GEN1 : ROWS_MODERN
  const name = displayName(species)
  const { base: nameBase, form: nameForm } = splitFormName(name)
  const isDualType = type1 !== type2

  // The Stats fields in the damage view show the in-battle value with badge
  // boosts folded in (HP is never boosted) — mirror that here so the graphic
  // matches what the user was looking at when they hit export.
  const withBadges = (key: StatKey, value: number) =>
    key === 'hp' ? value : applyBadgeStatBoost(value, key as BadgeStat, badges, game)

  const finalOf = (key: StatKey) => withBadges(key, stats[key])

  // The same spread with zero EV / Stat Exp investment. The difference is drawn
  // as the lighter tail on each bar, so the graphic shows what training bought.
  // Meaningless once a stat has been hand-edited, so it's dropped in that case.
  const zeroInvest = isGen12
    ? calcGen12Stats(baseStats, level, dvs, DEFAULT_GEN12_STATEXPS)
    : calcGen3PlusStats(baseStats, level, ivs, DEFAULT_GEN3_EVS, natureMods, species)

  const values = rows.map(r => finalOf(r.key))
  const scaleMax = Math.max(10, Math.ceil((Math.max(...values) * 1.08) / 10) * 10)

  // Investment columns differ by era: Gen 1–2 use DVs + Stat Exp (SpA/SpD share
  // one value, HP's DV is derived); Gen 3+ use per-stat IVs + EVs.
  const investOf = (key: StatKey): { iv: number; ivMax: number; ev: number; evMax: number } => {
    if (isGen12) {
      const dv = key === 'hp' ? deriveHpDv(dvs)
        : key === 'spattack' || key === 'spdefense' ? dvs.special
        : dvs[key as 'attack' | 'defense' | 'speed']
      const exp = key === 'hp' ? statExps.hp
        : key === 'spattack' || key === 'spdefense' ? statExps.special
        : statExps[key as 'attack' | 'defense' | 'speed']
      return { iv: dv, ivMax: 15, ev: exp, evMax: 65535 }
    }
    return { iv: ivs[key], ivMax: 31, ev: evs[key], evMax: 252 }
  }

  const natureKeys = Object.keys(NATURE_STAT_LABEL) as Array<keyof NatureMods>
  const natureUp = natureKeys.find(k => natureMods[k] > 1)
  const natureDown = natureKeys.find(k => natureMods[k] < 1)

  const badgeBoosted = rows.some(r => finalOf(r.key) !== stats[r.key])
  const showEvTail = !statsLocked
  const investTotal = isGen12
    ? Object.values(dvs).reduce((a, b) => a + b, 0) + deriveHpDv(dvs)
    : Object.values(evs).reduce((a, b) => a + b, 0)
  const investLabel = isGen12 ? `DVs ${investTotal}/75` : `EVs ${investTotal}/510`
  const anyInvestment = rows.some(r => investOf(r.key).ev > 0)

  const accent1 = TYPE_COLORS[type1] ?? '#6b7280'
  const accent2 = TYPE_COLORS[isDualType ? type2 : type1] ?? accent1

  const footerBits = [
    game,
    `Lv ${level}`,
    investLabel,
    !isGen12 ? natureName : null,
    heldItemName,
    badgeBoosted ? 'incl. badge boosts' : null,
    statsLocked ? 'stats set manually' : null,
  ].filter(Boolean) as string[]

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        // Width is tuned against CANVAS_FIT.spread: at ~1120x594 the card sits
        // on the 1920x1080 export canvas with near-even margins (~115 / ~92).
        width: 1120,
        padding: '34px 40px 24px',
        borderRadius: 28,
        background: 'linear-gradient(155deg, #1d2533 0%, #151b26 46%, #10141c 100%)',
        border: '1px solid rgba(148,163,184,0.16)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        color: '#f8fafc',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Type-colored hairline across the top */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 5,
          background: `linear-gradient(90deg, ${accent1} 0%, ${accent2} 100%)`,
          opacity: 0.9,
        }}
      />

      {/* ── Header: artwork · identity · level/nature ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <div style={{ position: 'relative', width: 172, height: 172, flexShrink: 0 }}>
          {/* Type-colored ambient glow. Sized `closest-side` and reaching full
              transparency inside its own box, so there's no clipped disc edge —
              the earlier `border-radius: 50%` version still had color at the
              circle's rim, which read as a hard bubble. */}
          <div
            style={{
              position: 'absolute', inset: -26,
              background: `radial-gradient(circle closest-side, ${accent1}4d 0%, ${accent1}22 45%, ${accent1}00 78%)`,
            }}
          />
          <img
            src={getArtworkUrl(species, dexNumber)}
            alt={name}
            crossOrigin="anonymous"
            style={{
              position: 'relative', width: 172, height: 172, objectFit: 'contain',
              // One soft, clearly downward shadow. A second tight shadow traces
              // the silhouette instead and reads as a dark aura on pale artwork.
              filter: 'drop-shadow(0 14px 12px rgba(0,0,0,0.55))',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: '#64748b' }}>
            #{String(dexNumber).padStart(4, '0')}
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.08, letterSpacing: -0.5, marginTop: 2 }}>
            {nameBase}
          </div>
          {nameForm && (
            <div style={{ fontSize: 20, fontWeight: 600, color: '#94a3b8', lineHeight: 1.2 }}>
              {nameForm}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <TypeChip type={type1} />
            {isDualType && <TypeChip type={type2} />}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <Pill label="LEVEL">
            <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {level}
            </div>
          </Pill>
          {isGen12 ? (
            <Pill label="HP DV">
              <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>
                {deriveHpDv(dvs)}
                <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}> /15</span>
              </div>
            </Pill>
          ) : (
            <Pill label="NATURE">
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35 }}>{natureName}</div>
              <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', marginTop: 4 }}>
                {natureUp && natureDown ? (
                  <>
                    <NatureChip sign="+" label={NATURE_STAT_LABEL[natureUp]} />
                    <NatureChip sign="−" label={NATURE_STAT_LABEL[natureDown]} />
                  </>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>neutral</span>
                )}
              </div>
            </Pill>
          )}
        </div>
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          height: 1, margin: '26px 0 16px',
          background: 'linear-gradient(90deg, rgba(148,163,184,0) 0%, rgba(148,163,184,0.24) 12%, rgba(148,163,184,0.24) 88%, rgba(148,163,184,0) 100%)',
        }}
      />

      {/* ── Stat table ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {/* Column headings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: CELL_GAP }}>
          <div style={{ width: CELL_LABEL, flexShrink: 0 }} />
          <div style={{ width: CELL_IV, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: '#64748b', textAlign: 'center' }}>
            {isGen12 ? 'DV' : 'IV'}
          </div>
          <div style={{ width: CELL_EV, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: '#64748b', textAlign: 'center' }}>
            {isGen12 ? 'EXP' : 'EV'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }} />
          <div style={{ width: CELL_VALUE, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: '#64748b', textAlign: 'right' }}>
            STAT
          </div>
        </div>

        {rows.map(({ key, label }) => {
          const color = statColor(key, gen)
          const value = finalOf(key)
          const { iv, ivMax, ev, evMax } = investOf(key)
          const mod = key === 'hp' ? 1 : natureMods[key as keyof NatureMods]

          // Bar: solid stat color up to the zero-investment value, then a
          // lighter tail for everything the EV / Stat Exp training added.
          const totalPct = Math.min(100, (value / scaleMax) * 100)
          const basePct = showEvTail
            ? Math.min(totalPct, (withBadges(key, zeroInvest[key]) / scaleMax) * 100)
            : totalPct
          const tailPct = Math.max(0, totalPct - basePct)

          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: CELL_GAP }}>
              <div style={{ width: CELL_LABEL, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color }}>
                  {label}
                </span>
                {mod > 1 && <span style={{ fontSize: 11, color: NATURE_UP_COLOR }}>▲</span>}
                {mod < 1 && <span style={{ fontSize: 11, color: NATURE_DOWN_COLOR }}>▼</span>}
              </div>

              <div
                style={{
                  width: CELL_IV, flexShrink: 0,
                  fontSize: 15, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                  color: iv >= ivMax ? '#f1f5f9' : iv === 0 ? '#475569' : '#94a3b8',
                }}
              >
                {iv}
              </div>

              <div
                style={{
                  width: CELL_EV, flexShrink: 0,
                  fontSize: 15, fontWeight: 700, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                  color: ev >= evMax ? color : ev === 0 ? '#475569' : '#cbd5e1',
                }}
              >
                {ev}
              </div>

              <div
                style={{
                  flex: 1, minWidth: 0,
                  position: 'relative', height: BAR_HEIGHT, borderRadius: BAR_RADIUS,
                  overflow: 'hidden', background: BAR_TRACK,
                }}
              >
                {/* The two segments butt together with square inner edges and
                    share the same sheen, so the fill reads as one bar that
                    changes color — no track showing through the seam. */}
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: `${basePct}%`,
                    borderRadius: tailPct > 0 ? `${BAR_RADIUS}px 0 0 ${BAR_RADIUS}px` : BAR_RADIUS,
                    background: `${BAR_SHEEN} ${color}`,
                    opacity: BAR_OPACITY,
                  }}
                />
                {tailPct > 0 && (
                  <div
                    style={{
                      position: 'absolute', left: `${basePct}%`, top: 0, bottom: 0, width: `${tailPct}%`,
                      borderRadius: `0 ${BAR_RADIUS}px ${BAR_RADIUS}px 0`,
                      background: `${BAR_SHEEN} ${lighten(color, 0.5)}`,
                      opacity: BAR_OPACITY,
                    }}
                  />
                )}
              </div>

              <div
                style={{
                  width: CELL_VALUE, flexShrink: 0,
                  fontSize: 28, fontWeight: 800, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
                }}
              >
                {value}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, paddingTop: 13,
          borderTop: '1px solid rgba(148,163,184,0.12)',
          fontSize: 13, color: '#64748b',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          {footerBits.map((bit, i) => (
            <span key={bit + i}>
              {i > 0 && <span style={{ color: '#3f4a5a' }}> · </span>}
              <span style={{ color: i === 0 ? '#94a3b8' : undefined, fontWeight: i === 0 ? 600 : 400 }}>{bit}</span>
            </span>
          ))}
        </span>
        {showEvTail && anyInvestment && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span
              style={{
                display: 'inline-block', width: 22, height: 9, borderRadius: BAR_RADIUS,
                background: lighten('#94a3b8', 0.5),
              }}
            />
            {isGen12 ? 'Stat Exp gain' : 'EV gain'}
          </span>
        )}
      </div>
    </div>
  )
}
