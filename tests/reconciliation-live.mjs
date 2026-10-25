import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, openDeckImport } from './project-ui-helper.mjs'
import { auditDesignSystem } from './design-system-audit.mjs'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-deck-list-live-'))
let application
// Synthetic gameplay only for rendering and missing-data checks; no competitive assertions.
const emptyGameplay = { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [], effect: null,
  trainerType: null, weaknesses: [], resistances: [], retreat: null }
const pokemonGameplay = { ...emptyGameplay, hp: 280, types: ['Darkness'], retreat: 0,
  abilities: [{ name: 'Fixture ability', effect: 'UI fixture: readable ability effect.', type: 'Ability' }],
  attacks: [
    { name: 'Fixture free attack', cost: [], damage: '0', effect: 'UI fixture: no energy required.' },
    { name: 'Fixture unknown cost', cost: null, damage: '120+', effect: null }
  ], weaknesses: [{ type: 'Grass', value: '×2' }] }
function seedCatalog() {
  const db = new DatabaseSync(join(temporary, 'profile', 'data', 'pokeguru.sqlite'))
  const now = '2026-10-23T00:00:00.000Z'
  for (const [id, name] of [['sv02', 'Paldea Evolved'], ['sv04.5', 'Paldean Fates'],
    ['me01', 'Mega Evolution'], ['me02.5', 'Ascended Heroes'], ['mep', 'MEP Promos']]) {
    db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, ?, ?, ?)').run(id, name, 300, 2, now)
  }
  for (const [id, setId, setName, localId, name, rarity, identityId, mark] of [
    ['sv02-185', 'sv02', 'Paldea Evolved', '185', 'Iono', 'Uncommon', 'trainer-iono', 'G'],
    ['sv02-254', 'sv02', 'Paldea Evolved', '254', 'Iono', 'Ultra Rare', 'trainer-iono', 'G'],
    ['sv04.5-080', 'sv04.5', 'Paldean Fates', '080', 'Iono', 'Uncommon', 'trainer-iono-other', 'G'],
    ['sv04.5-089', 'sv04.5', 'Paldean Fates', '089', 'Rare Candy', 'Common', 'trainer-candy', 'G'],
    ['me01-125', 'me01', 'Mega Evolution', '125', 'Rare Candy', 'Common', 'trainer-candy', 'I'],
    ['me01-086', 'me01', 'Mega Evolution', '086', 'Mega Absol ex', 'Double rare', 'mega-absol', 'I'],
    ['me02.5-172', 'me02.5', 'Ascended Heroes', '172', 'Mega Audino ex', 'Double rare', 'mega-audino', 'J'],
    ['mep-051', 'mep', 'MEP Promos', '051', 'Promo 051', 'Promo', 'promo-051', 'J'],
    ['me01-999', 'me01', 'Mega Evolution', '999', 'Fixture Energy', 'Common', 'fixture-energy', 'I']
  ]) {
    const print = { id, setId, setName, localId, name, category: name.startsWith('Mega ') ? 'Pokemon' : name === 'Fixture Energy' ? 'Energy' : 'Trainer', rarity, regulationMark: mark,
      variants: { normal: true, reverse: true }, identityId,
      identityBasis: name.startsWith('Mega ') ? 'unverified' : 'trainer-text',
      stage: name.startsWith('Mega ') ? 'Basic' : null,
      energyType: name === 'Fixture Energy' ? 'Basic' : null,
      gameplay: id === 'me01-086' ? pokemonGameplay
        : name === 'Iono' ? { ...emptyGameplay, trainerType: 'Supporter', effect: 'UI fixture: each player shuffles their hand.' }
          : name === 'Fixture Energy' ? emptyGameplay : null,
      imageBase: null, thumbnail: id === 'sv02-185'
        ? 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" rx="6" fill="#c6ded6"/><rect x="8" y="12" width="56" height="42" fill="#698e86"/><path d="M10 66h52M10 76h42M10 86h30" stroke="#304b47" stroke-width="4"/></svg>').toString('base64')
        : id === 'sv04.5-089' ? 'data:image/png;base64,invalid' : null,
      highImageAvailable: null, sourceUpdated: null,
      sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: now, error: null,
      isPromo: id === 'mep-051', promoStatus: id === 'mep-051'
        ? { state: 'available', legalDate: null, dateNote: null, checkedAt: now } : null }
    db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(id, setId, JSON.stringify(print))
  }
  db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(now)
  db.close()
}
const rawText = [
  'Trainers: 7', '2 Iono PAL 185', '1 Iono PAL 254',
  '1 Rare Candy PAF 089', "1 Boss's Orders SWSHALT 127",
  '1 Promo 051 MEP 051', '1 Basic Psychic Energy SVE 5', 'Total Cards: 7'
].join('\n')

