import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url), ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename)
const { ProjectStore } = require('../src/main/project-store.ts')
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-history-ui-')), profile = join(temporary, 'profile')
const path = join(profile, 'data', 'pokeguru.sqlite')
let application
console.log('History fixture: building')
const store = new ProjectStore(path)
const project = store.create({ name: 'Storici completi', format: 'STANDARD' })
for (let i = 1; i <= 131; i++) store.importDeck({ projectId: project.id, source: 'paste', rawText: `60 Basic Psychic Energy\n# Version ${i}` })
const baseline = store.getBaseline(project.id)
const thread = store.createDeckThread({ projectId: project.id, title: 'Strategia lunga' })
for (let i = 1; i <= 131; i++) store.saveDeckCandidate({ projectId: project.id, threadId: thread.id,
  rawText: '60 Basic Psychic Energy', note: `Proposta storica ${i}` }, true)
for (let i = 1; i <= 161; i++) store.addDeckThreadMessage(project.id, thread.id, `Nota storica ${i}`, true)
const meta = { id: 'a'.repeat(64), fetchedAt: '2099-01-01T00:00:00Z', sourceUrl: 'https://limitlesstcg.com/decks',
  period: 'Fixture locale', circuit: 'WESTERN', format: 'STANDARD', cached: true,
  decks: [{ id: '1', name: 'Avversario storico', points: 1, share: 1, url: 'https://limitlesstcg.com/decks/1' }] }
store.saveMetaSnapshot(meta)
const report = { projectId: project.id, metaId: meta.id, opponentId: '1', deckHash: store.getCurrentDeckHash(project.id),
  deckVersionId: baseline.versionId, deckResolutionId: baseline.resolutionId,
  generatedAt: '2026-10-29T00:00:00Z', sampleDeckUrl: null,
  strengths: 'Risorse disponibili', weaknesses: 'Risorse limitate', ourKeyCards: 'Carte nostre', theirKeyCards: 'Carte avversarie',
  strategy: 'Piano iniziale', limitations: 'Fixture, nessuna analisi Codex.' }
for (let i = 0; i < 137; i++) store.saveMatchupReport({ ...report, strategy: `Piano corrente ${i}` })
const currentId = store.listMatchupDiscussionPage(project.id, '1').currentId
for (let i = 1; i <= 55; i++) {
  const metaId = i.toString(16).padStart(64, '0')
  store.saveMetaSnapshot({ ...meta, id: metaId, fetchedAt: '2020-01-01T00:00:00Z' })
  store.saveMatchupReport({ ...report, metaId, strategy: `Piano storico ${i}` })
}
store.close()
const fixtureDb = new DatabaseSync(path)
fixtureDb.exec('PRAGMA user_version = 16')
fixtureDb.close()
console.log('History fixture: ready')
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0',
    POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') }, timeout: 30000 })
