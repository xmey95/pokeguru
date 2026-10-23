import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-standard-electron-'))
let application

try {
  application = await electron.launch({
    executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: join(temporary, 'profile') },
    timeout: 30000
  })
  const page = await application.firstWindow()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByRole('button', { name: 'Aggiorna nuove carte' }).click()
  await page.waitForFunction(() => {
    const text = document.querySelector('.catalog-section [role="status"]')?.textContent ?? ''
    return /Aggiornamento terminato|In pausa/.test(text)
  }, null, { timeout: 420000 })
  const status = await page.locator('.catalog-section [role="status"]').first().textContent()
  assert.match(status, /Aggiornamento terminato/, `Catalogo interrotto: ${status}`)
  await page.getByLabel('Ricerca carta, set, stampa o rarità').fill('mep-051')
  const detail = await page.locator('.catalog-detail').textContent()
  assert.match(detail, /Oshawott/)
  assert.match(detail, /Marchio: J/)
  if (!/Registro promo: disponibile alla data del controllo/.test(detail)) {
    const auditDb = new DatabaseSync(join(temporary, 'profile', 'data', 'pokeguru.sqlite'))
    try {
      const auditError = auditDb.prepare('SELECT error FROM catalog_promo_audit WHERE id = 1').get()?.error
      process.stderr.write(`Registro promo live: ${auditError ?? 'nessun errore registrato'}\n`)
    } finally { auditDb.close() }
  }
  assert.match(detail, /Registro promo: disponibile alla data del controllo/)
  const db = new DatabaseSync(join(temporary, 'profile', 'data', 'pokeguru.sqlite'))
  try {
    const audit = db.prepare('SELECT checked_at, error, series_json FROM catalog_promo_audit WHERE id = 1').get()
    assert.ok(audit.checked_at)
    assert.ok(JSON.parse(audit.series_json).includes('MEP'))
    const targets = db.prepare('SELECT COUNT(*) AS count FROM catalog_targets').get().count
    assert.ok(targets > 3000)
    process.stdout.write(`Catalogo Electron live OK: ${targets} stampe, pacchetto promo datato, MEP 051 disponibile.\n`)
  } finally { db.close() }
} finally {
  if (application) await application.close()
  rmSync(temporary, { recursive: true, force: true })
}
