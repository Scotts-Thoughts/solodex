import { describe, it, expect } from 'vitest'
import {
  sanitizeAttachmentName,
  dedupeAttachmentName,
  mimeFromName,
  validateAttachmentSet,
  makeLocalId,
  LOCAL_ID_RE,
  mapRemoteStatus,
  extractNotes,
  redactHome,
  pushBounded,
  formatBytes,
  ISSUE_LIMITS,
} from '../issues'

describe('sanitizeAttachmentName', () => {
  it('keeps only URL-safe characters and the basename', () => {
    expect(sanitizeAttachmentName('C:\\Users\\me\\my photo (1).PNG')).toBe('my_photo_1.png')
    expect(sanitizeAttachmentName('../../etc/passwd.txt')).toBe('passwd.txt')
    expect(sanitizeAttachmentName('a:b?c*.png')).toBe('a_b_c.png')
  })
  it('trims dots/underscores and falls back to "file"', () => {
    expect(sanitizeAttachmentName('...')).toBe('file')
    expect(sanitizeAttachmentName('___.log')).toBe('file.log')
    expect(sanitizeAttachmentName('')).toBe('file')
  })
  it('caps the stem at 64 chars and keeps the extension', () => {
    const long = 'x'.repeat(200) + '.json'
    const out = sanitizeAttachmentName(long)
    expect(out.endsWith('.json')).toBe(true)
    expect(out.length).toBe(64 + 5)
  })
})

describe('dedupeAttachmentName', () => {
  it('appends -2, -3 … case-insensitively', () => {
    expect(dedupeAttachmentName('x.txt', [])).toBe('x.txt')
    expect(dedupeAttachmentName('x.txt', ['X.TXT'])).toBe('x-2.txt')
    expect(dedupeAttachmentName('x.txt', ['x.txt', 'x-2.txt'])).toBe('x-3.txt')
  })
  it('never collides with reserved report files', () => {
    expect(dedupeAttachmentName('screenshot.png', [])).toBe('screenshot-2.png')
  })
})

describe('mimeFromName / validateAttachmentSet', () => {
  it('maps by extension only', () => {
    expect(mimeFromName('notes.LOG')).toBe('text/plain')
    expect(mimeFromName('photo.jpeg')).toBe('image/jpeg')
    expect(mimeFromName('virus.exe')).toBeNull()
  })
  it('rejects too many, too large, unsupported', () => {
    const ok = { name: 'a.png', bytes: 10 }
    expect(validateAttachmentSet([ok, ok, ok, ok, ok])).toBeNull()
    expect(validateAttachmentSet([ok, ok, ok, ok, ok, ok])).toMatch(/Up to 5/)
    expect(validateAttachmentSet([{ name: 'big.png', bytes: ISSUE_LIMITS.maxFileBytes + 1 }])).toMatch(/larger than/)
    expect(validateAttachmentSet([{ name: 'x.exe', bytes: 1 }])).toMatch(/unsupported/)
    const eleven = { name: 'a.png', bytes: 7 * 1024 * 1024 }
    expect(validateAttachmentSet([eleven, eleven, eleven])).toMatch(/total more than/)
  })
})

describe('makeLocalId', () => {
  it('formats a UTC stamp plus 8 base36 chars', () => {
    const id = makeLocalId(new Date(Date.UTC(2026, 8, 11, 9, 30, 12)), () => 0.5)
    expect(id).toBe('20260911-093012-iiiiiiii')
    expect(LOCAL_ID_RE.test(id)).toBe(true)
  })
})

describe('mapRemoteStatus', () => {
  it('derives from state first, then labels', () => {
    expect(mapRemoteStatus('closed', 'completed', ['status:open'])).toBe('resolved')
    expect(mapRemoteStatus('CLOSED', 'not_planned', [])).toBe('not-planned')
    expect(mapRemoteStatus('open', null, ['status:fix-applied', 'from:app'])).toBe('fix-applied')
    expect(mapRemoteStatus('open', null, ['status:needs-info'])).toBe('needs-info')
    expect(mapRemoteStatus('open', null, ['status:decision'])).toBe('decision')
    expect(mapRemoteStatus('open', null, ['bug'])).toBe('open')
  })
})

describe('extractNotes', () => {
  const fix1 = '<!-- solodex:fix -->\n### Fix note\nfirst'
  const fix2 = '<!-- solodex:fix -->\n### Fix note\nsecond'
  const res = '  <!-- solodex:resolution -->\r\n### What was fixed\r\nplain words'
  it('takes the latest trusted marker comment of each kind and strips the marker', () => {
    const notes = extractNotes([
      { body: fix1, author: 'Scotts-Thoughts' },
      { body: 'just a comment', author: 'Scotts-Thoughts' },
      { body: res, author: 'scotts-thoughts' },
      { body: fix2, author: 'Scotts-Thoughts' },
    ])
    expect(notes.fix).toBe('### Fix note\nsecond')
    expect(notes.resolution).toBe('### What was fixed\nplain words')
    expect(notes.needsInfo).toBeUndefined()
  })
  it('ignores marker comments from other authors', () => {
    const notes = extractNotes([{ body: res, author: 'someone-else' }])
    expect(notes.resolution).toBeUndefined()
  })
})

describe('redactHome / pushBounded / formatBytes', () => {
  it('redacts both slash styles', () => {
    const out = redactHome('at C:\\Users\\scott\\app.js and C:/Users/scott/x', 'C:\\Users\\scott')
    expect(out).toBe('at <home>\\app.js and <home>/x')
  })
  it('keeps the newest entries', () => {
    let list: number[] = []
    for (let i = 0; i < 5; i++) list = pushBounded(list, i, 3)
    expect(list).toEqual([2, 3, 4])
  })
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB')
  })
})
