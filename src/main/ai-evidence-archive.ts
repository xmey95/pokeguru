import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { gzipSync, gunzipSync } from 'node:zlib'
import type { AiEvidenceQueryResult } from '../shared/ai-evidence'
import { statementCache } from './database-statements'
import type { EvidenceRecord } from './ai-evidence-partition'

/** Persist originals separately from query membership. No aggregate payload limit:
 * each compressed SQLite chunk is bounded, and readers walk one record at a time.
 * These tables live in the project database, so its verified backup includes them. */
export const AI_EVIDENCE_ARCHIVE_SCHEMA = `
CREATE TABLE IF NOT EXISTS ai_evidence_objects (
  hash TEXT PRIMARY KEY, bytes INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS ai_evidence_chunks (
  object_hash TEXT NOT NULL REFERENCES ai_evidence_objects(hash) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL, body BLOB NOT NULL,
  PRIMARY KEY (object_hash, ordinal)
) STRICT;
CREATE TABLE IF NOT EXISTS ai_evidence_links (
  parent_hash TEXT NOT NULL REFERENCES ai_evidence_objects(hash) ON DELETE CASCADE,
  child_hash TEXT NOT NULL REFERENCES ai_evidence_objects(hash) ON DELETE CASCADE,
  PRIMARY KEY (parent_hash, child_hash)
) STRICT;
CREATE TABLE IF NOT EXISTS ai_evidence_runs (
  job_id TEXT PRIMARY KEY REFERENCES ai_jobs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS ai_evidence_values (
  job_id TEXT NOT NULL REFERENCES ai_evidence_runs(job_id) ON DELETE CASCADE,
  role TEXT NOT NULL, key TEXT NOT NULL,
  object_hash TEXT NOT NULL REFERENCES ai_evidence_objects(hash),
  PRIMARY KEY (job_id, role, key)
) STRICT;
CREATE TABLE IF NOT EXISTS ai_evidence_records (
  job_id TEXT NOT NULL REFERENCES ai_evidence_runs(job_id) ON DELETE CASCADE,
  key TEXT NOT NULL, kind TEXT NOT NULL,
  source_id TEXT NOT NULL, deck_key TEXT,
  object_hash TEXT NOT NULL REFERENCES ai_evidence_objects(hash),
  PRIMARY KEY (job_id, key)
) STRICT;
CREATE INDEX IF NOT EXISTS ai_evidence_record_kind ON ai_evidence_records(job_id, kind, key);
CREATE INDEX IF NOT EXISTS ai_evidence_record_deck ON ai_evidence_records(job_id, kind, deck_key);
CREATE INDEX IF NOT EXISTS ai_evidence_record_source ON ai_evidence_records(job_id, source_id);
CREATE TABLE IF NOT EXISTS ai_evidence_searches (
  job_id TEXT NOT NULL REFERENCES ai_evidence_runs(job_id) ON DELETE CASCADE,
  key TEXT NOT NULL, query_json TEXT NOT NULL, cursor_json TEXT,
  pages INTEGER NOT NULL DEFAULT 0, response_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, key)
) STRICT;
CREATE TABLE IF NOT EXISTS ai_evidence_pages (
  job_id TEXT NOT NULL, search_key TEXT NOT NULL, cursor_key TEXT NOT NULL,
  sequence INTEGER NOT NULL, fingerprint TEXT NOT NULL,
  object_hash TEXT NOT NULL REFERENCES ai_evidence_objects(hash),
  PRIMARY KEY (job_id, search_key, cursor_key),
  FOREIGN KEY (job_id, search_key) REFERENCES ai_evidence_searches(job_id, key) ON DELETE CASCADE
) STRICT;
CREATE TABLE IF NOT EXISTS ai_evidence_event_index (
  job_id TEXT NOT NULL REFERENCES ai_evidence_runs(job_id) ON DELETE CASCADE,
  key TEXT NOT NULL, deck_key TEXT NOT NULL, date TEXT NOT NULL, placing INTEGER,
  deck_name TEXT NOT NULL, deck_text TEXT NOT NULL, cards_text TEXT NOT NULL,
  object_hash TEXT NOT NULL REFERENCES ai_evidence_objects(hash),
  PRIMARY KEY (job_id, key)
) STRICT;
CREATE INDEX IF NOT EXISTS ai_evidence_event_order
  ON ai_evidence_event_index(job_id, date DESC, placing IS NULL, placing, key);
DROP INDEX IF EXISTS ai_evidence_event_date;
CREATE INDEX IF NOT EXISTS ai_evidence_event_name ON ai_evidence_event_index(job_id, deck_name);
CREATE INDEX IF NOT EXISTS ai_evidence_page_sequence ON ai_evidence_pages(job_id, search_key, sequence);
CREATE INDEX IF NOT EXISTS ai_evidence_page_run ON ai_evidence_pages(job_id);
CREATE INDEX IF NOT EXISTS ai_evidence_page_search ON ai_evidence_pages(job_id, search_key);
CREATE INDEX IF NOT EXISTS ai_evidence_search_run ON ai_evidence_searches(job_id);
CREATE INDEX IF NOT EXISTS ai_evidence_link_child ON ai_evidence_links(child_hash);
CREATE INDEX IF NOT EXISTS ai_evidence_value_object ON ai_evidence_values(object_hash);
CREATE INDEX IF NOT EXISTS ai_evidence_record_object ON ai_evidence_records(object_hash);
CREATE INDEX IF NOT EXISTS ai_evidence_page_object ON ai_evidence_pages(object_hash);
CREATE INDEX IF NOT EXISTS ai_evidence_event_object ON ai_evidence_event_index(object_hash);
`

