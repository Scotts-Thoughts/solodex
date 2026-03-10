import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { GAME_TO_GEN } from '../data'

// Bulbapedia link titles → our game names
// Includes both short and full variants Bulbapedia uses
const BULBA_TO_GAME: Record<string, string> = {
  'Pokémon Red Version':                       'Red and Blue',
  'Pokémon Blue Version':                      'Red and Blue',
  'Pokémon Red and Blue Versions':             'Red and Blue',
  'Pokémon Yellow Version':                    'Yellow',
  'Pokémon Yellow Version: Special Pikachu Edition': 'Yellow',
  'Pokémon Gold Version':                      'Gold and Silver',
  'Pokémon Silver Version':                    'Gold and Silver',
  'Pokémon Gold and Silver Versions':          'Gold and Silver',
  'Pokémon Crystal Version':                   'Crystal',
  'Pokémon Ruby Version':                      'Ruby and Sapphire',
  'Pokémon Sapphire Version':                  'Ruby and Sapphire',
  'Pokémon Ruby and Sapphire Versions':        'Ruby and Sapphire',
  'Pokémon Emerald Version':                   'Emerald',
  'Pokémon FireRed Version':                   'FireRed and LeafGreen',
  'Pokémon LeafGreen Version':                 'FireRed and LeafGreen',
  'Pokémon FireRed and LeafGreen Versions':    'FireRed and LeafGreen',
  'Pokémon Diamond Version':                   'Diamond and Pearl',
  'Pokémon Pearl Version':                     'Diamond and Pearl',
  'Pokémon Diamond and Pearl Versions':        'Diamond and Pearl',
  'Pokémon Platinum Version':                  'Platinum',
  'Pokémon HeartGold Version':                 'HeartGold and SoulSilver',
  'Pokémon SoulSilver Version':                'HeartGold and SoulSilver',
  'Pokémon HeartGold and SoulSilver Versions': 'HeartGold and SoulSilver',
  'Pokémon Black Version':                     'Black',
  'Pokémon White Version':                     'Black',
  'Pokémon Black and White Versions':          'Black',
  'Pokémon Black 2 Version':                   'Black 2 and White 2',
  'Pokémon White 2 Version':                   'Black 2 and White 2',
  'Pokémon Black 2 and White 2 Versions':      'Black 2 and White 2',
  'Pokémon Black and White Versions 2':        'Black 2 and White 2',
  'Pokémon X':                                 'X and Y',
  'Pokémon Y':                                 'X and Y',
  'Pokémon X and Y':                           'X and Y',
  'Pokémon Omega Ruby':                        'Omega Ruby and Alpha Sapphire',
  'Pokémon Alpha Sapphire':                    'Omega Ruby and Alpha Sapphire',
  'Pokémon Omega Ruby and Alpha Sapphire':     'Omega Ruby and Alpha Sapphire',
  'Pokémon Sun':                               'Sun and Moon',
  'Pokémon Moon':                              'Sun and Moon',
  'Pokémon Sun and Moon':                      'Sun and Moon',
  'Pokémon Ultra Sun':                         'Ultra Sun and Ultra Moon',
  'Pokémon Ultra Moon':                        'Ultra Sun and Ultra Moon',
  'Pokémon Ultra Sun and Ultra Moon':          'Ultra Sun and Ultra Moon',
  'Pokémon Sword':                             'Sword and Shield',
  'Pokémon Shield':                            'Sword and Shield',
  'Pokémon Sword and Shield':                  'Sword and Shield',
  'Pokémon Scarlet':                           'Scarlet and Violet',
  'Pokémon Violet':                            'Scarlet and Violet',
  'Pokémon Scarlet and Violet':                'Scarlet and Violet',
}

// Display names for games whose internal name doesn't include both versions
const GAME_DISPLAY_NAME: Record<string, string> = {
  'Black': 'Black and White',
}

interface LocationRow {
  game: string
  location: string
  purchase?: string
  sell?: string
}

