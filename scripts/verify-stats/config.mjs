/**
 * Where the decompilation repos live. These are the same checkouts listed in
 * CLAUDE.md; override any of them with an env var if yours sit elsewhere, e.g.
 *
 *   POKERED=/src/pokered node scripts/verify-stats
 */
export const DECOMPS = {
  pokered:       process.env.POKERED       ?? 'A:/Cygwin/home/scott/pokered',
  pokeyellow:    process.env.POKEYELLOW    ?? 'A:/Cygwin/home/scott/pokeyellow',
  pokegold:      process.env.POKEGOLD      ?? 'A:/Cygwin/home/scott/pokegold',
  pokecrystal:   process.env.POKECRYSTAL   ?? 'A:/Cygwin/home/scott/pokecrystal',
  pokeruby:      process.env.POKERUBY      ?? 'A:/decomps/pokeruby',
  pokeemerald:   process.env.POKEEMERALD   ?? 'A:/decomps/pokeemerald',
  pokefirered:   process.env.POKEFIRERED   ?? 'A:/decomps/pokefirered',
  pokediamond:   process.env.POKEDIAMOND   ?? 'A:/Dropbox/stp-projects/programs/poke_map/repos/pokediamond',
  pokeplatinum:  process.env.POKEPLATINUM  ?? 'A:/decomps/pokeplatinum',
  pokeheartgold: process.env.POKEHEARTGOLD ?? 'A:/Dropbox/stp-projects/programs/poke_map/repos/pokeheartgold',
}

/** The six stat keys, in the order the app's data files use. */
export const STAT_KEYS = [
  'hp', 'attack', 'defense', 'speed', 'special_attack', 'special_defense',
]
