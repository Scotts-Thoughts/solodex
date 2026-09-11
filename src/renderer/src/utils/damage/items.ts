/**
 * Held items that affect damage, keyed by a canonical id (lowercase
 * alphanumerics: "NeverMeltIce", "Never-Melt Ice" and "nevermeltice" all map
 * to `nevermeltice`). Trainer data and the UI both go through `itemId`.
 *
 * Per-gen mechanics live in the pipelines; this file only says *what* an
 * item is (type it boosts, which gens it exists in, hold-effect category) and
 * the ROM parameter it carries:
 *
 *   Gen 2  type items param 10 → damage ×110/100 (attributes.asm)
 *   Gen 3  type items param 10 (Sea Incense 5) → attacking stat ×(100+p)/100
 *          (pokeemerald src/data/items.h)
 *   Gen 4  type items, plates, incenses param 20 → power ×120/100
 *          (pokeplatinum res/items/data/*.json)
 *   Gen 5  type items 0x1333 (×1.2), gems 0x1800 (×1.5) — BP chain
 */

export const itemId = (name: string | null | undefined): string | null =>
  name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') || null : null

export type ItemKind =
  | 'typeboost'   // Charcoal, plates, incenses …
  | 'gem'         // Gen 5 gems
  | 'choice'      // Choice Band / Specs
  | 'species'     // Thick Club, Light Ball, Deep Sea Tooth/Scale, Soul Dew, Metal Powder, orbs
  | 'general'     // Muscle Band, Wise Glasses, Expert Belt, Life Orb, Metronome, Eviolite
  | 'crit'        // Scope Lens, Razor Claw, Lucky Punch, Stick
  | 'resistberry' // Occa … Chilan
  | 'accuracy'    // Bright Powder, Lax Incense, Wide Lens, Zoom Lens — hit chance only (accuracy.ts)
  | 'other'       // Focus Band/Sash, Iron Ball — affect survival / grounding

export interface ItemInfo {
  id:      string
  name:    string
  kind:    ItemKind
  minGen:  number
  maxGen?: number
  /** Type this item boosts / resists (typeboost, gem, resistberry, species orbs). */
  type?:   string
  /** Second type for orbs (Adamant: Dragon + Steel). */
  type2?:  string
  /** Species restriction for `species` items. */
  species?: string[]
}

const T = (id: string, name: string, type: string, minGen: number, maxGen?: number): ItemInfo =>
  ({ id, name, kind: 'typeboost', type, minGen, maxGen })

