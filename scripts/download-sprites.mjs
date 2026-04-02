#!/usr/bin/env node
/**
 * Downloads all Pokemon sprites (artwork + home) from PokeAPI's GitHub repo
 * and saves them locally so the app never needs to fetch them at runtime.
 *
 * Usage: node scripts/download-sprites.mjs
 *
 * Skips files that already exist, so it's safe to re-run after interruption.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const ARTWORK_DIR = path.join(ROOT, 'src/renderer/public/sprites/artwork')
const HOME_DIR = path.join(ROOT, 'src/renderer/public/sprites/home')

const ARTWORK_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
const HOME_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home'

// All form sprite IDs from formSprites.ts (extracted here to avoid TS parsing)
const FORM_IDS = [
  10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010,
  10011, 10012, 10016, 10017, 10018, 10019, 10020, 10021, 10022, 10023,
  10024, 10025, 10033, 10034, 10035, 10036, 10037, 10038, 10039, 10040,
  10041, 10042, 10043, 10044, 10045, 10046, 10047, 10048, 10049, 10050,
  10051, 10052, 10053, 10054, 10055, 10056, 10057, 10058, 10059, 10060,
  10062, 10063, 10064, 10065, 10066, 10067, 10068, 10069, 10070, 10071,
  10072, 10073, 10074, 10075, 10076, 10077, 10078, 10079, 10086, 10087,
  10088, 10089, 10090, 10091, 10092, 10100, 10101, 10102, 10103, 10104,
  10105, 10106, 10107, 10108, 10109, 10110, 10111, 10112, 10113, 10114,
  10115, 10118, 10119, 10120, 10123, 10124, 10125, 10126, 10152, 10155,
  10156, 10157, 10161, 10162, 10163, 10164, 10165, 10166, 10167, 10168,
  10169, 10170, 10171, 10172, 10173, 10174, 10175, 10176, 10177, 10178,
  10179, 10180, 10181, 10184, 10186, 10188, 10189, 10191, 10193, 10194,
  10229, 10230, 10231, 10232, 10233, 10234, 10235, 10236, 10237, 10238,
  10239, 10240, 10241, 10242, 10243, 10244, 10245, 10246, 10247, 10248,
  10249, 10250, 10251, 10252, 10253, 10254, 10272,
  // Custom megas (may not exist on PokeAPI — script will skip 404s)
  10278, 10279, 10280, 10281, 10282, 10283, 10284, 10285, 10286, 10287,
  10288, 10289, 10290, 10291, 10292, 10293, 10294, 10295, 10296, 10297,
  10298, 10299, 10300, 10301, 10302, 10304, 10305, 10306, 10307, 10308,
  10310, 10311, 10312, 10313, 10314, 10315, 10316, 10317, 10319,
]

// Base forms: national dex 1–1025
const BASE_IDS = Array.from({ length: 1025 }, (_, i) => i + 1)

// Deduplicated full list
const ALL_IDS = [...new Set([...BASE_IDS, ...FORM_IDS])].sort((a, b) => a - b)

const CONCURRENT = 5
const RETRY_DELAY_MS = 2000
const MAX_RETRIES = 5

fs.mkdirSync(ARTWORK_DIR, { recursive: true })
fs.mkdirSync(HOME_DIR, { recursive: true })

async function downloadFile(url, dest, retries = 0) {
  if (fs.existsSync(dest)) return 'cached'

  try {
    const res = await fetch(url)
    if (res.status === 404) return 'not-found'
    if (res.status === 429 || res.status >= 500) {
      if (retries < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retries)
        await new Promise(r => setTimeout(r, delay))
        return downloadFile(url, dest, retries + 1)
      }
      return 'failed'
    }
    if (!res.ok) return 'failed'
    const buffer = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(dest, buffer)
    return 'ok'
  } catch (err) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retries)
      await new Promise(r => setTimeout(r, delay))
      return downloadFile(url, dest, retries + 1)
    }
    return 'failed'
  }
}

async function downloadBatch(tasks) {
  const results = []
  for (let i = 0; i < tasks.length; i += CONCURRENT) {
    const batch = tasks.slice(i, i + CONCURRENT)
    const batchResults = await Promise.all(
      batch.map(t => downloadFile(t.url, t.dest))
    )
    results.push(...batchResults)

    // Progress
    const done = Math.min(i + CONCURRENT, tasks.length)
    const pct = ((done / tasks.length) * 100).toFixed(1)
    process.stdout.write(`\r  ${done}/${tasks.length} (${pct}%)`)
  }
  process.stdout.write('\n')
  return results
}

async function main() {
  console.log(`Downloading sprites for ${ALL_IDS.length} Pokemon...\n`)

  // Build task lists
  const artworkTasks = ALL_IDS.map(id => ({
    url: `${ARTWORK_BASE}/${id}.png`,
    dest: path.join(ARTWORK_DIR, `${id}.png`),
  }))
  const homeTasks = ALL_IDS.map(id => ({
    url: `${HOME_BASE}/${id}.png`,
    dest: path.join(HOME_DIR, `${id}.png`),
  }))

  console.log('Artwork sprites:')
  const artResults = await downloadBatch(artworkTasks)

  console.log('Home sprites:')
  const homeResults = await downloadBatch(homeTasks)

  for (const [label, results] of [['Artwork', artResults], ['Home', homeResults]]) {
    const ok = results.filter(r => r === 'ok').length
    const cached = results.filter(r => r === 'cached').length
    const notFound = results.filter(r => r === 'not-found').length
    const failed = results.filter(r => r === 'failed').length
    console.log(`\n${label}: ${ok} downloaded, ${cached} already cached, ${notFound} not found (404), ${failed} failed`)
  }

  // Report total size
  let totalBytes = 0
  for (const dir of [ARTWORK_DIR, HOME_DIR]) {
    for (const f of fs.readdirSync(dir)) {
      totalBytes += fs.statSync(path.join(dir, f)).size
    }
  }
  console.log(`\nTotal sprite size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
}

main().catch(err => { console.error(err); process.exit(1) })
