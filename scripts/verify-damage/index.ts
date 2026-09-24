/**
 * verify:damage — differential check of the Solodex damage pipelines against
 * @smogon/calc, an independent implementation.
 *
 *   npm run verify:damage                # all Gen 1–5 games, sampled trainers
 *   npm run verify:damage -- --all       # every trainer Pokémon
 *   npm run verify:damage -- --game=Crystal --verbose
 *
 * A disagreement is a *finding*, not automatically a bug on our side: the
 * decomps are the ground truth, and Smogon simplifies in known places. Those
 * cases are listed in known-divergences.ts with the decomp citation that
 * explains them; the run fails only on divergences that are not listed.
 *
 * Run with vite-node so the renderer's TS modules and `@data` alias resolve.
 */
import { calculate, Generations, Pokemon, Move, Field as SField, toID } from '@smogon/calc'
import { GAME_TO_GEN, getTrainers, getPokemonData, getMoveData, isMajorTrainer, preloadAllData } from '@/data'
import type { PokemonData, TrainerPokemon } from '@/types/pokemon'
import { calcDamage, DEFAULT_FIELD, type BattlerState, type DamageResult, type Field, type Gen } from '@/utils/damage'
import { trainerMonToBattler, toBattler } from '@/utils/damage/matchup'
import { calcGen12Stats, calcGen3PlusStats, DEFAULT_GEN12_DVS, DEFAULT_GEN12_STATEXPS, DEFAULT_GEN3_IVS, DEFAULT_GEN3_EVS, NEUTRAL_NATURE } from '@/utils/damage/stats'
import { KNOWN_DIVERGENCES, type Divergence } from './known-divergences'

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string) => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const VERBOSE = flag('verbose')
const ALL = flag('all')
const ONLY_GAME = opt('game')

const GAMES = Object.entries(GAME_TO_GEN)
  .filter(([, g]) => parseInt(g) <= 5)
  .map(([game]) => game)
  .filter(game => !ONLY_GAME || game === ONLY_GAME)

/** Player roster per gen: species that exercise items, abilities and STAB. */
const ROSTER: Record<number, Array<{ species: string; item?: string; ability?: string }>> = {
  1: [{ species: 'Charizard' }, { species: 'Blastoise' }, { species: 'Venusaur' }, { species: 'Alakazam' }, { species: 'Snorlax' }, { species: 'Gengar' }],
  2: [{ species: 'Typhlosion' }, { species: 'Feraligatr' }, { species: 'Meganium' }, { species: 'Marowak', item: 'Thick Club' }, { species: 'Pikachu', item: 'Light Ball' }, { species: 'Scizor', item: 'Metal Coat' }],
  3: [{ species: 'Blaziken', ability: 'Blaze' }, { species: 'Swampert', ability: 'Torrent' }, { species: 'Sceptile', ability: 'Overgrow' }, { species: 'Azumarill', ability: 'Huge Power' }, { species: 'Medicham', ability: 'Pure Power', item: 'Choice Band' }, { species: 'Alakazam', item: 'Twisted Spoon' }],
  4: [{ species: 'Infernape', ability: 'Blaze' }, { species: 'Empoleon', ability: 'Torrent' }, { species: 'Torterra', ability: 'Overgrow' }, { species: 'Scizor', ability: 'Technician', item: 'Life Orb' }, { species: 'Garchomp', item: 'Expert Belt' }, { species: 'Gengar', item: 'Choice Specs' }],
  5: [{ species: 'Serperior' }, { species: 'Emboar', item: 'Life Orb' }, { species: 'Samurott', item: 'Mystic Water' }, { species: 'Excadrill', ability: 'Sand Force' }, { species: 'Haxorus', item: 'Choice Band' }, { species: 'Chandelure', ability: 'Flash Fire' }],
}

/**
 * Battle-state scenarios, run on major trainers only. Each mutates copies of
 * the two battlers / field before the comparison.
 */
