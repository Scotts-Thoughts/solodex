import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/** Full-size view of a screenshot or image attachment (same pattern as the sprite lightbox in PokemonDetail). */
export default function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/85" onClick={onClose}>
      <img src={src} alt={alt} className="max-w-[92vw] max-h-[92vh] object-contain drop-shadow-2xl" onClick={e => e.stopPropagation()} />
    </div>,
    document.body
  )
}
