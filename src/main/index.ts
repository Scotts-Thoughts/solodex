import { app, BrowserWindow, ipcMain, net } from 'electron'
import path from 'path'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
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

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('fetch-wiki', async (_, name: string, type: 'move' | 'ability') => {
  try {
    const suffix = type === 'move' ? '_(move)' : '_(Ability)'
    const title = name.replace(/ /g, '_') + suffix
    const url = `https://bulbapedia.bulbagarden.net/w/api.php?action=query&prop=extracts&explaintext=1&exsentences=6&titles=${encodeURIComponent(title)}&format=json`
    const res = await net.fetch(url)
    const data = await res.json()
    const pages = (data as Record<string, unknown> & { query?: { pages?: Record<string, unknown> } }).query?.pages ?? {}
    const page = Object.values(pages)[0] as Record<string, unknown>
    return (page?.extract as string) ?? null
  } catch {
    return null
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
