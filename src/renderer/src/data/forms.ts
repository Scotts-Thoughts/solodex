/**
 * Form classification for species display names.
 *
 * The pokedex files name alternate forms with three conventions, produced by
 * `derive_form_display_name` in data_objects/scrape_pokedex.py:
 *
 *   - prefix:  "Mega Venusaur", "Mega Charizard X", "Primal Kyogre",
 *              "Alolan Raichu", "Galarian Darmanitan", "Paldean Tauros"
 *   - suffix:  "Giratina (Origin)", "Pumpkaboo (Small)", "Venusaur (Gmax)",
 *              "Absol (Mega Z)"
 *   - both:    "Galarian Darmanitan (Zen)", "Paldean Tauros (Combat Breed)"
 *
 * Everything in the app that needs to know what kind of form a name is
 * (list filters, evolution-stage detection, stat rankings, artwork) should go
 * through `classifyForm` rather than re-deriving regexes.
 */

export type Region = 'Alolan' | 'Galarian' | 'Hisuian' | 'Paldean'

export interface FormInfo {
  /** The display name that was classified. */
  name: string
  /** Species name with every form decoration removed ("Darmanitan"). */
  base: string
  /** Mega Evolution, Primal Reversion or a Legends Z-A "(Mega Z)" form. */
  isMega: boolean
  /** Alolan / Galarian / Hisuian / Paldean regional form. */
  isRegional: boolean
  region: Region | null
  /** Gigantamax form. */
  isGmax: boolean
  /** Any other parenthesised variant: Origin, Zen, Small, Female, Core … */
  isVariant: boolean
  /** Text inside the parentheses, if any ("Zen", "Combat Breed"). */
  variant: string | null
  /** True for the undecorated species entry. */
  isBase: boolean
  /** Earliest generation in which this kind of form can exist. */
  introducedGen: number
}

const REGION_GEN: Record<Region, number> = {
  Alolan: 7,
  Galarian: 8,
  Hisuian: 8,
  Paldean: 9,
}

const REGION_RE = /^(Alolan|Galarian|Hisuian|Paldean) (.+)$/
const MEGA_RE = /^(Mega|Primal) (.+?)( X| Y| Z)?$/
const SUFFIX_RE = /^(.+?) \((.+)\)$/

const cache = new Map<string, FormInfo>()

export function classifyForm(name: string): FormInfo {
  const hit = cache.get(name)
  if (hit) return hit

  let rest = name
  let isMega = false
  let region: Region | null = null
  let variant: string | null = null
  let isGmax = false

  const suffix = rest.match(SUFFIX_RE)
  if (suffix) {
    rest = suffix[1]
    variant = suffix[2]
    if (variant === 'Gmax' || variant.endsWith(' Gmax')) isGmax = true
    if (variant === 'Mega Z') isMega = true
  }
  const regional = rest.match(REGION_RE)
  if (regional) {
    region = regional[1] as Region
    rest = regional[2]
  }
  const mega = rest.match(MEGA_RE)
  if (mega) {
    isMega = true
    rest = mega[2]
  }

  const isVariant = variant !== null && !isGmax && variant !== 'Mega Z'
  const isRegional = region !== null
  let introducedGen = 1
  if (isMega) introducedGen = 6
  if (isGmax) introducedGen = Math.max(introducedGen, 8)
  if (region) introducedGen = Math.max(introducedGen, REGION_GEN[region])

  const info: FormInfo = {
    name,
    base: rest,
    isMega,
    isRegional,
    region,
    isGmax,
    isVariant,
    variant,
    isBase: !isMega && !isRegional && !isGmax && !isVariant,
    introducedGen,
  }
  cache.set(name, info)
  return info
}

/** Mega / Primal / Mega Z check — the most common question callers ask. */
export function isMegaForm(name: string): boolean {
  return classifyForm(name).isMega
}
