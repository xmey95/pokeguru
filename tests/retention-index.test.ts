import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { ensureRetentionIndex, retainedCardLines, retainedIds } from '../src/main/retention-index'
import { completeDatabaseMigration, prepareDatabaseMigration } from '../src/main/database-migrations'

it('backs up v15 and derives legacy references once, preserving payloads and transactional updates/deletes', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-retention-index-')), path = join(folder, 'test.sqlite')
  let store = new ProjectStore(path)
  let db = new DatabaseSync(path)
  try {
    const project = store.create({ name: 'References', format: 'STANDARD' })
    store.importDeck({ projectId: project.id, source: 'paste', rawText: '4 Flabébé TST 001\n56 Basic Psychic Energy' })
    const thread = store.createDeckThread({ projectId: project.id, title: 'Sources', openingNote: 'Question' })
    const message = thread.messages[0].id
    const original = JSON.stringify({ events: [{ snapshotId: 'direct-event' }], cards: [{ printId: 'direct-print' }],
      aiQueries: { requests: [
        { query: { operation: 'catalog.search' }, data: { matches: [{ printId: 'query-print' }] } },
        { query: { operation: 'events.search' }, data: { lists: [{ snapshotId: 'legacy-event', occurrences: [{ snapshotId: 'nested-event' }] }] } }
      ] } })
    db.prepare('UPDATE deck_thread_messages SET evidence_json = ? WHERE id = ?').run(original, message)
    store.close()
    // Reconstruct the previous on-disk schema, including existing original JSON.
    for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'retention_%' OR name LIKE 'matchup_report_summary_%')").all() as { name: string }[])
      db.exec(`DROP TRIGGER "${row.name}"`)
    db.exec('DROP TABLE retention_references; DROP TABLE retention_card_lines; DROP TABLE retention_sources; DROP TABLE matchup_report_summaries; PRAGMA user_version = 15')
    db.close()
    const migration = await prepareDatabaseMigration(path)
    expect(migration.fromVersion).toBe(15)
    expect(existsSync(`${migration.backupPath}.verified`)).toBe(true)
    const backup = new DatabaseSync(migration.backupPath!, { readOnly: true })
    expect(backup.prepare('PRAGMA user_version').get()!.user_version).toBe(15)
    expect(backup.prepare("SELECT name FROM sqlite_master WHERE name='retention_references'").get()).toBeUndefined()
    expect(backup.prepare('SELECT evidence_json FROM deck_thread_messages WHERE id = ?').get(message)!.evidence_json).toBe(original)
    backup.close()
    store = new ProjectStore(path)
    completeDatabaseMigration(path, migration)
    db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys = ON')
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(16)
    expect(db.prepare('SELECT evidence_json FROM deck_thread_messages WHERE id = ?').get(message)!.evidence_json).toBe(original)
    expect([...store.referencedTournamentSnapshotIds()].sort()).toEqual(['direct-event', 'legacy-event', 'nested-event'])
    expect([...retainedIds(db, 'print')].sort()).toEqual(['direct-print', 'query-print'])
    expect([...retainedCardLines(db)]).toContainEqual({ setCode: 'TST', cardNumber: '001', name: 'Flabébé' })
    const count = db.prepare('SELECT count(*) AS n FROM retention_references').get()!.n
    ensureRetentionIndex(db)
    expect(db.prepare('SELECT count(*) AS n FROM retention_references').get()!.n).toBe(count)
    db.exec('BEGIN')
    db.prepare('UPDATE deck_thread_messages SET evidence_json = ? WHERE id = ?')
      .run(JSON.stringify({ events: [{ snapshotId: 'replacement' }] }), message)
    expect([...retainedIds(db, 'snapshot')]).toEqual(['replacement'])
    db.exec('ROLLBACK')
    expect([...retainedIds(db, 'snapshot')].sort()).toEqual(['direct-event', 'legacy-event', 'nested-event'])
    db.prepare('UPDATE deck_thread_messages SET evidence_json = ? WHERE id = ?').run('{"events":["bad",null,2]}', message)
    expect([...retainedIds(db, 'snapshot')]).toEqual([])
    db.prepare('UPDATE deck_thread_messages SET evidence_json = ? WHERE id = ?').run(original, message)
    db.prepare('DELETE FROM deck_threads WHERE id = ?').run(thread.id)
    expect([...retainedIds(db, 'snapshot')]).toEqual([])
    expect([...retainedIds(db, 'print')]).toEqual([])
    expect([...retainedCardLines(db)]).toHaveLength(1)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    const plan = JSON.stringify(db.prepare("EXPLAIN QUERY PLAN SELECT DISTINCT target FROM retention_references WHERE kind = 'snapshot'").all())
    expect(plan).toContain('COVERING INDEX retention_reference_target')
    expect(plan).not.toContain('TEMP B-TREE')
  } finally { db.close(); store.close(); rmSync(folder, { recursive: true, force: true }) }
})
