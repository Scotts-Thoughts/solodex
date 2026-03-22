interface Props {
  category: string
  className?: string
}

export default function CategoryIcon({ category, className = 'w-4 h-4' }: Props) {
  switch (category) {
    case 'Physical':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-label="Physical">
          <rect rx="6" width="40" height="40" fill="#C92112" />
          <polygon
            points="20,4 23.5,14.5 34,14.5 25.5,21 28.5,32 20,25 11.5,32 14.5,21 6,14.5 16.5,14.5"
            fill="#F4934D"
          />
          <circle cx="20" cy="20" r="5.5" fill="#C92112" />
          <circle cx="20" cy="20" r="3" fill="#F4934D" />
        </svg>
      )
    case 'Special':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-label="Special">
          <rect rx="6" width="40" height="40" fill="#2F5697" />
          <circle cx="20" cy="20" r="13" fill="none" stroke="#6FC4E8" strokeWidth="3" />
          <circle cx="20" cy="20" r="7.5" fill="none" stroke="#6FC4E8" strokeWidth="3" />
          <circle cx="20" cy="20" r="3" fill="#6FC4E8" />
        </svg>
      )
    case 'Status':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-label="Status">
          <rect rx="6" width="40" height="40" fill="#8A8A8A" />
          <path
            d="M20 8 C12 8, 8 14, 14 20 C18 24, 22 22, 20 18 C18 14, 14 16, 16 20 C18 24, 24 28, 28 24 C34 18, 28 8, 20 8Z"
            fill="none"
            stroke="#F0F0F0"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )
    default:
      return null
  }
}
