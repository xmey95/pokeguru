import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-large-'))
const profile = join(temporary, 'profile')
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30_000 })
let app

try {
  app = await launch()
  await app.firstWindow()
  await app.close()
  app = undefined

  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const now = '2026-10-25T00:00:00.000Z'
    for (let set = 0; set < 10; set++) {
      db.prepare(`INSERT INTO catalog_sets
        (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, 1000, 1000, ?)`)
        .run(`s${set}`, `Synthetic set ${set}`, now)
    }
    db.prepare("INSERT INTO catalog_scope (id, kind) VALUES (1, 'standard-marks')").run()
    db.prepare('INSERT INTO catalog_sync (id, fetched_at) VALUES (1, ?)').run(now)
    const add = db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
    const target = db.prepare('INSERT INTO catalog_targets (print_id) VALUES (?)')
    const image = `data:image/webp;base64,${'A'.repeat(4096)}`
    db.exec('BEGIN IMMEDIATE')
    for (let index = 0; index < 10_000; index++) {
      const setId = `s${Math.floor(index / 1000)}`
      const id = `${setId}-${String(index).padStart(5, '0')}`
      add.run(id, setId, JSON.stringify({
        id, setId, setName: `Synthetic set ${Math.floor(index / 1000)}`,
        localId: String(index % 1000), name: `Card ${String(index).padStart(5, '0')}`,
        category: 'Pokemon', stage: 'Basic', rarity: 'Common', regulationMark: 'I',
        variants: null, identityId: `identity-${index}`, identityBasis: 'pokemon-text',
        imageBase: null, thumbnail: index % 20 === 0 ? image : null,
        highImageAvailable: null, sourceUpdated: null,
        sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: now, error: null,
        gameplaySchemaVersion: 1, gameplay: { hp: 100, types: ['Grass'], evolveFrom: null,
          attacks: [], abilities: [], effect: null, trainerType: null,
          weaknesses: [], resistances: [], retreat: 1 }
      }))
      target.run(id)
    }
    db.exec('COMMIT')
  } finally { db.close() }

  app = await launch()
  const page = await app.firstWindow()
  const start = performance.now()
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByLabel('Cerca carta o stampa').waitFor()
  await page.locator('.catalog-list > button').first().waitFor()
  const openMs = performance.now() - start
  assert.equal(await page.locator('.catalog-list > button').count(), 100)
  assert.match(await page.locator('.catalog-list > .content-note').textContent(), /10000 risultati/)
  const ipc = await page.evaluate(async () => {
    let start = performance.now()
    const overview = await window.projectsApi.getCatalogBrowseOverview()
    const overviewMs = performance.now() - start
    start = performance.now()
    const result = await window.projectsApi.searchCatalog('Card 09999', 'all', 0)
    const searchMs = performance.now() - start
    return { overviewMs, searchMs, overviewBytes: JSON.stringify(overview).length,
      searchBytes: JSON.stringify(result).length, total: result.ok ? result.value.total : -1 }
  })
  assert.equal(ipc.total, 1)
  const searchStart = performance.now()
  await page.getByLabel('Cerca carta o stampa').fill('Card 09999')
  await page.locator('.catalog-list > button').filter({ hasText: 'Card 09999' }).waitFor()
  const searchUiMs = performance.now() - searchStart
  await page.locator('.catalog-detail').getByText('Card 09999').waitFor()
  await page.getByLabel('Cerca carta o stampa').fill('')
  await page.locator('.catalog-list > button').first().waitFor()
  await page.getByRole('button', { name: 'Successivi' }).click()
  await page.locator('.catalog-list > .content-note').getByText(/101–200/).waitFor()
  assert.equal(await page.locator('.catalog-list > button').count(), 100)
  console.log(JSON.stringify({ prints: 10_000, openMs: +openMs.toFixed(1),
    searchUiMs: +searchUiMs.toFixed(1), ipc }))
} finally {
  if (app) await app.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-catalog-large-')) throw new Error('Percorso temporaneo inatteso.')
  rmSync(temporary, { recursive: true, force: true })
}
