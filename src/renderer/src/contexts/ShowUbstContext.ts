import { createContext, useContext } from 'react'

export const ShowUbstContext = createContext(false)

export function useShowUbst(): boolean {
  return useContext(ShowUbstContext)
}
