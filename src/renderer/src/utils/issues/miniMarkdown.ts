// A deliberately small markdown parser for the notes Claude posts on issues
// (headings, paragraphs, lists, bold, inline code, fenced code, links). The
// app has no markdown dependency and the notes are written to a template, so
// this subset is all that is needed. Pure: renders nothing itself.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; lang: string; text: string }

const SAFE_HREF = /^(https?:\/\/|mailto:)/i

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => { if (buf) { out.push({ type: 'text', text: buf }); buf = '' } }
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i) {
        flush()
        out.push({ type: 'code', text: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > i + 1) {
        flush()
        out.push({ type: 'bold', children: parseInline(text.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    if (ch === '[') {
      const close = text.indexOf(']', i + 1)
      if (close > i && text[close + 1] === '(') {
        const paren = text.indexOf(')', close + 2)
        if (paren > close) {
          const label = text.slice(i + 1, close)
          const href = text.slice(close + 2, paren).trim()
          flush()
          if (SAFE_HREF.test(href)) out.push({ type: 'link', href, children: parseInline(label) })
          else out.push({ type: 'text', text: label })
          i = paren + 1
          continue
        }
      }
    }
    buf += ch
    i++
  }
  flush()
  return out
}

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const FENCE = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/

export function parseMarkdown(src: string): Block[] {
  const lines = stripHtmlComments(src.replace(/\r\n/g, '\n')).split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', inlines: parseInline(para.join(' ')) })
      para = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(FENCE)
    if (fence) {
      flushPara()
      const marker = fence[1]
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++])
      blocks.push({ type: 'code', lang: fence[2], text: body.join('\n') })
      continue
    }
    if (!line.trim()) { flushPara(); continue }
    const heading = line.match(HEADING)
    if (heading) {
      flushPara()
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2].trim()) })
      continue
    }
    const bullet = line.match(BULLET)
    const numbered = bullet ? null : line.match(NUMBERED)
    if (bullet || numbered) {
      flushPara()
      const ordered = Boolean(numbered)
      const items: Inline[][] = []
      while (i < lines.length) {
        const m = ordered ? lines[i].match(NUMBERED) : lines[i].match(BULLET)
        if (!m) break
        items.push(parseInline(m[1].trim()))
        i++
      }
      i--
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    para.push(line.trim())
  }
  flushPara()
  return blocks
}

function stripHtmlComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, '')
}
