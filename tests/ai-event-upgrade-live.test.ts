import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication } from 'playwright-core'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { TournamentStore } from '../src/main/tournament-store'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { sharedEventList } from './fixtures/shared-event-list'

const require = createRequire(import.meta.url)

// Requires an unmodified v0.3.5 Electron build and an isolated authenticated CODEX_HOME.
it.skipIf(process.env.POKEGURU_EVENT_UPGRADE_LIVE !== '1')('resumes the same v0.3.5 failed opening turn after upgrade, with real Codex and all stored inputs intact', async () => {
  const oldApp = process.env.POKEGURU_OLD_APP
  if (!oldApp || !process.env.CODEX_HOME) throw new Error('Set POKEGURU_OLD_APP and isolated CODEX_HOME')
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-event-upgrade-')), profile = join(folder, 'profile')
  const file = join(profile, 'data', 'pokeguru.sqlite')
  let app: ElectronApplication | undefined
  const launch = async (target: string) => {
    app = await electron.launch({ executablePath: require('electron'), args: [target], cwd: resolve('.'),
      env: { ...process.env, POKEGURU_DATA_DIR: profile, POKEGURU_AUTO_SYNC: '0' }, timeout: 30_000 })
    const page = await app.firstWindow()
    await page.waitForFunction(() => !!window.projectsApi)
    return page
  }
  const savedInputs = (jobId: string) => {
    const db = new DatabaseSync(file, { readOnly: true })
    try { return db.prepare('SELECT role, key, object_hash FROM ai_evidence_values WHERE job_id = ? ORDER BY role, key').all(jobId) }
    finally { db.close() }
  }
  try {
    await launch(oldApp)
    expect(await app!.evaluate(({ app }) => app.getVersion())).toBe('0.3.5')
    await app!.close(); app = undefined
    const projects = new ProjectStore(file), tournaments = new TournamentStore(file)
    const question = 'Prova tecnica: discuti brevemente le partecipazioni a Shared deck nelle prove locali. Sono dati sintetici, non un mazzo competitivo. Non proporre una lista.'
    const project = projects.create({ name: 'Upgrade regression', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Shared deck', openingNote: question, startWithAi: true })
    const other = projects.create({ name: 'Unaffected project', format: 'STANDARD' })
    const otherThread = projects.createDeckThread({ projectId: other.id, title: 'Preserved', openingNote: 'Keep this saved message.' })
    tournaments.saveMain(sharedEventList(), true)
    tournaments.close(); projects.close()
    let page = await launch(oldApp)
    const failed = await page.evaluate(([owner, resource, text, opening]) =>
      window.projectsApi.askDeckThread(owner, resource, text, undefined, opening),
    [project.id, thread.id, question, thread.openingAiMessageId!])
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining('UNIQUE constraint failed: ai_evidence_event_index.job_id, ai_evidence_event_index.key') })
    const status = async () => {
      const result = await page.evaluate(([owner, resource]) => window.projectsApi.getAiJobStatus(owner, resource), [project.id, thread.id])
      if (!result.ok) throw new Error(result.error)
      return result.value
    }
    const interrupted = await status()
    expect(interrupted).toMatchObject({ status: 'interrupted', progress: { diagnostics: { resumable: true } } })
    await app!.close(); app = undefined
    const originalInputs = savedInputs(interrupted!.id)
    expect(originalInputs.length).toBeGreaterThanOrEqual(5)
    const before = new ProjectStore(file)
    try { expect(before.getDeckThread(project.id, thread.id)?.messages).toEqual(thread.messages) }
    finally { before.close() }
    page = await launch('.')
    expect((await status())?.id).toBe(interrupted!.id)
    expect((await page.evaluate(([owner, resource]) => window.projectsApi.resumeAiJob(owner, resource), [project.id, thread.id])).ok).toBe(true)
    await expect.poll(async () => {
      const job = await status()
      if (job?.status === 'interrupted' || job?.status === 'failed') throw new Error(job.error ?? 'Resume failed')
      return job?.status
    }, { timeout: 240_000, interval: 1000 }).toBe('applied')
    await app!.close(); app = undefined
    const after = new ProjectStore(file)
    try {
      const resumed = after.getDeckThread(project.id, thread.id)!
      expect(resumed.messages).toHaveLength(2)
      expect(resumed.messages[0]).toEqual(thread.messages[0])
      expect(resumed.messages[1].author).toBe('assistant')
      expect(resumed.messages[1].text.length).toBeGreaterThan(0)
      expect(after.getDeckThread(other.id, otherThread.id)).toEqual(otherThread)
    } finally { after.close() }
    expect(savedInputs(interrupted!.id)).toEqual(expect.arrayContaining(originalInputs))
    const archive = new AiEvidenceArchive(file, interrupted!, true)
    try {
      expect(archive.counts().occurrences).toBe(4)
      expect([...archive.deckStatistics()][0].occurrences).toBe(4)
    } finally { archive.close() }
    page = await launch('.')
    expect(await status()).toMatchObject({ id: interrupted!.id, status: 'applied' })
    await app!.close(); app = undefined
    const final = new ProjectStore(file)
    try { expect(final.getDeckThread(project.id, thread.id)?.messages).toHaveLength(2) }
    finally { final.close() }
  } finally { await app?.close(); rmSync(folder, { recursive: true, force: true }) }
}, 300_000)
