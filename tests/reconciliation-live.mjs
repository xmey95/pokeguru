import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-deck-list-live-'))
let application
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
    ['mep-051', 'mep', 'MEP Promos', '051', 'Promo 051', 'Promo', 'promo-051', 'J']
  ]) {
    const print = { id, setId, setName, localId, name, category: name.startsWith('Mega ') ? 'Pokemon' : 'Trainer', rarity, regulationMark: mark,
      variants: { normal: true, reverse: true }, identityId,
      identityBasis: name.startsWith('Mega ') ? 'unverified' : 'trainer-text',
      imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
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
  await page.getByLabel('Nome progetto').fill('Lista integrata test')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  seedCatalog()
  await page.getByLabel('Testo lista').fill(rawText)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  const card = await iono(page)
  await card.first().waitFor()
  await page.locator('.deck-technical > summary').click()
  const construction = page.getByRole('region', { name: 'Controlli di costruzione del mazzo' })
  assert.match(await construction.textContent(), /7 copie: ne servono esattamente 60/)
  assert.match(await construction.textContent(), /Pokémon Base.*Non è possibile stabilire/s)
  assert.match(await construction.textContent(), /ACE SPEC.*stampe o rarità non sono verificabili/s)
  const standardDeck = page.getByRole('region', { name: 'Esito Standard occidentale' })
  assert.match(await standardDeck.textContent(), /1 problema certo/)
  assert.match(await standardDeck.textContent(), /7 copie: ne servono esattamente 60/)
  const rotation = page.getByRole('region', { name: 'Controllo della rotazione Standard occidentale' })
  await rotation.getByLabel('Data di riferimento').fill('2026-04-09')
  assert.match(await rotation.textContent(), /Marchio ammesso: 4 copie/)
  await rotation.getByLabel('Data di riferimento').fill('2026-04-10')
  assert.match(await rotation.textContent(), /marchio ruotato: 4/)
  assert.match(await standardDeck.textContent(), /rotazione: Marchio G ruotato.*Righe 2, 3, 4/s)
  assert.match(await rotation.textContent(), /Fonte controllata il/)
  const admission = page.getByRole('region', { name: 'Ammissione dei set Standard occidentali' })
  assert.match(await admission.textContent(), /Pacchetto 2026-10-24\.1/)
  assert.match(await admission.textContent(), /data da chiarire:/)
  const promoAdmission = page.getByRole('region', { name: 'Ammissione delle promo Standard occidentali' })
  assert.match(await promoAdmission.textContent(), /da chiarire: 1/)
  await rotation.getByRole('button', { name: 'Torna a oggi' }).click()
  assert.match(await promoAdmission.textContent(), /Disponibili nel registro alla data osservata: 1 copie/)
  assert.equal(await card.count(), 1)
  assert.match(await card.locator('.deck-card-toggle').textContent(), /3×\s*Iono/)
  await card.locator('.deck-card-toggle').click()
  assert.match(await card.locator('.deck-source-lines').textContent(), /2 Iono PAL 185/)
  assert.match(await card.locator('.deck-source-lines').textContent(), /1 Iono PAL 254/)
  assert.equal(await card.getByText('Indicata nel testo importato').count(), 2)
  assert.match(await card.locator('.catalog-print-grid').textContent(), /Uncommon/)
  assert.match(await card.locator('.catalog-print-grid').textContent(), /Ultra Rare/)
  const candyCard = page.locator('.deck-card').filter({ has: page.locator('.deck-card-title strong', { hasText: /^Rare Candy$/ }) })
  await candyCard.locator('.deck-card-toggle').click()
  assert.match(await candyCard.locator('.deck-source-lines').textContent(), /stampe storiche non sono verificate/)
  await card.locator('.deck-card-toggle').click()
  await card.getByRole('button', { name: 'Aggiungi vincolo su questa carta' }).click()
  const form = page.locator('#constraint-form')
  await page.waitForFunction(() => document.querySelector('#constraint-form select')?.value === 'trainer-iono')
  assert.equal(await form.getByLabel('Carta di gioco').inputValue(), 'trainer-iono')
  await form.getByLabel('Tipo di vincolo').selectOption('minimum')
  await form.getByLabel('Numero di copie').fill('3')
  await form.getByRole('button', { name: 'Aggiungi vincolo' }).click()
  await page.locator('.constraint-item').first().getByText('Soddisfatto').waitFor()
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
  await page.locator('#constraint-form').getByLabel('Carta di gioco').selectOption('trainer-iono')
  await page.locator('#constraint-form').getByLabel('Tipo di vincolo').selectOption('exact')
  await page.locator('#constraint-form').getByLabel('Numero di copie').fill('2')
  await page.locator('#constraint-form').getByRole('button', { name: 'Aggiungi vincolo' }).click()
  await page.locator('.constraint-conflict').getByText('Vincoli incompatibili').waitFor()
  await page.locator('.constraint-item').last().getByRole('button', { name: 'Elimina' }).click()
  await page.locator('.constraint-conflict').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.constraint-item').count(), 3)
  assert.equal(await page.getByRole('heading', { name: 'Carte della lista' }).count(), 0)
  const alt = page.locator('.deck-card').filter({ hasText: "Boss's Orders" })
  await alt.locator('.deck-card-toggle').click()
  assert.match(await alt.locator('.deck-source-lines').textContent(), /SWSHALT 127/)
  assert.equal(await page.getByLabel('Testo lista').inputValue(), rawText)
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
  await page.locator('#constraint-form').getByLabel('Numero di copie').fill('4')
  await page.locator('#constraint-form').getByRole('button', { name: 'Salva modifica' }).click()
  await page.locator('.constraint-item').first().getByText('Non soddisfatto').waitFor()
  await page.locator('.compact-create-trigger').click()
  await page.getByLabel('Nome progetto').fill('Altro progetto')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByText('Nessun vincolo impostato.').waitFor()
  await page.getByLabel('Testo lista').fill('1 Iono PAL 185')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  const second = await iono(page)
  await second.first().waitFor()
  assert.match(await second.locator('.deck-card-toggle').textContent(), /1×\s*Iono/)
  await page.getByLabel('Testo lista').fill('1 Iono ALT 12A')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.getByText('Identità da chiarire').waitFor()
  const ambiguous = page.locator('.deck-card').first()
  await ambiguous.locator('.deck-card-toggle').click()
  assert.match(await ambiguous.textContent(), /Identità da chiarire/)
  await ambiguous.locator('.deck-identity-options summary').click()
  await ambiguous.getByRole('button', { name: 'Conferma identità' }).first().click()
  await page.locator('.deck-card').first().locator('.deck-card-toggle').getByText('Iono', { exact: true }).waitFor()
  await page.locator('.deck-card').first().locator('.deck-card-toggle').click()
  assert.doesNotMatch(await page.locator('.deck-card').first().textContent(), /Identità da chiarire/)
  await page.locator('.deck-identity-options summary').click()
  await page.getByRole('button', { name: 'Rimuovi correzione' }).click()
  await page.getByText('Identità da chiarire').waitFor()
  assert.match(await page.locator('.deck-card').first().textContent(), /Identità da chiarire/)
  assert.equal(await page.getByLabel('Testo lista').inputValue(), '1 Iono ALT 12A')
  await application.close()
  application = undefined
  console.log('E2E APP-006/007 OK: lista integrata, vincoli su carta e stampa, modifica, riapertura e isolamento.')
} finally {
  if (application) await application.close()
  if (process.env.KEEP_POKEGURU_E2E !== '1') {
    if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-deck-list-live-')) {
      throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
    }
    rmSync(temporary, { recursive: true, force: true })
  }
}
