import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { aggregateEventRecords, eventOverview, eventPlayerIndex } from '../src/main/ai-event-aggregates'
import { AiEvidenceArchive, evidenceHash, evidenceOccurrenceIdentity, exactDeckIdentity, type ArchivedEvidenceRecord } from '../src/main/ai-evidence-archive'
import { buildEventAnalysisRecords, eventAnalysisOriginalInputs, prepareEventAnalysisInventory } from '../src/main/ai-event-analysis'
import { createAiEvidenceEngine, parseEvidenceQuery, type EvidenceEventRow } from '../src/main/ai-evidence-engine'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { evidenceBatches, type EvidenceRecord } from '../src/main/ai-evidence-partition'
import { prepareEvidenceManifest, readEvidenceBatch } from '../src/main/ai-evidence-manifest'
import { AiAnalysisWork, analyzeLargeEvidence, readAiWorkflow } from '../src/main/ai-analysis-work'
import { bindEvidenceArchive } from '../src/main/ai-evidence-access'
import { runAiEvidenceQueries, aiEvidenceForPrompt } from '../src/main/ai-evidence-queries'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { TournamentPairing } from '../src/shared/tournament'
import { CATALOG_SOURCE, type CatalogView } from '../src/shared/catalog'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { readAiDiagnostics } from '../src/shared/ai-diagnostics'

const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
  scope: { kind: 'standard-marks', setIds: [], names: [] }, syncedAt: null, sets: [], prints: [] }

