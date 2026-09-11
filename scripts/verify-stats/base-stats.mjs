/**
 * Compare every species' base stats in data_objects-main against the ROM's own
 * base-stat table, for each Gen 1–4 game.
 */
import path from 'path'
import { DECOMPS, STAT_KEYS } from './config.mjs'
import {
  readGen12BaseStats, readGen3BaseStats, readPlatinumSpecies,
} from './decomp.mjs'
import { loadAppPokedex, speciesKey, Report } from './report.mjs'

/**
 * Gen 3's Deoxys is a per-version override (sDeoxysBaseStats in pokemon.c), and
 * Gen 4 keeps alternate forms in res/pokemon/<species>/forms/<form>/. Rather than
 * teach the parsers about every layout, spell the form rows out here — these are
 * the values in those files.
 */
const FORM_STATS = {
  'Deoxys (Normal)':        [50, 150, 50, 150, 150, 50],
  'Deoxys (Attack)':        [50, 180, 20, 150, 180, 20],
  'Deoxys (Defense)':       [50, 70, 160, 90, 70, 160],
  'Deoxys (Speed)':         [50, 95, 90, 180, 95, 90],
  'Giratina (Altered)':     [150, 100, 120, 90, 100, 120],
  'Giratina (Origin)':      [150, 120, 100, 90, 120, 100],
  'Shaymin (Land)':         [100, 100, 100, 100, 100, 100],
  'Shaymin (Sky)':          [100, 103, 75, 127, 120, 75],
  'Wormadam (Plant Cloak)': [60, 59, 85, 36, 79, 105],
  'Wormadam (Sandy Cloak)': [60, 79, 105, 36, 59, 85],
  'Wormadam (Trash Cloak)': [60, 69, 95, 36, 69, 95],
  'Rotom (Heat)':           [50, 65, 107, 86, 105, 107],
  'Rotom (Wash)':           [50, 65, 107, 86, 105, 107],
  'Rotom (Frost)':          [50, 65, 107, 86, 105, 107],
  'Rotom (Fan)':            [50, 65, 107, 86, 105, 107],
  'Rotom (Mow)':            [50, 65, 107, 86, 105, 107],
}

const toStats = row => Object.fromEntries(STAT_KEYS.map((k, i) => [k, row[i]]))

function keyBySpecies(table) {
  const out = {}
  for (const [name, stats] of Object.entries(table)) out[speciesKey(name)] = stats
  return out
}

/** Every game → how to get its ROM base-stat table, keyed by normalised species. */
function romTables() {
  const gen12 = (repo, sixStats) =>
    keyBySpecies(readGen12BaseStats(path.join(repo, 'data/pokemon/base_stats'), { sixStats }))
  const gen3 = file => keyBySpecies(readGen3BaseStats(file))
  const platinum = keyBySpecies(Object.fromEntries(
    Object.entries(readPlatinumSpecies(DECOMPS.pokeplatinum)).map(([k, v]) => [k, v.base_stats]),
  ))
  return {
    'Red and Blue':             gen12(DECOMPS.pokered, false),
    'Yellow':                   gen12(DECOMPS.pokeyellow, false),
    'Gold and Silver':          gen12(DECOMPS.pokegold, true),
    'Crystal':                  gen12(DECOMPS.pokecrystal, true),
    'Ruby and Sapphire':        gen3(path.join(DECOMPS.pokeruby, 'src/data/pokemon/base_stats.h')),
    'Emerald':                  gen3(path.join(DECOMPS.pokeemerald, 'src/data/pokemon/species_info.h')),
    'FireRed and LeafGreen':    gen3(path.join(DECOMPS.pokefirered, 'src/data/pokemon/species_info.h')),
    // No base stat changed within Gen 4, so Platinum's table stands in for all three.
    'Diamond and Pearl':        platinum,
    'Platinum':                 platinum,
    'HeartGold and SoulSilver': platinum,
  }
}

export async function verifyBaseStats() {
  const pokedex = await loadAppPokedex()
  const reports = []
  for (const [game, rom] of Object.entries(romTables())) {
    const report = new Report(`${game} base stats`)
    for (const [name, entry] of Object.entries(pokedex[game] ?? {})) {
      const expected = FORM_STATS[name] ? toStats(FORM_STATS[name]) : rom[speciesKey(name)]
      if (!expected) { report.skip(`${name}: not in ROM table`); continue }
      report.compare(name, entry.base_stats, expected)
    }
    reports.push(report)
  }
  return reports
}
