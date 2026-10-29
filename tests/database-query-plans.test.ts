import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive, evidenceHash } from '../src/main/ai-evidence-archive'

it('seeks into deep pages and resolves poll/recovery queries without scans or sorting', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-query-plans-')), path = join(folder, 'test.sqlite')
  const projects = new ProjectStore(path), jobs = new AiJobStore(path), db = new DatabaseSync(path)
  try {
    const queries = [
      `SELECT id FROM ai_jobs WHERE project_id = 'p' AND resource_id = 'r' ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      `SELECT object_hash FROM ai_evidence_pages WHERE job_id = 'j' AND search_key = 's' ORDER BY sequence DESC LIMIT 1`,
      `SELECT object_hash FROM ai_evidence_event_index WHERE job_id = 'j' AND date >= '2026-01-01' AND date <= '2026-12-31'
        ORDER BY date DESC, placing IS NULL, placing, key LIMIT 50`,
      `SELECT 1 FROM matchup_turns WHERE json_extract(report_payload, '$.jobId') = 'j' LIMIT 1`
    ]
    for (const sql of queries) {
      const plan = JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all())
      expect(plan).toContain('SEARCH')
      expect(plan).not.toMatch(/SCAN |TEMP B-TREE/)
    }
    for (const [table, filter, range] of [
      ['ai_evidence_records', "job_id = 'j' AND kind = 'card' AND key > 'k' ORDER BY key", 'key>?'],
      ['ai_evidence_values', "job_id = 'j' AND role = 'r' AND key > 'k' ORDER BY key", 'key>?'],
      ['ai_evidence_pages', "job_id = 'j' AND search_key = 's' AND rowid > 10 ORDER BY rowid", 'rowid>?'],
      ['ai_evidence_searches', "job_id = 'j' AND rowid > 10 ORDER BY rowid", 'rowid>?'],
      ['ai_job_activity', "job_id = 'j' AND id < 100 ORDER BY id DESC", 'id<?']
    ]) {
      const plan = JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE ${filter} LIMIT 64`).all())
      expect(plan).toContain(range)
      expect(plan).not.toContain('TEMP B-TREE')
    }
    // Reverse lookups run once per deleted object; none may scan all memberships.
    for (const [table, column] of [['ai_evidence_links', 'child_hash'], ['ai_evidence_values', 'object_hash'],
      ['ai_evidence_records', 'object_hash'], ['ai_evidence_pages', 'object_hash'], ['ai_evidence_event_index', 'object_hash']]) {
      const plan = JSON.stringify(db.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM ${table} WHERE ${column} = 'hash'`).all())
      expect(plan).toContain('SEARCH')
      expect(plan).not.toContain('SCAN')
    }
  } finally { db.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('preserves page ordering, interleaved readers, counts, filtering and job isolation across reopen', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-page-regression-')), path = join(folder, 'test.sqlite')
  const projects = new ProjectStore(path), jobs = new AiJobStore(path)
  const project = projects.create({ name: 'A', format: 'STANDARD' })
  const owner = jobs.start('thread-ask', project.id, 'a'), otherOwner = jobs.start('thread-ask', project.id, 'b')
  let archive = new AiEvidenceArchive(path, owner)
  const other = new AiEvidenceArchive(path, otherOwner)
  try {
    const eventQuery = { from: '2026-01-01', to: '2026-12-31', deck: '', card: '', offset: 0, limit: 4 }
    expect(archive.eventPage(eventQuery).matchingLists).toBe(0)
    const rows = Array.from({ length: 135 }, (_, i) => ({ key: String(i).padStart(3, '0'), deckKey: `d-${i % 7}`,
      date: i % 2 ? '2026-10-20' : '2026-10-21', placing: i % 4 ? i % 5 : null,
      deckName: 'deck', deckText: i % 3 ? 'alpha' : 'beta', cardsText: i % 2 ? 'beta' : 'alpha', value: { i } }))
    archive.captureSources({}, rows)
    other.captureSources({}, [{ ...rows[0], value: { i: -1 } }])
    const expected = [...rows].sort((a, b) => b.date.localeCompare(a.date) ||
      Number(a.placing === null) - Number(b.placing === null) || (a.placing ?? 0) - (b.placing ?? 0) || a.key.localeCompare(b.key))
    const actual = []
    for (let offset = 0; offset < rows.length; offset += 4) actual.push(...archive.eventPage({ ...eventQuery, offset }).rows)
    expect(actual).toEqual(expected.map((r) => r.value))
    const connection = (archive as unknown as { db: DatabaseSync }).db
    const plan = JSON.stringify(connection.prepare(`EXPLAIN QUERY PLAN SELECT e.object_hash
      FROM temp.evidence_event_positions p JOIN ai_evidence_event_index e ON e.rowid = p.event_rowid
      WHERE p.slot = 0 AND p.ordinal >= 130 ORDER BY p.ordinal LIMIT 4`).all())
    expect(plan).toContain('ordinal>?')
    expect(plan).not.toMatch(/SCAN |TEMP B-TREE/)
    for (let i = 0; i < 12; i++) archive.eventPage({ ...eventQuery, card: `absent-${i}` })
    expect(connection.prepare('SELECT count(DISTINCT slot) AS n FROM temp.evidence_event_positions').get()!.n).toBeLessThanOrEqual(8)
    expect(archive.eventPage({ ...eventQuery, offset: 130 }).rows).toEqual(expected.slice(130, 134).map((r) => r.value))
    expect(archive.eventPage({ ...eventQuery, offset: 999 }).rows).toEqual([])
    expect(() => archive.eventPage({ ...eventQuery, offset: -1 })).toThrow()
    // A deck-only and a card-only filter must not share an aggregate cache key.
    for (const filter of [{ deck: 'alpha', card: '' }, { deck: '', card: 'alpha' }, { deck: 'beta', card: 'beta' }]) {
      const match = rows.filter((r) => r.deckText.includes(filter.deck) && r.cardsText.includes(filter.card))
      expect(archive.eventPage({ ...eventQuery, ...filter })).toMatchObject({ matchingLists: match.length,
        distinctDecks: new Set(match.map((r) => r.deckKey)).size, listsInspected: rows.length })
    }
    for (let i = 0; i < 135; i++) archive.saveValue('audit', String(i).padStart(3, '0'), { i })
    const first = archive.values('audit'), second = archive.values('audit')
    expect(first.next().value).toEqual(second.next().value)
    expect([...first]).toEqual([...second])
    const query = { operation: 'catalog.search', limit: 1 }
    const search = archive.search(query)
    for (let i = 0; i < 135; i++) {
      const cursor = archive.getSearch(search.key)!.cursor
      const data = { matches: [{ printId: String(i).padStart(3, '0'), name: `Card ${i}` }], remaining: 134 - i }
      archive.appendPage(search.key, cursor, { query: cursor, data, sourceIds: [], status: 'ok', fingerprint: evidenceHash(data) },
        i === 134 ? null : { ...query, offset: i + 1 })
    }
    expect([...archive.records('card')].map((r) => r.key)).toEqual(rows.map((r) => `card:${r.key}`))
    expect([...archive.records('card', ['card:001', 'card:134'])].map((r) => r.key)).toEqual(['card:001', 'card:134'])
    expect([...archive.records(undefined, [])]).toEqual([])
    expect([...archive.pages(search.key)]).toHaveLength(135)
    expect(other.eventPage(eventQuery)).toMatchObject({ matchingLists: 1, rows: [{ i: -1 }] })
    archive.close(); archive = new AiEvidenceArchive(path, owner, true)
    expect(archive.eventPage({ ...eventQuery, offset: 132 }).rows).toEqual(expected.slice(132).map((r) => r.value))
    expect(archive.page(search.key, 134)?.data).toMatchObject({ remaining: 0 })
  } finally { archive.close(); other.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
