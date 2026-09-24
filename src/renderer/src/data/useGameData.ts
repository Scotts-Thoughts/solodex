import { useEffect, useSyncExternalStore } from 'react'
import {
  GAMES_WITH_TRAINERS, areTrainersLoaded, ensureData, isDataReady, loadTrainers, subscribeData,
  type DataKind,
} from './index'

export interface GameDataOptions {
  /** Also wait for the game's trainer table (Trainers / Damage / Route / Stats views). */
  trainers?: boolean
  /** Also wait for the game's wild-encounter table (EV view). */
  encounters?: boolean
}

/**
 * True once the per-game tables a component needs are in memory, kicking off
 * the load if they are not. Re-renders the caller when they arrive, so use the
 * result as a dependency of any memo that reads them (`getPokemonData`,
 * `getTrainers`, ...). An empty game name counts as ready.
 */
export function useGameData(game: string, opts: GameDataOptions = {}): boolean {
  const kinds: DataKind[] = ['pokedex']
  if (opts.trainers) kinds.push('trainers')
  if (opts.encounters) kinds.push('encounters')
  const key = kinds.join(',')

  const ready = useSyncExternalStore(subscribeData, () => !game || isDataReady(game, kinds))

  useEffect(() => {
    if (!game || ready) return
    ensureData(game, kinds).catch(err => console.error(`[Solodex] failed to load ${key} for ${game}:`, err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, key, ready])

  return ready
}

const allTrainersLoaded = () => GAMES_WITH_TRAINERS.every(areTrainersLoaded)

/** True once every game's trainer table is loaded (cross-game trainer search). */
export function useAllTrainers(): boolean {
  const ready = useSyncExternalStore(subscribeData, allTrainersLoaded)
  useEffect(() => {
    if (ready) return
    Promise.all(GAMES_WITH_TRAINERS.map(loadTrainers))
      .catch(err => console.error('[Solodex] failed to load trainers:', err))
  }, [ready])
  return ready
}
