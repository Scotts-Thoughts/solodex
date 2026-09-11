/**
 * Ordered type-effectiveness tables.
 *
 * Gen 1–4 walk their table top to bottom and apply every matching row as a
 * separate truncating `floor(d * m / 10)` step, so ROW ORDER MATTERS for
 * rounding (½ then ×2 is not ×2 then ½ on odd damage). These tables are the
 * ROM tables verbatim, in ROM order:
 *
 *   Gen 1    pokered data/types/type_matchups.asm (incl. Ghost→Psychic = 0)
 *   Gen 2–4  pokecrystal data/types/type_matchups.asm — pokeemerald
 *            src/battle_main.c gTypeEffectiveness and pokeplatinum
 *            src/battle/battle_lib.c sTypeMatchupMultipliers are the same
 *            rows in the same order (verified by diff); the two
 *            Normal/Fighting→Ghost immunity rows sit after a Foresight
 *            sentinel at the end.
 *   Gen 5    same matchups, but applied as one combined bit shift, so order
 *            is irrelevant — `gen5Effectiveness` returns the product.
 *
 * Multipliers are ROM units: 20 = ×2, 5 = ×½, 0 = immune.
 */

export type TypeRow = [attackType: string, defendType: string, mult: number]

export const GEN1_TYPE_ROWS: TypeRow[] = [
  ['Water', 'Fire', 20],
  ['Fire', 'Grass', 20],
  ['Fire', 'Ice', 20],
  ['Grass', 'Water', 20],
  ['Electric', 'Water', 20],
  ['Water', 'Rock', 20],
  ['Ground', 'Flying', 0],
  ['Water', 'Water', 5],
  ['Fire', 'Fire', 5],
  ['Electric', 'Electric', 5],
  ['Ice', 'Ice', 5],
  ['Grass', 'Grass', 5],
  ['Psychic', 'Psychic', 5],
  ['Fire', 'Water', 5],
  ['Grass', 'Fire', 5],
  ['Water', 'Grass', 5],
  ['Electric', 'Grass', 5],
  ['Normal', 'Rock', 5],
  ['Normal', 'Ghost', 0],
  ['Ghost', 'Ghost', 20],
  ['Fire', 'Bug', 20],
  ['Fire', 'Rock', 5],
  ['Water', 'Ground', 20],
  ['Electric', 'Ground', 0],
  ['Electric', 'Flying', 20],
  ['Grass', 'Ground', 20],
  ['Grass', 'Bug', 5],
  ['Grass', 'Poison', 5],
  ['Grass', 'Rock', 20],
  ['Grass', 'Flying', 5],
  ['Ice', 'Water', 5],
  ['Ice', 'Grass', 20],
  ['Ice', 'Ground', 20],
  ['Ice', 'Flying', 20],
  ['Fighting', 'Normal', 20],
  ['Fighting', 'Poison', 5],
  ['Fighting', 'Flying', 5],
  ['Fighting', 'Psychic', 5],
  ['Fighting', 'Bug', 5],
  ['Fighting', 'Rock', 20],
  ['Fighting', 'Ice', 20],
  ['Fighting', 'Ghost', 0],
  ['Poison', 'Grass', 20],
  ['Poison', 'Poison', 5],
  ['Poison', 'Ground', 5],
  ['Poison', 'Bug', 20],
  ['Poison', 'Rock', 5],
  ['Poison', 'Ghost', 5],
  ['Ground', 'Fire', 20],
  ['Ground', 'Electric', 20],
  ['Ground', 'Grass', 5],
  ['Ground', 'Bug', 5],
  ['Ground', 'Rock', 20],
  ['Ground', 'Poison', 20],
  ['Flying', 'Electric', 5],
  ['Flying', 'Fighting', 20],
  ['Flying', 'Bug', 20],
  ['Flying', 'Grass', 20],
  ['Flying', 'Rock', 5],
  ['Psychic', 'Fighting', 20],
  ['Psychic', 'Poison', 20],
  ['Bug', 'Fire', 5],
  ['Bug', 'Grass', 20],
  ['Bug', 'Fighting', 5],
  ['Bug', 'Flying', 5],
  ['Bug', 'Psychic', 20],
  ['Bug', 'Ghost', 5],
  ['Bug', 'Poison', 20],
  ['Rock', 'Fire', 20],
  ['Rock', 'Fighting', 5],
  ['Rock', 'Ground', 5],
  ['Rock', 'Flying', 20],
  ['Rock', 'Bug', 20],
  ['Rock', 'Ice', 20],
  ['Ghost', 'Normal', 0],
  ['Ghost', 'Psychic', 0],
  ['Fire', 'Dragon', 5],
  ['Water', 'Dragon', 5],
  ['Electric', 'Dragon', 5],
  ['Grass', 'Dragon', 5],
  ['Ice', 'Dragon', 20],
  ['Dragon', 'Dragon', 20],
]

