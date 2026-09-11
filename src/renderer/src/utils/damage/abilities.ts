/**
 * Ability ids and the subset that touch damage. Abilities exist from Gen 3.
 * The pipelines check ids directly; this file provides the canonical id and a
 * per-gen list for UI hints ("Huge Power: Attack ×2").
 */

export const abilityId = (name: string | null | undefined): string | null =>
  name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') || null : null

export interface AbilityInfo {
  id:     string
  name:   string
  minGen: number
  /** Which side it matters on for damage. */
  side:   'attacker' | 'defender' | 'both'
  effect: string
}

export const DAMAGE_ABILITIES: AbilityInfo[] = [
  // Gen 3
  { id: 'hugepower',   name: 'Huge Power',   minGen: 3, side: 'attacker', effect: 'Attack ×2' },
  { id: 'purepower',   name: 'Pure Power',   minGen: 3, side: 'attacker', effect: 'Attack ×2' },
  { id: 'hustle',      name: 'Hustle',       minGen: 3, side: 'attacker', effect: 'Attack ×1.5; physical moves ×0.8 accuracy' },
  { id: 'compoundeyes',name: 'Compound Eyes',minGen: 3, side: 'attacker', effect: 'Accuracy ×1.3' },
  { id: 'sandveil',    name: 'Sand Veil',    minGen: 3, side: 'defender', effect: "Foe's accuracy ×0.8 in sand" },
  { id: 'guts',        name: 'Guts',         minGen: 3, side: 'attacker', effect: 'Attack ×1.5 when statused; no burn halving' },
  { id: 'plus',        name: 'Plus',         minGen: 3, side: 'attacker', effect: 'Sp. Atk ×1.5 with a Minus ally' },
  { id: 'minus',       name: 'Minus',        minGen: 3, side: 'attacker', effect: 'Sp. Atk ×1.5 with a Plus ally' },
  { id: 'overgrow',    name: 'Overgrow',     minGen: 3, side: 'attacker', effect: 'Grass ×1.5 at ≤1/3 HP' },
  { id: 'blaze',       name: 'Blaze',        minGen: 3, side: 'attacker', effect: 'Fire ×1.5 at ≤1/3 HP' },
  { id: 'torrent',     name: 'Torrent',      minGen: 3, side: 'attacker', effect: 'Water ×1.5 at ≤1/3 HP' },
  { id: 'swarm',       name: 'Swarm',        minGen: 3, side: 'attacker', effect: 'Bug ×1.5 at ≤1/3 HP' },
  { id: 'flashfire',   name: 'Flash Fire',   minGen: 3, side: 'both',     effect: 'Immune to Fire; Fire ×1.5 once activated' },
  { id: 'thickfat',    name: 'Thick Fat',    minGen: 3, side: 'defender', effect: 'Fire/Ice attacks halved' },
  { id: 'marvelscale', name: 'Marvel Scale', minGen: 3, side: 'defender', effect: 'Defense ×1.5 when statused' },
  { id: 'levitate',    name: 'Levitate',     minGen: 3, side: 'defender', effect: 'Immune to Ground' },
  { id: 'wonderguard', name: 'Wonder Guard', minGen: 3, side: 'defender', effect: 'Only super-effective moves hit' },
  { id: 'voltabsorb',  name: 'Volt Absorb',  minGen: 3, side: 'defender', effect: 'Immune to Electric' },
  { id: 'waterabsorb', name: 'Water Absorb', minGen: 3, side: 'defender', effect: 'Immune to Water' },
  { id: 'battlearmor', name: 'Battle Armor', minGen: 3, side: 'defender', effect: 'No critical hits' },
  { id: 'shellarmor',  name: 'Shell Armor',  minGen: 3, side: 'defender', effect: 'No critical hits' },
  { id: 'cloudnine',   name: 'Cloud Nine',   minGen: 3, side: 'both',     effect: 'Weather has no effect' },
  { id: 'airlock',     name: 'Air Lock',     minGen: 3, side: 'both',     effect: 'Weather has no effect' },
  { id: 'rockhead',    name: 'Rock Head',    minGen: 3, side: 'attacker', effect: 'No recoil' },
  { id: 'liquidooze',  name: 'Liquid Ooze',  minGen: 3, side: 'defender', effect: 'Drain moves hurt the user' },
  // Gen 4
  { id: 'technician',  name: 'Technician',   minGen: 4, side: 'attacker', effect: 'Moves ≤60 BP ×1.5' },
  { id: 'ironfist',    name: 'Iron Fist',    minGen: 4, side: 'attacker', effect: 'Punching moves ×1.2' },
  { id: 'reckless',    name: 'Reckless',     minGen: 4, side: 'attacker', effect: 'Recoil moves ×1.2' },
  { id: 'rivalry',     name: 'Rivalry',      minGen: 4, side: 'attacker', effect: '×1.25 same gender, ×0.75 opposite' },
  { id: 'adaptability',name: 'Adaptability', minGen: 4, side: 'attacker', effect: 'STAB ×2' },
  { id: 'sniper',      name: 'Sniper',       minGen: 4, side: 'attacker', effect: 'Crits ×3' },
  { id: 'superluck',   name: 'Super Luck',   minGen: 4, side: 'attacker', effect: '+1 crit stage' },
  { id: 'tintedlens',  name: 'Tinted Lens',  minGen: 4, side: 'attacker', effect: 'Not-very-effective ×2' },
  { id: 'solidrock',   name: 'Solid Rock',   minGen: 4, side: 'defender', effect: 'Super-effective ×3/4' },
  { id: 'filter',      name: 'Filter',       minGen: 4, side: 'defender', effect: 'Super-effective ×3/4' },
  { id: 'heatproof',   name: 'Heatproof',    minGen: 4, side: 'defender', effect: 'Fire halved' },
  { id: 'dryskin',     name: 'Dry Skin',     minGen: 4, side: 'defender', effect: 'Fire ×1.25; immune to Water' },
  { id: 'slowstart',   name: 'Slow Start',   minGen: 4, side: 'attacker', effect: 'Attack halved for 5 turns' },
  { id: 'solarpower',  name: 'Solar Power',  minGen: 4, side: 'attacker', effect: 'Sp. Atk ×1.5 in sun' },
  { id: 'flowergift',  name: 'Flower Gift',  minGen: 4, side: 'both',     effect: 'Atk / Sp. Def ×1.5 in sun' },
  { id: 'simple',      name: 'Simple',       minGen: 4, side: 'both',     effect: 'Stat stages doubled' },
  { id: 'unaware',     name: 'Unaware',      minGen: 4, side: 'both',     effect: 'Ignores the other side\'s stages' },
  { id: 'moldbreaker', name: 'Mold Breaker', minGen: 4, side: 'attacker', effect: 'Ignores defensive abilities' },
  { id: 'scrappy',     name: 'Scrappy',      minGen: 4, side: 'attacker', effect: 'Normal/Fighting hit Ghosts' },
  { id: 'motordrive',  name: 'Motor Drive',  minGen: 4, side: 'defender', effect: 'Immune to Electric' },
  { id: 'normalize',   name: 'Normalize',    minGen: 4, side: 'attacker', effect: 'All moves Normal-type' },
  { id: 'skilllink',   name: 'Skill Link',   minGen: 4, side: 'attacker', effect: 'Multi-hit always 5' },
  { id: 'klutz',       name: 'Klutz',        minGen: 4, side: 'both',     effect: 'Held item has no effect' },
  { id: 'snowcloak',   name: 'Snow Cloak',   minGen: 4, side: 'defender', effect: "Foe's accuracy ×0.8 in hail" },
  { id: 'noguard',     name: 'No Guard',     minGen: 4, side: 'both',     effect: 'Every move hits' },
  // Gen 5
  { id: 'sheerforce',  name: 'Sheer Force',  minGen: 5, side: 'attacker', effect: 'Moves with secondary effects ×1.3' },
  { id: 'sandforce',   name: 'Sand Force',   minGen: 5, side: 'attacker', effect: 'Rock/Ground/Steel ×1.3 in sand' },
  { id: 'analytic',    name: 'Analytic',     minGen: 5, side: 'attacker', effect: '×1.3 when moving last' },
  { id: 'flareboost',  name: 'Flare Boost',  minGen: 5, side: 'attacker', effect: 'Special ×1.5 when burned' },
  { id: 'toxicboost',  name: 'Toxic Boost',  minGen: 5, side: 'attacker', effect: 'Physical ×1.5 when poisoned' },
  { id: 'defeatist',   name: 'Defeatist',    minGen: 5, side: 'attacker', effect: 'Attack halved at ≤1/2 HP' },
  { id: 'multiscale',  name: 'Multiscale',   minGen: 5, side: 'defender', effect: 'Damage halved at full HP' },
  { id: 'friendguard', name: 'Friend Guard', minGen: 5, side: 'defender', effect: 'Allies take ×3/4' },
  { id: 'sapsipper',   name: 'Sap Sipper',   minGen: 5, side: 'defender', effect: 'Immune to Grass' },
  { id: 'lightningrod',name: 'Lightning Rod',minGen: 5, side: 'defender', effect: 'Immune to Electric (Gen 5+)' },
  { id: 'stormdrain',  name: 'Storm Drain',  minGen: 5, side: 'defender', effect: 'Immune to Water (Gen 5+)' },
  { id: 'heavymetal',  name: 'Heavy Metal',  minGen: 5, side: 'both',     effect: 'Weight ×2' },
  { id: 'lightmetal',  name: 'Light Metal',  minGen: 5, side: 'both',     effect: 'Weight ×½' },
  { id: 'infiltrator', name: 'Infiltrator',  minGen: 5, side: 'attacker', effect: 'Ignores screens' },
  { id: 'teravolt',    name: 'Teravolt',     minGen: 5, side: 'attacker', effect: 'Ignores defensive abilities' },
  { id: 'turboblaze',  name: 'Turboblaze',   minGen: 5, side: 'attacker', effect: 'Ignores defensive abilities' },
  { id: 'victorystar', name: 'Victory Star', minGen: 5, side: 'attacker', effect: 'Accuracy ×1.1' },
  { id: 'sturdy',      name: 'Sturdy',       minGen: 3, side: 'defender', effect: 'Immune to OHKO moves (Gen 5: survives at 1 HP from full)' },
]

const BY_ID = new Map(DAMAGE_ABILITIES.map(a => [a.id, a]))

export function abilityInfo(id: string | null): AbilityInfo | null {
  return id ? BY_ID.get(id) ?? null : null
}

/** Mold Breaker-class abilities ignore the defender's damage-relevant abilities. */
export function ignoresDefenderAbility(attackerAbility: string | null, gen: number): boolean {
  if (gen < 4) return false
  return attackerAbility === 'moldbreaker' || (gen >= 5 && (attackerAbility === 'teravolt' || attackerAbility === 'turboblaze'))
}

/** Defender ability as seen by the attacker (null when suppressed by Mold Breaker). */
export function effectiveDefenderAbility(defender: string | null, attacker: string | null, gen: number): string | null {
  return ignoresDefenderAbility(attacker, gen) ? null : defender
}
