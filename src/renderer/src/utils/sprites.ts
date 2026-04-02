import { FORM_SPRITE_IDS } from '../data/formSprites'

const ARTWORK_BASE = './sprites/artwork'
const HOME_BASE = './sprites/home'

export function getArtworkUrl(species: string, nationalDexNumber: number): string {
  const id = FORM_SPRITE_IDS[species] ?? nationalDexNumber
  return `${ARTWORK_BASE}/${id}.png`
}

export function getHomeSpriteUrl(species: string, nationalDexNumber: number): string {
  const id = FORM_SPRITE_IDS[species] ?? nationalDexNumber
  return `${HOME_BASE}/${id}.png`
}
