import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const profileRenderer = process.argv.includes('--profile-renderer')
const expectAllMessages = process.argv.includes('--expect-all-messages')
const matchedEvidence = process.argv.includes('--matched-evidence')
const markdownMessages = process.argv.includes('--markdown-messages')
const threadIpcOnly = process.argv.includes('--thread-ipc-only')
const integerOption = (name, fallback, maximum = 1000) => {
  const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=')[1]
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum)
    throw new Error(`Invalid --${name} value`)
  return number
}
const threadCount = integerOption('threads', 160)
const longMessages = integerOption('selected-messages', 5, 5000)
const cardCount = Number(process.argv.find((argument) => argument.startsWith('--cards='))?.split('=')[1] ?? 10_000)
if (cardCount !== 5_000 && cardCount !== 10_000) throw new Error('Use --cards=5000 or --cards=10000')
const viewportWidth = process.argv.some((argument) => argument.startsWith('--viewport-width='))
  ? integerOption('viewport-width', 1280) : null
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-growth-perf-'))
const profile = join(temporary, 'profile')
const executablePath = require('electron')
const deckText = readFileSync(join(workspace, 'examples', 'workspace-principale.txt'), 'utf8').trim()
let deckHash
const metaId = createHash('sha256').update('growth-performance-fixture').digest('hex')
const opponents = Array.from({ length: 60 }, (_, index) => ({ id: String(900000 + index),
  name: `Synthetic opponent ${index}`, points: 500 - index, share: 5 - index / 100,
  url: `https://limitlesstcg.com/decks/${900000 + index}` }))
const meta = { id: metaId, fetchedAt: '2026-10-25T00:00:00.000Z',
  sourceUrl: 'https://limitlesstcg.com/decks?format=standard', period: 'Synthetic',
  circuit: 'WESTERN', format: 'STANDARD', decks: opponents, cached: true }
const median = (items) => [...items].sort((a, b) => a - b)[Math.floor(items.length / 2)]
let application

