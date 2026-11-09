import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync, backup } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

// Reads an explicitly supplied test DB. Source data are never changed; no AI is invoked.
const require = createRequire(import.meta.url), workspace = resolve(import.meta.dirname, '..')
const sourcePath = resolve(process.env.POKEGURU_GUIDE_DB ?? '.verify/app190-integration/live/data.sqlite')
assert.ok(sourcePath.startsWith(join(workspace, '.verify')), 'Use an isolated verification database')
const output = resolve(process.env.POKEGURU_GUIDE_UI_OUTPUT ?? '.verify/app190-integration/ui')
assert.ok(output.startsWith(join(workspace, '.verify')), 'Use an isolated verification output')
mkdirSync(output, { recursive: true })
const profile = mkdtempSync(join(output, 'profile-'))
mkdirSync(join(profile, 'data'))
const source = new DatabaseSync(sourcePath, { readOnly: true })
try { await backup(source, join(profile, 'data', 'pokeguru.sqlite')) } finally { source.close() }
const db = new DatabaseSync(join(profile, 'data', 'pokeguru.sqlite'))
const expectedJobId = process.env.POKEGURU_GUIDE_JOB_ID
const row = expectedJobId
  ? db.prepare("SELECT payload FROM matchup_reports WHERE json_extract(payload, '$.jobId') = ?").get(expectedJobId)
  : db.prepare('SELECT payload FROM matchup_reports LIMIT 1').get()
assert.ok(row, 'A validated generated guide is required')
const report = JSON.parse(row.payload)
if (expectedJobId) assert.equal(report.jobId, expectedJobId, 'UI must show this exact generated job')
assert.equal(report.guide.formatVersion, 1)
const meta = JSON.parse(db.prepare('SELECT payload FROM meta_snapshots WHERE id = ?').get(report.metaId).payload)
const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(report.projectId)
// Add a legacy history entry to exercise both readers in the same actual SQLite/IPC path.
const discussion = db.prepare('SELECT id FROM matchup_discussions WHERE project_id = ? LIMIT 1').get(report.projectId)
const first = db.prepare('SELECT id, report_payload FROM matchup_turns WHERE discussion_id = ? ORDER BY turn_no LIMIT 1').get(discussion.id)
const legacy = { ...report, guide: undefined, strategyPhases: undefined, strategy: 'Piano storico conservato integralmente per la prova di compatibilità.' }
if (!db.prepare('SELECT id FROM matchup_turns WHERE id = ?').get('legacy-ui')) {
  // Preserve every native historical version in the copied verification DB.
  for (const turn of db.prepare('SELECT id, turn_no FROM matchup_turns WHERE discussion_id = ? ORDER BY turn_no DESC').all(discussion.id))
    db.prepare('UPDATE matchup_turns SET turn_no = ? WHERE id = ?').run(turn.turn_no + 1, turn.id)
  db.prepare('INSERT INTO matchup_turns (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary) VALUES (?, ?, 0, NULL, ?, ?, NULL)')
    .run('legacy-ui', discussion.id, report.generatedAt, JSON.stringify(legacy))
}
db.close()
let app
try {
  app = await electron.launch({ executablePath: process.env.POKEGURU_TEST_ELECTRON ?? require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0' } })
  const page = await app.firstWindow(), errors = []
  page.on('pageerror', error => errors.push(String(error)))
  // Freeze the public Meta response; all guide/history reads are the real backend.
  await app.evaluate(({ ipcMain }, snapshot) => {
    ipcMain.removeHandler('matchups:get-meta')
    ipcMain.handle('matchups:get-meta', () => ({ ok: true, value: { ...snapshot, cached: true } }))
  }, meta)
  await page.locator('#project-switcher-trigger').click()
  await page.getByRole('dialog', { name: 'Scegli progetto' }).getByRole('button').filter({ hasText: project.name }).first().click()
  await page.getByRole('button', { name: 'Guide matchup', exact: true }).click()
  await page.locator('.deep-matchup-guide').first().waitFor()
  const guide = page.locator('.strategy-field .deep-matchup-guide')
  assert.equal(await guide.locator('.deep-guide-chapter').count(), report.guide.chapters.length + 3)
  assert.equal(await guide.locator('.deep-guide-scenario').count(), report.guide.scenarios.length)
  const exercise = guide.locator('.deep-guide-exercise').first()
  assert.equal(await exercise.locator('details').getAttribute('open'), null)
  await exercise.locator('summary').click()
  assert.ok(await exercise.locator('details').getAttribute('open') !== null)
  const input = page.getByLabel('Aggiungi un’osservazione')
  if (await input.count()) await input.fill('Bozza da conservare navigando nei capitoli.')
  await guide.getByRole('button', { name: 'Scenari commentati', exact: true }).click()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Scenari commentati')
  if (await input.count()) assert.equal(await input.inputValue(), 'Bozza da conservare navigando nei capitoli.')
  for (const [width, height] of [[1440, 900], [1280, 800], [640, 720]]) {
    await page.setViewportSize({ width, height })
    await guide.getByRole('button', { name: report.guide.chapters[0].title, exact: true }).click()
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.main-content')
      return el.scrollWidth > el.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1
    })
    assert.equal(overflow, false, `Overflow at ${width}`)
    await page.screenshot({ path: join(output, `guide-${width}.png`) })
  }
  await page.locator('.discussion-history > summary').click()
  const historical = page.locator('.discussion-version').filter({ hasText: 'Piano storico conservato' }).first()
  await historical.locator(':scope > summary').click()
  assert.match(await historical.locator('.legacy-plan').innerText(), /conservato integralmente/)
  assert.equal(errors.length, 0, errors.join('\n'))
  const current = await page.evaluate(async ({ projectId, metaId }) => window.projectsApi.listMatchupReports(projectId, metaId), report)
  assert.equal(current.ok, true)
  assert.equal(current.value[0].guide.basis.dependencyHash, report.guide.basis.dependencyHash)
  writeFileSync(join(output, 'result.json'), JSON.stringify({ passed: true, viewports: [1440, 1280, 640],
    chapters: report.guide.chapters.length, scenarios: report.guide.scenarios.length, rendererErrors: errors, profile }, null, 2))
} finally { if (app) await app.close() }
