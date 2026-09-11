#!/usr/bin/env node
/**
 * Cross-check Solodex's stat data against the game decompilations.
 *
 *   npm run verify:stats                    # everything
 *   npm run verify:stats -- base            # base stats only
 *   npm run verify:stats -- trainers        # trainer parties only
 *   npm run verify:stats -- --verbose       # list every mismatch, not just the first 10
 *
 * Exits non-zero if anything mismatches. Decomp locations come from config.mjs
 * (override with env vars, e.g. POKERED=/path/to/pokered).
 *
 * Re-run this after regenerating anything under data_objects-main/ — it is the
 * check that caught the swapped Deoxys-Attack stats, the permuted Platinum
 * rival starters and the HGSS gender-override natures.
 */
import { verifyBaseStats } from './base-stats.mjs'
import { verifyTrainers } from './trainers.mjs'

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const only = args.find(a => !a.startsWith('--'))

const reports = []
if (!only || only === 'base') {
  console.log('── Base stats vs ROM tables ──────────────────────────────────────────')
  for (const r of await verifyBaseStats()) { r.print(verbose); reports.push(r) }
}
if (!only || only === 'trainers') {
  console.log('\n── Trainer party stats vs ROM generation ─────────────────────────────')
  for (const r of await verifyTrainers()) { r.print(verbose); reports.push(r) }
}

const checked = reports.reduce((n, r) => n + r.checked, 0)
const failed = reports.filter(r => !r.ok)
console.log(`\n${checked} entries checked across ${reports.length} tables; ${failed.length} table(s) with mismatches.`)
process.exit(failed.length ? 1 : 0)
