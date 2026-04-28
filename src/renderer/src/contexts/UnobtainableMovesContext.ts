import { createContext, useContext, useMemo } from 'react'
import { getUnobtainableMoveSets, EMPTY_USER_BANS, type UserBans } from '../data'

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

export function useCrossedOutMoves(game: string): Set<string> {
  const state = useContext(UnobtainableMovesContext)
  return useMemo(() => {
    const sets = getUnobtainableMoveSets(game, state.userBans)
    const out = new Set<string>()
    if (state.crossOutBanned) for (const m of sets.banned) out.add(m)
    if (state.crossOutPostgame) for (const m of sets.postgame) out.add(m)
    if (state.crossOutConditional) for (const m of sets.conditional) out.add(m)
    return out
  }, [state, game])
}