const cards = ['4 Toucannon PBL 94', '56 Basic Energy SVE 001']
const deckKey = exactDeckIdentity(cards)
function eventRow(playerId: string, deck = 'Toucannon', lines = cards): EvidenceEventRow {
  return { id: 'play:event', snapshotId: 'snapshot', participationId: `player:${playerId}`, name: 'Local Event',
    date: '2026-10-20', kind: 'online', url: 'https://example.test/event', participants: 10, completeLists: 3,
    deck, placing: 1, listUrl: 'https://example.test/shared-list', cards: lines, playerId,
    record: { wins: 3, losses: 2, ties: 1 }, pairings: [] }
}
function occurrence(row: EvidenceEventRow): ArchivedEvidenceRecord {
  const { cards: lines, pairings: _pairings, ...data } = row
  return { key: `occurrence:${evidenceOccurrenceIdentity(row)}`, kind: 'occurrence', sourceId: 'list:shared',
    deckKey: exactDeckIdentity(lines), data }
}
function pair(round: number, winner: TournamentPairing['winner'], player2: string | null = 'b'): ArchivedEvidenceRecord {
  return { key: `pairing:${round}`, kind: 'pairing', sourceId: 'list:shared', deckKey: null,
    data: { eventId: 'play:event', phase: 1, round, table: 1, match: null, player1: 'a', player2, winner } }
}
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-event-aggregates-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Aggregate', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'resource')
  const archive = new AiEvidenceArchive(file, job)
  const append = (rows: EvidenceEventRow[], suffix = 'first') => {
    const query = { operation: 'events.search', deckName: suffix }, search = archive.search(query)
    const data = { lists: rows.map((row) => { const { cards: _cards, ...o } = row; return { ...row, occurrences: [o] } }), remaining: 0 }
    archive.appendPage(search.key, search.cursor, { query, status: 'ok', data,
      sourceIds: rows.map(() => 'list:shared'), fingerprint: evidenceHash(data) }, null)
  }
  return { folder, file, projects, jobs, project, job, archive, append,
    close() { archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}

it('counts shared pairings by selected player side, preserving unknown outcomes, byes and distinct participations', () => {
  const a = eventRow('a'), b = eventRow('b', 'Dragapult', ['60 Other Card MEG 001'])
  const pairingRows = [pair(1, 'a'), pair(2, 'b'), pair(3, 0), pair(4, -1), pair(5, null), pair(6, 'absent'),
    pair(7, 'a', null), pair(8, 'a', 'no-list')]
  const records = aggregateEventRecords([occurrence(a), occurrence(a), occurrence(b)],
    [...pairingRows, pairingRows[0]], eventPlayerIndex([a, b]))
  const mine = records.find(r => r.key === `event-statistics:${deckKey}`)!.data as any
  expect(mine.participations).toBe(1)
  expect(mine.fieldRecord).toEqual({ wins: 3, losses: 2, ties: 1, denominator: 6 })
  expect(mine.matchups).toContainEqual(['play:event', 'Dragapult', 'known-label', 1, 1, 1, 3, 0, 1, 1, 1])
  expect(mine.matchups).toContainEqual(['play:event', null, 'bye', 0, 0, 0, 0, 1, 0, 0, 0])
  expect(mine.matchups).toContainEqual(['play:event', null, 'missing-list-or-player', 1, 0, 0, 1, 0, 0, 0, 0])
  expect(records.at(-1)!.data).toMatchObject({ uniqueParticipations: 2, uniquePairings: 8,
    resolvedSelectedPlayerSides: 14, unassociatedPairings: 0 })
  expect(mine.originals).toEqual({ operation: 'events.details', deckKey })
})

it('reports ambiguous opponent identities and does not combine different lists sharing a source label', () => {
  const a = eventRow('a'), b = eventRow('b', 'Dragon', ['60 One MEG 001']), other = eventRow('b', 'Dragon', ['60 Two MEG 001'])
  const result = aggregateEventRecords([occurrence(a)], [pair(1, 'a')], eventPlayerIndex([a, b, other]))
  expect((result[0].data as any).matchups).toEqual([['play:event', null, 'ambiguous-player', 1, 0, 0, 1, 0, 0, 0, 0]])
  const overview = eventOverview([a, b, { ...other, participationId: 'other', playerId: 'c' }], '2026-10-01', '2026-10-29') as any
  expect(overview.groups.find((g: any) => g.label === 'Dragon')).toMatchObject({ participations: 2, distinctDecks: 2, denominator: 3 })
})

it('includes events without lists in coverage, retains unknown labels, and respects the requested window', () => {
  const unknown = { ...eventRow('a'), deck: '' }, future = { ...eventRow('b'), date: '2026-11-01' }
  const result = eventOverview([unknown, unknown, future], '2026-10-01', '2026-10-29', [
    { id: 'play:event', date: '2026-10-20', kind: 'online', url: '', returnedParticipants: 10, completeLists: 1 },
    { id: 'play:empty', date: '2026-10-21', kind: 'online', url: '', returnedParticipants: 8, completeLists: 0 }
  ]) as any
  expect(result.coverage).toEqual({ events: 2, returnedParticipants: 18, completeLists: 1,
    participantsWithoutCompleteList: 17, unknownLabels: 1, includesEventsWithoutCompleteLists: true })
  expect(result.groups).toEqual([{ label: null, participations: 1, distinctDecks: 1, events: 1, denominator: 1 }])
  expect(parseEvidenceQuery({ operation: 'events.overview' }, { from: '2026-10-01', to: '2026-10-29' })).toMatchObject({ operation: 'events.overview' })
  expect(() => parseEvidenceQuery({ operation: 'events.overview', from: '2026-09-01' }, { from: '2026-10-01', to: '2026-10-29' })).toThrow()
  expect(() => parseEvidenceQuery({ operation: 'events.details', deckKey, limit: 21 }, { from: '2026-10-01', to: '2026-10-29' })).toThrow()
})

it('materializes exact aggregates without repeated lists and restores the same manifest after reopening', () => {
  const f = fixture()
  try {
    const a = eventRow('a'); a.pairings = [pair(1, 'a').data as TournamentPairing]
    f.append([a]); f.append([a], 'overlap')
    const inventory = prepareEventAnalysisInventory(f.archive), manifest = prepareEvidenceManifest(f.archive, 60000, inventory)
    const data = manifest.batches.flatMap(b => readEvidenceBatch(f.archive, b))
    expect(data.filter(r => r.key?.startsWith('deck:'))).toHaveLength(1)
    expect(data.some(r => r.key?.startsWith('occurrence:') || r.key?.startsWith('pairing:'))).toBe(false)
    expect(data.find(r => r.key === `event-statistics:${deckKey}`)!.data).toMatchObject({ participations: 1 })
    expect(data.filter(r => r.key?.startsWith('event-statistics:')).some(r => 'cards' in (r.data as object))).toBe(false)
    const other = new AiEvidenceArchive(f.file, f.job)
    try { expect(prepareEventAnalysisInventory(other)).toEqual(inventory); expect(prepareEvidenceManifest(other, 60000, inventory)).toEqual(manifest) }
    finally { other.close() }
    const detail = f.archive.eventDetails(deckKey, 0, 20) as any
    expect(detail.records).toHaveLength(2)
    const secondJob = f.jobs.start('thread-ask', f.project.id, 'second-resource'), isolated = new AiEvidenceArchive(f.file, secondJob)
    try { expect((isolated.eventDetails(deckKey, 0, 20) as any).records).toEqual([])
      expect(() => isolated.readAnalysisInput(inventory.inputs.find(i => i.type === 'aggregate')!)).toThrow() }
    finally { isolated.close() }
  } finally { f.close() }
})

it('uses the aggregate policy only for new workflows and includes the immutable base context in leaf prompts', async () => {
  const f = fixture()
  const work = new AiAnalysisWork(join(f.folder, f.job.id), f.jobs, f.job.id, new AbortController().signal,
      { schemaVersion: 3, kind: 'thread-ask', args: [f.project.id, 'resource', 'Improve'] })
  try {
    expect(readAiWorkflow(work.directory, f.jobs, f.job.id)?.schemaVersion).toBe(3)
    work.snapshot('base', [], () => ({ rawText: cards.join('\n') })); work.snapshot('reference-date', [], () => '2026-10-29')
    work.snapshot('constraints', [], () => [{ card: 'Toucannon', min: 4 }])
    f.append(Array.from({ length: 200 }, (_, i) => eventRow(`player-${i}`)))
    const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0, durationMs: 0,
      planningRounds: 1, exhausted: false, engine: { operations: [], catalog: { syncedAt: null, expected: 0, indexed: 0, gameplay: 0 },
        eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
    bindEvidenceArchive(trace, f.archive)
    let calls = 0
    const answer = async (prompt: string) => { calls++; expect(prompt).toContain('CONTESTO DEL MAZZO'); expect(prompt).toContain('4 Toucannon');
      expect(prompt).toContain('2026-10-29'); return { summary: 'Recorded counts', limitations: 'Offline fixture', sourceIds: [] } }
    await analyzeLargeEvidence(trace, 'Improve', { provider: 'codex', model: 'gpt-test', reasoningEffort: 'high', source: 'global' }, work, answer)
    expect(calls).toBeGreaterThan(0); const first = calls
    await analyzeLargeEvidence(trace, 'Improve', { provider: 'codex', model: 'gpt-test', reasoningEffort: 'high', source: 'global' }, work, answer)
    expect(calls).toBe(first)
    expect((aiEvidenceForPrompt(trace) as any).note).toContain('non sono tutte state lette dal modello')
    expect(f.jobs.diagnostics(f.job.id)?.evidencePlan).toMatchObject({ representation: 'event-aggregates-v1', leafBatches: 1 })
  } finally { work.close(); f.close() }
})

it('passes overview findings to the next planning round and includes every requested detail page in analysis', async () => {
  const f = fixture()
  try {
    f.archive.saveValue('analysis-policy', 'algorithm', 'event-aggregates-v1')
    f.append([eventRow('a'), eventRow('b')])
    const { engine } = createArchivedEvidenceEngine(f.archive, () => ({ catalog, window: { from: '2026-10-01', to: '2026-10-29' }, play: [], main: [] }))
    expect(engine.execute({ operation: 'events.overview' }).status).toBe('ok')
    let round = 0
    await runAiEvidenceQueries('Compare coverage', {}, engine, async (prompt) => {
      round++
      if (round === 1) return { queries: [{ operation: 'events.overview' }], continueAfterResults: true }
      expect(prompt).toContain('complete-local-lists-by-source-label')
      if (round === 2) return { queries: [{ operation: 'events.details', deckKey, limit: 1 }], continueAfterResults: false }
      return { queries: [], continueAfterResults: false }
    }, { archive: f.archive })
    expect(round).toBe(3)
    const details = prepareEventAnalysisInventory(f.archive).inputs.filter(i => i.key.startsWith('detail:'))
    expect(details).toHaveLength(2)
    const metrics = f.archive.queryMetrics()
    expect(metrics[0].introducedRecords).toBe(3)
    const originalBytes = [...f.archive.records()].reduce((n, r) => n + Buffer.byteLength(JSON.stringify({ key: r.key,
      sourceIds: [r.sourceId], data: { kind: r.kind, deckKey: r.deckKey, original: r.data } })), 0)
    expect(metrics.reduce((n, r) => n + (r.introducedRecordBytes ?? 0), 0)).toBe(originalBytes)
    expect(metrics.at(-1)).toMatchObject({ operation: 'events.details', pages: 2, introducedRecords: 0, introducedRecordBytes: 0 })
    const before = f.archive.counts(); const sourceRows = [...f.archive.records()]
    expect(sourceRows.filter(r => r.kind === 'occurrence')).toHaveLength(2)
    expect(f.archive.counts()).toEqual(before)
  } finally { f.close() }
})

it('sanitizes the exported evidence metrics and keeps unknown introduction counts distinct from zero', () => {
  const value = readAiDiagnostics({ evidencePlan: { representation: 'event-aggregates-v1', originalAnalysisRecords: 10,
    analysisRecords: 5, leafBatches: 1, batchBytes: 100, secret: 'private text',
    byType: [{ kind: 'deck', records: 3, recordBytes: 90, batchesTouched: 1, list: 'private' }],
    queries: [{ queryOrdinal: 1, operation: 'events.search', pages: 1, responseBytes: 100, query: 'private' },
      { queryOrdinal: 2, operation: 'events.details', pages: 1, responseBytes: 50, introducedRecords: 0, introducedRecordBytes: 0 }] } })
  expect(JSON.stringify(value)).not.toContain('private')
  expect(value.evidencePlan?.queries[0].introducedRecords).toBeUndefined()
  expect(value.evidencePlan?.queries[1].introducedRecords).toBe(0)
})

it('preserves a v2 workflow and its original representation when reopened by the new build', () => {
  const f = fixture(), directory = join(f.folder, f.job.id)
  try {
    mkdirSync(directory, { recursive: true })
    const old = { schemaVersion: 2, kind: 'thread-ask', args: [f.project.id, 'resource', 'Old question'] }
    writeFileSync(join(directory, 'workflow.json'), JSON.stringify(old))
    const work = new AiAnalysisWork(directory, f.jobs, f.job.id, new AbortController().signal,
      { kind: 'thread-ask', args: ['different arguments must not overwrite the original'] })
    try { expect(readAiWorkflow(directory, f.jobs, f.job.id)).toEqual(old)
      expect(work.archive.value('analysis-policy', 'algorithm')).toBeUndefined() }
    finally { work.close() }
  } finally { f.close() }
})

it('keeps matchup outcomes separated by event and excludes ambiguous selected identities', () => {
  const a = eventRow('a'), b = eventRow('b', 'Dragon', ['60 Other MEG 001'])
  const secondA = { ...a, id: 'play:second', date: '2026-10-21' }, secondB = { ...b, id: 'play:second', date: '2026-10-21' }
  const secondPair = { ...pair(2, 'b'), data: { ...(pair(2, 'b').data as object), eventId: 'play:second' } }
  const records = aggregateEventRecords([occurrence(a), occurrence(secondA)], [pair(1, 'a'), secondPair], eventPlayerIndex([a, b, secondA, secondB]))
  expect((records[0].data as any).matchups).toEqual([
    ['play:event', 'Dragon', 'known-label', 1, 0, 0, 1, 0, 0, 0, 0],
    ['play:second', 'Dragon', 'known-label', 0, 1, 0, 1, 0, 0, 0, 0]
  ])
  const ambiguous = aggregateEventRecords([occurrence(a)], [pair(1, 'a')], eventPlayerIndex([a, { ...a, cards: b.cards }, b]))
  expect((ambiguous[0].data as any).matchups).toEqual([])
  expect(ambiguous.at(-1)?.data).toMatchObject({ ambiguousSelectedSides: 1, resolvedSelectedPlayerSides: 0 })
})

it('resumes aggregate analysis after a completed leaf without repeating that model call', async () => {
  const f = fixture(), controller = new AbortController(), directory = join(f.folder, f.job.id)
  let work = new AiAnalysisWork(directory, f.jobs, f.job.id, controller.signal, { schemaVersion: 3, kind: 'thread-ask', args: [] })
  try {
    const query = { operation: 'catalog.search', terms: ['large fixture'] }, search = f.archive.search(query)
    const data = { matches: Array.from({ length: 4 }, (_, i) => ({ printId: `fixture-${i}`, effect: 'rule '.repeat(8000) })), remaining: 0 }
    f.archive.appendPage(search.key, search.cursor, { query, status: 'ok', data, sourceIds: [], fingerprint: evidenceHash(data) }, null)
    const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0, durationMs: 0, planningRounds: 1, exhausted: false,
      engine: { operations: [], catalog: { syncedAt: null, expected: 0, indexed: 0, gameplay: 0 }, eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
    bindEvidenceArchive(trace, f.archive)
    const completed: string[] = [], config = { provider: 'codex' as const, model: null, reasoningEffort: null, source: 'global' as const }
    const model = async (prompt: string) => { completed.push(prompt); return { summary: 'Saved', limitations: 'Fixture', sourceIds: [] } }
    const progress = work.progress.bind(work)
    work.progress = (done, total) => { progress(done, total); if (done === 1) controller.abort('pause') }
    await expect(analyzeLargeEvidence(trace, 'Compare', config, work, model)).rejects.toMatchObject({ code: 'paused' })
    expect(completed).toHaveLength(1)
    work.close(); work = new AiAnalysisWork(directory, f.jobs, f.job.id, new AbortController().signal,
      { kind: 'thread-ask', args: ['ignored on resume'] })
    await analyzeLargeEvidence(trace, 'Compare', config, work, model)
    expect(new Set(completed).size).toBe(completed.length)
    expect(trace.analysis?.summary).toBe('Saved')
  } finally { work.close(); f.close() }
})

it.skipIf(!process.env.POKEGURU_EVENT_SNAPSHOT)('measures the real private snapshot without model calls or source writes', () => {
  const file = process.env.POKEGURU_EVENT_SNAPSHOT!, id = process.env.POKEGURU_EVENT_JOB!
  const db = new DatabaseSync(file, { readOnly: true })
  const owner = db.prepare('SELECT project_id, resource_id FROM ai_jobs WHERE id=?').get(id) as { project_id: string; resource_id: string }
  db.close()
  const archive = new AiEvidenceArchive(file, { id, projectId: owner.project_id, resourceId: owner.resource_id }, true)
  try {
    const started = performance.now(), original = archive.analysisInventory()
    const selected = eventAnalysisOriginalInputs(original)
    const rows: EvidenceRecord[] = selected.map(i => archive.readAnalysisInput(i))
    const aggregates = buildEventAnalysisRecords(archive)
    const inputs = [...rows.filter(r => !r.key!.startsWith('search:')), ...aggregates, ...rows.filter(r => r.key!.startsWith('search:'))]
    const batches = [...evidenceBatches(inputs, 60000)]
    function* originalRecords() { for (const input of original.inputs) yield archive.readAnalysisInput(input) }
    let originalLeafBatches = 0; for (const _batch of evidenceBatches(originalRecords(), 60000)) originalLeafBatches++
    const deckAggregates = new Map(aggregates.filter(r => r.key?.startsWith('event-statistics:')).map(r => [(r.data as any).deckKey, r.data as any]))
    let playerSides = 0
    for (const original of archive.deckStatistics()) {
      const current = deckAggregates.get(original.deckKey)!
      expect(current.participations).toBe(original.occurrences)
      expect(current.recordsAvailable).toBe(original.recordsAvailable)
      expect(current.fieldRecord).toEqual(original.fieldRecord)
      expect(current.placements).toEqual(original.placements.map(p => [p.placing, p.count]))
      expect(current.events.reduce((n: number, event: any[]) => n + event[3], 0)).toBe(current.participations)
      playerSides += current.matchups.reduce((n: number, match: any[]) => n + [3, 4, 5, 7, 8, 9, 10].reduce((sum, i) => sum + match[i], 0), 0)
    }
    expect(playerSides).toBe((aggregates.find(r => r.key === 'event-coverage')!.data as any).resolvedSelectedPlayerSides)
    const report = { schemaVersion: 1, label: 'Real APP-184 snapshot; offline representation only, zero model calls',
      originalRecords: original.inputs.length, analysisRecords: inputs.length, originalLeafBatches,
      aggregateLeafBatches: batches.length, inputBytes: batches.reduce((n, b) => n + Buffer.byteLength(JSON.stringify(b)), 0),
      byKind: Object.fromEntries([...new Set([...rows, ...aggregates].map(r => r.key!.split(':')[0]))].map(kind => [kind, {
        records: [...rows, ...aggregates].filter(r => r.key!.split(':')[0] === kind).length,
        bytes: [...rows, ...aggregates].filter(r => r.key!.split(':')[0] === kind).reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r)), 0) }])),
      coverage: aggregates.find(r => r.key === 'event-coverage')?.data, checks: { everyDeckFieldRecordAndPlacementReconciled: true,
        eventParticipationTotalsReconciled: true, matchupPlayerSidesReconciled: true }, durationMs: Math.round(performance.now() - started) }
    if (process.env.POKEGURU_EVENT_METRICS) writeFileSync(process.env.POKEGURU_EVENT_METRICS, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report))
    expect(batches.length).toBeLessThanOrEqual(350)
    expect((report.coverage as any).uniqueParticipations).toBe(archive.counts().occurrences)
    expect((report.coverage as any).uniquePairings).toBe(archive.counts().pairings)
  } finally { archive.close() }
}, 180000)
