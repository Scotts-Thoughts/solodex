import { useState, useCallback } from 'react'
import { getMoveData } from '../data'
import type { MoveData } from '../types/pokemon'

export type SortColumn = 'default' | 'move' | 'type' | 'cat' | 'pwr' | 'acc' | 'pp'
export type SortDirection = 'asc' | 'desc'

export interface SortState {
  column: SortColumn
  direction: SortDirection
}

interface SortableRow {
  moveName: string
  sortKey: number
  prefix: string
}

const DEFAULT_SORT: SortState = { column: 'default', direction: 'asc' }

function compareNullable(a: number | null | undefined, b: number | null | undefined, nullValue: number): number {
  const va = a ?? nullValue
  const vb = b ?? nullValue
  return va - vb
}

export function sortMoveRows<T extends SortableRow>(rows: T[], sort: SortState, game: string): T[] {
  if (sort.column === 'default') return rows

  const moveCache = new Map<string, MoveData | null>()
  const getMove = (name: string) => {
    if (!moveCache.has(name)) moveCache.set(name, getMoveData(name, game) ?? null)
    return moveCache.get(name)!
  }

  const sorted = [...rows].sort((a, b) => {
    const moveA = getMove(a.moveName)
    const moveB = getMove(b.moveName)
    let cmp = 0

    switch (sort.column) {
      case 'move':
        cmp = a.moveName.localeCompare(b.moveName)
        break
      case 'type':
        cmp = (moveA?.type ?? '').localeCompare(moveB?.type ?? '')
        break
      case 'cat': {
        const catOrder = (c: string | undefined | null) =>
          c === 'Physical' ? 0 : c === 'Special' ? 1 : c === 'Status' ? 2 : 3
        cmp = catOrder(moveA?.category) - catOrder(moveB?.category)
        break
      }
      case 'pwr':
        cmp = compareNullable(moveA?.power, moveB?.power, -1)
        break
      case 'acc':
        cmp = compareNullable(moveA?.accuracy, moveB?.accuracy, 101)
        break
      case 'pp':
        cmp = (moveA?.pp ?? 0) - (moveB?.pp ?? 0)
        break
    }

    return sort.direction === 'desc' ? -cmp : cmp
  })

  return sorted
}

export function useMultiMoveSort() {
  const [sorts, setSorts] = useState<Record<string, SortState>>({})

  const getSort = useCallback((key: string): SortState => {
    return sorts[key] ?? DEFAULT_SORT
  }, [sorts])

  const handleSort = useCallback((key: string, column: SortColumn) => {
    setSorts(prev => {
      const current = prev[key] ?? DEFAULT_SORT
      let next: SortState
      if (column === 'default') {
        next = DEFAULT_SORT
      } else if (column === current.column) {
        next = { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      } else {
        next = { column, direction: 'asc' }
      }
      return { ...prev, [key]: next }
    })
  }, [])

  const resetAll = useCallback(() => setSorts({}), [])

  return { getSort, handleSort, resetAll }
}