function parseTmLocations(html: string, targetGen: string): LocationRow[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const results = new Map<string, LocationRow>()

  for (const table of doc.querySelectorAll('table')) {
    const headerRow = Array.from(table.querySelectorAll('tr')).find(tr => tr.querySelector('th'))
    if (!headerRow) continue

    const headers = Array.from(headerRow.querySelectorAll('th')).map(
      th => th.textContent?.trim().toLowerCase() ?? ''
    )
    if (!headers.some(h => h.includes('location'))) continue

    // Determine which data column indices contain location/purchase/sell.
    // Headers are in order matching the data cells after the game cell.
    // We only care about the header *order* (not colspan) since Bulbapedia
    // data rows sometimes don't expand colspans into separate cells.
    const hasPurchase = headers.some(h => h.includes('purchase'))
    const hasSell     = headers.some(h => h.includes('sell'))

    for (const row of table.querySelectorAll('tr')) {
      const cells = Array.from(row.querySelectorAll('td'))
      if (cells.length < 2) continue

      // First cell is always the game cell; location is always cell[1]
      const gameCell = cells[0]
      const location = cells[1]?.textContent?.trim() ?? ''

      // Purchase and sell are the last two data cells when those headers exist
      let purchase: string | undefined
      let sell: string | undefined
      if (hasPurchase && hasSell && cells.length >= 4) {
        purchase = cells[cells.length - 2]?.textContent?.trim() || undefined
        sell     = cells[cells.length - 1]?.textContent?.trim() || undefined
      } else if (hasPurchase && cells.length >= 3) {
        purchase = cells[cells.length - 1]?.textContent?.trim() || undefined
      }

      const games: string[] = []
      for (const link of gameCell.querySelectorAll('a[title]')) {
        const game = BULBA_TO_GAME[link.getAttribute('title') ?? '']
        if (game && !games.includes(game)) games.push(game)
      }
      if (games.length === 0) continue

      const genGames = games.filter(g => GAME_TO_GEN[g] === targetGen)
      if (genGames.length === 0) continue

      for (const game of genGames) {
        if (!results.has(game)) results.set(game, { game, location, purchase, sell })
      }
    }
  }

  return Array.from(results.values())
}

interface InnerProps {
  tmCode: string
  game: string
  anchorRect: DOMRect
  onClose: () => void
}

function PopoverInner({ tmCode, game, anchorRect, onClose }: InnerProps) {
  const [rows, setRows] = useState<LocationRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  const gen = GAME_TO_GEN[game] ?? '4'
  const paddedCode = tmCode.startsWith('TM')
    ? 'TM' + tmCode.slice(2).padStart(3, '0')
    : tmCode
  const bulbaUrl = `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(paddedCode)}`

  useEffect(() => {
    let cancelled = false
    window.electronAPI.fetchTmPage(tmCode).then(html => {
      if (cancelled) return
      if (!html) { setLoading(false); return }
      setRows(parseTmLocations(html, gen))
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tmCode, gen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-tm-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Position to the right of the anchor; flip left if near the right edge
  const POPOVER_WIDTH = 480
  const POPOVER_HEIGHT = 320
  const left = anchorRect.right + 6 + POPOVER_WIDTH <= window.innerWidth
    ? anchorRect.right + 6
    : anchorRect.left - POPOVER_WIDTH - 6
  const top = Math.min(
    Math.max(6, anchorRect.top),
    window.innerHeight - POPOVER_HEIGHT - 6
  )

  return createPortal(
    <div
      data-tm-popover
      style={{ position: 'fixed', top, left, zIndex: 9999, width: '480px' }}
      className="bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-white">{tmCode} — Locations (Gen {gen})</p>
        <button
          onClick={() => window.electronAPI.openExternal(bulbaUrl)}
          className="text-xs text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1 shrink-0 ml-3"
          title="Open on Bulbapedia"
        >
          Bulbapedia
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <p className="text-xs text-gray-500">No location data found for this generation.</p>
      ) : (() => {
        const hasPurchase = rows.some(r => r.purchase)
        const hasSell     = rows.some(r => r.sell)
        const TH = 'pb-1.5 pr-3 text-xs font-semibold text-gray-500 text-left'
        const TD = 'py-1.5 pr-3 text-xs text-gray-300 align-top break-words'
        return (
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-28" />
              <col />
              {hasPurchase && <col className="w-24" />}
              {hasSell     && <col className="w-24" />}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-700">
                <th className={TH}>Game</th>
                <th className={TH}>Location</th>
                {hasPurchase && <th className={TH}>Buy</th>}
                {hasSell     && <th className={`${TH} pr-0`}>Sell</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ game, location, purchase, sell }) => (
                <tr key={game} className="border-b border-gray-700 last:border-0">
                  <td className={`${TD} text-gray-400`}>{GAME_DISPLAY_NAME[game] ?? game}</td>
                  <td className={TD}>{location || '—'}</td>
                  {hasPurchase && <td className={`${TD} tabular-nums`}>{purchase || '—'}</td>}
                  {hasSell     && <td className={`${TD} tabular-nums pr-0`}>{sell || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )
      })()}
    </div>,
    document.body
  )
}

interface Props {
  tmCode: string
  game: string
  children: React.ReactNode
}

export default function TmPopover({ tmCode, game, children }: Props) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchorRect(prev => prev ? null : rect)
  }, [])

  return (
    <>
      <button
        onClick={handleClick}
        className="text-left hover:text-blue-400 transition-colors"
      >
        {children}
      </button>
      {anchorRect && (
        <PopoverInner
          tmCode={tmCode}
          game={game}
          anchorRect={anchorRect}
          onClose={() => setAnchorRect(null)}
        />
      )}
    </>
  )
}
