import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { displayName, getTrainer, getTrainers } from '../../data'
import { useGameData } from '../../data/useGameData'
import { TERRAIN, type MapCategory } from '../../../../shared/mapPack'
import { useMapPack, type MapPack, type SpeciesSpot } from '../../map/pack'
import { WORLD, fitRect, mapRect, objectCenter, pickStep, sameScope, scopeOfMap, stepCenter, terrainAt, type Rect, type Scope } from '../../map/geom'
import { DEFAULT_LAYERS, type Camera, type Highlight, type LayerKey, type Layers, type Overlay } from '../../map/renderer'
import MapCanvas, { type MapCanvasHandle } from './MapCanvas'
import MapCardView, { type MapCard } from './MapCards'

/** A request from another tab to show something on the map. `nonce` makes repeats count. */
export type MapFocus =
  | { kind: 'trainer'; id: string; nonce: number }
  | { kind: 'species'; species: string; nonce: number }

interface Props {
  game: string
  focus: MapFocus | null
  onOpenTrainer: (id: string) => void
  onOpenDamage: (id: string) => void
  onOpenPokemon: (species: string) => void
}

const LAYERS_KEY = 'map:layers'
// last view per game, kept while the app runs
const savedViews = new Map<string, { scope: Scope; cam: Camera }>()

function loadLayers(): Layers {
  try {
    return { ...DEFAULT_LAYERS, ...JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_LAYERS
  }
}

export default function MapView(props: Props) {
  const pack = useMapPack(props.game)
  const ready = useGameData(props.game, { trainers: true })
  if (pack === undefined || !ready) return <div className="h-full flex items-center justify-center text-gray-600">Loading map…</div>
  if (pack === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1 text-gray-500 text-sm">
        <div>No map for {props.game}.</div>
        <div className="text-xs text-gray-600">Map packs cover Red/Blue through Black 2/White 2 (run <code>npm run build:maps</code> in a dev checkout).</div>
      </div>
    )
  }
  return <MapViewLoaded key={props.game} pack={pack} {...props} />
}

const LAND_METHODS = new Set(['walk', 'dark_grass', 'walk_spots', 'great_marsh', 'trophy_garden', 'bug_contest', 'cave_spots'])

