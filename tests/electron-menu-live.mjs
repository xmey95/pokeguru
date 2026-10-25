import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const executablePath = require('electron')
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-menu-'))
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><title>Development renderer</title><input aria-label="Development input">')
})
let application
let windowId

async function launch(profile, rendererUrl) {
  return electron.launch({
    executablePath,
    args: ['.'],
    cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile, ELECTRON_RENDERER_URL: rendererUrl },
    timeout: 30000
  })
}

async function windowState() {
  return application.evaluate(({ BrowserWindow, Menu }, id) => {
    const window = BrowserWindow.fromId(id)
    return {
      menu: Menu.getApplicationMenu(),
      visible: window.isMenuBarVisible(),
      maximizable: window.isMaximizable(),
      minimizable: window.isMinimizable(),
      resizable: window.isResizable(),
      devtools: window.webContents.isDevToolsOpened(),
      zoom: window.webContents.getZoomLevel()
    }
  }, windowId)
}

async function pressNative(keyCode, modifiers = []) {
  await application.evaluate(({ BrowserWindow }, input) => {
    const window = BrowserWindow.fromId(input.id)
    window.focus()
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: input.keyCode, modifiers: input.modifiers })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: input.keyCode, modifiers: input.modifiers })
  }, { id: windowId, keyCode, modifiers })
}

try {
  application = await launch(join(temporary, 'build'), 'data:text/html,<title>Untrusted renderer</title>')
  let page = await application.firstWindow()
  windowId = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id)
  assert.equal(page.url(), 'pokeguru://bundle/index.html')
  let state = await windowState()
  assert.equal(state.menu, null)
  assert.equal(state.visible, false)
  assert.equal(state.maximizable, true)
  assert.equal(state.minimizable, true)
  assert.equal(state.resizable, true)
  await pressNative('Alt')
  assert.equal((await windowState()).visible, false, 'Alt non deve ripristinare il menu')

  const name = page.getByLabel('Nome progetto')
  await name.fill('Mazzo di prova')
  await name.focus()
  await page.keyboard.press('Control+A')
  assert.deepEqual(await name.evaluate((input) => [input.selectionStart, input.selectionEnd]), [0, 14])
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Control+Z')
  assert.equal(await name.inputValue(), 'Mazzo di prova', 'Undo deve restare disponibile senza menu')
  await pressNative('=', ['control'])
  assert.equal((await windowState()).zoom, 1)
  await pressNative('-', ['control'])
  assert.equal((await windowState()).zoom, 0)
  await pressNative('=', ['control'])
  await pressNative('0', ['control'])
  assert.equal((await windowState()).zoom, 0)
  await pressNative('F12')
  await page.waitForTimeout(200)
  assert.equal((await windowState()).devtools, false, 'F12 non apre DevTools nella build locale')
  await pressNative('I', ['control', 'shift'])
  await page.waitForTimeout(200)
  assert.equal((await windowState()).devtools, false, 'Ctrl+Shift+I non apre DevTools nella build locale')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.keyboard.press('Alt+ArrowLeft')
  await page.getByRole('button', { name: 'Lista', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Lista', exact: true }).getAttribute('aria-current'), 'page')
  await page.keyboard.press('Alt+ArrowRight')
  assert.equal(await page.getByRole('button', { name: 'Catalogo', exact: true }).getAttribute('aria-current'), 'page')
  await application.close()
  application = undefined

  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  application = await launch(join(temporary, 'development'), `http://127.0.0.1:${address.port}/`)
  page = await application.firstWindow()
  windowId = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id)
  await page.getByLabel('Development input').waitFor()
  state = await windowState()
  assert.equal(state.menu, null)
  assert.equal(state.visible, false)
  await page.getByLabel('Development input').focus()
  const reload = page.waitForEvent('load', { timeout: 5000 })
  await pressNative('R', ['control'])
  await reload
  assert.equal(page.url(), `http://127.0.0.1:${address.port}/`)
  assert.equal((await windowState()).visible, false)
  console.log('Menu Electron assente; frame, focus, navigazione, editing, zoom e ricarica di sviluppo verificati.')
} finally {
  if (application) await application.close()
  if (server.listening) await new Promise((resolveClosed) => server.close(resolveClosed))
  rmSync(temporary, { recursive: true, force: true })
}
