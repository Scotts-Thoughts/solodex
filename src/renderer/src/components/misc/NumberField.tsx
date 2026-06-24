import { useState, useEffect } from 'react'
import { clamp } from '../../utils/hitProbability'

interface Props {
  value: number
  min: number
  max: number
  integer?: boolean
  step?: number
  onChange: (v: number) => void
  className?: string
  ariaLabel?: string
}

/**
 * Controlled numeric input that is impossible to drive into a NaN. It keeps a
 * local text buffer so the field can be cleared/half-typed, but only ever emits
 * a clamped, valid number via onChange. The parent's numeric `value` stays the
 * source of truth for computation, so outputs never see NaN (spec §6).
 */
export default function NumberField({
  value,
  min,
  max,
  integer = false,
  step = 1,
  onChange,
  className = '',
  ariaLabel,
}: Props) {
  const [buf, setBuf] = useState<string>(() => String(value))

  // Resync the buffer only when the external value diverges from what's typed
  // (e.g. k programmatically clamped when n shrinks). During normal typing the
  // parsed buffer already equals `value`, so this is a no-op — no cursor jump.
  useEffect(() => {
    const parsed = integer ? parseInt(buf, 10) : parseFloat(buf)
    const normalized = Number.isNaN(parsed) ? NaN : clamp(parsed, min, max)
    if (normalized !== value) setBuf(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (s: string): void => {
    setBuf(s)
    const v = integer ? parseInt(s, 10) : parseFloat(s)
    if (!Number.isNaN(v)) onChange(clamp(v, min, max))
  }

  const handleBlur = (): void => {
    const v = integer ? parseInt(buf, 10) : parseFloat(buf)
    setBuf(Number.isNaN(v) ? String(value) : String(clamp(v, min, max)))
  }

  return (
    <input
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={buf}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => commit(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  )
}
