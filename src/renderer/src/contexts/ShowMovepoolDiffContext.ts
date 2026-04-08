import { createContext, useContext } from 'react'

export const ShowMovepoolDiffContext = createContext(true)

export function useShowMovepoolDiff(): boolean {
  return useContext(ShowMovepoolDiffContext)
}