function MapViewLoaded({ pack, game, focus, onOpenTrainer, onOpenDamage, onOpenPokemon }: Props & { pack: MapPack }) {
  const { json } = pack
  const canvas = useRef<MapCanvasHandle>(null)
  const [scope, setScope] = useState<Scope>(() => savedViews.get(game)?.scope ?? WORLD)
  const [layers, setLayers] = useState<Layers>(loadLayers)
  const [version, setVersion] = useState<string | null>(json.versions.length > 1 ? json.versions[0] : null)
  const [card, setCard] = useState<MapCard | null>(null)
  const [species, setSpecies] = useState<string | null>(null)
  const [pulse, setPulse] = useState<Overlay['pulse']>(null)
  const [hover, setHover] = useState<{ map: number; x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  const [layersOpen, setLayersOpen] = useState(false)
  const readyRef = useRef(false)
  const pendingFocus = useRef<MapFocus | null>(null)
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  useEffect(() => { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)) }, [layers])
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  // ── navigation ──
  const show = useCallback((target: Scope, view: { rect?: Rect; center?: [number, number]; zoom?: number }) => {
    const c = canvas.current
    if (!c) return
    const same = sameScope(scopeRef.current, target)
    setScope(target)
    scopeRef.current = target
    if (view.center) {
      const z = view.zoom ?? Math.max(c.camera().zoom, 1.5)
      const { w, h } = c.size()
      c.setView({ zoom: z, x: view.center[0] - w / z / 2, y: view.center[1] - h / z / 2 }, same)
    } else {
      c.fit(view.rect ?? fitRect(pack, target), { animate: same, maxZoom: target.kind === 'world' ? 3 : 4 })
    }
  }, [pack])

  const goToMap = useCallback((id: number, step?: { x: number; y: number }) => {
    const target = scopeOfMap(pack, id)
    if (step) {
      const p = stepCenter(pack, target, id, step.x, step.y)
      if (p) {
        show(target, { center: p, zoom: Math.max(canvas.current?.camera().zoom ?? 1, 2) })
        setPulse({ points: [p], since: performance.now() })
        return
      }
    }
    show(target, { rect: target.kind === 'world' ? mapRect(pack, target, id) ?? undefined : undefined })
  }, [pack, show])

  const selectObject = useCallback((index: number) => {
    const o = json.objects[index]
    if (!o) return
    const target = scopeOfMap(pack, o.map)
    const p = objectCenter(pack, target, index)
    if (p) show(target, { center: p, zoom: Math.max(canvas.current?.camera().zoom ?? 1, 1.5) })
    setCard({ kind: 'object', index })
  }, [json, pack, show])

  const applyFocus = useCallback((f: MapFocus) => {
    if (f.kind === 'trainer') {
      const anchors = json.trainers[f.id]
      if (!anchors?.length) {
        setNotice(`${getTrainer(game, f.id)?.name ?? 'That trainer'} has no position on the ${game} map`)
        return
      }
      const target = scopeOfMap(pack, anchors[0].map)
      const points = anchors
        .filter(a => sameScope(scopeOfMap(pack, a.map), target))
        .map(a => (a.object !== undefined ? objectCenter(pack, target, a.object) : stepCenter(pack, target, a.map, a.x, a.y)))
        .filter((p): p is [number, number] => !!p)
      if (points.length) show(target, { center: points[0], zoom: Math.max(canvas.current?.camera().zoom ?? 1, 2) })
      setPulse({ points, since: performance.now() })
      const a = anchors[0]
      setCard(a.object !== undefined ? { kind: 'object', index: a.object } : { kind: 'trainer', ids: [f.id], map: a.map })
      return
    }
    setSpecies(f.species)
    setCard(null)
    setPulse(null)
    const spots = pack.species.get(f.species) ?? []
    if (!spots.length) {
      setNotice(`${displayName(f.species)} has no wild encounters on the ${game} map`)
      return
    }
    const outdoor = spots.filter(s => json.maps[s.map].world)
    if (outdoor.length) {
      const rects = outdoor.map(s => mapRect(pack, WORLD, s.map)!).filter(Boolean)
      const x0 = Math.min(...rects.map(r => r.x)), y0 = Math.min(...rects.map(r => r.y))
      const x1 = Math.max(...rects.map(r => r.x + r.w)), y1 = Math.max(...rects.map(r => r.y + r.h))
      show(WORLD, { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } })
    } else {
      goToMap(spots[0].map)
    }
  }, [game, goToMap, json, pack, show])

  // sidebar actions (stable, so the memoized sidebar skips hover re-renders)
  const focusTrainer = useCallback((id: string) => applyFocus({ kind: 'trainer', id, nonce: -1 }), [applyFocus])
  const focusSpecies = useCallback((s: string) => applyFocus({ kind: 'species', species: s, nonce: -1 }), [applyFocus])
  const clearSpecies = useCallback(() => setSpecies(null), [])

  // the canvas knows its size: restore the view, then any focus waiting for it
  const onReady = useCallback(() => {
    readyRef.current = true
    const c = canvas.current!
    const saved = savedViews.get(game)
    if (saved) c.setView(saved.cam, false)
    else if (json.world.defaultMap !== null && json.maps[json.world.defaultMap]?.world) c.fit(mapRect(pack, WORLD, json.world.defaultMap)!, { animate: false, maxZoom: 2, margin: 120 })
    else c.fit(fitRect(pack, scopeRef.current), { animate: false })
    if (pendingFocus.current) {
      applyFocus(pendingFocus.current)
      pendingFocus.current = null
    }
  }, [applyFocus, game, json, pack])

  const lastNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!focus || focus.nonce === lastNonce.current) return
    lastNonce.current = focus.nonce
    if (readyRef.current) applyFocus(focus)
    else pendingFocus.current = focus
  }, [focus, applyFocus])

  const onCamera = useCallback((cam: Camera) => {
    savedViews.set(game, { scope: scopeRef.current, cam: { ...cam } })
    setZoom(z => (Math.abs(z - cam.zoom) / cam.zoom > 0.01 ? cam.zoom : z))
  }, [game])

  // ── pointer ──
  const onClick = useCallback((x: number, y: number, obj: number | null) => {
    setLayersOpen(false)
    if (obj !== null) { setCard({ kind: 'object', index: obj }); return }
    const step = pickStep(pack, scopeRef.current, x, y)
    if (!step) { setCard(null); return }
    const t = terrainAt(pack, step.map, step.x, step.y)
    const encs = json.encounters[String(step.map)] ?? []
    const water = new Set(json.methods.filter(m => m.water).map(m => m.key))
    if (t === TERRAIN.grass && encs.some(e => !water.has(e.method))) setCard({ kind: 'tile', map: step.map, water: false })
    else if (t === TERRAIN.water && encs.some(e => water.has(e.method))) setCard({ kind: 'tile', map: step.map, water: true })
    else setCard({ kind: 'map', map: step.map })
  }, [json, pack])

  const onDoubleClick = useCallback((_x: number, _y: number, obj: number | null) => {
    const o = obj !== null ? json.objects[obj] : null
    if (o?.kind === 'warp' && o.warp?.map != null) {
      setCard(null)
      goToMap(o.warp.map, o.warp.x !== undefined ? { x: o.warp.x, y: o.warp.y! } : undefined)
    }
  }, [goToMap, json])

  const onHover = useCallback((x: number, y: number) => {
    const step = Number.isNaN(x) ? null : pickStep(pack, scopeRef.current, x, y)
    setHover(h => (h?.map === step?.map && h?.x === step?.x && h?.y === step?.y ? h : step))
  }, [pack])

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const c = canvas.current
      if (e.key === 'Escape') {
        if (layersOpen) setLayersOpen(false)
        else if (card) setCard(null)
        else if (scopeRef.current.kind === 'map') show(WORLD, {})
        else return
      } else if (e.key === 'Backspace' && scopeRef.current.kind === 'map') {
        show(WORLD, {})
      } else if (e.key === '+' || e.key === '=') c?.zoomBy(1.4)
      else if (e.key === '-' || e.key === '_') c?.zoomBy(1 / 1.4)
      else if (e.key === '0') c?.fit(fitRect(pack, scopeRef.current))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, layersOpen, pack, show])

  // ── overlay ──
  const spots = useMemo(() => (species ? pack.species.get(species) ?? [] : []), [pack, species])
  const highlight = useMemo<Highlight[]>(() => {
    const byMap = new Map<number, number[] | null>()
    for (const s of spots) {
      if (scope.kind === 'map' ? s.map !== scope.id : !json.maps[s.map].world) continue
      const isWater = json.methods.find(m => m.key === s.encounter.method)?.water
      let classes: number[] | null = null
      if (isWater) classes = [TERRAIN.water]
      else if (LAND_METHODS.has(s.encounter.method)) classes = mapHasGrass(pack, s.map) ? [TERRAIN.grass] : [TERRAIN.grass, TERRAIN.walk]
      const prev = byMap.get(s.map)
      byMap.set(s.map, prev === undefined ? classes : prev === null || classes === null ? null : [...new Set([...prev, ...classes])])
    }
    return [...byMap].map(([map, classes]) => ({ map, classes }))
  }, [json, pack, scope, spots])
  const overlay = useMemo<Overlay>(() => ({
    selected: card?.kind === 'object' ? card.index : null,
    hoverStep: hover,
    highlight,
    pulse,
  }), [card, hover, highlight, pulse])

  const title = scope.kind === 'world' ? 'World map' : json.maps[scope.id]?.name ?? ''
  const hoverMap = hover ? json.maps[hover.map] : null
  const hoverTerrain = hover ? terrainAt(pack, hover.map, hover.x, hover.y) : null

  return (
    <div className="h-full flex overflow-hidden">
      <MapSidebar
        pack={pack}
        game={game}
        currentMap={scope.kind === 'map' ? scope.id : null}
        species={species}
        spots={spots}
        onGoToMap={goToMap}
        onSelectObject={selectObject}
        onTrainer={focusTrainer}
        onSpecies={focusSpecies}
        onClearSpecies={clearSpecies}
      />
      <div className="flex-1 relative overflow-hidden" style={{ background: '#0a0a18' }}>
        <MapCanvas
          ref={canvas}
          pack={pack}
          scope={scope}
          layers={layers}
          overlay={overlay}
          version={version}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onHover={onHover}
          onCamera={onCamera}
          onReady={onReady}
        />

        {/* toolbar */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5">
          {scope.kind === 'map' && (
            <button onClick={() => show(WORLD, {})} className="text-xs px-2 py-1 rounded bg-gray-800/90 hover:bg-gray-700 text-gray-200 font-semibold border border-gray-700" title="Back to the world map (Backspace)">
              ◀ World
            </button>
          )}
          <div className="text-sm font-bold text-white px-2 py-0.5 rounded bg-gray-900/80 border border-gray-800">{title}</div>
          {json.versions.length > 1 && (
            <div className="flex rounded overflow-hidden border border-gray-700">
              {json.versions.map(v => (
                <button key={v} onClick={() => setVersion(v)} className={`text-xs px-2 py-1 ${v === version ? 'bg-sky-600 text-white' : 'bg-gray-800/90 text-gray-400 hover:text-white'}`}>{v}</button>
              ))}
            </div>
          )}
          <div className="relative">
            <button onClick={() => setLayersOpen(o => !o)} className="text-xs px-2 py-1 rounded bg-gray-800/90 hover:bg-gray-700 text-gray-200 border border-gray-700">Layers ▾</button>
            {layersOpen && <LayersMenu layers={layers} tilted={json.tilted} onChange={setLayers} />}
          </div>
          <div className="flex items-center rounded border border-gray-700 bg-gray-800/90 text-xs text-gray-200">
            <button onClick={() => canvas.current?.zoomBy(1 / 1.4)} className="px-2 py-1 hover:bg-gray-700" title="Zoom out (-)">−</button>
            <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => canvas.current?.zoomBy(1.4)} className="px-2 py-1 hover:bg-gray-700" title="Zoom in (+)">+</button>
            <button onClick={() => canvas.current?.fit(fitRect(pack, scope))} className="px-2 py-1 hover:bg-gray-700 border-l border-gray-700" title="Fit (0)">Fit</button>
          </div>
        </div>

        {notice && (
          <div className="absolute left-1/2 -translate-x-1/2 top-14 z-30 text-xs px-3 py-1.5 rounded bg-gray-800 border border-gray-600 text-gray-200 shadow-lg">{notice}</div>
        )}

        {/* status */}
        <div className="absolute left-3 bottom-2 z-10 text-[11px] text-gray-400 px-2 py-0.5 rounded bg-gray-900/80 pointer-events-none">
          {hoverMap ? (
            <>
              <span className="text-gray-200 font-semibold">{hoverMap.name}</span>
              <span> · ({hover!.x}, {hover!.y})</span>
              {hoverTerrain === TERRAIN.grass && <span className="text-green-400"> · grass</span>}
              {hoverTerrain === TERRAIN.water && <span className="text-sky-400"> · water</span>}
            </>
          ) : (
            <span>Drag to pan · scroll to zoom · click for details · double-click a warp to go through it</span>
          )}
        </div>

        {card && (
          <MapCardView
            pack={pack}
            game={game}
            version={version}
            card={card}
            onClose={() => setCard(null)}
            onOpenTrainer={onOpenTrainer}
            onOpenDamage={onOpenDamage}
            onOpenPokemon={onOpenPokemon}
            onGoToMap={goToMap}
            onSelectObject={selectObject}
          />
        )}
      </div>
    </div>
  )
}

