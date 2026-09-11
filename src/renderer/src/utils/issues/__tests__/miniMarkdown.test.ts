import { describe, it, expect } from 'vitest'
import { parseMarkdown, parseInline } from '../miniMarkdown'

describe('parseInline', () => {
  it('handles bold, code and links', () => {
    expect(parseInline('a **b** `c` [d](https://x.y)')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'link', href: 'https://x.y', children: [{ type: 'text', text: 'd' }] },
    ])
  })
  it('renders unsafe links as plain text and tolerates unmatched markers', () => {
    expect(parseInline('[x](javascript:void%200)')).toEqual([{ type: 'text', text: 'x' }])
    expect(parseInline('[f](file:///c:/x)')).toEqual([{ type: 'text', text: 'f' }])
    expect(parseInline('2 * 3 ** 4 `')).toEqual([{ type: 'text', text: '2 * 3 ** 4 `' }])
  })
})

describe('parseMarkdown', () => {
  it('splits headings, paragraphs, lists and fences', () => {
    const blocks = parseMarkdown([
      '<!-- solodex:resolution -->',
      '### What was fixed',
      '',
      'Line one',
      'line two.',
      '',
      '- first',
      '- second',
      '',
      '1. uno',
      '2) dos',
      '',
      '```ts',
      'const x = 1',
      '```',
      'tail',
    ].join('\n'))
    expect(blocks).toEqual([
      { type: 'heading', level: 3, inlines: [{ type: 'text', text: 'What was fixed' }] },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'Line one line two.' }] },
      { type: 'list', ordered: false, items: [[{ type: 'text', text: 'first' }], [{ type: 'text', text: 'second' }]] },
      { type: 'list', ordered: true, items: [[{ type: 'text', text: 'uno' }], [{ type: 'text', text: 'dos' }]] },
      { type: 'code', lang: 'ts', text: 'const x = 1' },
      { type: 'paragraph', inlines: [{ type: 'text', text: 'tail' }] },
    ])
  })
  it('closes an unterminated fence at EOF and drops multi-line comments', () => {
    const blocks = parseMarkdown('<!-- a\nb -->\n```\nx\ny')
    expect(blocks).toEqual([{ type: 'code', lang: '', text: 'x\ny' }])
  })
})
