/**
 * Hand-computed vectors and order-of-operations sentinels for each gen.
 * Every expected value was worked by hand from the cited rule in
 * docs/damage/gen{N}_damage_reference.md.
 *
 * Common vector: L50, power 90, Atk 100 vs Def 80, STAB, ×2 effective.
 *   q1 = floor(100/5)+2 = 22 ; floor(22·90·100/80) = 2475 ; /50 = 49 ; +2 = 51
 */
import { describe, it, expect } from 'vitest'
import { calc, mon, move, field } from './helpers'
import { applyMod, chainMods } from '../math'
import { walkTypeChart, GEN1_TYPE_ROWS, gen234Rows } from '../typechart'
import { gen2GlacierBoostsSpDef } from '../badges'

const fighting = move({ move: 'Test Move', type: 'Fighting' })

describe('shared vector: STAB + 2× on base 51', () => {
  it('Gen 1: STAB d+d/2 → type → random 217..255', () => {
    const r = calc(1, { attacker: mon({ types: ['Fighting', 'Fighting'] }), defender: mon({ types: ['Rock', 'Rock'] }), moveData: fighting })
    // 51 → STAB 76 → ×2 152 → min floor(152·217/255)=129
    expect(r.max).toBe(152)
    expect(r.min).toBe(129)
    expect(r.rolls.length).toBe(39)
  })
  it('Gen 2: same, but Fighting vs Rock walks the Gen 2 table', () => {
    const r = calc(2, { attacker: mon({ types: ['Fighting', 'Fighting'] }), defender: mon({ types: ['Rock', 'Rock'] }), moveData: fighting })
    expect(r.max).toBe(152)
    expect(r.min).toBe(129)
  })
  it('Gen 3: random last → min 129', () => {
    const r = calc(3, { attacker: mon({ types: ['Fighting', 'Fighting'] }), defender: mon({ types: ['Rock', 'Rock'] }), moveData: fighting })
    expect(r.max).toBe(152)
    expect(r.min).toBe(129)
    expect(r.rolls.length).toBe(16)
  })
  it('Gen 4: random BEFORE STAB/type → min 128 (G4 #18–#20)', () => {
    const r = calc(4, { attacker: mon({ types: ['Fighting', 'Fighting'] }), defender: mon({ types: ['Rock', 'Rock'] }), moveData: fighting })
    // 51·85/100 = 43 → STAB 64 → ×2 128
    expect(r.max).toBe(152)
    expect(r.min).toBe(128)
  })
  it('Gen 5: random → STAB applyMod (round half down) → shift → min 128', () => {
    const r = calc(5, { attacker: mon({ types: ['Fighting', 'Fighting'] }), defender: mon({ types: ['Rock', 'Rock'] }), moveData: fighting })
    // 43 → applyMod(43,0x1800): 43·6144 = 264192 = 64·4096 + 2048 → remainder exactly 2048 → 64 → ×2 = 128
    expect(r.max).toBe(152)
    expect(r.min).toBe(128)
  })
})

