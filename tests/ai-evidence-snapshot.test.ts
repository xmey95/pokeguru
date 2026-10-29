import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { createArchivedEvidenceEngine } from '../src/main/ai-evidence-snapshot'
import { collectArchivedEvidence } from '../src/main/ai-evidence-collection'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { verifyDatabase } from '../src/main/database-migrations'
import { CATALOG_SOURCE, type CatalogView } from '../src/shared/catalog'
import type { TournamentSnapshot } from '../src/shared/tournament'

const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE,
  sourceLanguage: 'en', scope: { kind: 'standard-marks', setIds: [], names: [] },
  syncedAt: '2026-10-25T00:00:00Z', sets: [], prints: [] }
const window = { from: '2026-10-01', to: '2026-10-25' }
function sample(count: number): TournamentSnapshot {
  return { id: 'snapshot-1', eventId: 'event-1', fetchedAt: '2026-10-25T00:00:00Z',
    source: 'Limitless Play API', sourceUrl: 'https://play.limitlesstcg.com/tournament/event-1',
    publicUrl: 'https://play.limitlesstcg.com/tournament/event-1', name: 'Cup', date: '2026-10-20',
    circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL', isOnline: true,
    reportedPlayers: count, phases: [], cached: true,
    coverage: { returnedParticipants: count, availableLists: count, invalidLists: 0,
      missingLists: 0, complete60Lists: count },
    participations: Array.from({ length: count }, (_, i) => ({ playerId: `p${i}`, playerName: `P${i}`,
      country: null, placing: i + 1, record: { wins: 3, losses: 1, ties: 1 },
      deck: { id: 'gardevoir', name: 'Gardevoir' }, listStatus: 'available', cardTotal: 60,
      cards: [{ category: 'pokemon', count: 4, name: 'Gardevoir ex', set: 'SVI', number: '86' },
        { category: 'energy', count: 56, name: 'Basic Psychic Energy', set: 'SVE', number: '5' }] })) }
}
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-frozen-sources-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Snapshot', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'thread')
  let archive = new AiEvidenceArchive(file, job)
  return { file, projects, project, jobs, job, get archive() { return archive },
    reopen() { archive.close(); archive = new AiEvidenceArchive(file, job) },
    close() { archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}

it('bounds pages by participations and resumes the same inventory after sources change', async () => {
  const f = fixture()
  try {
    const original = sample(101)
    const { engine } = createArchivedEvidenceEngine(f.archive, () => ({ catalog, window, play: [original], main: [] }))
    expect(engine.eventTargets('Confronta Gardevoir')).toEqual(['Gardevoir'])
    const query = { operation: 'events.search', deckName: 'Gardevoir', limit: 4 }
    const first = engine.execute(query)
    expect(first.data).toMatchObject({ scope: { matchingLists: 101, distinctDecks: 1, duplicateLists: 100 },
      paginationUnit: 'participation', remaining: 97 })
    expect((first.data as { lists: { occurrences: unknown[] }[] }).lists[0].occurrences).toHaveLength(4)
    const controller = new AbortController()
    await expect(collectArchivedEvidence(query, engine, f.archive, { signal: controller.signal,
      onPage: (_, search) => { if (search.pages === 3) controller.abort('pause') } })).rejects.toThrow(/pausa/)
    f.reopen()
    const reopened = createArchivedEvidenceEngine(f.archive, () => { throw new Error('New inventory must not be read') })
    expect(reopened.catalog.syncedAt).toBe(catalog.syncedAt)
    await collectArchivedEvidence(query, reopened.engine, f.archive)
    expect(f.archive.counts()).toMatchObject({ pages: 26, decks: 1, occurrences: 101 })
    expect([...f.archive.deckStatistics()][0]).toMatchObject({ occurrences: 101,
      fieldRecord: { wins: 303, losses: 101, ties: 101, denominator: 505 } })
    const placements = [...f.archive.records('occurrence')].map((r) => (r.data as { placing: number }).placing)
      .sort((a, b) => a - b)
    expect(placements).toEqual(Array.from({ length: 101 }, (_, i) => i + 1))
    expect(reopened.engine.execute({ ...query, from: '2026-09-01' }).status).toBe('rejected')
  } finally { f.close() }
})

it('rolls back an interrupted snapshot and excludes events outside its original window', () => {
  const f = fixture()
  try {
    const original = sample(3)
    function* brokenSource() { yield original; throw new Error('source interrupted') }
    expect(() => createArchivedEvidenceEngine(f.archive, () => ({ catalog, window,
      play: brokenSource(), main: [] }))).toThrow('source interrupted')
    expect(f.archive.value('snapshot', 'sources')).toBeUndefined()
    const db = new DatabaseSync(f.file, { readOnly: true })
    try { expect(db.prepare('SELECT count(*) AS count FROM ai_evidence_event_index').get()).toMatchObject({ count: 0 }) }
    finally { db.close() }
    const engine = createArchivedEvidenceEngine(f.archive, () => ({ catalog, window,
      play: [original, { ...sample(1), id: 'old', eventId: 'old', date: '2026-09-01' }], main: [] })).engine
    expect(engine.execute({ operation: 'events.search', cardName: 'Gardevoir ex' }).data)
      .toMatchObject({ scope: { matchingLists: 3, listsInspected: 3 } })
  } finally { f.close() }
})

it('retains sources through garbage collection and removes them only with their owning project', () => {
  const f = fixture()
  try {
    createArchivedEvidenceEngine(f.archive, () => ({ catalog, window, play: [sample(3)], main: [] }))
    f.jobs.transition(f.job.id, 'applied')
    f.projects.archive(f.project.id)
    f.projects.deleteArchived(f.project.id, f.project.name)
    const db = new DatabaseSync(f.file, { readOnly: true })
    try {
      expect(db.prepare('SELECT count(*) AS count FROM ai_evidence_event_index').get()).toMatchObject({ count: 0 })
      expect(db.prepare('SELECT count(*) AS count FROM ai_evidence_objects').get()).toMatchObject({ count: 0 })
    } finally { db.close() }
  } finally { f.close() }
})

it('includes immutable sources, originals and cursors in a verified SQLite backup', async () => {
  const f = fixture()
  try {
    const { engine } = createArchivedEvidenceEngine(f.archive, () => ({ catalog, window, play: [sample(7)], main: [] }))
    const query = { operation: 'events.search', deckName: 'Gardevoir', limit: 4 }
    const saved = await collectArchivedEvidence(query, engine, f.archive)
    const destination = `${f.file}.backup`
    const db = new DatabaseSync(f.file, { readOnly: true })
    try { await backup(db, destination) } finally { db.close() }
    verifyDatabase(destination)
    const restored = new AiEvidenceArchive(destination, f.job, true)
    try {
      expect(restored.counts()).toEqual(f.archive.counts())
      expect(restored.page(saved.key, 1)).toEqual(f.archive.page(saved.key, 1))
      expect(restored.value('snapshot', 'sources')).toEqual(f.archive.value('snapshot', 'sources'))
      expect(restored.value('snapshot', 'sources')).toMatchObject({ catalog, window,
        eventCoverage: [{ id: 'play:event-1', returnedParticipants: 7, completeLists: 7 }] })
      expect(() => restored.saveValue('input', 'forbidden', 1)).toThrow()
    } finally { restored.close() }
    expect(() => new AiEvidenceArchive(destination, { ...f.job, projectId: 'other' }, true)).toThrow(/progetto/)
  } finally { f.close() }
})
