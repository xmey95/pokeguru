import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openProjectPicker } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-feedback-ui-'))
const shots = resolve('.verify/desktop-feedback')
mkdirSync(shots, { recursive: true })
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'],
    env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0',
      POKEGURU_CODEX_BIN: join(profile, 'missing-codex') }, timeout: 30000 })
  const page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  await createProjectFromStart(page, 'Dragapult · Preparazione Regional')
  const fixture = await page.evaluate(async () => {
    const p = (await window.projectsApi.list()).value[0]
    await window.projectsApi.importDeck({ projectId: p.id, rawText: '60 Carta A MEG 1', source: 'paste' })
    const thread = await window.projectsApi.createDeckThread({ projectId: p.id, title: 'Ipotesi da eliminare', openingNote: 'Nota riservata' })
    await window.projectsApi.createDeckThread({ projectId: p.id, title: 'Discussione da conservare' })
    for (const name of ['Gardevoir · Campionato', 'Charizard · Test del sabato', 'Gholdengo · Variante aggressiva'])
      await window.projectsApi.create({ name, format: 'STANDARD' })
    return { projectId: p.id, threadId: thread.value.id }
  })
  await page.reload()
  await page.getByTestId('selected-project-name').waitFor()
  for (const width of [1280, 640]) {
    await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 800), width)
    await openProjectPicker(page)
    const picker = page.getByRole('dialog', { name: 'Scegli progetto' })
    const bounds = await picker.boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.width <= width && bounds.height < 800)
    assert.equal(await picker.evaluate(el => el.matches(':modal')), true)
    assert.match(await picker.evaluate(el => getComputedStyle(el, '::backdrop').backdropFilter), /blur/)
    await page.screenshot({ path: join(shots, `projects-${width}.png`) })
    await picker.getByLabel('Cerca progetti').fill('Gardevoir')
    assert.equal(await picker.locator('.project-picker-row').count(), 1)
    await picker.getByRole('button', { name: 'Nuovo progetto', exact: true }).focus()
    await page.keyboard.press('Tab')
    assert.equal(await picker.evaluate(el => el.contains(document.activeElement)), true)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('#project-switcher-trigger').evaluate(el => el === document.activeElement), true)
  }
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 800))
  await openProjectPicker(page)
  await page.getByRole('dialog', { name: 'Scegli progetto' }).getByRole('button', { name: /Dragapult · Preparazione/ }).click()
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('#thread-switcher-trigger').click()
  await page.getByRole('dialog', { name: 'Scegli thread' }).getByRole('button', { name: /Ipotesi da eliminare/ }).click()
  await page.getByRole('button', { name: 'Elimina Thread', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Eliminare questo Thread?' })
  await confirmation.getByRole('button', { name: 'Annulla', exact: true }).click()
  assert.ok((await page.evaluate(async f => window.projectsApi.getDeckThreadWindow(f.projectId, f.threadId), fixture)).value)
  await page.getByRole('button', { name: 'Elimina Thread', exact: true }).click()
  await confirmation.getByRole('button', { name: 'Elimina definitivamente', exact: true }).click()
  await page.waitForFunction(async f => (await window.projectsApi.getDeckThreadWindow(f.projectId, f.threadId)).value === null, fixture)
  assert.equal((await page.evaluate(async f => window.projectsApi.listDeckThreadSummaries(f.projectId), fixture)).value.length, 1)

  // Delay real IPC responses at the host boundary to observe the intermediate UI.
  await application.evaluate(({ ipcMain }) => {
    globalThis.feedbackReadMode = 'delay'
    globalThis.feedbackPending = 0
    ipcMain.removeHandler('matchups:get-meta')
    ipcMain.handle('matchups:get-meta', () => ({ ok: true, value: { id: 'feedback-meta', circuit: 'WESTERN',
      format: 'STANDARD', fetchedAt: new Date().toISOString(), cached: false, period: 'Fixture UI',
      sourceUrl: 'https://limitlesstcg.com/decks', decks: [{ id: 'test', name: 'Gardevoir ex', points: 1,
        share: 10, url: 'https://limitlesstcg.com/decks/1' }] } }))
    for (const channel of ['matchups:list-reports', 'matchups:list-discussions']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async () => {
        globalThis.feedbackPending++
        await new Promise(resolve => setTimeout(resolve, 1200))
        globalThis.feedbackPending--
        return globalThis.feedbackReadMode === 'error' ? { ok: false, error: 'Lettura di prova non riuscita.' } : { ok: true, value: [] }
      })
    }
  })
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Matchup', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Caricamento analisi salvata…' }).waitFor()
  assert.equal(await page.getByText('Nessuna guida per questo archetipo e questa lista.').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Genera analisi con Codex', exact: true }).count(), 0)
  await page.screenshot({ path: join(shots, 'matchup-loading.png') })
  await page.getByText('Nessuna guida per questo archetipo e questa lista.').waitFor()
  await application.evaluate(() => { globalThis.feedbackReadMode = 'error' })
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Matchup', exact: true }).click()
  await page.getByRole('button', { name: 'Riprova caricamento', exact: true }).waitFor()
  assert.equal(await page.getByText('Nessuna guida per questo archetipo e questa lista.').count(), 0)
  await application.evaluate(() => { globalThis.feedbackReadMode = 'delay' })
  await page.getByRole('button', { name: 'Riprova caricamento', exact: true }).click()
  await page.getByText('Nessuna guida per questo archetipo e questa lista.').waitFor()
  await application.close(); application = null
  console.log('Desktop feedback UI OK: modal, blur, keyboard, 1280/640 px, Thread confirmation/delete, Matchup loading/error/retry.')
} finally {
  if (application) await application.close()
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