function seed(path, projectId, count) {
  const db = new DatabaseSync(path)
  const date = '2026-10-25T00:00:00.000Z'
  const cards = Array.from({ length: 20 }, (_, number) => ({ category: 'pokemon', count: 3,
    name: `Card ${number}`, set: 'MEG', number: String(number) }))
  try {
    const savedDeck = db.prepare('SELECT raw_text FROM deck_baselines WHERE project_id = ?')
      .get(projectId).raw_text
    deckHash = createHash('sha256').update(savedDeck).digest('hex')
    const set = db.prepare('INSERT INTO catalog_sets (id, name, source_total, sample_total, fetched_at) VALUES (?, ?, 1000, 1000, ?)')
    for (let index = 0; index < count / 1000; index++) set.run(`s${index}`, `Synthetic set ${index}`, date)
    db.prepare("INSERT INTO catalog_scope (id, kind) VALUES (1, 'standard-marks')").run()
    db.prepare('INSERT INTO catalog_sync (id, fetched_at) VALUES (1, ?)').run(date)
    const print = db.prepare('INSERT INTO catalog_prints (id, set_id, payload) VALUES (?, ?, ?)')
    const target = db.prepare('INSERT INTO catalog_targets (print_id) VALUES (?)')
    const thread = db.prepare(`INSERT INTO deck_threads (id, project_id, title, base_version_id,
      ai_session_ref, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?) `)
    const message = db.prepare(`INSERT INTO deck_thread_messages
      (id, thread_id, author, text, created_at, evidence_json) VALUES (?, ?, 'assistant', ?, ?, ?) `)
    const candidate = db.prepare(`INSERT INTO deck_thread_candidates
      (id, thread_id, sequence, raw_text, parsed_json, note, origin, created_at)
      VALUES (?, ?, 1, ?, ?, '', 'manual', ?) `)
    const play = db.prepare('INSERT INTO tournament_snapshots (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)')
    const regional = db.prepare('INSERT INTO main_tournament_snapshots (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)')
    const evidence = JSON.stringify({ schemaVersion: 1, capturedAt: date, baseVersionId: null,
      candidateId: null, catalogSyncedAt: date, cardCoverage: { selected: 0, withGameplay: 0,
        omitted: 0 }, cards: [], events: [], sources: [{ id: 'synthetic',
        label: 'x'.repeat(32_000), url: null, fingerprint: 'synthetic' }],
      change: { updated: [], added: [], removed: [] } })
    const parsed = JSON.stringify({ interpretedTotal: 60, diagnostics: [], lines: [] })
    db.exec('BEGIN IMMEDIATE')
    for (let index = 0; index < count; index++) {
      const setId = `s${Math.floor(index / 1000)}`
      const id = `${setId}-${String(index).padStart(5, '0')}`
      const payload = { id, setId, setName: `Synthetic set ${Math.floor(index / 1000)}`,
        localId: String(index % 1000), name: `Synthetic card ${index}`, category: 'Pokemon',
        stage: 'Basic', rarity: 'Common', regulationMark: 'I', variants: null,
        identityId: `identity-${index}`, identityBasis: 'pokemon-text', imageBase: null,
        thumbnail: null, highImageAvailable: null, sourceUpdated: null,
        sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`, detailAt: date, error: null,
        gameplaySchemaVersion: 1, gameplay: { hp: 100, types: ['Grass'], evolveFrom: null,
          attacks: [], abilities: [], effect: null, trainerType: null, weaknesses: [],
          resistances: [], retreat: 1 } }
      print.run(id, setId, JSON.stringify(payload))
      target.run(id)
    }
    for (let index = 0; index < threadCount; index++) {
      const id = `thread-${String(index).padStart(3, '0')}`
      thread.run(id, projectId, `Thread ${index}`, date, date)
      for (let number = 0; number < (index === threadCount - 1 ? longMessages : 5); number++)
        message.run(`${id}-message-${number}`, id,
        markdownMessages ? `Answer ${number}\n\n### Piano\n\n**Priorità:** conserva le fonti.\n\n- Osserva la lista.\n- Valuta il turno.\n\n[Lista pubblica](https://limitlesstcg.com/decks/list/123)`
          : `Answer ${number}`, date, evidence)
      candidate.run(`${id}-candidate`, id, '60 Synthetic Card MEG 1', parsed, date)
    }
    for (let index = 0; index < 120; index++) {
      const id = `play-${index}`
      const participations = Array.from({ length: 120 }, (_, number) => ({ playerId: `${id}-${number}`,
        playerName: `Player ${number}`, country: 'IT', placing: number + 1, record: null,
        deck: { id: matchedEvidence && index < 5 && number < 3 ? 'Synthetic opponent 0' : 'deck',
          name: matchedEvidence && index < 5 && number < 3 ? 'Synthetic opponent 0' : 'Test deck' },
        listStatus: 'available', cards, cardTotal: 60 }))
      play.run(id, String(index), date, JSON.stringify({ id, eventId: String(index), fetchedAt: date,
        source: 'Limitless Play API', sourceUrl: '', publicUrl: '', name: `Event ${index}`,
        date: '2026-10-25', circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL',
        isOnline: true, reportedPlayers: 120, phases: [], participations,
        coverage: { returnedParticipants: 120, availableLists: 120, invalidLists: 0,
          missingLists: 0, complete60Lists: 120 }, cached: true }))
    }
    for (let index = 0; index < 60; index++) {
      const id = `main-${index}`
      const participants = Array.from({ length: 300 }, (_, number) => ({ placing: number + 1,
        playerName: `Player ${number}`, playerId: String(number), country: 'IT',
        deckId: matchedEvidence && index < 5 && number < 3 ? '900000' : 'deck',
        deckName: 'Test deck', listId: String(number), listUrl: null, cards, cardTotal: 60 }))
      regional.run(id, String(index), date, JSON.stringify({ id, eventId: String(index),
        name: `Regional ${index}`, date: '2026-10-25', country: 'IT', players: 300, url: '',
        fetchedAt: date, source: 'Limitless tournament database', circuit: 'WESTERN',
        format: 'STANDARD', type: 'IN_PERSON', participants, cached: true,
        coverage: { returnedParticipants: 300, listedDecks: 300, fetchedLists: 300,
          complete60Lists: 300, noListLink: 0 } }))
    }
    db.prepare('INSERT INTO meta_snapshots (id, fetched_at, payload) VALUES (?, ?, ?)')
      .run(metaId, date, JSON.stringify(meta))
    const addReport = db.prepare(`INSERT INTO matchup_reports
      (project_id, meta_id, opponent_id, deck_hash, generated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?) `)
    const addDiscussion = db.prepare(`INSERT INTO matchup_discussions
      (id, project_id, meta_id, opponent_id, deck_hash, parent_id, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?) `)
    const addTurn = db.prepare(`INSERT INTO matchup_turns
      (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?) `)
    for (const opponent of opponents) {
      const report = { projectId, metaId, opponentId: opponent.id, deckHash,
        generatedAt: date, sampleDeckUrl: null, metaSourceUrl: meta.sourceUrl,
        metaPeriod: meta.period, metaFetchedAt: date, strengths: 'Synthetic strengths.',
        weaknesses: 'Synthetic weaknesses.', ourKeyCards: 'Synthetic cards.',
        theirKeyCards: opponent.name, strategy: 'Synthetic guide for performance only.',
        limitations: 'Synthetic, not Codex generated.' }
      const payload = JSON.stringify(report)
      addReport.run(projectId, metaId, opponent.id, deckHash, date, payload)
      addDiscussion.run(opponent.id, projectId, metaId, opponent.id, deckHash, date)
      for (let number = 0; number < 5; number++) addTurn.run(`${opponent.id}-${number}`,
        opponent.id, number, number ? 'Synthetic comment.' : null, date, payload,
        number ? 'Synthetic revision.' : null)
    }
    db.exec('COMMIT')
    return { cards: count, threads: threadCount,
      messages: (threadCount - 1) * 5 + longMessages, candidates: threadCount,
      playEvents: 120, regionalEvents: 60, matchupOpponents: 60, matchupRevisions: 300,
      matchedEvidence, markdownMessages }
  } catch (error) { db.exec('ROLLBACK'); throw error } finally { db.close() }
}

