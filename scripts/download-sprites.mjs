#!/usr/bin/env node
/**
 * Downloads all Pokemon sprites (artwork + home) from PokeAPI's GitHub repo
 * and saves them locally so the app never needs to fetch them at runtime.
 *
 * PokeAPI serves PNGs; they are re-encoded to WebP (quality 90, lossless alpha)
 * before being written, which cuts the bundled sprites by ~80% with no visible
 * difference. HOME sprites are also shrunk from 512px to 128px: the app never
 * draws one larger than 44 CSS px, so 128px covers 3x displays. Artwork stays
 * full size for the lightbox and exports. Sprites left by older runs (.png, or
 * full-size HOME .webp) are converted in place.
 *
 * Usage: node scripts/download-sprites.mjs
 *
 * Skips files that already exist, so it's safe to re-run after interruption.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

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

const WEBP_OPTIONS = { quality: 90, alphaQuality: 100, effort: 6 }

const HOME_SIZE = 128

function toWebp(input, dir) {
  let img = sharp(input)
  if (dir === HOME_DIR) img = img.resize(HOME_SIZE, HOME_SIZE, { fit: 'inside', withoutEnlargement: true })
  return img.webp(WEBP_OPTIONS).toBuffer()
}

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
    fs.writeFileSync(`${dest}.tmp`, await toWebp(buffer, path.dirname(dest)))
    fs.renameSync(`${dest}.tmp`, dest)
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

// Bring sprites saved by older versions of this script up to date: .png files are
// re-encoded to WebP (always, since an interrupted run can leave a truncated .webp
// beside its .png; the .png is deleted only once the .webp is written in full), and
// full-size HOME .webp files are shrunk in place.
async function convertLegacySprites() {
  const pngs = [ARTWORK_DIR, HOME_DIR].flatMap(dir =>
    fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => path.join(dir, f)))
  const bigHome = []
  for (const f of fs.readdirSync(HOME_DIR).filter(f => f.endsWith('.webp'))) {
    const file = path.join(HOME_DIR, f)
    const { width, height } = await sharp(file).metadata()
    if (width > HOME_SIZE || height > HOME_SIZE) bigHome.push(file)
  }
  const todo = [...pngs, ...bigHome]
  if (!todo.length) return

  console.log(`Converting ${pngs.length} PNG sprites to WebP and shrinking ${bigHome.length} HOME sprites:`)
  const convert = async src => {
    const dest = src.replace(/\.png$/, '.webp')
    fs.writeFileSync(`${dest}.tmp`, await toWebp(fs.readFileSync(src), path.dirname(src)))
    fs.renameSync(`${dest}.tmp`, dest)
    if (src !== dest) fs.unlinkSync(src)
  }
  const BATCH = 16
  for (let i = 0; i < todo.length; i += BATCH) {
    await Promise.all(todo.slice(i, i + BATCH).map(convert))
    process.stdout.write(`\r  ${Math.min(i + BATCH, todo.length)}/${todo.length}`)
  }
  process.stdout.write('\n\n')
}

async function main() {
  await convertLegacySprites()

  console.log(`Downloading sprites for ${ALL_IDS.length} Pokemon...\n`)

  // Build task lists
  const artworkTasks = ALL_IDS.map(id => ({
    url: `${ARTWORK_BASE}/${id}.png`,
    dest: path.join(ARTWORK_DIR, `${id}.webp`),
  }))
  const homeTasks = ALL_IDS.map(id => ({
    url: `${HOME_BASE}/${id}.png`,
    dest: path.join(HOME_DIR, `${id}.webp`),
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
