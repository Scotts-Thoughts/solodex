// Splits a GitHub issue body (as built by the relay) into the parts the
// Developer Mode panel shows: the prose, the embedded image URLs and the
// diagnostics block, which is HTML the mini markdown renderer cannot display.

export interface IssueBodyParts {
  text: string
  images: { alt: string; url: string }[]
  diagnostics: string | null
}

const DETAILS = /<details>[\s\S]*?<\/details>/gi
const IMAGE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g
const DIAG = /<!-- solodex:diagnostics:start -->\s*`{3,}json\s*([\s\S]*?)`{3,}\s*<!-- solodex:diagnostics:end -->/

export function splitIssueBody(body: string): IssueBodyParts {
  const diag = body.match(DIAG)
  const images: { alt: string; url: string }[] = []
  const withoutDetails = body.replace(DETAILS, '')
  const text = withoutDetails
    .replace(IMAGE, (_m, alt: string, url: string) => {
      images.push({ alt, url })
      return ''
    })
    .replace(/^- \s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text, images, diagnostics: diag ? diag[1].trim() : null }
}
