#!/usr/bin/env node
/**
 * Shrinks the Pokemon HOME sprites in place to the size the app actually
 * draws them at. PokeAPI serves them as 512x512 PNGs (~100 KB each, 142 MB in
 * total); the app never shows one larger than 44 CSS px, so 128x128 covers
 * 3x displays and cuts the set to a few MB and the decode cost to ~nothing.
 *
 * Usage: npx electron scripts/resize-sprites.cjs   (run after download-sprites.mjs)
 *
 * Uses Electron's own image codec so it works on every platform without a
 * native dependency. Files already at or below the target size are skipped,
 * so it is safe to re-run.
 */
const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const HOME_DIR = path.join(__dirname, '../src/renderer/public/sprites/home')
const TARGET = 128

// IHDR width/height sit at bytes 16..23 of every PNG
function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

app.dock?.hide()
app.whenReady().then(() => {
  let resized = 0, skipped = 0, failed = 0, before = 0, after = 0
  for (const name of fs.readdirSync(HOME_DIR)) {
    if (!name.endsWith('.png')) continue
    const file = path.join(HOME_DIR, name)
    const buf = fs.readFileSync(file)
    const size = pngSize(buf)
    if (!size || (size.width <= TARGET && size.height <= TARGET)) { skipped++; continue }
    const out = nativeImage.createFromBuffer(buf).resize({ width: TARGET, height: TARGET, quality: 'best' }).toPNG()
    const check = pngSize(out)
    if (!check || check.width !== TARGET || check.height !== TARGET || out.length === 0) { failed++; console.error('failed:', name); continue }
    fs.writeFileSync(file, out)
    before += buf.length; after += out.length; resized++
  }
  console.log(`resized ${resized} sprites to ${TARGET}px (${(before / 1048576).toFixed(0)} MB -> ${(after / 1048576).toFixed(1)} MB), skipped ${skipped}, failed ${failed}`)
  app.exit(failed ? 1 : 0)
})
