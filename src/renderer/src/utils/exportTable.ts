import { getExportBgColor } from './exportSettings'
import { buildExportFilename } from './exportFilename'

export async function downloadMovepoolImage(
  el: HTMLElement | null,
  baseName: string,
  game?: string | null,
) {
  if (!el) return
  const { toPng } = await import('html-to-image')

  const restore: Array<() => void> = []

  // Reveal section headers and hide their interactive count/copy text
  const headers = Array.from(el.querySelectorAll<HTMLElement>('[data-section-header]'))
  headers.forEach(h => {
    if (h.hasAttribute('data-export-ignore')) {
      const prev = h.getAttribute('data-export-ignore')
      h.removeAttribute('data-export-ignore')
      restore.push(() => { h.setAttribute('data-export-ignore', prev ?? '') })
    }
    h.querySelectorAll<HTMLElement>('[data-section-interactive]').forEach(node => {
      const prev = node.style.display
      node.style.display = 'none'
      restore.push(() => { node.style.display = prev })
    })
  })

  // Neutralize scroll clipping so the full content renders
  const prevMaxH = el.style.maxHeight
  const prevOverflow = el.style.overflow
  const prevHeight = el.style.height
  el.style.maxHeight = 'none'
  el.style.overflow = 'visible'
  el.style.height = 'auto'
  restore.push(() => {
    el.style.maxHeight = prevMaxH
    el.style.overflow = prevOverflow
    el.style.height = prevHeight
  })

  const ths = el.querySelectorAll<HTMLElement>('th')
  const origBgs = Array.from(ths).map(th => th.style.backgroundColor)
  ths.forEach(th => { th.style.backgroundColor = 'transparent' })
  restore.push(() => { ths.forEach((th, i) => { th.style.backgroundColor = origBgs[i] }) })

  try {
    const fullWidth = el.scrollWidth
    const fullHeight = el.scrollHeight
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: getExportBgColor(),
      filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
      width: fullWidth,
      height: fullHeight,
      style: { width: `${fullWidth}px`, height: `${fullHeight}px`, maxHeight: 'none', overflow: 'visible' },
    })
    const link = document.createElement('a')
    link.download = buildExportFilename(game, baseName)
    link.href = dataUrl
    link.click()
  } finally {
    restore.forEach(fn => fn())
  }
}

export async function downloadTableImage(
  el: HTMLElement | null,
  baseName: string,
  title: string,
  game?: string | null,
) {
  if (!el) return
  const { toPng } = await import('html-to-image')

  // Temporarily prepend a centered title
  const titleEl = document.createElement('div')
  titleEl.textContent = title
  titleEl.style.cssText = 'text-align:center;font-size:14px;font-weight:600;color:white;padding-bottom:6px;'
  el.prepend(titleEl)

  // Remove thead background colors temporarily
  const ths = el.querySelectorAll<HTMLElement>('th')
  const origBgs = Array.from(ths).map(th => th.style.backgroundColor)
  ths.forEach(th => { th.style.backgroundColor = 'transparent' })

  try {
    const dataUrl = await toPng(el, {
      pixelRatio: 2,
      backgroundColor: getExportBgColor(),
      filter: (node: HTMLElement) => !node.dataset?.exportIgnore,
      width: el.scrollWidth,
      height: el.scrollHeight,
      style: { width: `${el.scrollWidth}px` },
    })
    const link = document.createElement('a')
    link.download = buildExportFilename(game, baseName)
    link.href = dataUrl
    link.click()
  } finally {
    titleEl.remove()
    ths.forEach((th, i) => { th.style.backgroundColor = origBgs[i] })
  }
}
