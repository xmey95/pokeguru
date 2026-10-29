import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport, seedStoredCandidate } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-deck-history-'))
const profile = join(temporary, 'profile')
const first = '1 Mega Absol ex MEG 86\n59 Basic Psychic Energy'
const second = '2 Mega Absol ex MEG 86\n58 Basic Psychic Energy'
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Storico test')
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill(first)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })

  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await page.getByRole('button', { name: 'Nuova strategia', exact: true }).click()
  await page.getByLabel('Titolo').fill('Prima prova')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  await seedStoredCandidate(page, second)
  await page.locator('.thread-candidate.featured').waitFor()

  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('button', { name: 'Importa / sostituisci' }).click()
  await page.getByLabel('Testo lista').fill(second)
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.locator('.deck-history > summary').click()
  await page.getByLabel('Versione da consultare').selectOption({ label: 'v1' })
  await page.getByLabel('Etichetta').fill('Apertura')
  await page.getByLabel('Nota').fill('Prima versione')
  await page.getByRole('button', { name: 'Salva etichetta e nota' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('#deck-history-version option')]
    .some((item) => item.textContent?.includes('v1 · Apertura')))
  assert.match(await page.locator('.deck-history-diff').textContent(), /Confronto con la principale v2/)
  assert.equal(await page.locator('.original-text pre').textContent(), second)
  await page.setViewportSize({ width: 640, height: 800 })
  await page.locator('.deck-companion').waitFor()
  assert.match(await page.locator('.deck-companion').textContent(), /v2/)

  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await page.locator('.thread-candidate.featured .candidate-comparison > summary').click()
  await page.locator('.thread-candidate.featured').getByRole('button',
    { name: 'Continua in una strategia dalla lista attuale' }).click()
  await page.getByText('Strategia collegata a un percorso precedente.', { exact: false }).waitFor()
  await page.locator('.seed-candidate > summary').click()
  assert.equal(await page.locator('.seed-candidate pre').textContent(), second)
  assert.equal(await page.locator('.manual-candidate').count(), 0)
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.locator('.deck-history > summary').click()
  await page.getByLabel('Versione da consultare').selectOption({ label: 'v1 · Apertura' })
  await page.getByRole('button', { name: 'Ripristina v1 come lista principale' }).click()
  await page.getByRole('dialog', { name: 'Ripristinare la lista v1?' }).waitFor()
  await page.getByRole('button', { name: 'Confermo il ripristino' }).click()
  await page.getByRole('dialog', { name: 'Ripristinare la lista v1?' }).waitFor({ state: 'detached' })
  assert.equal(await page.locator('.original-text pre').textContent(), first)
  await page.locator('.deck-companion').waitFor()
  await page.locator('.deck-history > summary').click()
  assert.match(await page.locator('.deck-history > summary').textContent(), /\(3\)/)

  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('heading', { name: 'Storico test' }).waitFor()
  await page.locator('.deck-history > summary').click()
  assert.match(await page.locator('.deck-history > summary').textContent(), /\(3\)/)
  assert.equal(await page.locator('.original-text pre').textContent(), first)
  console.log('E2E APP-125 OK: storico, annotazione, confronto, dock, ripristino e Thread collegato dopo riavvio.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-deck-history-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(temporary, { recursive: true, force: true })
}
