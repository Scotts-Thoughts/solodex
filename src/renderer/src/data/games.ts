/**
 * Static game tables.
 *
 * Shared by the renderer data layer and the build-time data plugin
 * (scripts/vite-plugin-solodex-data.ts), so this module must stay free of path
 * aliases and of any import from data_objects-main.
 */

export const GAMES = [
  'Red and Blue',
  'Yellow',
  'Gold and Silver',
  'Crystal',
  'Ruby and Sapphire',
  'Emerald',
  'FireRed and LeafGreen',
  'Diamond and Pearl',
  'Platinum',
  'HeartGold and SoulSilver',
  'Black',
  'Black 2 and White 2',
  'X and Y',
  'Omega Ruby and Alpha Sapphire',
  'Sun and Moon',
  'Ultra Sun and Ultra Moon',
  'Sword and Shield',
  'Brilliant Diamond and Shining Pearl',
  'Legends Arceus',
  'Scarlet and Violet',
  'Legends Z-A',
] as const

export type GameName = (typeof GAMES)[number]

export const GEN_GROUPS: { label: string; games: string[]; color: string }[] = [
  { label: 'Gen 1', games: ['Red and Blue', 'Yellow'],                                                           color: '#FFB300' },
  { label: 'Gen 2', games: ['Gold and Silver', 'Crystal'],                                                       color: '#29B6F6' },
  { label: 'Gen 3', games: ['Ruby and Sapphire', 'Emerald', 'FireRed and LeafGreen'],                           color: '#2E7D32' },
  { label: 'Gen 4', games: ['Diamond and Pearl', 'Platinum', 'HeartGold and SoulSilver'],                       color: '#78909C' },
  { label: 'Gen 5', games: ['Black', 'Black 2 and White 2'],                                                    color: '#616161' },
  { label: 'Gen 6', games: ['X and Y', 'Omega Ruby and Alpha Sapphire'],                                        color: '#1565C0' },
  { label: 'Gen 7', games: ['Sun and Moon', 'Ultra Sun and Ultra Moon'],                                        color: '#F57F17' },
  { label: 'Gen 8', games: ['Sword and Shield', 'Brilliant Diamond and Shining Pearl', 'Legends Arceus'],        color: '#880E4F' },
  { label: 'Gen 9', games: ['Scarlet and Violet', 'Legends Z-A'],                                                color: '#6A1B9A' },
]

export const GAME_COLOR: Record<string, string> = {
  'Red and Blue':                  '#CC0000',
  'Yellow':                        '#FFB300',
  'Gold and Silver':               '#B8860B',
  'Crystal':                       '#29B6F6',
  'Ruby and Sapphire':             '#C62828',
  'Emerald':                       '#2E7D32',
  'FireRed and LeafGreen':         '#E64A19',
  'Diamond and Pearl':             '#5C6BC0',
  'Platinum':                      '#78909C',
  'HeartGold and SoulSilver':      '#F9A825',
  'Black':                         '#616161',
  'Black 2 and White 2':           '#78909C',
  'X and Y':                       '#1565C0',
  'Omega Ruby and Alpha Sapphire': '#BF360C',
  'Sun and Moon':                  '#F57F17',
  'Ultra Sun and Ultra Moon':      '#E65100',
  'Sword and Shield':              '#880E4F',
  'Brilliant Diamond and Shining Pearl': '#5C6BC0',
  'Legends Arceus':                '#1B5E20',
  'Scarlet and Violet':            '#6A1B9A',
  'Legends Z-A':                   '#4A148C',
}

export const GAME_ABBREV: Record<string, string> = {
  'Red and Blue':                  'RB',
  'Yellow':                        'Y',
  'Gold and Silver':               'GS',
  'Crystal':                       'C',
  'Ruby and Sapphire':             'RS',
  'Emerald':                       'E',
  'FireRed and LeafGreen':         'FRLG',
  'Diamond and Pearl':             'DP',
  'Platinum':                      'Pt',
  'HeartGold and SoulSilver':      'HGSS',
  'Black':                         'BW',
  'Black 2 and White 2':           'BW2',
  'X and Y':                       'XY',
  'Omega Ruby and Alpha Sapphire': 'ORAS',
  'Sun and Moon':                  'SM',
  'Ultra Sun and Ultra Moon':      'USUM',
  'Sword and Shield':              'SwSh',
  'Brilliant Diamond and Shining Pearl': 'BDSP',
  'Legends Arceus':                'PLA',
  'Scarlet and Violet':            'SV',
  'Legends Z-A':                   'ZA',
}

