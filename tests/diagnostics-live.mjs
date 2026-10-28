import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-diagnostics-'))
const reportPath = join(temporary, 'report.json')
const privateName = 'PRIVATE-PROJECT-NAME-DO-NOT-EXPORT'
let application

try {
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: temporary, POKEGURU_AUTO_SYNC: '0' }, timeout: 30000 })
  const page = await application.firstWindow()
  const created = await page.evaluate((name) => window.projectsApi.create({ name, format: 'STANDARD' }), privateName)
  assert.equal(created.ok, true)
  const createdAt = new Date(Date.now() - 15 * 60_000).toISOString()
  const updatedAt = new Date(Date.now() - 14 * 60_000).toISOString()
  const db = new DatabaseSync(join(temporary, 'data', 'pokeguru.sqlite'))
  try {
    db.prepare(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status,
      created_at, updated_at, progress_json) VALUES (?, 'thread-ask', ?, ?, 'running', ?, ?, ?)`)
      .run('00000000-0000-4000-8000-000000000157', created.value.id, privateName,
        createdAt, updatedAt, JSON.stringify({ phase: 'verification', detail: privateName,
          summary: privateName, updatedAt,
          steps: [{ phase: 'verification', detail: privateName, at: updatedAt }] }))
  } finally { db.close() }
  await page.evaluate(() => window.projectsApi.recordUiLongTask(123.4))
  await application.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, reportPath)
  await page.getByRole('button', { name: 'Impostazioni AI' }).click()
  const details = page.getByText('Assistenza e diagnostica', { exact: true })
  assert.equal(await page.getByRole('button', { name: 'Esporta diagnostica…' }).isVisible(), false)
  await details.click()
  await page.getByRole('button', { name: 'Esporta diagnostica…' }).click()
  await page.getByText('File salvato: report.json', { exact: false }).waitFor()
  assert.equal(existsSync(reportPath), true)
  const raw = readFileSync(reportPath, 'utf8')
  const report = JSON.parse(raw)
  assert.equal(report.schemaVersion, 3)
  assert.equal(report.projects.active, 1)
  assert.equal(report.ai.recentJobs[0].elapsedMs, Date.parse(report.generatedAt) - Date.parse(createdAt))
  assert.equal(report.ai.recentJobs[0].sinceLastUpdateMs, Date.parse(report.generatedAt) - Date.parse(updatedAt))
  assert.deepEqual(report.ai.recentJobs[0].progress, { phase: 'verification', updatedAt,
    steps: [{ phase: 'verification', at: updatedAt }] })
  assert.equal(raw.includes('00000000-0000-4000-8000-000000000157'), false)
  assert.equal(report.performance.uiLongTaskMaxMs >= 123, true)
  assert.equal(raw.includes(privateName), false)
  await application.close()
  application = null

  const damagedProfile = join(temporary, 'damaged-profile')
  mkdirSync(join(damagedProfile, 'data'), { recursive: true })
  writeFileSync(join(damagedProfile, 'data', 'pokeguru.sqlite'), 'not a SQLite database')
  const damagedReportPath = join(temporary, 'damaged-report.json')
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: damagedProfile, POKEGURU_AUTO_SYNC: '0' }, timeout: 30000 })
  const damagedPage = await application.firstWindow()
  await application.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, damagedReportPath)
  await damagedPage.getByRole('button', { name: 'Impostazioni AI' }).click()
  await damagedPage.getByText('Assistenza e diagnostica', { exact: true }).click()
  await damagedPage.getByRole('button', { name: 'Esporta diagnostica…' }).click()
  await damagedPage.getByText('File salvato: damaged-report.json', { exact: false }).waitFor()
  assert.equal(JSON.parse(readFileSync(damagedReportPath, 'utf8')).database.issue, 'integrity')
  console.log('E2E diagnostica OK: export discreto, dati privati esclusi, archivio danneggiato.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-diagnostics-'))
    throw new Error('Percorso temporaneo inatteso: pulizia interrotta.')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
