import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-standard-legality-'))
const profile = join(temporary, 'profile')
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
let application

try {
  application = await launch()
  await application.firstWindow()
  await application.close()
  application = undefined

  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const now = '2026-10-24T00:00:00.000Z'
    for (const [id, name] of [['me01', 'Mega Evolution'], ['sve', 'Basic Energy']]) {
      db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, 1, 1, ?)')
        .run(id, name, now)
    }
    for (const [id, setId, localId, name, category, stage, energyType, mark] of [
      ['me01-086', 'me01', '086', 'Mega Absol ex', 'Pokemon', 'Basic', null, 'I'],
      ['sve-005', 'sve', '005', 'Basic Psychic Energy', 'Energy', null, 'Normal', null]
    ]) {
      const print = { id, setId, setName: setId, localId, name, category, stage, energyType,
        rarity: 'Common', regulationMark: mark, variants: null, identityId: id,
        identityBasis: 'unverified', imageBase: null, thumbnail: null, highImageAvailable: null,
        sourceUpdated: null, sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
        detailAt: now, error: null, isPromo: false }
      db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(id, setId, JSON.stringify(print))
      db.prepare('INSERT INTO catalog_targets VALUES (?)').run(id)
    }
    db.prepare("INSERT INTO catalog_scope VALUES (1, 'standard-marks')").run()
    db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(now)
  } finally { db.close() }

  application = await launch()
  let page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Conformità Standard')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await page.getByLabel('Testo lista').fill('1 Mega Absol ex MEG 086\n59 Basic Psychic Energy SVE 005')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  const rotation = page.getByRole('region', { name: 'Controllo della rotazione Standard occidentale' })
  await rotation.getByLabel('Data di riferimento').fill('2026-10-24')
  const standard = page.getByRole('region', { name: 'Esito Standard occidentale' })
  assert.match(await standard.textContent(), /controlli disponibili superati/)
  assert.match(await standard.textContent(), /lista è conforme ai controlli Standard coperti/)
  assert.match(await standard.textContent(), /Nessuna carta vietata nello snapshot/)
  await rotation.getByLabel('Data di riferimento').fill('2027-01-01')
  assert.match(await standard.textContent(), /da verificare/)
  await application.close()
  application = undefined

  application = await launch()
  page = await application.firstWindow()
  assert.match(await page.getByLabel('Testo lista').inputValue(), /59 Basic Psychic Energy SVE 005/)
  await application.close()
  application = undefined
  console.log('Standard Electron OK: lista coperta, Energie Base, data fuori regole e riapertura.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-standard-legality-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(temporary, { recursive: true, force: true })
}