async function configure() {
  // Only the external metagame fetch is replaced. Histories use real IPC/worker/SQLite.
  await application.evaluate(({ ipcMain }, meta) => {
    ipcMain.removeHandler('matchups:get-meta'); ipcMain.handle('matchups:get-meta', () => ({ ok: true, value: meta }))
  }, meta)
}
try {
  application = await launch()
  let page = await application.firstWindow()
  await configure()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  console.log('History UI: versions')
  await page.locator('.deck-history > summary').click()
  assert.equal(await page.locator('#deck-history-version option').count(), 50)
  await page.getByRole('button', { name: 'Carica versioni precedenti', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('#deck-history-version option').length === 100)
  await page.getByRole('button', { name: 'Carica versioni precedenti', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('#deck-history-version option').length === 131)
  const oldest = await page.locator('#deck-history-version option').last().getAttribute('value')
  await page.locator('#deck-history-version').selectOption(oldest)
  await page.getByLabel('Etichetta', { exact: true }).fill('Prima versione annotata')
  await page.getByRole('button', { name: 'Salva etichetta e nota' }).click()
  await page.waitForFunction(() => document.querySelector('#deck-history-version').selectedOptions[0].textContent.includes('Prima versione annotata'))
  assert.equal(await page.locator('#deck-history-version option').count(), 131)
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Strategie', exact: true }).click()
  console.log('History UI: candidates')
  await page.locator('.thread-candidate.featured').waitFor()
  const window = await page.evaluate(async ({ projectId, threadId }) => (await window.projectsApi.getDeckThreadWindow(projectId, threadId)).value,
    { projectId: project.id, threadId: thread.id })
  assert.equal(window.candidates.length, 50); assert.equal(window.candidateCount, 131)
  for (let i = 0; i < 30 && await page.getByRole('button', { name: /^Mostra \d+ precedenti/ }).count(); i++) {
    await page.getByRole('button', { name: /^Mostra \d+ precedenti/ }).click()
    await page.waitForFunction(() => !document.querySelector('.thread-timeline button[aria-busy="true"]'))
  }
  assert.equal(await page.locator('.thread-candidate').count(), 131)
  assert.equal(await page.locator('.thread-message').count(), 161)
  assert.equal(await page.locator('.thread-message').evaluateAll((items) => new Set(items.map((item) => item.textContent)).size), 161)
  await page.getByRole('navigation', { name: 'Aree del progetto' }).getByRole('button', { name: 'Guide matchup', exact: true }).click()
  console.log('History UI: current guide')
  await page.getByText('Piano corrente 136', { exact: true }).waitFor()
  assert.match(await page.locator('.discussion-latest').innerText(), /Revisione 136/)
  await page.locator('.discussion-history > summary').click()
  assert.equal(await page.locator('.discussion-history-item').count(), 19)
  for (let i = 0; i < 7 && await page.getByRole('button', { name: 'Carica revisioni precedenti' }).count(); i++) {
    await page.getByRole('button', { name: 'Carica revisioni precedenti' }).click()
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((item) => item.textContent === 'Caricamento…'))
  }
  assert.equal(await page.locator('.discussion-history-item').count(), 136)
  console.log('History UI: revisions loaded')
  for (const [width, height] of [[1280, 900], [640, 720]]) {
    await page.setViewportSize({ width, height })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await page.getByRole('button', { name: /^Storico 1$/ }).click()
  await page.getByText('Piano storico 55', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Base attuale', exact: true }).click()
  await page.getByText('Piano corrente 136', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Carica basi precedenti' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.discussion-switcher button').length >= 41)
  await page.getByRole('button', { name: 'Carica basi precedenti' }).click()
  await page.waitForFunction(() => document.querySelectorAll('.discussion-switcher button').length === 56)
  assert.deepEqual(errors, [])
  await application.close(); application = undefined
  const db = new DatabaseSync(path, { readOnly: true })
  assert.equal(db.prepare('SELECT count(*) AS n FROM matchup_turns WHERE discussion_id = ?').get(currentId).n, 137)
  assert.equal(db.prepare('SELECT label FROM deck_version_annotations WHERE version_id = ?').get(oldest).label, 'Prima versione annotata')
  db.close()
  application = await launch(); page = await application.firstWindow(); await configure(); page.setDefaultTimeout(15000)
  await page.locator('#main-content[data-nav-loading="false"]').waitFor()
  const reopened = await page.evaluate(async ({ projectId, id }) => (await window.projectsApi.getMatchupDiscussionWindow(projectId, id)).value,
    { projectId: project.id, id: currentId })
  assert.equal(reopened.turnCount, 137); assert.equal(reopened.turns.length, 20)
  console.log('HISTORY UI OK: 131 versions/candidates, 161 messages, 56 bases, 137 revisions; old annotation, current base outside page, 1280/640, reopen; real SQLite/IPC, fixture meta.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) || !basename(temporary).startsWith('pokeguru-history-ui-'))
    throw new Error('Unexpected temporary path')
  rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