export const ITEMS: ItemInfo[] = [
  // ── Type boosters ───────────────────────────────────────────────────────
  T('pinkbow',      'Pink Bow',      'Normal',   2, 2),
  T('polkadotbow',  'Polkadot Bow',  'Normal',   2, 2),
  T('silkscarf',    'Silk Scarf',    'Normal',   3),
  T('blackbelt',    'Black Belt',    'Fighting', 2),
  T('sharpbeak',    'Sharp Beak',    'Flying',   2),
  T('poisonbarb',   'Poison Barb',   'Poison',   2),
  T('softsand',     'Soft Sand',     'Ground',   2),
  T('hardstone',    'Hard Stone',    'Rock',     2),
  T('silverpowder', 'Silver Powder', 'Bug',      2),
  T('spelltag',     'Spell Tag',     'Ghost',    2),
  T('charcoal',     'Charcoal',      'Fire',     2),
  T('mysticwater',  'Mystic Water',  'Water',    2),
  T('miracleseed',  'Miracle Seed',  'Grass',    2),
  T('magnet',       'Magnet',        'Electric', 2),
  T('twistedspoon', 'Twisted Spoon', 'Psychic',  2),
  T('nevermeltice', 'NeverMeltIce',  'Ice',      2),
  T('dragonscale',  'Dragon Scale',  'Dragon',   2, 2),   // Gen 2's Dragon booster
  T('dragonfang',   'Dragon Fang',   'Dragon',   3),      // does nothing in Gen 2
  T('blackglasses', 'BlackGlasses',  'Dark',     2),
  T('metalcoat',    'Metal Coat',    'Steel',    2),
  T('seaincense',   'Sea Incense',   'Water',    3),
  T('oddincense',   'Odd Incense',   'Psychic',  4),
  T('rockincense',  'Rock Incense',  'Rock',     4),
  T('roseincense',  'Rose Incense',  'Grass',    4),
  T('waveincense',  'Wave Incense',  'Water',    4),
  // Plates (Gen 4+)
  T('flameplate',   'Flame Plate',   'Fire',     4),
  T('splashplate',  'Splash Plate',  'Water',    4),
  T('zapplate',     'Zap Plate',     'Electric', 4),
  T('meadowplate',  'Meadow Plate',  'Grass',    4),
  T('icicleplate',  'Icicle Plate',  'Ice',      4),
  T('fistplate',    'Fist Plate',    'Fighting', 4),
  T('toxicplate',   'Toxic Plate',   'Poison',   4),
  T('earthplate',   'Earth Plate',   'Ground',   4),
  T('skyplate',     'Sky Plate',     'Flying',   4),
  T('mindplate',    'Mind Plate',    'Psychic',  4),
  T('insectplate',  'Insect Plate',  'Bug',      4),
  T('stoneplate',   'Stone Plate',   'Rock',     4),
  T('spookyplate',  'Spooky Plate',  'Ghost',    4),
  T('dracoplate',   'Draco Plate',   'Dragon',   4),
  T('dreadplate',   'Dread Plate',   'Dark',     4),
  T('ironplate',    'Iron Plate',    'Steel',    4),
  // Gems (Gen 5)
  ...['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
      'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'].map(t =>
    ({ id: `${t.toLowerCase()}gem`, name: `${t} Gem`, kind: 'gem' as ItemKind, type: t, minGen: 5 })),

  // ── Choice ──────────────────────────────────────────────────────────────
  { id: 'choiceband',  name: 'Choice Band',  kind: 'choice', minGen: 3 },
  { id: 'choicespecs', name: 'Choice Specs', kind: 'choice', minGen: 4 },
  { id: 'choicescarf', name: 'Choice Scarf', kind: 'other',  minGen: 4 },

  // ── General ─────────────────────────────────────────────────────────────
  { id: 'muscleband',  name: 'Muscle Band',  kind: 'general', minGen: 4 },
  { id: 'wiseglasses', name: 'Wise Glasses', kind: 'general', minGen: 4 },
  { id: 'expertbelt',  name: 'Expert Belt',  kind: 'general', minGen: 4 },
  { id: 'lifeorb',     name: 'Life Orb',     kind: 'general', minGen: 4 },
  { id: 'metronome',   name: 'Metronome',    kind: 'general', minGen: 4 },
  { id: 'eviolite',    name: 'Eviolite',     kind: 'general', minGen: 5 },

  // ── Species ─────────────────────────────────────────────────────────────
  { id: 'thickclub',    name: 'Thick Club',     kind: 'species', minGen: 2, species: ['Cubone', 'Marowak'] },
  { id: 'lightball',    name: 'Light Ball',     kind: 'species', minGen: 2, species: ['Pikachu'] },
  { id: 'metalpowder',  name: 'Metal Powder',   kind: 'species', minGen: 2, species: ['Ditto'] },
  { id: 'souldew',      name: 'Soul Dew',       kind: 'species', minGen: 3, species: ['Latias', 'Latios'] },
  { id: 'deepseatooth', name: 'Deep Sea Tooth', kind: 'species', minGen: 3, species: ['Clamperl'] },
  { id: 'deepseascale', name: 'Deep Sea Scale', kind: 'species', minGen: 3, species: ['Clamperl'] },
  { id: 'adamantorb',   name: 'Adamant Orb',    kind: 'species', minGen: 4, species: ['Dialga'],   type: 'Dragon', type2: 'Steel' },
  { id: 'lustrousorb',  name: 'Lustrous Orb',   kind: 'species', minGen: 4, species: ['Palkia'],   type: 'Dragon', type2: 'Water' },
  { id: 'griseousorb',  name: 'Griseous Orb',   kind: 'species', minGen: 4, species: ['Giratina', 'Giratina (Origin)'], type: 'Dragon', type2: 'Ghost' },

  // ── Crit ────────────────────────────────────────────────────────────────
  { id: 'scopelens',  name: 'Scope Lens',  kind: 'crit', minGen: 2 },
  { id: 'razorclaw',  name: 'Razor Claw',  kind: 'crit', minGen: 4 },
  { id: 'luckypunch', name: 'Lucky Punch', kind: 'crit', minGen: 2, species: ['Chansey'] },
  { id: 'stick',      name: 'Stick',       kind: 'crit', minGen: 2, species: ["Farfetch'd"] },

  // ── Type-resist berries (Gen 4+) ────────────────────────────────────────
  ...([
    ['occaberry', 'Occa Berry', 'Fire'], ['passhoberry', 'Passho Berry', 'Water'], ['wacanberry', 'Wacan Berry', 'Electric'],
    ['rindoberry', 'Rindo Berry', 'Grass'], ['yacheberry', 'Yache Berry', 'Ice'], ['chopleberry', 'Chople Berry', 'Fighting'],
    ['kebiaberry', 'Kebia Berry', 'Poison'], ['shucaberry', 'Shuca Berry', 'Ground'], ['cobaberry', 'Coba Berry', 'Flying'],
    ['payapaberry', 'Payapa Berry', 'Psychic'], ['tangaberry', 'Tanga Berry', 'Bug'], ['chartiberry', 'Charti Berry', 'Rock'],
    ['kasibberry', 'Kasib Berry', 'Ghost'], ['habanberry', 'Haban Berry', 'Dragon'], ['colburberry', 'Colbur Berry', 'Dark'],
    ['babiriberry', 'Babiri Berry', 'Steel'], ['chilanberry', 'Chilan Berry', 'Normal'],
  ] as const).map(([id, name, type]) => ({ id, name, kind: 'resistberry' as ItemKind, type, minGen: 4 })),

  // ── Accuracy / evasion ──────────────────────────────────────────────────
  // Gen 2 Bright Powder −20/256 (attributes.asm); Gen 3 ×0.9 / Lax Incense
  // ×0.95 (items.h); Gen 4 both ×0.9, Wide Lens ×1.1, Zoom Lens ×1.2
  // (res/items/data); Gen 5 0xE66 / 0x1199 / 0x1333 (Showdown).
  { id: 'brightpowder', name: 'Bright Powder', kind: 'accuracy', minGen: 2 },
  { id: 'laxincense',   name: 'Lax Incense',   kind: 'accuracy', minGen: 3 },
  { id: 'widelens',     name: 'Wide Lens',     kind: 'accuracy', minGen: 4 },
  { id: 'zoomlens',     name: 'Zoom Lens',     kind: 'accuracy', minGen: 4 },

  // ── Survival / grounding ────────────────────────────────────────────────
  { id: 'focusband', name: 'Focus Band', kind: 'other', minGen: 2 },
  { id: 'focussash', name: 'Focus Sash', kind: 'other', minGen: 4 },
  { id: 'ironball',  name: 'Iron Ball',  kind: 'other', minGen: 4 },
]

