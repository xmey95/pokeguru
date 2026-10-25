import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { auditDesignSystem } from './design-system-audit.mjs'
import { createProjectFromStart, switchProject } from './project-ui-helper.mjs'
import { navigationScenarios } from './navigation-scenarios.mjs'
import { discussionScenarios } from './matchup-discussion-scenarios.mjs'
import { matchupAiScenarios } from './matchup-ai-scenarios.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const profile = mkdtempSync(join(tmpdir(), 'pokeguru-matchup-switcher-'))
const deck = readFileSync(join(workspace, 'examples/workspace-principale.txt'), 'utf8').trim()
const reading = process.argv.includes('--reading')
const guideLinks = reading || process.argv.includes('--guide-links') || process.argv.includes('--navigation') || process.argv.includes('--discussion') || process.argv.includes('--ai-options')
const hash = (text) => createHash('sha256').update(text).digest('hex')
const names = ['Gardevoir ex', 'Dragapult ex', 'Charizard ex / Pidgeot ex',
  'Gholdengo ex / Joltik Box / Mega Kangaskhan ex · nome lungo di prova']
const opponents = Array.from({ length: 16 }, (_, i) => ({
  id: String(900000 + i), name: names[i] ?? 'Avversario di prova ' + i,
  points: 500 - i * 20, share: i === 0 ? 8.2 : 5 - i / 4,
  url: 'https://limitlesstcg.com/decks/' + (900000 + i)
}))
const historic = { id: '999998', name: 'Archetipo solo nello storico', share: 12.34, points: 200,
  url: 'https://limitlesstcg.com/decks/999998' }
const now = new Date().toISOString()
const oldDate = new Date(Date.now() - 86400000).toISOString()
const snapshot = { id: hash('matchup-selector-fixture'), fetchedAt: now,
  sourceUrl: 'https://limitlesstcg.com/decks?format=standard', period: 'Fixture UI',
  circuit: 'WESTERN', format: 'STANDARD', decks: opponents, cached: false }
const oldSnapshot = { ...snapshot, id: hash('matchup-selector-old'), fetchedAt: oldDate, decks: [historic] }
let application
let minimumContrast = Infinity

async function launch() {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile }, timeout: 30000 })
  const page = await application.firstWindow()
  page.setDefaultTimeout(15000)
  return page
}

