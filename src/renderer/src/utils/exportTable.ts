import { getExportBgColor } from './exportSettings'
import { buildExportFilename } from './exportFilename'

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
