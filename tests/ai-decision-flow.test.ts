import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence, readAiWorkflow } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { evidenceOccurrenceIdentity, exactDeckIdentity } from '../src/main/ai-evidence-archive'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { normalizedEvidenceText, type EvidenceEventRow } from '../src/main/ai-evidence-engine'
import { aiEvidenceForPrompt, runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
import { archiveReferences } from '../src/main/ai-evidence-access'
import type { CatalogView } from '../src/shared/catalog'
import type { AiRunConfig } from '../src/shared/ai'

const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { kind: 'standard-marks', setIds: [], names: [] }, syncedAt: null, prints: [], sets: [] }
const window = { from: '2026-10-01', to: '2026-10-29' }
const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
function row(id: string, variant = 1, deck = 'Toucannon'): EvidenceEventRow {
  return { id: 'play:event', snapshotId: 'snapshot', participationId: id, name: 'Fixture', date: '2026-10-20',
    kind: 'online', url: 'https://example.test/event', participants: 12, completeLists: 12, deck, placing: 1,
    listUrl: `https://example.test/event/${id}`, playerId: id, record: { wins: 2, losses: 1, ties: 1 },
    cards: [`${variant} Toucannon TEST 1`, `${60 - variant} Basic Energy SVE 001`], pairings: [] }
}
function fixture(rows: EvidenceEventRow[]) {
  mkdirSync(resolve('.verify'), { recursive: true })
  const folder = mkdtempSync(resolve('.verify/decision-test-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Decision', format: 'STANDARD' }), job = jobs.start('thread-ask', project.id, 'resource')
  const input = { schemaVersion: 4 as const, kind: 'thread-ask' as const, args: [project.id, 'resource', 'question'] }
  let controller = new AbortController()
  let work = new AiAnalysisWork(join(folder, 'job'), jobs, job.id, controller.signal, input)
  work.archive.captureSources({ catalog, window }, rows.map(value => ({ key: evidenceOccurrenceIdentity(value),
    deckKey: exactDeckIdentity(value.cards), date: value.date, placing: value.placing, deckName: value.deck,
    deckText: normalizedEvidenceText(value.deck), cardsText: value.cards.map(normalizedEvidenceText).join('\n'), value })))
  const engine = () => createArchivedEvidenceEngine(work.archive, () => { throw new Error('Sealed snapshot was not reused') }).engine
  return { projects, jobs, job, project, engine, get work() { return work }, get controller() { return controller },
    reopen() { work.close(); controller = new AbortController(); work = new AiAnalysisWork(join(folder, 'job'), jobs, job.id, controller.signal, input) },
    close() { work.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}

it('counts every matching participation and rare quantity while delivering only the requested page of exact variants', async () => {
  const f = fixture(Array.from({ length: 20 }, (_, i) => row(`p${i}`, i < 15 ? 1 : i - 13)))
  try {
    expect(readAiWorkflow(f.work.directory, f.jobs, f.job.id)?.schemaVersion).toBe(4)
    const engine = f.engine()
    const result = engine.execute({ operation: 'events.search', deckName: 'Toucannon', offset: 0, limit: 2 })
    expect(result.status).toBe('ok')
    const data = result.data as any
    expect(data.scope).toMatchObject({ matchingParticipations: 20, distinctDecks: 6, recordsAvailable: 20 })
    expect(data.fieldRecord).toEqual({ wins: 40, losses: 20, ties: 20, denominator: 80 })
    expect(data.cards.find((c: any) => c[0] === 'Toucannon TEST 1')).toEqual(['Toucannon TEST 1', 20, 6,
      [[1, 15], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]])
    expect(data.lists).toHaveLength(2); expect(data.remaining).toBe(4)
    let plans = 0, batches = 0
    const trace = await runAiEvidenceQueries('Migliora Toucannon', { base: '60 cards', constraints: [] }, engine,
      async prompt => { plans++; expect(prompt).toContain('CONTESTO DEL COMPITO'); return {
        uncertainty: 'Quali quantità e alternative sono osservate?', continueAfterResults: false,
        queries: [{ operation: 'events.search', deckName: 'Toucannon', offset: 0, limit: 2 }] } },
      { archive: f.work.archive, summarize: async () => { batches++ } })
    await analyzeLargeEvidence(trace, 'Migliora', config, f.work, async () => { batches++; throw new Error('Unexpected batch') })
    expect(plans).toBe(1); expect(batches).toBe(0); expect(trace.archive?.decks).toBe(2)
    const prompt = aiEvidenceForPrompt(trace) as any
    expect(prompt.representation).toBe('decision-evidence-v1')
    expect(Object.values(prompt.eventProfiles)[0]).toMatchObject({ scope: { matchingParticipations: 20 } })
    expect(archiveReferences(trace).some(source => source.id === data.profileSource.id)).toBe(true)
    const detailsResult = engine.execute({ operation: 'events.details', deckKey: data.lists[0].exactDeckKey, limit: 20 })
    const details = detailsResult.data as any
    expect(details.scope.totalRecords).toBe(15)
    expect(details.records).toHaveLength(15)
    expect(new Set(details.records.map((r: any) => r.data.playerId)).size).toBe(15)
    const saved = f.work.archive.search(detailsResult.query, true)
    f.work.archive.appendPage(saved.key, saved.cursor, detailsResult, null)
    const references = archiveReferences(trace)
    expect(detailsResult.sourceIds.every(id => references.some(source => source.id === id))).toBe(true)
  } finally { f.close() }
})

it('preserves distinct requested pages, profile provenance and sealed sources after reopen without replaying completed plans', async () => {
  const f = fixture(Array.from({ length: 7 }, (_, i) => row(`p${i}`, i + 1)))
  try {
    let calls = 0
    const plan = async () => ({ uncertainty: 'Confrontare due gruppi di varianti', continueAfterResults: ++calls < 2,
      queries: [{ operation: 'events.search', deckName: 'Toucannon', offset: (calls - 1) * 2, limit: 2 }] })
    const first = await runAiEvidenceQueries('Toucannon', {}, f.engine(), plan, { archive: f.work.archive })
    expect(calls).toBe(2); expect(first.archive?.decks).toBe(4)
    f.reopen()
    const second = await runAiEvidenceQueries('Toucannon', {}, f.engine(), async () => { throw new Error('Plan repeated') },
      { archive: f.work.archive })
    expect(second.archive?.decks).toBe(4)
    const data = aiEvidenceForPrompt(second) as any
    expect(Object.keys(data.eventProfiles)).toHaveLength(1)
    expect(data.requests.map((r: any) => r.data.offset)).toEqual([0, 2])
    const other = f.jobs.start('thread-ask', f.project.id, 'other')
    const isolated = new AiAnalysisWork(join(f.work.directory, 'other'), f.jobs, other.id, new AbortController().signal)
    try {
      expect(isolated.archive.eventRow(evidenceOccurrenceIdentity(row('p0')))).toBeUndefined()
      expect(isolated.archive.value('decision-event-profile:v1', Object.keys(data.eventProfiles)[0])).toBeUndefined()
    } finally { isolated.close() }
  } finally { f.close() }
})

it('keeps player-side denominators, byes and unknown outcomes separate across overlapping participants', () => {
  const a = row('a'), b = row('b', 2)
  const pairing = { phase: 1, round: 1, table: 1, match: null, player1: 'a', player2: 'b', winner: 'a' }
  a.pairings = [pairing, { ...pairing, round: 2, player2: null }, { ...pairing, round: 3, player2: 'unknown', winner: null }]
  b.pairings = [pairing]
  const f = fixture([a, b])
  try {
    const data = f.engine().execute({ operation: 'events.search', deckName: 'Toucannon' }).data as any
    expect(data.coverage.uniquePairings).toBe(3)
    expect(data.coverage.resolvedSelectedPlayerSides).toBe(4)
    expect(data.matchups).toContainEqual(['Toucannon', 'known-label', 1, 1, 0, 2, 0, 0, 0, 0])
    expect(data.matchups).toContainEqual([null, 'bye', 0, 0, 0, 0, 1, 0, 0, 0])
    expect(data.matchups).toContainEqual([null, 'missing-list-or-player', 0, 0, 0, 0, 0, 0, 1, 0])
    expect(data.fieldRecord.denominator).toBe(8)
  } finally { f.close() }
})

it('refuses unsupported research and honors a pause without marking it sufficient', async () => {
  const f = fixture([row('a')])
  try {
    await expect(runAiEvidenceQueries('Question', {}, f.engine(), async () => ({ queries: [{}], continueAfterResults: false }),
      { archive: f.work.archive })).rejects.toThrow('Piano delle query')
    f.controller.abort('pause')
    await expect(runAiEvidenceQueries('Question', {}, f.engine(), async () => { throw new Error('Model invoked') },
      { archive: f.work.archive, signal: f.controller.signal })).rejects.toThrow('interrotta')
  } finally { f.close() }
})

it('excludes ambiguous player sides and refuses contradictory copies of the same match', () => {
  const a = row('a'), otherList = row('a', 2), missing = { ...row('missing'), playerId: null }
  const pairing = { phase: 1, round: 1, table: 1, match: null, player1: 'a', player2: 'unknown', winner: 'a' }
  a.pairings = [pairing]
  const f = fixture([a, { ...otherList, participationId: 'a-second-list' }, missing])
  try {
    const data = f.engine().execute({ operation: 'events.search', deckName: 'Toucannon' }).data as any
    expect(data.scope.missingPlayerIds).toBe(1)
    expect(data.scope.ambiguousPlayerIds).toBe(2)
    expect(data.coverage.ambiguousSelectedSides).toBe(1)
    expect(data.coverage.resolvedSelectedPlayerSides).toBe(0)
    expect(data.matchups).toEqual([])
  } finally { f.close() }
  const conflict = fixture([a, { ...row('b'), pairings: [{ ...pairing, winner: 'unknown' }] }])
  try {
    expect(() => conflict.engine().execute({ operation: 'events.search', deckName: 'Toucannon' }))
      .toThrow('Esiti incompatibili')
  } finally { conflict.close() }
})