const CHUNK_BYTES = 128 * 1024
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => [key, canonical(item)]))
  return value
}
export const evidenceHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

/** New snapshots identify the participation, independently from a shared deck URL.
 * Keep the old identity for already-sealed v0.3.5 snapshots and their saved pages. */
export function evidenceOccurrenceIdentity(value: Record<string, unknown>): string {
  return typeof value.participationId === 'string' && value.participationId
    ? evidenceHash([value.id, 'participation', value.participationId])
    : evidenceHash([value.id, value.listUrl])
}

/** Exact quantities and printed card identifiers; neither similarity nor names alone. */
function exactDeckLines(cards: string[]): string[] {
  const copies = new Map<string, number>()
  for (const line of cards) {
    const match = /^(\d+)\s+(.+)$/.exec(line.trim())
    if (!match) return cards
    const card = match[2].normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ')
    copies.set(card, (copies.get(card) ?? 0) + Number(match[1]))
  }
  return [...copies].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([card, count]) => `${count} ${card}`)
}
export const exactDeckIdentity = (cards: string[]): string => evidenceHash(exactDeckLines(cards))

type Row = Record<string, unknown>
interface PageManifest {
  envelope: Omit<AiEvidenceQueryResult, 'data'>
  data: Row
  cards?: { object: string; reason?: unknown; matchedTerms?: unknown }[]
  lists?: { base: Row; cards: string; occurrences?: string[] }[]
}
export interface ArchivedEvidenceRecord {
  key: string; kind: string; sourceId: string; deckKey: string | null; data: unknown
}
export interface EvidenceSearch {
  key: string; query: unknown; cursor: unknown | null; pages: number; responseBytes: number
}
export interface EvidenceArchiveCounts {
  searches: number; completedSearches: number; pages: number; responseBytes: number
  cards: number; decks: number; occurrences: number; pairings: number
}
export interface EvidenceDeckStatistics {
  deckKey: string; occurrences: number; events: number; recordsAvailable: number
  fieldRecord: { wins: number; losses: number; ties: number; denominator: number }
  placements: { placing: number; count: number }[]
  scope: 'observed-participations-against-event-field'
}
export interface EvidenceSnapshotRow {
  key: string; deckKey: string; date: string; placing: number | null
  deckName: string; deckText: string; cardsText: string; value: unknown
}
export interface EvidenceAnalysisInput {
  key: string
  fingerprint: string
  type: 'record' | 'statistics' | 'search' | 'summary' | 'aggregate'
  recordKind?: string
  sourceId?: string
  deckKey?: string | null
}
export interface EvidenceAnalysisInventory {
  snapshotHash: string | null
  inputs: EvidenceAnalysisInput[]
}

/** A capability bound to one existing job, project and resource. Object hashes are
 * never an authorization token: callers can only traverse this run's memberships. */
