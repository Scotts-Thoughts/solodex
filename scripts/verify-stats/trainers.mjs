/**
 * Recompute every trainer Pokémon's stats from the ROM's own party tables and
 * the way each game actually generates them, then compare against the `stats`
 * (and, from Gen 3, `nature` / `ability`) stored in data_objects-main/trainers.
 *
 * What each generation does — all read straight from the decomps:
 *
 *   Gen 1  Fixed DVs for every trainer mon: Atk 9 / Def 8 / Spd 8 / Spc 8
 *          (ATKDEFDV_TRAINER $98, SPDSPCDV_TRAINER $88). No Stat Exp.
 *   Gen 2  Fixed DVs per trainer *class* (data/trainers/dvs.asm). No Stat Exp.
 *   Gen 3  CreateNPCTrainerParty: IV = iv * 31 / 255 for all six stats, EVs 0,
 *          personality = 0x80 (double) / 0x78 (female) / 0x88 (male)
 *          + (nameHash << 8). nameHash is *not* reset between party slots — it
 *          keeps summing the trainer's name and each species name in turn.
 *   Gen 4  seed = ivScale + level + speciesId + trainerId, advance the LCRNG
 *          once per trainer-class index, personality = (rnd << 8) + 0x78/0x88.
 *          IV = (u8)(ivScale * 31 / 255); a byte of 32+ means random IVs rolled
 *          off the same RNG. HGSS also lets a party entry override the gender /
 *          ability bits of that 0x78/0x88 base, and the override sticks for the
 *          rest of the party.
 *   Gen 5  No decomp. Stats are only checked for consistency with the Gen 3+
 *          formula: does *some* uniform IV reproduce them for the stored nature?
 */
import path from 'path'
import { DECOMPS } from './config.mjs'
import {
  NATURES, calcGen12, calcGen3Plus, uniformIvs, lcrngNext, rollGen4RandomIvs,
} from './formulas.mjs'
import {
  readGen12BaseStats, readGen1Parties, readGen2TrainerDvs, readGen2Parties,
  readGen3BaseStats, readGen3SpeciesNames, readGen3Charmap, charmapHash,
  readGen3Parties, readGen3Trainers, readConstants, readGenderTableByKey,
  readGenderTableByComment, readPlatinumSpecies, readPlatinumTrainers,
  readNdsTrainerJson, GENDER_RATIOS,
} from './decomp.mjs'
import {
  loadAppTrainers, loadAppGamePokedex, speciesKey, Report,
} from './report.mjs'

const partySignature = party =>
  party.map(p => `${speciesKey(p.species)}L${p.level ?? p.lvl}`).join(',')

// ─── Gen 1 ───────────────────────────────────────────────────────────────────

const GEN1_TRAINER_DVS = { attack: 9, defense: 8, speed: 8, special: 8 }

async function verifyGen1(game, repo, appFile) {
  const report = new Report(`${game} trainers`)
  const groups = readGen1Parties(path.join(repo, 'data/trainers/parties.asm'))
  const groupsByKey = Object.fromEntries(Object.entries(groups).map(([k, v]) => [speciesKey(k), v]))
  const baseStats = readGen12BaseStats(path.join(repo, 'data/pokemon/base_stats'), { sixStats: false })
  const baseByKey = Object.fromEntries(Object.entries(baseStats).map(([k, v]) => [speciesKey(k), v]))
  const trainers = await loadAppTrainers(appFile)

  for (const [id, trainer] of Object.entries(trainers)) {
    const sig = partySignature(trainer.party)
    // rom_id is "<CLASS> <n>" with occasional suffixes ("RIVAL1 Squirtle 1",
    // "HIKER 11 Duplicate"), so try the class+index first and fall back to
    // finding an identical party anywhere.
    const m = id.match(/^(.*?)\s*(\d+)/)
    let group = m ? groupsByKey[speciesKey(m[1])] : null
    let party = m && group ? group[parseInt(m[2], 10) - 1] : null
    if (!party || partySignature(party) !== sig) {
      party = null
      for (const g of (group ? [group] : Object.values(groupsByKey))) {
        party = g.find(p => partySignature(p) === sig)
        if (party) break
      }
    }
    if (!party) { report.skip(`${id}: no matching ROM party`); continue }

    party.forEach((mon, slot) => {
      const base = baseByKey[speciesKey(mon.species)]
      const expected = calcGen12(base, mon.level, GEN1_TRAINER_DVS)
      report.compare(`${id} slot${slot} ${mon.species} L${mon.level}`, trainer.party[slot].stats, expected)
    })
  }
  return report
}

// ─── Gen 2 ───────────────────────────────────────────────────────────────────

