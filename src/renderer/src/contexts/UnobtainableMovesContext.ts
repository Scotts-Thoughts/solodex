import { createContext, useContext, useMemo } from 'react'
import { getUnobtainableMoveSets, EMPTY_USER_BANS, type UserBans } from '../data'
import { canonicalMoveKey } from '../utils/moveNameCanonical'

export interface UnobtainableMovesState {
  crossOutBanned: boolean
  crossOutPostgame: boolean
  crossOutConditional: boolean
  userBans: UserBans
}

const DEFAULT_STATE: UnobtainableMovesState = {
  crossOutBanned: false,
  crossOutPostgame: false,
  crossOutConditional: false,
  userBans: EMPTY_USER_BANS,
}

export const UnobtainableMovesContext = createContext<UnobtainableMovesState>(DEFAULT_STATE)

export function useUnobtainableMovesState(): UnobtainableMovesState {
  return useContext(UnobtainableMovesContext)
}

/**
 * Canonical move keys (see canonicalMoveKey) of every move that should be
 * crossed out for this game. Keys rather than names so the hand-written
 * unobtainable_moves.js ("ThunderPunch", "AncientPower") keeps matching the
 * modern spellings the pokedex files use ("Thunder Punch", "Ancient Power").
 */
export function useCrossedOutMoves(game: string): Set<string> {
  const state = useContext(UnobtainableMovesContext)
  return useMemo(() => {
    const sets = getUnobtainableMoveSets(game, state.userBans)
    const out = new Set<string>()
    if (state.crossOutBanned) for (const m of sets.banned) out.add(canonicalMoveKey(m))
    if (state.crossOutPostgame) for (const m of sets.postgame) out.add(canonicalMoveKey(m))
    if (state.crossOutConditional) for (const m of sets.conditional) out.add(canonicalMoveKey(m))
    return out
  }, [state, game])
}
