import { createRoot } from 'react-dom/client'
import { useLayoutEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import {
  getPokemonData,
  getTmHmCode,
  getPokemonDefenseMatchups,
  displayName,
} from '../data'
import type { BaseStats, PokemonData } from '../types/pokemon'
import { BaseStatsCardBody } from '../components/BaseStatsCard'
import { EffectivenessCardBody } from '../components/EffectivenessCard'
import SpreadCard, { type SpreadCardProps } from '../components/SpreadCard'
import { TYPE_COLORS } from '../components/TypeBadge'
import { MoveRow as MovepoolRow, singleLevelRows } from '../components/Movepool'
import type { RowData } from '../components/Movepool'
import SortableTableHeader from '../components/SortableTableHeader'
import type { SortState } from '../hooks/useMoveSort'
import { STAT_CONFIG, GEN1_STAT_CONFIG, MAX_STAT, GEN1_GAMES } from '../constants/stats'
import { EFF_GROUPS, getAbilityImmunityType } from '../constants/effectiveness'
import { getArtworkUrl } from './sprites'
import { compareTmHmPrefix } from './tmhmSort'
import { getExportBgColor, saveExportPng } from './exportSettings'
import { buildExportFilename } from './exportFilename'

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map(img =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            const done = () => resolve()
            img.addEventListener('load', done, { once: true })
            img.addEventListener('error', done, { once: true })
          })
    )
  )
}

async function renderElementToPng(element: ReactElement): Promise<string> {
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-99999px;top:0;background:transparent;'
  // Inner mount mirrors the single-card export's `<div ref={cardRef}>` wrapper:
  // we capture this plain, un-zoomed wrapper (shrink-to-fit via inline-block)
  // rather than the rendered element itself. Capturing a child that carries a
  // `zoom` (e.g. BaseStatsCardBody's zoom:0.75) AND forcing width/height to its
  // scrollWidth double-scales it; letting html-to-image measure the wrapper's
  // natural box reproduces the manual single-graphic export exactly.
  const mount = document.createElement('div')
  mount.style.cssText = 'display:inline-block;'
  container.appendChild(mount)
  document.body.appendChild(container)
  const root = createRoot(mount)
  root.render(element)
  await nextFrame()
  await waitForImages(mount)
  await nextFrame()

  const { toPng } = await import('html-to-image')
  // Sortable headers use a sticky bg-gray-900 fill for on-screen scrolling;
  // neutralize it for export so the header reads as transparent (matches the
  // single-table export in downloadTableImage).
  mount.querySelectorAll<HTMLElement>('th').forEach(th => {
    th.style.backgroundColor = 'transparent'
  })
  const dataUrl = await toPng(mount, {
    pixelRatio: 3,
    backgroundColor: 'transparent',
    filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
  })

  root.unmount()
  container.remove()
  return dataUrl
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = dataUrl
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
  })
  return img
}

async function compositeWithShadow(innerDataUrl: string, pad = 24): Promise<string> {
  const img = await loadImage(innerDataUrl)
  const bgColor = getExportBgColor()
  const canvas = document.createElement('canvas')
  canvas.width = img.width + pad * 2
  canvas.height = img.height + pad * 2
  const ctx = canvas.getContext('2d')!
  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = 18
  ctx.drawImage(img, pad, pad)
  return canvas.toDataURL('image/png')
}

// Flat composite for graphics that intentionally carry no drop shadow (move
// tables, comparison cards). When the user has opted out of transparent export,
// fill the configured background behind the image at its exact size — same as
// the single-table export's `backgroundColor`. Transparent export passes the
// inner PNG through untouched.
async function compositeFlat(innerDataUrl: string): Promise<string> {
  const bgColor = getExportBgColor()
  if (bgColor === 'transparent') return innerDataUrl
  const img = await loadImage(innerDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

// Per-graphic fit factors on the 1920x1080 canvas: the graphic is scaled to
// fit within this fraction of the canvas, so a smaller number shrinks the
// graphic while the canvas stays 1080p. Graphic types not listed here use the
// default fit.
const DEFAULT_CANVAS_FIT = 0.93
export const CANVAS_FIT = {
  effectiveness: 0.85,
  levelUp: 0.75,
  tmHm: 0.93,
  levelUpComparison: 0.8,
  tmHmComparison: 0.93,
  transferComparison: 0.8,
  typeEffComparison: 0.88,
  spread: 0.88,
} as const

// 1920x1080 canvas, inner graphic scaled to the given fit with a soft drop shadow.
async function compositeOn1920x1080(innerDataUrl: string, fit: number = DEFAULT_CANVAS_FIT): Promise<string> {
  const img = await loadImage(innerDataUrl)
  const bgColor = getExportBgColor()
  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1080
  const ctx = canvas.getContext('2d')!
  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, 1920, 1080)
  }
  const maxW = 1920 * fit
  const maxH = 1080 * fit
  const scale = Math.min(maxW / img.width, maxH / img.height, 1.15)
  const drawW = img.width * scale
  const drawH = img.height * scale
  const x = (1920 - drawW) / 2
  const y = (1080 - drawH) / 2
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = 6
  ctx.drawImage(img, x, y, drawW, drawH)
  return canvas.toDataURL('image/png')
}

