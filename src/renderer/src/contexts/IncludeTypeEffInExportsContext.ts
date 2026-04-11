import { createContext, useContext } from 'react'

export const IncludeTypeEffInExportsContext = createContext(true)

export function useIncludeTypeEffInExports(): boolean {
  return useContext(IncludeTypeEffInExportsContext)
}