interface Scenario {
  name: string
  apply: (a: BattlerState, d: BattlerState, f: Field) => void
}
const SCENARIOS: Scenario[] = [
  { name: 'plain', apply: () => {} },
  { name: 'reflect+lightscreen', apply: (_a, d) => { d.flags.reflect = true; d.flags.lightScreen = true } },
  { name: 'burned attacker', apply: a => { a.status = 'burn' } },
  { name: 'rain', apply: (_a, _d, f) => { f.weather = 'rain' } },
  { name: 'sun', apply: (_a, _d, f) => { f.weather = 'sun' } },
  { name: 'sand', apply: (_a, _d, f) => { f.weather = 'sand' } },
  // Gen 1 has a single Special stage: keep spattack/spdefense in step, as the UI does.
  { name: '+2 attack / -1 defense', apply: (a, d, f) => { a.stages.attack = 2; a.stages.spattack = 2; a.stages.spdefense = f.gen === 1 ? 2 : 0; d.stages.defense = -1; d.stages.spdefense = -1; d.stages.spattack = f.gen === 1 ? -1 : 0 } },
  { name: '-2 attack / +2 defense', apply: (a, d, f) => { a.stages.attack = -2; a.stages.spattack = -2; a.stages.spdefense = f.gen === 1 ? -2 : 0; d.stages.defense = 2; d.stages.spdefense = 2; d.stages.spattack = f.gen === 1 ? 2 : 0 } },
  { name: 'doubles spread', apply: (_a, _d, f) => { f.isDoubles = true; f.defendersAlive = 2; f.otherBattlersAlive = 3 } },
  { name: 'low hp attacker', apply: a => { a.currentHp = Math.max(1, Math.floor(a.stats.hp / 4)) } },
  { name: 'focus energy + scope lens', apply: a => { a.flags.focusEnergy = true; if (!a.item) a.item = 'scopelens' } },
]

interface Finding {
  scenario: string
  game: string
  attacker: string
  defender: string
  move: string
  crit: boolean
  ours: number[]
  theirs: number[]
  known?: Divergence
}

const findings: Finding[] = []
let compared = 0
let skipped = 0
const skippedReasons = new Map<string, number>()
const skip = (why: string) => { skipped++; skippedReasons.set(why, (skippedReasons.get(why) ?? 0) + 1) }

/** Species names that differ between our data and Smogon's. */
function smogonSpecies(gen: ReturnType<typeof Generations.get>, name: string): string | null {
  const direct = gen.species.get(toID(name))
  if (direct) return direct.name
  const m = name.match(/^(.+?) \((.+)\)$/)
  if (m) {
    const alt = gen.species.get(toID(`${m[1]}-${m[2]}`))
    if (alt) return alt.name
  }
  if (name === 'Nidoran♀') return 'Nidoran-F'
  if (name === 'Nidoran♂') return 'Nidoran-M'
  return null
}

function smogonMove(gen: ReturnType<typeof Generations.get>, name: string): string | null {
  return gen.moves.get(toID(name))?.name ?? null
}

// `calculate()` clones its inputs and the clone recomputes stats from IVs/EVs,
// which would discard the exact in-battle stats we set. Make clones keep them.
const origClone = Pokemon.prototype.clone
Pokemon.prototype.clone = function (this: Pokemon) {
  const c = origClone.call(this)
  c.rawStats = { ...this.rawStats }
  c.stats = { ...this.stats }
  c.originalCurHP = this.originalCurHP
  c.types = this.types
  c.weightkg = this.weightkg
  return c
}

/** Build a Smogon Pokemon mirroring one of our BattlerStates (stats forced). */
function toSmogon(gen: ReturnType<typeof Generations.get>, b: BattlerState): Pokemon | null {
  const name = smogonSpecies(gen, b.species)
  if (!name) return null
  const p = new Pokemon(gen, name, {
    level: b.level,
    item: b.item ? gen.items.get(b.item)?.name : undefined,
    ability: b.ability ? gen.abilities.get(b.ability)?.name : undefined,
    status: b.status === 'none' ? '' : b.status === 'burn' ? 'brn' : b.status === 'paralysis' ? 'par' : b.status === 'poison' ? 'psn' : b.status === 'toxic' ? 'tox' : b.status === 'sleep' ? 'slp' : 'frz',
    boosts: { atk: b.stages.attack, def: b.stages.defense, spa: b.stages.spattack, spd: b.stages.spdefense, spe: b.stages.speed },
  })
  p.types = [b.types[0], b.types[1]] as any
  if (b.types[0] === b.types[1]) p.types = [b.types[0]] as any
  const s = { hp: b.stats.hp, atk: b.stats.attack, def: b.stats.defense, spa: b.stats.spattack, spd: b.stats.spdefense, spe: b.stats.speed }
  p.rawStats = { ...s }
  p.stats = { ...s }
  p.originalCurHP = b.currentHp
  p.weightkg = b.weight
  if (p.gender === 'N') b.gender = 'N'
  return p
}

