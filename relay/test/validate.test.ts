import { describe, it, expect } from 'vitest'
import { parseCreate, ValidationError } from '../src/validate'

const repo = { attachRepo: 'o/a', attachBranch: 'main' }
const id = '20260911-093012-abcdefgh'
const url = (name: string) => `https://raw.githubusercontent.com/o/a/main/issues/2026/${id}/${name}`

const good = () => ({
  reportId: id,
  title: '  Damage   view crashes ',
  description: 'desc\r\nline',
  diagnostics: { schema: 'solodex-report/1' },
  screenshot: { url: url('screenshot.png'), width: 1400.4, height: 860 },
  attachments: [{ name: 'photo.jpg', mime: 'image/jpeg', bytes: 10, url: url('photo.jpg') }],
})

function err(raw: unknown): ValidationError {
  try {
    parseCreate(raw, repo)
  } catch (e) {
    if (e instanceof ValidationError) return e
    throw e
  }
  throw new Error('expected a ValidationError')
}

describe('parseCreate', () => {
  it('normalises a valid payload', () => {
    const out = parseCreate(good(), repo)
    expect(out.title).toBe('Damage view crashes')
    expect(out.description).toBe('desc\nline')
    expect(out.screenshot).toEqual({ url: url('screenshot.png'), width: 1400, height: 860 })
    expect(out.attachments[0].name).toBe('photo.jpg')
  })
  it('rejects bad ids, titles and sizes', () => {
    expect(err({ ...good(), reportId: 'nope' }).field).toBe('reportId')
    expect(err({ ...good(), title: 'x'.repeat(121) }).field).toBe('title')
    expect(err({ ...good(), title: '   ' }).field).toBe('title')
    expect(err({ ...good(), description: 'x'.repeat(10_001) }).field).toBe('description')
    expect(err({ ...good(), diagnostics: { pad: 'x'.repeat(33 * 1024) } }).field).toBe('diagnostics')
    expect(err({ ...good(), diagnostics: [] }).field).toBe('diagnostics')
  })
  it('rejects foreign or mismatched attachment URLs', () => {
    expect(err({ ...good(), screenshot: { url: 'https://evil.example/x.png', width: 1, height: 1 } }).field).toBe('screenshot')
    const other = good()
    other.attachments[0].url = url('other.jpg')
    expect(err(other).field).toBe('attachments[0]')
  })
  it('rejects unsupported types, duplicates and too many files', () => {
    expect(err({ ...good(), attachments: [{ name: 'x.exe', mime: '', bytes: 1, url: url('x.exe') }] }).code).toBe('unsupported_type')
    const dup = good()
    dup.attachments.push({ ...dup.attachments[0] })
    expect(err(dup).message).toMatch(/duplicate/)
    const many = good()
    many.attachments = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.txt`, mime: 'text/plain', bytes: 1, url: url(`f${i}.txt`) }))
    expect(err(many).field).toBe('attachments')
    const big = good()
    big.attachments[0].bytes = 11 * 1024 * 1024
    expect(err(big).field).toBe('attachments[0].bytes')
  })
  it('strips control characters from text', () => {
    const out = parseCreate({ ...good(), title: 'a' + String.fromCharCode(1) + 'bc' }, repo)
    expect(out.title).toBe('abc')
  })
})