describe('Gen 1 specifics', () => {
  it('caps q3 at 997 before +2 (G1 #9)', () => {
    const r = calc(1, { attacker: mon({ level: 100, atk: 255, types: ['Normal', 'Normal'] }), defender: mon({ def: 1 }), moveData: move({ power: 250 }) })
    // q1 = 42; 42·250·255/1 = 2677500 /50 = 53550 → cap 997 → 999 → STAB 1498
    expect(r.max).toBe(1498)
  })
  it('scales both stats by 4 when either ≥ 256 (G1 #7)', () => {
    // Atk 300, Def 100 → both >>2: 75 vs 25; q1 = 22; 22·90·75/25 = 5940/50 = 118 → 120
    const r = calc(1, { attacker: mon({ atk: 300, types: ['Fire', 'Fire'] }), defender: mon({ def: 100, types: ['Fire', 'Fire'] }) })
    expect(r.max).toBe(120)
  })
  it('Reflect doubling feeds the ≥256 test (G1 §1.2)', () => {
    // Def 130 → 260 with Reflect → scale: atk 100>>2 = 25, def 65. 22·90·25/65 = 761 /50 = 15 → 17
    const r = calc(1, { attacker: mon({ types: ['Fire', 'Fire'] }), defender: mon({ def: 130, types: ['Fire', 'Fire'], flags: { reflect: true } }) })
    expect(r.max).toBe(17)
  })
  it('crit doubles level and ignores stages, badges, screens (G1 #6)', () => {
    const r = calc(1, {
      attacker: mon({ types: ['Fire', 'Fire'], stages: { attack: 6 } as any }),
      defender: mon({ types: ['Fire', 'Fire'], flags: { reflect: true } }),
    })
    // non-crit: atk 400 → both>>2: 100 vs (80·2=160)>>2=40 → 22·90·100/40 = 4950/50 = 99 → 101
    expect(r.max).toBe(101)
    // crit: L=100 → q1 = 42; 42·90·100/80 = 4725 /50 = 94 → 96
    expect(r.crit?.max).toBe(96)
  })
  it('type chart: damage truncating to 0 is "doesn\'t affect" (G1 §1.6)', () => {
    const r = walkTypeChart(1, 'Fire', ['Water', 'Water'], GEN1_TYPE_ROWS, false)
    expect(r.damage).toBe(0)
  })
  it('fixed damage ignores type (G1 #15)', () => {
    const r = calc(1, { attacker: mon(), defender: mon({ types: ['Ghost', 'Ghost'] }), moveData: move({ move: 'Seismic Toss', type: 'Fighting', power: null, effect: 'level_based_damage' }) })
    expect(r.kind).toBe('fixed')
    expect(r.max).toBe(50)
  })
  it('crit chance from base Speed, Focus Energy bug', () => {
    const fast = mon({ baseStats: { hp: 1, attack: 1, defense: 1, special_attack: 1, special_defense: 1, speed: 100 } })
    expect(calc(1, { attacker: fast }).critChance).toBeCloseTo(50 / 256)
    expect(calc(1, { attacker: { ...fast, flags: { focusEnergy: true } } }).critChance).toBeCloseTo(12 / 256)
    expect(calc(1, { attacker: fast, moveData: move({ move: 'Slash', power: 70 }) }).critChance).toBeCloseTo(255 / 256)
  })
})

describe('Gen 2 specifics', () => {
  it('type item ×110/100 is applied before +2 (G2 #14, #16)', () => {
    // 49 → floor(49·110/100) = 53 → +2 = 55 (item after +2 would give 56)
    const r = calc(2, { attacker: mon({ item: 'silkscarf', types: ['Fire', 'Fire'] }), defender: mon() })
    expect(r.max).toBe(51) // Silk Scarf doesn't exist in Gen 2 → no boost
    const r2 = calc(2, { attacker: mon({ item: 'pinkbow', types: ['Fire', 'Fire'] }), defender: mon() })
    expect(r2.max).toBe(55)
  })
  it('crit ×2 happens before the 997 cap (G2 #15–#16)', () => {
    const r = calc(2, { attacker: mon({ level: 100, atk: 255, types: ['Fire', 'Fire'] }), defender: mon({ def: 1 }), moveData: move({ power: 250 }) })
    expect(r.max).toBe(999)
    expect(r.crit?.max).toBe(999)
  })
  it('badge type boost adds max(1, D>>3) before STAB (G2 #19)', () => {
    // D=51 → +6 = 57 → STAB 57+28 = 85
    const a = mon({ types: ['Normal', 'Normal'], badges: new Set(['plain']), isPlayer: true })
    const r = calc(2, { attacker: a, defender: mon() })
    expect(r.max).toBe(85)
  })
  it('random roll skipped when D ≤ 1 (G2 #22)', () => {
    const r = calc(2, { attacker: mon({ level: 1, atk: 5 }), defender: mon({ def: 200, types: ['Rock', 'Steel'] }), moveData: move({ power: 10 }) })
    expect(r.min).toBeGreaterThanOrEqual(1)
  })
  it('crit uses raw stats only when attacker stage ≤ defender stage (G2 #6)', () => {
    const boosted = mon({ stages: { attack: 2 } as any, types: ['Fire', 'Fire'] })
    const r = calc(2, { attacker: boosted, defender: mon() })
    // non-crit: atk 200 → 22·90·200/80 = 4950/50 = 99 → 101
    expect(r.max).toBe(101)
    // crit with +2 vs +0: stages KEPT → 99·2 = 198 → 200
    expect(r.crit?.max).toBe(200)
    const r2 = calc(2, { attacker: boosted, defender: mon({ stages: { defense: 2 } as any }) })
    // crit with +2 vs +2: raw stats → 49·2 = 98 → 100
    expect(r2.crit?.max).toBe(100)
  })
  it('Gold/Silver single-pass truncation wraps ≥1024 (G2 §8.1)', () => {
    const a = mon({ species: 'Marowak', item: 'thickclub', atk: 600 })
    const crystal = calc(2, { attacker: a, defender: mon(), field: field(2, { game: 'Crystal' }) })
    const gs = calc(2, { attacker: a, defender: mon(), field: field(2, { game: 'Gold and Silver' }) })
    // atk 1200: Crystal → 300/20 → 75/5 ; G/S → 300&255=44, 20
    expect(crystal.max).not.toBe(gs.max)
    expect(gs.notes.join()).toMatch(/low byte/)
  })
  it('Glacier Sp. Def bug register trace', () => {
    expect(gen2GlacierBoostsSpDef(205)).toBe(false)
    expect(gen2GlacierBoostsSpDef(206)).toBe(true)
    expect(gen2GlacierBoostsSpDef(432)).toBe(true)
    expect(gen2GlacierBoostsSpDef(433)).toBe(false)
  })
  it('Flail: no crit, no random (G2 #30)', () => {
    const r = calc(2, { attacker: mon({ currentHp: 1, hp: 150 }), defender: mon(), moveData: move({ move: 'Flail', power: null, effect: 'reversal' }) })
    expect(r.power).toBe(200)
    expect(r.rolls.length).toBe(1)
    expect(r.crit).toBeUndefined()
  })
})

