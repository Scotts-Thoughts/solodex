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

// All form sprite IDs, read straight from formSprites.ts so the two never drift.
const formSpritesSrc = fs.readFileSync(path.join(ROOT, 'src/renderer/src/data/formSprites.ts'), 'utf8')
const FORM_IDS = [...new Set([...formSpritesSrc.matchAll(/:\s*(\d{5})\b/g)].map(m => Number(m[1])))]

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
