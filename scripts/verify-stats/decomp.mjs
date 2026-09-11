/**
 * Readers for the raw data tables in each decompilation repo. Every function
 * here returns plain JS, keyed by the ROM's own constant names — normalising to
 * the app's species names happens in the comparison scripts.
 */
import fs from 'fs'
import path from 'path'

const read = file => fs.readFileSync(file, 'utf8')
const lines = file => read(file).split(/\r?\n/)

// ─── Gen 1–2 (asm) ───────────────────────────────────────────────────────────

/**
 * data/pokemon/base_stats/*.asm — one file per species, whose first numeric `db`
 * row is the stat line. Gen 1 has five values (Special is one stat); Gen 2 has
 * six. Returns { <filename without .asm>: { hp, attack, ... } }.
 */
export function readGen12BaseStats(dir, { sixStats }) {
  const out = {}
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.asm')) continue
    const text = read(path.join(dir, file))
    const m = text.match(/db\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\s*\n\s*;\s*hp/i)
    if (!m) throw new Error(`no base stat row in ${file}`)
    const v = m.slice(1, 7).map(x => (x === undefined ? null : parseInt(x, 10)))
    out[file.replace('.asm', '')] = {
      hp: v[0], attack: v[1], defense: v[2], speed: v[3],
      special_attack: v[4],
      special_defense: sixStats ? v[5] : v[4],
    }
  }
  return out
}

/**
 * pokered/pokeyellow data/trainers/parties.asm. Each `<Class>Data:` label holds
 * that class's parties in order. A party is either `db level, SPECIES..., 0`
 * (one level for the whole party) or `db $FF, level, SPECIES, ..., 0`.
 * Returns { <ClassName>: [ [ {level, species}, ... ], ... ] }.
 */
export function readGen1Parties(file) {
  const groups = {}
  let current = null
  for (const line of lines(file)) {
    const label = line.match(/^(\w+)Data:/)
    if (label) { current = label[1]; groups[current] = []; continue }
    if (!current) continue
    const row = line.match(/^\s*db\s+(.+?)\s*(?:;.*)?$/)
    if (!row) continue
    const toks = row[1].split(',').map(t => t.trim()).filter(Boolean)
    if (!toks.length || /^(dw|table_width|assert)/.test(toks[0])) continue

    const party = []
    if (toks[0] === '$FF' || toks[0] === '-1') {
      for (let i = 1; i < toks.length - 1; i += 2) {
        if (toks[i] === '0') break
        party.push({ level: parseInt(toks[i], 10), species: toks[i + 1] })
      }
    } else {
      const level = parseInt(toks[0], 10)
      if (Number.isNaN(level)) continue
      for (let i = 1; i < toks.length; i++) {
        if (toks[i] === '0') break
        party.push({ level, species: toks[i] })
      }
    }
    if (party.length) groups[current].push(party)
  }
  return groups
}

/**
 * data/trainers/dvs.asm — Gen 2 gives every trainer *class* a fixed DV spread.
 * Returns { <CLASS>: { attack, defense, speed, special } }.
 */
export function readGen2TrainerDvs(file) {
  const out = {}
  const re = /dn\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*;\s*([A-Z0-9_]+)/g
  let m
  while ((m = re.exec(read(file))) !== null) {
    out[m[5]] = {
      attack: +m[1], defense: +m[2], speed: +m[3], special: +m[4],
    }
  }
  return out
}

/**
 * data/trainers/parties.asm — Gen 2. Each trainer is preceded by a
 * `; CLASS (n)` comment and opens with `db "NAME@", TRAINERTYPE_*`.
 * Returns [ { cls, idx, name, party: [{level, species}] } ].
 */
export function readGen2Parties(file) {
  const out = []
  let current = null
  let cls = null
  let idx = null
  for (const line of lines(file)) {
    const header = line.match(/^\s*;\s*([A-Z0-9_]+)\s*\((\d+)\)\s*$/)
    if (header) { cls = header[1]; idx = +header[2]; continue }

    const start = line.match(/^\s*db\s+"([^"]*)@",\s*TRAINERTYPE_(\w+)/)
    if (start) {
      current = { cls, idx, name: start[1], party: [] }
      out.push(current)
      continue
    }

    const mon = line.match(/^\s*db\s+(-?\d+),\s*([A-Z0-9_]+)/)
    if (mon && current) {
      if (+mon[1] === -1) { current = null; continue }
      current.party.push({ level: +mon[1], species: mon[2] })
    }
  }
  return out
}

// ─── Gen 3 (C headers) ───────────────────────────────────────────────────────

/** Split a `[KEY] = { ... }` table into { KEY: <text of that block> }. */
function splitKeyedBlocks(text, pattern) {
  const marks = []
  let m
  while ((m = pattern.exec(text)) !== null) marks.push([m[1], m.index])
  const out = []
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1][1] : text.length
    out.push([marks[i][0], text.slice(marks[i][1], end)])
  }
  return out
}