// Single source of truth for how a captured graphic is composited: onto the
// 1920x1080 canvas when scaling is on (at the graphic type's fit factor),
// otherwise a padded drop shadow for the stats/effectiveness cards or a flat
// fill for tables and comparison graphics.
function applyComposite(innerDataUrl: string, usesShadow: boolean, scaleToCanvas: boolean, fit?: number): Promise<string> {
  if (scaleToCanvas) return compositeOn1920x1080(innerDataUrl, fit)
  return usesShadow ? compositeWithShadow(innerDataUrl) : compositeFlat(innerDataUrl)
}

// Composite treatment for single-graphic exports (card modals, movepool title
// buttons, comparison views, table exports). Reads the same "Scale exports to
// 1920x1080 canvas" menu setting as the bulk "export all graphics" flow so an
// individually exported graphic is styled exactly like its bulk counterpart.
export async function compositeSingleExport(innerDataUrl: string, usesShadow: boolean, fit?: number): Promise<string> {
  const scaleToCanvas = await window.electronAPI.getBulkExport1080()
  return applyComposite(innerDataUrl, usesShadow, scaleToCanvas, fit)
}

// `width` pins every chip to one size (a column of chips); without it the chip
// grows with its label from a 68px minimum.
function TypeChip({ type, width }: { type: string; width?: number }) {
  const color = TYPE_COLORS[type] ?? '#6B7280'
  return (
    <span
      className={`inline-block rounded text-xs font-semibold text-center py-0.5 ${width ? '' : 'px-3'}`}
      style={{
        backgroundColor: color,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        ...(width ? { width } : { minWidth: '68px' }),
      }}
    >
      {type}
    </span>
  )
}