const hasGrass = new WeakMap<MapPack, Map<number, boolean>>()
function mapHasGrass(pack: MapPack, map: number): boolean {
  let cache = hasGrass.get(pack)
  if (!cache) hasGrass.set(pack, (cache = new Map()))
  let v = cache.get(map)
  if (v === undefined) {
    const m = pack.json.maps[map]
    v = false
    if (m.terrain >= 0) for (let i = 0; i < m.w * m.h; i++) if (pack.terrain[m.terrain + i] === TERRAIN.grass) { v = true; break }
    cache.set(map, v)
  }
  return v
}

const LAYER_LABELS: [LayerKey | 'sprites' | 'labels' | 'mask', string][] = [
  ['trainers', 'Trainers'], ['items', 'Items'], ['hidden', 'Hidden items'], ['berries', 'Berry trees'], ['warps', 'Warps'],
  ['signs', 'Signs'], ['npcs', 'NPCs'], ['obstacles', 'Obstacles (Cut / Strength / Rock Smash)'],
  ['sprites', 'Overworld sprites when zoomed in'], ['labels', 'Map names when zoomed out'], ['mask', 'Hide unreachable areas'],
]

function LayersMenu({ layers, tilted, onChange }: { layers: Layers; tilted: boolean; onChange: (l: Layers) => void }) {
  return (
    <div className="absolute left-0 top-full mt-1 w-64 rounded border border-gray-700 bg-gray-900 shadow-xl py-1 z-30">
      {LAYER_LABELS.filter(([k]) => tilted || (k !== 'mask' && k !== 'obstacles')).map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer select-none">
          <input type="checkbox" checked={layers[k]} onChange={e => onChange({ ...layers, [k]: e.target.checked })} />
          {label}
        </label>
      ))}
    </div>
  )
}

