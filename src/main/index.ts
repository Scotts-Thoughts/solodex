import { app, BrowserWindow, ipcMain, net, Menu } from 'electron'
import path from 'path'
import fs from 'fs'

interface WindowBounds { x: number; y: number; width: number; height: number }

function getBoundsPath(): string {
  return path.join(app.getPath('userData'), 'window-bounds.json')
}

function loadBounds(): WindowBounds | null {
  try {
    const raw = fs.readFileSync(getBoundsPath(), 'utf-8')
    return JSON.parse(raw) as WindowBounds
  } catch {
    return null
  }
}

function saveBounds(win: BrowserWindow): void {
  if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return
  const b = win.getBounds()
  fs.writeFileSync(getBoundsPath(), JSON.stringify(b))
}

function createWindow(): void {
  const saved = loadBounds()

  const mainWindow = new BrowserWindow({
    width:     saved?.width  ?? 1400,
    height:    saved?.height ?? 860,
    x:         saved?.x,
    y:         saved?.y,
    minWidth: 1420,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, '../../build/icon.ico'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#111827',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', () => saveBounds(mainWindow))
  mainWindow.on('resized', () => saveBounds(mainWindow))
  mainWindow.on('moved', () => saveBounds(mainWindow))

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('fetch-tm-page', async (_, tmCode: string) => {
  try {
    // Bulbapedia uses 3-digit zero-padded format for TMs (TM044), 2-digit for HMs
    const title = tmCode.startsWith('TM')
      ? 'TM' + tmCode.slice(2).padStart(3, '0')
      : tmCode
    const url = `https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json`
    const res = await net.fetch(url)
    const data = await res.json() as Record<string, unknown> & { parse?: { text?: { '*'?: string } } }
    return data?.parse?.text?.['*'] ?? null
  } catch {
    return null
  }
})

const WIKI_NAME_OVERRIDES: Record<string, string> = {
  'Compoundeyes': 'Compound Eyes',
  'Hi Jump Kick': 'High Jump Kick',
  'Minds Eye': "Mind's Eye",
  'Faint Attack': 'Feint Attack',
  'ViceGrip': 'Vise Grip',
  'Vice Grip': 'Vise Grip',
  'SmellingSalts': 'Smelling Salts',
  'SoftBoiled': 'Soft Boiled',
  'SmokeScreen': 'Smokescreen',
  'SelfDestruct': 'Self-Destruct',
  'Selfdestruct': 'Self-Destruct',
  'Self Destruct': 'Self-Destruct',
}

ipcMain.handle('fetch-wiki', async (_, name: string, type: 'move' | 'ability' | 'tm') => {
  async function fetchExtract(n: string): Promise<string | null> {
    const title = type === 'tm'
      ? n
      : n.replace(/ /g, '_') + (type === 'move' ? '_(move)' : '_(Ability)')
    const sentenceParam = type === 'tm' ? '&exsentences=20' : ''
    const url = `https://bulbapedia.bulbagarden.net/w/api.php?action=query&prop=extracts&explaintext=1${sentenceParam}&titles=${encodeURIComponent(title)}&format=json`
    const res = await net.fetch(url)
    const data = await res.json()
    const pages = (data as Record<string, unknown> & { query?: { pages?: Record<string, unknown> } }).query?.pages ?? {}
    const page = Object.values(pages)[0] as Record<string, unknown>
    if (page?.missing !== undefined) return null
    return (page?.extract as string) ?? null
  }
  try {
    // Check manual overrides first (e.g. "Compoundeyes" → "Compound Eyes")
    const override = WIKI_NAME_OVERRIDES[name]
    if (override) return await fetchExtract(override)
    const result = await fetchExtract(name)
    if (result) return result
    // Retry with spaces before mid-word capitals (e.g. "AncientPower" → "Ancient Power")
    const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2')
    if (spaced !== name) {
      const spacedResult = await fetchExtract(spaced)
      if (spacedResult) return spacedResult
    }
    // Retry with dashes replaced by spaces (e.g. "Sand-Attack" → "Sand Attack")
    const dashless = name.replace(/-/g, ' ')
    if (dashless !== name) return await fetchExtract(dashless)
    return null
  } catch {
    return null
  }
})

Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ]
  }
]))

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
