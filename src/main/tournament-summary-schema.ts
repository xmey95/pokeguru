import type { DatabaseSync } from 'node:sqlite'

/** Compact derived projections, maintained in the snapshot's transaction even
 * for legacy import paths. Originals and insertion order remain authoritative. */
export function installTournamentSummaries(db: DatabaseSync): void {
  for (const [table, fields] of [
    ['tournament_snapshots', ['name', 'date', 'circuit', 'platform', 'isOnline', 'reportedPlayers', 'coverage', 'pairingCoverage']],
    ['main_tournament_snapshots', ['name', 'date', 'country', 'players', 'url', 'coverage']]
  ] as const) {
    const summary = `${table}_summaries`
    const projection = (alias: string) => `json_object('eventId', ${alias}.event_id, ${fields
      .map((field) => `'${field}', json_extract(${alias}.payload, '$.${field}')`).join(', ')})`
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS ${summary} (
        snapshot_id TEXT PRIMARY KEY REFERENCES ${table}(id) ON DELETE CASCADE,
        payload TEXT NOT NULL
      ) STRICT;
      CREATE TRIGGER IF NOT EXISTS ${summary}_insert AFTER INSERT ON ${table} BEGIN
        INSERT INTO ${summary} VALUES (new.id, ${projection('new')});
      END;
      CREATE TRIGGER IF NOT EXISTS ${summary}_update AFTER UPDATE OF payload, event_id ON ${table} BEGIN
        INSERT INTO ${summary} VALUES (new.id, ${projection('new')})
          ON CONFLICT(snapshot_id) DO UPDATE SET payload = excluded.payload;
      END;
      INSERT INTO ${summary}
        SELECT s.id, ${projection('s')} FROM ${table} s
        WHERE NOT EXISTS (SELECT 1 FROM ${summary} WHERE snapshot_id = s.id);`)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
  }
}
