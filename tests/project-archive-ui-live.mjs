import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openProjectPicker, startNewProject, switchProject } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
mkdirSync(join(workspace, '.verify'), { recursive: true })
const profile = mkdtempSync(join(workspace, '.verify', 'archive-ui-'))
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.setViewportSize({ width: 640, height: 720 })
  await createProjectFromStart(page, 'Primo mazzo')
  await page.getByLabel('Testo lista').fill('60 Carta A MEG 1')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '60 carte' }).waitFor()
  await startNewProject(page)
  await page.locator('.compact-create-panel').getByLabel('Nome progetto').fill('Secondo mazzo')
  await page.locator('.compact-create-panel').getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Secondo mazzo' }).waitFor()

  await openProjectPicker(page)
  await page.getByRole('dialog', { name: 'Scegli progetto' }).locator('.project-picker-row')
    .filter({ hasText: 'Secondo mazzo' }).getByRole('button', { name: 'Archivia' }).click()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Primo mazzo' }).waitFor()
  await openProjectPicker(page)
  const picker = page.getByRole('dialog', { name: 'Scegli progetto' })
  await picker.getByRole('button', { name: 'Archiviati (1)' }).click()
  assert.match(await picker.textContent(), /Secondo mazzo/)
  await picker.getByRole('button', { name: 'Ripristina', exact: true }).click()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Secondo mazzo' }).waitFor()

  await switchProject(page, /Primo mazzo/)
  assert.match(await page.getByTestId('baseline-panel').textContent(), /Carta A/)
  await openProjectPicker(page)
  await page.getByRole('dialog', { name: 'Scegli progetto' }).locator('.project-picker-row')
    .filter({ hasText: 'Primo mazzo' }).getByRole('button', { name: 'Archivia' }).click()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Secondo mazzo' }).waitFor()
  await openProjectPicker(page)
  await picker.getByRole('button', { name: 'Archiviati (1)' }).click()
  await picker.getByRole('button', { name: 'Elimina definitivamente' }).click()
  const dialog = page.getByRole('dialog', { name: /Elimina definitivamente/ })
  await dialog.waitFor()
  assert.match(await dialog.textContent(), /Thread.*guide Matchup.*evidenze AI/s)
  const confirm = dialog.getByRole('button', { name: 'Elimina definitivamente' })
  assert.equal(await confirm.isDisabled(), true)
  await dialog.getByLabel(/Scrivi esattamente/).fill('sbagliato')
  assert.equal(await confirm.isDisabled(), true)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  await openProjectPicker(page)
  await picker.getByRole('button', { name: 'Archiviati (1)' }).click()
  await picker.getByRole('button', { name: 'Elimina definitivamente' }).click()
  await dialog.getByLabel(/Scrivi esattamente/).fill('Primo mazzo')
  await confirm.click()
  await dialog.waitFor({ state: 'detached' })
  await application.close(); application = null

  application = await launch()
  page = await application.firstWindow()
  await page.getByTestId('selected-project-name').filter({ hasText: 'Secondo mazzo' }).waitFor()
  await openProjectPicker(page)
  await page.getByRole('dialog', { name: 'Scegli progetto' }).getByRole('button', { name: 'Archiviati (0)' }).click()
  await page.getByText('Nessun progetto archiviato.').waitFor()
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'), { readOnly: true })
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  assert.deepEqual(db.prepare('SELECT name FROM projects').all().map((row) => row.name), ['Secondo mazzo'])
  db.close()
  console.log('Archivio progetti: UI, conferma e riapertura verificati in Electron.')
} finally {
  if (application) await application.close()
  await new Promise((resolve) => setTimeout(resolve, 500))
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  catch (error) { console.warn('Profilo temporaneo da rimuovere:', profile, error.message) }
}
