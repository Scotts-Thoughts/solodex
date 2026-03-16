import { FORM_SPRITE_IDS } from '../data/formSprites'

const ARTWORK_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

export function getArtworkUrl(species: string, nationalDexNumber: number): string {
  const id = FORM_SPRITE_IDS[species] ?? nationalDexNumber
  return `${ARTWORK_BASE}/${id}.png`
}

export function getSpriteUrl(species: string, nationalDexNumber: number): string {
  const id = FORM_SPRITE_IDS[species] ?? nationalDexNumber
  return `${SPRITE_BASE}/${id}.png`
}
