import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-rule-audit-'))
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: join(temporary, 'profile') }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  const region = page.locator('details[aria-label="Fonti delle regole Standard"]')
  await region.locator('summary').click()
  await region.getByRole('button', { name: 'Controlla fonti Standard' }).click()
  await region.getByRole('button', { name: 'Controlla fonti Standard' }).waitFor({ timeoutMs: 20000 })
  const first = await region.textContent()
  assert.match(first, /Rotazione 2026: (coerente|non raggiungibile|da rivedere)/)
  assert.match(first, /Attesa dei prodotti: (coerente|non raggiungibile|da rivedere)/)
  assert.doesNotMatch(first, /non ancora ricontrollate da questa installazione/)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  const reopened = await page.locator('details[aria-label="Fonti delle regole Standard"]').textContent()
  assert.match(reopened, /Rotazione 2026: (coerente|non raggiungibile|da rivedere)/)
  console.log('E2E APP-049 OK: audit fonti ufficiali e stato globale conservato dopo riavvio.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-rule-audit-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(temporary, { recursive: true, force: true })
}
