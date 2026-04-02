import { createContext, useContext } from 'react'

export const FadeUnobtainableContext = createContext(false)

export function useFadeUnobtainable(): boolean {
  return useContext(FadeUnobtainableContext)
}
