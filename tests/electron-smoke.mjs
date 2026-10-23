import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-e2e-'))
const offline = process.argv.includes('--offline') || process.env.POKEGURU_OFFLINE_E2E === '1'
let application

async function launch(dataDirectory) {
  return electron.launch({
    executablePath: electronPath,
    args: ['.'],
    cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: dataDirectory },
    timeout: 30000
  })
}

async function expectSelected(page, name) {
  await page.getByTestId('selected-project-name').filter({ hasText: name }).waitFor()
  assert.equal(await page.getByTestId('selected-project-name').textContent(), name)
}

try {
  const dataDirectory = join(temporary, 'profile')
  application = await launch(dataDirectory)
  let page = await application.firstWindow()
  await page.getByLabel('Nome progetto').fill('Mega Absol / Mega Audino')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expectSelected(page, 'Mega Absol / Mega Audino')
  await page.getByLabel('Nome progetto').fill('Secondo mazzo')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  await expectSelected(page, 'Secondo mazzo')
  assert.equal(await page.locator('.project-button').count(), 2)
  await page.getByRole('button', { name: /Mega Absol \/ Mega Audino/ }).click()
  await expectSelected(page, 'Mega Absol / Mega Audino')
  assert.match(await page.locator('.detail-meta').textContent(), /Occidentale \/ internazionale/)
  assert.match(await page.locator('.project-detail').textContent(), /Nessuna lista di carte/)
  await page.getByLabel('Testo lista').fill('Pokémon: 2\n2 Mega Absol ex MEG 86\nTotal Cards: 60\nnota libera')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '2 carte' }).waitFor()
  assert.match(await page.getByTestId('baseline-panel').textContent(), /Riga non interpretata/)
  assert.match(await page.getByTestId('baseline-panel').textContent(), /Totale dichiarato 60/)
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  assert.ok(await page.getByRole('button', { name: 'Aggiorna nuove carte' }).isVisible())
  if (!offline) {
  await page.getByRole('button', { name: 'Sincronizza campione' }).click()
  await page.getByText('5/5', { exact: true }).first().waitFor({ timeout: 120000 })
  await page.getByLabel('Ricerca carta, set, stampa o rarità').fill('Iono')
  assert.match(await page.locator('.catalog-detail').textContent(), /Paldea Evolved/)
  assert.match(await page.locator('.catalog-detail').textContent(), /Paldean Fates/)
  assert.match(await page.locator('.catalog-detail').textContent(), /Special illustration rare/)
  assert.ok(await page.locator('.catalog-print img').count() >= 2)
  await page.getByLabel('Ricerca carta, set, stampa o rarità').fill('Mega Absol ex')
  assert.match(await page.locator('.catalog-detail').textContent(), /Mega Evolution/)
  await page.getByLabel('Ricerca carta, set, stampa o rarità').fill('Mega Audino ex')
  assert.match(await page.locator('.catalog-detail').textContent(), /Ascended Heroes/)
  await page.screenshot({ path: join(temporary, 'catalog.png'), fullPage: true })
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.locator('.meta-deck').first().waitFor({ timeout: 30000 })
  assert.ok(await page.locator('.meta-deck').count() > 25, 'La prova attuale deve includere la seconda pagina Limitless')
  assert.equal(await page.getByLabel('Archetipo avversario').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Genera analisi con Codex' }).count(), 1)
  assert.match(await page.locator('.meta-provenance').textContent(), /Limitless/)
  await page.screenshot({ path: join(temporary, 'matchup.png'), fullPage: true })
  }
  await page.getByRole('button', { name: /Secondo mazzo/ }).click()
  await expectSelected(page, 'Secondo mazzo')
  if (!offline) {
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.getByLabel('Ricerca carta, set, stampa o rarità').fill('Rare Candy')
  assert.match(await page.locator('.catalog-detail').textContent(), /Scarlet & Violet/)
  assert.match(await page.locator('.catalog-detail').textContent(), /Paldean Fates/)
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.getByText('Importa una lista nel progetto per generare').waitFor()
  }
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('heading', { name: 'Nessuna lista di carte' }).waitFor()
  await page.locator('#deck-file').setInputFiles({ name: 'secondo.txt', mimeType: 'text/plain', buffer: Buffer.from('60 Carta senza stampa') })
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '60 carte' }).waitFor()
  assert.match(await page.locator('.status-pill').textContent(), /Pronta per controllo/)
  assert.match(await page.getByTestId('baseline-panel').textContent(), /Stampa non identificata/)
  await page.screenshot({ path: join(temporary, 'pokeguru.png') })
  await application.close()
  application = undefined

  application = await launch(dataDirectory)
  page = await application.firstWindow()
  await page.locator('.project-button').first().waitFor()
  assert.equal(await page.locator('.project-button').count(), 2)
  await page.getByRole('button', { name: /Mega Absol \/ Mega Audino/ }).click()
  await expectSelected(page, 'Mega Absol / Mega Audino')
  await page.getByTestId('card-total').filter({ hasText: '2 carte' }).waitFor()
  if (!offline) {
  await page.getByRole('button', { name: 'Catalogo', exact: true }).click()
  await page.getByLabel('Ricerca carta, set, stampa o rarità').fill('sv02-185')
  assert.match(await page.locator('.catalog-detail').textContent(), /Paldea Evolved/)
  assert.ok(await page.locator('.catalog-print img').count() >= 1)
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), 'Pokémon: 2\n2 Mega Absol ex MEG 86\nTotal Cards: 60\nnota libera')
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.locator('.meta-deck').first().waitFor({ timeout: 30000 })
  assert.equal(await page.getByLabel('Archetipo avversario').count(), 0)
  }
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByLabel('Testo lista').fill('3 Mega Absol ex MEG 86')
  await page.getByRole('button', { name: 'Sostituisci lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '3 carte' }).waitFor()
  if (!offline) {
  await page.getByRole('button', { name: 'Matchup' }).click()
  await page.locator('.meta-deck').first().waitFor({ timeout: 30000 })
  assert.equal(await page.getByLabel('Archetipo avversario').count(), 0)
  }
  await page.getByRole('button', { name: /Secondo mazzo/ }).click()
  await expectSelected(page, 'Secondo mazzo')
  if (!offline) await page.locator('.meta-deck').first().waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByTestId('card-total').filter({ hasText: '60 carte' }).waitFor()
  assert.equal(await page.getByLabel('Testo lista').inputValue(), '60 Carta senza stampa')
  await application.close()
  application = undefined

  const blocked = join(temporary, 'blocked-profile')
  writeFileSync(blocked, 'not a directory')
  application = await launch(blocked)
  page = await application.firstWindow()
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').textContent(), /Archivio locale non disponibile/)
  await page.getByLabel('Nome progetto').fill('Non salvare')
  await page.getByRole('button', { name: 'Crea progetto' }).click()
  assert.equal(await page.locator('.project-button').count(), 0)
  await application.close()
  application = undefined

  const legacyProfile = join(temporary, 'legacy-profile')
  const legacyData = join(legacyProfile, 'data')
  mkdirSync(legacyData, { recursive: true })
  const legacyDatabase = new DatabaseSync(join(legacyData, 'pokeguru.sqlite'))
  legacyDatabase.exec('CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT')
  legacyDatabase.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)')
    .run('legacy-project', 'Progetto I1', 'STANDARD', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
  legacyDatabase.close()
  application = await launch(legacyProfile)
  page = await application.firstWindow()
  await expectSelected(page, 'Progetto I1')
  assert.match(await page.locator('.migration-note').textContent(), /Profilo occidentale assegnato/)
  await application.close()
  application = undefined

  console.log(`E2E OK: progetti, import, circuito, ${offline ? 'percorso offline' : 'metagame Limitless'}, riapertura, isolamento, migrazione ed errore di persistenza.`)
  console.log(`Screenshot: ${join(temporary, 'pokeguru.png')}`)
} finally {
  if (application) await application.close()
  if (process.env.KEEP_POKEGURU_E2E !== '1') {
    if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-e2e-')) {
      throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
    }
    rmSync(temporary, { recursive: true, force: true })
  }
}
