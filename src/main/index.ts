import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BackendClient } from './backend-rpc'
import type { RuntimeIncident } from './diagnostics'

app.setName('Pokeguru')
protocol.registerSchemesAsPrivileged([{
  scheme: 'pokeguru', privileges: { standard: true, secure: true }
}])
let mainWindow: BrowserWindow | null = null
let backend: BackendClient | null = null
let quitting = false

function recordRuntimeIncident(incident: RuntimeIncident): void {
  void backend?.invoke('$incident', [incident]).catch(() => undefined)
}

const rendererFile = join(__dirname, '../renderer/index.html')
const rendererUrl = 'pokeguru://bundle/index.html'
const packagedCsp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: pokeguru://cards",
  "font-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'",
  "form-action 'none'", "frame-src 'none'"
].join('; ')
let trustedRendererUrl: string | null = null

function developmentRendererUrl(): string | null {
  if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL) return null
  try {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) return null
    return url.toString()
  } catch { return null }
}

function isTrustedRendererUrl(value: string): boolean {
  if (!trustedRendererUrl) return false
  try {
    return new URL(value).href === new URL(trustedRendererUrl).href
  } catch { return false }
}

function createWindow(): void {
  const developmentUrl = developmentRendererUrl()
  const window = new BrowserWindow({
    title: 'Pokéguru',
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png'),
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 580,
    backgroundColor: '#edf1ed',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: developmentUrl !== null
    }
  })
  mainWindow = window

  window.on('unresponsive', () => {
    recordRuntimeIncident({ at: new Date().toISOString(), kind: 'unresponsive' })
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    recordRuntimeIncident({ at: new Date().toISOString(), kind: 'renderer-gone',
      reason: ['crashed', 'killed', 'oom', 'launch-failed', 'integrity-failure'].includes(details.reason)
        ? details.reason : 'other' })
  })

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || input.meta) return
    const key = input.key.toLowerCase()
    if (input.control) {
      const zoom = window.webContents.getZoomLevel()
      if (input.code === 'Equal' || input.code === 'NumpadAdd') {
        event.preventDefault()
        window.webContents.setZoomLevel(Math.min(3, zoom + 1))
        return
      }
      if (input.code === 'Minus' || input.code === 'NumpadSubtract') {
        event.preventDefault()
        window.webContents.setZoomLevel(Math.max(-3, zoom - 1))
        return
      }
      if (key === '0') {
        event.preventDefault()
        window.webContents.setZoomLevel(0)
        return
      }
    }
    if (!developmentUrl) return
    if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      event.preventDefault()
      setTimeout(() => {
        if (window.isDestroyed()) return
        if (window.webContents.isDevToolsOpened()) window.webContents.closeDevTools()
        else window.webContents.openDevTools({ mode: 'detach' })
      }, 0)
    } else if (key === 'f5' || (input.control && key === 'r')) {
      event.preventDefault()
      if (input.shift) window.webContents.reloadIgnoringCache()
      else window.webContents.reload()
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  trustedRendererUrl = developmentUrl ?? rendererUrl
  void window.loadURL(trustedRendererUrl)
}


app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('io.github.xmey95.pokeguru')
  if (process.platform === 'win32' || process.platform === 'linux') Menu.setApplicationMenu(null)
  const override = process.env.POKEGURU_DATA_DIR
  if (override) {
    try { mkdirSync(override, { recursive: true }) } catch { /* Worker exposes the storage error in the window. */ }
    app.setPath('userData', override)
  }
  const imageDirectory = join(app.getPath('userData'), 'data', 'catalog-images')
  try { mkdirSync(imageDirectory, { recursive: true }) } catch { /* Worker reports unavailable storage. */ }
  protocol.registerSource('pokeguru', { routes: [
    { match: { host: 'bundle' }, source: { type: 'directory', root: dirname(rendererFile),
      headers: { 'Content-Security-Policy': packagedCsp } } },
    { match: { host: 'cards' }, source: { type: 'directory', root: imageDirectory } }
  ] })
  backend = new BackendClient(join(__dirname, 'backend-worker.js'), {
    userData: app.getPath('userData'), temp: app.getPath('temp'), downloads: app.getPath('downloads'),
    version: app.getVersion(), packaged: app.isPackaged,
    electron: process.versions.electron, chrome: process.versions.chrome
  }, async (action, value) => {
    if (action === 'open-external' && typeof value === 'string') {
      const url = new URL(value)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('URL non consentito.')
      await shell.openExternal(url.toString())
    } else if (action === 'runtime-metrics') return { mainHeapBytes: process.memoryUsage().heapUsed }
    else if (action === 'copy-text' && typeof value === 'string') clipboard.writeText(value)
    else if (action === 'save-dialog' && mainWindow) return dialog.showSaveDialog(mainWindow, value as Electron.SaveDialogOptions)
    else throw new Error('Operazione desktop non disponibile.')
  })
  // Register only backend-owned channels; internal lifecycle messages never become IPC.
  const channels = await backend.ready
  for (const channel of channels) ipcMain.handle(channel, async (event, ...args) => {
    if (!mainWindow || event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame || !isTrustedRendererUrl(event.senderFrame.url))
      return { ok: false, error: 'Richiesta non autorizzata.' }
    try { return await backend!.invoke(channel, args) }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Servizio locale non disponibile.' } }
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}).catch((error) => {
  dialog.showErrorBox('Pokéguru non può avviarsi', error instanceof Error ? error.message : 'Servizio locale non disponibile.')
  app.quit()
})

app.on('before-quit', (event) => {
  if (quitting || !backend) return
  event.preventDefault()
  quitting = true
  void backend.stop().finally(() => app.quit())
})
app.on('window-all-closed', () => app.quit())
