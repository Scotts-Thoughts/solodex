#!/usr/bin/env node
// Map packs live as assets of a GitHub prerelease (`maps-v<MAP_PACK_VERSION>`)
// on this repo instead of in git: the release workflow downloads them before
// packaging (they ship in the installer as extraResources).
//
//   npm run maps:publish   # upload resources/maps/*.zip (creates the release once; --clobber replaces)
//   npm run maps:fetch     # download them into resources/maps (CI; needs GH_TOKEN there)
//
// The release is a prerelease that is never marked latest, so the app's
// update check (releases/latest) and electron-updater never see it.
// Needs the GitHub CLI (`gh`). See docs/maps/README.md.
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'resources', 'maps')
const REPO = 'Scotts-Thoughts/solodex'
const version = fs.readFileSync(path.join(ROOT, 'src/shared/mapPack.ts'), 'utf8').match(/MAP_PACK_VERSION = (\d+)/)[1]
const TAG = `maps-v${version}`

const gh = (...args) => execFileSync('gh', [...args, '--repo', REPO], { stdio: 'inherit' })

function packs() {
  return fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.zip')).map(f => path.join(DIR, f)) : []
}

const cmd = process.argv[2]
if (cmd === 'publish') {
  const files = packs()
  if (files.length === 0) {
    console.error('No packs in resources/maps — run npm run build:maps first.')
    process.exit(1)
  }
  try {
    execFileSync('gh', ['release', 'view', TAG, '--repo', REPO], { stdio: 'ignore' })
  } catch {
    gh('release', 'create', TAG, '--prerelease', '--latest=false', '--title', `Map packs v${version}`,
      '--notes', 'Map data for the Map tab, downloaded by the release workflow (npm run maps:fetch). Not an app release.')
  }
  gh('release', 'upload', TAG, ...files, '--clobber')
  console.log(`Uploaded ${files.length} packs to ${TAG}.`)
} else if (cmd === 'fetch') {
  fs.mkdirSync(DIR, { recursive: true })
  gh('release', 'download', TAG, '--pattern', '*.zip', '--dir', DIR, '--clobber')
  console.log(`Downloaded ${packs().length} packs from ${TAG}.`)
} else {
  console.error('usage: node scripts/maps-release.mjs publish|fetch')
  process.exit(1)
}
