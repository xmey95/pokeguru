import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { TournamentStore } from '../src/main/tournament-store'
import { CURRENT_SCHEMA_VERSION, prepareDatabaseMigration, completeDatabaseMigration } from '../src/main/database-migrations'

const payload = (i: number) => ({ eventId: `event-${i}`, name: `Event ${i}`, date: '2026-10-20', circuit: 'WESTERN',
  platform: 'PTCGL', isOnline: true, reportedPlayers: 100, country: 'IT', players: 100, url: 'https://example.test',
  coverage: { returnedParticipants: 100, availableLists: 80 }, participations: [{ original: 'immutable' }] })

it('backs up v14, backfills summaries, and maintains projections atomically without changing originals', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-summaries-')), path = join(folder, 'test.sqlite')
  let db = new DatabaseSync(path), store: TournamentStore | undefined
  try {
    db.exec(`CREATE TABLE tournament_snapshots(id TEXT PRIMARY KEY, event_id TEXT NOT NULL, fetched_at TEXT NOT NULL, payload TEXT NOT NULL) STRICT;
      CREATE TABLE main_tournament_snapshots(id TEXT PRIMARY KEY, event_id TEXT NOT NULL, fetched_at TEXT NOT NULL, payload TEXT NOT NULL) STRICT;
      PRAGMA user_version = 14;`)
    const original = JSON.stringify(payload(1))
    for (const table of ['tournament_snapshots', 'main_tournament_snapshots'])
      db.prepare(`INSERT INTO ${table} VALUES ('old', 'event-1', '2026-10-29', ?)`).run(original)
    db.close()
    const migration = await prepareDatabaseMigration(path)
    expect(migration.backupPath).toBeTruthy()
    store = new TournamentStore(path)
    completeDatabaseMigration(path, migration)
    db = new DatabaseSync(path)
    const backup = new DatabaseSync(migration.backupPath!, { readOnly: true })
    try {
      expect(backup.prepare('PRAGMA user_version').get()!.user_version).toBe(14)
      expect(backup.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%_summaries'").all()).toEqual([])
      expect(backup.prepare('SELECT payload FROM tournament_snapshots').get()!.payload).toBe(original)
    } finally { backup.close() }
    expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(CURRENT_SCHEMA_VERSION)
    expect(store.summaries()).toEqual([{ eventId: 'event-1', name: 'Event 1', date: '2026-10-20', circuit: 'WESTERN',
      platform: 'PTCGL', isOnline: true, reportedPlayers: 100, coverage: payload(1).coverage }])
    expect(store.mainSummaries()[0]).toMatchObject({ eventId: 'event-1', country: 'IT', players: 100 })
    expect(db.prepare('SELECT payload FROM tournament_snapshots').get()!.payload).toBe(original)
    for (const table of ['tournament_snapshots', 'main_tournament_snapshots']) {
      db.exec('BEGIN')
      db.prepare(`INSERT INTO ${table} VALUES ('rollback', 'event-2', '2026-10-29', ?)`).run(JSON.stringify(payload(2)))
      db.exec('ROLLBACK')
      expect(db.prepare(`SELECT 1 FROM ${table}_summaries WHERE snapshot_id = 'rollback'`).get()).toBeUndefined()
      db.prepare(`INSERT OR IGNORE INTO ${table} VALUES ('old', 'event-1', '2026-10-29', ?)`).run(JSON.stringify(payload(99)))
      db.prepare(`INSERT INTO ${table} VALUES ('new', 'event-1', '2026-10-01', ?)`).run(JSON.stringify({ ...payload(1), name: 'Latest insertion' }))
    }
    expect(store.summaries()[0].name).toBe('Latest insertion')
    expect(store.mainSummaries()[0].name).toBe('Latest insertion')
    expect([...store.iterate()][0].name).toBe('Latest insertion')
    expect([...store.iterateMain()][0].name).toBe('Latest insertion')
    db.prepare('UPDATE tournament_snapshots SET payload = ? WHERE id = ?').run(JSON.stringify({ ...payload(1), isOnline: false }), 'new')
    expect(store.summaries()[0].isOnline).toBe(false)
    db.exec("DELETE FROM tournament_snapshots WHERE id = 'old'")
    expect(db.prepare("SELECT 1 FROM tournament_snapshots_summaries WHERE snapshot_id = 'old'").get()).toBeUndefined()
    store.close(); store = new TournamentStore(path)
    expect(store.summaries()).toHaveLength(1)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally { store?.close(); if (db.isOpen) db.close(); rmSync(folder, { recursive: true, force: true }) }
})

it.skipIf(process.env.POKEGURU_DB_PERF !== '1')('compares repeated JSON summaries with compact projections', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-summary-perf-')), path = join(folder, 'test.sqlite')
  const store = new TournamentStore(path), db = new DatabaseSync(path)
  try {
    const insert = db.prepare('INSERT INTO tournament_snapshots VALUES (?, ?, ?, ?)')
    db.exec('BEGIN')
    for (let i = 0; i < 180; i++) insert.run(`s-${i}`, `event-${i}`, '2026-10-29', JSON.stringify({ ...payload(i), padding: 'x'.repeat(256_000) }))
    db.exec('COMMIT')
    const legacy = db.prepare(`SELECT event_id, json_extract(payload, '$.name'), json_extract(payload, '$.date') AS date,
      json_extract(payload, '$.circuit'), json_extract(payload, '$.platform'), json_extract(payload, '$.isOnline'),
      json_extract(payload, '$.reportedPlayers'), json_extract(payload, '$.coverage'), json_extract(payload, '$.pairingCoverage')
      FROM tournament_snapshots WHERE rowid IN (SELECT MAX(rowid) FROM tournament_snapshots GROUP BY event_id) ORDER BY date DESC, event_id`)
    const measure = (fn: () => unknown) => {
      fn(); const times = Array.from({ length: 7 }, () => { const start = performance.now(); fn(); return performance.now() - start }).sort((a, b) => a - b)
      return +times[3].toFixed(2)
    }
    const result = { events: 180, originalBytes: 180 * 256_000, legacyMedianMs: measure(() => legacy.all()),
      optimizedMedianMs: measure(() => store.summaries()), summaryBytes: db.prepare('SELECT sum(length(payload)) AS bytes FROM tournament_snapshots_summaries').get()!.bytes }
    console.log(result)
    if (process.env.POKEGURU_SUMMARY_OUTPUT) writeFileSync(process.env.POKEGURU_SUMMARY_OUTPUT, JSON.stringify(result, null, 2))
    expect(store.summaries()).toHaveLength(180)
  } finally { db.close(); store.close(); rmSync(folder, { recursive: true, force: true }) }
})
