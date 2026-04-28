import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GAMES,
  GAME_ABBREV,
  getAllMoveNames,
  getStaticBannedMoves,
  getStaticConditionalMoves,
  getStaticPostgameMoves,
  type UserBans,
} from '../data'

type Tab = 'banned' | 'conditional' | 'perGame'

interface Props {
  userBans: UserBans
  onChange: (next: UserBans) => void
  onClose: () => void
  initialGame?: string
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'banned', label: 'Banned globally' },
  { id: 'conditional', label: 'Conditional' },
  { id: 'perGame', label: 'Per-game' },
]

export default function BannedMovesModal({ userBans, onChange, onClose, initialGame }: Props) {
  const [tab, setTab] = useState<Tab>('banned')
  const [game, setGame] = useState<string>(() => {
    if (initialGame && (GAMES as readonly string[]).includes(initialGame)) return initialGame
    return GAMES[0]
  })
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [tab])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const allMoves = useMemo(() => getAllMoveNames(), [])

  const userList: string[] = useMemo(() => {
    if (tab === 'banned') return userBans.banned
    if (tab === 'conditional') return userBans.conditional
    return userBans.byGame[game] ?? []
  }, [tab, userBans, game])

  const staticList: string[] = useMemo(() => {
    if (tab === 'banned') return getStaticBannedMoves()
    if (tab === 'conditional') return getStaticConditionalMoves()
    return getStaticPostgameMoves(game)
  }, [tab, game])

  const userSet = useMemo(() => new Set(userList), [userList])
  const staticSet = useMemo(() => new Set(staticList), [staticList])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allMoves
      .filter(m => m.toLowerCase().includes(q) && !userSet.has(m))
      .slice(0, 8)
  }, [query, allMoves, userSet])

  useEffect(() => { setHighlight(0) }, [query, tab, game])

  function updateBans(next: UserBans) {
    onChange(next)
  }

  function addMove(name: string) {
    if (!name) return
    if (tab === 'banned') {
      if (userBans.banned.includes(name)) return
      updateBans({ ...userBans, banned: [...userBans.banned, name].sort() })
    } else if (tab === 'conditional') {
      if (userBans.conditional.includes(name)) return
      updateBans({ ...userBans, conditional: [...userBans.conditional, name].sort() })
    } else {
      const cur = userBans.byGame[game] ?? []
      if (cur.includes(name)) return
      updateBans({
        ...userBans,
        byGame: { ...userBans.byGame, [game]: [...cur, name].sort() },
      })
    }
    setQuery('')
    inputRef.current?.focus()
  }

  function removeMove(name: string) {
    if (tab === 'banned') {
      updateBans({ ...userBans, banned: userBans.banned.filter(m => m !== name) })
    } else if (tab === 'conditional') {
      updateBans({ ...userBans, conditional: userBans.conditional.filter(m => m !== name) })
    } else {
      const cur = (userBans.byGame[game] ?? []).filter(m => m !== name)
      const nextByGame = { ...userBans.byGame }
      if (cur.length === 0) delete nextByGame[game]
      else nextByGame[game] = cur
      updateBans({ ...userBans, byGame: nextByGame })
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = suggestions[highlight]
      if (pick) addMove(pick)
      else if (query.trim() && allMoves.includes(query.trim())) addMove(query.trim())
    }
  }

  const description = tab === 'banned'
    ? 'These moves are crossed out across every game when "Cross-out banned moves" is on.'
    : tab === 'conditional'
      ? 'A separate global list, crossed out when "Cross-out conditionally banned moves" is on. Use it for moves you want to flag without lumping them in with hard bans.'
      : `Crossed out only in ${game} when "Cross-out post-game moves" is on.`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-label="Define Banned Moves"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl w-[640px] max-h-[80vh] flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Define Banned Moves</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
          >
            &times;
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 border-b border-gray-700">
          <div className="inline-flex rounded overflow-hidden border border-gray-700 bg-gray-900">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  'px-3 py-1.5 text-xs font-bold transition-colors',
                  tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'perGame' && (
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">Game</label>
              <select
                value={game}
                onChange={(e) => setGame(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
              >
                {GAMES.map(g => (
                  <option key={g} value={g}>{g} ({GAME_ABBREV[g]})</option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">{description}</p>
        </div>

        <div className="px-6 py-3 border-b border-gray-700">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search a move to ban…"
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-gray-900 border border-gray-700 rounded shadow-lg max-h-64 overflow-y-auto">
                {suggestions.map((m, i) => {
                  const inStatic = staticSet.has(m)
                  return (
                    <button
                      key={m}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => addMove(m)}
                      className={[
                        'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between',
                        i === highlight ? 'bg-blue-600/30 text-white' : 'text-gray-200 hover:bg-gray-800',
                      ].join(' ')}
                    >
                      <span>{m}</span>
                      {inStatic && (
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">already built-in</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Your bans ({userList.length})
          </h3>
          {userList.length === 0 ? (
            <p className="text-xs text-gray-600 mb-4">No moves added yet.</p>
          ) : (
            <ul className="mb-4 flex flex-wrap gap-2">
              {userList.map(m => (
                <li
                  key={m}
                  className="flex items-center gap-1.5 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
                >
                  <span>{m}</span>
                  <button
                    onClick={() => removeMove(m)}
                    className="text-gray-500 hover:text-red-400 text-xs leading-none"
                    title="Remove"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}

          {staticList.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Built-in ({staticList.length})
              </h3>
              <ul className="flex flex-wrap gap-2">
                {staticList.map(m => (
                  <li
                    key={m}
                    className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-gray-500"
                    title="Built-in entry — cannot be removed"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-gray-700 text-sm text-gray-200 hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