function TypeBadgeSmall({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? '#6B7280'
  return (
    <span
      className="inline-block rounded text-[11px] font-semibold text-center py-0 px-2"
      style={{
        backgroundColor: color,
        color: '#fff',
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        minWidth: '68px',
      }}
    >
      {type}
    </span>
  )
}

// Sort state for export: always the default (unsorted) ordering, with a no-op
// sort handler since the rendered-to-PNG table is non-interactive.
const EXPORT_SORT: SortState = { column: 'default', direction: 'asc' }

// Renders the move table using the SAME components as the live movepool
// (SortableTableHeader + MoveRow), so the bulk "export all graphics" output
// matches the single-table export from the movepool title exactly.
// `col1` is the first column header ('Lv' for level-up, '' for TM/HM).
function MoveTable({ title, rows, game, col1 }: { title: string; rows: RowData[]; game: string; col1: string }) {
  return (
    <div style={{ background: 'transparent' }}>
      <div
        style={{
          textAlign: 'center',
          fontSize: 14,
          fontWeight: 600,
          color: 'white',
          paddingBottom: 6,
        }}
      >
        {title}
      </div>
      <table data-move-table className="text-sm border-separate border-spacing-0">
        <SortableTableHeader sort={EXPORT_SORT} onSort={() => {}} col1={col1} />
        <tbody>
          {rows.map((row, i) => (
            <MovepoolRow key={i} row={row} game={game} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Column-width sync cloned from the comparison views: measure both tables'
// cells and pin a shared colgroup so the two sides read as one aligned grid.
function syncComparisonColumnWidths(container: HTMLElement | null) {
  if (!container) return
  const tables = container.querySelectorAll<HTMLTableElement>('table[data-move-table]')
  if (tables.length < 2) return

  tables.forEach(table => {
    table.style.tableLayout = ''
    table.style.width = 'auto'
    const cg = table.querySelector('colgroup')
    if (cg) cg.remove()
  })

  const maxWidths: number[] = []
  tables.forEach(table => {
    const row = table.querySelector('thead tr') ?? table.querySelector('tr')
    if (!row) return
    const cells = row.children
    for (let i = 0; i < cells.length; i++) {
      const w = (cells[i] as HTMLElement).offsetWidth
      maxWidths[i] = Math.max(maxWidths[i] ?? 0, w)
    }
  })

  tables.forEach(table => {
    table.style.width = 'auto'
    const cg = document.createElement('colgroup')
    maxWidths.forEach(w => {
      const col = document.createElement('col')
      col.style.width = `${w}px`
      cg.appendChild(col)
    })
    table.prepend(cg)
    table.style.tableLayout = 'fixed'
  })
}

function ComparisonMoveColumn({ name, rows, otherMoves, game, col1, highlightDiff }: {
  name: string
  rows: RowData[]
  otherMoves: Set<string>
  game: string
  col1: string
  highlightDiff: boolean
}) {
  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'white', paddingBottom: 4 }}>
        {displayName(name)} <span style={{ color: '#6b7280', fontWeight: 400 }}>({rows.length})</span>
      </div>
      {rows.length > 0 ? (
        <table data-move-table className="text-sm border-separate border-spacing-0">
          <SortableTableHeader sort={EXPORT_SORT} onSort={() => {}} col1={col1} />
          <tbody>
            {rows.map((row, i) => (
              <MovepoolRow key={i} row={row} game={game} highlight={highlightDiff && !otherMoves.has(row.moveName)} />
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-500 text-center px-6 py-3">No moves</p>
      )}
    </div>
  )
}

// Side-by-side move tables for one learnset category, mirroring the comparison
// view's movepool columns: column widths synced across both tables, and (for
// level-up and TM/HM, when the "show movepool differences" setting is on) a
// soft blue tint on moves the other Pokemon doesn't learn.
function ComparisonMoveTable({ title, left, right, leftRows, rightRows, game, col1, highlightDiff }: {
  title: string
  left: string
  right: string
  leftRows: RowData[]
  rightRows: RowData[]
  game: string
  col1: string
  highlightDiff: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { syncComparisonColumnWidths(containerRef.current) }, [])
  const leftMoves = new Set(leftRows.map(r => r.moveName))
  const rightMoves = new Set(rightRows.map(r => r.moveName))
  return (
    <div ref={containerRef} style={{ background: 'transparent' }}>
      <div
        style={{
          textAlign: 'center',
          fontSize: 14,
          fontWeight: 600,
          color: 'white',
          paddingBottom: 6,
        }}
      >
        {title}
      </div>
      <div className="flex">
        <ComparisonMoveColumn name={left} rows={leftRows} otherMoves={rightMoves} game={game} col1={col1} highlightDiff={highlightDiff} />
        <div className="w-px bg-gray-700 shrink-0 mx-2" />
        <ComparisonMoveColumn name={right} rows={rightRows} otherMoves={leftMoves} game={game} col1={col1} highlightDiff={highlightDiff} />
      </div>
    </div>
  )
}

// Per-table export used by the movepool's title buttons (Level Up, TM/HM, Move
// Tutor, Egg, Transfer). Renders a fresh MoveTable through the SAME capture +
// composite path as the bulk "export all graphics" flow so a single-table
// export and its counterpart in the bulk export are pixel-identical, including
// the 1920x1080 canvas scaling when that setting is on.
export async function exportMoveTableImage(
  title: string,
  rows: RowData[],
  game: string,
  col1: string,
  filenameBase: string,
  fit?: number,
): Promise<void> {
  const inner = await renderElementToPng(
    <MoveTable title={title} rows={rows} game={game} col1={col1} />
  )
  const dataUrl = await compositeSingleExport(inner, false, fit)
  await saveExportPng(dataUrl, buildExportFilename(game, filenameBase))
}

// Single-card exports used by the stats/effectiveness modals' export buttons.
// Rendered through the SAME capture + composite path as the bulk flow so a
// manually exported card matches its bulk counterpart exactly.
export async function exportStatsCardImage(props: {
  stats: BaseStats
  species: string
  dexNumber: number
  type1: string
  type2: string
  game: string
}): Promise<void> {
  const inner = await renderElementToPng(<BaseStatsCardBody {...props} />)
  const dataUrl = await compositeSingleExport(inner, true)
  const base = safeFileName(displayName(props.species))
  await saveExportPng(dataUrl, buildExportFilename(props.game, `${base}_stats`))
}

// Damage-view spread card: IVs/EVs (or DVs/Stat Exp), nature and the resulting
// stats. Unlike the other single-graphic exports this one ALWAYS composites onto
// the 1920x1080 canvas rather than reading the "scale exports" menu setting —
// the card is laid out at ~16:9 specifically to sit centered in that frame.
export async function exportSpreadCardImage(props: SpreadCardProps): Promise<void> {
  const inner = await renderElementToPng(<SpreadCard {...props} />)
  const dataUrl = await compositeOn1920x1080(inner, CANVAS_FIT.spread)
  const base = safeFileName(displayName(props.species))
  await saveExportPng(dataUrl, buildExportFilename(props.game, `${base}_spread`))
}

export async function exportEffectivenessCardImage(props: {
  species: string
  dexNumber: number
  type1: string
  type2: string
  game: string
  abilities: string[]
}): Promise<void> {
  const inner = await renderElementToPng(<EffectivenessCardBody {...props} />)
  const dataUrl = await compositeSingleExport(inner, true, CANVAS_FIT.effectiveness)
  const base = safeFileName(displayName(props.species))
  await saveExportPng(dataUrl, buildExportFilename(props.game, `${base}_effectiveness`))
}

// Comparison-card export used by the comparison view's export button. Renders
// the SAME offscreen ComparisonCard as the bulk "with comparisons" flow so the
// button's output matches its bulk counterpart exactly — layout, type
// effectiveness columns, canvas treatment, and filename (including the
// _no_effectiveness variant when type effectiveness is excluded).
export async function exportComparisonCardImage(
  left: PokemonData,
  right: PokemonData,
  game: string,
  includeTypeEff: boolean,
): Promise<void> {
  const inner = await renderElementToPng(
    <ComparisonCard left={left} right={right} game={game} includeTypeEff={includeTypeEff} />
  )
  const dataUrl = await compositeSingleExport(inner, false)
  const base = `${safeFileName(displayName(left.species))}_vs_${safeFileName(displayName(right.species))}`
  await saveExportPng(dataUrl, buildExportFilename(game, includeTypeEff ? base : `${base}_no_effectiveness`))
}

function ComparisonIdentity({ pokemon, game, artworkUrl }: { pokemon: PokemonData; game: string; artworkUrl?: string }) {
  const isDual = pokemon.type_1 !== pokemon.type_2
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: 180 }}>
      <h2 className="text-center text-lg font-bold text-white leading-tight">{displayName(pokemon.species)}</h2>
      <img
        src={artworkUrl ?? getArtworkUrl(pokemon.species, pokemon.national_dex_number)}
        alt=""
        className="w-36 h-36 object-contain drop-shadow-lg"
        crossOrigin="anonymous"
      />
      <div className="flex gap-1.5 justify-center -mt-4 relative z-10">
        <TypeChip type={pokemon.type_1} />
        {isDual && <TypeChip type={pokemon.type_2} />}
      </div>
    </div>
  )
}

function EffectivenessColumn({ pokemon, game, align }: { pokemon: PokemonData; game: string; align: 'left' | 'right' }) {
  const matchups = getPokemonDefenseMatchups(pokemon.type_1, pokemon.type_2, game)
  const abilities = [...new Set(pokemon.abilities)]
  const abilityImmunityMap: Record<string, string> = {}
  for (const ability of abilities) {
    const immuneType = getAbilityImmunityType(ability, game)
    if (immuneType) abilityImmunityMap[immuneType] = ability
  }
  const rows = EFF_GROUPS.flatMap(group => {
    const types = Object.entries(matchups).filter(([, v]) => v === group.value).map(([t]) => t)
    if (types.length === 0) return []
    return [{ ...group, types }]
  })
  const isRight = align === 'right'
  return (
    <div style={{ width: 150 }}>
      {rows.map((group, gi) => (
        <div key={group.value} className={gi > 0 ? 'mt-2 pt-2' : ''} style={gi > 0 ? { borderTop: '1px solid #1f2937' } : undefined}>
          {group.types.map(type => {
            const immunityAbility = abilityImmunityMap[type]
            return (
              <div key={type} className={`flex items-center gap-2 py-0.5 ${isRight ? 'flex-row-reverse' : ''}`}>
                <TypeBadgeSmall type={type} />
                <span
                  style={{ backgroundColor: group.bg, color: group.text, width: 28, flexShrink: 0 }}
                  className="text-xs font-bold text-center rounded py-0.5"
                >
                  {group.multiplierLabel}
                </span>
                {immunityAbility && (
                  <span className="text-xs text-gray-500 italic">({immunityAbility})</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function StatsComparisonBody({ left, right, game }: { left: PokemonData; right: PokemonData; game: string }) {
  const isGen1 = GEN1_GAMES.has(game)
  const config = isGen1 ? GEN1_STAT_CONFIG : STAT_CONFIG
  const totalL = isGen1
    ? left.base_stats.hp + left.base_stats.attack + left.base_stats.defense + left.base_stats.special_attack + left.base_stats.speed
    : Object.values(left.base_stats).reduce((s, v) => s + v, 0)
  const totalR = isGen1
    ? right.base_stats.hp + right.base_stats.attack + right.base_stats.defense + right.base_stats.special_attack + right.base_stats.speed
    : Object.values(right.base_stats).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-1" style={{ minWidth: 320 }}>
      {config.map(({ key, label, color }) => {
        const lv = left.base_stats[key]
        const rv = right.base_stats[key]
        const diff = lv - rv
        const lPct = Math.min((lv / MAX_STAT) * 100, 100)
        const rPct = Math.min((rv / MAX_STAT) * 100, 100)
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-9 text-right text-sm font-bold tabular-nums shrink-0 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-600'}`}>
              {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
            </span>
            <div className="flex-1 flex items-center gap-1.5 justify-end">
              <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden flex justify-end">
                <div className="h-full rounded-sm" style={{ width: `${lPct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.85 }} />
              </div>
              <span className={`w-7 text-right text-sm font-bold tabular-nums ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : ''}`} style={diff === 0 ? { color } : undefined}>
                {lv}
              </span>
            </div>
            <span className="w-12 text-center text-xs font-semibold text-gray-500 shrink-0">{label}</span>
            <div className="flex-1 flex items-center gap-1.5">
              <span className={`w-7 text-left text-sm font-bold tabular-nums ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : ''}`} style={diff === 0 ? { color } : undefined}>
                {rv}
              </span>
              <div className="flex-1 h-3 bg-gray-700 rounded-sm overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: `${rPct}%`, background: `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 100%) ${color}`, opacity: 0.85 }} />
              </div>
            </div>
            <span className={`w-9 text-left text-sm font-bold tabular-nums shrink-0 ${diff < 0 ? 'text-green-400' : diff > 0 ? 'text-red-400' : 'text-gray-600'}`}>
              {diff < 0 ? `+${-diff}` : diff === 0 ? '—' : `${-diff}`}
            </span>
          </div>
        )
      })}
      <div className="flex items-center gap-1.5 pt-1 mt-1" style={{ borderTop: '1px solid #374151' }}>
        {(() => {
          const td = totalL - totalR
          return (
            <>
              <span className={`w-9 text-right text-sm font-bold tabular-nums shrink-0 ${td > 0 ? 'text-green-400' : td < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {td > 0 ? `+${td}` : td === 0 ? '—' : td}
              </span>
              <div className="flex-1 flex justify-end">
                <span className={`w-7 text-right text-sm font-bold tabular-nums ${td > 0 ? 'text-green-400' : td < 0 ? 'text-red-400' : 'text-white'}`}>{totalL}</span>
              </div>
              <span className="w-12 text-center text-xs font-semibold text-gray-500 shrink-0">Total</span>
              <div className="flex-1">
                <span className={`w-7 text-left text-sm font-bold tabular-nums ${td < 0 ? 'text-green-400' : td > 0 ? 'text-red-400' : 'text-white'}`}>{totalR}</span>
              </div>
              <span className={`w-9 text-left text-sm font-bold tabular-nums shrink-0 ${td < 0 ? 'text-green-400' : td > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                {td < 0 ? `+${-td}` : td === 0 ? '—' : `${-td}`}
              </span>
            </>
          )
        })()}
      </div>
    </div>
  )
}

function ComparisonCard({ left, right, game, includeTypeEff, leftArt, rightArt }: { left: PokemonData; right: PokemonData; game: string; includeTypeEff: boolean; leftArt?: string; rightArt?: string }) {
  return (
    <div
      className="px-6 py-4 rounded-2xl"
      style={{ background: 'transparent', width: 'fit-content' }}
    >
      <div className="flex items-center gap-3">
        {includeTypeEff && <EffectivenessColumn pokemon={left} game={game} align="right" />}
        <ComparisonIdentity pokemon={left} game={game} artworkUrl={leftArt} />
        <div className="flex-1 px-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Base Stats</p>
          <StatsComparisonBody left={left} right={right} game={game} />
        </div>
        <ComparisonIdentity pokemon={right} game={game} artworkUrl={rightArt} />
        {includeTypeEff && <EffectivenessColumn pokemon={right} game={game} align="left" />}
      </div>
    </div>
  )
}

// Attacking types in the conventional (post-gen-2 index) order; each game's
// chart is filtered to the types it actually has.
const TYPE_DISPLAY_ORDER = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
  'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy',
]

function abilityImmunities(pokemon: PokemonData, game: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const ability of new Set(pokemon.abilities)) {
    const immuneType = getAbilityImmunityType(ability, game)
    if (immuneType) map[immuneType] = ability
  }
  return map
}

function MultiplierChip({ value }: { value: number }) {
  const group = EFF_GROUPS.find(g => g.value === value)
  return (
    <span
      className="inline-block text-xs font-bold text-center rounded py-0.5"
      style={group ? { backgroundColor: group.bg, color: group.text, width: 32 } : { color: '#4b5563', width: 32 }}
    >
      {group ? group.multiplierLabel : '1×'}
    </span>
  )
}

// Green for the side that comes out ahead, red for the one that doesn't,
// matching the base-stat comparison's colouring.
function verdictClass(mine: number, theirs: number, higherIsBetter: boolean): string {
  if (mine === theirs) return 'text-gray-400'
  return (mine > theirs) === higherIsBetter ? 'text-green-400' : 'text-red-400'
}

// "X vs Y" defensive type chart: one row per attacking type with each
// Pokemon's multiplier on its own side, framed by the same identity columns as
// the base-stat comparison card. Rows where both take neutral damage are
// dimmed so the differences stand out; immunity-granting abilities are noted
// beside the (unchanged) type-chart multiplier, as on the effectiveness card.
function TypeEffectivenessComparisonCard({ left, right, game, leftArt, rightArt }: { left: PokemonData; right: PokemonData; game: string; leftArt?: string; rightArt?: string }) {
  const lMatch = getPokemonDefenseMatchups(left.type_1, left.type_2, game)
  const rMatch = getPokemonDefenseMatchups(right.type_1, right.type_2, game)
  const lAbility = abilityImmunities(left, game)
  const rAbility = abilityImmunities(right, game)
  const types = TYPE_DISPLAY_ORDER.filter(t => t in lMatch)
  const count = (m: Record<string, number>, pred: (v: number) => boolean) => types.filter(t => pred(m[t])).length
  const summary = [
    { label: 'Weak', l: count(lMatch, v => v > 1), r: count(rMatch, v => v > 1), higherIsBetter: false },
    { label: 'Resist', l: count(lMatch, v => v > 0 && v < 1), r: count(rMatch, v => v > 0 && v < 1), higherIsBetter: true },
    { label: 'Immune', l: count(lMatch, v => v === 0), r: count(rMatch, v => v === 0), higherIsBetter: true },
  ]
  return (
    <div className="px-6 py-4 rounded-2xl" style={{ background: 'transparent', width: 'fit-content' }}>
      <div className="flex items-center gap-3">
        <ComparisonIdentity pokemon={left} game={game} artworkUrl={leftArt} />
        <div className="px-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Type Effectiveness</p>
          <table className="border-collapse">
            <tbody>
              {types.map(type => {
                const lv = lMatch[type]
                const rv = rMatch[type]
                return (
                  <tr key={type} style={lv === 1 && rv === 1 ? { opacity: 0.4 } : undefined}>
                    <td className="pr-1 text-right text-xs text-gray-500 italic whitespace-nowrap">{lAbility[type] ? `(${lAbility[type]})` : ''}</td>
                    <td className="px-1.5 py-[2px]"><MultiplierChip value={lv} /></td>
                    <td className="px-1.5 py-[2px] text-center"><TypeChip type={type} width={80} /></td>
                    <td className="px-1.5 py-[2px]"><MultiplierChip value={rv} /></td>
                    <td className="pl-1 text-left text-xs text-gray-500 italic whitespace-nowrap">{rAbility[type] ? `(${rAbility[type]})` : ''}</td>
                  </tr>
                )
              })}
              {summary.map(({ label, l, r, higherIsBetter }, i) => {
                const divider = i === 0 ? { borderTop: '1px solid #374151', paddingTop: 6 } : undefined
                return (
                  <tr key={label}>
                    <td />
                    <td className={`text-center text-sm font-bold tabular-nums ${verdictClass(l, r, higherIsBetter)}`} style={divider}>{l}</td>
                    <td className="text-center text-xs font-semibold text-gray-500" style={divider}>{label}</td>
                    <td className={`text-center text-sm font-bold tabular-nums ${verdictClass(r, l, higherIsBetter)}`} style={divider}>{r}</td>
                    <td />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <ComparisonIdentity pokemon={right} game={game} artworkUrl={rightArt} />
      </div>
    </div>
  )
}

function buildTmHmRows(pokemon: PokemonData, game: string): RowData[] {
  return (pokemon.tm_hm_learnset ?? [])
    .map(moveName => ({
      moveName,
      sortKey: 0,
      prefix: getTmHmCode(moveName, game) ?? '',
      gameTags: [] as { abbrev: string; color: string }[],
    }))
    .sort((a, b) => compareTmHmPrefix(a.prefix, b.prefix))
}

function simpleRows(moves: string[] | undefined, prefix: string): RowData[] {
  return (moves ?? []).map(moveName => ({
    moveName,
    sortKey: 0,
    prefix,
    gameTags: [] as { abbrev: string; color: string }[],
  }))
}

interface ComparisonMoveCategory {
  /** Which versus-export checkbox covers this category. */
  group: 'levelUp' | 'tmHm' | 'misc'
  title: string
  suffix: string
  col1: string
  highlightDiff: boolean
  fit?: number
  leftRows: RowData[]
  rightRows: RowData[]
}

// One entry per learnset category where either Pokemon has moves. Titles and
// filename suffixes match the single-Pokemon move-table exports; diff
// highlighting mirrors the live comparison view (level-up and TM/HM only).
function buildComparisonMoveCategories(left: PokemonData, right: PokemonData, game: string): ComparisonMoveCategory[] {
  const categories: ComparisonMoveCategory[] = [
    { group: 'levelUp', title: 'Level Up Learnset', suffix: 'level_up_learnset', col1: 'Lv', highlightDiff: true, fit: CANVAS_FIT.levelUpComparison, leftRows: singleLevelRows(left), rightRows: singleLevelRows(right) },
    { group: 'tmHm', title: 'TM / HM Learnset', suffix: 'tm_hm_learnset', col1: '', highlightDiff: true, fit: CANVAS_FIT.tmHmComparison, leftRows: buildTmHmRows(left, game), rightRows: buildTmHmRows(right, game) },
    { group: 'misc', title: 'Move Tutor', suffix: 'move_tutor', col1: '', highlightDiff: false, leftRows: simpleRows(left.tutor_learnset, 'Tutor'), rightRows: simpleRows(right.tutor_learnset, 'Tutor') },
    { group: 'misc', title: 'Egg Moves', suffix: 'egg_moves', col1: '', highlightDiff: false, leftRows: simpleRows(left.egg_moves, ''), rightRows: simpleRows(right.egg_moves, '') },
    { group: 'misc', title: 'Transfer Moves', suffix: 'transfer_moves', col1: '', highlightDiff: false, fit: CANVAS_FIT.transferComparison, leftRows: simpleRows(left.transfer_learnset, ''), rightRows: simpleRows(right.transfer_learnset, '') },
    { group: 'misc', title: 'Prior Evolution Only', suffix: 'prior_evolution_only', col1: '', highlightDiff: false, leftRows: simpleRows(left.prior_evolution_learnset, ''), rightRows: simpleRows(right.prior_evolution_learnset, '') },
  ]
  return categories.filter(c => c.leftRows.length > 0 || c.rightRows.length > 0)
}

interface ExportJob {
  filename: string
  build: () => Promise<string>
}

type Wrap = (inner: string, usesShadow: boolean, fit?: number) => Promise<string>

interface VersusContext {
  left: PokemonData
  right: PokemonData
  game: string
  wrap: Wrap
  /** Mirrors the comparison view's "Show movepool differences" setting. */
  showMovepoolDiff: boolean
  leftArt?: string
  rightArt?: string
}

function versusBaseName(left: PokemonData, right: PokemonData): string {
  return `${safeFileName(displayName(left.species))}_vs_${safeFileName(displayName(right.species))}`
}

function statsComparisonJob(ctx: VersusContext, includeTypeEff: boolean, suffix: string): ExportJob {
  const { left, right, game, wrap, leftArt, rightArt } = ctx
  return {
    filename: buildExportFilename(game, `${versusBaseName(left, right)}${suffix}`),
    build: async () => wrap(await renderElementToPng(
      <ComparisonCard left={left} right={right} game={game} includeTypeEff={includeTypeEff} leftArt={leftArt} rightArt={rightArt} />
    ), false),
  }
}

function typeEffComparisonJob(ctx: VersusContext): ExportJob {
  const { left, right, game, wrap, leftArt, rightArt } = ctx
  return {
    filename: buildExportFilename(game, `${versusBaseName(left, right)}_type_effectiveness`),
    build: async () => wrap(await renderElementToPng(
      <TypeEffectivenessComparisonCard left={left} right={right} game={game} leftArt={leftArt} rightArt={rightArt} />
    ), false, CANVAS_FIT.typeEffComparison),
  }
}

// Compared movesets: one side-by-side graphic per learnset category either
// Pokemon has moves in, optionally limited to some category groups.
function moveComparisonJobs(ctx: VersusContext, groups?: Set<ComparisonMoveCategory['group']>): ExportJob[] {
  const { left, right, game, wrap, showMovepoolDiff } = ctx
  return buildComparisonMoveCategories(left, right, game)
    .filter(category => !groups || groups.has(category.group))
    .map(category => ({
      filename: buildExportFilename(game, `${versusBaseName(left, right)}_${category.suffix}`),
      build: async () => wrap(await renderElementToPng(
        <ComparisonMoveTable
          title={category.title}
          left={left.species}
          right={right.species}
          leftRows={category.leftRows}
          rightRows={category.rightRows}
          game={game}
          col1={category.col1}
          highlightDiff={category.highlightDiff && showMovepoolDiff}
        />
      ), false, category.fit),
    }))
}

async function runJobs(jobs: ExportJob[], folder: string): Promise<BulkExportResult> {
  const result: BulkExportResult = { total: jobs.length, saved: 0, failed: [] }
  for (const job of jobs) {
    try {
      const dataUrl = await job.build()
      const ok = await window.electronAPI.savePngToFolder(folder, job.filename, dataUrl)
      if (ok) {
        result.saved += 1
      } else {
        result.failed.push(job.filename)
      }
    } catch (err) {
      console.error('[Solodex] bulk export job failed:', job.filename, err)
      result.failed.push(job.filename)
    }
  }
  return result
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
}

export interface BulkExportResult {
  total: number
  saved: number
  failed: string[]
}

export interface BulkExportOptions {
  scaleToCanvas: boolean
  /**
   * Extra species to render "X vs Y" comparison graphics against, from the
   * "Export all graphics with comparisons" dialog.
   */
  compareWith?: string[]
  /**
   * Species name → PNG data URL. Replaces the standard artwork wherever that
   * Pokemon's art appears (stats card, effectiveness card, comparison cards).
   */
  customArtwork?: Record<string, string>
  /**
   * Include the automatic evolution-family comparisons (default true). The
   * custom-art export turns this off so no graphic falls back to standard
   * artwork — its dialog pre-seeds the family members into compareWith
   * instead, each with its own custom art.
   */
  includeFamilyComparisons?: boolean
}

export async function exportAllGraphicsForPokemon(
  species: string,
  game: string,
  folder: string,
  options: BulkExportOptions,
): Promise<BulkExportResult> {
  const pokemon = getPokemonData(species, game)
  if (!pokemon) return { total: 0, saved: 0, failed: ['pokemon-data-missing'] }
  const baseName = safeFileName(displayName(pokemon.species))
  const { scaleToCanvas, compareWith, customArtwork, includeFamilyComparisons = true } = options
  // Custom art is keyed by the exact species strings the dialog worked with:
  // the `species` argument for the base Pokemon, pick names for the rest.
  const baseArt = customArtwork?.[species]
  // The compared-moveset graphics mirror the live comparison view's
  // "Show movepool differences" setting for their blue diff tint
  const showMovepoolDiff = await window.electronAPI.getShowMovepoolDiff()

  const wrap = (inner: string, usesShadow: boolean, fit?: number): Promise<string> =>
    applyComposite(inner, usesShadow, scaleToCanvas, fit)

  const jobs: ExportJob[] = []

  jobs.push({
    filename: buildExportFilename(game, `${baseName}_stats`),
    build: async () => {
      const inner = await renderElementToPng(
        <BaseStatsCardBody
          stats={pokemon.base_stats}
          species={pokemon.species}
          dexNumber={pokemon.national_dex_number}
          type1={pokemon.type_1}
          type2={pokemon.type_2}
          game={game}
          artworkUrl={baseArt}
        />
      )
      return wrap(inner, true)
    },
  })

  jobs.push({
    filename: buildExportFilename(game, `${baseName}_effectiveness`),
    build: async () => {
      const inner = await renderElementToPng(
        <EffectivenessCardBody
          species={pokemon.species}
          dexNumber={pokemon.national_dex_number}
          type1={pokemon.type_1}
          type2={pokemon.type_2}
          game={game}
          abilities={[...new Set(pokemon.abilities)]}
          artworkUrl={baseArt}
        />
      )
      return wrap(inner, true, CANVAS_FIT.effectiveness)
    },
  })

  const levelRows = singleLevelRows(pokemon)
  if (levelRows.length > 0) {
    jobs.push({
      filename: buildExportFilename(game, `${baseName}_level_up_learnset`),
      build: async () => {
        const inner = await renderElementToPng(
          <MoveTable title="Level Up Learnset" rows={levelRows} game={game} col1="Lv" />
        )
        return wrap(inner, false, CANVAS_FIT.levelUp)
      },
    })
  }

  const tmHmRows = buildTmHmRows(pokemon, game)
  if (tmHmRows.length > 0) {
    jobs.push({
      filename: buildExportFilename(game, `${baseName}_tm_hm_learnset`),
      build: async () => {
        const inner = await renderElementToPng(
          <MoveTable title="TM / HM Learnset" rows={tmHmRows} game={game} col1="" />
        )
        return wrap(inner, false, CANVAS_FIT.tmHm)
      },
    })
  }

  const simpleMoveTables: { title: string; suffix: string; moves: string[]; prefix: string }[] = [
    { title: 'Move Tutor', suffix: 'move_tutor', moves: pokemon.tutor_learnset, prefix: 'Tutor' },
    { title: 'Egg Moves', suffix: 'egg_moves', moves: pokemon.egg_moves, prefix: '' },
    { title: 'Transfer Moves', suffix: 'transfer_moves', moves: pokemon.transfer_learnset, prefix: '' },
  ]
  for (const { title, suffix, moves, prefix } of simpleMoveTables) {
    if (!moves || moves.length === 0) continue
    const rows = simpleRows(moves, prefix)
    jobs.push({
      filename: buildExportFilename(game, `${baseName}_${suffix}`),
      build: async () => {
        const inner = await renderElementToPng(
          <MoveTable title={title} rows={rows} game={game} col1="" />
        )
        return wrap(inner, false)
      },
    })
  }

  // Comparison graphics: evolution-family members first, then any species the
  // user picked in the "with comparisons" dialog. The shared seen-set keeps a
  // picked species that is also a family member from exporting twice.
  const seen = new Set<string>()
  const addComparisonJobs = (otherName: string) => {
    if (!otherName || otherName === pokemon.species || seen.has(otherName)) return
    seen.add(otherName)
    const otherPokemon = getPokemonData(otherName, game)
    if (!otherPokemon) return
    const ctx: VersusContext = {
      left: pokemon,
      right: otherPokemon,
      game,
      wrap,
      showMovepoolDiff,
      leftArt: baseArt,
      rightArt: customArtwork?.[otherName],
    }
    jobs.push(statsComparisonJob(ctx, true, ''))
    jobs.push(statsComparisonJob(ctx, false, '_no_effectiveness'))
    jobs.push(typeEffComparisonJob(ctx))
    jobs.push(...moveComparisonJobs(ctx))
  }
  if (includeFamilyComparisons) {
    for (const entry of pokemon.evolution_family ?? []) addComparisonJobs(entry.species)
  }
  for (const otherName of compareWith ?? []) addComparisonJobs(otherName)

  return runJobs(jobs, folder)
}

export type VersusGraphic = 'stats' | 'typeEffectiveness' | 'levelUp' | 'tmHm' | 'misc'

export interface VersusExportOptions {
  scaleToCanvas: boolean
  graphics: VersusGraphic[]
  /** Optional PNG data URLs replacing the standard artwork on each side. */
  leftArt?: string
  rightArt?: string
}

// "Export versus graphics": the head-to-head set for two Pokemon in one game
// (base-stat comparison, type-effectiveness comparison and the compared
// learnsets), saved to the export folder. Learnset graphics are only produced
// for categories where at least one of the two learns something.
export async function exportVersusGraphics(
  leftSpecies: string,
  rightSpecies: string,
  game: string,
  folder: string,
  options: VersusExportOptions,
): Promise<BulkExportResult> {
  const left = getPokemonData(leftSpecies, game)
  const right = getPokemonData(rightSpecies, game)
  if (!left || !right) return { total: 0, saved: 0, failed: ['pokemon-data-missing'] }
  const { scaleToCanvas, graphics, leftArt, rightArt } = options
  const ctx: VersusContext = {
    left,
    right,
    game,
    wrap: (inner, usesShadow, fit) => applyComposite(inner, usesShadow, scaleToCanvas, fit),
    showMovepoolDiff: await window.electronAPI.getShowMovepoolDiff(),
    leftArt,
    rightArt,
  }
  const wanted = new Set(graphics)
  const jobs: ExportJob[] = []
  if (wanted.has('stats')) jobs.push(statsComparisonJob(ctx, false, '_base_stats'))
  if (wanted.has('typeEffectiveness')) jobs.push(typeEffComparisonJob(ctx))
  const moveGroups = new Set((['levelUp', 'tmHm', 'misc'] as const).filter(g => wanted.has(g)))
  if (moveGroups.size > 0) jobs.push(...moveComparisonJobs(ctx, moveGroups))
  return runJobs(jobs, folder)
}

// Titles of the graphics exportVersusGraphics would produce, in export order,
// for the dialog's preview list.
export function listVersusGraphics(leftSpecies: string, rightSpecies: string, game: string, graphics: VersusGraphic[]): string[] {
  const left = getPokemonData(leftSpecies, game)
  const right = getPokemonData(rightSpecies, game)
  if (!left || !right) return []
  const wanted = new Set<string>(graphics)
  const titles: string[] = []
  if (wanted.has('stats')) titles.push('Base Stats')
  if (wanted.has('typeEffectiveness')) titles.push('Type Effectiveness')
  for (const category of buildComparisonMoveCategories(left, right, game)) {
    if (wanted.has(category.group)) titles.push(category.title)
  }
  return titles
}
