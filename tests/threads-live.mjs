import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-threads-live-'))
const profile = join(temporary, 'profile')
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Test thread')
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('.new-thread-details > summary').click()
  await page.getByLabel('Titolo').fill('Da zero')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.getByText('Senza lista iniziale').first().waitFor()
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('60 Carta A MEG 1')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByTestId('card-total').getByText('60 carte').waitFor()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  assert.match(await page.locator('.thread-detail').textContent(), /Base da confrontare/)
  await page.locator('.new-thread-details > summary').click()
  await page.getByLabel('Titolo').fill('Piano A')
  await page.getByLabel('Prima osservazione (facoltativa)').fill('Più pescata')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.locator('.manual-candidate > summary').click()
  await page.getByLabel('Lista completa proposta').fill('60 Carta B MEG 2')
  await page.getByLabel('Motivo o appunti (facoltativo)').fill('Cambio completo')
  await page.getByRole('button', { name: 'Salva candidata nel thread' }).click()
  await page.locator('.thread-candidate.featured > summary').waitFor()
  await page.locator('.new-thread-details > summary').click()
  await page.getByLabel('Titolo').fill('Piano B')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.getByLabel('Lista completa proposta').fill('60 Carta C MEG 3')
  await page.getByRole('button', { name: 'Salva candidata nel thread' }).click()
  await page.locator('.thread-picker').getByRole('button', { name: /Piano A/ }).click()
  assert.match(await page.locator('.thread-candidate').textContent(), /Carta B/)
  assert.doesNotMatch(await page.locator('.thread-candidate').textContent(), /Carta C/)
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  assert.equal(await page.locator('.original-text pre').textContent(), '60 Carta A MEG 1')
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('60 Carta D MEG 4')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  assert.match(await page.locator('.thread-detail').textContent(), /Base da confrontare/)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('.thread-picker').getByRole('button', { name: /Piano A/ }).click()
  assert.match(await page.locator('.thread-detail').textContent(), /Più pescata/)
  assert.match(await page.locator('.thread-candidate').textContent(), /Carta B/)
  assert.match(await page.locator('.thread-detail').textContent(), /Base da confrontare/)
  assert.equal(await page.locator('.thread-versions > details').count(), 2)
  await page.screenshot({ path: join(temporary, 'threads.png'), fullPage: true })
  console.log('E2E APP-019 OK: thread paralleli, candidate isolate, base superata e riapertura.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-threads-live-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
