import { GAME_ABBREV } from '../data'

interface Props {
  games: string[]
  selected: string
  onChange: (game: string) => void
}

const GEN_COLORS: Record<string, string> = {
  'Red and Blue': '#CC0000',
  Yellow: '#F5C400',
  'Gold and Silver': '#B8860B',
  Crystal: '#4FC3F7',
  'Ruby and Sapphire': '#CC0000',
  Emerald: '#00897B',
  'FireRed and LeafGreen': '#E64A19',
  'Diamond and Pearl': '#7986CB',
  Platinum: '#90A4AE',
  'HeartGold and SoulSilver': '#FFB300',
  Black: '#424242'
}

export default function GameToggle({ games, selected, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-3 bg-gray-900 border-b border-gray-700">
      {games.map((game) => {
        const isActive = game === selected
        const color = GEN_COLORS[game] ?? '#6B7280'
        return (
          <button
            key={game}
            onClick={() => onChange(game)}
            title={game}
            className="rounded px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-150"
            style={
              isActive
                ? { backgroundColor: color, color: '#fff' }
                : { backgroundColor: '#374151', color: '#9CA3AF', border: `1px solid ${color}40` }
            }
          >
            {GAME_ABBREV[game] ?? game}
          </button>
        )
      })}
    </div>
  )
}