function compare(game: string, gen: Gen, a: BattlerState, d: BattlerState, moveName: string, field: Field, scenario = 'plain') {
  const md = getMoveData(moveName, game)
  if (!md) return skip('no move data')
  const sgen = Generations.get(gen)
  const sm = smogonMove(sgen, moveName)
  if (!sm) return skip('move unknown to Smogon')
  const sa = toSmogon(sgen, a), sd = toSmogon(sgen, d)
  if (!sa || !sd) return skip('species unknown to Smogon')
  const ours = calcDamage({ attacker: a, defender: d, moveName, moveData: md, field })
  if (ours.kind !== 'range' && ours.kind !== 'immune') return skip(`kind:${ours.kind}`)
  if (ours.hits && ours.hits.perHitPower) return skip('per-hit power move')
  if (ours.dist) return skip('random-power move')
  const sfield = new SField({
    gameType: field.isDoubles ? 'Doubles' : 'Singles',
    weather: field.weather === 'none' ? undefined : field.weather === 'sun' ? 'Sun' : field.weather === 'rain' ? 'Rain' : field.weather === 'sand' ? 'Sand' : 'Hail',
    defenderSide: { isReflect: !!d.flags.reflect, isLightScreen: !!d.flags.lightScreen },
    attackerSide: { isReflect: !!a.flags.reflect, isLightScreen: !!a.flags.lightScreen },
  })
  if (moveName === 'Hidden Power') return skip('Hidden Power (Smogon needs IV-typed move names)')
  if (moveName === 'Spit Up' || moveName === 'Trump Card' || moveName === 'Fling' || moveName === 'Natural Gift') return skip(`${moveName} (Smogon needs extra inputs)`)
  for (const crit of [false, true]) {
    if (crit && (!ours.crit || ours.critChance === 0)) continue
    let theirs: number[]
    try {
      const r = calculate(sgen, sa, sd, new Move(sgen, sm, { isCrit: crit }), sfield)
      const dmg = r.damage
      theirs = Array.isArray(dmg) ? (Array.isArray(dmg[0]) ? (dmg[0] as number[]) : (dmg as number[])) : [dmg as number]
    } catch (e) {
      skip(`smogon threw: ${(e as Error).message.slice(0, 40)}`)
      continue
    }
    const mine = crit ? ours.crit!.rolls : ours.rolls
    compared++
    // Compare the set of possible outcomes (Smogon pads a skipped Gen 1–2
    // random roll out to 39 identical values; we return one).
    const uniq = (xs: number[]) => [...new Set(xs)].sort((x, y) => x - y)
    const um = uniq(mine), ut = uniq(theirs)
    const same = um.length === ut.length && um.every((v, i) => v === ut[i])
    if (same) continue
    const f: Finding = { scenario, game, attacker: `${a.species} L${a.level}`, defender: `${d.species} L${d.level}`, move: moveName, crit, ours: mine, theirs }
    f.known = KNOWN_DIVERGENCES.find(k => k.matches({ game, gen, attacker: a, defender: d, move: moveName, crit, ours: mine, theirs, result: ours }))
    findings.push(f)
  }
}

function defaultMoves(data: PokemonData, level: number): string[] {
  const queue: string[] = []
  for (const [l, m] of data.level_up_learnset) {
    if (l > level) continue
    const i = queue.indexOf(m)
    if (i !== -1) queue.splice(i, 1)
    queue.push(m)
    if (queue.length > 4) queue.shift()
  }
  return queue
}

// Per-game tables load on demand in the app; pull them all in up front here.
await preloadAllData()

