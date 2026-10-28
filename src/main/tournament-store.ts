import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TournamentSnapshot, TournamentSummary, TournamentSyncProgress } from '../shared/tournament'
import type { MainTournamentSnapshot, MainTournamentSummary, MainTournamentSyncProgress } from '../shared/main-tournament'
import type { RotationRule } from '../shared/standard-rotation'
import { backupBeforeRotation } from './rotation-backup'

const initialProgress: TournamentSyncProgress = {
  mode: null, status: 'idle', page: 1, pending: [], inspected: 0, saved: 0, skipped: 0,
  watermark: null, previousWatermark: null, newestSeen: null, stopAfterPage: false,
  cooldownUntil: null, lastError: null
}
const initialMainProgress: MainTournamentSyncProgress = {
  mode: null, status: 'idle', page: 1, maxPages: null, pendingEvents: [], pendingLists: [], inspectedEvents: 0,
  fetchedLists: 0, rotationStart: null, scannedPages: 0, indexedRows: 0, eligibleEvents: 0,
  ineligibleEvents: 0, unavailableIndexRows: 0, outsideRotationEvents: 0, alreadyAcquiredEvents: 0,
  unavailableEvents: [], unavailableLists: [], watermark: null, previousWatermark: null, newestSeen: null,
  stopAfterPage: false, cooldownUntil: null, lastError: null
}

export class TournamentStore {
  private readonly db: DatabaseSync
  private readonly filePath: string
  private playListCache: TournamentSnapshot[] | null = null
  private mainListCache: MainTournamentSnapshot[] | null = null

  private assertCurrentEventDate(date: string): void {
    const period = this.db.prepare('SELECT rotation_start FROM tournament_rotation WHERE id = 1')
      .get() as { rotation_start: string } | undefined
    if (period && date.slice(0, 10) < period.rotation_start)
      throw new Error('Evento della rotazione precedente: acquisizione annullata.')
  }

