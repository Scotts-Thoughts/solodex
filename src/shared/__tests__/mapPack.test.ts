import { describe, it, expect } from 'vitest'
import { decodeMask, encodeMask } from '../mapPack'

describe('map masks', () => {
  it('decodes run-length cells (1 = visible)', () => {
    const cells = decodeMask({ w: 3, h: 2, rle: [0, 2, 1, 3, 0, 1] })
    expect(cells && [...cells]).toEqual([0, 0, 1, 1, 1, 0])
  })

  it('treats any non-zero run value as visible', () => {
    expect([...decodeMask({ w: 2, h: 1, rle: [2, 2] })!]).toEqual([1, 1])
  })

  it('rejects runs that do not cover the surface exactly', () => {
    expect(decodeMask({ w: 2, h: 2, rle: [1, 3] })).toBeNull()
    expect(decodeMask({ w: 2, h: 2, rle: [1, 5] })).toBeNull()
  })

  it('round-trips through encodeMask', () => {
    const cells = [1, 1, 0, 0, 0, 1, 0, 1, 1, 1]
    const rle = encodeMask(cells)
    expect(rle).toEqual([1, 2, 0, 3, 1, 1, 0, 1, 1, 3])
    expect([...decodeMask({ w: 5, h: 2, rle })!]).toEqual(cells)
  })
})