/** App rom_id prefixes that don't spell the ROM class the same way. */
const GEN2_CLASS_ALIASES = {
  pkmntrainer: 'cal', lance: 'champion', blackbelt: 'blackbeltt', psychic: 'psychict',
}
const gen2ClassKey = name => {
  const k = speciesKey(name)
  return GEN2_CLASS_ALIASES[k] ?? k
}

async function verifyGen2(game, repo, appFile) {
  const report = new Report(`${game} trainers`)
  const dvsByClass = readGen2TrainerDvs(path.join(repo, 'data/trainers/dvs.asm'))
  const romTrainers = readGen2Parties(path.join(repo, 'data/trainers/parties.asm'))
  const baseStats = readGen12BaseStats(path.join(repo, 'data/pokemon/base_stats'), { sixStats: true })
  const baseByKey = Object.fromEntries(Object.entries(baseStats).map(([k, v]) => [speciesKey(k), v]))
  const trainers = await loadAppTrainers(appFile)

  const byClassIdx = {}
  for (const t of romTrainers) byClassIdx[`${gen2ClassKey(t.cls)}#${t.idx}`] = t

  for (const [id, trainer] of Object.entries(trainers)) {
    const m = id.match(/^(.*?)\s*(\d+)$/)
    if (!m) { report.skip(`${id}: unparseable rom_id`); continue }
    const cls = gen2ClassKey(m[1])
    const sig = partySignature(trainer.party)
    let rom = byClassIdx[`${cls}#${m[2]}`]
    // A couple of rematch entries are numbered differently from the ROM, so
    // fall back to the same class's trainer with an identical party.
    if (!rom || partySignature(rom.party) !== sig) {
      rom = romTrainers.find(t => gen2ClassKey(t.cls) === cls && partySignature(t.party) === sig) ?? rom
    }
    if (!rom) { report.skip(`${id}: no matching ROM trainer`); continue }
    const dvs = dvsByClass[rom.cls]
    if (!dvs) { report.skip(`${id}: no DV row for class ${rom.cls}`); continue }

    rom.party.forEach((mon, slot) => {
      if (!trainer.party[slot]) return
      const base = baseByKey[speciesKey(mon.species)]
      const expected = calcGen12(base, mon.level, dvs)
      report.compare(`${id} slot${slot} ${mon.species} L${mon.level}`, trainer.party[slot].stats, expected)
    })
  }
  return report
}

// ─── Gen 3 ───────────────────────────────────────────────────────────────────

async function verifyGen3(game, repo, appFile, files) {
  const report = new Report(`${game} trainers`)
  const charmap = readGen3Charmap(path.join(repo, 'charmap.txt'))
  const speciesNames = readGen3SpeciesNames(path.join(repo, files.speciesNames))
  const parties = readGen3Parties(path.join(repo, 'src/data/trainer_parties.h'))
  const romTrainers = readGen3Trainers(path.join(repo, files.trainers))
  const baseStats = readGen3BaseStats(path.join(repo, files.baseStats))
  const trainers = await loadAppTrainers(appFile)

  for (const [id, trainer] of Object.entries(trainers)) {
    if (!trainer.party.length) continue
    const rom = romTrainers[parseInt(trainer.rom_id, 10)]
    const party = rom?.partySymbol ? parties[rom.partySymbol] : null
    if (!party) { report.skip(`${id}: no ROM party`); continue }

    let nameHash = 0
    party.forEach((mon, slot) => {
      const app = trainer.party[slot]
      if (!app) return
      let personality = rom.doubleBattle ? 0x80 : rom.female ? 0x78 : 0x88
      nameHash += charmapHash(rom.name, charmap)
      nameHash += charmapHash(speciesNames[mon.species], charmap)
      personality += nameHash * 256
      const nature = personality % 25
      const iv = Math.floor(mon.iv * 31 / 255)
      const species = speciesNames[mon.species]
      const label = `${id} (${trainer.name}) slot${slot} ${species} L${mon.lvl}`

      report.compareValue(`${label} nature`, app.nature, nature)
      const expected = calcGen3Plus(baseStats[mon.species], mon.lvl, uniformIvs(iv), nature, undefined,
        mon.species === 'SHEDINJA' ? 'Shedinja' : null)
      report.compare(label, app.stats, expected)
    })
  }
  return report
}

// ─── Gen 4 ───────────────────────────────────────────────────────────────────

const OVERRIDE = {
  gender:  { TRPOKE_GENDER_OVERRIDE_OFF: 0, TRPOKE_GENDER_OVERRIDE_MALE: 1, TRPOKE_GENDER_OVERRIDE_FEMALE: 2 },
  ability: { TRPOKE_ABILITY_OVERRIDE_OFF: 0, TRPOKE_ABILITY_OVERRIDE_FIRST: 1, TRPOKE_ABILITY_OVERRIDE_SECOND: 2 },
}

