import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, switchProject, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-ai-workflow-'))
const jobId = '00000000-0000-4000-8000-000000000159'
const directory = join(temporary, 'data', 'ai-jobs', jobId)
let application
async function launch() {
  return electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
    env: { ...process.env, POKEGURU_DATA_DIR: temporary, POKEGURU_AUTO_SYNC: '0',
      POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') }, timeout: 30000 })
}

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Ripresa analisi')
  const fixture = await page.evaluate(async () => {
    const project = (await window.projectsApi.list()).value[0]
    const imported = await window.projectsApi.importDeck({ projectId: project.id,
      rawText: '60 Carta A MEG 1', source: 'paste' })
    if (!imported.ok) throw new Error(imported.error)
    const thread = await window.projectsApi.createDeckThread({ projectId: project.id, title: 'Analisi lunga' })
    if (!thread.ok) throw new Error(thread.error)
    const other = await window.projectsApi.create({ name: 'Altro progetto', format: 'STANDARD' })
    return { projectId: project.id, threadId: thread.value.id, otherId: other.value.id }
  })
  await application.close()
  application = null
  // A pre-snapshot workflow cannot be automatically reconstructed with newer data.
  mkdirSync(directory, { recursive: true })
  const workflow = { kind: 'thread-ask', args: [fixture.projectId, fixture.threadId, 'Valuta questa idea', null, null] }
  writeFileSync(join(directory, 'workflow.json'), JSON.stringify(workflow))
  writeFileSync(join(directory, 'checkpoint-preserved.json'), '{"completed":true}')
  const db = new DatabaseSync(join(temporary, 'data', 'pokeguru.sqlite'))
  const at = new Date().toISOString()
  db.prepare(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status, created_at, updated_at,
    progress_json) VALUES (?, 'thread-ask', ?, ?, 'running', ?, ?, ?)`)
    .run(jobId, fixture.projectId, fixture.threadId, at, at, JSON.stringify({ phase: 'analysis',
      detail: 'Analisi estesa', summary: null, updatedAt: at, steps: [],
      diagnostics: { workflow: true, batchesCompleted: 2, batchesTotal: 5 } }))
  db.close()
  application = await launch()
  page = await application.firstWindow()
  await switchProject(page, /Ripresa analisi/)
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await switchThread(page, /Analisi lunga/)
  await page.getByText('Analisi precedente senza tutti gli input salvati.', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Riprendi analisi', exact: true }).count(), 0)
  const status = () => page.evaluate(async ({ projectId, threadId }) =>
    (await window.projectsApi.getAiJobStatus(projectId, threadId)).value, fixture)
  let job = await status()
  assert.equal(job.id, jobId)
  assert.equal(job.status, 'interrupted')
  assert.equal(job.progress.diagnostics.suspensionReason, 'legacy')
  assert.equal(job.progress.diagnostics.batchesCompleted, 2)
  assert.equal(job.progress.diagnostics.calls, undefined, 'restart must not spend an AI call')
  assert.equal(existsSync(join(directory, 'checkpoint-preserved.json')), true)
  const foreign = await page.evaluate(async ({ otherId, threadId }) =>
    window.projectsApi.resumeAiJob(otherId, threadId), fixture)
  assert.equal(foreign.ok, false)
  // Even a malformed local sidecar cannot redirect a job into another project.
  writeFileSync(join(directory, 'workflow.json'), JSON.stringify({ ...workflow,
    args: [fixture.otherId, ...workflow.args.slice(1)] }))
  const mismatch = await page.evaluate(async ({ projectId, threadId }) =>
    window.projectsApi.resumeAiJob(projectId, threadId), fixture)
  assert.equal(mismatch.ok, false)
  writeFileSync(join(directory, 'workflow.json'), JSON.stringify(workflow))
  const legacy = await page.evaluate(async ({ projectId, threadId }) =>
    window.projectsApi.resumeAiJob(projectId, threadId), fixture)
  assert.equal(legacy.ok, false)
  job = await status()
  assert.equal(job.id, jobId)
  assert.equal(job.status, 'interrupted')
  assert.equal(job.progress.diagnostics.resumable, true)
  assert.equal(existsSync(join(directory, 'checkpoint-preserved.json')), true)
  const threads = await page.evaluate(async ({ projectId }) =>
    (await window.projectsApi.listDeckThreads(projectId)).value, fixture)
  assert.equal(threads[0].messages.length, 0)
  await page.getByRole('button', { name: 'Annulla analisi', exact: true }).click()
  await page.getByText('Risposta annullata.', { exact: false }).waitFor()
  assert.equal((await status()).status, 'cancelled')
  assert.equal(existsSync(directory), false)
  assert.equal(await page.getByLabel('Scrivi nella strategia').isEditable(), true)
  console.log('E2E legacy workflow OK: missing snapshot recognized, project isolation, checkpoint preservation, cancellation.')
} finally {
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-ai-workflow-')) throw new Error('Unsafe cleanup path')
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
