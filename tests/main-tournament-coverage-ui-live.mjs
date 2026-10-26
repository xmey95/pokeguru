import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'pokeguru-main-coverage-ui-'))
let application
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: directory }, timeout: 30_000 })

try {
  application = await launch()
  await application.firstWindow()
  await application.close()
  application = undefined

  const db = new DatabaseSync(join(directory, 'data', 'pokeguru.sqlite'))
  const snapshot = { id: 'coverage-ui', eventId: '999999', name: 'Regional di prova',
    date: '2026-10-17T00:00:00.000Z', country: 'FR', players: 32,
    url: 'https://limitlesstcg.com/tournaments/999999', fetchedAt: '2026-10-25T00:00:00.000Z',
    source: 'Limitless tournament database', circuit: 'WESTERN', format: 'STANDARD', type: 'IN_PERSON',
    cached: false, participants: [{ placing: 1, playerName: 'Lista temporaneamente assente', playerId: null,
      country: 'FR', deckId: '123', deckName: 'Mazzo esempio', listId: '234',
      listUrl: 'https://limitlesstcg.com/decks/list/234', cards: null, cardTotal: null,
      listUnavailable: true }],
    coverage: { returnedParticipants: 1, listedDecks: 1, fetchedLists: 0, complete60Lists: 0, noListLink: 0 } }
  db.prepare('INSERT INTO main_tournament_snapshots VALUES (?, ?, ?, ?)')
    .run(snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
  const progress = { mode: 'new', status: 'complete', page: 3, maxPages: 9,
    pendingEvents: [], pendingLists: [], inspectedEvents: 1, fetchedLists: 0,
    rotationStart: '2026-04-10', scannedPages: 2, indexedRows: 6, eligibleEvents: 3,
    ineligibleEvents: 1, unavailableIndexRows: 1, outsideRotationEvents: 1,
    alreadyAcquiredEvents: 1, unavailableEvents: [{ eventId: '777777', name: 'Regional non disponibile',
      date: '2026-10-11T00:00:00.000Z', country: 'FR', players: 64,
      url: 'https://limitlesstcg.com/tournaments/777777' }],
    unavailableLists: [{ eventId: '999999', listId: '234' }],
    watermark: null, previousWatermark: '2026-04-10', newestSeen: null,
    stopAfterPage: false, cooldownUntil: null, lastError: null }
  db.prepare("INSERT INTO main_tournament_sync (key, payload) VALUES ('main', ?)")
    .run(JSON.stringify(progress))
  db.close()

  application = await launch()
  const page = await application.firstWindow()
  await page.getByRole('button', { name: 'Eventi', exact: true }).click()
  await page.getByRole('button', { name: 'Regional', exact: true }).click()
  await page.getByRole('heading', { name: 'Lista temporaneamente assente' }).waitFor()
  await page.getByRole('button', { name: 'Gestisci eventi' }).click()
  const text = await page.locator('#events-main-management').innerText()
  assert.match(text, /Rotazione Standard occidentale dal/)
  assert.match(text, /2\/9 pagine lette/)
  assert.match(text, /Tornei eleggibili nel periodo: 3/)
  assert.match(text, /Non eleggibili: 1/)
  assert.match(text, /Righe non leggibili: 1/)
  assert.match(text, /Già archiviati: 1 · Tornei non disponibili: 1/)
  assert.match(text, /Scansione terminata con lacune/)
  assert.match(await page.locator('.tournament-players').innerText(), /Lista non disponibile/)
  console.log('Regional UI: copertura, lacune, archivio e lista non disponibile leggibili in Electron offline.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) || !basename(directory).startsWith('pokeguru-main-coverage-ui-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  rmSync(directory, { recursive: true, force: true })
}
