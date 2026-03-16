import { useEffect } from 'react'

/**
 * Dismiss a popover on click outside (matching data attribute) or Escape key.
 * @param dataAttr The data attribute selector, e.g. '[data-type-popover]'
 * @param onClose Callback to close the popover
 */
export function usePopoverDismiss(dataAttr: string, onClose: () => void): void {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest(dataAttr)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [dataAttr, onClose])
}