const BY_ID = new Map(ITEMS.map(i => [i.id, i]))

export function getItem(id: string | null): ItemInfo | null {
  return id ? BY_ID.get(id) ?? null : null
}

/** Items selectable in a gen's item dropdown, grouped by kind. */
export function itemsForGen(gen: number): ItemInfo[] {
  return ITEMS.filter(i => gen >= i.minGen && (i.maxGen == null || gen <= i.maxGen))
}

/** Whether `item` exists and has a damage effect in this gen. */
export function itemActiveInGen(id: string | null, gen: number): boolean {
  const it = getItem(id)
  return !!it && gen >= it.minGen && (it.maxGen == null || gen <= it.maxGen)
}

/**
 * Type-boost parameter for `item` on a move of `moveType` in `gen`, or null.
 *   Gen 2: 10 (damage ×110/100)   Gen 3: 10, Sea Incense 5 (stat ×(100+p)/100)
 *   Gen 4: 20 (power ×120/100)     Gen 5: caller uses 0x1333 (handled in gen5.ts)
 */
export function typeBoostParam(id: string | null, moveType: string, gen: number): number | null {
  const it = getItem(id)
  if (!it || it.kind !== 'typeboost' || it.type !== moveType) return null
  if (!itemActiveInGen(id, gen)) return null
  if (gen === 2) return 10
  if (gen === 3) return it.id === 'seaincense' ? 5 : 10
  return 20
}

/** Species-locked item check (Thick Club on Cubone/Marowak, …). */
export function speciesItem(id: string | null, species: string): ItemInfo | null {
  const it = getItem(id)
  if (!it || !it.species) return null
  return it.species.includes(species) ? it : null
}

/** Display name for an id (falls back to the id). */
export function itemName(id: string | null): string {
  return getItem(id)?.name ?? id ?? ''
}
