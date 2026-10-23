import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-export-live-'))
const input = ['Trainer: 9', '2 Iono PAL 185', '1 Iono PAL 254', '1 Rare Candy PAF 089', '', 'Total Cards: 99'].join('\n')
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: join(temporary, 'profile') }, timeout: 30000 })
  const page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Verifica export')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByLabel('Testo lista').fill(input)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  const expected = 'Trainer: 3\n2 Iono PAL 185\n1 Iono PAL 254\n1 Rare Candy PAF 089\n\nTotal Cards: 4\n'
  await page.getByRole('button', { name: 'Copia export' }).click()
  await page.getByText('Export copiato negli appunti.').waitFor()
  assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), expected)
  assert.equal(await page.getByRole('region', { name: 'Esporta lista' }).count(), 0)

  await page.getByLabel('Testo lista').fill(expected)
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.getByTestId('card-total').getByText('4 carte').waitFor()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), expected)
  await page.getByLabel('Testo lista').fill('2 Iono PAL 185\n? carta dubbia')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.getByRole('button', { name: 'Copia export' }).click()
  await page.getByRole('alert').getByText('Correggi le righe non interpretate prima di esportare.').waitFor()
  assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), expected)
  console.log('E2E APP-008 OK: copia immediata, reimport e blocco senza alterare gli appunti.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-export-live-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
