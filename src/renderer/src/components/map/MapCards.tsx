import { useMemo, useState } from 'react'
import { getAllPokemon, getPokemonData, getTrainer, displayName } from '../../data'
import { getHomeSpriteUrl } from '../../utils/sprites'
import { STAT_CONFIG } from '../../constants/stats'
import type { PackEncounter, PackObject, PackSlot } from '../../../../shared/mapPack'
import type { MapPack } from '../../map/pack'
import { KIND_COLOR } from '../../map/renderer'

export type MapCard =
  | { kind: 'object'; index: number }
  /** a trainer anchored by script rather than an object */
  | { kind: 'trainer'; ids: string[]; map: number }
  | { kind: 'tile'; map: number; water: boolean }
  | { kind: 'map'; map: number }

export interface CardActions {
  onClose: () => void
  onOpenTrainer: (id: string) => void
  onOpenDamage: (id: string) => void
  onOpenPokemon: (species: string) => void
  onGoToMap: (map: number, step?: { x: number; y: number }) => void
  onSelectObject: (index: number) => void
}

interface Props extends CardActions {
  pack: MapPack
  game: string
  version: string | null
  card: MapCard
}

let dexByName: Map<string, number> | null = null
function dexOf(species: string): number {
  dexByName ??= new Map(getAllPokemon().map(p => [p.name, p.national_dex_number]))
  return dexByName.get(species) ?? 0
}

function PokemonIcon({ species, className = 'w-6 h-6' }: { species: string; className?: string }) {
  const dex = dexOf(species)
  if (!dex) return <span className={className} />
  return <img src={getHomeSpriteUrl(species, dex)} alt="" className={`pokemon-icon-stroke object-contain shrink-0 ${className}`} loading="lazy" />
}

/** Gens 1/2 give stat exp equal to the base stats, so there is no EV yield to show. */
const showEvs = (gen: number) => gen >= 3

function EvYield({ species, game }: { species: string; game: string }) {
  const data = getPokemonData(species, game)
  if (!data) return <span className="text-gray-600">?</span>
  const parts = STAT_CONFIG.filter(s => data.ev_yield[s.key] > 0)
  if (!parts.length) return <span className="text-gray-600">—</span>
  return (
    <span className="whitespace-nowrap">
      {parts.map((s, i) => (
        <span key={s.key} style={{ color: s.color }} className="font-semibold">
          {i > 0 && <span className="text-gray-600">, </span>}
          {data.ev_yield[s.key]} {s.label}
        </span>
      ))}
    </span>
  )
}

