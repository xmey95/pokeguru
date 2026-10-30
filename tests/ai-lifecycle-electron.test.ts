import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { CatalogStore } from '../src/main/catalog'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { runAiEvidenceQueries, threadEvidenceWithQueries } from '../src/main/ai-evidence-queries'
import { buildThreadEvidence } from '../src/main/thread-evidence'
import { deckThreadPrompt } from '../src/main/deck-ai'
import { runThreadDecision } from '../src/main/ai-thread-decision'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }
const require = createRequire(import.meta.url)

it.skipIf(process.env.POKEGURU_LIFECYCLE_E2E !== '1')('resumes on Electron reopen, preserves voluntary pause and quota deadline, and applies cached results once', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-lifecycle-electron-')), profile = join(folder, 'profile')
  const file = join(profile, 'data', 'pokeguru.sqlite')
  let application: ElectronApplication | undefined
  const launch = async () => {
    application = await electron.launch({ executablePath: require('electron') as string, args: ['.'], cwd: resolve('.'),
      env: { ...process.env, CODEX_HOME: join(folder, 'codex-home'), POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0' }, timeout: 30_000 })
    const page = await application.firstWindow()
    await page.waitForFunction(() => !!window.projectsApi)
    return page
  }
  const status = (page: Page, projectId: string, resourceId: string) => page.evaluate(async ([project, resource]) => {
    const result = await window.projectsApi.getAiJobStatus(project, resource)
    if (!result.ok) throw new Error(result.error)
    return result.value
  }, [projectId, resourceId])
  try {
    await launch(); await application!.close(); application = undefined
    const projects = new ProjectStore(file), catalog = new CatalogStore(file), jobs = new AiJobStore(file)
    const project = projects.create({ name: 'Lifecycle test', format: 'STANDARD' })
    const other = projects.create({ name: 'Other project', format: 'STANDARD' })
    async function seed(name: string, reason: 'running' | 'shutdown' | 'user' | 'legacy' | 'wait', owner = project.id) {
      const thread = projects.createDeckThread({ projectId: owner, title: name })
      const job = jobs.start('thread-ask', owner, thread.id)
      const directory = join(profile, 'data', 'ai-jobs', job.id)
      const question = `Discussione di prova ${name}`
      if (reason === 'legacy') {
        mkdirSync(directory, { recursive: true })
        writeFileSync(join(directory, 'workflow.json'), JSON.stringify({ schemaVersion: 1, kind: 'thread-ask',
          args: [owner, thread.id, question, null, null] }))
      }
      const work = new AiAnalysisWork(directory, jobs, job.id, new AbortController().signal,
        { schemaVersion: name === 'crashed' ? 5 : 4, kind: 'thread-ask', args: [owner, thread.id, question, null, null] })
      try {
        work.snapshot('reference-date', [], () => '2026-10-28')
        work.snapshot('config', [], () => config)
        work.snapshot('thread-context', [], () => thread)
        work.snapshot('constraints', [], () => [])
        work.snapshot('base', [], () => null)
        const { engine, catalog: frozen } = createArchivedEvidenceEngine(work.archive, () => ({ catalog: catalog.view(),
          window: { from: '2026-10-01', to: '2026-10-28' }, play: [], main: [] }))
        const initial = work.snapshot('initial-evidence', [], () => buildThreadEvidence(thread, null, question, [], frozen, [], []))
        const trace = await runAiEvidenceQueries(question, initial, engine,
          async (_prompt, trace) => {
            if (name !== 'crashed') return { queries: [], continueAfterResults: false, uncertainty: '' }
            const packet = threadEvidenceWithQueries(initial, trace)
            const context = deckThreadPrompt(thread, null, question, [], frozen, packet, '2026-10-28')
            return runThreadDecision(work, config, context, packet, trace, async () => ({
              sessionId: `session-${name}`, turnId: `turn-${name}`, usage: null,
              value: { action: 'answer', queries: [], continueAfterResults: false, uncertainty: '',
                answer: { kind: 'thought', reply: `Risultato conservato ${name}.`, rawText: '', sourceIds: [] } }
            }))
          }, { archive: work.archive })
        const evidence = threadEvidenceWithQueries(initial, trace)
        const context = deckThreadPrompt(thread, null, question, [], frozen, evidence, '2026-10-28')
        const key = createHash('sha256').update(JSON.stringify(['analysis', context.prompt, config])).digest('hex')
        if (reason === 'wait') jobs.saveCallState(job.id, key, { status: 'waiting', failures: 1, code: 'quota', nextAttemptAt: Date.now() + 3600_000 })
        else if (name !== 'crashed') await work.run('analysis', context.prompt, config, async () => ({ sessionId: `session-${name}`, turnId: `turn-${name}`,
          value: { kind: 'thought', reply: `Risultato conservato ${name}.`, rawText: '', sourceIds: [] }, usage: null }))
        if (reason !== 'running' && reason !== 'legacy') jobs.suspend(job.id, 'Fixture interrupted', reason === 'wait' ? 'shutdown' : reason)
        return { id: job.id, thread: thread.id, project: owner, key, directory }
      } finally { work.close() }
    }
    let seeds: Awaited<ReturnType<typeof seed>>[]
    try { seeds = [await seed('crashed', 'running'), await seed('closed', 'shutdown', other.id),
      await seed('paused', 'user'), await seed('legacy', 'legacy'), await seed('waiting', 'wait'), await seed('queued-pause', 'shutdown')] }
    finally { jobs.close(); catalog.close(); projects.close() }
    // Removing all temporary files must not remove the durable work or call cache.
    for (const item of seeds) rmSync(item.directory, { recursive: true, force: true })
    let page = await launch()
    for (const item of seeds.slice(0, 2)) {
      await expect.poll(async () => (await status(page, item.project, item.thread))?.status, { timeout: 30_000 }).toBe('applied')
      const result = await page.evaluate(async ([owner, threadId]) => {
        const response = await window.projectsApi.listDeckThreads(owner)
        if (!response.ok) throw new Error(response.error)
        return response.value.find((thread) => thread.id === threadId)?.messages
      }, [item.project, item.thread])
      expect(result).toHaveLength(2)
    }
    for (const item of seeds.slice(2, 4)) expect((await status(page, item.project, item.thread))?.status).toBe('interrupted')
    expect((await status(page, seeds[3].project, seeds[3].thread))?.progress?.diagnostics?.suspensionReason).toBe('legacy')
    const waiting = seeds[4]
    await expect.poll(async () => (await status(page, waiting.project, waiting.thread))?.progress?.diagnostics?.automaticWait,
      { timeout: 30_000 }).toBe(true)
    const queued = seeds[5]
    expect((await page.evaluate(([owner, resource]) => window.projectsApi.pauseAiJob(owner, resource), [queued.project, queued.thread])).ok).toBe(true)
    expect((await status(page, queued.project, queued.thread))?.progress?.diagnostics?.suspensionReason).toBe('user')
    const closed = application!.waitForEvent('close', { timeout: 15_000 })
    await page.close()
    await closed
    application = undefined
    const check = new AiJobStore(file)
    const deadline = check.callState(waiting.id, waiting.key)?.nextAttemptAt
    expect(check.get(waiting.id)?.progress?.diagnostics?.suspensionReason).toBe('shutdown')
    check.close()
    page = await launch()
    await expect.poll(async () => (await status(page, waiting.project, waiting.thread))?.progress?.diagnostics?.automaticWait,
      { timeout: 30_000 }).toBe(true)
    const paused = await page.evaluate(([owner, resource]) => window.projectsApi.pauseAiJob(owner, resource), [waiting.project, waiting.thread])
    expect(paused.ok).toBe(true)
    await expect.poll(async () => (await status(page, waiting.project, waiting.thread))?.progress?.diagnostics?.suspensionReason).toBe('user')
    await application!.close(); application = undefined
    page = await launch()
    expect((await status(page, waiting.project, waiting.thread))?.status).toBe('interrupted')
    const reopened = new AiJobStore(file), savedProjects = new ProjectStore(file)
    try {
      expect(reopened.callState(waiting.id, waiting.key)).toMatchObject({ failures: 1, nextAttemptAt: deadline })
      for (const item of seeds.slice(0, 2)) expect(savedProjects.getDeckThread(item.project, item.thread)?.messages).toHaveLength(2)
      expect(savedProjects.getDeckThread(other.id, seeds[0].thread)).toBeNull()
      expect(savedProjects.getDeckThread(queued.project, queued.thread)?.messages).toHaveLength(0)
      expect(reopened.get(queued.id)?.progress?.diagnostics?.suspensionReason).toBe('user')
    } finally { reopened.close(); savedProjects.close() }
    const created = await page.evaluate((owner) => window.projectsApi.createDeckThread({ projectId: owner, title: 'Storage failure' }), project.id)
    if (!created.ok) throw new Error(created.error)
    const fault = new DatabaseSync(file)
    try {
      // SQLite rejects both the progress write and the failure-status write.
      // The IPC still reports disk exhaustion without making a model call.
      fault.exec(`CREATE TRIGGER reject_job_progress BEFORE UPDATE OF progress_json ON ai_jobs
        BEGIN SELECT RAISE(ABORT, 'SQLITE_FULL simulated storage failure'); END`)
      const result = await page.evaluate(([owner, resource]) => window.projectsApi.askDeckThread(owner, resource, 'Test storage'),
        [project.id, created.value.id])
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('spazio su disco è esaurito') })
    } finally { fault.exec('DROP TRIGGER reject_job_progress'); fault.close() }
  } finally { await application?.close(); rmSync(folder, { recursive: true, force: true }) }
}, 180_000)