export const GAME_TO_GEN: Record<string, string> = {
  'Red and Blue':                  '1',
  'Yellow':                        '1',
  'Gold and Silver':               '2',
  'Crystal':                       '2',
  'Ruby and Sapphire':             '3',
  'Emerald':                       '3',
  'FireRed and LeafGreen':         '3',
  'Diamond and Pearl':             '4',
  'Platinum':                      '4',
  'HeartGold and SoulSilver':      '4',
  'Black':                         '5',
  'Black 2 and White 2':           '5',
  'X and Y':                       '6',
  'Omega Ruby and Alpha Sapphire': '6',
  'Sun and Moon':                  '7',
  'Ultra Sun and Ultra Moon':      '7',
  'Sword and Shield':              '8',
  'Brilliant Diamond and Shining Pearl': '8',
  'Legends Arceus':                '8',
  'Scarlet and Violet':            '9',
  'Legends Z-A':                   '9',
}

/**
 * Where each game's Pokedex lives under data_objects-main. Gen 1-4 games
 * share pokedex.js (keyed by game name); gen 5+ games have one file each.
 * Red/Blue and Yellow also take transfer_learnset from their per-game files.
 * The runtime loaders in data/index.ts (`POKEDEX_LOADERS`) must list the same
 * games and files.
 */
export interface PokedexSource {
  file: string
  /** Top-level key inside `file` when several games share it. */
  key?: string
  transferFile?: string
}

export const POKEDEX_SOURCES: Record<GameName, PokedexSource> = {
  'Red and Blue':                  { file: 'pokedex.js', key: 'Red and Blue', transferFile: 'pokedex/red_blue.js' },
  'Yellow':                        { file: 'pokedex.js', key: 'Yellow',       transferFile: 'pokedex/yellow.js' },
  'Gold and Silver':               { file: 'pokedex.js', key: 'Gold and Silver' },
  'Crystal':                       { file: 'pokedex.js', key: 'Crystal' },
  'Ruby and Sapphire':             { file: 'pokedex.js', key: 'Ruby and Sapphire' },
  'Emerald':                       { file: 'pokedex.js', key: 'Emerald' },
  'FireRed and LeafGreen':         { file: 'pokedex.js', key: 'FireRed and LeafGreen' },
  'Diamond and Pearl':             { file: 'pokedex.js', key: 'Diamond and Pearl' },
  'Platinum':                      { file: 'pokedex.js', key: 'Platinum' },
  'HeartGold and SoulSilver':      { file: 'pokedex.js', key: 'HeartGold and SoulSilver' },
  'Black':                         { file: 'pokedex/black_white.js' },
  'Black 2 and White 2':           { file: 'pokedex/black2_white2.js' },
  'X and Y':                       { file: 'pokedex/x_y.js' },
  'Omega Ruby and Alpha Sapphire': { file: 'pokedex/omega_ruby_alpha_sapphire.js' },
  'Sun and Moon':                  { file: 'pokedex/sun_moon.js' },
  'Ultra Sun and Ultra Moon':      { file: 'pokedex/ultra_sun_ultra_moon.js' },
  'Sword and Shield':              { file: 'pokedex/sword_shield.js' },
  'Brilliant Diamond and Shining Pearl': { file: 'pokedex/brilliant_diamond_shining_pearl.js' },
  'Legends Arceus':                { file: 'pokedex/legends_arceus.js' },
  'Scarlet and Violet':            { file: 'pokedex/scarlet_violet.js' },
  'Legends Z-A':                   { file: 'pokedex/legends_za.js' },
}
