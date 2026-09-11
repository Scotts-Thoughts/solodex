import { describe, it, expect } from 'vitest'
import {
  nextRetryDelayMs,
  shouldRefresh,
  isSendDue,
  isPng,
  contentsBody,
  rawUrlFor,
  buildIssueMarkdown,
  parseGhIssueList,
  classifyGhError,
} from '../pure'
import type { IssueRecord } from '../../../shared/issues'

const record: IssueRecord = {
  schema: 1,
  id: '20260911-093012-abcdefgh',
  createdAt: '2026-09-11T09:30:12.000Z',
  title: 'Damage view crashes',
  description: 'Steps: open damage view',
  diagnostics: {
    schema: 'solodex-report/1',
    reportId: '20260911-093012-abcdefgh',
    createdAt: '2026-09-11T09:30:12.000Z',
    source: 'button',
    app: { version: '1.8.16', packaged: true },
    runtime: { electron: '28.3.3', chrome: '120', node: '18', platform: 'win32', arch: 'x64', osRelease: '10.0', locale: 'en-US' },
    window: { width: 1400, height: 860, scaleFactor: 1, maximized: false },
    state: { view: 'damage', game: 'Platinum', species: 'Garchomp' },
    recentErrors: [],
  },
  screenshot: { file: 'screenshot.png', original: null, width: 1400, height: 860 },
  attachments: [
    { name: 'photo.jpg', mime: 'image/jpeg', bytes: 2048, file: 'attachments/photo.jpg' },
    { name: 'crash.log', mime: 'text/plain', bytes: 100, file: 'attachments/crash.log' },
  ],
  sendToDeveloper: true,
  send: 'pending',
  sendAttempts: 0,
}

describe('retry / refresh timing', () => {
  it('backs off and caps at a day', () => {
    expect(nextRetryDelayMs(1)).toBe(60e3)
    expect(nextRetryDelayMs(2)).toBe(300e3)
    expect(nextRetryDelayMs(6)).toBe(86400e3)
    expect(nextRetryDelayMs(40)).toBe(86400e3)
  })
  it('refreshes unresolved issues at most every 10 minutes unless forced', () => {
    const now = Date.parse('2026-09-11T10:00:00Z')
    const remote = { number: 1, url: 'u', status: 'open' as const, lastCheckedAt: '2026-09-11T09:55:00Z' }
    expect(shouldRefresh(remote, now)).toBe(false)
    expect(shouldRefresh({ ...remote, lastCheckedAt: '2026-09-11T09:40:00Z' }, now)).toBe(true)
    expect(shouldRefresh({ ...remote, status: 'resolved' }, now)).toBe(false)
    expect(shouldRefresh({ ...remote, status: 'resolved' }, now, true)).toBe(true)
    expect(shouldRefresh(undefined, now, true)).toBe(false)
  })
  it('respects nextRetryAt and the send state', () => {
    const now = Date.parse('2026-09-11T10:00:00Z')
    expect(isSendDue(record, now)).toBe(true)
    expect(isSendDue({ ...record, nextRetryAt: '2026-09-11T10:30:00Z' }, now)).toBe(false)
    expect(isSendDue({ ...record, send: 'sent' }, now)).toBe(false)
    expect(isSendDue({ ...record, sendToDeveloper: false }, now)).toBe(false)
  })
})

describe('bytes and URLs', () => {
  it('detects PNG magic', () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true)
    expect(isPng(new Uint8Array([0xff, 0xd8]))).toBe(false)
  })
  it('builds the Contents-API body and raw URLs', () => {
    expect(JSON.parse(contentsBody('AAAA', 'msg'))).toEqual({ message: 'msg', content: 'AAAA' })
    expect(rawUrlFor('o/r', 'main', '20260911-093012-abcdefgh', 'screenshot.png'))
      .toBe('https://raw.githubusercontent.com/o/r/main/issues/2026/20260911-093012-abcdefgh/screenshot.png')
  })
})

describe('buildIssueMarkdown', () => {
  it('renders title, description, screenshot, attachments and diagnostics', () => {
    const md = buildIssueMarkdown(record)
    expect(md).toContain('# Damage view crashes')
    expect(md).toContain('![screenshot](screenshot.png)')
    expect(md).toContain('- ![photo.jpg](attachments/photo.jpg) — 2 KB')
    expect(md).toContain('- [crash.log](attachments/crash.log) — 100 B')
    expect(md).toContain('"schema": "solodex-report/1"')
  })
})

describe('parseGhIssueList', () => {
  it('maps state, labels and trusted notes', () => {
    const json = JSON.stringify([
      {
        number: 3, title: 'T', url: 'https://github.com/x/y/issues/3', state: 'OPEN', labels: [{ name: 'status:fix-applied' }],
        updatedAt: '2026-09-11T00:00:00Z', body: 'b',
        comments: [
          { body: '<!-- solodex:resolution -->\nAll good now.', author: { login: 'Scotts-Thoughts' } },
          { body: '<!-- solodex:resolution -->\nfake', author: { login: 'mallory' } },
        ],
      },
      { number: 4, title: 'U', url: 'u', state: 'CLOSED', stateReason: 'NOT_PLANNED', labels: [], updatedAt: 'x' },
    ])
    const out = parseGhIssueList(json)
    expect(out[0].status).toBe('fix-applied')
    expect(out[0].resolutionMarkdown).toBe('All good now.')
    expect(out[1].state).toBe('closed')
    expect(out[1].status).toBe('not-planned') // gh spells it NOT_PLANNED; REST spells it not_planned
  })
})

describe('classifyGhError', () => {
  it('recognises a missing binary, auth problems and generic failures', () => {
    expect(classifyGhError({ code: 'ENOENT' }, '').code).toBe('gh-missing')
    expect(classifyGhError({ code: 1 }, 'To get started with GitHub CLI, please run:  gh auth login').code).toBe('gh-unauthenticated')
    expect(classifyGhError({ code: 4 }, '').code).toBe('gh-unauthenticated')
    const generic = classifyGhError({ code: 1, message: 'exit 1' }, 'GraphQL: Could not resolve to an Issue')
    expect(generic.code).toBe('gh-failed')
    expect(generic.error).toContain('Could not resolve')
  })
})