const rateText = (r: number) => (Math.abs(r - Math.round(r)) < 0.05 ? `${Math.round(r)}%` : `${r.toFixed(1)}%`)
const levelText = (s: PackSlot) => (s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`)

function Header({ title, subtitle, color, onClose }: { title: string; subtitle?: string; color?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2 border-b border-gray-800">
      <div className="min-w-0">
        <div className="text-sm font-bold text-white truncate" style={color ? { color } : undefined}>{title}</div>
        {subtitle && <div className="text-xs text-gray-500 truncate">{subtitle}</div>}
      </div>
      <button onClick={onClose} className="text-gray-500 hover:text-white text-sm leading-none px-1" title="Close (Esc)">✕</button>
    </div>
  )
}

const chip = (active: boolean) =>
  `text-[11px] px-2 py-0.5 rounded transition-colors ${active ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`

/**
 * A map's wild Pokémon. Tables keyed `<method>_<condition>` are the method as
 * met under that condition (time of day, swarm, radar, dual slot, season):
 * a row of condition chips picks which one each method shows.
 */
export function EncounterTable({ pack, game, map, only, version, onOpenPokemon }: {
  pack: MapPack
  game: string
  map: number
  /** land or water methods only */
  only?: 'land' | 'water'
  version: string | null
  onOpenPokemon: (species: string) => void
}) {
  const water = new Set(pack.json.methods.filter(m => m.water).map(m => m.key))
  const all = (pack.json.encounters[String(map)] ?? []).filter(e => !only || water.has(e.method) === (only === 'water'))
  const present = pack.json.conditions.filter(c => all.some(e => e.condition === c.key))
  // a seasonal zone (gen 5) has no plain tables, only one per season
  const seasonal = present.length > 0 && all.every(e => e.condition !== null)
  const [chosen, setChosen] = useState<string | null>(null)
  const cond = chosen !== null && (chosen === '' ? !seasonal : present.some(c => c.key === chosen)) ? chosen : seasonal ? present[0]?.key ?? '' : ''

  const sections: { title: string; enc: PackEncounter; slots: PackSlot[] }[] = []
  for (const m of pack.json.methods) {
    const pick = (cond && all.find(e => e.method === m.key && e.condition === cond)) || all.find(e => e.method === m.key && e.condition === null)
    if (!pick) continue
    const slots = (version && pick.slots[version]) || pick.slots['*'] || Object.values(pick.slots)[0] || []
    if (!slots.length) continue
    const condLabel = pick.condition ? present.find(c => c.key === pick.condition)?.label : null
    sections.push({ title: condLabel ? `${m.label} · ${condLabel}` : m.label, enc: pick, slots })
  }
  if (!all.length) return <div className="px-3 py-2 text-xs text-gray-500">No wild Pokémon here</div>
  const plain = present.some(c => c.key === 'morning' || c.key === 'night') ? 'Day' : 'Normal'
  const evs = showEvs(pack.json.gen)
  return (
    <div className="px-3 pb-2">
      {present.length > 0 && (
        <div className="flex flex-wrap gap-1 py-2">
          {!seasonal && <button className={chip(cond === '')} onClick={() => setChosen('')}>{plain}</button>}
          {present.map(c => <button key={c.key} className={chip(cond === c.key)} onClick={() => setChosen(c.key)}>{c.label}</button>)}
        </div>
      )}
      {sections.length === 0 && <div className="py-2 text-xs text-gray-500">No wild Pokémon for this terrain</div>}
      {sections.map(s => (
        <div key={s.title} className="mt-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">
            {s.title}{s.enc.rate ? <span className="font-normal normal-case tracking-normal text-gray-600"> · rate {s.enc.rate}</span> : null}
          </div>
          <table className="w-full text-xs">
            <tbody>
              {s.slots.map((slot, i) => (
                <tr key={i} className="border-t border-gray-800/70 hover:bg-gray-800/60">
                  <td className="py-0.5">
                    <button className="flex items-center gap-1.5 text-left text-gray-200 hover:text-white font-semibold" onClick={() => onOpenPokemon(slot.species)} title={`Open ${displayName(slot.species)} in the Pokedex`}>
                      <PokemonIcon species={slot.species} className="w-5 h-5" />
                      <span className="truncate">{displayName(slot.species)}</span>
                    </button>
                  </td>
                  <td className="py-0.5 text-gray-400 whitespace-nowrap">Lv {levelText(slot)}</td>
                  <td className="py-0.5 text-gray-300 text-right pr-2">{rateText(slot.rate)}</td>
                  {evs && <td className="py-0.5 text-[11px]"><EvYield species={slot.species} game={game} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function TrainerParty({ ids, game, gen, onOpenTrainer, onOpenDamage, onOpenPokemon }: { ids: string[]; game: string; gen: number } & Pick<CardActions, 'onOpenTrainer' | 'onOpenDamage' | 'onOpenPokemon'>) {
  const trainers = ids.map(id => getTrainer(game, id)).filter((t): t is NonNullable<typeof t> => !!t)
  const [tab, setTab] = useState(0)
  const t = trainers[Math.min(tab, trainers.length - 1)]
  if (!t) return <div className="px-3 py-2 text-xs text-gray-500">Trainer data not loaded</div>
  const evTotals = STAT_CONFIG.map(s => ({ ...s, v: t.party.reduce((sum, p) => sum + (getPokemonData(p.species, game)?.ev_yield[s.key] ?? 0), 0) })).filter(s => s.v > 0)
  return (
    <div className="px-3 pb-3">
      {trainers.length > 1 && (
        <div className="flex flex-wrap gap-1 pt-2">
          {trainers.map((x, i) => <button key={x.id} className={chip(i === tab)} onClick={() => setTab(i)} title={x.name}>{i === 0 ? 'First battle' : `Battle ${i + 1}`}</button>)}
        </div>
      )}
      <div className="pt-2 text-xs text-gray-400 flex items-center gap-2">
        <span className="font-bold text-gray-200">{t.name}</span>
        {t.is_double_battle && <span className="text-purple-400 font-semibold">Double</span>}
        {t.money > 0 && <span className="text-yellow-400/70">${t.money.toLocaleString()}</span>}
      </div>
      <div className="mt-1.5 space-y-1">
        {t.party.map((p, i) => (
          <div key={i} className="flex items-start gap-2 rounded bg-gray-800/50 px-1.5 py-1">
            <button onClick={() => onOpenPokemon(p.species)} title={`Open ${displayName(p.species)} in the Pokedex`}>
              <PokemonIcon species={p.species} className="w-7 h-7" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-xs">
                <span className="font-bold text-white">{displayName(p.species)}</span>
                <span className="text-gray-400"> Lv {p.level}</span>
                {p.held_item && <span className="text-gray-500"> @ {p.held_item}</span>}
              </div>
              {p.moves.length > 0 && <div className="text-[11px] text-gray-400 truncate">{p.moves.join(' · ')}</div>}
            </div>
          </div>
        ))}
      </div>
      {showEvs(gen) && evTotals.length > 0 && (
        <div className="mt-1.5 text-[11px] text-gray-500">
          Party EVs:{' '}
          {evTotals.map((s, i) => <span key={s.key} style={{ color: s.color }} className="font-semibold">{i > 0 && <span className="text-gray-600">, </span>}{s.v} {s.label}</span>)}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <button onClick={() => onOpenTrainer(t.id)} className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold">Open in Trainers</button>
        <button onClick={() => onOpenDamage(t.id)} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold">Damage calc</button>
      </div>
    </div>
  )
}

const OBJECT_TITLE: Record<PackObject['kind'], string> = {
  trainer: 'Trainer', item: 'Item', hidden_item: 'Hidden item', berry: 'Berry tree', sign: 'Sign', warp: 'Warp', npc: 'NPC', obstacle: 'Obstacle',
}

function ObjectCard({ pack, game, index, ...actions }: Omit<Props, 'card' | 'version'> & { index: number }) {
  const o = pack.json.objects[index]
  const map = pack.json.maps[o.map]
  const where = `${map.name} (${o.x}, ${o.y})`
  const color = KIND_COLOR[o.kind]
  if (o.kind === 'trainer') {
    const first = o.trainers?.[0] ? getTrainer(game, o.trainers[0]) : null
    return (
      <>
        <Header title={first?.name ?? o.unmatched?.[0] ?? 'Trainer'} subtitle={where} color={color} onClose={actions.onClose} />
        {o.trainers ? (
          <TrainerParty ids={o.trainers} game={game} gen={pack.json.gen} {...actions} />
        ) : (
          <div className="px-3 py-2 text-xs text-gray-500">Not in Solodex's trainer data{o.unmatched ? `: ${o.unmatched.join(', ')}` : ''}</div>
        )}
      </>
    )
  }
  if (o.kind === 'warp') {
    const dest = o.warp?.map != null ? pack.json.maps[o.warp.map] : null
    return (
      <>
        <Header title={dest ? `To ${dest.name}` : 'Warp'} subtitle={where} color={color} onClose={actions.onClose} />
        <div className="px-3 py-2 flex flex-wrap gap-1.5">
          {dest && (
            <button onClick={() => actions.onGoToMap(o.warp!.map!, o.warp!.x !== undefined ? { x: o.warp!.x, y: o.warp!.y! } : undefined)} className="text-xs px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-semibold">
              Go to {dest.name}
            </button>
          )}
          {o.warp?.candidates?.map(c => (
            <button key={c} onClick={() => actions.onGoToMap(c)} className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200">{pack.json.maps[c].name}</button>
          ))}
          {!dest && !o.warp?.candidates?.length && <span className="text-xs text-gray-500">Destination unknown</span>}
        </div>
        {dest && <div className="px-3 pb-2 text-[11px] text-gray-600">Double-click a warp to go through it</div>}
      </>
    )
  }
  const title = o.kind === 'item' || o.kind === 'hidden_item' || o.kind === 'berry' ? `${o.item ?? 'Item'}${o.count && o.count > 1 ? ` ×${o.count}` : ''}` : o.label ?? OBJECT_TITLE[o.kind]
  return (
    <>
      <Header title={title} subtitle={`${OBJECT_TITLE[o.kind]} · ${where}`} color={color} onClose={actions.onClose} />
      {o.text && <div className="px-3 py-2 text-xs text-gray-300 whitespace-pre-line">{o.text}</div>}
      {!o.text && o.kind === 'npc' && <div className="px-3 py-2 text-xs text-gray-500">No text recorded</div>}
      {(o.kind === 'item' || o.kind === 'hidden_item' || o.kind === 'berry') && (
        <div className="px-3 pb-2 text-[11px] text-gray-500">{o.kind === 'hidden_item' ? 'Hidden: use the Itemfinder or check the spot' : o.kind === 'berry' ? 'Berry tree' : 'On the ground'}</div>
      )}
      {o.version && <div className="px-3 pb-2 text-[11px] text-gray-500">{o.version} only</div>}
    </>
  )
}

function MapSummary({ pack, game, version, map, ...actions }: Omit<Props, 'card'> & { map: number }) {
  const m = pack.json.maps[map]
  const [a, b] = pack.objectRange[map] ?? [0, 0]
  const objs = useMemo(() => {
    const out: number[] = []
    for (let i = a; i < b; i++) out.push(i)
    return out
  }, [a, b])
  const trainerObjs = objs.filter(i => pack.json.objects[i].kind === 'trainer')
  const itemObjs = objs.filter(i => ['item', 'hidden_item', 'berry'].includes(pack.json.objects[i].kind) && (!pack.json.objects[i].version || !version || pack.json.objects[i].version === version))
  const category = { city: 'City / town', route: 'Route', area: 'Area', building: 'Building', dungeon: 'Dungeon' }[m.category]
  return (
    <>
      <Header title={m.name} subtitle={category} onClose={actions.onClose} />
      <div className="overflow-y-auto">
        {trainerObjs.length > 0 && (
          <div className="px-3 pt-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Trainers ({trainerObjs.length})</div>
            {trainerObjs.map(i => {
              const o = pack.json.objects[i]
              const t = o.trainers?.[0] ? getTrainer(game, o.trainers[0]) : null
              return (
                <button key={i} onClick={() => actions.onSelectObject(i)} className="w-full flex items-center gap-1.5 py-0.5 text-left text-xs hover:bg-gray-800 rounded px-1">
                  <span className="text-gray-200 font-semibold truncate">{t?.name ?? o.unmatched?.[0] ?? 'Trainer'}</span>
                  <span className="ml-auto flex shrink-0">{t?.party.map((p, k) => <PokemonIcon key={k} species={p.species} className="w-5 h-5" />)}</span>
                  {t && <span className="text-gray-500 w-10 text-right shrink-0">Lv {Math.max(...t.party.map(p => p.level))}</span>}
                </button>
              )
            })}
          </div>
        )}
        {itemObjs.length > 0 && (
          <div className="px-3 pt-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Items ({itemObjs.length})</div>
            <div className="flex flex-wrap gap-1">
              {itemObjs.map(i => {
                const o = pack.json.objects[i]
                return (
                  <button key={i} onClick={() => actions.onSelectObject(i)} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300" title={OBJECT_TITLE[o.kind]}>
                    <span style={{ color: KIND_COLOR[o.kind] }}>●</span> {o.item}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {pack.json.encounters[String(map)] && (
          <div className="pt-2">
            <div className="px-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Wild Pokémon</div>
            <EncounterTable pack={pack} game={game} map={map} version={version} onOpenPokemon={actions.onOpenPokemon} />
          </div>
        )}
        {!trainerObjs.length && !itemObjs.length && !pack.json.encounters[String(map)] && (
          <div className="px-3 py-2 text-xs text-gray-500">No trainers, items or wild Pokémon here</div>
        )}
      </div>
    </>
  )
}

export default function MapCardView(props: Props) {
  const { card, pack, game, version, ...actions } = props
  let body: JSX.Element
  if (card.kind === 'object') {
    body = <ObjectCard key={card.index} pack={pack} game={game} index={card.index} {...actions} />
  } else if (card.kind === 'trainer') {
    body = (
      <>
        <Header title={getTrainer(game, card.ids[0])?.name ?? 'Trainer'} subtitle={`${pack.json.maps[card.map].name} (scripted battle)`} color={KIND_COLOR.trainer} onClose={actions.onClose} />
        <TrainerParty ids={card.ids} game={game} gen={pack.json.gen} {...actions} />
      </>
    )
  } else if (card.kind === 'tile') {
    const m = pack.json.maps[card.map]
    body = (
      <>
        <Header title={`${card.water ? 'Water' : 'Tall grass'} — ${m.name}`} onClose={actions.onClose} />
        <div className="overflow-y-auto">
          <EncounterTable key={card.map} pack={pack} game={game} map={card.map} only={card.water ? 'water' : 'land'} version={version} onOpenPokemon={actions.onOpenPokemon} />
        </div>
      </>
    )
  } else {
    body = <MapSummary key={card.map} pack={pack} game={game} version={version} map={card.map} {...actions} />
  }
  return (
    <div className="absolute right-3 top-3 z-20 w-[360px] max-h-[calc(100%-24px)] flex flex-col rounded-lg border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm overflow-hidden">
      {body}
    </div>
  )
}
