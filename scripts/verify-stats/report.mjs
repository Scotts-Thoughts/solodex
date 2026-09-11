/**
 * Shared helpers: loading the app's ESM data files, normalising species names
 * so ROM constants and app names line up, and collecting comparison results.
 */
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { STAT_KEYS } from './config.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '../..')
const DATA = path.join(ROOT, 'data_objects-main')

async function loadModule(relative) {
  return import(pathToFileURL(path.join(DATA, relative)).href)
}

/** data_objects-main/pokedex.js — Gen 1–4 games keyed by game name. */
export async function loadAppPokedex() {
  return (await loadModule('pokedex.js')).pokedex
}

/** data_objects-main/pokedex/<file>.js — a single per-game file. */
export async function loadAppGamePokedex(file) {
  return (await loadModule(`pokedex/${file}.js`)).pokedex
}

/** data_objects-main/trainers/<file>.js. */
export async function loadAppTrainers(file) {
  return (await loadModule(`trainers/${file}.js`)).trainers
}

/**
 * Collapse a species name to lowercase alphanumerics so "Nidoran_F",
 * "NIDORAN_F", "nidoran_f.asm" and "SPECIES_NIDORAN_F" all agree. Callers strip
 * any SPECIES_ prefix first. The pokedex files spell the Nidorans with the
 * gender symbols ("Nidoran♀"); those map onto the ROMs' _F / _M suffixes.
 */
export function speciesKey(name) {
  return name.replace(/♀/g, 'f').replace(/♂/g, 'm').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** One game's worth of results. */
export class Report {
  constructor(title) {
    this.title = title
    this.checked = 0
    this.mismatches = []
    this.skipped = []
  }

  /** Compare the six stats of one Pokémon; records every differing key. */
  compare(label, actual, expected) {
    this.checked++
    for (const key of STAT_KEYS) {
      if (actual[key] !== expected[key]) {
        this.mismatches.push(`${label} ${key}: app=${actual[key]} rom=${expected[key]}`)
      }
    }
  }

  /** Compare a single scalar (a nature, an ability). */
  compareValue(label, actual, expected) {
    if (actual !== expected) this.mismatches.push(`${label}: app=${actual} rom=${expected}`)
  }

  skip(reason) { this.skipped.push(reason) }

  get ok() { return this.mismatches.length === 0 }

  print(verbose) {
    const status = this.ok ? 'OK  ' : 'FAIL'
    let line = `${status} ${this.title.padEnd(52)} ${String(this.checked).padStart(5)} checked`
    if (this.mismatches.length) line += `, ${this.mismatches.length} mismatched`
    if (this.skipped.length) line += `, ${this.skipped.length} skipped`
    console.log(line)
    const detail = verbose ? this.mismatches : this.mismatches.slice(0, 10)
    for (const m of detail) console.log(`       ${m}`)
    if (!verbose && this.mismatches.length > detail.length) {
      console.log(`       … ${this.mismatches.length - detail.length} more (run with --verbose)`)
    }
    if (verbose) for (const s of this.skipped) console.log(`       skipped: ${s}`)
  }
}
