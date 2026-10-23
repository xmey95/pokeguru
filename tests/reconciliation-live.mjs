import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-reconcile-live-'))
const dataDirectory = join(temporary, 'profile')
let application

async function launch() {
  return electron.launch({ executablePath: electronPath, args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: dataDirectory }, timeout: 30000 })
}

const rawText = [
  'Trainers: 7',
  '2 Iono PAL 185',
  '1 Iono PAL 254',
  '1 Rare Candy PAF 089',
  "1 Boss's Orders SWSHALT 127",
  '1 Carta promo PR-SV 001a',
  '1 Basic Psychic Energy SVE 5',
  'Total Cards: 7'
].join('\n')

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Riconciliazione test')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByRole('button', { name: 'Catalogo' }).click()
  await page.getByRole('button', { name: 'Sincronizza campione' }).click()
  await page.getByText('28/28', { exact: true }).first().waitFor({ timeout: 90000 })
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByLabel('Testo lista').fill(rawText)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  const first = page.getByTestId('reconcile-line-2')
  await first.getByRole('button', { name: 'Scegli carta e stampa' }).click()
  assert.match(await first.locator('.reconciliation-candidate').first().textContent(), /n\. 185/)
  await first.getByLabel('Lingua del testo originale (facoltativa)').fill('it')
  await first.locator('.reconciliation-candidate').first().getByRole('button', { name: 'Usa questa stampa' }).click()
  assert.match(await first.locator('.mapped-print').textContent(), /Uncommon/)
  assert.match(await first.locator('.mapped-print').textContent(), /lingua del testo: it/)
  const second = page.getByTestId('reconcile-line-3')
  await second.getByRole('button', { name: 'Scegli carta e stampa' }).click()
  assert.match(await second.locator('.reconciliation-candidate').first().textContent(), /n\. 254/)
  await second.locator('.reconciliation-candidate').first().getByRole('button', { name: 'Usa questa stampa' }).click()
  await second.locator('.mapped-print').waitFor()
  assert.match(await page.locator('.identity-totals').textContent(), /Iono: 3/)
  assert.match(await page.locator('.identity-totals').textContent(), /sv02-185, sv02-254/)
  const alt = page.getByTestId('reconcile-line-5')
  await alt.getByRole('button', { name: 'Scegli carta e stampa' }).click()
  assert.match(await alt.textContent(), /Codice ALT nel testo/)
  assert.match(await alt.locator('.reconciliation-candidate').first().textContent(), /Solo nome coincidente/)
  await alt.getByRole('button', { name: 'Chiudi scelta' }).click()
  const promo = page.getByTestId('reconcile-line-6')
  await promo.getByRole('button', { name: 'Scegli carta e stampa' }).click()
  assert.match(await promo.textContent(), /Nessuna proposta nel campione/)
  await promo.getByRole('button', { name: 'Chiudi scelta' }).click()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), rawText)
  await page.screenshot({ path: join(temporary, 'reconciliation.png'), fullPage: true })
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('heading', { name: 'Riconciliazione test' }).waitFor()
  assert.match(await page.getByTestId('reconcile-line-2').locator('.mapped-print').textContent(), /sv02/)
  assert.match(await page.locator('.identity-totals').textContent(), /Iono: 3/)
  await page.getByLabel('Nome progetto').fill('Altro progetto')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByLabel('Testo lista').fill(rawText)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('reconcile-line-2').getByRole('button', { name: 'Scegli carta e stampa' }).waitFor()
  assert.equal(await page.locator('.mapped-print').count(), 0)
  await page.getByRole('button', { name: /Riconciliazione test/ }).click()
  await page.getByLabel('Testo lista').fill('1 Iono PAL 185')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.getByTestId('reconcile-line-1').getByRole('button', { name: 'Scegli carta e stampa' }).waitFor()
  assert.equal(await page.locator('.mapped-print').count(), 0)
  await application.close()
  application = undefined

  console.log('E2E APP-006 OK: scelta esplicita, codici ALT/promo, aggregazione, testo integro, riapertura, isolamento e cambio lista.')
  console.log(`Screenshot: ${join(temporary, 'reconciliation.png')}`)
} finally {
  if (application) await application.close()
  if (process.env.KEEP_POKEGURU_E2E !== '1') {
    if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-reconcile-live-')) {
      throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
    }
    rmSync(temporary, { recursive: true, force: true })
  }
}