function seed() {
  const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
  try {
    const project = db.prepare("SELECT id FROM projects WHERE name = 'Matchup · fixture UI'").get()
    const savedDeck = db.prepare('SELECT raw_text FROM deck_baselines WHERE project_id = ?').get(project.id).raw_text
    if (guideLinks) {
      db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date) VALUES (?, ?, 1, 1, ?, ?)')
        .run('me01', 'Mega Evolution · fixture', now, '2025-09-27')
      const print = { id: 'me01-086', setId: 'me01', setName: 'Mega Evolution · fixture', localId: '086',
        name: 'Mega Absol ex', category: 'Pokemon', rarity: null, variants: null,
        identityId: 'fixture-absol', identityBasis: 'gameplay', imageBase: null, thumbnail: null,
        highImageAvailable: null, sourceUpdated: null, sourceUrl: 'https://api.tcgdex.net/v2/en/cards/me01-086',
        detailAt: now, error: null, isPromo: false, regulationMark: 'I',
        gameplaySchemaVersion: 1, gameplay: { hp: 200, types: ['Darkness'], evolveFrom: null,
          attacks: [], abilities: [], effect: 'Fixture UI, non una scheda competitiva verificata.',
          trainerType: null, weaknesses: [], resistances: [], retreat: null } }
      db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(print.id, print.setId, JSON.stringify(print))
      db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at, release_date) VALUES (?, ?, 2, 2, ?, ?)')
        .run('sv01', 'Scarlet & Violet · fixture', now, '2023-03-31')
      for (const [id, identityId] of [['sv01-245', 'fixture-gardevoir-current'], ['sv01-086', 'fixture-gardevoir-historic']]) {
        const gardevoir = { ...print, id, setId: 'sv01', setName: 'Scarlet & Violet · fixture',
          localId: id.slice(-3), name: 'Gardevoir ex', identityId,
          sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}` }
        db.prepare('INSERT INTO catalog_prints VALUES (?, ?, ?)').run(id, 'sv01', JSON.stringify(gardevoir))
      }
      db.prepare('INSERT INTO catalog_sync VALUES (1, ?)').run(now)
    }
    for (const meta of [oldSnapshot, snapshot]) db.prepare('INSERT INTO meta_snapshots (id, fetched_at, payload) VALUES (?, ?, ?)')
      .run(meta.id, meta.fetchedAt, JSON.stringify(meta))
    for (const [opponent, meta, deckHash] of [
      [opponents[0], snapshot, hash(savedDeck)], [opponents[1], snapshot, hash('lista precedente')], [historic, oldSnapshot, hash(savedDeck)]
    ]) {
      const report = { projectId: project.id, metaId: meta.id, opponentId: opponent.id, deckHash,
        generatedAt: meta.fetchedAt, sampleDeckUrl: null, metaSourceUrl: meta.sourceUrl,
        metaPeriod: meta.period, metaFetchedAt: meta.fetchedAt,
        strengths: 'Preparare due attaccanti.', weaknesses: 'Partenza dipendente dalla ricerca.',
        ourKeyCards: 'Mega Absol ex, Mega Audino ex e Night Stretcher.',
        theirKeyCards: opponent.name, strategy: 'Piano di prova contro ' + opponent.name + '. Conserva una carta di ricerca per il turno successivo.',
        limitations: 'Fixture UI: guida di esempio, non generata da Codex e non verificata in partita.' }
      if (guideLinks) {
        report.sampleDeckCards = ['2 Gardevoir ex SV1 245', '4 Ralts SV1 84']
        report.sampleDeckUrl = 'https://limitlesstcg.com/decks/list/12345'
        report.sampleDeckMechanics = [{ name: 'Gardevoir ex', text: 'Scheda di prova.', sourceUrl: 'https://api.tcgdex.net/v2/en/cards/sv01-245' }]
        report.strategy += '\nAvvio: prepara Mega Absol ex. Sviluppo: controlla Gardevoir ex e confronta la [lista campione](https://limitlesstcg.com/decks/list/12345). Chiusura: valuta le risorse osservate al Regional di prova.'
        report.strengths = 'Mega Absol ex può affiancare un secondo attaccante. Verifica Gardevoir ex.'
        report.weaknesses = 'Ipotesi da controllare con la [lista campione](https://limitlesstcg.com/decks/list/12345).'
        report.theirKeyCards = 'Gardevoir ex; la [lista campione](https://limitlesstcg.com/decks/list/12345) resta un esempio.'
        report.limitations += ' Fonte: https://limitlesstcg.com/decks?format=standard. Testo non affidabile: <img src=x onerror=alert(1)> [non aprire](javascript:alert).'
        report.tournamentEvidence = { schemaVersion: 2, status: 'matched', detail: 'Evidenze dimostrative del Regional di prova.',
          eventId: null, eventName: null, eventDate: null, eventUrl: null, eventLists: null, eventParticipants: null,
          matchedDeckId: null, matchedCompleteLists: 1, observedCards: [], sampleLists: [],
          events: [{ source: 'main', eventId: '582', name: 'Regional di prova', date: now,
            url: 'https://limitlesstcg.com/tournaments/582', totalParticipants: 1, visibleParticipants: 1,
            completeLists: 1, matchedLists: 1, circuit: 'WESTERN' }] }
        if (reading && opponent.id === opponents[0].id) {
          report.strategy = '## Avvio\n- Prepara **Mega Absol ex** e un secondo attaccante.\n- Conserva la ricerca per il turno successivo.\n\n## Sviluppo\n1. Controlla Gardevoir ex nella [lista campione](https://limitlesstcg.com/decks/list/12345).\n2. Confronta le risorse osservate al Regional di prova.\n\n## Chiusura\n- Valuta i Premi rimasti e proteggi l’attaccante.\n- Se la linea principale manca, usa il piano alternativo dichiarando l’incertezza.'
          report.strengths = '- Due attaccanti possono condividere il carico.\n- **Mega Absol ex** prepara il turno seguente.'
          report.weaknesses = '- La ricerca iniziale è una dipendenza.\n- Una lista avversaria diversa può cambiare i Premi.'
          report.ourKeyCards = '- Mega Absol ex: prima linea.\n- Mega Audino ex: secondo attaccante.\n- Night Stretcher: recupero.'
          report.theirKeyCards = '- Gardevoir ex: osservata nella lista campione.\n- Ralts: frequenza da verificare.'
          report.limitations = 'Fixture UI lunga, non generata da Codex.\n- Una sola lista campione.\n- Le frequenze non provano un winrate.\n- Testo non affidabile: <img src=x onerror=alert(1)>.'
        }
      }
      db.prepare('INSERT INTO matchup_reports (project_id, meta_id, opponent_id, deck_hash, generated_at, payload) VALUES (?, ?, ?, ?, ?, ?)')
        .run(project.id, meta.id, opponent.id, deckHash, meta.fetchedAt, JSON.stringify(report))
      db.prepare('INSERT INTO matchup_discussions (id, project_id, meta_id, opponent_id, deck_hash, parent_id, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)')
        .run(opponent.id, project.id, meta.id, opponent.id, deckHash, meta.fetchedAt)
      db.prepare('INSERT INTO matchup_turns (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary) VALUES (?, ?, 0, NULL, ?, ?, NULL)')
        .run(opponent.id, opponent.id, meta.fetchedAt, JSON.stringify(guideLinks && opponent.id === opponents[0].id
          ? { ...report, sampleDeckMechanics: [{ name: 'Gardevoir ex', text: 'Scheda precedente.', sourceUrl: 'https://api.tcgdex.net/v2/en/cards/sv01-086' }] } : report))
      if (guideLinks && opponent.id === opponents[0].id) db.prepare('INSERT INTO matchup_turns (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary) VALUES (?, ?, 1, ?, ?, ?, ?)')
        .run(opponent.id + '-revision', opponent.id, 'Rivedi le risorse finali.', now, JSON.stringify(report), 'Riferimento aggiornato per Gardevoir ex.')
    }
  } finally { db.close() }
}

async function geometry(page, width, height, open) {
  await page.setViewportSize({ width, height })
  const boxes = await page.evaluate((open) => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    return { main: rect('.main-content'), deck: rect('.deck-companion'),
      target: rect(open ? '.matchup-picker' : '#matchup-switcher-trigger'),
      rootScroll: document.querySelector('#root').scrollTop,
      overflow: document.querySelector('.main-content').scrollWidth > document.querySelector('.main-content').clientWidth + 1 }
  }, open)
  assert.equal(boxes.rootScroll, 0, 'Il focus ha spostato la griglia')
  assert.equal(boxes.overflow, false, 'Overflow orizzontale')
  assert.ok(boxes.target.left >= boxes.main.left && boxes.target.right <= boxes.main.right, 'Selettore fuori dal contenuto')
  assert.ok(boxes.target.top >= boxes.main.top && boxes.target.bottom <= boxes.main.bottom, 'Menu fuori dal contenuto')
  assert.ok(width > 1240 ? boxes.main.right <= boxes.deck.left : boxes.main.bottom <= boxes.deck.top, 'Lista coperta')
  minimumContrast = Math.min(minimumContrast, (await auditDesignSystem(page, 'Matchup ' + width)).minimumContrast)
}

try {
  let page = await launch()
  await createProjectFromStart(page, 'Matchup · fixture UI')
  await page.getByLabel('Testo lista').fill(deck)
  await page.getByRole('button', { name: 'Salva lista', exact: true }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  assert.equal((await page.evaluate(() => window.projectsApi.create({ name: 'Progetto separato', format: 'STANDARD' }))).ok, true)
  await application.close()
  application = undefined
  seed()
  page = await launch()
  // Only the network snapshot is a fixture handler. Guides/history/project isolation use real SQLite and IPC.
  await application.evaluate(({ ipcMain }, meta) => {
    ipcMain.removeHandler('matchups:get-meta')
    ipcMain.handle('matchups:get-meta', () => ({ ok: true, value: meta }))
  }, snapshot)
  await switchProject(page, /Matchup · fixture UI/)
  await page.getByRole('button', { name: 'Matchup', exact: true }).click()
  const trigger = page.locator('#matchup-switcher-trigger')
  const picker = page.getByRole('dialog', { name: 'Scegli avversario' })
  const search = page.getByLabel('Cerca avversario')
  async function openPicker() {
    await trigger.click()
    await page.waitForFunction(() => document.querySelector('#matchup-switcher-trigger')?.getAttribute('aria-expanded') === 'true' &&
      document.activeElement?.getAttribute('aria-label') === 'Cerca avversario')
  }
  await trigger.waitFor()
  await page.waitForFunction(() => document.querySelector('#matchup-switcher-trigger')?.textContent.includes('Guida disponibile'))
  await page.locator('.matchup-fields').first().getByRole('heading', { name: 'Piano di gioco' }).waitFor()
  if (guideLinks) {
    await application.evaluate(({ shell }) => {
      globalThis.guideOpened = []
      globalThis.guideOpenFails = false
      shell.openExternal = async (url) => {
        if (globalThis.guideOpenFails) throw new Error('Fixture: browser non disponibile')
        globalThis.guideOpened.push(url)
      }
    })
    const plan = page.locator('.matchup-fields > .strategy-field').first()
    const card = plan.getByRole('link', { name: 'Gardevoir ex', exact: true }).last()
    assert.equal(await card.getAttribute('href'), '#catalog-card-fixture-gardevoir-current')
    await card.focus()
    await page.keyboard.press('Enter')
    await page.locator('.catalog-detail').getByRole('heading', { name: 'Gardevoir ex', exact: true }).waitFor({ timeout: 30000 })
    assert.deepEqual(await application.evaluate(() => globalThis.guideOpened), [], 'La carta locale non deve aprire JSON')
    await page.getByRole('button', { name: 'Matchup', exact: true }).click()
    await page.getByText('Come giocare il matchup', { exact: true }).waitFor()
    const currentPlan = page.locator('.matchup-fields > .strategy-field').first()
    await currentPlan.getByRole('link', { name: 'lista campione', exact: true }).click()
    await currentPlan.getByRole('link', { name: 'Regional di prova', exact: true }).click()
    assert.deepEqual(await application.evaluate(() => globalThis.guideOpened), [
      'https://limitlesstcg.com/decks/list/12345', 'https://limitlesstcg.com/tournaments/582'
    ], 'Le API reali non hanno aperto le destinazioni previste')
    await application.evaluate(() => { globalThis.guideOpenFails = true })
    await currentPlan.getByRole('link', { name: 'lista campione', exact: true }).click()
    await currentPlan.getByRole('alert').waitFor()
    await application.evaluate(() => { globalThis.guideOpenFails = false })
    await currentPlan.getByRole('link', { name: 'lista campione', exact: true }).click()
    await currentPlan.getByRole('alert').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.matchup-fields img, .matchup-fields a[href^="javascript:"]').count(), 0)
    assert.ok(await page.getByRole('heading', { name: 'Punti forti', exact: true }).first().isVisible())
    assert.equal(await page.locator('.guide-sources').getAttribute('open'), null)
    assert.ok(await page.locator('.matchup-fields').first().getByRole('link', { name: 'lista campione' }).first().isVisible())
    await page.locator('.guide-sources > summary').click()
    await page.getByRole('region', { name: 'Evidenze torneo del matchup' }).waitFor()
    await page.locator('.guide-sources > summary').click()
    await page.locator('.discussion-history > summary').click()
    const previous = page.locator('.discussion-version').first()
    await previous.locator('summary').click()
    assert.equal(await previous.getByRole('link', { name: 'Gardevoir ex', exact: true }).first().getAttribute('href'), '#catalog-card-fixture-gardevoir-historic')
    await previous.locator('summary').click()
    await page.locator('.discussion-history > summary').click()
    await plan.getByRole('link', { name: 'Mega Absol ex', exact: true }).click()
    await page.locator('.catalog-detail').getByRole('heading', { name: 'Mega Absol ex', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Matchup', exact: true }).click()
    await page.locator('.matchup-fields').first().getByRole('heading', { name: 'Piano di gioco' }).waitFor()
  }

  if (process.argv.includes('--navigation')) await navigationScenarios(page, application, profile)
  if (process.argv.includes('--ai-options')) await matchupAiScenarios(page, application, workspace)
  if (process.argv.includes('--discussion')) await discussionScenarios(page, application, workspace, profile)

  for (const [width, height] of [[1440, 900], [1280, 720], [640, 720]]) {
    await page.locator('.main-content').evaluate((el) => { el.scrollTop = 0 })
    await geometry(page, width, height, false)
    if (reading) {
      const sections = page.locator('.matchup-fields').first()
      assert.deepEqual(await sections.locator(':scope > section > h3').allTextContents(),
        ['Piano di gioco', 'Punti forti', 'Rischi e punti deboli', 'Le nostre carte chiave', 'Le loro carte chiave', 'Incertezze e limiti'])
      assert.equal(await sections.locator('.strategy-field ul > li').count(), 4)
      assert.equal(await sections.locator('.strategy-field ol > li').count(), 2)
      assert.ok(await sections.getByText('Fixture UI lunga, non generata da Codex.', { exact: true }).isVisible())
      await page.screenshot({ path: join(workspace, 'node_modules', 'matchup-reading-' + width + '.png') })
    }
    if (guideLinks) {
      const planBox = await page.locator('.strategy-field .guide-body').first().boundingBox()
      const mainBox = await page.locator('.main-content').boundingBox()
      assert.ok(planBox.y + 40 < mainBox.y + mainBox.height, 'Il testo del piano non è visibile nella prima schermata')
    }
    await page.screenshot({ path: join(profile, 'matchup-guide-' + width + '.png') })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await search.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Cerca avversario')
    assert.equal(await picker.locator('.matchup-option').count(), 17)
    assert.match(await picker.locator('.matchup-option').first().innerText(), /8,20% quota meta · Guida disponibile/)
    assert.match(await picker.locator('.matchup-option').nth(1).innerText(), /quota meta · Guida storica/)
    assert.match(await picker.locator('.matchup-option').nth(2).innerText(), /Nessuna guida/)
    assert.match(await picker.locator('.matchup-option').last().innerText(), /Solo nello storico · Guida storica/)
    assert.doesNotMatch(await picker.locator('.matchup-option').last().innerText(), /12,34|12.34|%/)
    await geometry(page, width, height, true)
    await page.screenshot({ path: join(profile, 'matchup-picker-' + width + '.png') })
    await page.keyboard.press('ArrowUp')
    assert.ok(await picker.locator('.matchup-option').last().evaluate((el) => document.activeElement === el))
    await geometry(page, width, height, true)
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'hidden' })
    assert.ok(await trigger.evaluate((el) => el === document.activeElement))
  }

  await openPicker()
  await search.fill('NESSUN RISULTATO')
  await picker.getByRole('status').waitFor()
  await page.keyboard.press('ArrowDown')
  assert.ok(await search.evaluate((el) => el === document.activeElement))
  await page.keyboard.press('Escape')
  await openPicker()
  assert.equal(await search.inputValue(), '')
  await search.fill(' gholdengo ')
  assert.equal(await picker.locator('.matchup-option').count(), 1)
  await geometry(page, 640, 720, true)
  await page.screenshot({ path: join(profile, 'matchup-long-name-640.png') })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Tab')
  await picker.waitFor({ state: 'hidden' })
  assert.match(await trigger.innerText(), /Gardevoir/)
  await openPicker()
  await search.fill('gholdengo')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await picker.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => document.querySelector('#matchup-switcher-trigger')?.textContent.includes('Nessuna guida') && document.activeElement?.id === 'matchup-switcher-trigger')
  assert.match(await trigger.innerText(), /Gholdengo.*Nessuna guida/s)
  assert.ok(await trigger.evaluate((el) => el === document.activeElement))
  await page.getByText('Nessuna guida per questo archetipo e questa lista.').waitFor()
  await openPicker()
  await search.fill('solo nello storico')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.getByText('Guida storica · base precedente', { exact: true }).waitFor()
  await page.getByText('Avversario assente dal meta attuale. Guida consultabile.', { exact: true }).waitFor()
  assert.equal(await page.locator('#matchup-feedback').count(), 0)
  assert.match(await page.locator('.matchup-fields').first().innerText(), /Piano di prova contro Archetipo solo nello storico/)
  await page.getByRole('button', { name: 'Aggiorna Limitless', exact: true }).click()
  assert.match(await trigger.innerText(), /Archetipo solo nello storico/)
  await openPicker()
  await search.fill('Dragapult')
  await picker.getByRole('button', { name: /Dragapult/ }).click()
  await page.getByText('Guida storica · base precedente', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Continua sulla nuova base' }).waitFor()

  await switchProject(page, /Progetto separato/)
  await page.waitForFunction(() => document.querySelector('#matchup-switcher-trigger')?.textContent.includes('Nessuna guida'))
  await openPicker()
  assert.equal(await picker.locator('.matchup-option').count(), 16, 'Storico di un altro progetto visibile')
  assert.doesNotMatch(await picker.innerText(), /Guida disponibile|Guida storica/)
  await page.keyboard.press('Escape')
  await page.getByText('Importa una lista nel progetto per generare l’analisi di questo matchup.').waitFor()

  // A failed history read must not masquerade as "no guides".
  await application.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('matchups:list-historical-opponents')
    ipcMain.handle('matchups:list-historical-opponents', () => ({ ok: false, error: 'Storico non leggibile · fixture UI' }))
  })
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await page.getByRole('button', { name: 'Matchup', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Storico non leggibile' }).waitFor()
  assert.match(await trigger.innerText(), /Disponibilità da verificare/)
  console.log('MATCHUP UI OK' + (guideLinks ? ' con riferimenti contestuali, API reali e shell intercettata' : '') + ': ricerca, tastiera, storico, base precedente, isolamento progetti, errore lettura; 1440/1280/640; contrasto minimo ' + minimumContrast.toFixed(2))
} finally {
  await application?.close()
  const resolved = realpathSync(profile)
  assert.equal(dirname(resolved).toLowerCase(), realpathSync(tmpdir()).toLowerCase())
  assert.ok(basename(resolved).startsWith('pokeguru-matchup-switcher-'))
  rmSync(resolved, { recursive: true, force: true })
}
