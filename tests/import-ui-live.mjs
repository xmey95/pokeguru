import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport, startNewProject, switchProject } from './project-ui-helper.mjs'
import { auditDesignSystem } from './design-system-audit.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-import-ui-'))
const profile = join(temporary, 'profile')
const original = 'Pokémon: 2\n2 Mega Absol ex MEG 086\nTotal Cards: 2'
const replacement = 'Trainer: 3\n3 Iono PAL 185\nTotal Cards: 3'
let application
function database(action) {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try { return action(db) } finally { db.close() }
}
function snapshot() {
  return database((db) => ({ baselines: db.prepare('SELECT * FROM deck_baselines ORDER BY project_id').all(),
    versions: db.prepare('SELECT * FROM deck_versions ORDER BY project_id, sequence').all() }))
}
async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Importazione UI · fixture')
  await page.getByRole('heading', { name: 'Aggiungi una lista' }).waitFor()
  assert.equal(await page.locator('#deck-import').getByRole('button', { name: 'Annulla' }).count(), 0)
  await page.getByLabel('Testo lista').fill(original)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByText('Lista salvata.', { exact: true }).waitFor()
  const saved = snapshot()
  const trigger = page.getByRole('button', { name: 'Importa / sostituisci' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.activeElement?.id === 'deck-text')
  assert.equal(await page.getByLabel('Testo lista').inputValue(), original)
  assert.ok(await page.getByText('Il salvataggio sostituisce la lista principale.').isVisible())
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await page.locator('#deck-import').evaluate((el) => {
      const main = el.closest('.main-content')
      main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 20
    })
    await auditDesignSystem(page, 'Importazione ' + width)
    assert.ok(await page.locator('#deck-import').evaluate((el) => {
      const main = el.closest('.main-content')
      const rect = el.getBoundingClientRect()
      const list = document.querySelector('.baseline-panel').getBoundingClientRect()
      return main.scrollWidth <= main.clientWidth + 1 && rect.left >= 0 && rect.right <= innerWidth &&
        rect.bottom <= list.top && document.documentElement.scrollTop === 0
    }))
  }
  await page.getByLabel('Testo lista').fill(replacement)
  await page.locator('#deck-import').getByRole('button', { name: 'Annulla' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.activeElement?.id === 'deck-import-trigger')
  assert.deepEqual(snapshot(), saved, 'Annulla non deve creare una versione o cambiare la baseline')
  await openDeckImport(page)
  assert.equal(await page.getByLabel('Testo lista').inputValue(), original)
  await page.getByLabel('Testo lista').fill(replacement)
  await page.keyboard.press('Escape')
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  assert.deepEqual(snapshot(), saved)

  await openDeckImport(page)
  await page.locator('#deck-file').setInputFiles({ name: 'sbagliato.csv', mimeType: 'text/csv', buffer: Buffer.from(replacement) })
  await page.locator('#deck-import').getByRole('alert').getByText('Seleziona un file .txt.').waitFor()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), original)
  await page.locator('#deck-file').setInputFiles({ name: 'grande.txt', mimeType: 'text/plain', buffer: Buffer.alloc(400001, 'x') })
  await page.locator('#deck-import').getByRole('alert').getByText('Il file è troppo grande').waitFor()
  assert.deepEqual(snapshot(), saved)
  await page.locator('#deck-file').setInputFiles({ name: 'nuova-lista.txt', mimeType: 'text/plain', buffer: Buffer.from(replacement) })
  await page.waitForFunction((text) => document.querySelector('#deck-text')?.value === text, replacement)
  database((db) => db.exec("CREATE TRIGGER fixture_import_failure BEFORE INSERT ON deck_baselines BEGIN SELECT RAISE(ABORT, 'Importazione fallita di prova'); END"))
  await page.getByRole('button', { name: 'Sostituisci lista', exact: true }).click()
  await page.locator('#deck-import').getByRole('alert').getByText('Operazione non salvata. Controlla l’archivio locale e riprova.').waitFor()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), replacement)
  assert.deepEqual(snapshot(), saved, 'Il fallimento deve lasciare intatti lista e versioni')
  database((db) => db.exec('DROP TRIGGER fixture_import_failure'))
  await page.getByRole('button', { name: 'Sostituisci lista', exact: true }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByText('Lista sostituita.', { exact: true }).waitFor()
  const replaced = snapshot()
  assert.equal(replaced.baselines[0].raw_text, replacement)
  assert.equal(replaced.baselines[0].file_name, 'nuova-lista.txt')
  assert.equal(replaced.baselines[0].source, 'file')
  assert.equal(replaced.versions.length, saved.versions.length + 1)

  // Delay only File.text in this UI fixture; late reads must not overwrite a cancelled form or another project.
  await openDeckImport(page)
  await page.evaluate(() => {
    window.fixtureFileText = File.prototype.text
    File.prototype.text = function () { return new Promise((resolve) => { window.fixtureFinishRead = () => resolve('59 Carta tardiva') }) }
  })
  await page.locator('#deck-file').setInputFiles({ name: 'lento.txt', mimeType: 'text/plain', buffer: Buffer.from('59 Carta tardiva') })
  await page.getByText('Lettura file…').waitFor()
  assert.ok(await page.getByRole('button', { name: 'Sostituisci lista', exact: true }).isDisabled())
  await page.locator('#deck-import').getByRole('button', { name: 'Annulla' }).click()
  await openDeckImport(page)
  await page.evaluate(async () => { window.fixtureFinishRead(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) })
  assert.equal(await page.getByLabel('Testo lista').inputValue(), replacement)
  await page.locator('#deck-file').setInputFiles({ name: 'altro-lento.txt', mimeType: 'text/plain', buffer: Buffer.from('59 Carta tardiva') })
  await page.getByText('Lettura file…').waitFor()
  await startNewProject(page)
  await page.getByLabel('Nome progetto').fill('Secondo progetto import')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByTestId('selected-project-name').getByText('Secondo progetto import').waitFor()
  await page.evaluate(async () => {
    window.fixtureFinishRead(); File.prototype.text = window.fixtureFileText
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame)
  })
  assert.equal(await page.getByLabel('Testo lista').inputValue(), '')
  await switchProject(page, 'Importazione UI · fixture')
  await page.locator('.original-text pre').waitFor({ state: 'attached' })
  assert.equal(await page.locator('#deck-import').count(), 1, 'La navigazione conserva il modulo lasciato aperto')
  assert.equal(await page.getByLabel('Testo lista').inputValue(), replacement, 'La lettura file tardiva non deve alterare la bozza conservata')
  assert.equal(await page.locator('.original-text pre').textContent(), replacement)
  assert.deepEqual(snapshot(), replaced)
  await application.close()
  application = await launch()
  page = await application.firstWindow()
  await page.getByTestId('selected-project-name').waitFor()
  await switchProject(page, 'Importazione UI · fixture')
  await page.locator('.original-text pre').waitFor({ state: 'attached' })
  assert.equal(await page.locator('#deck-import').count(), 0)
  assert.equal(await page.locator('.original-text pre').textContent(), replacement)
  console.log('IMPORT UI APP-066 OK: annullamento, file, rollback, recupero, letture tardive, isolamento, riapertura, tastiera e layout 1440/1280/640.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-import-ui-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(temporary, { recursive: true, force: true })
}