// ── sidebar ──────────────────────────────────────────────────────────────────

const GROUPS: [MapCategory, string][] = [['city', 'Cities & Towns'], ['route', 'Routes'], ['area', 'Areas'], ['dungeon', 'Dungeons & Caves'], ['building', 'Buildings']]

interface SidebarProps {
  pack: MapPack
  game: string
  currentMap: number | null
  species: string | null
  spots: SpeciesSpot[]
  onGoToMap: (id: number) => void
  onSelectObject: (index: number) => void
  onTrainer: (id: string) => void
  onSpecies: (species: string) => void
  onClearSpecies: () => void
}

const MapSidebar = memo(function MapSidebar({ pack, game, currentMap, species, spots, onGoToMap, onSelectObject, onTrainer, onSpecies, onClearSpecies }: SidebarProps) {
  const { json } = pack
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({ city: true, route: true, area: true, dungeon: false, building: false })
  const q = query.trim().toLowerCase()

  const grouped = useMemo(() => {
    const g = new Map<MapCategory, { id: number; name: string }[]>()
    for (const m of json.maps) {
      if (!m.world && !m.scope) continue
      // gen 5 files city interiors ("Castelia City Building 6") as cities: the
      // town groups list the overworld only
      const category: MapCategory = !m.world && m.category !== 'dungeon' ? 'building' : m.category
      const list = g.get(category) ?? []
      list.push({ id: m.id, name: m.name })
      g.set(category, list)
    }
    for (const list of g.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    return g
  }, [json])

  const results = useMemo(() => {
    if (!q) return null
    const maps = json.maps.filter(m => m.name.toLowerCase().includes(q)).slice(0, 40)
    const trainers = getTrainers(game).filter(t => json.trainers[t.id] && t.name.toLowerCase().includes(q)).slice(0, 40)
    const items: { index: number; label: string }[] = []
    json.objects.forEach((o, i) => {
      if (items.length < 40 && o.item && o.item.toLowerCase().includes(q)) items.push({ index: i, label: `${o.item} — ${json.maps[o.map].name}` })
    })
    const mons = [...pack.species.keys()].filter(s => displayName(s).toLowerCase().includes(q)).sort().slice(0, 30)
    return { maps, trainers, items, mons }
  }, [game, json, pack, q])

  // one row per map: its methods (with the rate of the plain table, else the
  // best condition's) and the conditions that also have it; earliest first
  const spotRows = useMemo(() => {
    const labels = new Map(json.methods.map(m => [m.key, m.label]))
    const condLabels = new Map(json.conditions.map(c => [c.key, c.label]))
    const byMap = new Map<number, SpeciesSpot[]>()
    for (const s of spots) byMap.set(s.map, [...(byMap.get(s.map) ?? []), s])
    return [...byMap].map(([map, list]) => {
      const methods = new Map<string, { rate: number; plain: boolean; conds: string[] }>()
      for (const s of list) {
        const m = methods.get(s.encounter.method) ?? { rate: 0, plain: false, conds: [] }
        if (s.encounter.condition === null) { m.rate = s.rate; m.plain = true }
        else {
          if (!m.plain) m.rate = Math.max(m.rate, s.rate)
          m.conds.push(condLabels.get(s.encounter.condition) ?? s.encounter.condition)
        }
        methods.set(s.encounter.method, m)
      }
      const how = [...methods].map(([key, m]) => `${labels.get(key) ?? key} ${Math.round(m.rate)}%${m.conds.length ? ` (${m.plain ? '+ ' : ''}${m.conds.join(', ')})` : ''}`).join(' · ')
      const lo = Math.min(...list.map(s => s.levels[0]))
      const hi = Math.max(...list.map(s => s.levels[1]))
      return { map, name: json.maps[map].name, how, lo, hi }
    }).sort((a, b) => a.lo - b.lo || a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [json, spots])

  const row = 'w-full text-left text-xs px-3 py-1 truncate transition-colors'
  const header = 'px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500'

  return (
    <div className="w-64 shrink-0 flex flex-col border-r border-gray-700 bg-gray-900 overflow-hidden">
      <div className="p-2 border-b border-gray-800">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur() } }}
          placeholder="Search maps, trainers, items, Pokémon…"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-sky-600"
        />
      </div>
      <div className="flex-1 overflow-y-auto pb-3">
        {species && (
          <div className="border-b border-gray-800 pb-2">
            <div className="flex items-center justify-between px-3 pt-2.5">
              <div className="text-xs font-bold text-yellow-300">Where to find {displayName(species)}</div>
              <button onClick={onClearSpecies} className="text-gray-500 hover:text-white text-xs" title="Clear">✕</button>
            </div>
            {spotRows.length === 0 && <div className="px-3 py-1 text-xs text-gray-500">No wild encounters in this game</div>}
            {spotRows.map(r => (
              <button key={r.map} onClick={() => onGoToMap(r.map)} className={`w-full text-left text-xs px-3 py-1 transition-colors hover:bg-gray-800 ${r.map === currentMap ? 'bg-sky-900/50' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-100 truncate">{r.name}</span>
                  <span className="ml-auto shrink-0 text-gray-400">Lv {r.lo === r.hi ? r.lo : `${r.lo}–${r.hi}`}</span>
                </div>
                <div className="text-[11px] text-gray-500 leading-snug">{r.how}</div>
              </button>
            ))}
          </div>
        )}
        {results ? (
          <>
            {results.maps.length > 0 && <div className={header}>Maps</div>}
            {results.maps.map(m => <button key={m.id} onClick={() => onGoToMap(m.id)} className={`${row} text-gray-300 hover:bg-gray-800`}>{m.name}</button>)}
            {results.trainers.length > 0 && <div className={header}>Trainers</div>}
            {results.trainers.map(t => (
              <button key={t.id} onClick={() => onTrainer(t.id)} className={`${row} text-gray-300 hover:bg-gray-800`}>
                {t.name} <span className="text-gray-500">— {json.maps[json.trainers[t.id][0].map].name}</span>
              </button>
            ))}
            {results.items.length > 0 && <div className={header}>Items</div>}
            {results.items.map(it => <button key={it.index} onClick={() => onSelectObject(it.index)} className={`${row} text-gray-300 hover:bg-gray-800`}>{it.label}</button>)}
            {results.mons.length > 0 && <div className={header}>Wild Pokémon</div>}
            {results.mons.map(s => <button key={s} onClick={() => onSpecies(s)} className={`${row} text-gray-300 hover:bg-gray-800`}>{displayName(s)}</button>)}
            {!results.maps.length && !results.trainers.length && !results.items.length && !results.mons.length && <div className="px-3 py-2 text-xs text-gray-500">No matches</div>}
          </>
        ) : (
          GROUPS.filter(([c]) => grouped.get(c)?.length).map(([c, label]) => (
            <div key={c}>
              <button onClick={() => setOpen(o => ({ ...o, [c]: !o[c] }))} className={`${header} w-full text-left hover:text-gray-300`}>
                {open[c] ? '▾' : '▸'} {label} <span className="font-normal text-gray-600">({grouped.get(c)!.length})</span>
              </button>
              {open[c] && grouped.get(c)!.map(m => (
                <button key={m.id} onClick={() => onGoToMap(m.id)} className={`${row} ${m.id === currentMap ? 'bg-sky-900/50 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>{m.name}</button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
})

