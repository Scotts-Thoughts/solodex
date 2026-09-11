import { describe, it, expect } from 'vitest'
import { formatConsoleArgs, recordError, getRecentErrors } from '../errorLog'

describe('formatConsoleArgs', () => {
  it('joins strings, objects and errors, keeping the first stack', () => {
    const err = new Error('boom')
    const out = formatConsoleArgs(['Export failed:', err, { a: 1 }])
    expect(out.message).toBe('Export failed: boom {"a":1}')
    expect(out.stack).toBe(err.stack)
  })
  it('survives circular objects', () => {
    const o: Record<string, unknown> = {}
    o.self = o
    expect(formatConsoleArgs([o]).message).toBe('[object Object]')
  })
})

describe('recordError', () => {
  it('truncates and keeps only the newest entries', () => {
    for (let i = 0; i < 35; i++) recordError({ at: 't', source: 'renderer', message: `m${i} ` + 'x'.repeat(3000) })
    const list = getRecentErrors()
    expect(list).toHaveLength(30)
    expect(list[0].message.startsWith('m5 ')).toBe(true)
    expect(list[0].message.length).toBe(2000)
  })
})