export class AiEvidenceArchive {
  private readonly db: DatabaseSync
  private readonly prepare: ReturnType<typeof statementCache>
  // The source inventory is immutable after capture. Keep small aggregate
  // counts here and ordered identities in TEMP, isolated to this job/connection.
  private readonly eventCounts = new Map<string, { slot: number; matchingLists: number; distinctDecks: number; listsInspected: number }>()
  private eventPageCacheReady = false
  private readonly detailKeys = new Map<string, string[]>()
  private introducedForPage?: { records: number; bytes: number }
  readonly id: string
  readonly projectId: string
  readonly resourceId: string
  constructor(filePath: string, owner: { id: string; projectId: string; resourceId: string }, readOnly = false) {
    this.db = new DatabaseSync(filePath, { readOnly })
    this.prepare = statementCache(this.db)
    this.id = owner.id
    this.projectId = owner.projectId
    this.resourceId = owner.resourceId
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000')
      const job = this.prepare('SELECT project_id, resource_id FROM ai_jobs WHERE id = ?')
        .get(owner.id) as { project_id: string; resource_id: string } | undefined
      if (!job || job.project_id !== owner.projectId || job.resource_id !== owner.resourceId)
        throw new Error('Archivio delle prove non appartenente al progetto.')
      if (!readOnly) {
        this.db.exec(AI_EVIDENCE_ARCHIVE_SCHEMA)
        this.prepare('INSERT OR IGNORE INTO ai_evidence_runs(job_id, version) VALUES (?, 1)').run(this.id)
      }
    } catch (error) { this.db.close(); throw error }
  }

  private atomic<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  private put(value: unknown, children: string[] = []): string {
    const body = Buffer.from(JSON.stringify(value), 'utf8')
    const hash = createHash('sha256').update(body).digest('hex')
    const inserted = this.prepare('INSERT OR IGNORE INTO ai_evidence_objects(hash, bytes) VALUES (?, ?)')
      .run(hash, body.length)
    if (inserted.changes) {
      const chunk = this.prepare('INSERT INTO ai_evidence_chunks(object_hash, ordinal, body) VALUES (?, ?, ?)')
      for (let offset = 0; offset < body.length; offset += CHUNK_BYTES)
        chunk.run(hash, offset / CHUNK_BYTES, gzipSync(body.subarray(offset, offset + CHUNK_BYTES)))
    }
    const link = this.prepare('INSERT OR IGNORE INTO ai_evidence_links VALUES (?, ?)')
    for (const child of new Set(children)) link.run(hash, child)
    return hash
  }

  private get<T>(hash: string): T {
    const expected = this.prepare('SELECT bytes FROM ai_evidence_objects WHERE hash = ?')
      .get(hash) as { bytes: number } | undefined
    if (!expected) throw new Error('Prova archiviata mancante.')
    const chunks: Buffer[] = []
    let bytes = 0, ordinal = 0
    for (const row of this.db.prepare('SELECT ordinal, body FROM ai_evidence_chunks WHERE object_hash = ? ORDER BY ordinal')
      .iterate(hash) as Iterable<{ ordinal: number; body: Uint8Array }>) {
      if (row.ordinal !== ordinal++) throw new Error('Prova archiviata incompleta.')
      const chunk = gunzipSync(row.body, { maxOutputLength: CHUNK_BYTES })
      bytes += chunk.length
      if (bytes > expected.bytes) throw new Error('Dimensione della prova archiviata non valida.')
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)
    if (bytes !== expected.bytes || createHash('sha256').update(body).digest('hex') !== hash)
      throw new Error('Integrità della prova archiviata non valida.')
    return JSON.parse(body.toString('utf8')) as T
  }

  /** Immutable named inputs pin the original scope, regardless of later source syncs. */
  value<T>(role: string, key: string): T | undefined {
    const row = this.prepare('SELECT object_hash FROM ai_evidence_values WHERE job_id = ? AND role = ? AND key = ?')
      .get(this.id, role, key) as { object_hash: string } | undefined
    return row ? this.get<T>(row.object_hash) : undefined
  }
  /** Latest immutable checkpoint for this job only; used to extend an analysis manifest. */
  latestValue<T>(role: string): T | undefined {
    const row = this.prepare(`SELECT object_hash FROM ai_evidence_values
      WHERE job_id = ? AND role = ? ORDER BY rowid DESC LIMIT 1`).get(this.id, role) as
      { object_hash: string } | undefined
    return row ? this.get<T>(row.object_hash) : undefined
  }
  hasLegacyAnalysisCheckpoint(): boolean {
    return !!this.prepare(`SELECT 1 FROM ai_evidence_values
      WHERE job_id = ? AND role LIKE 'analysis:%' LIMIT 1`).get(this.id) ||
      !!this.prepare(`SELECT 1 FROM ai_call_cache WHERE job_id = ?
        AND json_type(result_json, '$.summary') = 'text'
        AND json_type(result_json, '$.limitations') = 'text'
        AND json_type(result_json, '$.sourceIds') = 'array' LIMIT 1`).get(this.id)
  }
  saveValue(role: string, key: string, value: unknown): void {
    this.atomic(() => {
      const hash = this.put(value)
      const existing = this.prepare('SELECT object_hash FROM ai_evidence_values WHERE job_id = ? AND role = ? AND key = ?')
        .get(this.id, role, key) as { object_hash: string } | undefined
      if (existing && existing.object_hash !== hash) throw new Error('Il contesto salvato è immutabile.')
      this.prepare('INSERT OR IGNORE INTO ai_evidence_values VALUES (?, ?, ?, ?)').run(this.id, role, key, hash)
    })
  }
  *values<T>(role: string): Generator<{ key: string; value: T }> {
    let after: string | null = null
    while (true) {
      const rows = this.prepare(`SELECT key, object_hash FROM ai_evidence_values
        WHERE job_id = ? AND role = ? ${after === null ? '' : 'AND key > ?'} ORDER BY key LIMIT 64`)
        .all(this.id, role, ...(after === null ? [] : [after])) as { key: string; object_hash: string }[]
      if (!rows.length) return
      for (const row of rows) { after = row.key; yield { key: row.key, value: this.get<T>(row.object_hash) } }
    }
  }

  /** One transaction seals the source inventory before the first query. A failed
   * capture leaves no partial snapshot, and reopening never reads newer sources. */
  captureSources(metadata: unknown, rows: Iterable<EvidenceSnapshotRow>): void {
    if (this.value('snapshot', 'sources') !== undefined) return
    this.atomic(() => {
      const insert = this.prepare(`INSERT INTO ai_evidence_event_index VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id, key) DO NOTHING`)
      const existing = this.prepare('SELECT object_hash FROM ai_evidence_event_index WHERE job_id = ? AND key = ?')
      for (const row of rows) {
        const hash = this.put(row.value)
        const saved = insert.run(this.id, row.key, row.deckKey, row.date, row.placing,
          row.deckName, row.deckText, row.cardsText, hash)
        if (!saved.changes && (existing.get(this.id, row.key) as { object_hash: string }).object_hash !== hash)
          throw new Error('La stessa partecipazione contiene dati diversi nello snapshot degli Eventi.')
      }
      this.prepare('INSERT INTO ai_evidence_values VALUES (?, ?, ?, ?)')
        .run(this.id, 'snapshot', 'sources', this.put(metadata))
    })
    this.eventCounts.clear()
    if (this.eventPageCacheReady) this.db.exec('DELETE FROM temp.evidence_event_positions')
  }
  *eventNames(): Generator<string> {
    for (const row of this.db.prepare(`SELECT DISTINCT deck_name FROM ai_evidence_event_index
      WHERE job_id = ? ORDER BY deck_name`).iterate(this.id) as Iterable<{ deck_name: string }>) yield row.deck_name
  }
  /** Full sealed source rows, scoped to this job; no cursor survives a yield. */
  *eventRows<T>(): Generator<T> {
    let after = ''
    while (true) {
      const rows = this.prepare(`SELECT key, object_hash FROM ai_evidence_event_index
        WHERE job_id = ? AND key > ? ORDER BY key LIMIT 128`).all(this.id, after) as { key: string; object_hash: string }[]
      if (!rows.length) return
      for (const row of rows) { after = row.key; yield this.get<T>(row.object_hash) }
    }
  }
  /** A model can inspect originals of a collected exact deck. Identifiers from
   * another job never authorize access, even when the object is physically shared. */
  eventDetails(deckKey: string, offset: number, limit: number, eventId?: string): unknown {
    const cacheKey = JSON.stringify([deckKey, eventId ?? null])
    let keys = this.detailKeys.get(cacheKey)
    if (!keys) {
      const occurrences = [...this.records('occurrence')].filter((r) => r.deckKey === deckKey &&
        (eventId === undefined || (r.data as { id?: string }).id === eventId))
      const players = new Set(occurrences.flatMap((r) => {
        const data = r.data as { id: string; playerId?: string | null }
        return data.playerId ? [JSON.stringify([data.id, data.playerId])] : []
      }))
      keys = occurrences.map((r) => r.key)
      for (const r of this.records('pairing')) {
        const data = r.data as { eventId: string; player1: string; player2: string | null }
        if (players.has(JSON.stringify([data.eventId, data.player1])) ||
          data.player2 && players.has(JSON.stringify([data.eventId, data.player2]))) keys.push(r.key)
      }
      keys.sort()
      if (this.detailKeys.size >= 8) this.detailKeys.delete(this.detailKeys.keys().next().value!)
      this.detailKeys.set(cacheKey, keys)
    }
    const selected = keys.slice(offset, offset + limit).map((key) => {
      const row = this.prepare('SELECT kind, source_id, deck_key FROM ai_evidence_records WHERE job_id = ? AND key = ?')
        .get(this.id, key) as { kind: string; source_id: string; deck_key: string | null }
      return { key, kind: row.kind, sourceId: row.source_id, deckKey: row.deck_key, data: this.readRecord(key) }
    })
    return { scope: { deckKey, eventId: eventId ?? null, totalRecords: keys.length }, records: selected,
      offset, remaining: Math.max(0, keys.length - offset - selected.length) }
  }

  /** Materialized deterministic records are rooted by this job, in one transaction.
   * Originals remain separate; fingerprints invalidate only changed aggregates. */
  saveAggregateInputs(records: readonly EvidenceRecord[]): EvidenceAnalysisInput[] {
    return this.atomic(() => records.map((record) => {
      const fingerprint = evidenceHash(record), hash = this.put(record)
      this.prepare('INSERT OR IGNORE INTO ai_evidence_values VALUES (?, ?, ?, ?)')
        .run(this.id, 'aggregate-input:v1', fingerprint, hash)
      return { key: record.key!, type: 'aggregate', fingerprint,
        ...(record.sourceIds.length ? { sourceId: record.sourceIds[0] } : {}) }
    }))
  }
  queryMetrics(): { queryOrdinal: number; operation: string; pages: number; responseBytes: number;
    introducedRecords?: number; introducedRecordBytes?: number }[] {
    const metrics = new Map<string, { pages: number; records: number; bytes: number }>()
    for (const { key, value } of this.values<{ records: number; bytes: number }>('query-metrics:v1')) {
      const search = key.split(':')[0], prior = metrics.get(search) ?? { pages: 0, records: 0, bytes: 0 }
      prior.pages++; prior.records += value.records; prior.bytes += value.bytes; metrics.set(search, prior)
    }
    return [...this.searches()].map((search, index) => {
      const metric = metrics.get(search.key)
      return { queryOrdinal: index + 1, operation: (search.query as { operation?: string }).operation ?? 'unknown',
        pages: search.pages, responseBytes: search.responseBytes,
        ...(metric?.pages === search.pages ? { introducedRecords: metric.records, introducedRecordBytes: metric.bytes } : {}) }
    })
  }
  supplementalEvidenceCount(): number {
    const facts = new Set<string>()
    for (const search of this.searches()) {
      const operation = (search.query as { operation?: string }).operation
      if (operation !== 'events.overview' && operation !== 'events.details') continue
      for (const page of this.pages(search.key)) {
        if (page.status !== 'ok') continue
        if (operation === 'events.overview') facts.add(`overview:${search.key}`)
        else for (const row of (page.data as { records?: { key: string }[] }).records ?? []) facts.add(`detail:${row.key}`)
      }
    }
    return facts.size
  }
  eventPage<T>(query: { from: string; to: string; deck: string; card: string; offset: number; limit: number }):
    { rows: T[]; listsInspected: number; matchingLists: number; distinctDecks: number } {
    const where = `job_id = ? AND date >= ? AND date <= ?
      ${query.deck ? 'AND instr(deck_text, ?) > 0' : ''} ${query.card ? 'AND instr(cards_text, ?) > 0' : ''}`
    const args = [this.id, query.from, query.to, ...(query.deck ? [query.deck] : []), ...(query.card ? [query.card] : [])]
    const key = JSON.stringify([query.from, query.to, query.deck, query.card])
    if (!Number.isSafeInteger(query.offset) || query.offset < 0 || !Number.isSafeInteger(query.limit) || query.limit < 1)
      throw new Error('Pagina degli Eventi non valida.')
    let counts = this.eventCounts.get(key)
    if (!counts) {
      // Numeric offsets are part of saved AI checkpoints. Materialize only row
      // identities once per filter, then seek by ordinal even on a deep resume.
      // TEMP is connection-local (also on read-only archives), disk-spillable,
      // bounded to eight filters and never duplicates an original payload.
      if (!this.eventPageCacheReady) {
        this.db.exec(`CREATE TEMP TABLE evidence_event_positions (
          slot INTEGER NOT NULL, ordinal INTEGER NOT NULL, event_rowid INTEGER NOT NULL,
          PRIMARY KEY(slot, ordinal)) WITHOUT ROWID`)
        this.eventPageCacheReady = true
      }
      let slot = this.eventCounts.size
      if (slot >= 8) {
        const oldest = this.eventCounts.keys().next().value!
        slot = this.eventCounts.get(oldest)!.slot
        this.prepare('DELETE FROM temp.evidence_event_positions WHERE slot = ?').run(slot)
        this.eventCounts.delete(oldest)
      }
      this.prepare(`INSERT INTO temp.evidence_event_positions
        SELECT ?, row_number() OVER (ORDER BY date DESC, placing IS NULL, placing, key) - 1, rowid
        FROM ai_evidence_event_index WHERE ${where}`).run(slot, ...args)
      const matching = this.prepare(`SELECT count(*) AS matchingLists, count(DISTINCT e.deck_key) AS distinctDecks
        FROM temp.evidence_event_positions p JOIN ai_evidence_event_index e ON e.rowid = p.event_rowid
        WHERE p.slot = ?`).get(slot) as { matchingLists: number; distinctDecks: number }
      const { listsInspected } = this.prepare('SELECT count(*) AS listsInspected FROM ai_evidence_event_index WHERE job_id = ?')
        .get(this.id) as { listsInspected: number }
      counts = { ...matching, listsInspected, slot }
      this.eventCounts.set(key, counts)
    }
    this.eventCounts.delete(key)
    this.eventCounts.set(key, counts)
    const rows = (this.prepare(`SELECT e.object_hash FROM temp.evidence_event_positions p
      JOIN ai_evidence_event_index e ON e.rowid = p.event_rowid
      WHERE p.slot = ? AND p.ordinal >= ? ORDER BY p.ordinal LIMIT ?`)
      .all(counts.slot, query.offset, query.limit) as { object_hash: string }[]).map((row) => this.get<T>(row.object_hash))
    const { slot: _slot, ...scope } = counts
    return { ...scope, rows }
  }

  search(query: unknown): EvidenceSearch {
    const normalized = query && typeof query === 'object' && !Array.isArray(query)
      ? Object.fromEntries(Object.entries(query).filter(([key, value]) =>
        key !== 'offset' && key !== 'limit' && value !== null && value !== undefined)) : query
    const key = evidenceHash(normalized)
    const cursor = query && typeof query === 'object' && !Array.isArray(query) ? { ...query, offset: 0 } : query
    this.prepare(`INSERT OR IGNORE INTO ai_evidence_searches(job_id, key, query_json, cursor_json)
      VALUES (?, ?, ?, ?)`).run(this.id, key, JSON.stringify(normalized), JSON.stringify(cursor))
    return this.getSearch(key)!
  }
  getSearch(key: string): EvidenceSearch | undefined {
    const row = this.prepare('SELECT * FROM ai_evidence_searches WHERE job_id = ? AND key = ?')
      .get(this.id, key) as { key: string; query_json: string; cursor_json: string | null; pages: number; response_bytes: number } | undefined
    return row ? { key, query: JSON.parse(row.query_json), cursor: row.cursor_json === null ? null : JSON.parse(row.cursor_json),
      pages: row.pages, responseBytes: row.response_bytes } : undefined
  }
  *searches(): Generator<EvidenceSearch> {
    let after = 0
    while (true) {
      const rows = this.prepare('SELECT rowid, key FROM ai_evidence_searches WHERE job_id = ? AND rowid > ? ORDER BY rowid LIMIT 64')
        .all(this.id, after) as { rowid: number; key: string }[]
      if (!rows.length) return
      for (const row of rows) { after = row.rowid; yield this.getSearch(row.key)! }
    }
  }
  lastPageMetadata(searchKey: string): { remaining?: number; offset?: number } | undefined {
    const row = this.prepare(`SELECT object_hash FROM ai_evidence_pages
      WHERE job_id = ? AND search_key = ? ORDER BY sequence DESC LIMIT 1`)
      .get(this.id, searchKey) as { object_hash: string } | undefined
    return row ? this.get<PageManifest>(row.object_hash).data : undefined
  }
  searchSummary(search: EvidenceSearch): AiEvidenceQueryResult {
    const row = this.prepare(`SELECT object_hash FROM ai_evidence_pages
      WHERE job_id = ? AND search_key = ? ORDER BY sequence DESC LIMIT 1`)
      .get(this.id, search.key) as { object_hash: string } | undefined
    const manifest = row ? this.get<PageManifest>(row.object_hash) : undefined
    return { query: search.query, status: manifest?.envelope.status ?? 'ok', sourceIds: [],
      fingerprint: search.key, data: { ...manifest?.data, pages: search.pages,
        originalBytes: search.responseBytes, completed: search.cursor === null } }
  }
  readRecord<T>(key: string): T | undefined {
    const row = this.prepare('SELECT object_hash FROM ai_evidence_records WHERE job_id = ? AND key = ?')
      .get(this.id, key) as { object_hash: string } | undefined
    return row ? this.get<T>(row.object_hash) : undefined
  }
  sourceCount(): number {
    return (this.prepare('SELECT count(DISTINCT source_id) AS count FROM ai_evidence_records WHERE job_id = ?')
      .get(this.id) as { count: number }).count
  }

  /** Read only identities and content hashes, never compressed originals. The order
   * matches archivedRecords: originals, per-deck statistics, then query summaries. */
  analysisInventory(): EvidenceAnalysisInventory {
    const records = this.prepare(`SELECT key, kind, source_id, deck_key, object_hash
      FROM ai_evidence_records WHERE job_id = ? ORDER BY key`).all(this.id) as {
        key: string; kind: string; source_id: string; deck_key: string | null; object_hash: string }[]
    const inputs: EvidenceAnalysisInput[] = records.map((row) => ({ key: row.key,
      type: 'record', fingerprint: evidenceHash(row), recordKind: row.kind,
      sourceId: row.source_id, deckKey: row.deck_key }))
    const byKey = new Map(records.map((row) => [row.key, row]))
    const occurrences = new Map<string, typeof records>()
    for (const row of records) if (row.kind === 'occurrence' && row.deck_key !== null) {
      const prior = occurrences.get(row.deck_key) ?? []
      prior.push(row); occurrences.set(row.deck_key, prior)
    }
    for (const [deckKey, rows] of [...occurrences].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      inputs.push({ key: `statistics:${deckKey}`, type: 'statistics', deckKey,
        fingerprint: evidenceHash([byKey.get(`deck:${deckKey}`) ?? null, rows]) })
    const pages = new Map<string, unknown[]>()
    for (const row of this.prepare(`SELECT search_key, sequence, cursor_key, fingerprint, object_hash
      FROM ai_evidence_pages WHERE job_id = ? ORDER BY search_key, sequence`).all(this.id) as
      { search_key: string; sequence: number; cursor_key: string; fingerprint: string; object_hash: string }[]) {
      const prior = pages.get(row.search_key) ?? []
      prior.push(row); pages.set(row.search_key, prior)
    }
    for (const row of this.prepare(`SELECT key, query_json, cursor_json, pages, response_bytes
      FROM ai_evidence_searches WHERE job_id = ? ORDER BY rowid`).all(this.id) as
      { key: string; query_json: string; cursor_json: string | null; pages: number; response_bytes: number }[])
      inputs.push({ key: `search:${row.key}`, type: 'search', fingerprint: evidenceHash([row, pages.get(row.key) ?? []]) })
    const snapshot = this.prepare(`SELECT object_hash FROM ai_evidence_values
      WHERE job_id = ? AND role = 'snapshot' AND key = 'sources'`).get(this.id) as { object_hash: string } | undefined
    return { snapshotHash: snapshot?.object_hash ?? null, inputs }
  }

  /** Hydrate a manifest member through this job's memberships, not a supplied object hash. */
  readAnalysisInput(input: EvidenceAnalysisInput): EvidenceRecord {
    if (input.type === 'aggregate') {
      const record = this.value<EvidenceRecord>('aggregate-input:v1', input.fingerprint)
      if (!record || record.key !== input.key || evidenceHash(record) !== input.fingerprint)
        throw new Error('Aggregato del manifest non disponibile per questo job.')
      return record
    }
    if (input.type === 'record') {
      const data = this.readRecord(input.key)
      if (data === undefined || !input.sourceId) throw new Error('Prova del manifest non disponibile.')
      return { key: input.key, sourceIds: [input.sourceId],
        data: { kind: input.recordKind, deckKey: input.deckKey, original: data } }
    }
    if (input.type === 'statistics' && input.deckKey) {
      const statistic = this.deckStatistics(input.deckKey).next().value
      if (!statistic) throw new Error('Statistiche del manifest non disponibili.')
      const deck = this.readRecord<{ cards: string[] }>(`deck:${input.deckKey}`)
      return { key: input.key, sourceIds: [], data: { ...statistic, cards: deck?.cards } }
    }
    if (input.type === 'search') {
      const search = this.getSearch(input.key.slice('search:'.length))
      if (!search) throw new Error('Ricerca del manifest non disponibile.')
      return { key: input.key, sourceIds: [], data: this.searchSummary(search) }
    }
    throw new Error('Elemento del manifest non valido.')
  }

  private record(key: string, kind: string, sourceId: string, data: unknown, deckKey: string | null = null): string {
    const original = canonical(data), hash = this.put(original)
    const existing = this.prepare('SELECT object_hash, deck_key FROM ai_evidence_records WHERE job_id = ? AND key = ?')
      .get(this.id, key) as { object_hash: string; deck_key: string | null } | undefined
    if (existing && (existing.object_hash !== hash || existing.deck_key !== deckKey))
      throw new Error('Una prova è cambiata nello stesso snapshot di analisi.')
    const inserted = this.prepare('INSERT OR IGNORE INTO ai_evidence_records VALUES (?, ?, ?, ?, ?, ?)')
      .run(this.id, key, kind, sourceId, deckKey, hash)
    if (inserted.changes) {
      this.detailKeys.clear()
      if (this.introducedForPage) {
        this.introducedForPage.records++
        this.introducedForPage.bytes += Buffer.byteLength(JSON.stringify({ key, sourceIds: [sourceId], data: { kind, deckKey, original } }))
      }
    }
    return hash
  }

  private manifest(result: AiEvidenceQueryResult): PageManifest {
    const { data: raw, ...envelope } = result
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } as Row : { value: raw }
    const manifest: PageManifest = { envelope, data }
    if (Array.isArray(data.matches)) {
      manifest.cards = data.matches.map((input: Row) => {
        const { reason, matchedTerms, ...card } = input
        const id = `card:${String(card.printId)}`
        return { object: this.record(id, 'card', id, card), reason, matchedTerms }
      })
      delete data.matches
    }
    if (Array.isArray(data.lists)) {
      manifest.lists = data.lists.map((input: Row, index: number) => {
        const { cards, occurrences, ...base } = input
        if (!Array.isArray(cards) || cards.some((card) => typeof card !== 'string'))
          throw new Error('Lista delle prove non valida.')
        const key = exactDeckIdentity(cards)
        // Physical deck representation and query membership stay separate. The
        // original print lines are retained even when their order differs.
        const sourceId = result.sourceIds[index] ?? `deck:${key}`
        this.record(`deck:${key}`, 'deck', sourceId, { identity: key, cards: exactDeckLines(cards) })
        const refs = Array.isArray(occurrences) ? occurrences.map((value: Row) => {
          const occurrenceKey = evidenceOccurrenceIdentity(value)
          if (!value.id || !value.listUrl) throw new Error('Partecipazione priva di provenienza.')
          const { pairings, ...participation } = value
          this.record(`occurrence:${occurrenceKey}`, 'occurrence', sourceId, participation, key)
          if (Array.isArray(pairings)) for (const pairing of pairings as Row[]) {
            const pairingKey = evidenceHash([value.id, pairing.phase, pairing.round,
              pairing.table, pairing.match, pairing.player1, pairing.player2])
            this.record(`pairing:${pairingKey}`, 'pairing', sourceId, { eventId: value.id, ...pairing })
          }
          return this.put(value)
        }) : undefined
        return { base, cards: this.put(cards), ...(refs ? { occurrences: refs } : {}) }
      })
      delete data.lists
    }
    return manifest
  }

  /** Membership, originals and cursor commit together. A replayed page is a no-op. */
  appendPage(searchKey: string, cursor: unknown, result: AiEvidenceQueryResult, next: unknown | null): boolean {
    return this.atomic(() => {
      const cursorKey = evidenceHash(cursor)
      const prior = this.prepare(`SELECT fingerprint FROM ai_evidence_pages
        WHERE job_id = ? AND search_key = ? AND cursor_key = ?`)
        .get(this.id, searchKey, cursorKey) as { fingerprint: string } | undefined
      if (prior) {
        if (prior.fingerprint !== result.fingerprint) throw new Error('Pagina già salvata con dati diversi.')
        return false
      }
      const search = this.getSearch(searchKey)
      if (!search || search.cursor === null || evidenceHash(search.cursor) !== cursorKey)
        throw new Error('Cursore delle prove non corrente.')
      if (next !== null && evidenceHash(next) === cursorKey) throw new Error('La ricerca non avanza.')
      const measured = this.value('analysis-policy', 'algorithm') === 'event-aggregates-v1'
      const introduced = { records: 0, bytes: 0 }
      let manifest: PageManifest
      this.introducedForPage = measured ? introduced : undefined
      try { manifest = this.manifest(result) } finally { this.introducedForPage = undefined }
      const hash = this.put(manifest, [...manifest.cards?.map((card) => card.object) ?? [],
        ...manifest.lists?.flatMap((list) => [list.cards, ...list.occurrences ?? []]) ?? []])
      this.prepare('INSERT INTO ai_evidence_pages VALUES (?, ?, ?, ?, ?, ?)')
        .run(this.id, searchKey, cursorKey, search.pages, result.fingerprint, hash)
      this.prepare(`UPDATE ai_evidence_searches SET cursor_json = ?, pages = pages + 1,
        response_bytes = response_bytes + ? WHERE job_id = ? AND key = ?`)
        .run(next === null ? null : JSON.stringify(next), Buffer.byteLength(JSON.stringify(result)), this.id, searchKey)
      if (measured) {
        const metric = this.put(introduced)
        this.prepare('INSERT INTO ai_evidence_values VALUES (?, ?, ?, ?)')
          .run(this.id, 'query-metrics:v1', `${searchKey}:${search.pages}`, metric)
      }
      return true
    })
  }

  *pages(searchKey?: string): Generator<AiEvidenceQueryResult> {
    let after = 0
    while (true) {
      const rows = this.prepare(`SELECT rowid, object_hash FROM ai_evidence_pages
        WHERE job_id = ? AND rowid > ? ${searchKey === undefined ? '' : 'AND search_key = ?'} ORDER BY rowid LIMIT 64`)
        .all(this.id, after, ...(searchKey === undefined ? [] : [searchKey])) as { rowid: number; object_hash: string }[]
      if (!rows.length) return
      for (const row of rows) {
        after = row.rowid
        yield this.expandPage(row.object_hash)
      }
    }
  }
  page(searchKey: string, sequence: number): AiEvidenceQueryResult | null {
    if (!/^[a-f0-9]{64}$/.test(searchKey) || !Number.isSafeInteger(sequence) || sequence < 0)
      throw new Error('Pagina delle prove non valida.')
    const row = this.prepare(`SELECT object_hash FROM ai_evidence_pages
      WHERE job_id = ? AND search_key = ? AND sequence = ?`).get(this.id, searchKey, sequence) as { object_hash: string } | undefined
    return row ? this.expandPage(row.object_hash) : null
  }
  private expandPage(hash: string): AiEvidenceQueryResult {
    const manifest = this.get<PageManifest>(hash)
    const data = { ...manifest.data }
    if (manifest.cards) data.matches = manifest.cards.map((ref) => ({ ...this.get<Row>(ref.object),
      ...(ref.reason === undefined ? {} : { reason: ref.reason }),
      ...(ref.matchedTerms === undefined ? {} : { matchedTerms: ref.matchedTerms }) }))
    if (manifest.lists) data.lists = manifest.lists.map((ref) => ({ ...ref.base, cards: this.get<string[]>(ref.cards),
      ...(ref.occurrences ? { occurrences: ref.occurrences.map((object) => this.get(object)) } : {}) }))
    return { ...manifest.envelope, data }
  }

  *records(kind?: string, sourceIds?: string[]): Generator<ArchivedEvidenceRecord> {
    if (sourceIds?.length === 0) return
    let after: string | null = null
    while (true) {
      // Never keep a SQLite cursor open while an async consumer calls the model
      // or updates diagnostics through another connection to this database.
      const rows = this.prepare(`SELECT * FROM ai_evidence_records WHERE job_id = ?
        ${kind === undefined ? '' : 'AND kind = ?'} ${after === null ? '' : 'AND key > ?'}
        ${sourceIds ? `AND source_id IN (${sourceIds.map(() => '?').join(',')})` : ''}
        ORDER BY key LIMIT 64`).all(this.id, ...(kind === undefined ? [] : [kind]),
          ...(after === null ? [] : [after]), ...sourceIds ?? []) as {
          key: string; kind: string; source_id: string; deck_key: string | null; object_hash: string }[]
      if (!rows.length) return
      for (const row of rows) {
        after = row.key
        yield { key: row.key, kind: row.kind, sourceId: row.source_id, deckKey: row.deck_key, data: this.get(row.object_hash) }
      }
    }
  }
  counts(): EvidenceArchiveCounts {
    const result = this.prepare(`SELECT count(*) AS searches,
      count(*) FILTER (WHERE cursor_json IS NULL) AS completedSearches,
      coalesce(sum(pages), 0) AS pages, coalesce(sum(response_bytes), 0) AS responseBytes
      FROM ai_evidence_searches WHERE job_id = ?`).get(this.id) as Pick<EvidenceArchiveCounts,
      'searches' | 'completedSearches' | 'pages' | 'responseBytes'>
    const counts = new Map((this.prepare(`SELECT kind, count(*) AS count FROM ai_evidence_records
      WHERE job_id = ? GROUP BY kind`).all(this.id) as { kind: string; count: number }[])
      .map((row) => [row.kind, row.count]))
    return { ...result, cards: counts.get('card') ?? 0, decks: counts.get('deck') ?? 0,
      occurrences: counts.get('occurrence') ?? 0, pairings: counts.get('pairing') ?? 0 }
  }
  /** Exact counts over unique participation identities, not sums of query pages
   * or model summaries. A field record is never a winrate against the user's deck. */
  *deckStatistics(onlyDeckKey?: string): Generator<EvidenceDeckStatistics> {
    let after = ''
    while (true) {
      const decks = this.prepare(`SELECT deck_key FROM ai_evidence_records
        WHERE job_id = ? AND kind = 'occurrence' AND deck_key > ? ${onlyDeckKey === undefined ? '' : 'AND deck_key = ?'}
        GROUP BY deck_key ORDER BY deck_key LIMIT 64`)
        .all(this.id, after, ...(onlyDeckKey === undefined ? [] : [onlyDeckKey])) as { deck_key: string }[]
      if (!decks.length) return
      for (const row of decks) {
        after = row.deck_key
        const statistic: EvidenceDeckStatistics = { deckKey: row.deck_key, occurrences: 0, events: 0,
          recordsAvailable: 0, fieldRecord: { wins: 0, losses: 0, ties: 0, denominator: 0 },
          placements: [], scope: 'observed-participations-against-event-field' }
        const events = new Set<string>(), placements = new Map<number, number>()
        for (const record of this.db.prepare(`SELECT object_hash FROM ai_evidence_records
          WHERE job_id = ? AND kind = 'occurrence' AND deck_key = ?`)
          .iterate(this.id, row.deck_key) as Iterable<{ object_hash: string }>) {
          const item = this.get<{ id: string; placing?: number | null;
            record?: { wins: number; losses: number; ties: number } | null }>(record.object_hash)
          statistic.occurrences++
          events.add(item.id)
          if (Number.isSafeInteger(item.placing) && item.placing! > 0)
            placements.set(item.placing!, (placements.get(item.placing!) ?? 0) + 1)
          const score = item.record
          if (score && [score.wins, score.losses, score.ties].every((n) => Number.isSafeInteger(n) && n >= 0)) {
            statistic.recordsAvailable++
            statistic.fieldRecord.wins += score.wins
            statistic.fieldRecord.losses += score.losses
            statistic.fieldRecord.ties += score.ties
          }
        }
        statistic.events = events.size
        statistic.placements = [...placements].sort(([a], [b]) => a - b).map(([placing, count]) => ({ placing, count }))
        statistic.fieldRecord.denominator = statistic.fieldRecord.wins + statistic.fieldRecord.losses + statistic.fieldRecord.ties
        yield statistic
      }
    }
  }
  close(): void { this.db.close() }
}

/** Only unreachable objects are collected. History and suspended runs are roots;
 * deletion never follows age or a space quota. Called after deleting a project/run. */
export function collectUnusedEvidence(db: DatabaseSync): number {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'ai_evidence_objects'").get()) return 0
  return Number(db.prepare(`WITH RECURSIVE retained(hash) AS (
    SELECT object_hash FROM ai_evidence_values
    UNION SELECT object_hash FROM ai_evidence_records
    UNION SELECT object_hash FROM ai_evidence_pages
    UNION SELECT object_hash FROM ai_evidence_event_index
    UNION SELECT link.child_hash FROM ai_evidence_links link JOIN retained ON link.parent_hash = retained.hash
  ) DELETE FROM ai_evidence_objects WHERE hash NOT IN (SELECT hash FROM retained)`).run().changes)
}