/** Main body (Gen 2–4). */
export const GEN234_TYPE_ROWS: TypeRow[] = [
  ['Normal', 'Rock', 5],
  ['Normal', 'Steel', 5],
  ['Fire', 'Fire', 5],
  ['Fire', 'Water', 5],
  ['Fire', 'Grass', 20],
  ['Fire', 'Ice', 20],
  ['Fire', 'Bug', 20],
  ['Fire', 'Rock', 5],
  ['Fire', 'Dragon', 5],
  ['Fire', 'Steel', 20],
  ['Water', 'Fire', 20],
  ['Water', 'Water', 5],
  ['Water', 'Grass', 5],
  ['Water', 'Ground', 20],
  ['Water', 'Rock', 20],
  ['Water', 'Dragon', 5],
  ['Electric', 'Water', 20],
  ['Electric', 'Electric', 5],
  ['Electric', 'Grass', 5],
  ['Electric', 'Ground', 0],
  ['Electric', 'Flying', 20],
  ['Electric', 'Dragon', 5],
  ['Grass', 'Fire', 5],
  ['Grass', 'Water', 20],
  ['Grass', 'Grass', 5],
  ['Grass', 'Poison', 5],
  ['Grass', 'Ground', 20],
  ['Grass', 'Flying', 5],
  ['Grass', 'Bug', 5],
  ['Grass', 'Rock', 20],
  ['Grass', 'Dragon', 5],
  ['Grass', 'Steel', 5],
  ['Ice', 'Water', 5],
  ['Ice', 'Grass', 20],
  ['Ice', 'Ice', 5],
  ['Ice', 'Ground', 20],
  ['Ice', 'Flying', 20],
  ['Ice', 'Dragon', 20],
  ['Ice', 'Steel', 5],
  ['Ice', 'Fire', 5],
  ['Fighting', 'Normal', 20],
  ['Fighting', 'Ice', 20],
  ['Fighting', 'Poison', 5],
  ['Fighting', 'Flying', 5],
  ['Fighting', 'Psychic', 5],
  ['Fighting', 'Bug', 5],
  ['Fighting', 'Rock', 20],
  ['Fighting', 'Dark', 20],
  ['Fighting', 'Steel', 20],
  ['Poison', 'Grass', 20],
  ['Poison', 'Poison', 5],
  ['Poison', 'Ground', 5],
  ['Poison', 'Rock', 5],
  ['Poison', 'Ghost', 5],
  ['Poison', 'Steel', 0],
  ['Ground', 'Fire', 20],
  ['Ground', 'Electric', 20],
  ['Ground', 'Grass', 5],
  ['Ground', 'Poison', 20],
  ['Ground', 'Flying', 0],
  ['Ground', 'Bug', 5],
  ['Ground', 'Rock', 20],
  ['Ground', 'Steel', 20],
  ['Flying', 'Electric', 5],
  ['Flying', 'Grass', 20],
  ['Flying', 'Fighting', 20],
  ['Flying', 'Bug', 20],
  ['Flying', 'Rock', 5],
  ['Flying', 'Steel', 5],
  ['Psychic', 'Fighting', 20],
  ['Psychic', 'Poison', 20],
  ['Psychic', 'Psychic', 5],
  ['Psychic', 'Dark', 0],
  ['Psychic', 'Steel', 5],
  ['Bug', 'Fire', 5],
  ['Bug', 'Grass', 20],
  ['Bug', 'Fighting', 5],
  ['Bug', 'Poison', 5],
  ['Bug', 'Flying', 5],
  ['Bug', 'Psychic', 20],
  ['Bug', 'Ghost', 5],
  ['Bug', 'Dark', 20],
  ['Bug', 'Steel', 5],
  ['Rock', 'Fire', 20],
  ['Rock', 'Ice', 20],
  ['Rock', 'Fighting', 5],
  ['Rock', 'Ground', 5],
  ['Rock', 'Flying', 20],
  ['Rock', 'Bug', 20],
  ['Rock', 'Steel', 5],
  ['Ghost', 'Normal', 0],
  ['Ghost', 'Psychic', 20],
  ['Ghost', 'Dark', 5],
  ['Ghost', 'Steel', 5],
  ['Ghost', 'Ghost', 20],
  ['Dragon', 'Dragon', 20],
  ['Dragon', 'Steel', 5],
  ['Dark', 'Fighting', 5],
  ['Dark', 'Psychic', 20],
  ['Dark', 'Ghost', 20],
  ['Dark', 'Dark', 5],
  ['Dark', 'Steel', 5],
  ['Steel', 'Fire', 5],
  ['Steel', 'Water', 5],
  ['Steel', 'Electric', 5],
  ['Steel', 'Ice', 20],
  ['Steel', 'Rock', 20],
  ['Steel', 'Steel', 5],
]

