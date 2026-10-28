import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { TournamentStore } from '../src/main/tournament-store'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import type { TournamentSnapshot } from '../src/shared/tournament'

const require = createRequire(import.meta.url)
it.skipIf(process.env.POKEGURU_WORKER_E2E !== '1')('keeps the window and renderer event loops responsive while capturing 12000 tournament decks', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'pokeguru-worker-responsive-')), file = join(profile, 'data', 'pokeguru.sqlite')
  let application: ElectronApplication | undefined
  const launch = async () => {
    application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: resolve('.'),
      env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0',
        POKEGURU_CODEX_BIN: join(profile, 'absent-codex') }, timeout: 30000 })
    return application.firstWindow()
  }
  try {
    await launch(); await application!.close(); application = undefined
    const projects = new ProjectStore(file), jobs = new AiJobStore(file), events = new TournamentStore(file)
    const project = projects.create({ name: 'Prova carico', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Preparazione pesante' })
    const job = jobs.start('thread-ask', project.id, thread.id)
    const work = new AiAnalysisWork(join(profile, 'data', 'ai-jobs', job.id), jobs, job.id, new AbortController().signal,
      { kind: 'thread-ask', args: [project.id, thread.id, 'Confronta Gardevoir', null, null] })
    work.snapshot('config', [], () => ({ provider: 'codex', model: null, reasoningEffort: null, source: 'global' }))
    const now = new Date().toISOString()
    const snapshot: TournamentSnapshot = { id: 'load-snapshot', eventId: 'load-event', fetchedAt: now,
      source: 'Limitless Play API', sourceUrl: 'https://play.limitlesstcg.com/tournament/load-event',
      publicUrl: 'https://play.limitlesstcg.com/tournament/load-event', name: 'Fixture carico', date: now.slice(0, 10),
      circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL', isOnline: true, reportedPlayers: 12000,
      phases: [], cached: true, coverage: { returnedParticipants: 12000, availableLists: 12000, invalidLists: 0, missingLists: 0, complete60Lists: 12000 },
      participations: Array.from({ length: 12000 }, (_, i) => ({ playerId: `p${i}`, playerName: `P${i}`, country: null,
        placing: i + 1, record: { wins: 3, losses: 1, ties: 1 }, deck: { id: 'gardevoir', name: 'Gardevoir' },
        listStatus: 'available', cardTotal: 60, cards: Array.from({ length: 15 }, (_, j) => ({
          category: 'pokemon', count: 4, name: `Fixture card ${i}-${j}`, set: 'SVI', number: String(j + 1) })) })) }
    events.save(snapshot)
    jobs.suspend(job.id, 'Fixture paused', 'user')
    work.close(); events.close(); jobs.close(); projects.close()
    const page = await launch()
    await page.getByTestId('selected-project-name').waitFor()
    await application!.evaluate(() => {
      const sample = { last: performance.now(), max: 0, ticks: 0 }
      ;(globalThis as any).workerSample = sample
      ;(globalThis as any).workerTimer = setInterval(() => {
        const now = performance.now(); sample.max = Math.max(sample.max, now - sample.last); sample.last = now; sample.ticks++
      }, 20)
    })
    await page.evaluate(([projectId, threadId]) => {
      const sample = { last: performance.now(), max: 0, ticks: 0 }
      ;(window as any).workerSample = sample
      const tick = () => { const now = performance.now(); sample.max = Math.max(sample.max, now - sample.last); sample.last = now; sample.ticks++; requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
      void window.projectsApi.resumeAiJob(projectId, threadId).then(value => { (window as any).resumeResult = value })
    }, [project.id, thread.id])
    await page.locator('#project-switcher-trigger').click()
    await page.getByLabel('Cerca progetti').fill('Prova')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => (window as any).resumeResult, null, { timeout: 60000 })
    // Wait for the genuine heavy capture to finish before checking responsiveness.
    await expect.poll(async () => {
      const archive = new AiEvidenceArchive(file, job)
      try { return !!archive.value('snapshot', 'sources') } finally { archive.close() }
    }, { timeout: 60000 }).toBe(true)
    const main = await application!.evaluate(() => { clearInterval((globalThis as any).workerTimer); return (globalThis as any).workerSample })
    const renderer = await page.evaluate(() => (window as any).workerSample)
    console.log('Worker capture responsiveness', { main, renderer })
    expect(main.ticks).toBeGreaterThan(10)
    expect(main.max).toBeLessThan(750)
    expect(renderer.max).toBeLessThan(750)
    const archive = new AiEvidenceArchive(file, job)
    try { expect(archive.eventPage({ from: now.slice(0, 10), to: now.slice(0, 10), deck: '', card: '', offset: 0, limit: 1 }).matchingLists).toBe(12000) }
    finally { archive.close() }
  } finally { if (application) await application.close(); rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
}, 120000)
