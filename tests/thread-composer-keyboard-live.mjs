import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-composer-keys-'))
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_CODEX_BIN: join(profile, 'missing-codex') }, timeout: 30000 })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Tastiera Thread · fixture')
  await page.getByLabel('Testo lista').waitFor()
  const thread = await page.evaluate(async () => {
    const projects = await window.projectsApi.list()
    if (!projects.ok) throw new Error(projects.error)
    const result = await window.projectsApi.createDeckThread({ projectId: projects.value[0].id, title: 'Invio da tastiera' })
    if (!result.ok) throw new Error(result.error)
    return result.value
  })
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  const input = page.getByLabel('Scrivi nel thread')
  await input.waitFor()
  assert.match(await page.locator('#thread-composer-help').innerText(), /Enter.*Shift\+Enter/)
  assert.equal(await input.getAttribute('aria-keyshortcuts'), 'Enter')

  await application.evaluate(({ ipcMain }) => {
    globalThis.keyboardFixture = { calls: [], pending: [] }
    ipcMain.removeHandler('deck:ask-thread')
    ipcMain.handle('deck:ask-thread', (_event, projectId, threadId, text) => {
      globalThis.keyboardFixture.calls.push({ projectId, threadId, text })
      return new Promise((resolve) => globalThis.keyboardFixture.pending.push(resolve))
    })
  })
  const calls = async () => application.evaluate(() => globalThis.keyboardFixture.calls)
  const resolveCall = async (result) => application.evaluate((_electron, value) => {
    globalThis.keyboardFixture.pending.shift()(value)
  }, result)

  await input.focus()
  await page.keyboard.press('Enter')
  assert.equal(await input.inputValue(), '')
  assert.equal((await calls()).length, 0, 'Un messaggio vuoto non parte')

  await input.fill('Prima riga')
  await input.press('Shift+Enter')
  await input.type('Seconda riga')
  assert.equal(await input.inputValue(), 'Prima riga\nSeconda riga')
  assert.equal((await calls()).length, 0, 'Shift+Enter aggiunge una riga senza inviare')

  await input.evaluate((element) => element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
  await input.press('Enter')
  assert.equal((await calls()).length, 0, 'Enter durante una composizione IME non invia')
  await input.evaluate((element) => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
  await input.fill('Richiesta da tastiera')
  await input.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', isComposing: true, bubbles: true, cancelable: true
  })))
  assert.equal((await calls()).length, 0, 'Il flag nativo IME non invia')

  await input.press('Enter')
  await page.getByRole('button', { name: 'Risposta in corso…' }).waitFor()
  assert.equal(await input.isEnabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Risposta in corso…' }).isDisabled(), true)
  assert.deepEqual((await calls()).map(({ threadId, text }) => [threadId, text]), [[thread.id, 'Richiesta da tastiera']])
  await page.keyboard.press('Enter')
  assert.equal((await calls()).length, 1, 'Un secondo Enter durante il job non duplica il turno')
  const stored = await page.evaluate((projectId) => window.projectsApi.listDeckThreads(projectId), thread.projectId)
  assert.equal(stored.ok, true)
  await resolveCall({ ok: true, value: stored.value.find((item) => item.id === thread.id) })
  await page.waitForFunction(() => document.querySelector('#thread-message')?.value === '')
  await page.waitForFunction(() => document.activeElement?.id === 'thread-message')

  await input.fill('Errore da tastiera')
  await input.press('Enter')
  await page.getByRole('button', { name: 'Risposta in corso…' }).waitFor()
  await resolveCall({ ok: false, error: 'Errore di prova' })
  await page.locator('.thread-composer').getByRole('alert').waitFor()
  await page.waitForFunction(() => document.activeElement?.classList.contains('error-banner'))
  assert.equal(await input.inputValue(), 'Errore da tastiera', 'Il testo resta disponibile dopo un errore')
  assert.equal((await calls()).length, 2)

  console.log('APP-133 OK: Enter, Shift+Enter, IME, vuoto, job pendente, focus e errore verificati in Electron con profilo temporaneo.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(profile)) !== realpathSync(tmpdir()) || !basename(profile).startsWith('pokeguru-composer-keys-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(profile, { recursive: true, force: true })
}
