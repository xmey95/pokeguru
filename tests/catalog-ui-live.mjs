import { auditDesignSystem } from './design-system-audit.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { catalogManagementScenarios } from './catalog-management-scenarios.mjs'

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
  await page.getByRole('heading', { name: 'Catalogo', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Aggiorna nuove carte' }).count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Scansione completa' }).count(), 0)
  await page.getByText('Catalogo vuoto.', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  await page.getByRole('button', { name: 'Sincronizza campione' }).waitFor()
  await page.getByRole('button', { name: 'Chiudi gestione' }).click()
  assert.equal(await page.getByLabel('Nome progetto').count(), 0)
  await page.getByRole('button', { name: 'Impostazioni AI' }).click()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Catalogo', exact: true }).waitFor()
  await application.close()
  application = undefined

  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const timestamp = '2026-10-23T12:00:00.000Z'
    for (const [id, name] of [['sv05', 'Set A'], ['me01', 'Set B'], ['sv99', 'Set C'], ['nvp', 'New Promos']]) {
      db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date) VALUES (?, ?, 10, 1, ?, ?)')
        .run(id, name, timestamp, id === 'sv05' ? '2024-03-22' : id === 'me01' ? '2025-09-27' : null)
    }
    for (const [id, setId, name, detailAt, isPromo] of [
      ['sv05-001', 'sv05', 'Carta A', timestamp, false],
      ['me01-001', 'me01', 'Carta B', timestamp, false],
      ['sv99-001', 'sv99', 'Carta C', timestamp, false],
      ['nvp-001', 'nvp', 'Promo nuova', null, true]
    ]) {
      const gameplay = id === 'sv05-001' ? { hp: null, types: [], evolveFrom: null,
        attacks: [], abilities: [], effect: 'Search your deck for a Pokémon.', trainerType: 'Item',
        weaknesses: [], resistances: [], retreat: null } : undefined
      const print = { id, setId, setName: setId === 'sv05' ? 'Set A' : setId === 'me01' ? 'Set B' : setId === 'sv99' ? 'Set C' : 'New Promos',
        localId: '001', name, category: gameplay ? 'Trainer' : null, rarity: null, variants: null,
        identityId: null, identityBasis: null, imageBase: null, thumbnail: null,
        highImageAvailable: null, sourceUpdated: null,
        sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt, error: null, isPromo,
        gameplaySchemaVersion: gameplay ? 1 : undefined, gameplay }
      db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(id, setId, JSON.stringify(print))
      db.prepare('INSERT INTO catalog_targets VALUES (?)').run(id)
    }
    db.prepare("INSERT INTO catalog_scope VALUES (1, 'standard-marks')").run()
    db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(timestamp)
  } finally { db.close() }

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByLabel('Cerca carta o stampa').waitFor()
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    assert.equal(await page.locator('.main-content').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false)
    await auditDesignSystem(page, 'Design system '+width)
    const firstResult = await page.locator('.catalog-list > button').first().boundingBox()
    assert.ok(firstResult && firstResult.y + firstResult.height < height, 'Primo risultato fuori dalla prima schermata')
    await page.screenshot({ path: join(workspace, 'node_modules', `content-catalog-${width}.png`) })
  }
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  await page.getByText(/Copertura per set ·/).click()
  const table = page.getByRole('table', { name: 'Copertura Standard per set' })
  await table.waitFor()
  assert.match(await page.locator('.catalog-set-coverage').first().textContent(), /Set ufficiali nel manifest: 2\/17; 15 mancanti/)
  assert.match(await page.getByRole('status').filter({ hasText: 'Set ufficiali non presenti nel manifest' }).textContent(), /Twilight Masquerade \(sv06\)/)
  assert.match(await table.textContent(), /Data set \(TCGdex\)/)
  assert.match(await table.textContent(), /Uscita ufficiale/)
  assert.match(await table.getByRole('row').filter({ hasText: 'Set A' }).textContent(), /22 mar 2024/)
  assert.match(await table.getByRole('row').filter({ hasText: 'Set B' }).textContent(), /Date diverse/)
  assert.match(await table.getByRole('row').filter({ hasText: 'Set C' }).textContent(), /Da verificare/)
  assert.match(await table.textContent(), /Set A.*1.*1.*0/s)
  assert.match(await table.textContent(), /New Promos.*1.*0.*1/s)
  await table.getByRole('button', { name: /Set A/ }).click()
  assert.equal(await page.locator('#catalog-management').isVisible(), false)
  await page.waitForFunction(() => document.activeElement?.id === 'catalog-set-filter')
  await page.getByRole('button', { name: /Carta A/ }).click()
  await page.locator('.catalog-detail').getByText('Search your deck for a Pokémon.', { exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  await page.getByText(/Copertura per set ·/).click()
  await table.getByRole('button', { name: /New Promos/ }).click()
  assert.equal(await page.getByLabel('Espansione').inputValue(), 'nvp')
  await catalogManagementScenarios(page, application, workspace)
  await page.getByLabel('Cerca carta o stampa').fill('nessuna-carta-fixture')
  await page.locator('.search-empty').getByRole('status').waitFor()
  assert.equal(await page.locator('.catalog-detail').count(), 0)
  await page.getByRole('button', { name: 'Azzera filtri' }).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.getByLabel('Cerca carta o stampa').inputValue(), '')
  assert.equal(await page.getByLabel('Espansione').inputValue(), 'all')
  assert.ok(await page.getByLabel('Cerca carta o stampa').evaluate(el => el === document.activeElement))
  console.log('E2E catalogo OK: accesso globale, copertura per set e filtro senza progetto.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-catalog-ui-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
