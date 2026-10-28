import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive, collectUnusedEvidence, evidenceHash, exactDeckIdentity } from '../src/main/ai-evidence-archive'
import type { AiEvidenceQueryResult } from '../src/shared/ai-evidence'

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-evidence-archive-'))
  const file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Archive test', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'resource-a')
  let archive = new AiEvidenceArchive(file, job)
  return { file, projects, jobs, project, job, get archive() { return archive },
    reopen() { archive.close(); archive = new AiEvidenceArchive(file, job); return archive },
    close() { archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}
const result = (data: unknown, sourceIds: string[], query: unknown): AiEvidenceQueryResult =>
  ({ query, status: 'ok', data, sourceIds, fingerprint: evidenceHash([query, data]) })
const cards = ['4 Example Card MEG 001', '56 Basic Energy SVE 001']
const pairing = { phase: 1, round: 1, table: 2, match: null, player1: 'a', player2: 'b', winner: 'a' }
const occurrence = (player: string, placing: number) => ({
  id: 'play:event', snapshotId: 'snapshot', name: 'Tournament', date: '2026-10-28',
  deck: 'Example', listUrl: `https://example.test/event/player/${player}`, placing,
  record: { wins: player === 'a' ? 5 : 2, losses: player === 'a' ? 0 : 3, ties: 0 },
  pairings: [pairing] })

it('persists over 64 MB of originals with bounded chunks and reads the last page after reopen', () => {
  const f = fixture()
  try {
    const query = { operation: 'catalog.search', terms: ['draw'], limit: 1 }
    const search = f.archive.search(query)
    for (let page = 0; page < 70; page++) {
      const cursor = f.archive.getSearch(search.key)!.cursor
      const data = { matches: [{ printId: `card-${page}`, name: `Card ${page}`,
        gameplay: { effect: `${page}:` + 'original Unicode é🦜 '.repeat(50_000) },
        reason: 'text', matchedTerms: ['draw'] }], offset: page, remaining: 69 - page }
      f.archive.appendPage(search.key, cursor, result(data, [`card:card-${page}`], cursor),
        page === 69 ? null : { ...query, offset: page + 1 })
    }
    expect(f.archive.counts()).toMatchObject({ pages: 70, cards: 70, completedSearches: 1 })
    expect(f.archive.counts().responseBytes).toBeGreaterThan(64_000_000)
    const db = new DatabaseSync(f.file, { readOnly: true })
    expect((db.prepare('SELECT max(length(body)) AS size FROM ai_evidence_chunks').get() as { size: number }).size)
      .toBeLessThan(132_000)
    db.close()
    f.reopen()
    let count = 0
    for (const page of f.archive.pages(search.key)) {
      const match = (page.data as { matches: { printId: string; gameplay: { effect: string } }[] }).matches[0]
      expect(match.printId).toBe(`card-${count}`)
      expect(match.gameplay.effect).toBe(`${count}:` + 'original Unicode é🦜 '.repeat(50_000))
      count++
    }
    expect(count).toBe(70)
  } finally { f.close() }
}, 30_000)

it('deduplicates overlapping memberships without losing occurrences, results, pairings or original pages', () => {
  const f = fixture()
  try {
    const a = occurrence('a', 1), b = occurrence('b', 8)
    const inputs = [
      { query: { operation: 'events.search', deckName: 'Example', limit: 4 },
        lists: [{ ...a, cards, occurrences: [a, b] }] },
      { query: { operation: 'events.search', cardName: 'Example Card', limit: 1 },
        lists: [{ ...b, cards: [...cards].reverse(), occurrences: [b] }] }]
    const originals: AiEvidenceQueryResult[] = []
    for (const input of inputs) {
      const search = f.archive.search(input.query)
      const page = result({ scope: { matchingLists: input.lists[0].occurrences.length },
        lists: input.lists, remaining: 0 }, ['list:example'], search.cursor)
      originals.push(page)
      expect(f.archive.appendPage(search.key, search.cursor, page, null)).toBe(true)
      expect(f.archive.appendPage(search.key, search.cursor, page, null)).toBe(false)
    }
    expect(f.archive.counts()).toMatchObject({ searches: 2, pages: 2, decks: 1, occurrences: 2, pairings: 1 })
    f.reopen()
    expect([...f.archive.pages()]).toEqual(originals)
    expect([...f.archive.records('occurrence')].map((row) => row.data))
      .toEqual(expect.arrayContaining([expect.objectContaining({ record: { wins: 5, losses: 0, ties: 0 } }),
        expect.objectContaining({ placing: 8, record: { wins: 2, losses: 3, ties: 0 } })]))
    expect([...f.archive.records('pairing')][0].data).toEqual({ eventId: 'play:event', ...pairing })
    expect([...f.archive.deckStatistics()]).toEqual([{ deckKey: exactDeckIdentity(cards),
      occurrences: 2, events: 1, recordsAvailable: 2, fieldRecord: { wins: 7, losses: 3, ties: 0, denominator: 10 },
      placements: [{ placing: 1, count: 1 }, { placing: 8, count: 1 }],
      scope: 'observed-participations-against-event-field' }])
    expect(exactDeckIdentity(cards)).not.toBe(exactDeckIdentity(['4 Example Card MEG 002', cards[1]]))
    expect(exactDeckIdentity(cards)).toBe(exactDeckIdentity(['2 Example Card MEG 001', cards[1], '2 Example Card MEG 001']))
  } finally { f.close() }
})

it('commits the page and next cursor atomically, including all new objects', () => {
  const f = fixture()
  try {
    const search = f.archive.search({ operation: 'catalog.search', terms: ['draw'], limit: 1 })
    const page = result({ matches: [{ printId: 'card-a', name: 'A' }], remaining: 1 }, ['card:card-a'], search.cursor)
    const db = new DatabaseSync(f.file)
    db.exec(`CREATE TRIGGER test_interrupt BEFORE UPDATE ON ai_evidence_searches
      BEGIN SELECT RAISE(ABORT, 'simulated power interruption'); END`)
    expect(() => f.archive.appendPage(search.key, search.cursor, page, { offset: 1 }))
      .toThrow('simulated power interruption')
    expect(f.archive.counts()).toMatchObject({ pages: 0, cards: 0 })
    expect((db.prepare('SELECT count(*) AS count FROM ai_evidence_objects').get() as { count: number }).count).toBe(0)
    expect(f.reopen().getSearch(search.key)?.cursor).toEqual(search.cursor)
    db.exec('DROP TRIGGER test_interrupt')
    expect(f.archive.appendPage(search.key, search.cursor, page, { offset: 1 })).toBe(true)
    expect(f.archive.getSearch(search.key)?.cursor).toEqual({ offset: 1 })
    expect(() => f.archive.appendPage(search.key, { offset: 2 }, page, null)).toThrow('non corrente')
    db.close()
  } finally { f.close() }
})

it('pins immutable source inputs, rejects another owner and keeps changed runs separate', () => {
  const f = fixture()
  try {
    f.archive.saveValue('snapshot', 'catalog', { printId: 'original', value: 'old' })
    f.archive.saveValue('snapshot', 'catalog', { printId: 'original', value: 'old' })
    expect(() => f.archive.saveValue('snapshot', 'catalog', { printId: 'original', value: 'new' })).toThrow('immutabile')
    const second = f.projects.create({ name: 'Other', format: 'STANDARD' })
    expect(() => new AiEvidenceArchive(f.file, { ...f.job, projectId: second.id })).toThrow('non appartenente')
    expect(() => new AiEvidenceArchive(f.file, { ...f.job, resourceId: 'resource-b' })).toThrow('non appartenente')
    const otherJob = f.jobs.start('thread-ask', second.id, 'resource-b')
    const other = new AiEvidenceArchive(f.file, otherJob)
    expect(other.value('snapshot', 'catalog')).toBeUndefined()
    other.saveValue('snapshot', 'catalog', { printId: 'original', value: 'new' })
    expect(f.reopen().value('snapshot', 'catalog')).toEqual({ printId: 'original', value: 'old' })
    other.close()
  } finally { f.close() }
})

it('detects changed observations and corrupted storage instead of accepting stale evidence', () => {
  const f = fixture()
  try {
    const a = occurrence('a', 1)
    for (const [index, placing] of [1, 2].entries()) {
      const search = f.archive.search({ operation: 'events.search', deckName: index ? 'Other criterion' : 'Example' })
      const page = result({ lists: [{ ...a, cards, occurrences: [{ ...a, placing }] }] }, ['list:example'], search.cursor)
      if (!index) f.archive.appendPage(search.key, search.cursor, page, null)
      else expect(() => f.archive.appendPage(search.key, search.cursor, page, null)).toThrow('stesso snapshot')
    }
    expect(f.archive.counts()).toMatchObject({ pages: 1, occurrences: 1 })
    f.archive.saveValue('snapshot', 'large', 'x'.repeat(300_000))
    const db = new DatabaseSync(f.file)
    db.exec(`DELETE FROM ai_evidence_chunks WHERE ordinal = 1 AND object_hash IN
      (SELECT object_hash FROM ai_evidence_values WHERE role = 'snapshot' AND key = 'large')`)
    db.close()
    expect(() => f.archive.value('snapshot', 'large')).toThrow('incompleta')
  } finally { f.close() }
})

it('keeps page children and shared originals until their last owning run is deleted', () => {
  const f = fixture()
  try {
    const job = f.jobs.start('thread-ask', f.project.id, 'resource-other')
    const other = new AiEvidenceArchive(f.file, job)
    const search = f.archive.search({ operation: 'events.search', deckName: 'Example' })
    const page = result({ lists: [{ cards, occurrences: [occurrence('a', 1)] }] }, ['list:a'], search.cursor)
    f.archive.appendPage(search.key, search.cursor, page, null)
    const secondSearch = other.search({ operation: 'events.search', deckName: 'Example' })
    other.appendPage(secondSearch.key, secondSearch.cursor, page, null)
    const db = new DatabaseSync(f.file)
    db.exec('PRAGMA foreign_keys = ON')
    expect(collectUnusedEvidence(db)).toBe(0)
    db.prepare('DELETE FROM ai_evidence_runs WHERE job_id = ?').run(f.job.id)
    expect(collectUnusedEvidence(db)).toBe(0)
    expect([...other.pages()]).toEqual([page])
    db.prepare('DELETE FROM ai_evidence_runs WHERE job_id = ?').run(job.id)
    expect(collectUnusedEvidence(db)).toBeGreaterThan(0)
    expect((db.prepare('SELECT count(*) AS count FROM ai_evidence_objects').get() as { count: number }).count).toBe(0)
    other.close(); db.close()
  } finally { f.close() }
})