async function launch() {
  return electron.launch({ executablePath: electronPath, args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: join(temporary, 'profile') }, timeout: 30000 })
}

async function iono(page) {
  return page.locator('.deck-card').filter({ has: page.locator('.deck-card-title strong', { hasText: /^Iono$/ }) })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Lista integrata test')
  await application.close()
  seedCatalog()
  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('heading', { name: 'Lista integrata test', exact: true }).waitFor()
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill(rawText)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  const card = await iono(page)
  await card.first().waitFor()
  assert.match(await page.locator('.deck-composition').innerText(), /Pokémon\s*0\s*Allenatori\s*7\s*Energie\s*0/)
  await card.locator('.card-thumbnail img').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => {
    const image = document.querySelector('.deck-card .card-thumbnail img')
    return image?.complete && image.naturalWidth === 72
  })
  const brokenThumbnail = page.locator('.deck-card').filter({ has: page.locator('.deck-card-title strong', { hasText: /^Rare Candy$/ }) }).locator('.card-thumbnail')
  await brokenThumbnail.scrollIntoViewIfNeeded()
  await brokenThumbnail.locator('svg').waitFor()
  await page.locator('.deck-technical > summary').click()
  const construction = page.getByRole('region', { name: 'Controlli di costruzione del mazzo' })
  assert.match(await construction.textContent(), /7 copie: ne servono esattamente 60/)
  assert.match(await construction.textContent(), /Pokémon Base.*Non è possibile stabilire/s)
  assert.match(await construction.textContent(), /ACE SPEC.*stampe o rarità non sono verificabili/s)
  const standardDeck = page.getByRole('region', { name: 'Esito Standard occidentale' })
  assert.match(await standardDeck.textContent(), /1 problema certo/)
  assert.match(await standardDeck.textContent(), /7 copie: ne servono esattamente 60/)
  assert.ok(await standardDeck.locator('.standard-problems').isVisible(), 'Il problema certo è nascosto')
  const rotation = page.getByRole('region', { name: 'Controllo della rotazione Standard occidentale' })
  await rotation.getByLabel('Data di riferimento').fill('2026-04-09')
  assert.match(await rotation.textContent(), /Marchio ammesso: 5 copie/)
  await rotation.getByLabel('Data di riferimento').fill('2026-04-10')
  assert.match(await rotation.textContent(), /Marchio ammesso: 2 copie · marchio ruotato: 3/)
  assert.match(await standardDeck.textContent(), /rotazione: Marchio G ruotato.*Righe 2.*rotazione: Marchio G ruotato.*Righe 3/s)
  assert.match(await rotation.textContent(), /Fonte controllata il/)
  const admission = page.getByRole('region', { name: 'Ammissione dei set Standard occidentali' })
  assert.match(await admission.textContent(), /Pacchetto 2026-10-25\.\d+/)
  assert.match(await admission.textContent(), /data da chiarire:/)
  const promoAdmission = page.getByRole('region', { name: 'Ammissione delle promo Standard occidentali' })
  assert.match(await promoAdmission.textContent(), /da chiarire: 1/)
  await rotation.getByRole('button', { name: 'Torna a oggi' }).click()
  assert.match(await promoAdmission.textContent(), /Disponibili nel registro alla data osservata: 1 copie/)
  assert.equal(await card.count(), 1)
  assert.match(await card.locator('.deck-card-toggle').textContent(), /3×\s*Iono/)
  await card.locator('.deck-card-toggle').click()
  assert.ok(await card.getByText('UI fixture: each player shuffles their hand.').isVisible())
  assert.ok(await card.locator('.card-artwork img').isVisible())
  assert.match(await card.locator('.card-gameplay-source').innerText(), /Testo in inglese.*Paldea Evolved 185/)
  assert.equal(await card.locator('.deck-import-details').getAttribute('open'), null)
  assert.equal(await card.locator('.deck-print-details').getAttribute('open'), null)
  await card.locator('.deck-import-details > summary').focus()
  await page.keyboard.press('Enter')
  assert.ok(await card.locator('.deck-source-lines').isVisible())
  assert.match(await card.locator('.deck-source-lines').textContent(), /2 Iono PAL 185/)
  assert.match(await card.locator('.deck-source-lines').textContent(), /1 Iono PAL 254/)
  assert.equal(await card.getByText('Indicata nel testo importato').count(), 2)
  await card.locator('.deck-print-details > summary').focus()
  await page.keyboard.press('Space')
  assert.ok(await card.locator('.catalog-print-grid').isVisible())
  assert.match(await card.locator('.catalog-print-grid').textContent(), /Uncommon/)
  assert.match(await card.locator('.catalog-print-grid').textContent(), /Ultra Rare/)
  const candyCard = page.locator('.deck-card').filter({ has: page.locator('.deck-card-title strong', { hasText: /^Rare Candy$/ }) })
  await candyCard.locator('.deck-card-toggle').click()
  await candyCard.getByText('Immagine non disponibile').waitFor()
  assert.ok(await candyCard.getByText('Testo di gioco non disponibile nel catalogo locale.').isVisible())
  assert.match(await candyCard.locator('.deck-source-lines').textContent(), /Riga 4: 1 Rare Candy PAF 089/)
  await card.locator('.deck-card-toggle').click()
  await card.getByRole('button', { name: 'Aggiungi vincolo su questa carta' }).click()
  const form = card.locator('.constraint-form')
  assert.equal(await form.getByLabel('Carta di gioco').count(), 0, 'La carta è già selezionata nel contesto')
  await page.waitForFunction(() => document.activeElement?.closest('.card-constraints') !== null)
  await page.keyboard.press('Escape')
  await form.waitFor({ state: 'detached' })
  assert.equal(await page.locator('.constraint-item').count(), 0)
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Aggiungi vincolo su questa carta')
  await page.keyboard.press('Enter')
  await form.getByLabel('Tipo di vincolo').selectOption('minimum')
  await form.getByLabel('Numero di copie').fill('3')
  assert.match(await form.locator('.constraint-preview').innerText(), /Soddisfatto.*3 copie/s)
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await form.evaluate((el) => {
      const main = el.closest('.main-content')
      main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 20
    })
    await auditDesignSystem(page, 'Vincolo contestuale ' + width)
    const geometry = await form.evaluate((el) => {
      const main = el.closest('.main-content')
      const rect = el.getBoundingClientRect()
      return { overflow: main.scrollWidth > main.clientWidth + 1, rootScroll: document.documentElement.scrollTop,
        inCard: !!el.closest('.deck-card-detail'), within: rect.left >= 0 && rect.right <= innerWidth,
        controls: [...el.querySelectorAll('input, select, button')].every((control) => {
          const r = control.getBoundingClientRect(); return r.left >= rect.left && r.right <= rect.right
        }) }
    })
    assert.deepEqual(geometry, { overflow: false, rootScroll: 0, inCard: true, within: true, controls: true })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  // Inject a real storage failure only in the disposable test database.
  const failingDb = new DatabaseSync(join(temporary, 'profile', 'data', 'pokeguru.sqlite'))
  failingDb.exec("CREATE TRIGGER fixture_constraint_failure BEFORE INSERT ON deck_constraints BEGIN SELECT RAISE(ABORT, 'Errore salvataggio di prova'); END")
  failingDb.close()
  await form.getByRole('button', { name: 'Aggiungi vincolo' }).click()
  await form.getByRole('alert').getByText('Errore salvataggio di prova').waitFor()
  assert.equal(await form.getByLabel('Numero di copie').inputValue(), '3')
  assert.equal(await page.locator('.constraint-item').count(), 0)
  const recoveredDb = new DatabaseSync(join(temporary, 'profile', 'data', 'pokeguru.sqlite'))
  recoveredDb.exec('DROP TRIGGER fixture_constraint_failure')
  recoveredDb.close()
  await form.getByRole('button', { name: 'Aggiungi vincolo' }).click()
  await card.locator('.card-constraint-summary').getByText('Soddisfatto').waitFor()
  await page.locator('.constraint-item').first().getByText('Soddisfatto').waitFor()
  await form.waitFor({ state: 'detached' })
  await card.getByRole('button', { name: 'Aggiungi vincolo su questa carta' }).click()
  await form.getByLabel('Stampa specifica (facoltativa)').selectOption('sv02-185')
  await form.getByLabel('Tipo di vincolo').selectOption('exact')
  await form.getByLabel('Numero di copie').fill('2')
  await form.getByRole('button', { name: 'Aggiungi vincolo' }).click()
  await page.locator('.constraint-item').nth(1).getByText('Soddisfatto').waitFor()
  assert.equal(await page.locator('.constraint-item').count(), 2)
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.locator('.catalog-list button').filter({ hasText: 'Rare Candy' }).click()
  await page.locator('.catalog-detail').getByRole('button', { name: 'Aggiungi vincolo su questa carta' }).click()
  await page.waitForFunction(() => document.querySelector('#constraint-form select')?.value === 'trainer-candy')
  await page.locator('#constraint-form').getByRole('button', { name: 'Aggiungi vincolo' }).click()
  await page.locator('.constraint-item').nth(2).getByText('Soddisfatto').waitFor()
  assert.equal(await page.locator('.constraint-item').count(), 3)
  await page.locator('#deck-constraints').getByRole('button', { name: 'Aggiungi vincolo', exact: true }).click()
  await page.locator('#constraint-form').getByLabel('Carta di gioco').selectOption('trainer-iono')
  await page.locator('#constraint-form').getByLabel('Tipo di vincolo').selectOption('exact')
  await page.locator('#constraint-form').getByLabel('Numero di copie').fill('2')
  assert.ok(await page.locator('#constraint-form .constraint-conflict').getByText('Vincoli incompatibili').isVisible())
  await page.locator('#constraint-form').getByRole('button', { name: 'Aggiungi vincolo' }).click()
  await page.locator('#constraint-form').waitFor({ state: 'detached' })
  await page.locator('.constraint-item').nth(3).waitFor()
  await page.locator('.constraint-conflict').getByText('Vincoli incompatibili').waitFor()
  await page.locator('.constraint-item').last().getByRole('button', { name: 'Elimina' }).click()
  await page.locator('.constraint-conflict').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.constraint-item').count(), 3)
  assert.equal(await page.getByRole('heading', { name: 'Carte della lista' }).count(), 0)
  const alt = page.locator('.deck-card').filter({ hasText: "Boss's Orders" })
  await alt.locator('.deck-card-toggle').click()
  assert.match(await alt.locator('.deck-source-lines').textContent(), /SWSHALT 127/)
  assert.equal(await page.locator('.original-text pre').textContent(), rawText)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('heading', { name: 'Lista integrata test' }).waitFor()
  const reopened = await iono(page)
  await reopened.first().waitFor()
  assert.equal(await reopened.count(), 1)
  assert.match(await reopened.locator('.deck-card-toggle').textContent(), /3×\s*Iono/)
  await page.locator('.constraint-item').nth(2).waitFor()
  assert.equal(await page.locator('.constraint-item').count(), 3)
  await page.locator('.constraint-item').first().getByRole('button', { name: 'Modifica' }).click()
  assert.equal(await page.locator('.constraint-item').first().locator('#constraint-form').count(), 1, 'Modifica accanto al vincolo')
  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.constraint-item').first().evaluate((el) => {
      const main = el.closest('.main-content')
      main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 20
    })
    await auditDesignSystem(page, 'Modifica vincolo ' + width)
    assert.ok(await page.locator('#constraint-form').evaluate((el) => {
      const main = el.closest('.main-content')
      const rect = el.getBoundingClientRect()
      return main.scrollWidth <= main.clientWidth + 1 && rect.left >= 0 && rect.right <= innerWidth && document.documentElement.scrollTop === 0
    }))
    await page.screenshot({ path: join(workspace, 'node_modules', 'constraint-edit-fixture-' + width + '.png') })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.locator('#constraint-form').getByLabel('Numero di copie').fill('9')
  await page.locator('#constraint-form').getByRole('button', { name: 'Annulla' }).click()
  assert.match(await page.locator('.constraint-item').first().innerText(), /Almeno 3/)
  await page.locator('.constraint-item').first().getByRole('button', { name: 'Modifica' }).click()
  await page.locator('#constraint-form').getByLabel('Numero di copie').fill('4')
  await page.locator('#constraint-form').getByRole('button', { name: 'Salva modifica' }).click()
  await page.locator('.constraint-item').first().getByText('Non soddisfatto').waitFor()
  await page.locator('#project-switcher-trigger').click()
  await page.getByRole('button', { name: 'Nuovo progetto', exact: true }).click()
  await page.getByLabel('Nome progetto').fill('Altro progetto')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByText('Nessun vincolo impostato.').waitFor()
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('1 Iono PAL 185')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  const second = await iono(page)
  await second.first().waitFor()
  assert.match(await second.locator('.deck-card-toggle').textContent(), /1×\s*Iono/)
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('1 Iono ALT 12A')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  await page.getByText('Identità da chiarire').waitFor()
  const ambiguous = page.locator('.deck-card').first()
  await ambiguous.locator('.deck-card-toggle').click()
  assert.match(await ambiguous.textContent(), /Identità da chiarire/)
  assert.ok(await ambiguous.getByText('Conferma l’identità per consultare il testo di gioco.').isVisible())
  assert.equal(await ambiguous.locator('.card-gameplay section').count(), 0)
  await ambiguous.locator('.deck-identity-options summary').click()
  await ambiguous.getByRole('button', { name: 'Conferma identità' }).first().click()
  await page.locator('.deck-card').first().locator('.deck-card-toggle').getByText('Iono', { exact: true }).waitFor()
  await page.locator('.deck-card').first().locator('.deck-card-toggle').click()
  assert.doesNotMatch(await page.locator('.deck-card').first().textContent(), /Identità da chiarire/)
  await page.locator('.deck-card').first().getByRole('button', { name: 'Aggiungi vincolo su questa carta' }).click()
  await page.locator('.card-constraints form').getByRole('button', { name: 'Aggiungi vincolo', exact: true }).click()
  await page.locator('.constraint-item').getByText('Soddisfatto').waitFor()
  await page.locator('.deck-identity-options summary').click()
  await page.getByRole('button', { name: 'Rimuovi correzione' }).click()
  await page.getByText('Identità da chiarire').waitFor()
  await page.locator('.constraint-item').getByText('Indeterminato').waitFor()
  assert.match(await page.locator('.deck-card').first().textContent(), /Identità da chiarire/)
  assert.equal(await page.locator('.original-text pre').textContent(), '1 Iono ALT 12A')
  await openDeckImport(page)
  await page.getByLabel('Testo lista').fill('1 Mega Absol ex MEG 086\n1 Fixture Energy MEG 999')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  const pokemon = page.locator('.deck-card').filter({ has: page.locator('.deck-card-title strong', { hasText: /^Mega Absol ex$/ }) })
  await pokemon.locator('.deck-card-toggle').click()
  assert.ok(await pokemon.getByText('280 PS').isVisible())
  assert.ok(await pokemon.getByText('Scheda parziale').isVisible())
  assert.ok(await pokemon.getByText('UI fixture: readable ability effect.').isVisible())
  assert.match(await pokemon.getByRole('region', { name: 'Attacco: Fixture free attack' }).innerText(), /Costo: Nessuno/)
  assert.match(await pokemon.getByRole('region', { name: 'Attacco: Fixture unknown cost' }).innerText(), /Costo: Non indicato/)
  assert.equal(await pokemon.locator('.card-battle-stats div').filter({ hasText: 'Ritirata' }).locator('dd').innerText(), '0')
  const energy = page.locator('.deck-card').filter({ has: page.locator('.deck-card-title strong', { hasText: /^Fixture Energy$/ }) })
  await energy.locator('.deck-card-toggle').click()
  assert.ok(await energy.getByText('Nessun testo effetto riportato dal catalogo.').isVisible())
  assert.equal(await energy.getByText('Scheda parziale').count(), 0)
  await application.close()
  application = undefined
  console.log('E2E APP-006/007/064/065 OK: dettaglio carta, vincoli contestuali, errore di storage, conflitti, tastiera/responsive, riconciliazione, riapertura e isolamento.')
} finally {
  if (application) await application.close()
  if (process.env.KEEP_POKEGURU_E2E !== '1') {
    if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-deck-list-live-')) {
      throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
    }
    rmSync(temporary, { recursive: true, force: true })
  }
}
