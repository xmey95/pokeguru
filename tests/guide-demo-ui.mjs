import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { prepareGuideDemo, demoEnvironment, demoElectronExecutable, workspace } from '../scripts/guide-demo.mjs'
import { createProjectFromStart } from './project-ui-helper.mjs'

const output = resolve('.verify/app258-demo-20261107/ui')
mkdirSync(output, { recursive: true })
const prepared = await prepareGuideDemo(join(output, 'profiles'))
const { profile, manifest, evidence } = prepared
const errors = [], rows = []
const hash = (value) => createHash('sha256').update(value).digest('hex')
const database = join(profile, 'data', 'pokeguru.sqlite')
function callHistory() {
  const db = new DatabaseSync(database, { readOnly: true })
  try { return { jobs: db.prepare('SELECT * FROM ai_jobs ORDER BY id').all(), calls: db.prepare('SELECT * FROM ai_call_state ORDER BY key').all() } }
  finally { db.close() }
}
const before = callHistory()
let app
try {
  app = await electron.launch({ executablePath: demoElectronExecutable(), args: ['.'], cwd: workspace, env: demoEnvironment(profile) })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.getByRole('region', { name: 'Demo offline del pilota' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Impostazioni AI', exact: true }).count(), 0)
  for (const guide of manifest.guides) {
    await page.getByRole('button', { name: guide.title, exact: true }).click()
    const content = page.locator('.strategy-field .deep-matchup-guide')
    await content.waitFor()
    const chapterSections = await content.locator('.deep-guide-chapter').count()
    assert.equal(chapterSections, 11, 'Eight chapters plus scenarios, exercises and sources')
    const frozen = JSON.parse(readFileSync(join(dirname(evidence[manifest.guides.indexOf(guide)].sourcePath), 'generated.json'), 'utf8'))
    for (const scenario of frozen.guide.scenarios) await content.getByRole('heading', { name: scenario.title, exact: true }).waitFor()
    const result = await page.evaluate(async ({ projectId, opponentId }) => {
      const history = await window.projectsApi.listMatchupDiscussionPage(projectId, opponentId)
      return history
    }, guide)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(await content.locator('.deep-guide-scenario').count(), 2)
    assert.equal(await page.getByRole('button', { name: 'Rigenera guida', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Aggiorna guida', exact: true }).count(), 0)
    const exercise = content.locator('.deep-guide-exercise').first()
    await exercise.locator('summary').click()
    assert.notEqual(await exercise.locator('details').getAttribute('open'), null)
    for (const [width, height] of [[1440, 900], [1280, 800], [640, 900]]) {
      await page.setViewportSize({ width, height })
      await content.getByRole('button', { name: 'Scenari commentati', exact: true }).click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.main-content').scrollWidth > document.querySelector('.main-content').clientWidth + 1), false, `Overflow ${guide.title} ${width}`)
      await page.screenshot({ path: join(output, `${guide.projectId}-${width}.png`) })
      await page.locator('.main-content').evaluate((el) => { el.scrollTop = 0 })
      await page.screenshot({ path: join(output, `${guide.projectId}-start-${width}.png`) })
    }
    await page.getByRole('button', { name: 'Lista', exact: true }).click()
    await page.locator('[data-testid="baseline-panel"]').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Importa / sostituisci', exact: true }).count(), 0)
    const baseline = await page.evaluate((id) => window.projectsApi.getBaseline(id), guide.projectId)
    assert.equal(baseline.ok, true)
    assert.equal(baseline.value.interpretedTotal, 60)
    rows.push({ title: guide.title, chapters: chapterSections - 3, scenarios: 2, baseline: 60 })
  }
  const blocked = await page.evaluate(async ({ projectId, metaId, opponentId }) => {
    const api = window.projectsApi
    return await Promise.all([
      api.generateMatchup(projectId, metaId, opponentId), api.resumeAiJob(projectId, opponentId),
      api.recoverAiJobs(), api.getAiConnection(), api.create({ name: 'Forbidden', format: 'STANDARD' }),
      api.syncCatalog(), api.openLimitless('https://limitlesstcg.com/decks')
    ])
  }, manifest.guides[0])
  for (const result of blocked) { assert.equal(result.ok, false); assert.match(result.error, /Demo offline/) }
  assert.deepEqual(callHistory(), before, 'No attempts, grants or recovery may change call history')
  await app.close(); app = null
  // Reopen the exact same prepared profile through the production backend.
  app = await electron.launch({ executablePath: demoElectronExecutable(), args: ['.'], cwd: workspace, env: demoEnvironment(profile) })
  const reopened = await app.firstWindow()
  reopened.on('pageerror', (error) => errors.push(String(error)))
  await reopened.getByRole('region', { name: 'Demo offline del pilota' }).waitFor()
  await reopened.locator('.deep-matchup-guide').first().waitFor()
  assert.deepEqual(callHistory(), before)
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    for (const [index, g] of manifest.guides.entries()) {
      const saved = db.prepare('SELECT payload FROM matchup_reports WHERE project_id = ? AND opponent_id = ?').get(g.projectId, g.opponentId)
      assert.equal(hash(JSON.stringify(JSON.parse(saved.payload).guide)), evidence[index].guideHash, 'Guide content and approvals remain original')
    }
  } finally { db.close() }
  for (const source of evidence) assert.equal(hash(readFileSync(source.sourcePath)), source.sourceHash, 'Source archive unchanged')
  await app.close(); app = null
  // Normal mode stays writable; exercise the real App/preload/backend path on
  // another empty profile, with startup sync off and no AI or meta view opened.
  const normalProfile = join(output, 'normal-profile-' + Date.now())
  mkdirSync(normalProfile)
  const normalEnv = demoEnvironment(normalProfile)
  delete normalEnv.POKEGURU_DEMO
  app = await electron.launch({ executablePath: demoElectronExecutable(), args: ['.'], cwd: workspace, env: normalEnv })
  const normalPage = await app.firstWindow()
  normalPage.on('pageerror', (error) => errors.push(String(error)))
  await createProjectFromStart(normalPage, 'Prova regressione modalità normale')
  await normalPage.getByTestId('selected-project-name').filter({ hasText: 'Prova regressione modalità normale' }).waitFor()
  assert.equal(await normalPage.evaluate(() => window.demoApi.getInfo()), null)
  assert.equal(await normalPage.getByRole('region', { name: 'Demo offline del pilota' }).count(), 0)
  assert.deepEqual(errors, [])
  writeFileSync(join(output, 'result.json'), JSON.stringify({ passed: true, realCalls: 0, profile, rows, blocked: blocked.length, viewports: [1440, 1280, 640], reopened: true, normalModeWritable: true, errors }, null, 2))
} catch (error) {
  if (app) {
    const page = await app.firstWindow()
    await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
    writeFileSync(join(output, 'failure.txt'), await page.locator('body').innerText())
  }
  throw error
} finally { if (app) await app.close() }