/**
 * Run one Gen 4 game. `romTrainers` is { id: { class, party: [...] } } with each
 * party entry carrying species (SPECIES_*), level, ivScale and — for HGSS —
 * the gender/ability override names.
 */
async function verifyGen4(game, appFile, { romTrainers, classIds, speciesIds, femaleClasses, species, hgss }) {
  const report = new Report(`${game} trainers`)
  const trainers = await loadAppTrainers(appFile)
  const speciesEntry = name => species[name.replace('SPECIES_', '').toLowerCase()]

  for (const [id, trainer] of Object.entries(trainers)) {
    if (!trainer.party.length) continue
    const trainerId = parseInt(id, 10)
    const rom = romTrainers[trainerId]
    if (!rom?.party?.length) { report.skip(`${id}: no ROM party`); continue }
    const classId = classIds[rom.class]
    if (classId === undefined) { report.skip(`${id}: unknown class ${rom.class}`); continue }

    // pidGender is set once per trainer and, in HGSS, mutated in place by the
    // per-mon overrides — so it carries forward through the party.
    let pidGender = femaleClasses[rom.class] ? 0x78 : 0x88

    rom.party.forEach((mon, slot) => {
      const app = trainer.party[slot]
      if (!app) return
      const entry = speciesEntry(mon.species)
      const speciesId = speciesIds[mon.species]
      if (!entry || speciesId === undefined) { report.skip(`${id} slot${slot}: unknown ${mon.species}`); return }

      if (hgss) {
        const g = OVERRIDE.gender[mon.genderOverride] ?? 0
        const a = OVERRIDE.ability[mon.abilityOverride] ?? 0
        if (g) pidGender = GENDER_RATIOS[entry.gender_ratio] + (g === 1 ? 2 : -2)
        if (a === 1) pidGender &= ~1
        else if (a === 2) pidGender |= 1
      }

      let seed = (mon.ivScale + mon.level + speciesId + trainerId) >>> 0
      let rnd = seed
      for (let i = 0; i < classId; i++) { seed = lcrngNext(seed); rnd = seed >>> 16 }
      const personality = (rnd * 256 + pidGender) >>> 0
      const nature = personality % 25

      const ivByte = Math.floor(mon.ivScale * 31 / 255) & 0xFF
      const ivs = ivByte < 32 ? uniformIvs(ivByte) : rollGen4RandomIvs(seed, personality).ivs

      const speciesName = mon.species.replace('SPECIES_', '')
      const label = `${id} (${trainer.name}) slot${slot} ${speciesName} L${mon.level}`
      report.compareValue(`${label} nature`, app.nature, NATURES[nature])
      const expected = calcGen3Plus(entry.base_stats, mon.level, ivs, nature, undefined,
        speciesName === 'SHEDINJA' ? 'Shedinja' : null)
      report.compare(label, app.stats, expected)
    })
  }
  return report
}

function gen4Platinum() {
  const repo = DECOMPS.pokeplatinum
  const trainerIds = readConstants(path.join(repo, 'build/generated/trainers.h'), 'TRAINER_')
  const raw = readPlatinumTrainers(repo, trainerIds)
  const romTrainers = {}
  for (const [id, t] of Object.entries(raw)) {
    romTrainers[id] = {
      class: t.class,
      party: t.party.map(p => ({ species: p.species, level: p.level, ivScale: p.iv_scale })),
    }
  }
  return {
    romTrainers,
    classIds: readConstants(path.join(repo, 'build/generated/trainer_classes.h'), 'TRAINER_CLASS_'),
    speciesIds: readConstants(path.join(repo, 'build/generated/species.h'), 'SPECIES_'),
    femaleClasses: readGenderTableByKey(path.join(repo, 'include/data/trainer_class_genders.h'), 'sTrainerClassGender'),
    species: readPlatinumSpecies(repo),
  }
}

function gen4Diamond(species) {
  const repo = DECOMPS.pokediamond
  const list = readNdsTrainerJson(path.join(repo, 'files/poketool/trainer/trdata.json'), 'trdata')
  const romTrainers = list.map(t => ({
    class: t.class,
    party: (t.party ?? []).map(p => ({ species: p.species, level: p.level, ivScale: p.difficulty })),
  }))
  return {
    romTrainers,
    classIds: readConstants(path.join(repo, 'include/constants/trainer_classes.h'), 'TRAINER_CLASS_'),
    speciesIds: readConstants(path.join(repo, 'include/constants/species.h'), 'SPECIES_'),
    femaleClasses: readGenderTableByComment(path.join(repo, 'arm9/src/trainer_data.c'), 'sTrainerClassGenderCountTbl', { classPrefix: 'TRAINER_CLASS_' }),
    species,
  }
}

