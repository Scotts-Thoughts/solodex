// Collapse spelling variants of the same move (e.g. "SolarBeam" vs "Solar Beam",
// "PoisonPowder" vs "Poison Powder", "Self-Destruct" vs "SelfDestruct") to a
// single canonical key so cross-generation comparison doesn't flag them as
// different moves.

// Aliases apply AFTER camelCase splitting, lowercasing, and non-alphanumeric
// stripping — so both sides of each pair are already reduced (e.g. "Vise Grip"
// and "ViceGrip" both become "visegrip"/"vicegrip" before lookup).
const MOVE_CANON_ALIASES: Record<string, string> = {
  vicegrip: 'visegrip',
  faintattack: 'feintattack',
  hijumpkick: 'highjumpkick',
}

export function canonicalMoveKey(name: string): string {
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2')
  const key = spaced.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return MOVE_CANON_ALIASES[key] ?? key
}
