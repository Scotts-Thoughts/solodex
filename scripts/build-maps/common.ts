// What both router pack formats share: objects (with trainers resolved to
// Solodex ids and sprites extracted), trainer anchors from links.json,
// encounter tables split into method + condition, and sign text.

import fs from 'fs'
import path from 'path'
import type { MapObjectKind, PackAnchor, PackEncounter, PackLabel, PackObject, PackSlot } from '../../src/shared/mapPack'
import type { SpriteFrames } from './sprites'
import type { TrainerResolver } from './trainers'

const readJson = (dir: string, f: string, fallback?: unknown) => {
  const p = path.join(dir, f)
  if (!fs.existsSync(p) && fallback !== undefined) return fallback
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

/** Labels for the tile packs (gens 1–3), which carry none of their own. */
const F1_METHODS: [string, string][] = [
  ['walk', 'Walk'], ['surf', 'Surf'], ['old_rod', 'Old Rod'], ['good_rod', 'Good Rod'], ['super_rod', 'Super Rod'],
  ['rock_smash', 'Rock Smash'], ['headbutt', 'Headbutt'], ['headbutt_rare', 'Headbutt (rare trees)'], ['bug_contest', 'Bug-Catching Contest'],
]
const F1_CONDITIONS: [string, string][] = [['morning', 'Morning'], ['night', 'Night'], ['swarm', 'Swarm']]

const KINDS = new Set<MapObjectKind>(['trainer', 'item', 'hidden_item', 'berry', 'sign', 'warp', 'npc', 'obstacle'])

export const isWaterMethod = (m: string) => ['surf', 'old_rod', 'good_rod', 'super_rod'].some(w => m.startsWith(w))

/** `ITEM_ROOM_1_KEY` → `Room 1 Key` (gen 3 key items the pack leaves unnamed). */
function itemFromRaw(raw: string): string {
  return raw.replace(/^ITEM_/, '').toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export interface CommonInput {
  dir: string
  gen: number
  keyToId: Map<string, number>
  /** gen 2: each map's time of day (sprite palettes) */
  tod?: (mapKey: string) => string | undefined
  frames: SpriteFrames
  trainers: TrainerResolver
  species: (name: string) => string
  /** format 2: the manifest's method / condition labels */
  methodLabels?: Record<string, string>
  conditionLabels?: Record<string, string>
}

export interface CommonOutput {
  objects: PackObject[]
  trainers: Record<string, PackAnchor[]>
  encounters: Record<string, PackEncounter[]>
  methods: (PackLabel & { water: boolean })[]
  conditions: PackLabel[]
  stats: Record<string, number>
  unknownSpecies: Set<string>
  unmatchedTrainers: Set<string>
}

export async function buildCommon(input: CommonInput): Promise<CommonOutput> {
  const { dir, gen, keyToId, frames, trainers } = input
  const rawObjects: Record<string, unknown>[] = readJson(dir, 'objects.json')
  const signText: Record<string, string> = readJson(dir, 'sign_text.json', {})
  const unmatchedTrainers = new Set<string>()

  // warps of each map in order, to place a warp's destination door
  const warpsOf = new Map<string, { x: number; y: number }[]>()
  for (const o of rawObjects) {
    if (o.kind !== 'warp') continue
    const list = warpsOf.get(o.map as string) ?? []
    list.push({ x: o.x as number, y: o.y as number })
    warpsOf.set(o.map as string, list)
  }

  const resolveAll = (names: string[]): { ids: string[]; unmatched: string[] } => {
    const ids: string[] = []
    const unmatched: string[] = []
    for (const n of names) {
      const id = trainers.resolve(n)
      if (id) { if (!ids.includes(id)) ids.push(id) } else { unmatched.push(n); unmatchedTrainers.add(n) }
    }
    return { ids, unmatched }
  }

  const objects: PackObject[] = []
  const routerIndexToObject = new Map<number, number>()
  for (let ri = 0; ri < rawObjects.length; ri++) {
    const o = rawObjects[ri]
    const map = keyToId.get(o.map as string)
    let kind = o.kind as MapObjectKind
    if (map === undefined || !KINDS.has(kind)) continue
    const p = (o.payload ?? {}) as Record<string, unknown>
    const out: PackObject = { map, x: Math.max(0, o.x as number), y: Math.max(0, o.y as number), lift: (o.lift as number) ?? 0, kind, sprite: null }
    if (o.version) out.version = o.version as string
    out.sprite = await frames.frameFor(
      { sprite: o.sprite as string | null, facing: o.facing as string | null, pal: o.pal as string | null },
      { key: o.map as string, tod: input.tod?.(o.map as string) },
    )
    const battles = (kind === 'trainer' ? (p.variants as string[] | undefined) ?? (p.trainer ? [p.trainer as string] : []) : kind === 'npc' ? (p.battles as string[] | undefined) ?? [] : [])
    if (battles.length) {
      // an NPC whose script starts a battle (gym leaders, rivals) is a trainer
      kind = out.kind = 'trainer'
      const { ids, unmatched } = resolveAll(battles)
      if (ids.length) out.trainers = ids
      if (unmatched.length) out.unmatched = unmatched
      if (p.double) out.double = true
    }
    if (kind === 'item' || kind === 'hidden_item' || kind === 'berry') {
      out.item = (p.item as string | null) ?? (p.raw ? itemFromRaw(p.raw as string) : 'Unknown item')
      if ((p.count as number) > 1) out.count = p.count as number
    }
    if (kind === 'sign' && p.text_key) {
      const text = signText[p.text_key as string]
      if (text) out.text = text
    }
    if (kind === 'npc' && p.text_key && signText[p.text_key as string]) out.text = signText[p.text_key as string]
    if (kind === 'obstacle' && p.label) out.label = p.label as string
    if (kind === 'warp') {
      const candidates = ((p.candidates as string[]) ?? []).map(c => keyToId.get(c)).filter((c): c is number => c !== undefined)
      const dest = p.dest_map ? keyToId.get(p.dest_map as string) ?? null : null
      out.warp = { map: dest }
      if (candidates.length) out.warp.candidates = candidates
      if (dest !== null && typeof p.dest_warp === 'number') {
        // gen 1/2 warp ids are 1-based, gen 3+ 0-based
        const door = warpsOf.get(p.dest_map as string)?.[gen <= 2 ? p.dest_warp - 1 : p.dest_warp]
        if (door) { out.warp.x = door.x; out.warp.y = door.y }
      }
    }
    routerIndexToObject.set(ri, objects.length)
    objects.push(out)
  }
  // keep objects grouped by map, in map order (stable)
  const order = objects.map((_, i) => i).sort((a, b) => objects[a].map - objects[b].map || a - b)
  const remap = new Map(order.map((oldIdx, newIdx) => [oldIdx, newIdx]))
  const sorted = order.map(i => objects[i])

  // trainer anchors: links.json, else the objects that carry the trainer
  const links = readJson(dir, 'links.json', { trainers: {} })
  const anchors: Record<string, PackAnchor[]> = {}
  const addAnchor = (id: string, a: PackAnchor) => {
    const list = (anchors[id] ??= [])
    if (!list.some(b => b.map === a.map && b.x === a.x && b.y === a.y)) list.push(a)
  }
  for (const [name, list] of Object.entries(links.trainers as Record<string, Record<string, unknown>[]>)) {
    const id = trainers.resolve(name)
    if (!id) { unmatchedTrainers.add(name); continue }
    for (const a of list) {
      const map = keyToId.get(a.map as string)
      if (map === undefined) continue
      const anchor: PackAnchor = { map, x: a.x as number, y: a.y as number }
      const objOld = typeof a.object === 'number' ? routerIndexToObject.get(a.object) : undefined
      if (objOld !== undefined) anchor.object = remap.get(objOld)
      addAnchor(id, anchor)
    }
  }
  sorted.forEach((o, i) => {
    for (const id of o.trainers ?? []) if (!anchors[id]) addAnchor(id, { map: o.map, x: o.x, y: o.y, object: i })
  })

  // encounters: `<method>[_<condition>]` keys
  const methodLabels = input.methodLabels ?? Object.fromEntries(F1_METHODS)
  const conditionLabels = input.conditionLabels ?? Object.fromEntries(F1_CONDITIONS)
  const methodKeys = Object.keys(methodLabels)
  const rawEnc: Record<string, Record<string, { base_rate?: number | null; slots: Record<string, Record<string, unknown>[]> }>> = readJson(dir, 'encounters.json', {})
  const encounters: Record<string, PackEncounter[]> = {}
  const usedMethods = new Set<string>()
  const usedConditions = new Set<string>()
  const unknownSpecies = new Set<string>()
  for (const [mapKey, table] of Object.entries(rawEnc)) {
    const map = keyToId.get(mapKey)
    if (map === undefined) continue
    const list: PackEncounter[] = []
    for (const [key, m] of Object.entries(table)) {
      const base = methodKeys.filter(b => key === b || key.startsWith(`${b}_`)).sort((a, b) => b.length - a.length)[0] ?? key
      const condition = key.length > base.length ? key.slice(base.length + 1) : null
      usedMethods.add(base)
      if (condition) usedConditions.add(condition)
      const slots: Record<string, PackSlot[]> = {}
      for (const [ver, raw] of Object.entries(m.slots)) {
        slots[ver] = raw.map(s => {
          const species = input.species(s.species as string)
          if (!species) unknownSpecies.add(s.species as string)
          return { species: species || (s.species as string), min: s.min_level as number, max: s.max_level as number, rate: s.rate as number }
        })
      }
      list.push({ method: base, condition, rate: m.base_rate ?? null, slots })
    }
    encounters[String(map)] = list
  }
  const methods = [...methodKeys.filter(k => usedMethods.has(k)), ...[...usedMethods].filter(k => !methodKeys.includes(k))]
    .map(key => ({ key, label: methodLabels[key] ?? key.replace(/_/g, ' '), water: isWaterMethod(key) }))
  const conditions = [...Object.keys(conditionLabels).filter(k => usedConditions.has(k)), ...[...usedConditions].filter(k => !(k in conditionLabels))]
    .map(key => ({ key, label: conditionLabels[key] ?? key.replace(/_/g, ' ') }))

  const trainerObjects = sorted.filter(o => o.kind === 'trainer')
  return {
    objects: sorted,
    trainers: anchors,
    encounters,
    methods,
    conditions,
    unknownSpecies,
    unmatchedTrainers,
    stats: {
      objects: sorted.length,
      trainerObjects: trainerObjects.length,
      trainerObjectsUnmatched: trainerObjects.filter(o => !o.trainers).length,
      trainersAnchored: Object.keys(anchors).length,
      unmatchedTrainerNames: unmatchedTrainers.size,
      unknownSpecies: unknownSpecies.size,
      sprites: frames.sprites.length,
    },
  }
}
