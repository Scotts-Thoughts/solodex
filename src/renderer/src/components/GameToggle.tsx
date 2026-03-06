import { GEN_GROUPS } from '../data'

interface Props {
  games: string[]
  selected: string
  onChange: (game: string) => void
}

export default function GameToggle({ games, selected, onChange }: Props) {
  const activeGroup = GEN_GROUPS.find(g => g.games.includes(selected))

  return (
    <div className="flex gap-1.5 px-4 py-3 bg-gray-900 border-b border-gray-700">
      {GEN_GROUPS.filter(g => g.games.some(game => games.includes(game))).map(group => {
        const isActive = group === activeGroup
        return (
          <button
            key={group.label}
            onClick={() => {
              const first = group.games.find(g => games.includes(g))
              if (first) onChange(first)
            }}
            className="rounded px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-150"
            style={
              isActive
                ? { backgroundColor: group.color, color: '#fff' }
                : { backgroundColor: '#1a1f29', color: '#8b96a5', border: `1px solid ${group.color}40` }
            }
          >
            {group.label}
          </button>
        )
      })}
    </div>
  )
}
