import type { DatabaseSync } from 'node:sqlite'

/** Current-guide availability must not deserialize every opponent's reports. */
export function ensureMatchupSummaries(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS matchup_report_summaries (
    project_id TEXT NOT NULL, meta_id TEXT NOT NULL, opponent_id TEXT NOT NULL, deck_hash TEXT NOT NULL,
    version_id TEXT, resolution_id TEXT,
    PRIMARY KEY(project_id, meta_id, opponent_id, deck_hash),
    FOREIGN KEY(project_id, meta_id, opponent_id, deck_hash)
      REFERENCES matchup_reports(project_id, meta_id, opponent_id, deck_hash) ON DELETE CASCADE) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS matchup_report_summaries_current
      ON matchup_report_summaries(project_id, meta_id, deck_hash, opponent_id);`)
  const values = (alias: string) => `${alias}.project_id, ${alias}.meta_id, ${alias}.opponent_id, ${alias}.deck_hash,
    json_extract(${alias}.payload, '$.deckVersionId'), json_extract(${alias}.payload, '$.deckResolutionId')`
  const upsert = `INSERT INTO matchup_report_summaries VALUES (${values('NEW')})
    ON CONFLICT(project_id, meta_id, opponent_id, deck_hash) DO UPDATE SET
      version_id = excluded.version_id, resolution_id = excluded.resolution_id;`
  db.exec(`CREATE TRIGGER IF NOT EXISTS matchup_report_summary_insert AFTER INSERT ON matchup_reports BEGIN ${upsert} END;
    CREATE TRIGGER IF NOT EXISTS matchup_report_summary_update AFTER UPDATE OF payload ON matchup_reports BEGIN ${upsert} END;
    INSERT INTO matchup_report_summaries
      SELECT ${values('r')} FROM matchup_reports r WHERE NOT EXISTS (
        SELECT 1 FROM matchup_report_summaries s WHERE s.project_id = r.project_id AND s.meta_id = r.meta_id
          AND s.opponent_id = r.opponent_id AND s.deck_hash = r.deck_hash);`)
}