const FIELD = (block, name) => {
  const m = block.match(new RegExp(`\\.${name}\\s*=\\s*(\\d+)`))
  return m ? parseInt(m[1], 10) : null
}

/**
 * src/data/pokemon/species_info.h (Emerald/FRLG) or base_stats.h (Ruby).
 * Returns { SPECIES_NAME: { hp, attack, ... } } — the first definition of a
 * species wins, so the debug/Unown duplicates later in the file are ignored.
 */
export function readGen3BaseStats(file) {
  const out = {}
  for (const [key, block] of splitKeyedBlocks(read(file), /\[SPECIES_([A-Z0-9_]+)\]\s*=\s*\{/g)) {
    const hp = FIELD(block, 'baseHP')
    if (hp === null || key in out) continue
    out[key] = {
      hp,
      attack: FIELD(block, 'baseAttack'),
      defense: FIELD(block, 'baseDefense'),
      speed: FIELD(block, 'baseSpeed'),
      special_attack: FIELD(block, 'baseSpAttack'),
      special_defense: FIELD(block, 'baseSpDefense'),
    }
  }
  return out
}

/** src/data/text/species_names*.h — { SPECIES_NAME: "IN-GAME NAME" }. */
export function readGen3SpeciesNames(file) {
  const out = {}
  const re = /\[SPECIES_([A-Z0-9_]+)\]\s*=\s*_\("([^"]*)"\)/g
  let m
  while ((m = re.exec(read(file))) !== null) out[m[1]] = m[2]
  return out
}

/**
 * charmap.txt — the nameHash that seeds a trainer's personality sums the game's
 * own byte values, not ASCII. Handles the `'\''` escaped row, and maps a plain
 * ASCII apostrophe onto the curly one the species names actually use.
 */
export function readGen3Charmap(file) {
  const map = {}
  for (const line of lines(file)) {
    let m = line.match(/^'(.)'\s*=\s*([0-9A-Fa-f]{2})\b/)
    if (m) { map[m[1]] = parseInt(m[2], 16); continue }
    m = line.match(/^'\\(.)'\s*=\s*([0-9A-Fa-f]{2})\b/)
    if (m) map[m[1]] = parseInt(m[2], 16)
  }
  const curly = String.fromCharCode(0x2019)
  if (map[curly] !== undefined) map["'"] = map[curly]
  return map
}

/** Sum a string's in-game byte values (see readGen3Charmap). */
export function charmapHash(str, map) {
  let total = 0
  for (const ch of str) {
    if (map[ch] === undefined) throw new Error(`charmap has no entry for ${JSON.stringify(ch)} (in "${str}")`)
    total += map[ch]
  }
  return total
}

/**
 * src/data/trainer_parties.h. Ruby spells the level field `.level` and declares
 * the arrays non-static; Emerald/FRLG use `.lvl` and `static`.
 * Returns { <symbol>: [ { iv, lvl, species } ] }.
 */
