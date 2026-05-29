import { createContext, useContext } from 'react'

export const ShowWbstContext = createContext(false)

export function useShowWbst(): boolean {
  return useContext(ShowWbstContext)
}
