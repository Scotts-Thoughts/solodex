// Bulbapedia article naming for the wiki popovers. Shared by the main process
// (live fetch), the renderer (lookup in the bundled descriptions) and
// scripts/collect-wiki (which builds that bundle), so all three resolve a
// displayed name to the same article.

export type WikiType = 'move' | 'ability' | 'tm'

/** Displayed names that differ from Bulbapedia's article name. */
export const WIKI_NAME_OVERRIDES: Record<string, string> = {
  'Compoundeyes': 'Compound Eyes',
  'Hi Jump Kick': 'High Jump Kick',
  'Minds Eye': "Mind's Eye",
  'Faint Attack': 'Feint Attack',
  'ViceGrip': 'Vise Grip',
  'Vice Grip': 'Vise Grip',
  'SmellingSalts': 'Smelling Salts',
  'SmellingSalt': 'Smelling Salts',
  'SoftBoiled': 'Soft Boiled',
  'Softboiled': 'Soft-Boiled',
  'Conversion2': 'Conversion 2',
  'SmokeScreen': 'Smokescreen',
  'SelfDestruct': 'Self-Destruct',
  'Selfdestruct': 'Self-Destruct',
  'Self Destruct': 'Self-Destruct',
  // Gen 8-9 abilities whose data capitalisation differs from the article title
  'As One Glastrier': 'As One',
  'As One Spectrier': 'As One',
  'Beads Of Ruin': 'Beads of Ruin',
  'Sword Of Ruin': 'Sword of Ruin',
  'Tablets Of Ruin': 'Tablets of Ruin',
  'Vessel Of Ruin': 'Vessel of Ruin',
  'Dragons Maw': "Dragon's Maw",
  'Good As Gold': 'Good as Gold',
  'Power Of Alchemy': 'Power of Alchemy',
  'Rks System': 'RKS System',
  'Soul Heart': 'Soul-Heart',
  'Well Baked Body': 'Well-Baked Body',
  'Zero To Hero': 'Zero to Hero',
}

/** Article title for a name, e.g. "Thunderbolt" → "Thunderbolt_(move)". */
export function wikiTitle(name: string, type: WikiType): string {
  const normalized = name.replace(/’/g, "'")
  if (type === 'tm') return normalized
  return normalized.replace(/ /g, '_') + (type === 'move' ? '_(move)' : '_(Ability)')
}

/**
 * Names to try, in order: the manual override alone if there is one, else the
 * name itself, then with spaces before mid-word capitals ("AncientPower" →
 * "Ancient Power"), then with dashes as spaces ("Sand-Attack" → "Sand Attack").
 */
export function wikiNameCandidates(name: string): string[] {
  const override = WIKI_NAME_OVERRIDES[name]
  if (override) return [override]
  const candidates = [name, name.replace(/([a-z])([A-Z])/g, '$1 $2'), name.replace(/-/g, ' ')]
  return [...new Set(candidates)]
}

/**
 * Key of a move or ability in the bundled descriptions: the override applied,
 * then lowercased with everything but letters and digits dropped, so every
 * period spelling ("SolarBeam", "Solar Beam", "Self-Destruct", "Farfetch’d")
 * lands on one entry.
 */
export function wikiKey(name: string): string {
  return (WIKI_NAME_OVERRIDES[name] ?? name).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Bulbapedia's TM article title: three-digit TMs (TM044), two-digit HMs (HM04); Legends: Z-A's TM00 stays as is. */
export function tmPageTitle(tmCode: string): string {
  if (!tmCode.startsWith('TM') || /^TM0+$/.test(tmCode)) return tmCode
  return 'TM' + tmCode.slice(2).padStart(3, '0')
}
