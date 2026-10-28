import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { aiJobInterruptionText, aiJobWaitingText, canResumeAiJob } from '../src/shared/ai-job-lifecycle'

it('restores only shutdown jobs, preserves user pauses, and resets transient budgets only after explicit intervention', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-lifecycle-')), path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  let jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Lifecycle', format: 'STANDARD' })
    const other = projects.create({ name: 'Other', format: 'STANDARD' })
    const states = ['shutdown', 'user', 'failure', 'legacy'] as const
    const ids = states.map((reason, i) => {
      const job = jobs.start('thread-ask', i === 1 ? other.id : project.id, reason)
      jobs.updateProgress(job.id, 'analysis', 'Prova')
      jobs.suspend(job.id, 'Saved', reason)
      return job.id
    })
    jobs.saveCallState(ids[2], 'quota', { status: 'blocked', failures: 3, code: 'quota' })
    jobs.saveCallState(ids[2], 'context', { status: 'blocked', failures: 1, code: 'context-limit' })
    jobs.close(); jobs = new AiJobStore(path)
    expect(jobs.automaticResumable().map((job) => job.id)).toEqual([ids[0]])
    expect(jobs.get(ids[1])?.projectId).toBe(other.id)
    expect(aiJobInterruptionText(jobs.get(ids[1])!)).toContain('tua richiesta')
    expect(canResumeAiJob(jobs.get(ids[3])!)).toBe(false)
    expect(jobs.callState(ids[2], 'quota')?.failures).toBe(3)
    jobs.retryAfterIntervention(ids[2])
    expect(jobs.callState(ids[2], 'quota')).toBeUndefined()
    expect(jobs.callState(ids[2], 'context')?.failures).toBe(1)
    jobs.recordDiagnostics(ids[2], { failureCode: 'context-limit' })
    expect(canResumeAiJob(jobs.get(ids[2])!)).toBe(false)
    jobs.resume(ids[0])
    jobs.recordDiagnostics(ids[0], { automaticWait: true, nextRetryAt: '2026-10-28T12:00:00.000Z' })
    expect(aiJobWaitingText(jobs.get(ids[0])!)).toContain('Attesa automatica')
    jobs.suspend(ids[0], 'Voluntary pause', 'user')
    expect(aiJobWaitingText(jobs.get(ids[0])!)).toBeNull()
    expect(jobs.automaticResumable()).toEqual([])
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('keeps a completed guide and feedback on their exact historical version after list and meta changes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-historical-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file)
  try {
    const project = projects.create({ name: 'Historical', format: 'STANDARD' })
    const other = projects.create({ name: 'Other', format: 'STANDARD' })
    projects.importDeck({ projectId: project.id, rawText: '2 Carta A MEG 1', source: 'paste' })
    projects.importDeck({ projectId: other.id, rawText: '2 Carta B MEG 2', source: 'paste' })
    const context = projects.getCurrentDeckContext(project.id)!
    const meta = { id: 'a'.repeat(64), fetchedAt: '2026-10-28T00:00:00.000Z', sourceUrl: 'https://limitlesstcg.com/decks',
      circuit: 'WESTERN' as const, format: 'STANDARD' as const, period: 'Ultimo mese', cached: false,
      decks: [{ id: '284', name: 'Avversario', points: 100, share: 1, url: 'https://limitlesstcg.com/decks/284' }] }
    projects.saveMetaSnapshot(meta)
    const report = { projectId: project.id, metaId: meta.id, opponentId: '284', deckHash: projects.getCurrentDeckHash(project.id)!,
      deckVersionId: context.versionId, deckResolutionId: context.resolutionId, generatedAt: '2026-10-28T01:00:00.000Z',
      sampleDeckUrl: null, strengths: 'A', weaknesses: 'B', ourKeyCards: 'Carta A', theirKeyCards: '', strategy: 'Piano', limitations: '' }
    projects.saveMatchupReport(report)
    const discussion = projects.listMatchupDiscussions(project.id, '284')[0]
    const pending = projects.addMatchupFeedback(discussion.id, 'Rivedi il piano')
    projects.importDeck({ projectId: project.id, rawText: '3 Carta A MEG 1', source: 'paste' })
    projects.saveMetaSnapshot({ ...meta, id: 'b'.repeat(64), fetchedAt: '2026-10-28T02:00:00.000Z' })
    const revised = projects.completeMatchupFeedback(discussion.id, pending.turns.at(-1)!.id, { ...report, strategy: 'Revisione sulla base originale' }, 'Motivo')
    expect(revised.current).toBe(false)
    expect(revised.turns.at(-1)?.report?.strategy).toBe('Revisione sulla base originale')
    projects.saveMatchupReport({ ...report, strategy: 'Guida completata dopo il cambio' })
    expect(projects.getMatchupDiscussion(discussion.id)?.turns.at(-1)?.report?.strategy).toBe('Guida completata dopo il cambio')
    expect(projects.listMatchupReports(project.id, meta.id)).toEqual([])
    expect(() => projects.saveMatchupReport({ ...report, projectId: other.id })).toThrow('non è verificabile')
    expect(() => projects.saveMatchupReport({ ...report, deckHash: 'fake' })).toThrow('non è verificabile')
    expect(projects.listMatchupDiscussions(other.id, '284')).toEqual([])
  } finally { projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
