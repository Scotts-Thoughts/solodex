import { describe, it, expect } from 'vitest'
import { splitIssueBody } from '../issueBody'

describe('splitIssueBody', () => {
  it('pulls out images and the diagnostics block', () => {
    const body = [
      '_Reported from Solodex 1.8.16_',
      '',
      'It broke.',
      '',
      '### Screenshot',
      '![screenshot](https://raw.githubusercontent.com/o/r/main/issues/2026/x/screenshot.png)',
      '',
      '### Attachments',
      '- ![photo.jpg](https://raw.githubusercontent.com/o/r/main/issues/2026/x/photo.jpg) — 1 KB',
      '- [crash.log](https://raw.githubusercontent.com/o/r/main/issues/2026/x/crash.log) — 2 KB',
      '',
      '<details><summary>Diagnostics</summary>',
      '',
      '<!-- solodex:diagnostics:start -->',
      '````json',
      '{ "schema": "solodex-report/1" }',
      '````',
      '<!-- solodex:diagnostics:end -->',
      '',
      '</details>',
      '<!-- solodex:report v1 x -->',
    ].join('\n')
    const parts = splitIssueBody(body)
    expect(parts.images.map(i => i.url)).toEqual([
      'https://raw.githubusercontent.com/o/r/main/issues/2026/x/screenshot.png',
      'https://raw.githubusercontent.com/o/r/main/issues/2026/x/photo.jpg',
    ])
    expect(parts.diagnostics).toBe('{ "schema": "solodex-report/1" }')
    expect(parts.text).toContain('It broke.')
    expect(parts.text).toContain('[crash.log](https://raw.githubusercontent.com/o/r/main/issues/2026/x/crash.log)')
    expect(parts.text).not.toContain('<details>')
    expect(parts.text).not.toContain('screenshot.png')
  })
})