function measureSnapshotReads(path) {
  const db = new DatabaseSync(path)
  try {
    const result = {}
    for (const [name, table] of [['play', 'tournament_snapshots'],
      ['regional', 'main_tournament_snapshots']]) {
      const query = db.prepare(`SELECT payload FROM ${table}
        WHERE rowid IN (SELECT MAX(rowid) FROM ${table} GROUP BY event_id)`)
      const querySamples = []
      const parseSamples = []
      let count = 0
      let jsonChars = 0
      for (let index = 0; index < 5; index++) {
        const queryStart = performance.now()
        const rows = query.all()
        querySamples.push(+(performance.now() - queryStart).toFixed(1))
        const parseStart = performance.now()
        const snapshots = rows.map((row) => JSON.parse(row.payload))
        snapshots.sort((a, b) => b.date.localeCompare(a.date) || a.eventId.localeCompare(b.eventId))
        parseSamples.push(+(performance.now() - parseStart).toFixed(1))
        count = rows.length
        jsonChars = rows.reduce((sum, row) => sum + row.payload.length, 0)
      }
      result[name] = { count, jsonChars, querySamples, queryMedian: median(querySamples),
        parseSamples, parseMedian: median(parseSamples) }
    }
    return result
  } finally { db.close() }
}

function measureThreadReads(path, threadId) {
  const db = new DatabaseSync(path)
  try {
    const query = db.prepare(`SELECT text, evidence_json FROM deck_thread_messages
      WHERE thread_id = ? ORDER BY created_at, rowid`)
    const querySamples = []
    const parseSamples = []
    let messages = 0
    let jsonChars = 0
    for (let index = 0; index < 3; index++) {
      const queryStart = performance.now()
      const rows = query.all(threadId)
      querySamples.push(+(performance.now() - queryStart).toFixed(1))
      const parseStart = performance.now()
      for (const row of rows) if (row.evidence_json) JSON.parse(row.evidence_json)
      parseSamples.push(+(performance.now() - parseStart).toFixed(1))
      messages = rows.length
      jsonChars = rows.reduce((sum, row) => sum + row.text.length + (row.evidence_json?.length ?? 0), 0)
    }
    return { messages, jsonChars, querySamples, queryMedian: median(querySamples),
      parseSamples, parseMedian: median(parseSamples) }
  } finally { db.close() }
}

const launch = () => electron.launch({ executablePath, args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') },
  timeout: 30000 })
