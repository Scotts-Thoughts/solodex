// Bulbapedia text for the wiki and TM popovers. The descriptions are bundled
// (data_objects-main/wiki/, built by `npm run collect:wiki`), each table its
// own chunk loaded on first use, so the popovers work offline. A name the
// bundle lacks falls back to the live fetch in the main process.
import { tmPageTitle, wikiKey, type WikiType } from '../../../shared/wiki'

type Table = Record<string, string>

const LOADERS = {
  move:    () => import('@data/wiki/moves').then(m => m.wikiMoves),
  ability: () => import('@data/wiki/abilities').then(m => m.wikiAbilities),
  tm:      () => import('@data/wiki/tm_pages').then(m => m.wikiTmPages),
}

const tables = new Map<keyof typeof LOADERS, Promise<Table>>()

function loadTable(kind: keyof typeof LOADERS): Promise<Table> {
  let table = tables.get(kind)
  if (!table) {
    table = LOADERS[kind]().catch(() => {
      tables.delete(kind)
      return {}
    })
    tables.set(kind, table)
  }
  return table
}

/** Plain-text Bulbapedia article for a move or ability (`'tm'` is always fetched live). */
export async function getWikiExtract(name: string, type: WikiType): Promise<string | null> {
  if (type !== 'tm') {
    const bundled = (await loadTable(type))[wikiKey(name)]
    if (bundled) return bundled
  }
  return window.electronAPI.fetchWiki(name, type)
}

/** A TM/HM page's location tables, as HTML for TmPopover's parser. */
export async function getTmPageHtml(tmCode: string): Promise<string | null> {
  const bundled = (await loadTable('tm'))[tmPageTitle(tmCode)]
  return bundled ?? window.electronAPI.fetchTmPage(tmCode)
}
