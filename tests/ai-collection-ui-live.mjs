import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'
import { createProjectFromStart, switchThread } from './project-ui-helper.mjs'

const require = createRequire(import.meta.url)
// Run the production collection/persistence classes against the isolated app
// database. Only query results and the completed model answer are fixtures.
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename)
const { AiJobStore } = require('../src/main/ai-job-store.ts')
const { AiAnalysisWork } = require('../src/main/ai-analysis-work.ts')
const { collectArchivedEvidence } = require('../src/main/ai-evidence-collection.ts')
const { evidenceHash } = require('../src/main/ai-evidence-archive.ts')
const workspace = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'pokeguru-collection-ui-'))
const profile = join(temporary, 'profile')
let application, jobs, work
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.'], cwd: workspace,
  env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0',
    POKEGURU_CODEX_BIN: join(temporary, 'missing-codex') }, timeout: 30000 })

try {
  application = await launch()
  let page = await application.firstWindow()
  await createProjectFromStart(page, 'Collection test')
  const { projectId, threadId } = await page.evaluate(async () => {
    const projectId = (await window.projectsApi.list()).value[0].id
    const result = await window.projectsApi.createDeckThread({ projectId, title: 'Collection after batches' })
    if (!result.ok) throw new Error(result.error)
    return { projectId, threadId: result.value.id }
  })
  jobs = new AiJobStore(join(profile, 'data', 'pokeguru.sqlite'))
  const job = jobs.start('thread-ask', projectId, threadId)
  work = new AiAnalysisWork(join(profile, 'data', 'ai-jobs', job.id), jobs, job.id, new AbortController().signal,
    { kind: 'thread-ask', args: [projectId, threadId, 'Fixture request', null, null] })
  jobs.updateProgress(job.id, 'analysis', 'Analisi estesa: 187 di 187 lotti completati e salvati.', 'Old batch summary')
  jobs.recordDiagnostics(job.id, { batchesCompleted: 187, batchesTotal: 187 })
  const config = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
  await work.run('batch', 'saved fixture batch', config, async () => ({ completed: true }))
  const engine = { execute(query) {
    const data = { offset: query.offset, remaining: 12 - query.offset - 1, totalMatches: 12,
      matches: [{ printId: `p${query.offset}`, name: `Fixture ${query.offset}` }] }
    return { query, data, status: 'ok', sourceIds: [`card:p${query.offset}`], fingerprint: evidenceHash(data) }
  } }
  await collectArchivedEvidence({ operation: 'catalog.search', terms: ['fixture'], limit: 1 }, engine, work.archive,
    { onProgress: (progress, force) => work.collecting(progress, force) })
  await page.getByRole('button', { name: 'Strategie', exact: true }).click()
  await switchThread(page, /Collection after batches/)
  const activity = page.locator('.ai-job-activity')
  await activity.getByText('Raccolgo le schede delle carte: 12 di 12 schede. Raccolta completata.', { exact: true }).first().waitFor()
  assert.equal(await activity.locator('.activity-heading strong').innerText(), 'Raccolta dei dati locali…')
  assert.match(await activity.locator('.ai-job-stages [data-state="current"]').innerText(), /Ricerche/)
  assert.equal(await activity.locator('.ai-job-summary').count(), 0)
  assert.match(await activity.locator('.ai-job-trace').innerText(), /187 su 187/)
  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await activity.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true)
    assert.equal(await activity.locator('.ai-job-stages > li').evaluateAll(elements =>
      elements.every(element => element.scrollWidth <= element.clientWidth + 1)), true)
    await page.screenshot({ path: join(workspace, '.verify', `app-174-collection-${width}.png`), fullPage: true })
  }
  // New actual progress must reach the poller without changing the job or old batches.
  jobs.updateProgress(job.id, 'planning', 'Valuto le nuove prove raccolte.')
  await activity.getByText('Valuto le nuove prove raccolte.', { exact: true }).first().waitFor()
  jobs.suspend(job.id, 'Analisi in pausa. Riprendi per continuare dai lotti salvati.', 'user')
  work.close(); work = null
  jobs.close(); jobs = null
  await application.close(); application = null
  application = await launch()
  page = await application.firstWindow()
  const saved = await page.evaluate(async ({ projectId, threadId }) =>
    (await window.projectsApi.getAiJobStatus(projectId, threadId)).value, { projectId, threadId })
  assert.equal(saved.id, job.id)
  assert.equal(saved.status, 'interrupted')
  assert.equal(saved.progress.diagnostics.suspensionReason, 'user')
  assert.equal(saved.progress.diagnostics.batchesCompleted, 187)
  assert.equal(saved.progress.diagnostics.collection.pages, 12)
  jobs = new AiJobStore(join(profile, 'data', 'pokeguru.sqlite'))
  jobs.resume(job.id)
  work = new AiAnalysisWork(join(profile, 'data', 'ai-jobs', job.id), jobs, job.id, new AbortController().signal)
  assert.deepEqual(await work.run('batch', 'saved fixture batch', config,
    async () => { throw new Error('Completed batch must not be repeated') }), { completed: true })
  console.log('Collection UI OK: real collector/store, phase and polling, history retained, 1280/640, pause/reopen and cached batch.')
} finally {
  work?.close(); jobs?.close()
  if (application) await application.close()
  if (realpathSync(dirname(temporary)) !== realpathSync(tmpdir()) ||
    !basename(temporary).startsWith('pokeguru-collection-ui-')) throw new Error('Unsafe cleanup path')
  rmSync(temporary, { recursive: true, force: true })
}
