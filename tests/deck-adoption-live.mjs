import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-deck-adoption-'))
const profile = join(temporary, 'profile')
let application

async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
}

function seedCatalog() {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  const now = '2026-10-23T00:00:00.000Z'
  for (const [id, name, category, stage, mark] of [
    ['me01-086', 'Mega Absol ex', 'Pokemon', 'Basic', 'I'],
    ['me02.5-172', 'Mega Audino ex', 'Pokemon', 'Basic', 'J'],
    ['sv02-185', 'Iono', 'Trainer', null, 'G']
  ]) {
    const setId = id.split('-')[0]
    db.prepare('INSERT OR IGNORE INTO catalog_sets (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, ?, ?, ?)')
      .run(setId, setId, 1, 1, now)
    const print = { id, setId, setName: setId, localId: id.split('-')[1], name, category, stage,
      rarity: 'Common', regulationMark: mark, variants: null, identityId: id, identityBasis: 'unverified',
      imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
      sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: now, error: null }
    db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(id, setId, JSON.stringify(print))
  }
  db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(now)
  db.close()
}

const original = '1 Mega Absol ex MEG 86\n59 Basic Psychic Energy'
const firstCandidate = '1 Mega Absol ex MEG 86\n58 Basic Psychic Energy\n1 Mega Audino ex ME02.5 172'
const adoptedText = '1 Mega Absol ex MEG 86\n58 Basic Psychic Energy\n1 Mega Audino ex ASC 172'
const secondCandidate = '1 Mega Absol ex MEG 86\n57 Basic Psychic Energy\n2 Iono PAL 185'

try {
  application = await launch()
  let page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Adozione test')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  seedCatalog()
  await page.getByLabel('Testo lista').fill(original)
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('.new-thread-details > summary').click()
  await page.getByLabel('Titolo').fill('Piano A')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.locator('.manual-candidate > summary').click()
  await page.getByLabel('Lista completa proposta').fill(firstCandidate)
  await page.getByRole('button', { name: 'Salva candidata nel thread' }).click()
  await page.locator('.new-thread-details > summary').click()
  await page.getByLabel('Titolo').fill('Piano B')
  await page.getByRole('button', { name: 'Crea thread' }).click()
  await page.getByLabel('Lista completa proposta').fill(secondCandidate)
  await page.getByRole('button', { name: 'Salva candidata nel thread' }).click()
  await page.locator('.thread-picker').getByRole('button', { name: /Piano A/ }).click()
  const candidate = page.locator('.thread-candidate.featured')
  assert.match(await candidate.textContent(), /Rispetto alla lista corrente v1: 60 → 60 carte/)
  assert.match(await candidate.textContent(), /0× Mega Audino ex.*\+1.*1× Mega Audino ex/s)
  assert.match(await candidate.textContent(), /ME02\.5 → ASC/)
  assert.match(await candidate.textContent(), /Legalità torneo da verificare/)
  await candidate.getByRole('button', { name: "Adotta l'intera lista candidata" }).click()
  await page.getByRole('dialog', { name: 'Adottare l’intera lista candidata?' }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Adottare l’intera lista candidata?' }).waitFor({ state: 'detached' })
  assert.match(await page.locator('.thread-versions > summary').textContent(), /Versioni principali \(1\)/)
  await candidate.getByRole('button', { name: "Adotta l'intera lista candidata" }).click()
  await page.getByRole('dialog', { name: 'Adottare l’intera lista candidata?' }).waitFor()
  await page.getByRole('button', { name: 'Confermo: adotta l’intera lista' }).click()
  await page.locator('.thread-versions summary').first().click()
  await page.getByText(/v2 · corrente · adottata da un thread/).waitFor()
  await page.locator('.thread-picker').getByRole('button', { name: /Piano B/ }).click()
  assert.match(await page.locator('.thread-detail').textContent(), /Base da confrontare/)
  assert.equal(await page.locator('.thread-candidate.featured').getByRole('button', { name: "Adotta l'intera lista candidata" }).isDisabled(), true)
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), adoptedText)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('heading', { name: 'Adozione test' }).waitFor()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), adoptedText)
  await page.getByRole('button', { name: 'Thread', exact: true }).click()
  await page.locator('.thread-picker').getByRole('button', { name: /Piano B/ }).click()
  assert.match(await page.locator('.thread-detail').textContent(), /Base da confrontare/)
  console.log('E2E APP-047 OK: diff, adozione intera, base superata e riapertura.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-deck-adoption-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(temporary, { recursive: true, force: true })
}
