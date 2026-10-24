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
    return this.list().map(({ eventId, name, date, circuit, platform, isOnline,
      reportedPlayers, coverage, pairingCoverage }) => ({ eventId, name, date, circuit,
      platform, isOnline, reportedPlayers, coverage, pairingCoverage }))
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

  saveMain(snapshot: MainTournamentSnapshot): MainTournamentSnapshot {
    this.db.prepare(`INSERT OR IGNORE INTO main_tournament_snapshots
      (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)`).run(
      snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
    return snapshot
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
    return this.listMain().map(({ eventId, name, date, country, players, url, coverage }) =>
      ({ eventId, name, date, country, players, url, coverage }))
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
