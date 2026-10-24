import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const directory = mkdtempSync(join(tmpdir(), 'pokeguru-matchup-event-live-'))
let application
try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'],
    cwd: resolve(import.meta.dirname, '..'), env: { ...process.env, POKEGURU_DATA_DIR: directory } })
  const page = await application.firstWindow()
  await createProjectFromStart(page, 'Prova fonti Matchup')
  await page.getByLabel('Testo lista').fill('Pokémon: 4\n4 Mega Absol ex MEG 86\nTrainer: 8\n4 Rare Candy\n4 Iono')
  await page.getByRole('button', { name: 'Salva lista' }).click()
  await page.getByTestId('card-total').filter({ hasText: '12 carte' }).waitFor()
  await page.getByRole('button', { name: 'Eventi' }).click()
  const tournament = await page.evaluate(() => window.projectsApi.refreshTournament())
  assert.equal(tournament.ok, true, tournament.ok ? '' : tournament.error)
  await page.locator('.sidebar button').filter({ hasText: 'Prova fonti Matchup' }).click()
  await page.getByRole('button', { name: 'Matchup', exact: true }).click()
  const meta = await page.evaluate(() => window.projectsApi.getMeta())
  assert.equal(meta.ok, true, meta.ok ? '' : meta.error)
  const slug = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const match = meta.value.decks.find((deck) => tournament.value.participations.some((entry) =>
    entry.deck && slug(entry.deck.id) === slug(deck.name) && entry.cardTotal === 60))
  assert.ok(match, 'Nessun archetipo con ID coerente e lista completa nel torneo corrente')
  await page.locator('.meta-deck-list .meta-deck').filter({ hasText: match.name }).first().click()
  assert.match(await page.locator('.ai-data-preview').textContent(), /liste complete dell’archetipo/)
  await page.getByRole('button', { name: 'Genera analisi con Codex' }).click()
  await Promise.race([
    page.getByRole('region', { name: 'Evidenze torneo del matchup' }).waitFor({ timeout: 200000 }),
    page.getByRole('alert').waitFor({ timeout: 200000 }).then(async () => {
      throw new Error(`Analisi non generata: ${await page.getByRole('alert').textContent()}`)
    })
  ])
  const evidenceText = await page.getByRole('region', { name: 'Evidenze torneo del matchup' }).textContent()
  assert.match(evidenceText, /liste complete dell’archetipo/)
  assert.match(evidenceText, /Carte osservate/)
  await application.close()
  application = undefined
  const database = new DatabaseSync(join(directory, 'data', 'pokeguru.sqlite'))
  const row = database.prepare('SELECT payload FROM matchup_reports LIMIT 1').get()
  const report = JSON.parse(row.payload)
  assert.equal(report.tournamentEvidence.status, 'matched')
  assert.equal(report.tournamentEvidence.matchedDeckId, match.id)
  assert.ok(report.tournamentEvidence.matchedCompleteLists > 0)
  assert.ok(report.tournamentEvidence.sampleLists.every((list) => list.url.startsWith(tournament.value.publicUrl)))
  assert.ok(report.strengths && report.weaknesses && report.strategy && report.limitations,
    'La guida non contiene tutti i campi tattici principali')
  if (process.env.POKEGURU_SHOW_MATCHUP_ANALYSIS === '1') {
    console.log(JSON.stringify({ strengths: report.strengths, weaknesses: report.weaknesses,
      ourKeyCards: report.ourKeyCards, theirKeyCards: report.theirKeyCards,
      strategy: report.strategy, limitations: report.limitations }, null, 2))
  }
  database.close()
  console.log(`LIVE OK: ${match.name}; ${report.tournamentEvidence.matchedCompleteLists} liste collegate; guida Codex ed evidenza persistite.`)
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(directory)) !== realpathSync(tmpdir()) || !basename(directory).startsWith('pokeguru-matchup-event-live-')) {
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  }
  rmSync(directory, { recursive: true, force: true })
}
