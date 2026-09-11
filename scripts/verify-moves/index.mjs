#!/usr/bin/env node
/**
 * verify:moves — cross-check data_objects-main/moves.js (power, type,
 * accuracy, PP, and Gen 4 physical/special class) against the decomps.
 *
 *   npm run verify:moves            # Gen 1–4
 *   npm run verify:moves -- --verbose
 *
 *   Gen 1  pokered   data/moves/moves.asm
 *   Gen 2  pokecrystal data/moves/moves.asm
 *   Gen 3  pokeemerald src/data/battle_moves.h
 *   Gen 4  pokeplatinum res/moves/<move>/data.json
 *
 * Gen 5 has no decomp. Exit code is non-zero on any mismatch.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DECOMPS } from '../verify-stats/config.mjs'
import { moves } from '../../data_objects-main/moves.js'

const VERBOSE = process.argv.includes('--verbose')

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** ROM constant → app name where normalisation alone doesn't match. */
const ALIASES = {
  visegrip: 'vicegrip',
  highjumpkick: 'hijumpkick',
  feintattack: 'faintattack',
  smellingsalts: 'smellingsalt',
  psychic: 'psychicm',
}

const TYPE_NAMES = {
  NORMAL: 'Normal', FIGHTING: 'Fighting', FLYING: 'Flying', POISON: 'Poison', GROUND: 'Ground', ROCK: 'Rock',
  BUG: 'Bug', GHOST: 'Ghost', STEEL: 'Steel', FIRE: 'Fire', WATER: 'Water', GRASS: 'Grass', ELECTRIC: 'Electric',
  PSYCHIC: 'Psychic', PSYCHIC_TYPE: 'Psychic', ICE: 'Ice', DRAGON: 'Dragon', DARK: 'Dark', MYSTERY: '???', BIRD: 'Bird',
}

// ─── Readers ────────────────────────────────────────────────────────────────

function readAsmMoves(repo, hasChance) {
  const src = readFileSync(join(repo, 'data/moves/moves.asm'), 'utf8')
  const out = new Map()
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*move\s+([A-Z0-9_]+),\s*([A-Z0-9_]+),\s*(\d+),\s*([A-Z_]+),\s*(\d+),\s*(\d+)/)
    if (!m) continue
    const [, name, , power, type, acc, pp] = m
    out.set(norm(name), { power: +power, type: TYPE_NAMES[type] ?? type, accuracy: +acc, pp: +pp })
  }
  return out
}

function readGen3Moves(repo) {
  const src = readFileSync(join(repo, 'src/data/battle_moves.h'), 'utf8')
  const out = new Map()
  const re = /\[MOVE_([A-Z0-9_]+)\]\s*=\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(src))) {
    const body = m[2]
    const f = k => body.match(new RegExp(`\\.${k}\\s*=\\s*([A-Z0-9_]+)`))?.[1]
    out.set(norm(m[1]), { power: +f('power'), type: TYPE_NAMES[f('type').replace('TYPE_', '')], accuracy: +f('accuracy'), pp: +f('pp') })
  }
  return out
}

function readGen4Moves(repo) {
  const dir = join(repo, 'res/moves')
  const out = new Map()
  for (const d of readdirSync(dir)) {
    const p = join(dir, d, 'data.json')
    if (!existsSync(p)) continue
    const j = JSON.parse(readFileSync(p, 'utf8'))
    out.set(norm(j.name), {
      power: j.power, type: TYPE_NAMES[String(j.type).replace('TYPE_', '')], accuracy: j.accuracy, pp: j.pp,
      category: j.class === 'CLASS_PHYSICAL' ? 'Physical' : j.class === 'CLASS_SPECIAL' ? 'Special' : 'Status',
    })
  }
  return out
}

// ─── Compare ────────────────────────────────────────────────────────────────

const TABLES = [
  ['1', 'pokered',      () => readAsmMoves(DECOMPS.pokered, false)],
  ['2', 'pokecrystal',  () => readAsmMoves(DECOMPS.pokecrystal, true)],
  ['3', 'pokeemerald',  () => readGen3Moves(DECOMPS.pokeemerald)],
  ['4', 'pokeplatinum', () => readGen4Moves(DECOMPS.pokeplatinum)],
]

let failed = false
for (const [gen, repo, read] of TABLES) {
  let rom
  try { rom = read() } catch (e) { console.log(`SKIP gen ${gen}: ${e.message}`); continue }
  const app = moves[gen]
  const mismatches = []
  const unmatched = []
  let checked = 0
  for (const [name, d] of Object.entries(app)) {
    const key = ALIASES[norm(name)] ?? norm(name)
    const r = rom.get(key) ?? rom.get(norm(name))
    if (!r) { unmatched.push(name); continue }
    checked++
    const appPower = d.power ?? (gen === '4' ? 1 : 0)
    // Variable-power moves are stored as null in the app (ROM: 0 or 1);
    // Hidden Power is stored at its notional 60 (ROM: 1).
    // Fixed-damage moves (Sonic Boom 20, Dragon Rage 40) store the damage as the ROM power.
    const FIXED = { 'Sonic Boom': 20, 'Dragon Rage': 40, 'Spit Up': 100 }
    const powerOk = d.power == null ? (r.power <= 1 || FIXED[name] === r.power) : name === 'Hidden Power' ? true : appPower === r.power
    if (!powerOk) mismatches.push(`${name} power: app=${d.power} rom=${r.power}`)
    const appType = d.type === 'Unknown' ? '???' : d.type
    if (r.type === 'CURSE_TYPE') r.type = '???'
    if (appType !== r.type && !(gen === '1' && r.type === 'Bird')) mismatches.push(`${name} type: app=${d.type} rom=${r.type}`)
    // Accuracy null means "cannot miss" in the app; only compare when it is set.
    if (d.accuracy != null && d.accuracy !== r.accuracy) mismatches.push(`${name} accuracy: app=${d.accuracy} rom=${r.accuracy}`)
    if (d.pp !== r.pp) mismatches.push(`${name} pp: app=${d.pp} rom=${r.pp}`)
    if (r.category && String(d.category) !== r.category) mismatches.push(`${name} category: app=${d.category} rom=${r.category}`)
  }
  const status = mismatches.length ? 'FAIL' : 'OK  '
  if (mismatches.length) failed = true
  console.log(`${status} Gen ${gen} (${repo.padEnd(12)}) ${String(checked).padStart(4)} checked, ${mismatches.length} mismatched, ${unmatched.length} unmatched`)
  for (const m of mismatches) console.log(`       ${m}`)
  if (VERBOSE && unmatched.length) console.log(`       unmatched: ${unmatched.join(', ')}`)
}
process.exit(failed ? 1 : 0)