/** Rows after the Foresight sentinel — skipped when the target is identified. */
export const GHOST_IMMUNITY_ROWS: TypeRow[] = [
  ['Normal', 'Ghost', 0],
  ['Fighting', 'Ghost', 0],
]

export interface TypeChartOptions {
  /** Target Foresighted / Odor Sleuthed: skip the Normal/Fighting→Ghost rows (Gen 2+). */
  identified?: boolean
  /** Gen 4+: Miracle Eye drops Psychic→Dark immunity. */
  miracleEyed?: boolean
  /** Gen 4+: grounded target (Ingrain/Gravity/Iron Ball): drop Ground→Flying immunity. */
  grounded?: boolean
  /** Gen 4+: Roost drops every Flying-type entry for the turn. */
  roosted?: boolean
  /** Gen 4+: Scrappy attacker: drop Ghost immunities to Normal/Fighting. */
  scrappy?: boolean
}

/**
 * Rows to walk for a Gen 2–4 type-chart pass, with the per-row overrides
 * applied. Returns rows in ROM order.
 */
export function gen234Rows(opts: TypeChartOptions = {}): TypeRow[] {
  const dropGhost = opts.identified || opts.scrappy
  let rows = dropGhost ? GEN234_TYPE_ROWS : [...GEN234_TYPE_ROWS, ...GHOST_IMMUNITY_ROWS]
  if (opts.miracleEyed) rows = rows.filter(r => !(r[0] === 'Psychic' && r[1] === 'Dark'))
  if (opts.grounded)    rows = rows.filter(r => !(r[0] === 'Ground' && r[1] === 'Flying'))
  if (opts.roosted)     rows = rows.filter(r => r[1] !== 'Flying')
  return rows
}

/**
 * Walk a table in order, applying each matching row as `floor(d * m / 10)`.
 * `floorOne`: Gen 2–4 set a non-immune step that truncates to 0 back to 1
 * (Gen 1 does not — 0 means "doesn't affect").
 *
 * A mono-typed defender (type1 === type2) matches each row once.
 * Returns the damage and the product of the multipliers actually applied
 * (for display), or immune.
 */
export function walkTypeChart(
  d: number,
  moveType: string,
  defTypes: [string, string],
  rows: TypeRow[],
  floorOne: boolean,
): { damage: number; effectiveness: number; immune: boolean } {
  let eff = 1
  let immune = false
  const [t1, t2] = defTypes
  for (const [atk, def, m] of rows) {
    if (atk !== moveType) continue
    if (def !== t1 && def !== t2) continue
    if (m === 0) { immune = true; d = 0; eff = 0; continue }
    d = Math.floor(d * m / 10)
    if (floorOne && d === 0) d = 1
    eff *= m / 10
  }
  return { damage: d, effectiveness: immune ? 0 : eff, immune }
}

/** Combined multiplier for Gen 5 (and for display): product over both defender types. */
export function combinedEffectiveness(
  moveType: string,
  defTypes: [string, string],
  opts: TypeChartOptions = {},
): number {
  let eff = 1
  const seen = new Set<string>()
  for (const t of defTypes) {
    if (seen.has(t)) continue
    seen.add(t)
    for (const [atk, def, m] of gen234Rows(opts)) {
      if (atk === moveType && def === t) eff *= m / 10
    }
  }
  return eff
}