describe('Gen 3 specifics', () => {
  it('type item multiplies the stat (G3 #2.3)', () => {
    // Atk 110: (110·90)·22 / 80 = 2722 /50 = 54 → 56
    const r = calc(3, { attacker: mon({ item: 'silkscarf', types: ['Fire', 'Fire'] }), defender: mon() })
    expect(r.max).toBe(56)
  })
  it('burn halves damage before +2, Guts cancels (G3 #6)', () => {
    const r = calc(3, { attacker: mon({ status: 'burn', types: ['Fire', 'Fire'] }), defender: mon() })
    expect(r.max).toBe(26) // 49/2 = 24 → 26
    const g = calc(3, { attacker: mon({ status: 'burn', ability: 'guts', types: ['Fire', 'Fire'] }), defender: mon() })
    // Guts atk 150: (150·90)·22/80 = 3712 /50 = 74 → 76
    expect(g.max).toBe(76)
  })
  it('Reflect ÷2 in singles, 2·(x/3) in doubles (G3 #7)', () => {
    const s = calc(3, { attacker: mon({ types: ['Fire', 'Fire'] }), defender: mon({ flags: { reflect: true } }) })
    expect(s.max).toBe(26)
    const dbl = calc(3, { attacker: mon({ types: ['Fire', 'Fire'] }), defender: mon({ flags: { reflect: true } }), field: field(3, { isDoubles: true, defendersAlive: 2 }) })
    expect(dbl.max).toBe(34) // 2·(49/3) = 32 → 34
  })
  it('Struggle skips STAB and type chart (G3 #15)', () => {
    const r = calc(3, { attacker: mon(), defender: mon({ types: ['Ghost', 'Ghost'] }), moveData: move({ move: 'Struggle', power: 50, effect: 'half_recoil_on_hit' }) })
    expect(r.kind).toBe('range')
    expect(r.stab).toBe(false)
    expect(r.max).toBeGreaterThan(0)
  })
  it('crit ignores negative attack / positive defense stages only', () => {
    const r = calc(3, { attacker: mon({ stages: { attack: -2 } as any, types: ['Fire', 'Fire'] }), defender: mon({ stages: { defense: 2 } as any }) })
    expect(r.crit?.max).toBe(102) // raw 49+2 = 51 ×2
  })
})

