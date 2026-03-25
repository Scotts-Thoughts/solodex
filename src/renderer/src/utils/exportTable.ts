import { getExportBgColor } from './exportSettings'

export async function downloadTableImage(el: HTMLElement | null, filename: string, title: string) {
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
    })
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
  } finally {
    titleEl.remove()
    ths.forEach((th, i) => { th.style.backgroundColor = origBgs[i] })
  }
}
