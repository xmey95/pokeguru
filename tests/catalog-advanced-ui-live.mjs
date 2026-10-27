import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-advanced-catalog-'))
const profile = join(temporary, 'profile')
let application

const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0' }, timeout: 30000 })

function seed() {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  const now = new Date().toISOString()
  try {
    for (const id of ['me01', 'me02']) db.prepare(
      'INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, 2, 2, ?)')
      .run(id, `Set ${id} · fixture`, now)
    for (const [id, name, effect] of [
      ['me01-001', 'Fixture Recycler', 'Shuffle up to 5 basic Energy cards from your discard pile into your deck.'],
      ['me01-004', 'Fixture Ability Lock', 'Your opponent’s Pokémon have no Abilities.'],
      ['me02-002', 'Fixture Search', 'Search your deck for a basic Energy card. Reveal it and put it into your hand.'],
      ['me02-003', 'Fixture Recovery', 'Put a Pokémon from your discard pile into your hand.']
    ]) {
      const setId = id.split('-')[0]
      const print = { id, setId, setName: `Set ${setId} · fixture`, localId: id.split('-')[1],
        name, category: 'Trainer', stage: null, energyType: null, rarity: 'Uncommon',
        regulationMark: 'I', identityId: id, identityBasis: 'trainer-text',
        variants: null, gameplaySchemaVersion: 1,
        gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
          effect, trainerType: 'Item', weaknesses: [], resistances: [], retreat: null },
        imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
        sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: now, error: null }
      db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
        .run(id, setId, JSON.stringify(print))
      db.prepare('INSERT INTO catalog_targets VALUES (?)').run(id)
    }
    db.prepare("INSERT INTO catalog_scope VALUES (1, 'standard-marks')").run()
    db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(now)
  } finally { db.close() }
}

try {
  application = await launch()
  await application.firstWindow()
  await application.close()
  application = undefined
  seed()

  application = await launch()
  const page = await application.firstWindow()
  page.setDefaultTimeout(15000)
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.getByLabel('Cerca carta o stampa').fill('Fixture Recycler')
  await page.locator('.catalog-list').getByRole('button', { name: /Fixture Recycler/ }).waitFor()
  await page.getByRole('button', { name: 'Ricerca avanzata AI' }).click()
  await page.getByLabel('Descrivi le carte da trovare').fill('Mostrami le carte che recuperano Energie dalla pila degli scarti.')
  await page.getByRole('button', { name: 'Cerca con AI' }).click()
  await Promise.race([
    page.locator('.catalog-advanced-summary').waitFor({ timeout: 180000 }),
    page.locator('.error-banner[role=alert]').waitFor({ timeout: 180000 }).then(async () => {
      throw new Error(`Ricerca avanzata fallita: ${await page.locator('.error-banner[role=alert]').last().textContent()}`)
    })
  ])
  assert.match(await page.locator('.catalog-advanced-summary').textContent(), /Inventario locale: 4\/4 stampe/)
  await page.locator('.catalog-list').getByRole('button', { name: /Fixture Recycler/ }).waitFor()
  await page.locator('.catalog-list').getByRole('button', { name: /Fixture Recycler/ }).click()
  await page.locator('.catalog-detail').getByText(/Shuffle up to 5 basic Energy cards/).waitFor()
  await page.getByLabel('Espansione').selectOption('me02')
  await page.locator('.catalog-list').getByRole('button', { name: /Fixture Recycler/ })
    .waitFor({ state: 'detached' })
  await page.getByLabel('Espansione').selectOption('all')
  await page.locator('.catalog-list').getByRole('button', { name: /Fixture Recycler/ }).waitFor()
  await page.getByLabel('Descrivi le carte da trovare').fill('Carte utili contro le Abilità')
  await page.getByRole('button', { name: 'Cerca con AI' }).click()
  await page.locator('.catalog-list').getByRole('button', { name: /Fixture Ability Lock/ }).waitFor({ timeout: 180000 })
  await page.getByRole('button', { name: 'Ricerca rapida' }).click()
  assert.equal(await page.getByLabel('Cerca carta o stampa').inputValue(), 'Fixture Recycler')
  await page.locator('.catalog-list').getByRole('button', { name: /Fixture Recycler/ }).waitFor()
  await page.setViewportSize({ width: 640, height: 720 })
  assert.equal(await page.locator('.main-content').evaluate((element) =>
    element.scrollWidth > element.clientWidth + 1), false)
  console.log('Ricerca avanzata Electron/Codex OK: lista, scheda, espansione, ritorno alla ricerca rapida e 640 px.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-advanced-catalog-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
