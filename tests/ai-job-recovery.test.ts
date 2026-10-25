import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { CatalogStore } from '../src/main/catalog'
import { AiJobStore } from '../src/main/ai-job-store'
import { recoverMatchupJob, recoverThreadJob } from '../src/main/ai-job-recovery'
import type { ThreadEvidencePacket } from '../src/shared/thread-evidence'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }
const evidence: ThreadEvidencePacket = { schemaVersion: 1, capturedAt: '2026-10-25T00:00:00Z',
  baseVersionId: null, candidateId: null, catalogSyncedAt: null,
  cardCoverage: { selected: 0, withGameplay: 0, omitted: 0 }, cards: [], events: [], sources: [],
  change: { updated: [], added: [], removed: [] } }

it('recovers a completed CLI file after interruption and never duplicates the turn', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-ai-recovery-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const catalog = new CatalogStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Recovery', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn' })
    const started = jobs.start('thread-ask', project.id, thread.id)
    jobs.prepare(started.id, { message: 'Domanda', config, evidence })
    const artifact = join(folder, 'ai-jobs', started.id)
    mkdirSync(artifact, { recursive: true })
    writeFileSync(join(artifact, 'session-id.txt'), 'session-1')
    writeFileSync(join(artifact, 'result.json'), JSON.stringify({ reply: 'Risposta.', sourceIds: [] }))
    const codex = { latestTurnId: async (id: string) => {
      expect(id).toBe('session-1')
      return 'turn-1'
    } }
    expect(await recoverThreadJob(jobs.get(started.id)!, jobs, projects, catalog, codex, artifact))
      .toBe('applied')
    expect(projects.getDeckThread(project.id, thread.id)?.messages).toMatchObject([
      { author: 'user', text: 'Domanda' },
      { author: 'assistant', text: 'Risposta.', aiTurnId: 'turn-1', evidence }
    ])
    const duplicate = jobs.start('thread-ask', project.id, thread.id)
    jobs.prepare(duplicate.id, { message: 'Domanda', config, evidence })
    jobs.ready(duplicate.id, { sessionId: 'session-1', turnId: 'turn-1',
      value: { reply: 'Risposta.', sourceIds: [] } })
    expect(await recoverThreadJob(jobs.get(duplicate.id)!, jobs, projects, catalog, codex,
      join(folder, 'ai-jobs', duplicate.id))).toBe('applied')
    expect(projects.getDeckThread(project.id, thread.id)?.messages).toHaveLength(2)
    const interrupted = jobs.start('thread-ask', project.id, thread.id)
    jobs.prepare(interrupted.id, { message: 'Nuova domanda', config, evidence })
    expect(await recoverThreadJob(jobs.get(interrupted.id)!, jobs, projects, catalog, codex,
      join(folder, 'ai-jobs', interrupted.id))).toBe('interrupted')
    expect(jobs.get(interrupted.id)?.status).toBe('interrupted')
    expect(projects.getDeckThread(project.id, thread.id)?.messages).toHaveLength(2)
  } finally { jobs.close(); catalog.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('reuses the persisted opening message when its Codex result is recovered', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-opening-recovery-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const catalog = new CatalogStore(path)
  const jobs = new AiJobStore(path)
  try {
    const first = projects.create({ name: 'First', format: 'STANDARD' })
    const second = projects.create({ name: 'Second', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: first.id, title: 'Start',
      openingNote: 'Valuta questa idea', startWithAi: true })
    const other = projects.createDeckThread({ projectId: second.id, title: 'Other',
      openingNote: 'Altra idea', startWithAi: true })
    const manual = projects.createDeckThread({ projectId: first.id, title: 'Manual',
      openingNote: 'Solo nota' })
    expect(thread.openingAiMessageId).toBe(thread.messages[0].id)
    expect(manual.openingAiMessageId).toBeNull()
    const started = jobs.start('thread-ask', first.id, thread.id)
    jobs.prepare(started.id, { message: 'Valuta questa idea', config, evidence,
      existingUserMessageId: thread.openingAiMessageId })
    jobs.ready(started.id, { sessionId: 'opening-session', turnId: 'opening-turn',
      value: { reply: 'Risposta iniziale.', sourceIds: [] } })
    expect(await recoverThreadJob(jobs.get(started.id)!, jobs, projects, catalog,
      { latestTurnId: async () => 'opening-turn' }, join(folder, 'unused'))).toBe('applied')
    const saved = projects.getDeckThread(first.id, thread.id)!
    expect(saved.aiSessionRef).toBe('opening-session')
    expect(saved.messages).toHaveLength(2)
    expect(saved.messages[0].id).toBe(thread.openingAiMessageId)
    expect(saved.messages[1]).toMatchObject({ author: 'assistant', aiTurnId: 'opening-turn', evidence })
    expect(projects.getDeckThread(second.id, other.id)?.messages).toHaveLength(1)
    expect(projects.getDeckThread(second.id, thread.id)).toBeNull()
    expect(() => projects.saveDeckAiExchange(first.id, thread.id, 'opening-session',
      'Valuta questa idea', 'Duplicata', 'another-turn', config, undefined, undefined, [],
      thread.openingAiMessageId!)).toThrow('non recuperabile')
    const reopened = new ProjectStore(path)
    expect(reopened.getDeckThread(first.id, thread.id)).toMatchObject({
      openingAiMessageId: thread.openingAiMessageId, aiSessionRef: 'opening-session',
      messages: [{ id: thread.openingAiMessageId }, { aiTurnId: 'opening-turn' }]
    })
    reopened.close()
  } finally { jobs.close(); catalog.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('marks a job interrupted even if the process stopped before saving its request', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-ai-early-stop-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const catalog = new CatalogStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Early stop', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn' })
    const earlyThread = jobs.start('thread-ask', project.id, thread.id)
    expect(await recoverThreadJob(earlyThread, jobs, projects, catalog,
      { latestTurnId: async () => 'unused' }, join(folder, 'missing'))).toBe('interrupted')
    const earlyMatchup = jobs.start('matchup-generate', project.id, `matchup:${project.id}`)
    expect(recoverMatchupJob(earlyMatchup, jobs, projects, join(folder, 'missing'))).toBe('interrupted')
  } finally { jobs.close(); catalog.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('replays a completed Matchup response exactly once and preserves the job identity', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-matchup-recovery-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Recovery', format: 'STANDARD' })
    projects.importDeck({ projectId: project.id, rawText: '2 Carta A MEG 1', source: 'paste' })
    const metaId = 'a'.repeat(64)
    projects.saveMetaSnapshot({ id: metaId, fetchedAt: '2026-10-25T00:00:00.000Z',
      sourceUrl: 'https://limitlesstcg.com/decks', period: 'Ultimo mese', circuit: 'WESTERN',
      format: 'STANDARD', cached: false,
      decks: [{ id: '284', name: 'Dragapult ex', points: 100, share: 12,
        url: 'https://limitlesstcg.com/decks/284' }] })
    const started = jobs.start('matchup-generate', project.id, `matchup:${project.id}`)
    const base = { jobId: started.id, projectId: project.id, metaId, opponentId: '284',
      deckHash: projects.getCurrentDeckHash(project.id)!, generatedAt: '2026-10-25T00:01:00.000Z',
      sampleDeckUrl: null }
    jobs.prepare(started.id, { base })
    const artifact = join(folder, 'ai-jobs', started.id)
    mkdirSync(artifact, { recursive: true })
    writeFileSync(join(artifact, 'result.json'), JSON.stringify({ strengths: 'Punto forte',
      weaknesses: 'Rischio', ourKeyCards: 'Carta A', theirKeyCards: 'Carta B',
      strategy: 'Piano', limitations: 'Nessun match diretto' }))
    expect(recoverMatchupJob(jobs.get(started.id)!, jobs, projects, artifact)).toBe('applied')
    expect(projects.listMatchupReports(project.id, metaId)).toMatchObject([{ jobId: started.id,
      strategy: 'Piano' }])
    const discussion = projects.listMatchupDiscussions(project.id, '284')[0]
    expect(discussion.turns).toHaveLength(1)
    const second = jobs.start('matchup-generate', project.id, `matchup:${project.id}`)
    const secondBase = { ...base, jobId: second.id, generatedAt: '2026-10-25T00:02:00.000Z' }
    const secondReport = { ...projects.listMatchupReports(project.id, metaId)[0],
      jobId: second.id, generatedAt: secondBase.generatedAt }
    jobs.prepare(second.id, { base: secondBase })
    jobs.ready(second.id, { report: secondReport })
    projects.saveMatchupReport(secondReport) // Simulate a crash after the project commit.
    expect(recoverMatchupJob(jobs.get(second.id)!, jobs, projects, artifact)).toBe('applied')
    expect(projects.listMatchupDiscussions(project.id, '284')[0].turns).toHaveLength(2)
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
