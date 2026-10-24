import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-event-ui-'))
const profile = join(temporary, 'profile')
const offline = process.argv.includes('--offline')
let application
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })

try {
  if (offline) {
    application = await launch()
    await application.firstWindow()
    await application.close()
    application = undefined
    const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
    const player = { playerId: 'one', playerName: 'One', country: 'IT', placing: 1,
      record: { wins: 1, losses: 0, ties: 0 }, deck: { id: 'sample', name: 'Mazzo prova' },
      listStatus: 'available', cardTotal: 60,
      cards: [{ category: 'energy', count: 60, name: 'Grass Energy', set: 'MEE', number: '9' }] }
    const snapshot = { id: 'offline-fixture', eventId: '6ad92350115c12b73a5a9419',
      fetchedAt: '2026-10-23T20:00:00.000Z', source: 'Limitless Play API',
      sourceUrl: 'https://play.limitlesstcg.com/api/tournaments/6ad92350115c12b73a5a9419/standings',
      publicUrl: 'https://play.limitlesstcg.com/tournament/6ad92350115c12b73a5a9419',
      name: 'Evento prova offline', date: '2026-10-22T23:00:00.000Z', circuit: 'WESTERN', format: 'STANDARD',
      platform: 'PTCGL', isOnline: true, reportedPlayers: 1, phases: [], participations: [player],
      coverage: { returnedParticipants: 1, availableLists: 1, invalidLists: 0, missingLists: 0, complete60Lists: 1 },
      cached: false }
    db.prepare('INSERT INTO tournament_snapshots (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)')
      .run(snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
    db.close()
  }
  application = await launch()
  let page = await application.firstWindow()
  await page.getByRole('button', { name: 'Eventi' }).click()
  await page.getByRole('heading', { name: 'Eventi Standard' }).waitFor()
  if (!offline) {
    await page.getByRole('button', { name: 'Aggiorna nuovi tornei' }).click()
    for (let block = 0; block < 5 && (await page.evaluate(async () => {
      const result = await window.projectsApi.listTournaments()
      return result.ok ? result.value.length : 0
    })) < 2; block++) {
      await page.getByRole('button', { name: 'Continua blocco' }).click()
    }
  }
  if (offline) {
    await page.getByText('Snapshot locale').waitFor()
    for (const [width, height] of [[1440, 900], [1280, 720]]) {
      await page.setViewportSize({ width, height })
      assert.equal(await page.locator('.main-content').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false)
      await page.screenshot({ path: join(workspace, 'node_modules', `content-eventi-${width}.png`) })
    }
  }
  await page.getByText('Copertura e metodo', { exact: true }).click()
  await page.getByTestId('tournament-coverage').waitFor({ timeout: 60000 })
  assert.match(await page.getByTestId('tournament-coverage').textContent(), /liste leggibili/)
  assert.ok(await page.locator('.tournament-players button').count() >= 1)
  assert.match(await page.locator('.tournament-detail').textContent(), /Pokémon|Allenatori|Energie/)
  await application.close()
  application = undefined

  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  const rows = db.prepare('SELECT payload FROM tournament_snapshots').all()
  assert.ok(rows.length >= (offline ? 1 : 2))
  const snapshot = JSON.parse(rows[0].payload)
  assert.equal(snapshot.circuit, 'WESTERN')
  assert.equal(snapshot.format, 'STANDARD')
  assert.ok(snapshot.coverage.availableLists > 0)
  db.close()

  application = await launch()
  page = await application.firstWindow()
  await page.getByRole('button', { name: 'Eventi' }).click()
  await page.getByText('Snapshot locale').waitFor()
  await page.getByText('Copertura e metodo', { exact: true }).click()
  assert.match(await page.getByTestId('tournament-coverage').textContent(), /liste leggibili/)
  console.log(`E2E evento OK: ${snapshot.name}, ${snapshot.coverage.availableLists}/${snapshot.coverage.returnedParticipants} liste; riapertura offline.`)
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-event-ui-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
