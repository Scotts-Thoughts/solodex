import physicalIcon from '@/assets/move-physical.png'
import specialIcon from '@/assets/move-special.png'
import statusIcon from '@/assets/move-status.png'

interface Props {
  category: string
  className?: string
}

const ICONS: Record<string, string> = {
  Physical: physicalIcon,
  Special: specialIcon,
  Status: statusIcon,
}

export default function CategoryIcon({ category, className = 'h-4 w-auto' }: Props) {
  const src = ICONS[category]
  if (!src) return null
  return (
    <img
      src={src}
      alt={category}
      aria-label={category}
      className={`max-w-none ${className}`}
      style={{ filter: 'brightness(1.35)' }}
    />
  )
}
