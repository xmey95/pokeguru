import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { retainedIds } from '../src/main/retention-index'

// Paired measurements, same fixture/process and returned payloads. No timing assertions.
it.skipIf(process.env.POKEGURU_HISTORY_PERF !== '1')('measures deep events, history windows and normalized retention', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-history-perf-')), path = join(folder, 'test.sqlite')
  const store = new ProjectStore(path), jobs = new AiJobStore(path), db = new DatabaseSync(path)
  const project = store.create({ name: 'Bench', format: 'STANDARD' })
  const owner = jobs.start('thread-ask', project.id, 'bench'), archive = new AiEvidenceArchive(path, owner)
  const measure = (fn: () => unknown, count = 1) => {
    const start = performance.now(); for (let i = 0; i < count; i++) fn()
    return Math.round((performance.now() - start) * 100) / 100
  }
  const median = (fn: () => unknown) => { fn(); return Array.from({ length: 7 }, () => measure(fn)).sort((a, b) => a - b)[3] }
  try {
    archive.saveValue('fixture', 'object', { original: true })
    const hash = (db.prepare('SELECT object_hash FROM ai_evidence_values WHERE job_id = ?').get(owner.id) as { object_hash: string }).object_hash
    const add = db.prepare('INSERT INTO ai_evidence_event_index VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    db.exec('BEGIN')
    for (let i = 0; i < 80_000; i++) add.run(owner.id, String(i).padStart(6, '0'), `deck-${i % 200}`, '2026-10-29',
      i % 4 ? i % 64 : null, 'Deck', 'alpha beta', 'card', hash)
    db.exec('COMMIT')
    const query = { from: '2026-01-01', to: '2026-12-31', deck: 'beta', card: '', offset: 79_950, limit: 50 }
    const connection = (archive as unknown as { db: DatabaseSync; get<T>(hash: string): T }).db
    const originalReader = archive as unknown as { get<T>(hash: string): T }
    const legacy = connection.prepare(`SELECT object_hash FROM ai_evidence_event_index WHERE job_id = ?
      AND date >= ? AND date <= ? AND instr(deck_text, ?) > 0 ORDER BY date DESC, placing IS NULL, placing, key LIMIT 50 OFFSET ?`)
    const oldPage = () => (legacy.all(owner.id, query.from, query.to, query.deck, query.offset) as { object_hash: string }[])
      .map((row) => originalReader.get(row.object_hash))
    const coldPageMs = measure(() => archive.eventPage(query))
    expect(archive.eventPage(query).rows).toEqual(oldPage())
    const deepPage20BeforeMs = measure(oldPage, 20), deepPage20AfterMs = measure(() => archive.eventPage(query), 20)
    const baseline = store.importDeck({ projectId: project.id, source: 'paste', rawText: '60 Basic Psychic Energy' })
    const thread = store.createDeckThread({ projectId: project.id, title: 'History' })
    const addVersion = db.prepare(`INSERT INTO deck_versions
      SELECT ?, project_id, ?, source, file_name, raw_text, parsed_json, created_at FROM deck_versions WHERE id = ?`)
    const addMessage = db.prepare(`INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at, evidence_json)
      VALUES (?, ?, 'assistant', 'History', '2026-10-29', ?)`)
    db.exec('BEGIN')
    for (let i = 2; i <= 3000; i++) addVersion.run(`version-${i}`, i, baseline.versionId!)
    for (let i = 0; i < 3000; i++) addMessage.run(`message-${i}`, thread.id,
      JSON.stringify({ events: [{ snapshotId: `event-${i % 100}` }], padding: 'x'.repeat(8000) }))
    db.exec('COMMIT')
    const oldRetention = db.prepare(`SELECT DISTINCT json_extract(event.value, '$.snapshotId') AS id
      FROM deck_thread_messages message, json_each(message.evidence_json, '$.events') event
      WHERE json_type(event.value, '$.snapshotId') = 'text'`)
    const beforeIds = (oldRetention.all() as { id: string }[]).map((row) => row.id).sort()
    expect([...retainedIds(db, 'snapshot')].sort()).toEqual(beforeIds)
    const writePayload = JSON.stringify({ events: [{ snapshotId: 'write-event' }], padding: 'x'.repeat(8000) })
    const writeSample = (references: boolean) => {
      db.exec('SAVEPOINT write_benchmark')
      try {
        if (!references) db.exec('DROP TRIGGER retention_deck_thread_messages_insert')
        return measure(() => {
          for (let i = 0; i < 200; i++) addMessage.run(`write-${i}`, thread.id, writePayload)
        })
      } finally { db.exec('ROLLBACK TO write_benchmark; RELEASE write_benchmark') }
    }
    const writeMedian = (references: boolean) => Array.from({ length: 7 }, () => writeSample(references)).sort((a, b) => a - b)[3]
    const metrics = {
      fixture: { events: 80000, versions: 3000, messages: 3000, messagePaddingBytes: 24_000_000 },
      coldEventPageMs: coldPageMs, deepPage20BeforeMs, deepPage20AfterMs,
      versionsBeforeMs: median(() => store.listDeckVersions(project.id)), versionsAfterMs: median(() => store.listDeckVersionPage(project.id)),
      threadBeforeMs: median(() => store.getDeckThread(project.id, thread.id)), threadAfterMs: median(() => store.getDeckThreadWindow(project.id, thread.id)),
      retentionBeforeMs: median(() => oldRetention.all()), retentionAfterMs: median(() => retainedIds(db, 'snapshot')),
      insert200WithoutReferencesMs: writeMedian(false), insert200WithReferencesMs: writeMedian(true),
      eventTempBytes: Number(connection.prepare('PRAGMA temp.page_count').get()!.page_count) *
        Number(connection.prepare('PRAGMA temp.page_size').get()!.page_size),
      versionPayloadBefore: JSON.stringify(store.listDeckVersions(project.id)).length,
      versionPayloadAfter: JSON.stringify(store.listDeckVersionPage(project.id)).length
    }
    if (process.env.POKEGURU_HISTORY_PERF_OUTPUT) writeFileSync(process.env.POKEGURU_HISTORY_PERF_OUTPUT, JSON.stringify(metrics, null, 2) + '\n')
    else console.log(JSON.stringify(metrics))
  } finally { archive.close(); db.close(); jobs.close(); store.close(); rmSync(folder, { recursive: true, force: true }) }
}, 120_000)
