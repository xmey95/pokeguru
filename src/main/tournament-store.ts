import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TournamentSnapshot } from '../shared/tournament'

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
      ON tournament_snapshots(fetched_at DESC);`)
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

  close(): void { this.db.close() }
}
