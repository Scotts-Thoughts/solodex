import { createContext, useContext } from 'react'

export const ShowBulkContext = createContext(false)

export function useShowBulk(): boolean {
  return useContext(ShowBulkContext)
}
