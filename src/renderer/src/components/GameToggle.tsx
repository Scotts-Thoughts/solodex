import { GEN_GROUPS, GAME_COLOR, GAME_ABBREV } from '../data'

interface Props {
  games: string[]
  selected: string
  onChange: (game: string) => void
  onExitCompare?: () => void
  perGame?: boolean
}

export default function GameToggle({ games, selected, onChange, onExitCompare, perGame }: Props) {
  const activeGroup = GEN_GROUPS.find(g => g.games.includes(selected))

  return (
    <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-900 flex-wrap">
      {perGame
        ? games.map(game => {
            const isActive = game === selected
            const color = GAME_COLOR[game] ?? '#6B7280'
            return (
              <button
                key={game}
                onClick={() => onChange(game)}
                className="rounded px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-150"
                style={
                  isActive
                    ? { backgroundColor: color, color: '#fff' }
                    : { backgroundColor: '#1a1f29', color: '#8b96a5', border: `1px solid ${color}40` }
                }
                title={game}
              >
                {GAME_ABBREV[game] ?? game}
              </button>
            )
          })
        : GEN_GROUPS.filter(g => g.games.some(game => games.includes(game))).map(group => {
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
          })
      }
      {onExitCompare && (
        <>
          <div className="flex-1" />
          <button
            onClick={onExitCompare}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded text-xs font-medium transition-colors border border-gray-700"
          >
            Exit Comparison
          </button>
        </>
      )}
    </div>
  )
}
