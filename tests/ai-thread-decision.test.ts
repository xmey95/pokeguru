import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { AiAnalysisWork, readAiWorkflow } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { runAiEvidenceQueries, threadEvidenceWithQueries } from '../src/main/ai-evidence-queries'
import { buildThreadEvidence } from '../src/main/thread-evidence'
import { deckThreadPrompt, readDeckThreadTurn } from '../src/main/deck-ai'
import { firstThreadAnswer, readThreadDecision, restoreFirstThreadAnswer, runThreadDecision,
  usesThreadDecision } from '../src/main/ai-thread-decision'
import type { CatalogView } from '../src/shared/catalog'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: [], names: [] }, syncedAt: null, prints: [], sets: [] }
const question = 'Spiega i limiti dei dati disponibili.'
const answer = { action: 'answer', queries: [], continueAfterResults: false, uncertainty: '',
  answer: { kind: 'thought', reply: 'Il catalogo è vuoto; nessuna carta è verificabile.', rawText: '', sourceIds: [] } }
function fixture(version: 4 | 5 = 5) {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-first-turn-')), file = join(directory, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'First response', format: 'STANDARD' })
  const thread = projects.createDeckThread({ projectId: project.id, title: 'Rules' })
  const job = jobs.start('thread-ask', project.id, thread.id)
  const input = { schemaVersion: version, kind: 'thread-ask' as const, args: [project.id, thread.id, question] }
  let work = new AiAnalysisWork(join(directory, 'job'), jobs, job.id, new AbortController().signal, input)
  const initial = buildThreadEvidence(thread, null, question, [], catalog, [], [])
  const engine = () => createArchivedEvidenceEngine(work.archive, () => ({
    catalog, window: { from: '2026-10-01', to: '2026-10-30' }, play: [], main: [] })).engine
  return { project, thread, initial, engine, get work() { return work },
    reopen() { work.close(); work = new AiAnalysisWork(join(directory, 'job'), jobs, job.id, new AbortController().signal, input) },
    close() { work.close(); jobs.close(); projects.close(); rmSync(directory, { recursive: true, force: true }) } }
}

it('reuses a direct first answer after reopening, with its real prompt, sources and delivery isolated by job', async () => {
  const f = fixture(), other = fixture()
  let calls = 0
  try {
    expect(usesThreadDecision(f.work)).toBe(true)
    const trace = await runAiEvidenceQueries(question, f.initial, f.engine(), async (_prompt, trace) => {
      const packet = threadEvidenceWithQueries(f.initial, trace)
      const context = deckThreadPrompt(f.thread, null, question, [], catalog, packet)
      return runThreadDecision(f.work, config, context, packet, trace, async () => {
        calls++; return { sessionId: 'session', turnId: 'turn', value: answer, usage: null }
      })
    }, { archive: f.work.archive })
    const saved = firstThreadAnswer(f.work)!
    expect(saved.result.value).toEqual(answer.answer)
    expect(saved.prompt).toContain('primo turno unificato')
    expect(trace.planningRounds).toBe(1)
    f.reopen()
    await runThreadDecision(f.work, config, { prompt: 'Unused after durable answer', sources: [] }, f.initial, trace,
      async () => { throw new Error('Call repeated between answer checkpoint and planning commit') })
    await runAiEvidenceQueries(question, f.initial, f.engine(), async () => { throw new Error('Repeated call') },
      { archive: f.work.archive })
    expect(firstThreadAnswer(f.work)).toEqual(saved)
    expect(firstThreadAnswer(other.work)).toBeUndefined()
    expect(calls).toBe(1)
    expect(readDeckThreadTurn(saved.result.value, f.project.id, null, catalog, [], f.initial, saved.sources).answer)
      .toContain('catalogo è vuoto')
  } finally { f.close(); other.close() }
})

it('executes requested local research and preserves its plan without inventing a direct answer on resume', async () => {
  const f = fixture()
  try {
    const engine = f.engine()
    const trace = await runAiEvidenceQueries(question, f.initial, engine, async (_prompt, trace) => {
      const packet = threadEvidenceWithQueries(f.initial, trace)
      return runThreadDecision(f.work, config, deckThreadPrompt(f.thread, null, question, [], catalog, packet),
        packet, trace, async () => ({ sessionId: 'session', turnId: 'research', usage: null, value: {
          action: 'research', answer: null, queries: [{ operation: 'catalog.search', terms: ['draw'], limit: 20 }],
          continueAfterResults: false, uncertainty: 'Quali testi originali sono disponibili?' } }))
    }, { archive: f.work.archive })
    expect(trace.archive?.pages).toBe(1)
    expect(firstThreadAnswer(f.work)).toBeUndefined()
    f.reopen()
    const resumed = await runAiEvidenceQueries(question, f.initial, f.engine(), async () => { throw new Error('Repeated research') },
      { archive: f.work.archive })
    expect(resumed.archive?.pages).toBe(1)
    expect(firstThreadAnswer(f.work)).toBeUndefined()
  } finally { f.close() }
})

it('keeps v4 checkpoints out of the direct-response path', () => {
  const f = fixture(4)
  try {
    f.reopen()
    expect(readAiWorkflow(f.work.directory)?.schemaVersion).toBe(4)
    expect(usesThreadDecision(f.work)).toBe(false)
  } finally { f.close() }
})

it('rejects contradictory or empty routing results before they can bypass collection', () => {
  expect(() => readThreadDecision({ ...answer, queries: [{ operation: 'events.overview' }] })).toThrow('Decisione')
  expect(() => readThreadDecision({ ...answer, continueAfterResults: true })).toThrow('Decisione')
  expect(() => readThreadDecision({ ...answer, action: 'research', answer: null })).toThrow('Decisione')
  expect(() => readThreadDecision({ ...answer, answer: null })).toThrow('Decisione')
})

it('still rejects unknown citations and checks raw lists even when the direct answer is labeled thought', () => {
  const f = fixture()
  try {
    const bad = readThreadDecision({ ...answer, answer: { ...answer.answer, sourceIds: ['unknown'] } })
    expect(() => readDeckThreadTurn(bad.answer, f.project.id, null, catalog, [], f.initial, [])).toThrow('Fonti')
    const list = readThreadDecision({ ...answer, answer: { ...answer.answer, rawText: '61 Invented XXX 999' } })
    const checked = readDeckThreadTurn(list.answer, f.project.id, null, catalog, [], f.initial, [])
    expect(checked.proposal).toBeUndefined()
    expect(checked.answer).toContain('Lista non salvata')
  } finally { f.close() }
})
