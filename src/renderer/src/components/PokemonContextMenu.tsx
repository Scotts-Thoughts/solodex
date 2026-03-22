import { useEffect } from 'react'
import { getGamesForPokemon, displayName } from '../data'
import { POPOVER_Z } from '../constants/ui'

interface Props {
  x: number
  y: number
  targetName: string
  selected: string | null
  selectedGame: string
  comparingWith: string | null
  onCompare?: (name: string) => void
  onSelfCompare?: (name: string) => void
  onTripleCompare?: (name: string) => void
  onClose: () => void
}

export default function PokemonContextMenu({
  x, y, targetName, selected, selectedGame, comparingWith,
  onCompare, onSelfCompare, onTripleCompare, onClose
}: Props) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const isSelf = targetName === selected
  const targetGames = getGamesForPokemon(targetName)
  const selectedGames = selected ? getGamesForPokemon(selected) : []
  const compareDisabled = isSelf || !selected || !targetGames.includes(selectedGame) || !selectedGames.includes(selectedGame)
  const selfCompareDisabled = targetGames.length <= 1
  const tripleDisabled = !comparingWith || targetName === selected || targetName === comparingWith || !targetGames.includes(selectedGame)

  return (
    <div
      data-pokemon-context-menu
      style={{ position: 'fixed', left: x, top: y, zIndex: POPOVER_Z + 1 }}
      className="bg-gray-800 border border-gray-600 rounded-lg shadow-2xl py-1 min-w-[220px]"
    >
      <button
        disabled={compareDisabled}
        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
          compareDisabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-200 hover:bg-gray-700'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          if (!compareDisabled) {
            onCompare?.(targetName)
            onClose()
          }
        }}
      >
        Compare {selected ? displayName(selected) : '\u2026'} to {displayName(targetName)}
      </button>
      <button
        disabled={tripleDisabled}
        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
          tripleDisabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-200 hover:bg-gray-700'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          if (!tripleDisabled) {
            onTripleCompare?.(targetName)
            onClose()
          }
        }}
      >
        Add {displayName(targetName)} to comparison
      </button>
      <button
        disabled={selfCompareDisabled}
        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
          selfCompareDisabled ? 'text-gray-600 cursor-not-allowed' : 'text-gray-200 hover:bg-gray-700'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          if (!selfCompareDisabled) {
            onSelfCompare?.(targetName)
            onClose()
          }
        }}
      >
        Compare {displayName(targetName)} across generations
      </button>
    </div>
  )
}
