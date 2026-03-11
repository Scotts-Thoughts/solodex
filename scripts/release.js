#!/usr/bin/env node
const path = require('path')
const { execSync } = require('child_process')
const { version } = require(path.join(__dirname, '..', 'package.json'))
const v = 'v' + version

try {
  // Remove local tag if it exists so we can re-tag the current commit
  try {
    execSync('git tag -d ' + v, { stdio: 'pipe' })
  } catch {
    // Tag didn't exist locally, ignore
  }
  execSync('git tag ' + v, { stdio: 'inherit' })
  // Force-push so we can update the tag if it already existed on remote
  execSync('git push origin ' + v + ' --force', { stdio: 'inherit' })
  console.log(v + ' pushed — GitHub Actions will build and publish the release.')
} catch (err) {
  console.error(err.message || err)
  process.exit(1)
}
