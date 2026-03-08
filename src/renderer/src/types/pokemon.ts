export interface BaseStats {
  hp: number
  attack: number
  defense: number
  speed: number
  special_attack: number
  special_defense: number
}

export interface EvolutionEntry {
  species: string
  method: string | null
  parameter: number | string | null
}

export interface PokemonData {
  species: string
  rom_id: number
  national_dex_number: number
  base_stats: BaseStats
  ev_yield: BaseStats
  type_1: string
  type_2: string
  catch_rate: number | null
  base_experience: number | null
  common_item: string | null
  rare_item: string | null
  gender_ratio: number | null
  egg_cycles: number | null
  base_friendship: number | null
  growth_rate: string
  egg_group_1: string | null
  egg_group_2: string | null
  abilities: string[]
  hidden_ability: string | null
  level_up_learnset: [number, string][]
  tm_hm_learnset: string[]
  tutor_learnset: string[]
  egg_moves: string[]
  weight: number | null
  evolution_family: EvolutionEntry[]
}

export interface MoveData {
  rom_id: number
  move: string
  type: string
  category: string
  pp: number
  power: number | null
  accuracy: number | null
  priority: number
  effect: string
  effect_chance: number | null
  target: string
  makes_contact: boolean
  description: string
}

export type EvolutionStage = 'single' | 'first' | 'middle' | 'final' | 'mega'

export interface PokemonListEntry {
  name: string
  national_dex_number: number
  type_1: string
  type_2: string
  growth_rate: string
  evolution_stage: EvolutionStage
}

export interface TrainerPokemonStats {
  hp: number
  attack: number
  defense: number
  speed: number
  special_attack: number
  special_defense: number
}

export interface TrainerPokemon {
  species: string
  level: number
  experience_yield: number
  nature: string | null
  ability: string | null
  held_item: string | null
  stats: TrainerPokemonStats
  moves: (string | null)[]
}

export interface Trainer {
  id: string
  name: string
  trainer_class: string
  location: string | null
  money: number
  is_double_battle: boolean
  items: string[]
  party: TrainerPokemon[]
}

export interface TrainerListEntry {
  id: string
  name: string
  trainer_class: string
  location: string | null
  partySize: number
  maxLevel: number
  party: { species: string; level: number }[]
}