describe('Gen 4 specifics', () => {
  it('type chart Divide never returns 0 (G4 #20)', () => {
    const r = calc(4, { attacker: mon({ level: 1, atk: 5, types: ['Fire', 'Fire'] }), defender: mon({ def: 250, types: ['Rock', 'Fire'] }), moveData: move({ power: 10, type: 'Fire' }) })
    expect(r.min).toBeGreaterThanOrEqual(1)
  })
  it('Life Orb before random, Expert Belt after type (G4 #17, #23)', () => {
    const lo = calc(4, { attacker: mon({ item: 'lifeorb', types: ['Fire', 'Fire'] }), defender: mon() })
    // 51·130/100 = 66 → max 66, min 66·85/100 = 56
    expect(lo.max).toBe(66)
    expect(lo.min).toBe(56)
    const eb = calc(4, { attacker: mon({ item: 'expertbelt', types: ['Fire', 'Fire'] }), defender: mon({ types: ['Rock', 'Rock'] }), moveData: fighting })
    // 51 → ×2 = 102 → ×120/100 = 122
    expect(eb.max).toBe(122)
  })
  it('type item multiplies power ×120/100 (G4 #4)', () => {
    // power 108: 100·108·22/80 = 2970 /50 = 59 → 61
    const r = calc(4, { attacker: mon({ item: 'silkscarf', types: ['Fire', 'Fire'] }), defender: mon() })
    expect(r.max).toBe(61)
  })
  it('Sniper crit ×3', () => {
    const r = calc(4, { attacker: mon({ ability: 'sniper', types: ['Fire', 'Fire'] }), defender: mon() })
    expect(r.crit?.max).toBe(153)
  })
})

describe('Gen 5 specifics', () => {
  it('applyMod rounds half down, chainMods rounds half up', () => {
    expect(applyMod(43, 0x1800)).toBe(64)   // 64.5 → 64
    expect(applyMod(45, 0x1800)).toBe(67)
    expect(chainMods([0x1800, 0x1800], 41, 131072)).toBe(0x2400)
  })
  it('burn halves final damage, not the stat (G5 #13)', () => {
    const r = calc(5, { attacker: mon({ status: 'burn', types: ['Fire', 'Fire'] }), defender: mon() })
    expect(r.max).toBe(25) // floor(51/2)
  })
  it('Reflect is a final modifier; 1 damage can become 0 (G5 §9)', () => {
    const r = calc(5, { attacker: mon({ level: 1, atk: 5, types: ['Fire', 'Fire'] }), defender: mon({ def: 250, flags: { reflect: true } }), moveData: move({ power: 10 }) })
    expect(r.min).toBe(0)
    expect(r.notes.join()).toMatch(/Damage of 0/)
  })
  it('Explosion no longer halves Defense (G5 #19)', () => {
    const g4 = calc(4, { attacker: mon({ types: ['Fire', 'Fire'] }), defender: mon(), moveData: move({ move: 'Explosion', power: 250, effect: 'self_destruct' }) })
    const g5 = calc(5, { attacker: mon({ types: ['Fire', 'Fire'] }), defender: mon(), moveData: move({ move: 'Explosion', power: 250, effect: 'self_destruct' }) })
    expect(g4.max).toBeGreaterThan(g5.max)
  })
  it('multi-hit distribution 35/35/15/15', () => {
    const r = calc(5, { attacker: mon(), defender: mon(), moveData: move({ move: 'Fury Attack', power: 15, effect: 'two_to_five_hits' }) })
    expect(r.hits?.distribution).toEqual([[2, 0.35], [3, 0.35], [4, 0.15], [5, 0.15]])
  })
})

describe('type chart order', () => {
  it('Gen 2–4 rows are applied in ROM order with per-row truncation', () => {
    // Fire vs Grass/Water: rows Fire→Water (5) then Fire→Grass (20) — file order: Fire,Water precedes Fire,Grass
    const r = walkTypeChart(5, 'Fire', ['Grass', 'Water'], gen234Rows(), true)
    // 5 → ×5/10 = 2 → ×20/10 = 4
    expect(r.damage).toBe(4)
    expect(r.effectiveness).toBe(1)
  })
  it('Foresight drops the Ghost immunity rows', () => {
    expect(walkTypeChart(10, 'Normal', ['Ghost', 'Ghost'], gen234Rows(), true).immune).toBe(true)
    expect(walkTypeChart(10, 'Normal', ['Ghost', 'Ghost'], gen234Rows({ identified: true }), true).immune).toBe(false)
  })
})
