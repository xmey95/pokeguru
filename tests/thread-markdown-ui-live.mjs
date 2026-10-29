import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-thread-markdown-'))
const source = '# Piano iniziale\n\nPrima **difendi** e poi *attacca*.\n\n- Cerca Energia\n- Conserva la carta\n\n' +
  '[Fonte](https://example.org/path) [Carta](https://api.tcgdex.net/v2/en/cards/sv01-086) ' +
  '[vietato](javascript:alert(1)) [locale](file:///C:/secret)\n\n' +
  '![remoto](https://evil.test/pixel) <script>alert(2)</script>\n\n```text\n' + 'A'.repeat(240) + '\n```'
let application

function database(action) {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try { return action(db) } finally { db.close() }
}

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_CODEX_BIN: join(profile, 'missing-codex') }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Markdown storico')
  const created = await page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    const result = await window.projectsApi.createDeckThread({ projectId: projects.value[0].id, title: 'Prova Markdown' })
    if (!result.ok) throw new Error(result.error)
    return result.value
  })
  database((db) => {
    const insert = db.prepare('INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at) VALUES (?, ?, ?, ?, ?)')
    insert.run(randomUUID(), created.id, 'user', 'Nota **letterale**', new Date().toISOString())
    insert.run(randomUUID(), created.id, 'assistant', source, new Date().toISOString())
  })
  await application.close()
  application = await launch()
  page = await application.firstWindow()
  const remoteRequests = []
  page.on('request', (request) => { if (request.url().includes('evil.test')) remoteRequests.push(request.url()) })
  await application.evaluate(({ shell }) => {
    globalThis.markdownOpenedLinks = []
    shell.openExternal = async (url) => { globalThis.markdownOpenedLinks.push(url) }
  })
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  const assistant = page.locator('.thread-message[data-author="assistant"]')
  await assistant.waitFor()
  assert.equal(await assistant.locator('h1').innerText(), 'Piano iniziale')
  assert.equal(await assistant.locator('strong').first().innerText(), 'difendi')
  assert.equal(await assistant.locator('em').first().innerText(), 'attacca')
  assert.equal(await assistant.locator('li').count(), 2)
  assert.match((await assistant.locator('pre code').innerText()).trimEnd(), /^A{240}$/)
  assert.equal(await assistant.locator('img, script').count(), 0)
  assert.equal(await assistant.locator('a').count(), 1)
  assert.match(await assistant.innerText(), /Carta · scheda non disponibile nel Catalogo locale/)
  assert.equal(await page.locator('.thread-message[data-author="user"] p').innerText(), 'Nota **letterale**')
  await assistant.getByRole('link', { name: /Fonte/ }).click()
  assert.deepEqual(await application.evaluate(() => globalThis.markdownOpenedLinks), ['https://example.org/path'])
  const rejected = await page.evaluate(() => window.projectsApi.openThreadLink('javascript:alert(3)'))
  assert.equal(rejected.ok, false)
  assert.deepEqual(await application.evaluate(() => globalThis.markdownOpenedLinks), ['https://example.org/path'])
  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 720 })
    await assistant.scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    assert.equal(await page.locator('.main-content').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false)
    await page.screenshot({ path: join(workspace, 'node_modules', `thread-markdown-${width}.png`), fullPage: true })
  }
  assert.deepEqual(remoteRequests, [])
  assert.equal(database((db) => db.prepare('SELECT text FROM deck_thread_messages WHERE author = ?').get('assistant').text), source)
  // A catalog fixture checks the integration with APP-107 without fetching TCGdex or mutating the archive.
  await application.evaluate(({ ipcMain }) => {
    const original = ipcMain._invokeHandlers.get('catalog:get')
    ipcMain.removeHandler('catalog:get')
    ipcMain.handle('catalog:get', async (...args) => {
      const result = await original(...args)
      if (!result.ok) return result
      return { ...result, value: { ...result.value, prints: [...result.value.prints, {
        id: 'sv01-086', setId: 'sv01', setName: 'Scarlet & Violet', localId: '086', name: 'Gardevoir ex',
        category: 'Pokemon', rarity: null, variants: null, identityId: 'pokemon:fixture',
        identityBasis: 'pokemon-text', imageBase: null, thumbnail: null, highImageAvailable: null,
        sourceUpdated: null, sourceUrl: 'https://api.tcgdex.net/v2/en/cards/sv01-086', detailAt: null, error: null
      }] } }
    })
  })
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await assistant.getByRole('button', { name: 'Carta · Catalogo' }).press('Enter')
  try {
    await page.waitForFunction(() => document.querySelector('button[aria-label="Catalogo"]')?.getAttribute('aria-current') === 'page',
      null, { timeout: 10000 })
  } catch (error) {
    console.error('Thread Markdown local link state:', await page.evaluate(() => ({
      active: document.activeElement?.outerHTML.slice(0, 250),
      catalogCurrent: document.querySelector('button[aria-label="Catalogo"]')?.getAttribute('aria-current'),
      localLink: document.querySelector('.thread-markdown button')?.outerHTML.slice(0, 250),
      alert: document.querySelector('[role="alert"]')?.textContent?.slice(0, 250)
    })))
    throw error
  }
  assert.deepEqual(await application.evaluate(() => globalThis.markdownOpenedLinks), ['https://example.org/path'])
  console.log('Thread Markdown Electron: struttura, link esterni, sanitizzazione, 1280/640 px e testo storico invariato: passed')
} finally {
  if (application) await application.close()
  rmSync(profile, { recursive: true, force: true })
}
