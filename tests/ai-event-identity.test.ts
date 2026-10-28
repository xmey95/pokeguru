import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { AiEvidenceArchive, evidenceHash, exactDeckIdentity } from '../src/main/ai-evidence-archive'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { collectArchivedEvidence } from '../src/main/ai-evidence-collection'
import { evidenceEventRows, normalizedEvidenceText } from '../src/main/ai-evidence-engine'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { CATALOG_SOURCE, type CatalogView } from '../src/shared/catalog'
import { sharedEventList } from './fixtures/shared-event-list'

const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
  scope: { kind: 'standard-marks', setIds: [], names: [] }, syncedAt: null, sets: [], prints: [] }
const window = { from: '2026-10-01', to: '2026-10-28' }
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-event-identity-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Identity fixture', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'thread')
  let archive = new AiEvidenceArchive(file, job)
  return { file, get archive() { return archive },
    reopen() { archive.close(); archive = new AiEvidenceArchive(file, job) },
    close() { archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}

it('retains each participant sharing a URL, including tied placements without player IDs, across pages and overlapping queries', async () => {
  const f = fixture()
  try {
    const { engine } = createArchivedEvidenceEngine(f.archive, () => ({ catalog, window, play: [], main: [sharedEventList()] }))
    const query = { operation: 'events.search', deckName: 'Shared deck', limit: 1 }
    const controller = new AbortController()
    await expect(collectArchivedEvidence(query, engine, f.archive, { signal: controller.signal,
      onPage: (_, search) => { if (search.pages === 2) controller.abort('pause') } })).rejects.toThrow(/pausa/)
    expect(f.archive.counts().occurrences).toBe(2)
    f.reopen()
    const resumed = createArchivedEvidenceEngine(f.archive, () => { throw new Error('Sealed input must be reused') }).engine
    await collectArchivedEvidence(query, resumed, f.archive)
    await collectArchivedEvidence({ operation: 'events.search', cardName: 'Psychic', limit: 3 }, resumed, f.archive)
    expect(f.archive.counts()).toMatchObject({ occurrences: 4, decks: 1 })
    expect([...f.archive.deckStatistics()][0]).toMatchObject({ occurrences: 4, events: 1,
      placements: [{ placing: 1, count: 1 }, { placing: 2, count: 1 }, { placing: 3, count: 2 }] })
    const rows = [...f.archive.records('occurrence')].map(row => row.data as { playerId: string | null; listUrl: string })
    expect(rows.map(row => row.playerId).filter(Boolean).sort()).toEqual(['player-0', 'player-1'])
    expect(new Set(rows.map(row => row.listUrl)).size).toBe(1)
    expect(resumed.execute(query).data).toMatchObject({ scope: { matchingLists: 4, distinctDecks: 1, duplicateLists: 3 } })
  } finally { f.close() }
})

it('deduplicates identical proven participants but rolls back conflicting records instead of discarding them', () => {
  const f = fixture()
  try {
    const event = sharedEventList()
    event.participants.push({ ...event.participants[0], placing: 20 })
    expect(() => createArchivedEvidenceEngine(f.archive, () => ({ catalog, window, play: [], main: [event] })))
      .toThrow('La stessa partecipazione contiene dati diversi')
    expect(f.archive.value('snapshot', 'sources')).toBeUndefined()
    const db = new DatabaseSync(f.file, { readOnly: true })
    try { expect(db.prepare('SELECT count(*) n FROM ai_evidence_event_index').get()).toMatchObject({ n: 0 }) }
    finally { db.close() }
    event.participants.pop(); event.participants.push(event.participants[0])
    const { engine } = createArchivedEvidenceEngine(f.archive, () => ({ catalog, window, play: [], main: [event, event] }))
    expect(engine.execute({ operation: 'events.search', deckName: 'Shared deck' }).data)
      .toMatchObject({ scope: { matchingLists: 4 } })
  } finally { f.close() }
})

it('reuses sealed v0.3.5 rows and already-collected occurrences without changing their keys or duplicating counts', async () => {
  const f = fixture()
  try {
    const event = sharedEventList()
    event.participants = event.participants.slice(0, 2).map((p, i) => ({ ...p,
      listUrl: `https://limitlesstcg.com/decks/list/${999990 + i}` }))
    const legacy = [...evidenceEventRows([], [event])].map(({ participationId: _, ...row }) => ({ ...row, playerId: null }))
    f.archive.captureSources({ catalog, window }, legacy.map(row => ({ key: evidenceHash([row.id, row.listUrl]),
      deckKey: exactDeckIdentity(row.cards), date: row.date, placing: row.placing, deckName: row.deck,
      deckText: normalizedEvidenceText(row.deck), cardsText: row.cards.map(normalizedEvidenceText).join('\n'), value: row })))
    const sources = () => { throw new Error('Do not replace historical sources') }
    const engine = createArchivedEvidenceEngine(f.archive, sources).engine
    const query = { operation: 'events.search', deckName: 'Shared deck', limit: 1 }
    const controller = new AbortController()
    await expect(collectArchivedEvidence(query, engine, f.archive, { signal: controller.signal,
      onPage: () => controller.abort('pause') })).rejects.toThrow(/pausa/)
    const before = [...f.archive.records('occurrence')]
    f.reopen()
    await collectArchivedEvidence(query, createArchivedEvidenceEngine(f.archive, sources).engine, f.archive)
    expect(f.archive.counts().occurrences).toBe(2)
    expect([...f.archive.records('occurrence')]).toEqual(expect.arrayContaining(before))
    expect([...f.archive.records('occurrence')].map(row => row.key).sort())
      .toEqual(legacy.map(row => `occurrence:${evidenceHash([row.id, row.listUrl])}`).sort())
  } finally { f.close() }
})
