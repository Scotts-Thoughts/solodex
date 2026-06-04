import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'
import {
  getPokemonData,
  getTmHmCode,
  getPokemonDefenseMatchups,
  displayName,
} from '../data'
import type { PokemonData } from '../types/pokemon'
import { BaseStatsCardBody } from '../components/BaseStatsCard'
import { EffectivenessCardBody } from '../components/EffectivenessCard'
import { TYPE_COLORS } from '../components/TypeBadge'
import { MoveRow as MovepoolRow, singleLevelRows } from '../components/Movepool'
import type { RowData } from '../components/Movepool'
import SortableTableHeader from '../components/SortableTableHeader'
import type { SortState } from '../hooks/useMoveSort'
import { STAT_CONFIG, GEN1_STAT_CONFIG, MAX_STAT, GEN1_GAMES } from '../constants/stats'
import { EFF_GROUPS, getAbilityImmunityType } from '../constants/effectiveness'
import { getArtworkUrl } from './sprites'
import { compareTmHmPrefix } from './tmhmSort'
import { getExportBgColor } from './exportSettings'
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
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  await nextFrame()
  await waitForImages(container)
  await nextFrame()

  const { toPng } = await import('html-to-image')
  const target = (container.firstElementChild as HTMLElement | null) ?? container
  // Sortable headers use a sticky bg-gray-900 fill for on-screen scrolling;
  // neutralize it for export so the header reads as transparent (matches the
  // single-table export in downloadTableImage).
  target.querySelectorAll<HTMLElement>('th').forEach(th => {
    th.style.backgroundColor = 'transparent'
  })
  const dataUrl = await toPng(target, {
    pixelRatio: 3,
    backgroundColor: 'transparent',
    width: target.scrollWidth,
    height: target.scrollHeight,
    style: { width: `${target.scrollWidth}px`, height: `${target.scrollHeight}px` },
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

// Mirrors ComparisonView's manual-export compositing: 1920x1080 canvas,
// inner graphic scaled to 93% with a soft drop shadow.
async function compositeOn1920x1080(innerDataUrl: string): Promise<string> {
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
  const maxW = 1920 * 0.93
  const maxH = 1080 * 0.93
  const scale = Math.min(maxW / img.width, maxH / img.height, 1)
  const drawW = img.width * scale
  const drawH = img.height * scale
  const x = (1920 - drawW) / 2
  const y = (1080 - drawH) / 2
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
  ctx.shadowBlur = 6
  ctx.drawImage(img, x, y, drawW, drawH)
  return canvas.toDataURL('image/png')
}

function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? '#6B7280'
  return (
    <span
      className="inline-block rounded text-xs font-semibold text-center py-0.5 px-3"
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

function ComparisonIdentity({ pokemon, game }: { pokemon: PokemonData; game: string }) {
  const isDual = pokemon.type_1 !== pokemon.type_2
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: 180 }}>
      <h2 className="text-center text-lg font-bold text-white leading-tight">{displayName(pokemon.species)}</h2>
      <img
        src={getArtworkUrl(pokemon.species, pokemon.national_dex_number)}
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

function ComparisonCard({ left, right, game, includeTypeEff }: { left: PokemonData; right: PokemonData; game: string; includeTypeEff: boolean }) {
  return (
    <div
      className="px-6 py-4 rounded-2xl"
      style={{ background: 'transparent', width: 'fit-content' }}
    >
      <div className="flex items-center gap-3">
        {includeTypeEff && <EffectivenessColumn pokemon={left} game={game} align="right" />}
        <ComparisonIdentity pokemon={left} game={game} />
        <div className="flex-1 px-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2 text-center">Base Stats</p>
          <StatsComparisonBody left={left} right={right} game={game} />
        </div>
        <ComparisonIdentity pokemon={right} game={game} />
        {includeTypeEff && <EffectivenessColumn pokemon={right} game={game} align="left" />}
      </div>
    </div>
  )
}

function buildTmHmRows(pokemon: PokemonData, game: string): RowData[] {
  return pokemon.tm_hm_learnset
    .map(moveName => ({
      moveName,
      sortKey: 0,
      prefix: getTmHmCode(moveName, game) ?? '',
      gameTags: [] as { abbrev: string; color: string }[],
    }))
    .sort((a, b) => compareTmHmPrefix(a.prefix, b.prefix))
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')
}

export interface BulkExportResult {
  total: number
  saved: number
  failed: string[]
}

export interface BulkExportOptions {
  scaleToCanvas: boolean
}

export async function exportAllGraphicsForPokemon(
  species: string,
  game: string,
  folder: string,
  options: BulkExportOptions,
): Promise<BulkExportResult> {
  const pokemon = getPokemonData(species, game)
  const result: BulkExportResult = { total: 0, saved: 0, failed: [] }
  if (!pokemon) {
    result.failed.push('pokemon-data-missing')
    return result
  }
  const baseName = safeFileName(displayName(pokemon.species))
  const { scaleToCanvas } = options

  const wrap = async (inner: string, usesShadow: boolean): Promise<string> => {
    if (scaleToCanvas) return compositeOn1920x1080(inner)
    return usesShadow ? compositeWithShadow(inner) : inner
  }

  const jobs: { filename: string; build: () => Promise<string> }[] = []

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
        />
      )
      return wrap(inner, true)
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
        return wrap(inner, false)
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
        return wrap(inner, false)
      },
    })
  }

  const otherFamily = (pokemon.evolution_family ?? [])
    .map(e => e.species)
    .filter(s => s && s !== pokemon.species)
  const seen = new Set<string>()
  for (const otherName of otherFamily) {
    if (seen.has(otherName)) continue
    seen.add(otherName)
    const otherPokemon = getPokemonData(otherName, game)
    if (!otherPokemon) continue
    const otherBase = safeFileName(displayName(otherName))
    jobs.push({
      filename: buildExportFilename(game, `${baseName}_vs_${otherBase}`),
      build: async () => {
        const inner = await renderElementToPng(
          <ComparisonCard left={pokemon} right={otherPokemon} game={game} includeTypeEff />
        )
        return wrap(inner, false)
      },
    })
    jobs.push({
      filename: buildExportFilename(game, `${baseName}_vs_${otherBase}_no_effectiveness`),
      build: async () => {
        const inner = await renderElementToPng(
          <ComparisonCard left={pokemon} right={otherPokemon} game={game} includeTypeEff={false} />
        )
        return wrap(inner, false)
      },
    })
  }

  result.total = jobs.length

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
