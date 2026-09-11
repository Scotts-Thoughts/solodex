import { describe, it, expect } from 'vitest'
import { crc32, buildZip, dosDateTime } from '../zip'

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('buildZip', () => {
  const now = new Date(2026, 8, 11, 10, 20, 30)
  const a = Buffer.from('hello')
  const b = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const zip = buildZip([
    { name: 'issue.json', data: a },
    { name: 'attachments/ünïcode.png', data: b },
  ], now)

  it('writes local headers, a central directory and an EOCD record', () => {
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    // second local header starts after header(30) + name(10) + data(5)
    const second = 30 + 'issue.json'.length + a.length
    expect(zip.readUInt32LE(second)).toBe(0x04034b50)
    const eocd = zip.length - 22
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50)
    expect(zip.readUInt16LE(eocd + 8)).toBe(2)
    expect(zip.readUInt16LE(eocd + 10)).toBe(2)
    const cdOffset = zip.readUInt32LE(eocd + 16)
    expect(zip.readUInt32LE(cdOffset)).toBe(0x02014b50)
    const cdSize = zip.readUInt32LE(eocd + 12)
    expect(cdOffset + cdSize).toBe(eocd)
  })

  it('stores sizes, CRCs, names and the UTF-8 flag', () => {
    expect(zip.readUInt32LE(14)).toBe(crc32(a))
    expect(zip.readUInt32LE(18)).toBe(a.length)
    expect(zip.readUInt32LE(22)).toBe(a.length)
    expect(zip.readUInt16LE(6)).toBe(0x0800)
    expect(zip.subarray(30, 30 + 10).toString('utf8')).toBe('issue.json')
    const second = 30 + 10 + a.length
    const nameLen = zip.readUInt16LE(second + 26)
    expect(zip.subarray(second + 30, second + 30 + nameLen).toString('utf8')).toBe('attachments/ünïcode.png')
  })

  it('is deterministic for a fixed timestamp', () => {
    const again = buildZip([{ name: 'issue.json', data: a }, { name: 'attachments/ünïcode.png', data: b }], now)
    expect(again.equals(zip)).toBe(true)
    const { time, date } = dosDateTime(now)
    expect(zip.readUInt16LE(10)).toBe(time)
    expect(zip.readUInt16LE(12)).toBe(date)
  })
})