try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Performance fixture')
  await page.getByRole('heading', { name: 'Performance fixture', exact: true }).waitFor()
  await page.getByLabel('Testo lista').fill(deckText)
  await page.getByRole('button', { name: 'Salva lista', exact: true }).click()
  await page.locator('#deck-import').waitFor({ state: 'detached' })
  const projects = await page.evaluate(async () => window.projectsApi.list())
  const projectId = projects.value[0].id
  await application.close()
  application = undefined

  const databasePath = join(profile, 'data', 'pokeguru.sqlite')
  const dataset = seed(databasePath, projectId, cardCount)
  const start = performance.now()
  application = await launch()
  page = await application.firstWindow()
  if (viewportWidth) await page.setViewportSize({ width: viewportWidth, height: 800 })
  await application.evaluate(({ ipcMain }, snapshot) => {
    ipcMain.removeHandler('matchups:get-meta')
    ipcMain.handle('matchups:get-meta', () => ({ ok: true, value: snapshot }))
  }, meta)
  page.on('pageerror', (error) => console.log(`Renderer error: ${error.message}`))
  page.on('crash', () => console.log('Renderer crashed'))
  await page.getByRole('heading', { name: 'Performance fixture', exact: true }).waitFor()
  const startupMs = +(performance.now() - start).toFixed(1)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.evaluate(() => {
    window.__growthLongTasks = []
    new PerformanceObserver((list) => window.__growthLongTasks.push(...list.getEntries()
      .map((entry) => +entry.duration.toFixed(1)))).observe({ type: 'longtask', buffered: true })
  })
  const heap = async () => (await cdp.send('Performance.getMetrics')).metrics
    .find((entry) => entry.name === 'JSHeapUsedSize')?.value ?? null
  const heapStart = await heap()
  if (threadIpcOnly) {
    const threadId = `thread-${String(threadCount - 1).padStart(3, '0')}`
    const samples = []
    for (let index = 0; index < 3; index++) {
      const sample = await page.evaluate(async ({ projectId, threadId }) => {
        const start = performance.now()
        const result = await window.projectsApi.getDeckThread(projectId, threadId)
        const ipcMs = performance.now() - start
        if (!result.ok) throw new Error(result.error)
        const serializeStart = performance.now()
        const jsonChars = JSON.stringify(result).length
        return { ipcMs: +ipcMs.toFixed(1), serializeMs: +(performance.now() - serializeStart).toFixed(1),
          jsonChars, messages: result.value.messages.length }
      }, { projectId, threadId })
      samples.push(sample)
      await cdp.send('HeapProfiler.enable')
      await cdp.send('HeapProfiler.collectGarbage')
    }
    const heapAfterGc = await heap()
    const processes = await application.evaluate(({ app }) => app.getAppMetrics().map((entry) => ({
      type: entry.type, privateKiB: entry.memory?.privateBytes ?? null })))
    await application.close()
    application = undefined
    const threadReads = measureThreadReads(databasePath, threadId)
    console.log(JSON.stringify({ kind: 'Thread detail growth, offline and isolated',
      dataset: { ...dataset, viewportWidth: viewportWidth ?? 'default' }, startupMs,
      threadDetail: { samples, ipcMedian: median(samples.map((item) => item.ipcMs)),
        serializeMedian: median(samples.map((item) => item.serializeMs)) },
      threadReads, rendererHeapBytes: { start: heapStart, afterGc: heapAfterGc }, processes }, null, 2))
  } else {
  const ipc = {}
  for (const [name, call] of Object.entries({
    catalog: 'getCatalog', catalogOverview: 'getCatalogBrowseOverview',
    threadSummaries: 'listDeckThreadSummaries', playSummaries: 'listTournaments',
    regionalSummaries: 'listMainTournaments', matchupEvidence: 'getMatchupEvidence',
    matchupReports: 'listMatchupReports',
    matchupDiscussion: 'listMatchupDiscussions', threadDetail: 'getDeckThread',
    catalogSearch: 'searchCatalog'
  })) {
    const samples = []
    let resultBytes = 0
    for (let index = 0; index < (call === 'getMatchupEvidence' ? 3 : 5); index++) {
      const measurement = await page.evaluate(async ({ call, projectId, metaId, threadCount, sampleIndex }) => {
        const start = performance.now()
        const args = { listDeckThreadSummaries: [projectId],
          listMatchupReports: [projectId, metaId],
          getMatchupEvidence: [metaId, '900000'],
          listMatchupDiscussions: [projectId, '900000'],
          getDeckThread: [projectId, `thread-${String(threadCount - 1).padStart(3, '0')}`],
          searchCatalog: ['Synthetic card', 'all', 0] }[call] ?? []
        const result = await window.projectsApi[call](...args)
        const ms = performance.now() - start
        return { ms, ok: result.ok, bytes: sampleIndex === 0 ? JSON.stringify(result).length : 0,
          matchupStatus: call === 'getMatchupEvidence' ? result.value?.status : undefined }
      }, { call, projectId, metaId, threadCount, sampleIndex: index })
      if (!measurement.ok) throw new Error(`${call} returned an error`)
      if (matchedEvidence && call === 'getMatchupEvidence' && measurement.matchupStatus !== 'matched')
        throw new Error('Matched Matchup fixture produced no matches')
      samples.push(+measurement.ms.toFixed(1))
      if (index === 0) resultBytes = measurement.bytes
    }
    ipc[name] = { samples, median: median(samples), jsonChars: resultBytes }
  }
  const navigation = {}
  const rendererProfiles = {}
  for (const section of ['Catalogo', 'Lista', 'Thread', 'Eventi', 'Matchup']) {
    const samples = []
    for (let index = 0; index < 3; index++) {
      const profiling = profileRenderer && index === 0 && ['Lista', 'Matchup'].includes(section)
      if (profiling) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start') }
      const elapsed = await page.evaluate(async (name) => {
        const button = [...document.querySelectorAll('.sidebar button')]
          .find((item) => item.textContent?.trim() === name)
        if (!button) throw new Error(`Missing ${name}: ${document.body.innerText.slice(0, 800)}`)
        const started = performance.now()
        button.click()
        await new Promise((resolve, reject) => {
          const check = () => {
            const active = [...document.querySelectorAll('.sidebar button.active')]
              .some((item) => item.textContent?.trim() === name)
            if (active && !document.querySelector('[data-nav-loading="true"]'))
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            else if (performance.now() - started > 10000) reject(new Error(`Timeout ${name}`))
            else requestAnimationFrame(check)
          }
          requestAnimationFrame(check)
        })
        return performance.now() - started
      }, section)
      samples.push(+elapsed.toFixed(1))
      if (profiling) {
        await page.waitForTimeout(1000)
        const { profile } = await cdp.send('Profiler.stop')
        const hits = new Map()
        for (const id of profile.samples ?? []) hits.set(id, (hits.get(id) ?? 0) + 1)
        rendererProfiles[section] = profile.nodes.map((node) => ({
          function: node.callFrame.functionName, url: node.callFrame.url,
          line: node.callFrame.lineNumber + 1, column: node.callFrame.columnNumber + 1,
          samples: hits.get(node.id) ?? 0
        })).filter((node) => node.samples > 0)
          .sort((a, b) => b.samples - a.samples).slice(0, 12)
      }
    }
    navigation[section] = { samples, median: median(samples) }
    await page.waitForTimeout(600)
  }
  const scroll = {}
  for (const [section, ready, scrollSelector] of [['Catalogo', '.catalog-list', '.catalog-list'],
    ['Thread', '#thread-switcher-trigger', '.main-content'],
    ['Matchup', '#matchup-switcher-trigger', '.main-content']]) {
    await page.getByRole('button', { name: section, exact: true }).first().click()
    await page.locator(ready).waitFor()
    await page.waitForFunction((name) => [...document.querySelectorAll('.sidebar button.active')]
      .some((button) => button.textContent?.trim() === name) &&
      !document.querySelector('[data-nav-loading="true"]'), section)
    scroll[section] = await page.evaluate(async (selector) => {
      const target = document.querySelector(selector)
      if (!target || target.scrollHeight <= target.clientHeight + 100) return { available: false }
      const gaps = []
      let previous = performance.now()
      for (let frame = 0; frame < 120; frame++) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const now = performance.now()
        gaps.push(now - previous)
        previous = now
        target.scrollTop += 16
      }
      const sorted = gaps.toSorted((a, b) => a - b)
      return { available: true, selector: target.className || target.tagName,
        scrollRange: target.scrollHeight - target.clientHeight,
        p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
        over32ms: gaps.filter((gap) => gap > 32).length }
    }, scrollSelector)
  }
  await page.getByRole('button', { name: 'Catalogo', exact: true }).first().click()
  await page.locator('.catalog-list').waitFor()
  const threadHeapBefore = await heap()
  const threadStarted = performance.now()
  await page.getByRole('button', { name: 'Thread', exact: true }).first().click()
  await page.waitForFunction((expected) =>
    document.querySelectorAll('.threads-section .thread-message').length === expected,
  expectAllMessages ? longMessages : Math.min(longMessages, 50), { timeout: 30000 })
  const threadContentMs = +(performance.now() - threadStarted).toFixed(1)
  const threadHeapAfter = await heap()
  const threadDom = await page.evaluate((totalMessages) => ({
    nodes: document.querySelector('.threads-section')?.querySelectorAll('*').length ?? 0,
    messages: document.querySelectorAll('.threads-section .thread-message').length,
    totalMessages,
    candidates: document.querySelectorAll('.threads-section .thread-candidate').length,
    timelineHeight: document.querySelector('.thread-timeline')?.scrollHeight ?? 0
  }), longMessages)
  if (markdownMessages) {
    const rendered = page.locator('.threads-section .thread-message').first()
    const markdown = rendered.locator('.thread-markdown')
    const structure = { heading: await markdown.locator('h3').allTextContents(),
      listItems: await markdown.locator('li').count(), links: await markdown.locator('a').count(),
      text: (await rendered.innerText()).slice(0, 200) }
    if (structure.heading[0] !== 'Piano' || structure.listItems !== 2 || structure.links !== 1)
      throw new Error(`Structured Thread Markdown was not rendered: ${JSON.stringify(structure)}`)
  }
  let threadHistoryExpansion = null
  if (longMessages > 50 && !expectAllMessages) {
    await page.locator('#thread-message').fill('Bozza mantenuta durante la lettura')
    const historyButton = page.getByRole('button', { name: /Mostra 50 precedenti/ })
    await historyButton.scrollIntoViewIfNeeded()
    const buttonTopBefore = await historyButton.evaluate((button) => button.getBoundingClientRect().top)
    const started = performance.now()
    await historyButton.click()
    await page.waitForFunction(() => document.querySelectorAll('.threads-section .thread-message').length === 100)
    const historyState = await historyButton.evaluate((button) => ({
      focused: document.activeElement === button, top: button.getBoundingClientRect().top }))
    if (!historyState.focused || Math.abs(historyState.top - buttonTopBefore) > 4)
      throw new Error(`Thread history lost focus or scroll position: ${JSON.stringify(historyState)}`)
    if (await page.locator('#thread-message').inputValue() !== 'Bozza mantenuta durante la lettura')
      throw new Error('Thread draft changed while revealing history')
    if (await page.locator('.threads-section .thread-candidate').count() !== 1)
      throw new Error('Featured candidate disappeared while revealing history')
    if (await page.locator('.threads-section .thread-message').first().locator('.candidate-evidence').count() !== 1)
      throw new Error('Historical evidence disappeared while revealing history')
    threadHistoryExpansion = { ms: +(performance.now() - started).toFixed(1),
      visibleMessages: await page.locator('.threads-section .thread-message').count(),
      firstMessage: await page.locator('.threads-section .thread-message p').first().innerText(),
      focused: historyState.focused, buttonShiftPx: +(historyState.top - buttonTopBefore).toFixed(1) }
  }
  const heapEnd = await heap()
  await cdp.send('HeapProfiler.enable')
  await cdp.send('HeapProfiler.collectGarbage')
  const heapAfterGc = await heap()
  const longTasks = await page.evaluate(() => window.__growthLongTasks ?? [])
  const processes = await application.evaluate(({ app }) => app.getAppMetrics().map((entry) => ({
    type: entry.type, privateKiB: entry.memory?.privateBytes ?? null })))
  await application.close()
  application = undefined
  const snapshotReads = measureSnapshotReads(databasePath)
  console.log(JSON.stringify({ kind: 'Populated Electron fixture, offline and warm cache', platform: process.platform,
    profiled: profileRenderer, rendererProfiles,
    dataset: { ...dataset, viewportWidth: viewportWidth ?? 'default', expectAllMessages },
    snapshotReads, startupMs, ipc, navigation, scroll,
    threadContent: { ms: threadContentMs, dom: threadDom,
      heapBeforeBytes: threadHeapBefore, heapAfterBytes: threadHeapAfter },
    threadHistoryExpansion,
    longTasks: { count: longTasks.length,
      maxMs: longTasks.length ? Math.max(...longTasks) : 0 },
    rendererHeapBytes: { start: heapStart, end: heapEnd, afterGc: heapAfterGc },
    processes }, null, 2))
  }
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-growth-perf-')) throw new Error('Unexpected temporary path')
  rmSync(temporary, { recursive: true, force: true })
}
