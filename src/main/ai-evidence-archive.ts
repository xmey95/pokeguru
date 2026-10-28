import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { gzipSync, gunzipSync } from 'node:zlib'
import type { AiEvidenceQueryResult } from '../shared/ai-evidence'

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

/** A capability bound to one existing job, project and resource. Object hashes are
 * never an authorization token: callers can only traverse this run's memberships. */
export class AiEvidenceArchive {
  private readonly db: DatabaseSync
  private readonly id: string
  constructor(filePath: string, owner: { id: string; projectId: string; resourceId: string }) {
    this.db = new DatabaseSync(filePath)
    this.id = owner.id
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000')
      const job = this.db.prepare('SELECT project_id, resource_id FROM ai_jobs WHERE id = ?')
        .get(owner.id) as { project_id: string; resource_id: string } | undefined
      if (!job || job.project_id !== owner.projectId || job.resource_id !== owner.resourceId)
        throw new Error('Archivio delle prove non appartenente al progetto.')
      this.db.exec(AI_EVIDENCE_ARCHIVE_SCHEMA)
      this.db.prepare('INSERT OR IGNORE INTO ai_evidence_runs(job_id, version) VALUES (?, 1)').run(this.id)
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
    const inserted = this.db.prepare('INSERT OR IGNORE INTO ai_evidence_objects(hash, bytes) VALUES (?, ?)')
      .run(hash, body.length)
    if (inserted.changes) {
      const chunk = this.db.prepare('INSERT INTO ai_evidence_chunks(object_hash, ordinal, body) VALUES (?, ?, ?)')
      for (let offset = 0; offset < body.length; offset += CHUNK_BYTES)
        chunk.run(hash, offset / CHUNK_BYTES, gzipSync(body.subarray(offset, offset + CHUNK_BYTES)))
    }
    const link = this.db.prepare('INSERT OR IGNORE INTO ai_evidence_links VALUES (?, ?)')
    for (const child of new Set(children)) link.run(hash, child)
    return hash
  }

  private get<T>(hash: string): T {
    const expected = this.db.prepare('SELECT bytes FROM ai_evidence_objects WHERE hash = ?')
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
    const row = this.db.prepare('SELECT object_hash FROM ai_evidence_values WHERE job_id = ? AND role = ? AND key = ?')
      .get(this.id, role, key) as { object_hash: string } | undefined
    return row ? this.get<T>(row.object_hash) : undefined
  }
  saveValue(role: string, key: string, value: unknown): void {
    this.atomic(() => {
      const hash = this.put(value)
      const existing = this.db.prepare('SELECT object_hash FROM ai_evidence_values WHERE job_id = ? AND role = ? AND key = ?')
        .get(this.id, role, key) as { object_hash: string } | undefined
      if (existing && existing.object_hash !== hash) throw new Error('Il contesto salvato è immutabile.')
      this.db.prepare('INSERT OR IGNORE INTO ai_evidence_values VALUES (?, ?, ?, ?)').run(this.id, role, key, hash)
    })
  }
  *values<T>(role: string): Generator<{ key: string; value: T }> {
    for (const row of this.db.prepare('SELECT key, object_hash FROM ai_evidence_values WHERE job_id = ? AND role = ? ORDER BY key')
      .iterate(this.id, role) as Iterable<{ key: string; object_hash: string }>)
      yield { key: row.key, value: this.get<T>(row.object_hash) }
  }

  search(query: unknown): EvidenceSearch {
    const normalized = query && typeof query === 'object' && !Array.isArray(query)
      ? Object.fromEntries(Object.entries(query).filter(([key, value]) =>
        key !== 'offset' && key !== 'limit' && value !== null && value !== undefined)) : query
    const key = evidenceHash(normalized)
    const cursor = query && typeof query === 'object' && !Array.isArray(query) ? { ...query, offset: 0 } : query
    this.db.prepare(`INSERT OR IGNORE INTO ai_evidence_searches(job_id, key, query_json, cursor_json)
      VALUES (?, ?, ?, ?)`).run(this.id, key, JSON.stringify(normalized), JSON.stringify(cursor))
    return this.getSearch(key)!
  }
  getSearch(key: string): EvidenceSearch | undefined {
    const row = this.db.prepare('SELECT * FROM ai_evidence_searches WHERE job_id = ? AND key = ?')
      .get(this.id, key) as { key: string; query_json: string; cursor_json: string | null; pages: number; response_bytes: number } | undefined
    return row ? { key, query: JSON.parse(row.query_json), cursor: row.cursor_json === null ? null : JSON.parse(row.cursor_json),
      pages: row.pages, responseBytes: row.response_bytes } : undefined
  }
  *searches(): Generator<EvidenceSearch> {
    for (const row of this.db.prepare('SELECT key FROM ai_evidence_searches WHERE job_id = ? ORDER BY rowid')
      .iterate(this.id) as Iterable<{ key: string }>) yield this.getSearch(row.key)!
  }
  lastPageMetadata(searchKey: string): { remaining?: number; offset?: number } | undefined {
    const row = this.db.prepare(`SELECT object_hash FROM ai_evidence_pages
      WHERE job_id = ? AND search_key = ? ORDER BY sequence DESC LIMIT 1`)
      .get(this.id, searchKey) as { object_hash: string } | undefined
    return row ? this.get<PageManifest>(row.object_hash).data : undefined
  }

