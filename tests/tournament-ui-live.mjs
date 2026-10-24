import { auditDesignSystem } from './design-system-audit.mjs'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { eventWorkspaceScenarios } from './event-workspace-scenarios.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-event-ui-'))
const profile = join(temporary, 'profile')
const offline = process.argv.includes('--offline')
const keepProfile = process.argv.includes('--keep-profile')
let application
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })

try {
  if (offline) {
    application = await launch()
    const emptyPage = await application.firstWindow()
    await emptyPage.getByRole('button', { name: 'Eventi', exact: true }).click()
    await emptyPage.getByText('Nessun evento salvato.', { exact: false }).waitFor()
    await emptyPage.getByRole('button', { name: 'Regional', exact: true }).click()
    await emptyPage.getByText('Nessun Regional archiviato.', { exact: false }).waitFor()
    await application.close()
    application = undefined
    const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
    // Existing example list: layout fixture, not a verified competitive deck.
    let category = 'pokemon'
    const cards = []
    for (const line of readFileSync(join(workspace, 'examples/workspace-principale.txt'), 'utf8').split(/\r?\n/)) {
      if (line.startsWith('Trainer:')) category = 'trainer'
      if (line.startsWith('Energy:')) category = 'energy'
      const match = line.match(/^(\d+) (.+?)(?: ([A-Z]{2,4}) (\d+))?$/)
      if (match) cards.push({ category, count: Number(match[1]), name: match[2], set: match[3] ?? '', number: match[4] ?? '' })
    }
    const player = { playerId: 'one', playerName: 'One', country: 'IT', placing: 1,
      record: { wins: 1, losses: 0, ties: 0 }, deck: { id: 'sample', name: 'Mazzo prova' },
      listStatus: 'available', cardTotal: 60,
      cards }
    const snapshot = { id: 'offline-fixture', eventId: '6ad92350115c12b73a5a9419',
      fetchedAt: '2026-10-23T20:00:00.000Z', source: 'Limitless Play API',
      sourceUrl: 'https://play.limitlesstcg.com/api/tournaments/6ad92350115c12b73a5a9419/standings',
      publicUrl: 'https://play.limitlesstcg.com/tournament/6ad92350115c12b73a5a9419',
      name: 'Evento prova offline', date: '2026-10-22T23:00:00.000Z', circuit: 'WESTERN', format: 'STANDARD',
      platform: 'PTCGL', isOnline: true, reportedPlayers: 8, phases: [], participations: [player, { ...player, playerId: 'two', playerName: 'Two', placing: 2 },
        { ...player, playerId: 'missing', playerName: 'Marta · fixture', placing: 3, listStatus: 'missing', cards: [], cardTotal: null },
        { ...player, playerId: 'invalid', playerName: 'Luca · fixture', placing: 4, listStatus: 'invalid', cards: [], cardTotal: null },
        { ...player, playerId: 'partial', playerName: 'Sara · fixture', placing: 5, cards: cards.slice(0, 2), cardTotal: 5 }],
      coverage: { returnedParticipants: 5, availableLists: 3, invalidLists: 1, missingLists: 1, complete60Lists: 2 },
      cached: false }
    db.prepare('INSERT INTO tournament_snapshots (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)')
      .run(snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
    const secondPlay = { ...snapshot, id: 'second-play-fixture', eventId: '6ad92350115c12b73a5a9418', name: 'Secondo evento offline', date: '2026-10-20T00:00:00.000Z' }
    db.prepare('INSERT INTO tournament_snapshots VALUES (?, ?, ?, ?)').run(secondPlay.id, secondPlay.eventId, secondPlay.fetchedAt, JSON.stringify(secondPlay))
    const regional = { id: 'regional-ui-fixture', eventId: '999999', name: 'Regional · esempio UI',
      date: '2026-10-17', country: 'FR', players: 128, url: 'https://limitlesstcg.com/tournaments/582',
      fetchedAt: '2026-10-23T20:00:00.000Z', source: 'Limitless tournament database', circuit: 'WESTERN',
      format: 'STANDARD', type: 'IN_PERSON', cached: false,
      participants: [{ placing: 1, playerName: 'Giocatore esempio', country: 'IT', playerId: null,
        deckId: null, deckName: 'Mazzo dimostrativo · Hydrapple filtro', listId: '12345', listUrl: 'https://limitlesstcg.com/decks/list/12345',
        cardTotal: 60, cards }],
      coverage: { returnedParticipants: 4, listedDecks: 4, fetchedLists: 2, complete60Lists: 1, noListLink: 1 } }
    regional.participants.push(
      { ...regional.participants[0], placing: 2, playerName: 'Marta · fixture', listUrl: null, cards: null, cardTotal: null },
      { ...regional.participants[0], placing: 3, playerName: 'Luca · fixture', cards: null, cardTotal: null },
      { ...regional.participants[0], placing: 4, playerName: 'Sara · fixture', cards: cards.slice(0, 2), cardTotal: 5 })
    db.prepare('INSERT INTO main_tournament_snapshots VALUES (?, ?, ?, ?)').run(regional.id, regional.eventId, regional.fetchedAt, JSON.stringify(regional))
    const secondRegional = { ...regional, id: 'second-regional-fixture', eventId: '999998', name: 'Secondo Regional offline', date: '2026-10-15' }
    db.prepare('INSERT INTO main_tournament_snapshots VALUES (?, ?, ?, ?)').run(secondRegional.id, secondRegional.eventId, secondRegional.fetchedAt, JSON.stringify(secondRegional))
    db.close()
  }
  application = await launch()
  let page = await application.firstWindow()
  await page.getByRole('button', { name: 'Eventi' }).click()
  await page.getByRole('heading', { name: 'Eventi', exact: true }).waitFor()
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
    await page.locator('.event-coverage').waitFor()
    for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
      await page.setViewportSize({ width, height })
      assert.equal(await page.locator('.main-content').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false)
      await auditDesignSystem(page, 'Design system '+width)
    await page.screenshot({ path: join(workspace, 'node_modules', `content-eventi-${width}.png`) })
    }
  }
  if (offline) {
    const ready = async () => {
      await page.waitForFunction(() => !document.querySelector('[data-nav-loading="true"]'))
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
    }
    await ready()
    await page.locator('.tournament-players button').filter({ hasText: 'Two' }).click()
    await ready()
    await page.getByLabel('Filtra giocatore o mazzo').fill('Two')
    await page.locator('.sidebar').getByRole('button', { name: 'Catalogo', exact: true }).click()
    await ready()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
    assert.equal(await page.getByLabel('Filtra giocatore o mazzo').inputValue(), 'Two')
    assert.match(await page.locator('.tournament-detail').innerText(), /Two/)
    await page.getByLabel('Evento archiviato').selectOption('6ad92350115c12b73a5a9418')
    await ready()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
    assert.equal(await page.getByLabel('Evento archiviato').inputValue(), '6ad92350115c12b73a5a9419')
    assert.match(await page.locator('.tournament-detail').innerText(), /Two/)
    await page.getByRole('button', { name: 'Regional', exact: true }).click()
    await ready()
    await page.getByRole('heading', { name: 'Eventi', exact: true }).waitFor()
    await page.getByText('Giocatore esempio', { exact: true }).waitFor()
    await page.getByLabel('Evento archiviato').selectOption('999998')
    await ready()
    await page.getByLabel('Filtra giocatore o mazzo').fill('Hydrapple')
    await page.locator('.sidebar').getByRole('button', { name: 'Impostazioni AI', exact: true }).click()
    await ready()
    await page.getByRole('button', { name: 'Indietro', exact: true }).click()
    await ready()
    assert.equal(await page.getByLabel('Evento archiviato').inputValue(), '999998')
    assert.equal(await page.getByLabel('Filtra giocatore o mazzo').inputValue(), 'Hydrapple')
    for (const [width, height] of [[1440, 900], [1280, 720], [640, 580]]) {
      await page.setViewportSize({ width, height })
      await auditDesignSystem(page, 'Regional ' + width)
      assert.equal(await page.locator('.main-content').evaluate(el => el.scrollWidth > el.clientWidth + 1), false)
      await page.screenshot({ path: join(workspace, 'node_modules', 'content-regional-' + width + '.png') })
    }
    await page.getByRole('button', { name: 'Play online', exact: true }).click()
  }
  if (offline) await eventWorkspaceScenarios(page, application, workspace)
  await page.getByText('Copertura e fonti', { exact: true }).click()
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
  await page.locator('.event-coverage').waitFor()
  await page.getByText('Copertura e fonti', { exact: true }).click()
  await page.getByText('Snapshot locale', { exact: false }).waitFor()
  assert.match(await page.getByTestId('tournament-coverage').textContent(), /liste leggibili/)
  console.log(`E2E evento OK: ${snapshot.name}, ${snapshot.coverage.availableLists}/${snapshot.coverage.returnedParticipants} liste; riapertura offline.`)
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-event-ui-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (keepProfile) console.log('EVENT_DEMO_PROFILE=' + profile)
  else if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
