import { describe, it, expect } from 'vitest'
import { buildIssueBody, parseDiagnostics, extractImages, sanitizeFilename, isAllowedName, attachmentPath, rawUrl, type CreateInput } from '../src/format'

const input: CreateInput = {
  reportId: '20260911-093012-abcdefgh',
  title: 'Damage view crashes',
  description: 'Steps:\n1. open\n\n```\nnot a fence problem\n```',
  diagnostics: {
    schema: 'solodex-report/1',
    reportId: '20260911-093012-abcdefgh',
    app: { version: '1.8.16', packaged: true },
    runtime: { platform: 'win32', arch: 'x64' },
    state: { view: 'damage', game: 'Platinum', species: 'Garchomp' },
  },
  screenshot: { url: 'https://raw.githubusercontent.com/o/a/main/issues/2026/20260911-093012-abcdefgh/screenshot.png', width: 1400, height: 860 },
  attachments: [
    { name: 'photo.jpg', mime: 'image/jpeg', bytes: 2048, url: 'https://raw.githubusercontent.com/o/a/main/issues/2026/20260911-093012-abcdefgh/photo.jpg' },
    { name: 'crash.log', mime: 'text/plain', bytes: 100, url: 'https://raw.githubusercontent.com/o/a/main/issues/2026/20260911-093012-abcdefgh/crash.log' },
  ],
}

describe('buildIssueBody / parseDiagnostics', () => {
  const body = buildIssueBody(input, '2026-09-11T10:00:00.000Z')

  it('embeds images, links text files and carries the markers', () => {
    expect(body.startsWith('_Reported from Solodex 1.8.16 · win32 x64 · Platinum · damage view · Garchomp_')).toBe(true)
    expect(body).toContain('![screenshot](https://raw.githubusercontent.com/o/a/main/issues/2026/20260911-093012-abcdefgh/screenshot.png)')
    expect(body).toContain('- ![photo.jpg](https://raw.githubusercontent.com/o/a/main/issues/2026/20260911-093012-abcdefgh/photo.jpg) — 2 KB')
    expect(body).toContain('- [crash.log](https://raw.githubusercontent.com/o/a/main/issues/2026/20260911-093012-abcdefgh/crash.log) — 100 B')
    expect(body.trim().endsWith('<!-- solodex:report v1 20260911-093012-abcdefgh -->')).toBe(true)
  })

  it('round-trips the diagnostics even when the description contains a fence', () => {
    const d = parseDiagnostics(body)!
    expect(d.schema).toBe('solodex-report/1')
    expect(d.receivedAt).toBe('2026-09-11T10:00:00.000Z')
    const atts = d.attachments as { kind: string; name: string }[]
    expect(atts.map(a => `${a.kind}:${a.name}`)).toEqual(['screenshot:screenshot.png', 'image:photo.jpg', 'text:crash.log'])
    expect(parseDiagnostics('no block here')).toBeNull()
  })

  it('lists the images in order', () => {
    expect(extractImages(body).map(i => i.alt)).toEqual(['screenshot', 'photo.jpg'])
  })

  it('stays well under the GitHub body limit at maximum inputs', () => {
    const big = buildIssueBody({ ...input, description: 'x'.repeat(10_000), diagnostics: { pad: 'y'.repeat(32 * 1024) } }, 'now')
    expect(big.length).toBeLessThan(65_536)
  })
})

describe('names and paths', () => {
  it('sanitises like the app does', () => {
    expect(sanitizeFilename('../../x.png')).toBe('x.png')
    expect(sanitizeFilename('My Photo (1).JPG')).toBe('My_Photo_1.jpg')
    expect(sanitizeFilename('')).toBe('file')
  })
  it('only allows safe names with known extensions', () => {
    expect(isAllowedName('crash.log')).toBe(true)
    expect(isAllowedName('a b.png')).toBe(false)
    expect(isAllowedName('evil.exe')).toBe(false)
    expect(isAllowedName('x'.repeat(101) + '.png')).toBe(false)
  })
  it('builds attachment paths and raw URLs', () => {
    expect(attachmentPath('2026', 'id', 'a.png')).toBe('issues/2026/id/a.png')
    expect(rawUrl('o/r', 'main', 'issues/2026/id/a.png')).toBe('https://raw.githubusercontent.com/o/r/main/issues/2026/id/a.png')
  })
})
