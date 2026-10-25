import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TournamentSnapshot, TournamentSummary, TournamentSyncProgress } from '../shared/tournament'
import type { MainTournamentSnapshot, MainTournamentSummary, MainTournamentSyncProgress } from '../shared/main-tournament'

const initialProgress: TournamentSyncProgress = {
  mode: null, status: 'idle', page: 1, pending: [], inspected: 0, saved: 0, skipped: 0,
  watermark: null, previousWatermark: null, newestSeen: null, stopAfterPage: false,
  cooldownUntil: null, lastError: null
}
const initialMainProgress: MainTournamentSyncProgress = {
  mode: null, status: 'idle', page: 1, maxPages: null, pendingEvents: [], pendingLists: [], inspectedEvents: 0,
  fetchedLists: 0, watermark: null, previousWatermark: null, newestSeen: null,
  stopAfterPage: false, cooldownUntil: null, lastError: null
}

export class TournamentStore {
  private readonly db: DatabaseSync

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.db = new DatabaseSync(filePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec(`CREATE TABLE IF NOT EXISTS tournament_snapshots (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      payload TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS tournament_snapshots_recent
      ON tournament_snapshots(fetched_at DESC);
    CREATE INDEX IF NOT EXISTS tournament_snapshots_event
      ON tournament_snapshots(event_id);
    CREATE TABLE IF NOT EXISTS tournament_sync (
      key TEXT PRIMARY KEY CHECK (key = 'play'),
      payload TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS main_tournament_snapshots (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      payload TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS main_tournament_snapshots_event
      ON main_tournament_snapshots(event_id);
    CREATE TABLE IF NOT EXISTS main_tournament_sync (
      key TEXT PRIMARY KEY CHECK (key = 'main'),
      payload TEXT NOT NULL
    ) STRICT;`)
    // A first upgrade pins every legacy snapshot: its historical purpose cannot be inferred.
    const hasPins = this.db.prepare(`SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'main_tournament_snapshot_pins'`).get()
    if (!hasPins) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db.exec(`CREATE TABLE main_tournament_snapshot_pins (
          id TEXT PRIMARY KEY REFERENCES main_tournament_snapshots(id) ON DELETE CASCADE
        ) STRICT;
        INSERT INTO main_tournament_snapshot_pins (id)
          SELECT id FROM main_tournament_snapshots;`)
        this.db.exec('COMMIT')
      } catch (error) { this.db.exec('ROLLBACK'); throw error }
    }
  }

  save(snapshot: TournamentSnapshot): TournamentSnapshot {
    this.db.prepare(`INSERT OR IGNORE INTO tournament_snapshots
      (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)`)
      .run(snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
    return snapshot
  }

  latest(): TournamentSnapshot | null {
    const row = this.db.prepare('SELECT payload FROM tournament_snapshots ORDER BY fetched_at DESC, rowid DESC LIMIT 1')
      .get() as { payload: string } | undefined
    return row ? { ...JSON.parse(row.payload) as TournamentSnapshot, cached: true } : null
  }

  list(): TournamentSnapshot[] {
    const rows = this.db.prepare(`SELECT payload FROM tournament_snapshots
      WHERE rowid IN (SELECT MAX(rowid) FROM tournament_snapshots GROUP BY event_id)`)
      .all() as { payload: string }[]
    return rows.map((row) => ({ ...JSON.parse(row.payload) as TournamentSnapshot, cached: true }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.eventId.localeCompare(b.eventId))
  }

  summaries(): TournamentSummary[] {
    const rows = this.db.prepare(`SELECT event_id, json_extract(payload, '$.name') AS name,
      json_extract(payload, '$.date') AS date, json_extract(payload, '$.circuit') AS circuit,
      json_extract(payload, '$.platform') AS platform,
      json_extract(payload, '$.isOnline') AS is_online,
      json_extract(payload, '$.reportedPlayers') AS reported_players,
      json_extract(payload, '$.coverage') AS coverage,
      json_extract(payload, '$.pairingCoverage') AS pairing_coverage
      FROM tournament_snapshots
      WHERE rowid IN (SELECT MAX(rowid) FROM tournament_snapshots GROUP BY event_id)
      ORDER BY date DESC, event_id`).all() as {
        event_id: string; name: string; date: string; circuit: TournamentSummary['circuit']
        platform: string; is_online: number; reported_players: number
        coverage: string; pairing_coverage: string | null
      }[]
    return rows.map((row) => ({ eventId: row.event_id, name: row.name, date: row.date,
      circuit: row.circuit, platform: row.platform, isOnline: !!row.is_online,
      reportedPlayers: row.reported_players,
      coverage: JSON.parse(row.coverage) as TournamentSummary['coverage'],
      ...(row.pairing_coverage ? { pairingCoverage: JSON.parse(row.pairing_coverage) as TournamentSummary['pairingCoverage'] } : {}) }))
  }

  getEvent(eventId: string): TournamentSnapshot | null {
    const row = this.db.prepare('SELECT payload FROM tournament_snapshots WHERE event_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(eventId) as { payload: string } | undefined
    return row ? { ...JSON.parse(row.payload) as TournamentSnapshot, cached: true } : null
  }

  hasEvent(eventId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM tournament_snapshots WHERE event_id = ? LIMIT 1').get(eventId)
  }

  progress(): TournamentSyncProgress {
    const row = this.db.prepare("SELECT payload FROM tournament_sync WHERE key = 'play'").get() as
      { payload: string } | undefined
    return row ? { ...initialProgress, ...JSON.parse(row.payload) as TournamentSyncProgress } : { ...initialProgress }
  }

  saveProgress(progress: TournamentSyncProgress): void {
    this.db.prepare(`INSERT INTO tournament_sync (key, payload) VALUES ('play', ?)
      ON CONFLICT(key) DO UPDATE SET payload = excluded.payload`).run(JSON.stringify(progress))
  }

  saveMain(snapshot: MainTournamentSnapshot, completed = false): MainTournamentSnapshot {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`INSERT OR IGNORE INTO main_tournament_snapshots
        (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)`).run(
        snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
      if (completed) this.db.prepare(`INSERT OR IGNORE INTO main_tournament_snapshot_pins (id)
        VALUES (?)`).run(snapshot.id)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return snapshot
  }

  /** Removes only unpinned intermediate revisions; callers must supply IDs cited by persisted AI evidence. */
  pruneMainIntermediates(referencedIds: ReadonlySet<string>): number {
    const rows = this.db.prepare(`SELECT s.id, s.event_id, p.id IS NOT NULL AS pinned
      FROM main_tournament_snapshots s LEFT JOIN main_tournament_snapshot_pins p ON p.id = s.id
      ORDER BY s.rowid DESC`).all() as { id: string; event_id: string; pinned: number }[]
    const newest = new Set<string>()
    const removed: string[] = []
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const remove = this.db.prepare('DELETE FROM main_tournament_snapshots WHERE id = ?')
      for (const row of rows) {
        // The latest row must survive even if it is still being populated.
        if (!newest.has(row.event_id)) { newest.add(row.event_id); continue }
        if (!row.pinned && !referencedIds.has(row.id)) { remove.run(row.id); removed.push(row.id) }
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return removed.length
  }

  getMain(eventId: string): MainTournamentSnapshot | null {
    const row = this.db.prepare('SELECT payload FROM main_tournament_snapshots WHERE event_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(eventId) as { payload: string } | undefined
    return row ? { ...JSON.parse(row.payload) as MainTournamentSnapshot, cached: true } : null
  }

  listMain(): MainTournamentSnapshot[] {
    const rows = this.db.prepare(`SELECT payload FROM main_tournament_snapshots
      WHERE rowid IN (SELECT MAX(rowid) FROM main_tournament_snapshots GROUP BY event_id)`)
      .all() as { payload: string }[]
    return rows.map((row) => ({ ...JSON.parse(row.payload) as MainTournamentSnapshot, cached: true }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.eventId.localeCompare(b.eventId))
  }

  mainSummaries(): MainTournamentSummary[] {
    const rows = this.db.prepare(`SELECT event_id, json_extract(payload, '$.name') AS name,
      json_extract(payload, '$.date') AS date, json_extract(payload, '$.country') AS country,
      json_extract(payload, '$.players') AS players, json_extract(payload, '$.url') AS url,
      json_extract(payload, '$.coverage') AS coverage
      FROM main_tournament_snapshots
      WHERE rowid IN (SELECT MAX(rowid) FROM main_tournament_snapshots GROUP BY event_id)
      ORDER BY date DESC, event_id`).all() as {
        event_id: string; name: string; date: string; country: string
        players: number; url: string; coverage: string
      }[]
    return rows.map((row) => ({ eventId: row.event_id, name: row.name, date: row.date,
      country: row.country, players: row.players, url: row.url,
      coverage: JSON.parse(row.coverage) as MainTournamentSummary['coverage'] }))
  }

  mainProgress(): MainTournamentSyncProgress {
    const row = this.db.prepare("SELECT payload FROM main_tournament_sync WHERE key = 'main'").get() as
      { payload: string } | undefined
    return row ? { ...initialMainProgress, ...JSON.parse(row.payload) as MainTournamentSyncProgress }
      : { ...initialMainProgress }
  }

  saveMainProgress(progress: MainTournamentSyncProgress): void {
    this.db.prepare(`INSERT INTO main_tournament_sync (key, payload) VALUES ('main', ?)
      ON CONFLICT(key) DO UPDATE SET payload = excluded.payload`).run(JSON.stringify(progress))
  }

  close(): void { this.db.close() }
}
