/**
 * collect:wiki — download the Bulbapedia text the wiki popovers show, so the
 * app can show it offline.
 *
 *   npm run collect:wiki                 # fetch what is not cached yet, write the bundle
 *   npm run collect:wiki -- --refresh    # re-fetch every page
 *
 * Bulbapedia is behind Cloudflare: start data_objects' bulba_proxy.js first
 * (see that repo's SCRAPING.md); BULBA_PROXY overrides its address.
 *
 * Every move and ability name the app can display (learnsets, move lists and
 * trainer parties of every game) is resolved to its article with the same
 * candidates the live fetch uses (src/shared/wiki.ts), and every TM/HM in
 * tmhm.js gets its page's location tables. Output, read by
 * src/renderer/src/data/wiki.ts:
 *
 *   data_objects-main/wiki/moves.js      wikiKey(name) → plain-text extract
 *   data_objects-main/wiki/abilities.js  wikiKey(name) → plain-text extract
 *   data_objects-main/wiki/tm_pages.js   "TM024" / "HM04" → location tables (compactTmHtml)
 *
 * Responses are cached under scripts/collect-wiki/.cache/ (gitignored), so a
 * re-run after an interruption only fetches what is missing. A full cold run
 * is ~1,500 requests, about 40 minutes at the proxy's pace.
 *
 * Run with vite-node so the renderer's data layer and `@data` alias resolve.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { GAMES, GAME_TO_GEN, getAllMoveNames, getAllPokemonForGame, getMovesForGen, getTrainers, preloadAllData } from '@/data'
import { tmhm } from '@data/tmhm'
import { tmPageTitle, wikiKey, wikiNameCandidates, wikiTitle, type WikiType } from '../../src/shared/wiki'
import { compactTmHtml } from './compactTmHtml'

const ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(ROOT, 'data_objects-main/wiki')
const CACHE_DIR = path.join(__dirname, '.cache')
const PROXY = (process.env.BULBA_PROXY ?? 'http://127.0.0.1:8765').replace(/\/$/, '')
const API = 'https://bulbapedia.bulbagarden.net/w/api.php'
const REFRESH = process.argv.includes('--refresh')

// ── Fetching ────────────────────────────────────────────────────────────────

let fetched = 0

/** GET a Bulbapedia API URL through the proxy; cached on disk. */
async function getJson<T>(url: string): Promise<T> {
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json')
  if (!REFRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const res = await fetch(`${PROXY}/fetch?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`proxy answered ${res.status} for ${url}`)
  const { status, body } = await res.json() as { status: number; body: string }
  if (status !== 200) throw new Error(`Bulbapedia answered ${status} for ${url}`)
  const data = JSON.parse(body)
  fs.writeFileSync(file, JSON.stringify(data))
  if (++fetched % 25 === 0) console.log(`  … ${fetched} pages fetched`)
  return data
}

async function fetchExtract(name: string, type: WikiType): Promise<string | null> {
  const url = `${API}?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(wikiTitle(name, type))}&format=json`
  const data = await getJson<{ query?: { pages?: Record<string, { missing?: string; extract?: string }> } }>(url)
  const page = Object.values(data.query?.pages ?? {})[0]
  if (!page || page.missing !== undefined) return null
  return page.extract || null
}

async function fetchTmPage(title: string): Promise<string | null> {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json`
  // A missing page comes back as { error: { code: 'missingtitle' } }.
  const data = await getJson<{ parse?: { text?: { '*'?: string } } }>(url)
  return data.parse?.text?.['*'] ?? null
}

// ── What the app can display ────────────────────────────────────────────────

function collectNames(): { moves: Map<string, Set<string>>; abilities: Map<string, Set<string>> } {
  const moves = new Map<string, Set<string>>()
  const abilities = new Map<string, Set<string>>()
  const add = (into: Map<string, Set<string>>, name: string | null | undefined) => {
    if (!name) return
    const key = wikiKey(name)
    if (!key) return
    if (!into.has(key)) into.set(key, new Set())
    into.get(key)!.add(name)
  }

  getAllMoveNames().forEach(n => add(moves, n))
  for (const game of GAMES) {
    for (const mon of getAllPokemonForGame(game)) {
      for (const [field, value] of Object.entries(mon)) {
        if (field === 'level_up_learnset') (value as [number, string][]).forEach(([, m]) => add(moves, m))
        else if ((field.endsWith('_learnset') || field === 'egg_moves') && Array.isArray(value)) value.forEach(m => add(moves, m as string))
      }
      mon.abilities?.forEach(a => add(abilities, a))
      add(abilities, mon.hidden_ability)
    }
    getMovesForGen(GAME_TO_GEN[game], game).forEach(({ name }) => add(moves, name))
    for (const trainer of getTrainers(game)) {
      for (const mon of trainer.party) {
        mon.moves.forEach(m => add(moves, m))
        add(abilities, mon.ability)
      }
    }
  }
  return { moves, abilities }
}

/** Resolve each key's names to an article; returns key → extract and the keys with no article. */
async function collectExtracts(names: Map<string, Set<string>>, type: WikiType) {
  const out: Record<string, string> = {}
  const missing: string[] = []
  for (const [key, spellings] of [...names].sort(([a], [b]) => a.localeCompare(b))) {
    const candidates = [...new Set([...spellings].flatMap(wikiNameCandidates))]
    let extract: string | null = null
    for (const candidate of candidates) {
      extract = await fetchExtract(candidate, type)
      if (extract) break
    }
    if (extract) out[key] = extract
    else missing.push([...spellings].join(' / '))
  }
  return { out, missing }
}

// ── Output ──────────────────────────────────────────────────────────────────

function writeModule(file: string, exportName: string, value: Record<string, string>) {
  const sorted = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
  const body = '{\n' + Object.entries(sorted).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}'
  const target = path.join(OUT_DIR, file)
  fs.writeFileSync(target, `export const ${exportName} = ${body}\n`)
  console.log(`  ${path.relative(ROOT, target)}: ${Object.keys(sorted).length} entries, ${(fs.statSync(target).size / 1024).toFixed(0)} KB`)
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  try {
    await fetch(`${PROXY}/health`)
  } catch {
    const cached = fs.readdirSync(CACHE_DIR).length
    console.warn(`Bulbapedia proxy not reachable at ${PROXY}${cached ? ` — continuing from ${cached} cached pages` : ''}.`)
    if (!cached) process.exit(1)
  }

  await preloadAllData()
  const { moves, abilities } = collectNames()
  console.log(`${moves.size} moves, ${abilities.size} abilities`)

  console.log('Moves…')
  const moveResult = await collectExtracts(moves, 'move')
  console.log('Abilities…')
  const abilityResult = await collectExtracts(abilities, 'ability')

  console.log('TM/HM pages…')
  const tmPages: Record<string, string> = {}
  const tmMissing: string[] = []
  const titles = new Set(Object.values(tmhm).flatMap(list => Object.keys(list)).filter(c => /^(TM|HM)\d+$/.test(c)).map(tmPageTitle))
  for (const title of [...titles].sort()) {
    const html = await fetchTmPage(title)
    const compact = html ? compactTmHtml(html) : ''
    if (compact) tmPages[title] = compact
    else tmMissing.push(title)
  }

  console.log('Writing…')
  writeModule('moves.js', 'wikiMoves', moveResult.out)
  writeModule('abilities.js', 'wikiAbilities', abilityResult.out)
  writeModule('tm_pages.js', 'wikiTmPages', tmPages)

  const report = (label: string, list: string[]) => {
    if (list.length) console.log(`\nNo Bulbapedia article for ${list.length} ${label}:\n  ${list.join('\n  ')}`)
  }
  report('moves', moveResult.missing)
  report('abilities', abilityResult.missing)
  report('TM/HM pages (or no location table)', tmMissing)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
