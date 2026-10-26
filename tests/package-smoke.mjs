import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport } from './project-ui-helper.mjs'

const executablePath = process.argv[2] && resolve(process.argv[2])
if (!executablePath || !existsSync(executablePath)) {
  throw new Error('Indicare il percorso del binario nel pacchetto estratto.')
}

const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-package-'))
let application

async function launch(profile) {
  mkdirSync(join(profile, 'codex-home'), { recursive: true })
  const environment = { ...process.env, POKEGURU_DATA_DIR: profile,
    CODEX_HOME: join(profile, 'codex-home'), POKEGURU_AUTO_SYNC: '0',
    ELECTRON_RENDERER_URL: 'data:text/html,<title>Untrusted renderer</title>' }
  for (const key of Object.keys(environment)) if (key.toLowerCase() === 'path') delete environment[key]
  const windowsRoot = process.env.SystemRoot ?? 'C:\\Windows'
  environment.PATH = process.platform === 'win32'
    ? `${windowsRoot}\\System32;${windowsRoot}` : '/usr/bin:/bin'
  return electron.launch({
    executablePath,
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    env: environment,
    timeout: 45000
  })
}

try {
  const profile = join(temporary, 'profile')
  application = await launch(profile)
  let page = await application.firstWindow()
  const setup = await page.evaluate(() => window.projectsApi.getCodexSetupStatus())
  assert.equal(setup.ok, true)
  assert.equal(setup.value.bundled, true, 'Il pacchetto deve includere la CLI nativa senza Node/npm nel PATH')
  assert.match(setup.value.version, /^codex-cli 0\.164\.0/)
  assert.deepEqual(await page.evaluate(() => window.projectsApi.getAiConnection()),
    { ok: true, value: { account: null, plan: null, models: [] } },
    'App Server deve avviarsi con un profilo Codex isolato e senza Node/npm esterni')
  assert.equal(page.url(), 'pokeguru://bundle/index.html', 'Il pacchetto deve ignorare l’URL renderer nell’ambiente')
  const windowState = await application.evaluate(({ BrowserWindow, Menu }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return [Boolean(Menu.getApplicationMenu()), window.isMenuBarVisible(),
      window.isMaximizable(), window.isMinimizable()]
  })
  if (process.platform === 'darwin') {
    assert.deepEqual(windowState.slice(2), [true, true], 'La finestra macOS conserva i controlli nativi')
  } else {
    assert.deepEqual(windowState, [false, false, true, true],
      'Il pacchetto conserva il frame senza menu Electron')
  }
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.focus()
    for (const input of [{ keyCode: 'Alt' }, { keyCode: 'F12' }]) {
      window.webContents.sendInputEvent({ type: 'keyDown', ...input })
      window.webContents.sendInputEvent({ type: 'keyUp', ...input })
    }
  })
  await page.waitForTimeout(200)
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened()), false)
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const input = process.platform === 'darwin'
      ? { keyCode: 'I', modifiers: ['meta', 'alt'] }
      : { keyCode: 'I', modifiers: ['control', 'shift'] }
    window.webContents.sendInputEvent({ type: 'keyDown', ...input })
    window.webContents.sendInputEvent({ type: 'keyUp', ...input })
  })
  await page.waitForTimeout(200)
  const menuAndTools = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    return [window.isMenuBarVisible(), window.webContents.isDevToolsOpened()]
  })
  if (process.platform === 'darwin') {
    assert.equal(menuAndTools[1], false, 'DevTools resta disabilitato nel pacchetto macOS')
  } else {
    assert.deepEqual(menuAndTools, [false, false], 'Alt non riapre il menu e DevTools resta disabilitato')
  }
  const documentResponse = page.waitForResponse((response) => response.url() === page.url())
  await page.reload()
  assert.match(await (await documentResponse).headerValue('content-security-policy'), /script-src 'self'/)
  assert.equal(await page.evaluate(async () => {
    const script = document.createElement('script')
    script.textContent = 'window.__injectedScriptRan = true'
    document.body.append(script)
    await new Promise((resolve) => setTimeout(resolve, 50))
    return window.__injectedScriptRan === true
  }), false, 'La CSP deve impedire script inline nel pacchetto')
  const outsideImage = join(temporary, 'outside.svg')
  writeFileSync(outsideImage, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')
  assert.equal(await page.evaluate((source) => new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = source
  }), pathToFileURL(outsideImage).href), false, 'Il renderer non deve caricare un file locale esterno')
  await createProjectFromStart(page, 'Pacchetto isolato')
  await page.getByTestId('selected-project-name').filter({ hasText: 'Pacchetto isolato' }).waitFor()
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('1 Mega Absol ex MEG 86')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByTestId('card-total').filter({ hasText: '1 carte' }).waitFor()
  await application.close()
  application = undefined

  application = await launch(profile)
  page = await application.firstWindow()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Pacchetto isolato' }).waitFor()
  assert.equal(await page.locator('.original-text pre').textContent(), '1 Mega Absol ex MEG 86')
  await application.close()
  application = undefined
  assert.ok(existsSync(join(profile, 'data', 'pokeguru.sqlite')))

  const legacy = join(temporary, 'legacy')
  mkdirSync(join(legacy, 'data'), { recursive: true })
  const database = new DatabaseSync(join(legacy, 'data', 'pokeguru.sqlite'))
  database.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT')
  database.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)')
    .run('old-project', 'Archivio precedente', 'STANDARD', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  database.close()
  application = await launch(legacy)
  page = await application.firstWindow()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Archivio precedente' }).waitFor()
  assert.match(await page.locator('.migration-note').textContent(), /Profilo occidentale assegnato/)
  await application.close()
  application = undefined

  console.log('Pacchetto OK: Codex nativo/App Server senza Node, avvio, salvataggio, riapertura e migrazione I1.')
} finally {
  if (application) await application.close()
  if (temporary.startsWith(join(tmpdir(), 'pokeguru-package-'))) {
    rmSync(temporary, { recursive: true, force: true })
  }
}
