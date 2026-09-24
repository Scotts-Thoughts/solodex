/**
 * Vite plugin for the raw data in data_objects-main/.
 *
 * 1. Every `export const NAME = {...}` data module under data_objects-main is
 *    rewritten to `export const NAME = JSON.parse("...")`. V8 parses a JSON
 *    string several times faster than the equivalent object literal and does
 *    not keep the source text alive afterwards.
 * 2. `import('@data/pokedex.js?game=<name>')` yields just that game's slice of
 *    the shared gen 1-4 pokedex.js, so each game becomes its own chunk.
 * 3. `virtual:solodex-species-index` is the cross-game species list
 *    (`buildSpeciesIndex`) computed here, at build time, so the renderer can
 *    show the Pokedex list before any game's table has loaded.
 *
 * Used by electron.vite.config.ts (dev + build) and vitest.config.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import type { Plugin } from 'vite'
import { buildSpeciesIndex } from '../src/renderer/src/data/speciesIndex'
import { GAMES, POKEDEX_SOURCES } from '../src/renderer/src/data/games'
import type { PokemonData } from '../src/renderer/src/types/pokemon'

const VIRTUAL_INDEX = 'virtual:solodex-species-index'
const RESOLVED_VIRTUAL_INDEX = '\0' + VIRTUAL_INDEX
const DATA_DIR_SEGMENT = '/data_objects-main/'

interface DataModule { name: string; value: unknown }
const cache = new Map<string, { mtimeMs: number; size: number; parsed: DataModule }>()

/** Evaluate a data file's single object literal (JSON fast path, sandboxed vm otherwise). */
function readDataModule(file: string): DataModule {
  const stat = fs.statSync(file)
  const hit = cache.get(file)
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.parsed

  const source = fs.readFileSync(file, 'utf8')
  const header = /^\s*export const (\w+)\s*=\s*/.exec(source)
  if (!header) throw new Error(`[solodex-data] ${file}: expected a single "export const NAME = {...}" module`)
  const body = source.slice(header[0].length).replace(/;?\s*$/, '')
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    // Some scraper output uses unquoted keys; evaluate the literal in an empty sandbox.
    value = vm.runInNewContext(`(${body})`, Object.create(null), { filename: file })
  }
  const parsed = { name: header[1], value }
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, parsed })
  return parsed
}

const asJsonParse = (value: unknown): string => `JSON.parse(${JSON.stringify(JSON.stringify(value))})`

export default function solodexDataPlugin(options: { dataDir: string }): Plugin {
  const dataDir = path.resolve(options.dataDir)
  return {
    name: 'solodex-data',
    enforce: 'pre',

    resolveId(id) {
      return id === VIRTUAL_INDEX ? RESOLVED_VIRTUAL_INDEX : null
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_INDEX) return null
      const dexByGame: Record<string, Record<string, PokemonData>> = {}
      for (const game of GAMES) {
        const src = POKEDEX_SOURCES[game]
        const file = path.join(dataDir, src.file)
        this.addWatchFile(file)
        const { value } = readDataModule(file)
        const table = src.key ? (value as Record<string, unknown>)[src.key] : value
        if (!table) throw new Error(`[solodex-data] ${src.file} has no entry for "${game}"`)
        dexByGame[game] = table as Record<string, PokemonData>
      }
      return `export default ${asJsonParse(buildSpeciesIndex(dexByGame, GAMES))};\n`
    },

    transform(_code, id) {
      const [file, query = ''] = id.split('?')
      const normalized = file.replace(/\\/g, '/')
      if (!normalized.includes(DATA_DIR_SEGMENT) || !normalized.endsWith('.js')) return null
      const { name, value } = readDataModule(file)
      const game = new URLSearchParams(query).get('game')
      let exported = value
      if (game !== null) {
        exported = (value as Record<string, unknown>)[game]
        if (exported === undefined) throw new Error(`[solodex-data] ${file} has no entry for "${game}"`)
      }
      return { code: `export const ${name} = ${asJsonParse(exported)};\n`, map: null }
    },
  }
}
