import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'
import { auditDesignSystem } from './design-system-audit.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-catalog-card-ui-'))
const now = new Date().toISOString()
const empty = { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [], effect: null,
  trainerType: null, weaknesses: [], resistances: [], retreat: null }
const artwork = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="252"><rect width="180" height="252" rx="10" fill="#c6ded6"/><rect x="12" y="24" width="156" height="100" fill="#698e86"/><path d="M16 148h148M16 168h126M16 188h138M16 208h110" stroke="#304b47" stroke-width="6"/></svg>').toString('base64')
// Synthetic cards and text for layout/state checks; no competitive assertions or remote acquisition.
const pokemon = { ...empty, hp: 280, types: ['Darkness'], retreat: 0,
  attacks: [{ name: 'Attacco di prova', cost: ['Darkness', 'Colorless'], damage: '120+', effect: 'UI fixture: a readable attack effect.' }],
  abilities: [{ name: 'Abilità di prova', type: 'Ability', effect: 'UI fixture: a readable ability effect.' }],
  weaknesses: [{ type: 'Grass', value: '×2' }] }
function seed() {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    // Keep this fixed catalog fixture stable while exercising its detail UI.
    db.prepare(`INSERT INTO daily_sync (source, last_attempt_at, last_success_at, trigger, outcome, next_attempt_at, error)
      VALUES ('catalog', ?, ?, NULL, 'success', NULL, NULL)
      ON CONFLICT(source) DO UPDATE SET last_success_at=excluded.last_success_at, outcome='success', next_attempt_at=NULL`).run(now, now)
    for (const [id, name] of [['me01', 'Set A · fixture'], ['me02.5', 'Set B · fixture'], ['mee', 'Mega Energy · fixture']]) db.prepare(
      'INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, 10, 5, ?)').run(id, name, now)
    for (const [id, name, category, gameplay, image, basis, extra] of [
      ['me01-001', 'Pokémon di prova', 'Pokemon', null, 'data:image/png;base64,broken', 'pokemon-text', {}],
      ['me02.5-002', 'Pokémon di prova', 'Pokemon', pokemon, 'pokeguru://cards/me02.5-002.webp', 'pokemon-text', {}],
      ['me01-003', 'Allenatore di prova', 'Trainer', { ...empty, trainerType: 'Supporter', effect: 'UI fixture: search your deck for a Pokémon.\nThen shuffle your deck.' }, artwork, 'trainer-text', {}],
      ['me01-004', 'Energia Base di prova', 'Energy', empty, null, 'energy-text', { energyType: 'Basic' }],
      ['mee-001', 'Energia Limitless di prova', 'Energy', empty, 'pokeguru://cards/mee-001.png', 'energy-text', { energyType: 'Basic' }],
      ['me01-005', 'Energia speciale di prova', 'Energy', { ...empty, effect: 'UI fixture: this card provides Darkness Energy.' }, null, 'energy-text', { energyType: 'Special' }],
      ['me01-006', 'Carta parziale di prova', 'Pokemon', { ...pokemon, attacks: [{ name: 'Costo ignoto', cost: null, damage: '0', effect: null }] }, null, 'unverified', {}],
      ['me01-007', 'Promo di prova', 'Trainer', null, null, null, { isPromo: true,
        promoStatus: { state: 'upcoming', legalDate: '2027-01-01', dateNote: null, checkedAt: now }, error: 'Fixture: scheda non acquisita.' }]
    ]) {
      const setId = id.split('-')[0]
      const print = { id, setId, setName: setId === 'me01' ? 'Set A · fixture' : setId === 'mee' ? 'Mega Energy · fixture' : 'Set B · fixture', localId: id.split('-')[1],
        name, category, rarity: 'Rare · fixture', variants: { holo: true }, identityId: name, identityBasis: basis,
        gameplay, stage: category === 'Pokemon' ? 'Basic' : null,
        imageBase: id === 'mee-001'
          ? 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEE/MEE_001_R_EN_SM.png'
          : ['me01-001', 'me02.5-002', 'me01-003', 'me01-004'].includes(id)
            ? `https://assets.tcgdex.net/en/${setId}/${id.split('-')[1]}` : null, thumbnail: image,
        highImageAvailable: null, sourceUpdated: now, sourceUrl: 'https://api.tcgdex.net/v2/en/cards/' + id,
        detailAt: now, error: null, isPromo: false, regulationMark: 'I', ...extra }
      db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(id, setId, JSON.stringify(print))
    }
    db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(now)
  } finally { db.close() }
}
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
  let page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  const remoteImageRequests = []
  page.on('request', (request) => {
    if (/^https:\/\/(?:assets\.tcgdex\.net|limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com)\//.test(request.url()))
      remoteImageRequests.push(request.url())
  })
  const ready = async () => {
    await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
  }
  await createProjectFromStart(page, 'Catalogo carte · fixture UI')
  const webp = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 245; canvas.height = 337
    const context = canvas.getContext('2d')
    context.fillStyle = '#698e86'; context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/webp').split(',')[1]
  })
  const imageDirectory = join(profile, 'data', 'catalog-images')
  mkdirSync(imageDirectory, { recursive: true })
  writeFileSync(join(imageDirectory, 'me02.5-002.webp'), Buffer.from(webp, 'base64'))
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 245; canvas.height = 337
    const context = canvas.getContext('2d')
    context.fillStyle = '#b8a861'; context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  writeFileSync(join(imageDirectory, 'mee-001.png'), Buffer.from(png, 'base64'))
  seed()
  // The fixture edits SQLite outside CatalogStore; reopen the app so its cached view reads the seeded database.
  await application.close()
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
  page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  page.on('request', (request) => {
    if (/^https:\/\/(?:assets\.tcgdex\.net|limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com)\//.test(request.url()))
      remoteImageRequests.push(request.url())
  })
  await application.evaluate(({ shell }) => { globalThis.cardSourceOpened = []; shell.openExternal = async (url) => { globalThis.cardSourceOpened.push(url) } })
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.getByRole('button', { name: 'Gestisci catalogo' }).click()
  await page.locator('[aria-label="Copertura immagini"] strong').first().waitFor()
  assert.deepEqual(await page.locator('[aria-label="Copertura immagini"] strong').allTextContents(), ['4/8', '1', '3', '1'])
  await page.getByRole('button', { name: 'Chiudi gestione' }).click()
  const detail = page.locator('.catalog-detail')
  const search = page.getByLabel('Cerca carta o stampa')
  await page.setViewportSize({ width: 640, height: 580 })
  await search.fill('Pokémon di prova')
  const previewRow = page.locator('.catalog-list').getByRole('button', { name: /Pokémon di prova/ }).first()
  await previewRow.hover()
  const popup = page.getByTestId('card-preview')
  await popup.waitFor()
  const previewImage = popup.locator('img')
  await previewImage.waitFor()
  assert.equal(await previewImage.getAttribute('src'), 'pokeguru://cards/me02.5-002.webp')
  await page.waitForFunction(() => document.querySelector('[data-testid="card-preview"] img')?.naturalWidth > 0)
  await page.screenshot({ path: join(workspace, 'node_modules', 'card-preview-catalog-640.png') })
  const previewBounds = await popup.boundingBox()
  assert.ok(previewBounds && previewBounds.x >= 0 && previewBounds.y >= 0 &&
    previewBounds.x + previewBounds.width <= 640 && previewBounds.y + previewBounds.height <= 580)
  await previewRow.focus()
  assert.equal(await previewRow.getAttribute('aria-describedby'), 'card-preview')
  await page.keyboard.press('Escape')
  await popup.waitFor({ state: 'hidden' })
  await search.fill('Energia Limitless di prova')
  const pngRow = page.locator('.catalog-list').getByRole('button', { name: /Energia Limitless di prova/ }).first()
  await pngRow.focus()
  await previewImage.waitFor()
  assert.equal(await previewImage.getAttribute('src'), 'pokeguru://cards/mee-001.png')
  await page.waitForFunction(() => document.querySelector('[data-testid="card-preview"] img')?.naturalWidth > 0)
  assert.equal(await pngRow.getAttribute('aria-describedby'), 'card-preview')
  assert.deepEqual(remoteImageRequests, [], 'Hover/focus non deve scaricare nuovamente PNG o WebP')
  await page.keyboard.press('Escape')
  await popup.waitFor({ state: 'hidden' })
  await search.fill('Energia speciale di prova')
  const missingRow = page.locator('.catalog-list').getByRole('button', { name: /Energia speciale di prova/ }).first()
  await missingRow.focus()
  await popup.getByText('La fonte non fornisce un’immagine', { exact: false }).waitFor()
  await search.focus()
  await page.setViewportSize({ width: 1280, height: 720 })
  const select = async (name) => {
    await search.fill(name)
    await page.locator('.catalog-list').getByRole('button', { name: new RegExp(name) }).click()
    await ready()
    await detail.getByRole('heading', { name, exact: true }).waitFor()
  }
  await select('Pokémon di prova')
  await detail.getByText('UI fixture: a readable attack effect.', { exact: true }).waitFor()
  assert.ok(await detail.getByText('UI fixture: a readable ability effect.', { exact: true }).isVisible())
  assert.equal(await detail.locator('.card-battle-stats dd').last().innerText(), '0')
  assert.equal(await detail.locator('.catalog-card-prints').evaluate((el) => el.open), false)
  assert.equal(await detail.locator('.card-overview').count(), 1)
  assert.match(await detail.locator('.card-artwork figcaption').innerText(), /Set B.*002/)
  assert.equal(await detail.locator('.card-artwork img').evaluate((image) => image.naturalWidth), 245,
    'Miniatura locale WebP bloccata da protocollo o CSP')
  await select('Energia Limitless di prova')
  await detail.locator('.catalog-card-prints > summary').click()
  await detail.getByText('Immagine: Limitless').waitFor()
  assert.equal(await detail.locator('.card-artwork img').evaluate((image) => image.naturalWidth), 245,
    'Miniatura locale PNG bloccata da protocollo o CSP')
  await select('Pokémon di prova')
  assert.equal(await detail.getByRole('button', { name: /^(TCGdex|Fonte)(?: ↗)?$/ }).count(), 0)
  assert.equal(await detail.locator('a[href^="https://api.tcgdex.net/"]').count(), 0)
  assert.deepEqual(await application.evaluate(() => globalThis.cardSourceOpened), [])
  const storedCatalog = await page.evaluate(() => window.projectsApi.getCatalog())
  assert.equal(storedCatalog.value.prints.find((print) => print.id === 'me02.5-002').sourceUrl,
    'https://api.tcgdex.net/v2/en/cards/me02.5-002')
  let minimumContrast = Infinity
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await detail.locator('#catalog-card-heading').focus()
    assert.equal(await page.locator('.main-content').evaluate((el) => el.scrollWidth > el.clientWidth + 1), false)
    const geometry = await detail.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return [...el.querySelectorAll('.card-artwork, .card-gameplay')].every((part) => {
        const rect = part.getBoundingClientRect(); return rect.left >= box.left && rect.right <= box.right
      })
    })
    assert.ok(geometry, 'Immagine o testo fuori dal dettaglio')
    minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, 'Carta Catalogo ' + width)).minimumContrast)
    await page.screenshot({ path: join(profile, `catalog-card-${width}.png`) })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await detail.locator('.catalog-card-prints > summary').focus()
  await page.keyboard.press('Enter')
  await detail.getByRole('button', { name: 'Mostra stampa me01 001', exact: true }).focus()
  await page.keyboard.press('Enter')
  await detail.getByText('Immagine non disponibile', { exact: true }).waitFor()
  assert.ok(await detail.getByText('Testo di gioco non disponibile nel catalogo locale.', { exact: true }).isVisible())
  assert.equal(await detail.locator('.card-attack').count(), 0, 'Testo preso da una stampa diversa dalla selezione')
  assert.ok(await detail.locator('#catalog-card-heading').evaluate((el) => el === document.activeElement))
  assert.equal(await detail.getByRole('button', { name: /^(TCGdex|Fonte)(?: ↗)?$/ }).count(), 0)
  assert.deepEqual(await application.evaluate(() => globalThis.cardSourceOpened), [])
  await page.screenshot({ path: join(profile, 'catalog-card-missing-1280.png') })
  await page.getByRole('button', { name: 'Impostazioni AI', exact: true }).click()
  await ready()
  await page.getByRole('button', { name: 'Indietro', exact: true }).click()
  await ready()
  assert.match(await detail.locator('.card-artwork figcaption').innerText(), /Set A.*001/)
  assert.equal(await detail.locator('.catalog-card-prints').evaluate((el) => el.open), true)
  await page.getByLabel('Espansione').selectOption('me02.5')
  assert.match(await detail.locator('.card-artwork figcaption').innerText(), /Set B.*002/)
  assert.equal(await detail.locator('.catalog-print').count(), 1)
  await page.getByLabel('Espansione').selectOption('all')
  await select('Allenatore di prova')
  assert.ok(await detail.getByText('UI fixture: search your deck for a Pokémon.\nThen shuffle your deck.', { exact: true }).isVisible())
  assert.equal(await detail.locator('.card-battle-stats').count(), 0)
  assert.equal(await detail.locator('.card-constraints, .constraint-form').count(), 0,
    'Il Catalogo globale non gestisce vincoli di progetto')
  await select('Energia Base di prova')
  assert.ok(await detail.getByText('Nessun testo effetto riportato dal catalogo.', { exact: true }).isVisible())
  assert.equal(await detail.locator('.card-gameplay-missing').count(), 0)
  await select('Energia speciale di prova')
  assert.ok(await detail.getByText('UI fixture: this card provides Darkness Energy.', { exact: true }).isVisible())
  await select('Carta parziale di prova')
  assert.ok(await detail.getByText('Scheda parziale', { exact: true }).isVisible())
  assert.ok(await detail.getByText('Costo: Non indicato', { exact: true }).isVisible())
  assert.ok(await detail.getByText('Equivalenza delle stampe da verificare.', { exact: true }).isVisible())
  await select('Promo di prova')
  assert.ok(await detail.locator('.catalog-card-notice').filter({ hasText: 'Promo non elencata · ammissione da verificare' }).isVisible())
  assert.ok(await detail.getByText('Fixture: scheda non acquisita.', { exact: true }).first().isVisible())
  assert.equal(await detail.locator('.catalog-card-prints').evaluate((el) => el.open), false)
  console.log('CATALOG CARD OK: single-print gameplay, variants/filter/provenance without JSON links or project constraints, missing/broken image, partial/promo, trainer/energy, keyboard/history; 1440/1280/640; minimum contrast ' + minimumContrast.toFixed(2))
} finally {
  await application?.close()
  rmSync(profile, { recursive: true, force: true })
}
