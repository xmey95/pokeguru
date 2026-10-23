import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-ui-'))
let application
const profile = join(temporary, 'profile')
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Carte e ristampe' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Aggiorna nuove carte' }).count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Scansione completa' }).count(), 1)
  assert.equal(await page.getByLabel('Nome progetto').count(), 1)
  await page.getByRole('button', { name: 'Impostazioni AI' }).click()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Carte e ristampe' }).waitFor()
  await application.close()
  application = undefined

  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const timestamp = '2026-10-23T12:00:00.000Z'
    for (const [id, name] of [['sv05', 'Set A'], ['nvp', 'New Promos']]) {
      db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date) VALUES (?, ?, 10, 1, ?, ?)')
        .run(id, name, timestamp, id === 'sv05' ? '2024-03-22' : null)
    }
    for (const [id, setId, name, detailAt, isPromo] of [
      ['sv05-001', 'sv05', 'Carta A', timestamp, false],
      ['nvp-001', 'nvp', 'Promo nuova', null, true]
    ]) {
      const print = { id, setId, setName: setId === 'sv05' ? 'Set A' : 'New Promos',
        localId: '001', name, category: null, rarity: null, variants: null,
        identityId: null, identityBasis: null, imageBase: null, thumbnail: null,
        highImageAvailable: null, sourceUpdated: null,
        sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt, error: null, isPromo }
      db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(id, setId, JSON.stringify(print))
      db.prepare('INSERT INTO catalog_targets VALUES (?)').run(id)
    }
    db.prepare("INSERT INTO catalog_scope VALUES (1, 'standard-marks')").run()
    db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(timestamp)
  } finally { db.close() }

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  const table = page.getByRole('table', { name: 'Copertura Standard per set' })
  await table.waitFor()
  assert.match(await table.textContent(), /Data set \(TCGdex\)/)
  assert.match(await table.getByRole('row').filter({ hasText: 'Set A' }).textContent(), /22 mar 2024/)
  assert.match(await table.textContent(), /Set A.*1.*1.*0/s)
  assert.match(await table.textContent(), /New Promos.*1.*0.*1/s)
  await table.getByRole('button', { name: /New Promos/ }).click()
  assert.equal(await page.getByLabel('Espansione').inputValue(), 'nvp')
  console.log('E2E catalogo OK: accesso globale, copertura per set e filtro senza progetto.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-catalog-ui-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