  private record(key: string, kind: string, sourceId: string, data: unknown, deckKey: string | null = null): string {
    const hash = this.put(canonical(data))
    const existing = this.db.prepare('SELECT object_hash, deck_key FROM ai_evidence_records WHERE job_id = ? AND key = ?')
      .get(this.id, key) as { object_hash: string; deck_key: string | null } | undefined
    if (existing && (existing.object_hash !== hash || existing.deck_key !== deckKey))
      throw new Error('Una prova è cambiata nello stesso snapshot di analisi.')
    this.db.prepare('INSERT OR IGNORE INTO ai_evidence_records VALUES (?, ?, ?, ?, ?, ?)')
      .run(this.id, key, kind, sourceId, deckKey, hash)
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
          const occurrenceKey = evidenceHash([value.id, value.listUrl])
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
      const prior = this.db.prepare(`SELECT fingerprint FROM ai_evidence_pages
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
      const manifest = this.manifest(result)
      const hash = this.put(manifest, [...manifest.cards?.map((card) => card.object) ?? [],
        ...manifest.lists?.flatMap((list) => [list.cards, ...list.occurrences ?? []]) ?? []])
      this.db.prepare('INSERT INTO ai_evidence_pages VALUES (?, ?, ?, ?, ?, ?)')
        .run(this.id, searchKey, cursorKey, search.pages, result.fingerprint, hash)
      this.db.prepare(`UPDATE ai_evidence_searches SET cursor_json = ?, pages = pages + 1,
        response_bytes = response_bytes + ? WHERE job_id = ? AND key = ?`)
        .run(next === null ? null : JSON.stringify(next), Buffer.byteLength(JSON.stringify(result)), this.id, searchKey)
      return true
    })
  }

  *pages(searchKey?: string): Generator<AiEvidenceQueryResult> {
    const statement = searchKey === undefined
      ? this.db.prepare('SELECT object_hash FROM ai_evidence_pages WHERE job_id = ? ORDER BY rowid')
      : this.db.prepare('SELECT object_hash FROM ai_evidence_pages WHERE job_id = ? AND search_key = ? ORDER BY sequence')
    for (const row of statement.iterate(...(searchKey === undefined ? [this.id] : [this.id, searchKey])) as Iterable<{ object_hash: string }>) {
      const manifest = this.get<PageManifest>(row.object_hash)
      const data = { ...manifest.data }
      if (manifest.cards) data.matches = manifest.cards.map((ref) => ({
        ...this.get<Row>(ref.object),
        ...(ref.reason === undefined ? {} : { reason: ref.reason }),
        ...(ref.matchedTerms === undefined ? {} : { matchedTerms: ref.matchedTerms }) }))
      if (manifest.lists) data.lists = manifest.lists.map((ref) => ({
        ...ref.base, cards: this.get<string[]>(ref.cards),
        ...(ref.occurrences ? { occurrences: ref.occurrences.map((hash) => this.get(hash)) } : {}) }))
      yield { ...manifest.envelope, data }
    }
  }

  *records(kind?: string): Generator<ArchivedEvidenceRecord> {
    const statement = kind === undefined
      ? this.db.prepare('SELECT * FROM ai_evidence_records WHERE job_id = ? ORDER BY key')
      : this.db.prepare('SELECT * FROM ai_evidence_records WHERE job_id = ? AND kind = ? ORDER BY key')
    for (const row of statement.iterate(...(kind === undefined ? [this.id] : [this.id, kind])) as Iterable<{
      key: string; kind: string; source_id: string; deck_key: string | null; object_hash: string }>)
      yield { key: row.key, kind: row.kind, sourceId: row.source_id, deckKey: row.deck_key, data: this.get(row.object_hash) }
  }
  counts(): EvidenceArchiveCounts {
    const result = this.db.prepare(`SELECT count(*) AS searches,
      count(*) FILTER (WHERE cursor_json IS NULL) AS completedSearches,
      coalesce(sum(pages), 0) AS pages, coalesce(sum(response_bytes), 0) AS responseBytes
      FROM ai_evidence_searches WHERE job_id = ?`).get(this.id) as Pick<EvidenceArchiveCounts,
      'searches' | 'completedSearches' | 'pages' | 'responseBytes'>
    const counts = new Map((this.db.prepare(`SELECT kind, count(*) AS count FROM ai_evidence_records
      WHERE job_id = ? GROUP BY kind`).all(this.id) as { kind: string; count: number }[])
      .map((row) => [row.kind, row.count]))
    return { ...result, cards: counts.get('card') ?? 0, decks: counts.get('deck') ?? 0,
      occurrences: counts.get('occurrence') ?? 0, pairings: counts.get('pairing') ?? 0 }
  }
  /** Exact counts over unique participation identities, not sums of query pages
   * or model summaries. A field record is never a winrate against the user's deck. */
  *deckStatistics(): Generator<EvidenceDeckStatistics> {
    for (const row of this.db.prepare(`SELECT deck_key FROM ai_evidence_records
      WHERE job_id = ? AND kind = 'occurrence' GROUP BY deck_key ORDER BY deck_key`)
      .iterate(this.id) as Iterable<{ deck_key: string }>) {
      const statistic: EvidenceDeckStatistics = { deckKey: row.deck_key, occurrences: 0, events: 0,
        recordsAvailable: 0, fieldRecord: { wins: 0, losses: 0, ties: 0, denominator: 0 },
        placements: [], scope: 'observed-participations-against-event-field' }
      const events = new Set<string>(), placements = new Map<number, number>()
      for (const record of this.db.prepare(`SELECT object_hash FROM ai_evidence_records
        WHERE job_id = ? AND kind = 'occurrence' AND deck_key = ? ORDER BY key`)
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
    UNION SELECT link.child_hash FROM ai_evidence_links link JOIN retained ON link.parent_hash = retained.hash
  ) DELETE FROM ai_evidence_objects WHERE hash NOT IN (SELECT hash FROM retained)`).run().changes)
}
