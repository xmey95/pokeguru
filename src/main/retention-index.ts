import type { DatabaseSync } from 'node:sqlite'

// Derived, rebuildable references. Stable owner keys survive VACUUM; delete and
// payload-update triggers keep them in the same transaction as their originals.
const evidenceSources = [
  { table: 'deck_thread_messages', column: 'evidence_json', keys: ['id'] },
  { table: 'matchup_reports', column: 'payload', keys: ['project_id', 'meta_id', 'opponent_id', 'deck_hash'] },
  { table: 'matchup_turns', column: 'report_payload', keys: ['id'] }
]
const lineSources = [
  { table: 'deck_baselines', column: 'parsed_json', keys: ['project_id'] },
  { table: 'deck_versions', column: 'parsed_json', keys: ['id'] },
  { table: 'deck_thread_candidates', column: 'parsed_json', keys: ['id'] },
  { table: 'deck_ai_candidates', column: 'parsed_json', keys: ['id'] }
]
const directSources = [
  { table: 'deck_line_mappings', column: 'print_snapshot', keys: ['project_id', 'line_number'], path: '$.id' },
  { table: 'deck_constraints', column: 'print_id', keys: ['id'], path: null },
  { table: 'deck_resolution_revisions', column: 'mappings_json', keys: ['id'], path: '$' }
]

const json = (expression: string) => `CASE WHEN json_valid(${expression}) THEN ${expression} ELSE '{}' END`
const object = (alias: string) => `CASE WHEN ${alias}.type = 'object' THEN ${alias}.value ELSE '{}' END`

export function ensureRetentionIndex(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS retention_sources (source TEXT PRIMARY KEY) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS retention_references (
      source TEXT NOT NULL, owner_key TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL,
      PRIMARY KEY(source, owner_key, kind, target)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS retention_reference_target ON retention_references(kind, target);
    CREATE TABLE IF NOT EXISTS retention_card_lines (
      source TEXT NOT NULL, owner_key TEXT NOT NULL, set_code TEXT NOT NULL, card_number TEXT NOT NULL, name TEXT NOT NULL,
      PRIMARY KEY(source, owner_key, set_code, card_number, name)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS retention_card_identity ON retention_card_lines(set_code, card_number, name);`)
  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((row) => row.name))
  for (const spec of [...evidenceSources, ...lineSources, ...directSources]) {
    if (!tables.has(spec.table) || db.prepare('SELECT 1 FROM retention_sources WHERE source = ?').get(spec.table)) continue
    const owner = (alias: string) => `json_array(${spec.keys.map((key) => `${alias}.${key}`).join(', ')})`
    const statements = (from: string): string => {
      const payload = json(`o.${spec.column}`)
      const refs = (kind: string, target: string, joins = '') => `INSERT OR IGNORE INTO retention_references
        SELECT '${spec.table}', ${owner('o')}, '${kind}', ${target} FROM ${from} o ${joins}
        WHERE typeof(${target}) = 'text';`
      if (evidenceSources.some((item) => item.table === spec.table)) {
        const request = object('q'), list = object('l'), card = object('c'), event = object('e')
        return refs('snapshot', `json_extract(${event}, '$.snapshotId')`, `, json_each(${payload}, '$.events') e`) +
          refs('print', `json_extract(${card}, '$.printId')`, `, json_each(${payload}, '$.cards') c`) +
          refs('snapshot', `json_extract(${list}, '$.snapshotId')`, `,
            json_each(${payload}, '$.aiQueries.requests') q,
            json_each(CASE WHEN json_extract(${request}, '$.query.operation') = 'events.search' THEN ${request} ELSE '{}' END, '$.data.lists') l`) +
          refs('snapshot', `json_extract(${event}, '$.snapshotId')`, `,
            json_each(${payload}, '$.aiQueries.requests') q,
            json_each(CASE WHEN json_extract(${request}, '$.query.operation') = 'events.search' THEN ${request} ELSE '{}' END, '$.data.lists') l,
            json_each(${list}, '$.occurrences') e`) +
          refs('print', `json_extract(${card}, '$.printId')`, `,
            json_each(${payload}, '$.aiQueries.requests') q,
            json_each(CASE WHEN json_extract(${request}, '$.query.operation') = 'catalog.search' THEN ${request} ELSE '{}' END, '$.data.matches') c`)
      }
      if (lineSources.some((item) => item.table === spec.table)) {
        const line = object('l')
        return `INSERT OR IGNORE INTO retention_card_lines
          SELECT '${spec.table}', ${owner('o')}, json_extract(${line}, '$.setCode'),
            json_extract(${line}, '$.cardNumber'), json_extract(${line}, '$.name')
          FROM ${from} o, json_each(${payload}, '$.lines') l
          WHERE json_type(${line}, '$.setCode') = 'text' AND json_type(${line}, '$.cardNumber') = 'text'
            AND json_type(${line}, '$.name') = 'text';`
      }
      if (spec.table === 'deck_resolution_revisions') return refs('print',
        `json_extract(${json(`json_extract(${object('m')}, '$.print_snapshot')`)}, '$.id')`, `, json_each(${payload}) m`)
      return refs('print', spec.column === 'print_id' ? 'o.print_id' : `json_extract(${payload}, '$.id')`)
    }
    const columns = [...spec.keys, spec.column]
    const remove = `DELETE FROM retention_references WHERE source = '${spec.table}' AND owner_key = ${owner('OLD')};
      DELETE FROM retention_card_lines WHERE source = '${spec.table}' AND owner_key = ${owner('OLD')};`
    const insert = statements(`(SELECT ${columns.map((col) => `NEW.${col} AS ${col}`).join(', ')})`)
    db.exec('SAVEPOINT retention_backfill')
    try {
      db.exec(`CREATE TRIGGER retention_${spec.table}_insert AFTER INSERT ON ${spec.table} BEGIN ${remove.replaceAll('OLD.', 'NEW.')} ${insert} END;
        CREATE TRIGGER retention_${spec.table}_update AFTER UPDATE OF ${columns.join(', ')} ON ${spec.table} BEGIN ${remove} ${insert} END;
        CREATE TRIGGER retention_${spec.table}_delete AFTER DELETE ON ${spec.table} BEGIN ${remove} END;
        ${statements(spec.table)}`)
      db.prepare('INSERT INTO retention_sources VALUES (?)').run(spec.table)
      db.exec('RELEASE retention_backfill')
    } catch (error) { db.exec('ROLLBACK TO retention_backfill; RELEASE retention_backfill'); throw error }
  }
}

export function retainedIds(db: DatabaseSync, kind: 'print' | 'snapshot'): Set<string> {
  ensureRetentionIndex(db)
  return new Set((db.prepare('SELECT DISTINCT target FROM retention_references WHERE kind = ?')
    .all(kind) as { target: string }[]).map((row) => row.target))
}

export function* retainedCardLines(db: DatabaseSync): Generator<{ setCode: string; cardNumber: string; name: string }> {
  ensureRetentionIndex(db)
  // Normalize in JS exactly as the original import/rotation did (including NFKC).
  // Only compact distinct identities cross this boundary, never historical JSON.
  for (const row of db.prepare(`SELECT DISTINCT set_code AS setCode, card_number AS cardNumber, name
    FROM retention_card_lines`).iterate()) yield row as { setCode: string; cardNumber: string; name: string }
}
