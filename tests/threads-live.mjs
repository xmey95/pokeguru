import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport, seedStoredCandidate, switchThread } from './project-ui-helper.mjs'

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
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await page.getByRole('button', { name: 'Nuova strategia', exact: true }).click()
  await page.getByLabel('Titolo').fill('Da zero')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.manual-candidate').count(), 0)
  await page.getByText('Senza lista iniziale').first().waitFor()
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('60 Carta A MEG 1')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByTestId('card-total').getByText('60 carte').waitFor()
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  assert.match(await page.locator('.thread-detail').textContent(), /lista precedente/i)
  await page.getByRole('button', { name: 'Nuova strategia', exact: true }).click()
  await page.getByLabel('Titolo').fill('Piano A')
  await page.getByLabel('Primo messaggio a Codex').fill('Più pescata')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  await page.getByLabel('Scrivi nella strategia').fill('Rendi la lista più consistente')
  assert.equal(await page.getByRole('button', { name: 'Invia a Codex', exact: true }).isEnabled(), true)
  await seedStoredCandidate(page, '60 Carta B MEG 2', 'Cambio completo')
  await page.locator('.thread-candidate.featured .candidate-brief').waitFor()
  assert.match(await page.locator('#thread-switcher-trigger').innerText(), /Proposta nuova/)
  await page.getByRole('button', { name: 'Nuova strategia', exact: true }).click()
  await page.getByLabel('Titolo').fill('Piano B')
  await page.getByRole('button', { name: 'Salva nota senza AI' }).click()
  await page.locator('#new-thread-form').waitFor({ state: 'detached' })
  await seedStoredCandidate(page, '60 Carta C MEG 3')
  await switchThread(page, /Piano A/)
  assert.match(await page.locator('.thread-candidate').textContent(), /Carta B/)
  assert.doesNotMatch(await page.locator('.thread-candidate').textContent(), /Carta C/)
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Lista', exact: true }).click()
  assert.equal(await page.locator('.original-text pre').textContent(), '60 Carta A MEG 1')
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('60 Carta D MEG 4')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  assert.match(await page.locator('.thread-detail').textContent(), /lista precedente/i)
  assert.match(await page.locator('#thread-switcher-trigger').innerText(), /lista precedente/i)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await switchThread(page, /Piano A/)
  assert.match(await page.locator('.thread-detail').textContent(), /Più pescata/)
  assert.match(await page.locator('.thread-candidate').textContent(), /Carta B/)
  assert.match(await page.locator('.thread-detail').textContent(), /lista precedente/i)
  assert.equal(await page.locator('.thread-versions > details').count(), 2)
  for (const [text, label] of [
    ['60 Carta D MEG 4', 'Nessuna variazione'],
    ['60 Carta D MEG 5', 'Cambiano solo le stampe'],
    ['59 Carta D MEG 5', '+0 / −1 copie']
  ]) {
    await seedStoredCandidate(page, text, '', 'Piano A')
    await page.locator('.candidate-change-summary').getByText(label, { exact: false }).waitFor()
    assert.equal(await page.locator('.candidate-comparison').getAttribute('open'), null)
    assert.match(await page.locator('.candidate-brief').innerText(), /Adozione bloccata/)
  }
  await page.locator('.thread-timeline .thread-candidate > summary').first().click()
  assert.match(await page.locator('.thread-timeline .thread-candidate').first().innerText(), /Carta B/)
  await page.screenshot({ path: join(temporary, 'threads.png'), fullPage: true })
  console.log('E2E APP-019 OK: thread paralleli, candidate isolate, base superata e riapertura.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-threads-live-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