export function readGen3Parties(file) {
  const text = read(file)
  const out = {}
  for (const [sym, block] of splitKeyedBlocks(text, /(?:static )?const struct \w+\s+(\w+)\[\]\s*=\s*\{/g)) {
    const mons = []
    const entry = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
    let m
    while ((m = entry.exec(block)) !== null) {
      const iv = m[1].match(/\.iv\s*=\s*(\d+)/)
      const lvl = m[1].match(/\.(?:lvl|level)\s*=\s*(\d+)/)
      const species = m[1].match(/\.species\s*=\s*SPECIES_([A-Z0-9_]+)/)
      if (iv && lvl && species) {
        mons.push({ iv: +iv[1], lvl: +lvl[1], species: species[1] })
      }
    }
    if (mons.length) out[sym] = mons
  }
  return out
}

/**
 * src/data/trainers.h (or trainers_en.h for Ruby). The array index is the
 * trainer ID, which is what the app's `rom_id` holds.
 * Returns [ { key, name, doubleBattle, female, partySymbol } ].
 */
export function readGen3Trainers(file) {
  const text = read(file)
  return splitKeyedBlocks(text, /\[TRAINER_([A-Z0-9_]+)\]\s*=\s*\{/g).map(([key, block]) => {
    const name = block.match(/\.trainerName\s*=\s*_\("([^"]*)"\)/)
    const music = block.match(/\.encounterMusic_gender\s*=\s*([^,\n]*)/)
    const party = block.match(/\.party\s*=\s*\w+\((\w+)\)/)
      || block.match(/\.party\s*=\s*\{\s*\.\w+\s*=\s*(\w+)\s*\}/)
    return {
      key,
      name: name ? name[1] : '',
      doubleBattle: /\.doubleBattle\s*=\s*TRUE/.test(block),
      female: /F_TRAINER_FEMALE/.test(music ? music[1] : ''),
      partySymbol: party ? party[1] : null,
    }
  })
}

// ─── Gen 4 ───────────────────────────────────────────────────────────────────

/**
 * Pull `NAME = value` constants out of a C header, whether they're written as
 * `#define NAME 5` or as enum members. Token-based so it copes with both the
 * hand-written headers and metang's generated ones.
 */
export function readConstants(file, prefix) {
  const out = {}
  for (const line of lines(file)) {
    const t = line.split(/[ ,=;\t]+/).filter(Boolean)
    if (t.length >= 3 && t[0] === '#define' && t[1].startsWith(prefix) && /^[0-9]+$/.test(t[2])) {
      if (!(t[1] in out)) out[t[1]] = parseInt(t[2], 10)
    } else if (t.length >= 2 && t[0].startsWith(prefix) && /^[0-9]+$/.test(t[1])) {
      if (!(t[0] in out)) out[t[0]] = parseInt(t[1], 10)
    }
  }
  return out
}

/** Slice out a C array literal body so a table can be scanned in isolation. */
function arrayBody(file, marker) {
  const text = read(file)
  const start = text.indexOf(marker)
  if (start < 0) throw new Error(`${marker} not found in ${file}`)
  return text.slice(start, text.indexOf('};', start))
}

/**
 * pokeplatinum's designated-initialiser gender table:
 *   [TRAINER_CLASS_LASS] = GENDER_FEMALE,
 * Returns { <CLASS>: true } for the female classes.
 */
export function readGenderTableByKey(file, marker) {
  const out = {}
  const re = /\[(TRAINER_CLASS_[A-Z0-9_]+)\]\s*=\s*GENDER_(\w+)/g
  let m
  while ((m = re.exec(arrayBody(file, marker))) !== null) out[m[1]] = m[2] === 'FEMALE'
  return out
}

/**
 * pokediamond / pokeheartgold write the same table positionally, labelling each
 * row with a trailing comment:
 *   TRAINER_FEMALE, // TRAINERCLASS_LASS
 *   /*TRAINER_CLASS_LASS* / 1,
 * Returns { <CLASS>: true } for the female classes.
 */
export function readGenderTableByComment(file, marker, { classPrefix }) {
  const out = {}
  for (const line of arrayBody(file, marker).split('\n')) {
    const cls = line.match(new RegExp(`${classPrefix}[A-Z0-9_]+`))
    if (!cls) continue
    // Either a named GENDER/TRAINER_FEMALE constant or a bare 1 in the value slot.
    const named = /TRAINER_(MALE|FEMALE)/.exec(line.replace(cls[0], ''))
    if (named) { out[cls[0]] = named[1] === 'FEMALE'; continue }
    const bare = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '').match(/(\d+)/)
    if (bare) out[cls[0]] = bare[1] === '1'
  }
  return out
}

/** pokeplatinum res/pokemon/<species>/data.json — base stats and gender ratio. */
export function readPlatinumSpecies(repo) {
  const root = path.join(repo, 'res/pokemon')
  const out = {}
  for (const dir of fs.readdirSync(root)) {
    const file = path.join(root, dir, 'data.json')
    if (!fs.existsSync(file)) continue
    const json = JSON.parse(read(file))
    if (json.base_stats) {
      out[dir] = { base_stats: json.base_stats, gender_ratio: json.gender_ratio }
    }
  }
  return out
}

/** pokeplatinum res/trainers/data/<name>.json, keyed by trainer ID. */
export function readPlatinumTrainers(repo, trainerIds) {
  const out = {}
  for (const [key, id] of Object.entries(trainerIds)) {
    const file = path.join(repo, 'res/trainers/data', `${key.replace('TRAINER_', '').toLowerCase()}.json`)
    if (fs.existsSync(file)) out[id] = { key, ...JSON.parse(read(file)) }
  }
  return out
}

/** pokediamond / pokeheartgold ship their trainer tables as one JSON array. */
export function readNdsTrainerJson(file, rootKey) {
  return JSON.parse(read(file))[rootKey]
}

/** GENDER_RATIO_* constant values, needed by HGSS's gender overrides. */
export const GENDER_RATIOS = {
  GENDER_RATIO_MALE_ONLY: 0,
  GENDER_RATIO_FEMALE_12_5: 31,
  GENDER_RATIO_FEMALE_25: 63,
  GENDER_RATIO_FEMALE_50: 127,
  GENDER_RATIO_FEMALE_75: 191,
  GENDER_RATIO_FEMALE_ONLY: 254,
  GENDER_RATIO_GENDERLESS: 255,
}