for (const game of GAMES) {
  const gen = parseInt(GAME_TO_GEN[game]) as Gen
  const field: Field = { ...DEFAULT_FIELD, game, gen }
  const trainers = getTrainers(game)
  const sample = ALL ? trainers : trainers.filter((t, i) => isMajorTrainer(t.name, t.trainer_class, game) || i % 7 === 0)
  let n = 0
  for (const t of sample) {
    for (const mon of t.party as TrainerPokemon[]) {
      const edata = getPokemonData(mon.species, game)
      if (!edata) { skip('enemy species missing'); continue }
      const enemy = trainerMonToBattler(mon, edata)
      const enemyMoves = (mon.moves.filter(Boolean) as string[]).length ? (mon.moves.filter(Boolean) as string[]) : defaultMoves(edata, mon.level)
      for (const r of ROSTER[gen]) {
        const pdata = getPokemonData(r.species, game)
        if (!pdata) continue
        const stats = gen <= 2
          ? calcGen12Stats(pdata.base_stats, mon.level, DEFAULT_GEN12_DVS, DEFAULT_GEN12_STATEXPS)
          : calcGen3PlusStats(pdata.base_stats, mon.level, DEFAULT_GEN3_IVS, DEFAULT_GEN3_EVS, NEUTRAL_NATURE, r.species)
        // Smogon defaults the ability to the species' first ability and the
        // gender to male; mirror that so only the arithmetic is compared.
        const player = toBattler({ species: r.species, data: pdata, level: mon.level, stats, item: r.item, ability: r.ability ?? (gen >= 3 ? pdata.abilities[0] : null), isPlayer: true, badges: new Set(), dvs: DEFAULT_GEN12_DVS, ivs: DEFAULT_GEN3_IVS, gender: 'M' })
        enemy.gender = 'M'
        const major = isMajorTrainer(t.name, t.trainer_class, game)
        for (const sc of major ? SCENARIOS : SCENARIOS.slice(0, 1)) {
          if (gen === 1 && /rain|sun|sand/.test(sc.name)) continue   // no weather in Gen 1
          const clone = (b: BattlerState): BattlerState => ({ ...b, stages: { ...b.stages }, flags: { ...b.flags }, counters: { ...b.counters } })
          const pa = clone(player), en = clone(enemy), f = { ...field }
          sc.apply(pa, en, f)
          for (const mv of defaultMoves(pdata, mon.level)) compare(game, gen, pa, en, mv, f, sc.name)
          const pa2 = clone(player), en2 = clone(enemy), f2 = { ...field }
          sc.apply(en2, pa2, f2)
          for (const mv of enemyMoves) compare(game, gen, en2, pa2, mv, f2, sc.name)
        }
        n++
      }
    }
  }
  const gameFindings = findings.filter(f => f.game === game)
  const unknown = gameFindings.filter(f => !f.known)
  console.log(`${unknown.length ? 'FAIL' : 'OK  '} ${game.padEnd(28)} ${String(n).padStart(5)} matchups, ${gameFindings.length} divergences (${unknown.length} unexplained)`)
}

console.log(`\n${compared} comparisons, ${skipped} skipped`)
if (VERBOSE) for (const [why, c] of skippedReasons) console.log(`  skipped ${c}: ${why}`)

const byKnown = new Map<string, number>()
for (const f of findings) if (f.known) byKnown.set(f.known.id, (byKnown.get(f.known.id) ?? 0) + 1)
if (byKnown.size) {
  console.log('\nKnown divergences (decomp-backed):')
  for (const [id, c] of byKnown) console.log(`  ${String(c).padStart(5)}  ${id} — ${KNOWN_DIVERGENCES.find(k => k.id === id)!.why}`)
}

const unknown = findings.filter(f => !f.known)
if (unknown.length) {
  console.log(`\nUnexplained divergences: ${unknown.length}`)
  const shown = VERBOSE ? unknown : unknown.slice(0, 25)
  for (const f of shown) {
    console.log(`  ${f.game} | ${f.attacker} ${f.move}${f.crit ? ' (crit)' : ''} → ${f.defender} [${f.scenario}]`)
    console.log(`      ours   ${f.ours[0]}–${f.ours[f.ours.length - 1]} (${f.ours.length})  theirs ${f.theirs[0]}–${f.theirs[f.theirs.length - 1]} (${f.theirs.length})`)
  }
  if (!VERBOSE && unknown.length > shown.length) console.log(`  … ${unknown.length - shown.length} more (--verbose)`)
  process.exit(1)
}
