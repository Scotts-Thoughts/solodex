/**
 * Shrink a rendered Bulbapedia TM page (~90 KB) to the markup TmPopover's
 * parseTmLocations reads (~a few KB): the top-level tables that mention a
 * location, reduced to table/tr/th/td/a tags with only the links' `title`.
 *
 * The parser only uses those tags, link titles and cell textContent, so the
 * dropped tags (spans, images, bold, small …) and attributes change nothing:
 * a removed tag contributes no text. Whitespace is dropped only where it
 * touches a table-structure tag, which is outside any cell or at a cell's
 * edge (trimmed by the parser).
 */

const KEPT_TAGS = new Set(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'])
const STRUCTURE = 'table|thead|tbody|tr|th|td'

/** Every top-level <table>…</table> in the document, nested tables included in their parent. */
function topLevelTables(html: string): string[] {
  const tables: string[] = []
  const tag = /<(\/?)table\b[^>]*>/gi
  let depth = 0
  let start = -1
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    if (m[1]) {
      if (depth === 0) continue
      if (--depth === 0) tables.push(html.slice(start, m.index + m[0].length))
    } else if (depth++ === 0) {
      start = m.index
    }
  }
  return tables
}

function stripTag(tag: string): string {
  const m = /^<(\/?)([a-z0-9]+)\b([^>]*)>$/i.exec(tag)
  if (!m) return ''
  const [, close, rawName, attrs] = m
  const name = rawName.toLowerCase()
  if (!KEPT_TAGS.has(name)) return ''
  if (close) return `</${name}>`
  if (name === 'a') {
    const title = /\btitle="([^"]*)"/i.exec(attrs)
    return title ? `<a title="${title[1]}">` : '<a>'
  }
  return `<${name}>`
}

export function compactTmHtml(html: string): string {
  return topLevelTables(html)
    .filter(t => /location/i.test(t))
    .map(t => t
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, stripTag)
      .replace(new RegExp(`\\s+(?=</?(?:${STRUCTURE})>)`, 'g'), '')
      .replace(new RegExp(`(<\\/?(?:${STRUCTURE})>)\\s+`, 'g'), '$1'))
    .join('')
}