function gen4HeartGold(species) {
  const repo = DECOMPS.pokeheartgold
  const list = readNdsTrainerJson(path.join(repo, 'files/poketool/trainer/trainers.json'), 'trainers')
  const romTrainers = list.map(t => ({
    class: t.class,
    party: (t.party ?? []).map(p => ({
      species: p.species, level: p.level, ivScale: p.difficulty,
      genderOverride: p.genderOverride, abilityOverride: p.abilityOverride,
    })),
  }))
  return {
    romTrainers,
    classIds: readConstants(path.join(repo, 'include/constants/trainer_class.h'), 'TRAINERCLASS_'),
    speciesIds: readConstants(path.join(repo, 'include/constants/species.h'), 'SPECIES_'),
    femaleClasses: readGenderTableByComment(path.join(repo, 'src/trainer_data.c'), 'sTrainerGenders', { classPrefix: 'TRAINERCLASS_' }),
    species,
    hgss: true,
  }
}

// ─── Gen 5 (consistency only) ────────────────────────────────────────────────

async function verifyGen5Consistency(game, dexFile, appFile) {
  const report = new Report(`${game} trainers (formula consistency)`)
  const dex = await loadAppGamePokedex(dexFile)
  const trainers = await loadAppTrainers(appFile)

  for (const [id, trainer] of Object.entries(trainers)) {
    trainer.party.forEach((mon, slot) => {
      const nature = typeof mon.nature === 'number' ? mon.nature : NATURES.indexOf(mon.nature)
      const label = `${id} (${trainer.name}) slot${slot} ${mon.species} L${mon.level}`
      if (nature < 0) { report.skip(`${label}: unknown nature ${mon.nature}`); return }
      // The trainer file names alternate forms by their base species, so accept
      // any form of that species as a match. It also writes Farfetch'd with an
      // ASCII apostrophe where the pokedex file uses the curly one.
      const name = mon.species in dex ? mon.species : mon.species.replace("'", '’')
      const forms = Object.keys(dex).filter(k => k === name || k.startsWith(`${name} (`))
      if (!forms.length) { report.skip(`${label}: not in pokedex`); return }

      report.checked++
      const reproduced = forms.some(form => {
        for (let iv = 0; iv <= 31; iv++) {
          const c = calcGen3Plus(dex[form].base_stats, mon.level, uniformIvs(iv), nature, undefined,
            mon.species === 'Shedinja' ? 'Shedinja' : null)
          if (Object.keys(c).every(k => c[k] === mon.stats[k])) return true
        }
        return false
      })
      if (!reproduced) report.mismatches.push(`${label} ${NATURES[nature]}: no uniform IV reproduces ${JSON.stringify(mon.stats)}`)
    })
  }
  return report
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function verifyTrainers() {
  const reports = []
  reports.push(await verifyGen1('Red and Blue', DECOMPS.pokered, 'red_blue'))
  reports.push(await verifyGen1('Yellow', DECOMPS.pokeyellow, 'yellow'))
  reports.push(await verifyGen2('Gold and Silver', DECOMPS.pokegold, 'gold_silver'))
  reports.push(await verifyGen2('Crystal', DECOMPS.pokecrystal, 'crystal'))

  const rubyFiles = {
    trainers: 'src/data/trainers_en.h',
    speciesNames: 'src/data/text/species_names_en.h',
    baseStats: 'src/data/pokemon/base_stats.h',
  }
  const gbaFiles = {
    trainers: 'src/data/trainers.h',
    speciesNames: 'src/data/text/species_names.h',
    baseStats: 'src/data/pokemon/species_info.h',
  }
  // ruby.js and sapphire.js are byte-for-byte the same party data (the ROMs
  // share one trainer table), so the Ruby decomp covers both.
  reports.push(await verifyGen3('Ruby', DECOMPS.pokeruby, 'ruby', rubyFiles))
  reports.push(await verifyGen3('Sapphire', DECOMPS.pokeruby, 'sapphire', rubyFiles))
  reports.push(await verifyGen3('Emerald', DECOMPS.pokeemerald, 'emerald', gbaFiles))
  reports.push(await verifyGen3('FireRed and LeafGreen', DECOMPS.pokefirered, 'firered_leafgreen', gbaFiles))

  const platinum = gen4Platinum()
  reports.push(await verifyGen4('Diamond and Pearl', 'diamond_pearl', gen4Diamond(platinum.species)))
  reports.push(await verifyGen4('Platinum', 'platinum', platinum))
  reports.push(await verifyGen4('HeartGold and SoulSilver', 'heartgold_soulsilver', gen4HeartGold(platinum.species)))

  reports.push(await verifyGen5Consistency('Black and White', 'black_white', 'black_white'))
  reports.push(await verifyGen5Consistency('Black 2 and White 2', 'black2_white2', 'black2_white2'))
  return reports
}