  constructor(filePath: string) {
    this.filePath = filePath
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
    ) STRICT;
    CREATE TABLE IF NOT EXISTS historical_event_references (
      snapshot_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, source TEXT NOT NULL,
      name TEXT NOT NULL, event_date TEXT NOT NULL, source_url TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS tournament_rotation (
      id INTEGER PRIMARY KEY CHECK (id = 1), rule_version TEXT NOT NULL,
      rotation_start TEXT NOT NULL, removed_play INTEGER NOT NULL,
      removed_main INTEGER NOT NULL, completed_at TEXT NOT NULL
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

  rotationNeedsPreflight(rotation: RotationRule): boolean {
    const previous = this.db.prepare('SELECT rotation_start FROM tournament_rotation WHERE id = 1')
      .get() as { rotation_start: string } | undefined
    if (previous) return previous.rotation_start !== rotation.effectiveFrom
    return (this.db.prepare(`SELECT 1 FROM tournament_snapshots
      WHERE substr(json_extract(payload, '$.date'), 1, 10) < ? LIMIT 1`).get(rotation.effectiveFrom) !== undefined) ||
      (this.db.prepare(`SELECT 1 FROM main_tournament_snapshots
        WHERE substr(json_extract(payload, '$.date'), 1, 10) < ? LIMIT 1`).get(rotation.effectiveFrom) !== undefined)
  }

  /** Cited Thread packets already contain their evidence; retain only an index for those snapshot IDs. */
  private citedSnapshotIds(): Set<string> {
    const tables = new Set((this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]).map((row) => row.name))
    const cited = new Set<string>()
    if (tables.has('deck_thread_messages')) {
      for (const row of this.db.prepare(`SELECT DISTINCT json_extract(event.value, '$.snapshotId') AS id
        FROM deck_thread_messages AS message,
          json_each(CASE WHEN json_valid(message.evidence_json) THEN message.evidence_json
            ELSE '{}' END, '$.events') AS event
        WHERE json_type(event.value, '$.snapshotId') = 'text'`).all() as { id: string }[])
        cited.add(row.id)
    }
    // AI-selected event searches are persisted in Thread packets and Matchup report revisions.
    for (const [table, column] of [['deck_thread_messages', 'evidence_json'],
      ['matchup_reports', 'payload'], ['matchup_turns', 'report_payload']] as const) {
      if (!tables.has(table)) continue
      for (const row of this.db.prepare(`SELECT DISTINCT json_extract(list.value, '$.snapshotId') AS id
        FROM ${table} AS evidence,
          json_each(CASE WHEN json_valid(evidence.${column}) THEN evidence.${column} ELSE '{}' END,
            '$.aiQueries.requests') AS request,
          json_each(request.value, '$.data.lists') AS list
        WHERE json_extract(request.value, '$.query.operation') = 'events.search'
          AND json_type(list.value, '$.snapshotId') = 'text'`).all() as { id: string }[])
        cited.add(row.id)
    }
    return cited
  }

  historicalReference(snapshotId: string): { snapshotId: string; eventId: string; source: string;
    name: string; date: string; url: string } | null {
    const row = this.db.prepare(`SELECT snapshot_id, event_id, source, name, event_date, source_url
      FROM historical_event_references WHERE snapshot_id = ?`).get(snapshotId) as {
        snapshot_id: string; event_id: string; source: string; name: string;
        event_date: string; source_url: string } | undefined
    return row ? { snapshotId: row.snapshot_id, eventId: row.event_id, source: row.source,
      name: row.name, date: row.event_date, url: row.source_url } : null
  }

  /** Clear old global snapshots after a verified period and a readable source index. */
  async ensureRotation(rotation: RotationRule): Promise<void> {
    const previous = this.db.prepare('SELECT rotation_start FROM tournament_rotation WHERE id = 1')
      .get() as { rotation_start: string } | undefined
    if (previous?.rotation_start === rotation.effectiveFrom) return
    if (previous && previous.rotation_start > rotation.effectiveFrom)
      throw new Error('Il pacchetto regole è più vecchio della rotazione Eventi già applicata.')
    const oldRows = (table: 'tournament_snapshots' | 'main_tournament_snapshots') =>
      (this.db.prepare(`SELECT id, event_id, fetched_at, payload FROM ${table}`).all() as
        { id: string; event_id: string; fetched_at: string; payload: string }[])
        .filter((row) => {
          const date = (JSON.parse(row.payload) as { date?: unknown }).date
          if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) ||
            !Number.isFinite(Date.parse(date)))
            throw new Error('Data Evento salvata non valida: archivio precedente conservato.')
          return date.slice(0, 10) < rotation.effectiveFrom
        })
    const play = oldRows('tournament_snapshots')
    const main = oldRows('main_tournament_snapshots')
    const cited = this.citedSnapshotIds()
    const staleReferences = (this.db.prepare('SELECT snapshot_id FROM historical_event_references').all() as
      { snapshot_id: string }[]).filter((row) => !cited.has(row.snapshot_id))
    if (play.length || main.length || staleReferences.length)
      await backupBeforeRotation(this.db, this.filePath, 'events', rotation.effectiveFrom)
    const completedAt = new Date().toISOString()
    const cleanup = { removedPlay: play.length, removedMain: main.length, completedAt }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of play) {
        if (cited.has(row.id)) {
          const event = JSON.parse(row.payload) as TournamentSnapshot
          this.db.prepare('INSERT OR IGNORE INTO historical_event_references VALUES (?, ?, ?, ?, ?, ?)')
            .run(row.id, row.event_id, 'play', event.name, event.date, event.publicUrl)
        }
        this.db.prepare('DELETE FROM tournament_snapshots WHERE id = ?').run(row.id)
      }
      for (const row of main) {
        if (cited.has(row.id)) {
          const event = JSON.parse(row.payload) as MainTournamentSnapshot
          this.db.prepare('INSERT OR IGNORE INTO historical_event_references VALUES (?, ?, ?, ?, ?, ?)')
            .run(row.id, row.event_id, 'main', event.name, event.date, event.url)
        }
        this.db.prepare('DELETE FROM main_tournament_snapshot_pins WHERE id = ?').run(row.id)
        this.db.prepare('DELETE FROM main_tournament_snapshots WHERE id = ?').run(row.id)
      }
      for (const row of staleReferences)
        this.db.prepare('DELETE FROM historical_event_references WHERE snapshot_id = ?').run(row.snapshot_id)
      this.db.prepare(`INSERT INTO tournament_rotation VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET rule_version=excluded.rule_version,
        rotation_start=excluded.rotation_start, removed_play=excluded.removed_play,
        removed_main=excluded.removed_main, completed_at=excluded.completed_at`)
        .run(rotation.version, rotation.effectiveFrom, play.length, main.length, completedAt)
      const reset = !!previous || play.length > 0 || main.length > 0
      this.saveProgress({ ...(reset ? initialProgress : this.progress()),
        ...(reset ? { rotationStart: rotation.effectiveFrom } : {}), rotationCleanup: cleanup })
      this.saveMainProgress({ ...(reset ? initialMainProgress : this.mainProgress()),
        ...(reset ? { rotationStart: rotation.effectiveFrom } : {}), rotationCleanup: cleanup })
      this.db.exec('COMMIT')
      this.playListCache = null
      this.mainListCache = null
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  save(snapshot: TournamentSnapshot): TournamentSnapshot {
    this.assertCurrentEventDate(snapshot.date)
    this.db.prepare(`INSERT OR IGNORE INTO tournament_snapshots
      (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)`)
      .run(snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
    this.playListCache = null
    return snapshot
  }

  latest(): TournamentSnapshot | null {
    const row = this.db.prepare('SELECT payload FROM tournament_snapshots ORDER BY fetched_at DESC, rowid DESC LIMIT 1')
      .get() as { payload: string } | undefined
    return row ? { ...JSON.parse(row.payload) as TournamentSnapshot, cached: true } : null
  }

  list(): TournamentSnapshot[] {
    if (this.playListCache) return this.playListCache
    const rows = this.db.prepare(`SELECT payload FROM tournament_snapshots
      WHERE rowid IN (SELECT MAX(rowid) FROM tournament_snapshots GROUP BY event_id)`)
      .all() as { payload: string }[]
    return this.playListCache = rows.map((row) => ({ ...JSON.parse(row.payload) as TournamentSnapshot, cached: true }))
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
    this.assertCurrentEventDate(snapshot.date)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`INSERT OR IGNORE INTO main_tournament_snapshots
        (id, event_id, fetched_at, payload) VALUES (?, ?, ?, ?)`).run(
        snapshot.id, snapshot.eventId, snapshot.fetchedAt, JSON.stringify(snapshot))
      if (completed) this.db.prepare(`INSERT OR IGNORE INTO main_tournament_snapshot_pins (id)
        VALUES (?)`).run(snapshot.id)
      this.db.exec('COMMIT')
      this.mainListCache = null
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
      if (removed.length) this.mainListCache = null
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return removed.length
  }

  getMain(eventId: string): MainTournamentSnapshot | null {
    const row = this.db.prepare('SELECT payload FROM main_tournament_snapshots WHERE event_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(eventId) as { payload: string } | undefined
    return row ? { ...JSON.parse(row.payload) as MainTournamentSnapshot, cached: true } : null
  }

  listMain(): MainTournamentSnapshot[] {
    if (this.mainListCache) return this.mainListCache
    const rows = this.db.prepare(`SELECT payload FROM main_tournament_snapshots
      WHERE rowid IN (SELECT MAX(rowid) FROM main_tournament_snapshots GROUP BY event_id)`)
      .all() as { payload: string }[]
    return this.mainListCache = rows.map((row) => ({ ...JSON.parse(row.payload) as MainTournamentSnapshot, cached: true }))
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
