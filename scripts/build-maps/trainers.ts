// Router trainer name → Solodex trainer id. The router's map packs link
// trainers by the router's own `trainer_name` (unique per game); Solodex keys
// trainers by ROM identity. Both trainer tables come from the same scrape, so
// each router record is matched to a Solodex trainer by:
//   gen 4/5 — rom_id; gen 3 — trainer_id; gen 1 — the name, ignoring case and
//   spacing ("BirdKeeper 1" → "BIRD KEEPER 1"); gen 2 — list position (same order).
// Every match is then checked by name.

import fs from 'fs'
import path from 'path'
import { getTrainers, loadTrainers } from '@/data'

const ROUTER_TRAINER_FILES: Record<string, string[]> = {
  red_blue: ['gen_one/red_blue/trainers.json'],
  yellow: ['gen_one/yellow/trainers.json'],
  gold_silver: ['gen_two/gold_silver/trainers.json'],
  crystal: ['gen_two/crystal/trainers.json'],
  ruby_sapphire: ['gen_three/ruby_sapphire/ruby_trainers.json', 'gen_three/ruby_sapphire/sapphire_trainers.json'],
  emerald: ['gen_three/emerald/trainers.json'],
  firered_leafgreen: ['gen_three/firered_leafgreen/trainers.json'],
  diamond_pearl: ['gen_four/diamond_pearl/trainers.json'],
  platinum: ['gen_four/platinum/trainers.json'],
  heartgold_soulsilver: ['gen_four/heartgold_soulsilver/trainers.json'],
  black_white: ['gen_five/black_white/trainers.json'],
  black2_white2: ['gen_five/black2_white2/trainers.json'],
}

interface RouterTrainer {
  trainer_name: string
  rom_id?: number
  trainer_id?: number
}

export interface TrainerResolver {
  /** Solodex trainer id for a router trainer name, or null. */
  resolve(routerName: string): string | null
  /** router names whose match failed the name check */
  nameMismatches: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export async function trainerResolver(routerRoot: string, packId: string, game: string, gen: number): Promise<TrainerResolver> {
  await loadTrainers(game)
  const solodex = getTrainers(game)
  const byId = new Map(solodex.map(t => [t.id, t]))
  // gen 1 ids are upper-cased with the class spelled out ("BIRD KEEPER 1" for "BirdKeeper 1")
  const byNormId = new Map(solodex.map(t => [norm(t.id), t.id]))
  const files = ROUTER_TRAINER_FILES[packId] ?? []
  const map = new Map<string, string>()
  const nameMismatches: string[] = []
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(routerRoot, 'raw_pkmn_data', f), 'utf8'))
    const records: RouterTrainer[] = Array.isArray(raw) ? raw : raw.trainers
    // gen 2 matches by position: the Solodex table keeps the scrape's order
    // (including party-less trainers getTrainers drops), so index the raw ids
    const positional = gen === 2 ? solodexOrder(game) : []
    records.forEach((r, i) => {
      if (map.has(r.trainer_name)) return
      let id: string | undefined
      if (r.rom_id !== undefined) id = String(r.rom_id)
      else if (gen === 3 && r.trainer_id !== undefined) id = String(r.trainer_id)
      else if (gen === 1) id = byNormId.get(norm(r.trainer_name))
      else if (gen === 2) id = positional[i]
      if (id === undefined) return
      const t = byId.get(id)
      if (!t) return
      // the router prefixes classes and suffixes rematches ("Youngster Jimmy",
      // "Camper Mickey Rematch 2" for ROM ids named "Jimmy" / "Camper Mickey")
      const a = norm(t.name)
      const b = norm(r.trainer_name)
      if (!a.includes(b) && !b.includes(a)) nameMismatches.push(`${r.trainer_name} → ${id} (${t.name})`)
      map.set(r.trainer_name, id)
    })
  }
  return { resolve: name => map.get(name) ?? null, nameMismatches }
}

/** Solodex trainer ids in table order (getTrainers keeps it, minus party-less entries). */
function solodexOrder(game: string): string[] {
  const file = game === 'Gold and Silver' ? 'gold_silver' : 'crystal'
  const src = fs.readFileSync(path.resolve(__dirname, '../../data_objects-main/trainers', `${file}.js`), 'utf8')
  return Object.keys(JSON.parse(src.slice(src.indexOf('=') + 1).trim().replace(/;\s*$/, '')))
}
