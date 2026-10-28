import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { CatalogStore } from '../src/main/catalog'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { recoverMatchupJob, recoverThreadJob, settleFailedAiJob } from '../src/main/ai-job-recovery'
import type { ThreadEvidencePacket } from '../src/shared/thread-evidence'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }
const evidence: ThreadEvidencePacket = { schemaVersion: 1, capturedAt: '2026-10-25T00:00:00Z',
  baseVersionId: null, candidateId: null, catalogSyncedAt: null,
  cardCoverage: { selected: 0, withGameplay: 0, omitted: 0 }, cards: [], events: [], sources: [],
  change: { updated: [], added: [], removed: [] } }

it('finalizes a validated archived Thread using its original catalog and constraints', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-frozen-recovery-')), path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path), jobs = new AiJobStore(path), catalog = new CatalogStore(path)
  try {
    const project = projects.create({ name: 'Frozen recovery', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Original context' })
    const job = jobs.start('thread-ask', project.id, thread.id)
    const archive = new AiEvidenceArchive(path, job)
    try {
      archive.saveValue('snapshot', 'sources', { catalog: catalog.view() })
      archive.saveValue('input', 'constraints', [])
      archive.saveValue('input', 'base', null)
      archive.saveValue('input', 'reference-date', '2026-10-25')
    } finally { archive.close() }
    jobs.prepare(job.id, { schemaVersion: 2, validatedDraft: true, message: 'Original question', config, evidence, sources: [] })
    jobs.ready(job.id, { sessionId: 'session', turnId: 'turn', value: {
      kind: 'thought', reply: 'Original answer', rawText: '', sourceIds: [] } })
    catalog.view = () => { throw new Error('Current catalog must not replace the original') }
    expect(await recoverThreadJob(jobs.get(job.id)!, jobs, projects, catalog, {} as never, folder)).toBe('applied')
    expect(projects.getDeckThread(project.id, thread.id)?.messages.at(-1)?.text).toBe('Original answer')
  } finally { catalog.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('finishes a failed unvalidated draft even when the CLI left a result, allowing retry in the same thread', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-draft-failure-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Failure', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn' })
    const other = projects.create({ name: 'Other', format: 'STANDARD' })
    const otherThread = projects.createDeckThread({ projectId: other.id, title: 'Other' })
    const untouched = jobs.start('thread-ask', other.id, otherThread.id)
    for (const kind of ['thread-ask', 'matchup-generate'] as const) {
      const resource = kind === 'thread-ask' ? thread.id : `matchup:${project.id}`
      const started = jobs.start(kind, project.id, resource)
      jobs.prepare(started.id, { validatedDraft: false })
      jobs.updateProgress(started.id, 'verification', 'Verifico le carte citate e la risposta strutturata.')
      const error = new Error('Le schede nominate non sono state tutte consegnate a Codex. Riprova l’analisi.')
      expect(settleFailedAiJob(jobs, started.id, error, false, true)).toBe(true)
      expect(jobs.get(started.id)).toMatchObject({ status: 'failed', error: error.message,
        request: null, result: null, progress: { phase: 'verification' } })
      expect(jobs.active(project.id, resource)).toBeNull()
      const retry = jobs.start(kind, project.id, resource)
      jobs.transition(retry.id, 'cancelled')
    }
    expect(jobs.get(untouched.id)?.status).toBe('running')
    expect(projects.getDeckThread(project.id, thread.id)?.messages).toHaveLength(0)
    expect(projects.getDeckThread(project.id, thread.id)?.candidates).toHaveLength(0)
    const reopened = new AiJobStore(path)
    try { expect(reopened.latest(project.id, thread.id)?.status).toBe('cancelled') }
    finally { reopened.close() }
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('preserves recoverable validated results and records their failure without discarding them', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-validated-failure-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Validated', format: 'STANDARD' })
    const error = new Error('Salvataggio temporaneamente non disponibile.')
    for (const status of ['running', 'ready'] as const) {
      const started = jobs.start('thread-ask', project.id, status)
      jobs.prepare(started.id, { validatedDraft: true, message: 'Preserve this request' })
      if (status === 'ready') jobs.ready(started.id, { value: 'Preserve this result' })
      expect(settleFailedAiJob(jobs, started.id, error, false, true)).toBe(false)
      expect(jobs.get(started.id)).toMatchObject({ status, error: error.message,
        request: { validatedDraft: true } })
      if (status === 'ready') expect(jobs.get(started.id)?.result).toEqual({ value: 'Preserve this result' })
      expect(settleFailedAiJob(jobs, started.id, error, true, true)).toBe(true)
      expect(jobs.get(started.id)?.status).toBe('cancelled')
    }
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

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

it('recovers a unified Thread thought with its sources and does not invent a candidate', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-unified-recovery-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const catalog = new CatalogStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Unified', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn' })
    const started = jobs.start('thread-ask', project.id, thread.id)
    jobs.prepare(started.id, { schemaVersion: 2, message: 'Valuta un piano', config,
      evidence, sources: [] })
    jobs.ready(started.id, { sessionId: 'unified-session', turnId: 'unified-turn',
      value: { kind: 'thought', reply: 'Servono altri dati.', rawText: '', sourceIds: [] } })
    expect(await recoverThreadJob(jobs.get(started.id)!, jobs, projects, catalog,
      { latestTurnId: async () => 'unified-turn' }, folder)).toBe('applied')
    const saved = projects.getDeckThread(project.id, thread.id)!
    expect(saved.messages.map((message) => message.text)).toEqual(['Valuta un piano', 'Servono altri dati.'])
    expect(saved.candidates).toHaveLength(0)
    expect(saved.messages[1].citedSourceIds).toEqual([])
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

it('never restores an internal Thread or Matchup draft before evidence validation', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-ai-draft-recovery-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  const catalog = new CatalogStore(path)
  const jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Draft gate', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Turn' })
    const threadJob = jobs.start('thread-ask', project.id, thread.id)
    jobs.prepare(threadJob.id, { schemaVersion: 2, validatedDraft: false,
      message: 'E Dragapult ex?', config, evidence, sources: [] })
    const threadArtifact = join(folder, 'ai-jobs', threadJob.id)
    mkdirSync(threadArtifact, { recursive: true })
    writeFileSync(join(threadArtifact, 'result.json'), JSON.stringify({ kind: 'thought',
      reply: 'Prima bozza.', rawText: '', sourceIds: [] }))
    expect(await recoverThreadJob(jobs.get(threadJob.id)!, jobs, projects, catalog,
      { latestTurnId: async () => 'draft-turn' }, threadArtifact)).toBe('interrupted')
    expect(projects.getDeckThread(project.id, thread.id)?.messages).toHaveLength(0)

    const matchupJob = jobs.start('matchup-generate', project.id, `matchup:${project.id}`)
    jobs.prepare(matchupJob.id, { analysisVersion: 2, validatedDraft: false,
      base: { jobId: matchupJob.id, projectId: project.id } })
    const matchupArtifact = join(folder, 'ai-jobs', matchupJob.id)
    mkdirSync(matchupArtifact, { recursive: true })
    writeFileSync(join(matchupArtifact, 'result.json'), JSON.stringify({ strengths: 'Prima bozza' }))
    expect(recoverMatchupJob(jobs.get(matchupJob.id)!, jobs, projects, matchupArtifact))
      .toBe('interrupted')
    expect(projects.listMatchupDiscussions(project.id, '284')).toHaveLength(0)
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
      strategy: 'Piano', deckVersionId: projects.getCurrentDeckContext(project.id)?.versionId }])
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
