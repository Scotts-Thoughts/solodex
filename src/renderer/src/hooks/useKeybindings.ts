import { useState, useCallback, useMemo } from 'react'
import { SHORTCUT_DEFS, type ShortcutOverrides } from '../keybindings'

export function useKeybindings() {
  const [overrides, setOverrides] = useState<ShortcutOverrides>(() => {
    try { return JSON.parse(localStorage.getItem('keybindingOverrides') || '{}') }
    catch { return {} }
  })

  const bindings = useMemo(() => {
    const result: Record<string, string> = {}
    for (const def of SHORTCUT_DEFS) {
      result[def.id] = overrides[def.id] ?? def.defaultKey
    }
    return result
  }, [overrides])

  const setBinding = useCallback((id: string, key: string) => {
    setOverrides(prev => {
      const def = SHORTCUT_DEFS.find(d => d.id === id)
      // If setting back to default, remove the override
      if (def && key === def.defaultKey) {
        const { [id]: _, ...rest } = prev
        localStorage.setItem('keybindingOverrides', JSON.stringify(rest))
        return rest
      }
      const next = { ...prev, [id]: key }
      localStorage.setItem('keybindingOverrides', JSON.stringify(next))
      return next
    })
  }, [])

  const resetBinding = useCallback((id: string) => {
    setOverrides(prev => {
      const { [id]: _, ...rest } = prev
      localStorage.setItem('keybindingOverrides', JSON.stringify(rest))
      return rest
    })
  }, [])

  const resetAll = useCallback(() => {
    setOverrides({})
    localStorage.removeItem('keybindingOverrides')
  }, [])

  return { bindings, overrides, setBinding, resetBinding, resetAll }
}
