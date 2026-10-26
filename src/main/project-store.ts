import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseDeck, type DeckBaseline, type ImportDeckInput, type ParsedDeck } from '../shared/deck-import'
import type { MatchupNote, SaveMatchupNoteInput } from '../shared/matchups'
import type { MatchupDiscussion, MatchupReport, MetaDeck, MetaSnapshot, MatchupTurn } from '../shared/meta-matchups'
import type { CreateProjectInput, Project } from '../shared/projects'
import type { ClearLineMappingInput, DeckLineMapping, DeckReconciliation, IdentityTotal, MappedPrint, SaveLineMappingInput } from '../shared/reconciliation'
import type { DeckConstraint, DeleteConstraintInput, SaveConstraintInput } from '../shared/constraints'
import type { AdoptDeckCandidateInput, AnnotateDeckVersionInput, ContinueDeckThreadInput, CreateDeckThreadInput, DeckCandidate, DeckContextRef, DeckThread, DeckThreadMessage, DeckThreadMessageCursor, DeckThreadMessagePage, DeckThreadSummary, DeckVersion, RestoreDeckVersionInput, SaveDeckCandidateInput } from '../shared/deck-threads'
import type { AiRunConfig } from '../shared/ai'
import { normalizeDeckCodes } from '../shared/deck-code-normalization'
import type { StandardRuleAudit } from '../shared/standard-rule-audit'
import type { ThreadEvidencePacket } from '../shared/thread-evidence'

interface ThreadMessageRow {
  row_id: number
  id: string
  text: string
  created_at: string
  author: DeckThreadMessage['author']
  ai_config_json: string | null
  ai_turn_id: string | null
  evidence_json: string | null
  cited_source_ids_json: string | null
}

function messageCursor(row: ThreadMessageRow): DeckThreadMessageCursor {
  return { createdAt: row.created_at, rowId: row.row_id }
}

function parseThreadMessage(row: ThreadMessageRow): DeckThreadMessage {
  return {
    id: row.id, text: row.text, createdAt: row.created_at, author: row.author,
    aiConfig: row.ai_config_json ? JSON.parse(row.ai_config_json) as AiRunConfig : null,
    aiTurnId: row.ai_turn_id,
    evidence: row.evidence_json ? JSON.parse(row.evidence_json) as ThreadEvidencePacket : null,
    citedSourceIds: row.cited_source_ids_json ? JSON.parse(row.cited_source_ids_json) as string[] : []
  }
}

interface ProjectRow {
  id: string
  name: string
  format: 'STANDARD'
  circuit: Project['circuit']
  circuit_assignment: Project['circuitAssignment']
  created_at: string
  updated_at: string
  archived_at: string | null
  baseline_total: number | null
  baseline_problem_count: number | null
}

function toProject(row: ProjectRow): Project {
  const status = row.baseline_total === null
    ? 'DA_COSTRUIRE'
    : row.baseline_total === 60 && row.baseline_problem_count === 0
      ? 'PRONTA_PER_CONTROLLO'
      : 'BOZZA'
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    circuit: row.circuit,
    circuitAssignment: row.circuit_assignment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    status,
    cardTotal: row.baseline_total
  }
}

const projectQuery = `
  SELECT p.id, p.name, p.format, p.circuit, p.circuit_assignment, p.created_at, p.updated_at, p.archived_at,
         b.interpreted_total AS baseline_total, b.problem_count AS baseline_problem_count
  FROM projects p LEFT JOIN deck_baselines b ON b.project_id = p.id
`

interface MatchupRow {
  id: string
  project_id: string
  deck_hash: string
  opponent: string
  strengths: string
  weaknesses: string
  our_key_cards: string
  their_key_cards: string
  strategy: string
  created_at: string
  updated_at: string
}

function deckHash(rawText: string): string {
  return createHash('sha256').update(rawText).digest('hex')
}

const LEGACY_UNSCOPED_VERSION = 'legacy-unscoped'

function toMatchupNote(row: MatchupRow, currentHash: string | null): MatchupNote {
  return {
    id: row.id,
    projectId: row.project_id,
    opponent: row.opponent,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    ourKeyCards: row.our_key_cards,
    theirKeyCards: row.their_key_cards,
    strategy: row.strategy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkedToCurrentList: currentHash !== null && row.deck_hash === currentHash
  }
}

export class ProjectStore {
  private readonly db: DatabaseSync

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.db = new DatabaseSync(filePath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    const needsLegacyMigration = (this.db.prepare('PRAGMA user_version').get() as
      { user_version: number }).user_version === 0
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        format TEXT NOT NULL CHECK (format = 'STANDARD'),
        circuit TEXT NOT NULL DEFAULT 'WESTERN' CHECK (circuit IN ('WESTERN', 'JAPAN')),
        circuit_assignment TEXT NOT NULL DEFAULT 'CREATED' CHECK (circuit_assignment IN ('CREATED', 'MIGRATED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_baselines (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK (source IN ('paste', 'file')),
        file_name TEXT,
        raw_text TEXT NOT NULL,
        parsed_json TEXT NOT NULL,
        interpreted_total INTEGER NOT NULL,
        problem_count INTEGER NOT NULL,
        imported_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_line_mappings (
        project_id TEXT NOT NULL REFERENCES deck_baselines(project_id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        baseline_imported_at TEXT NOT NULL,
        raw_line TEXT NOT NULL,
        original_name TEXT NOT NULL,
        source_language TEXT,
        print_snapshot TEXT NOT NULL,
        selected_at TEXT NOT NULL,
        PRIMARY KEY (project_id, line_number)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_constraints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        identity_id TEXT NOT NULL,
        identity_name TEXT NOT NULL,
        print_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('required', 'minimum', 'exact')),
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 60),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS deck_constraints_project ON deck_constraints(project_id, created_at);
    `)
    const columns = new Set((this.db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]).map((row) => row.name))
    if (!columns.has('circuit') || !columns.has('circuit_assignment')) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        if (!columns.has('circuit')) {
          this.db.exec("ALTER TABLE projects ADD COLUMN circuit TEXT NOT NULL DEFAULT 'WESTERN' CHECK (circuit IN ('WESTERN', 'JAPAN'))")
        }
        if (!columns.has('circuit_assignment')) {
          this.db.exec("ALTER TABLE projects ADD COLUMN circuit_assignment TEXT NOT NULL DEFAULT 'MIGRATED' CHECK (circuit_assignment IN ('CREATED', 'MIGRATED'))")
        }
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    }
    if (!columns.has('archived_at')) this.db.exec('ALTER TABLE projects ADD COLUMN archived_at TEXT')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deck_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('paste', 'file')),
        file_name TEXT,
        raw_text TEXT NOT NULL,
        parsed_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(project_id, sequence),
        UNIQUE(project_id, id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_main_heads (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        version_id TEXT NOT NULL,
        FOREIGN KEY (project_id, version_id) REFERENCES deck_versions(project_id, id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_threads (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        base_version_id TEXT REFERENCES deck_versions(id),
        ai_session_ref TEXT,
        opening_ai_message_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS deck_threads_project ON deck_threads(project_id, created_at);
      CREATE TABLE IF NOT EXISTS deck_thread_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES deck_threads(id) ON DELETE CASCADE,
        author TEXT NOT NULL CHECK (author IN ('user', 'assistant')),
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS deck_thread_messages_thread ON deck_thread_messages(thread_id, created_at);
      CREATE TABLE IF NOT EXISTS deck_thread_candidates (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES deck_threads(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        parsed_json TEXT NOT NULL,
        note TEXT NOT NULL,
        origin TEXT NOT NULL CHECK (origin = 'manual'),
        created_at TEXT NOT NULL,
        UNIQUE(thread_id, sequence)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_ai_candidates (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES deck_threads(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        parsed_json TEXT NOT NULL,
        note TEXT NOT NULL,
        sources_json TEXT NOT NULL,
        checks_json TEXT NOT NULL,
        ai_config_json TEXT NOT NULL,
        ai_turn_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(thread_id, sequence),
        UNIQUE(thread_id, ai_turn_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_adoptions (
        version_id TEXT PRIMARY KEY REFERENCES deck_versions(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL REFERENCES deck_threads(id) ON DELETE CASCADE,
        candidate_id TEXT NOT NULL,
        adopted_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_restores (
        version_id TEXT PRIMARY KEY REFERENCES deck_versions(id) ON DELETE CASCADE,
        source_version_id TEXT NOT NULL REFERENCES deck_versions(id),
        restored_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_version_annotations (
        version_id TEXT PRIMARY KEY REFERENCES deck_versions(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        note TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS deck_resolution_revisions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version_id TEXT NOT NULL REFERENCES deck_versions(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        mappings_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(project_id, sequence)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS deck_resolution_version ON deck_resolution_revisions(version_id, sequence);
      CREATE TABLE IF NOT EXISTS deck_resolution_heads (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        revision_id TEXT NOT NULL REFERENCES deck_resolution_revisions(id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS standard_rule_audit (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload_json TEXT NOT NULL
      ) STRICT;
    `)
    const threadColumns = new Set((this.db.prepare('PRAGMA table_info(deck_threads)').all() as { name: string }[]).map((row) => row.name))
    if (!threadColumns.has('opening_ai_message_id')) this.db.exec('ALTER TABLE deck_threads ADD COLUMN opening_ai_message_id TEXT')
    if (!threadColumns.has('base_resolution_id')) this.db.exec('ALTER TABLE deck_threads ADD COLUMN base_resolution_id TEXT')
    if (!threadColumns.has('parent_thread_id')) this.db.exec('ALTER TABLE deck_threads ADD COLUMN parent_thread_id TEXT')
    if (!threadColumns.has('seed_candidate_id')) this.db.exec('ALTER TABLE deck_threads ADD COLUMN seed_candidate_id TEXT')
    const messageColumns = new Set((this.db.prepare('PRAGMA table_info(deck_thread_messages)').all() as { name: string }[]).map((row) => row.name))
    if (!messageColumns.has('ai_config_json') || !messageColumns.has('ai_turn_id')) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        if (!messageColumns.has('ai_config_json')) this.db.exec('ALTER TABLE deck_thread_messages ADD COLUMN ai_config_json TEXT')
        if (!messageColumns.has('ai_turn_id')) this.db.exec('ALTER TABLE deck_thread_messages ADD COLUMN ai_turn_id TEXT')
        this.db.exec('COMMIT')
      } catch (error) { this.db.exec('ROLLBACK'); throw error }
    }
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS deck_thread_messages_ai_turn ON deck_thread_messages(thread_id, ai_turn_id) WHERE ai_turn_id IS NOT NULL')
    const evidenceColumns = new Set((this.db.prepare('PRAGMA table_info(deck_thread_messages)').all() as { name: string }[])
      .map((row) => row.name))
    if (!evidenceColumns.has('evidence_json')) this.db.exec('ALTER TABLE deck_thread_messages ADD COLUMN evidence_json TEXT')
    if (!evidenceColumns.has('cited_source_ids_json')) this.db.exec('ALTER TABLE deck_thread_messages ADD COLUMN cited_source_ids_json TEXT')
    const manualCandidateColumns = new Set((this.db.prepare('PRAGMA table_info(deck_thread_candidates)').all() as { name: string }[]).map((row) => row.name))
    if (!manualCandidateColumns.has('parent_candidate_id')) this.db.exec('ALTER TABLE deck_thread_candidates ADD COLUMN parent_candidate_id TEXT')
    const aiCandidateColumns = new Set((this.db.prepare('PRAGMA table_info(deck_ai_candidates)').all() as { name: string }[]).map((row) => row.name))
    if (!aiCandidateColumns.has('parent_candidate_id')) this.db.exec('ALTER TABLE deck_ai_candidates ADD COLUMN parent_candidate_id TEXT')
    if (needsLegacyMigration) {
      this.migrateDeckVersions()
      this.repairTrainerSectionImports()
    }
    this.seedCurrentResolutions()
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matchup_notes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        deck_hash TEXT NOT NULL,
        opponent TEXT NOT NULL,
        strengths TEXT NOT NULL,
        weaknesses TEXT NOT NULL,
        our_key_cards TEXT NOT NULL,
        their_key_cards TEXT NOT NULL,
        strategy TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS matchup_notes_opponent
        ON matchup_notes(project_id, opponent COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS meta_snapshots (
        id TEXT PRIMARY KEY,
        fetched_at TEXT NOT NULL,
        payload TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS matchup_reports (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        meta_id TEXT NOT NULL REFERENCES meta_snapshots(id),
        opponent_id TEXT NOT NULL,
        deck_hash TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (project_id, meta_id, opponent_id, deck_hash)
      ) STRICT;
    `)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matchup_discussions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        meta_id TEXT NOT NULL REFERENCES meta_snapshots(id),
        opponent_id TEXT NOT NULL,
        deck_hash TEXT NOT NULL,
        parent_id TEXT REFERENCES matchup_discussions(id),
        created_at TEXT NOT NULL,
        context_summary TEXT NOT NULL DEFAULT '',
        summarized_through INTEGER NOT NULL DEFAULT -1,
        UNIQUE(project_id, meta_id, opponent_id, deck_hash)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS matchup_turns (
        id TEXT PRIMARY KEY,
        discussion_id TEXT NOT NULL REFERENCES matchup_discussions(id) ON DELETE CASCADE,
        turn_no INTEGER NOT NULL,
        feedback TEXT,
        created_at TEXT NOT NULL,
        report_payload TEXT,
        change_summary TEXT,
        UNIQUE(discussion_id, turn_no)
      ) STRICT;
    `)
    const discussionColumns = new Set((this.db.prepare('PRAGMA table_info(matchup_discussions)').all() as { name: string }[]).map((row) => row.name))
    if (!discussionColumns.has('content_hash')) this.db.exec('ALTER TABLE matchup_discussions ADD COLUMN content_hash TEXT')
    if (!discussionColumns.has('deck_version_id')) this.db.exec('ALTER TABLE matchup_discussions ADD COLUMN deck_version_id TEXT')
    if (!discussionColumns.has('deck_resolution_id')) this.db.exec('ALTER TABLE matchup_discussions ADD COLUMN deck_resolution_id TEXT')
    if (needsLegacyMigration) this.migrateMatchupReports()
    this.scopeLegacyMatchupDiscussions()
  }

  private migrateDeckVersions(): void {
    const rows = this.db.prepare(`SELECT b.project_id, b.source, b.file_name, b.raw_text,
      b.parsed_json, b.imported_at FROM deck_baselines b
      LEFT JOIN deck_main_heads h ON h.project_id = b.project_id
      WHERE h.project_id IS NULL`).all() as {
      project_id: string; source: 'paste' | 'file'; file_name: string | null
      raw_text: string; parsed_json: string; imported_at: string
    }[]
    if (!rows.length) return
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        const id = randomUUID()
        this.db.prepare(`INSERT INTO deck_versions
          (id, project_id, sequence, source, file_name, raw_text, parsed_json, created_at)
          VALUES (?, ?, 1, ?, ?, ?, ?, ?)`)
          .run(id, row.project_id, row.source, row.file_name, row.raw_text, row.parsed_json, row.imported_at)
        this.db.prepare('INSERT INTO deck_main_heads (project_id, version_id) VALUES (?, ?)')
          .run(row.project_id, id)
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  private recordResolutionRevision(projectId: string, versionId: string, reason: string,
    createdAt = new Date().toISOString()): string {
    const mappings = this.db.prepare(`SELECT line_number, raw_line, original_name, source_language,
      print_snapshot, selected_at FROM deck_line_mappings WHERE project_id = ? ORDER BY line_number`)
      .all(projectId)
    const sequence = (this.db.prepare(`SELECT COALESCE(MAX(sequence), 0) + 1 AS next
      FROM deck_resolution_revisions WHERE project_id = ?`).get(projectId) as { next: number }).next
    const id = randomUUID()
    this.db.prepare(`INSERT INTO deck_resolution_revisions
      (id, project_id, version_id, sequence, mappings_json, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, projectId, versionId, sequence,
        JSON.stringify(mappings), reason, createdAt)
    this.db.prepare(`INSERT INTO deck_resolution_heads (project_id, revision_id) VALUES (?, ?)
      ON CONFLICT(project_id) DO UPDATE SET revision_id = excluded.revision_id`).run(projectId, id)
    return id
  }

  private seedCurrentResolutions(): void {
    const heads = this.db.prepare(`SELECT h.project_id, h.version_id FROM deck_main_heads h
      LEFT JOIN deck_resolution_heads r ON r.project_id = h.project_id
      WHERE r.project_id IS NULL`).all() as { project_id: string; version_id: string }[]
    if (!heads.length) return
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const head of heads) this.recordResolutionRevision(head.project_id, head.version_id, 'migration')
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  getCurrentDeckContext(projectId: string): DeckContextRef | null {
    if (!this.get(projectId)) return null
    const row = this.db.prepare(`SELECT h.version_id, r.revision_id FROM deck_main_heads h
      LEFT JOIN deck_resolution_heads r ON r.project_id = h.project_id WHERE h.project_id = ?`)
      .get(projectId) as { version_id: string; revision_id: string | null } | undefined
    return row ? { versionId: row.version_id, resolutionId: row.revision_id } : null
  }

  private repairTrainerSectionImports(): void {
    const tables = [
      { name: 'deck_baselines', key: 'project_id' },
      { name: 'deck_versions', key: 'id' },
      { name: 'deck_thread_candidates', key: 'id' },
      { name: 'deck_ai_candidates', key: 'id' }
    ] as const
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const table of tables) {
        const rows = this.db.prepare(`SELECT ${table.key} AS key, raw_text, parsed_json FROM ${table.name}
          WHERE raw_text LIKE '%Carte Allenator%' OR raw_text LIKE '%Energia:%'`)
          .all() as { key: string; raw_text: string; parsed_json: string }[]
        for (const row of rows) {
          const stored = JSON.parse(row.parsed_json) as ParsedDeck
          if (!stored.lines.some((line) => line.kind === 'unparsed' &&
            parseDeck(line.raw).lines[0]?.kind === 'section')) continue
          const parsed = parseDeck(row.raw_text)
          if (table.name === 'deck_baselines') {
            const problemCount = parsed.diagnostics.filter((diagnostic) =>
              diagnostic.code === 'UNPARSED' || diagnostic.code === 'TOTAL_MISMATCH').length
            this.db.prepare(`UPDATE deck_baselines SET parsed_json = ?, interpreted_total = ?, problem_count = ?
              WHERE project_id = ?`).run(JSON.stringify(parsed), parsed.interpretedTotal, problemCount, row.key)
          } else {
            this.db.prepare(`UPDATE ${table.name} SET parsed_json = ? WHERE ${table.key} = ?`)
              .run(JSON.stringify(parsed), row.key)
          }
        }
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  private migrateMatchupReports(): void {
    const rows = this.db.prepare('SELECT project_id, meta_id, opponent_id, deck_hash, generated_at, payload FROM matchup_reports')
      .all() as { project_id: string; meta_id: string; opponent_id: string; deck_hash: string; generated_at: string; payload: string }[]
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        this.db.prepare(`INSERT OR IGNORE INTO matchup_discussions
          (id, project_id, meta_id, opponent_id, deck_hash, parent_id, created_at)
          VALUES (?, ?, ?, ?, ?, NULL, ?)`).run(randomUUID(), row.project_id, row.meta_id, row.opponent_id, row.deck_hash, row.generated_at)
        const discussion = this.db.prepare(`SELECT id FROM matchup_discussions
          WHERE project_id = ? AND meta_id = ? AND opponent_id = ? AND deck_hash = ?`)
          .get(row.project_id, row.meta_id, row.opponent_id, row.deck_hash) as { id: string }
        this.db.prepare(`INSERT OR IGNORE INTO matchup_turns
          (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary)
          VALUES (?, ?, 0, NULL, ?, ?, NULL)`)
          .run(randomUUID(), discussion.id, row.generated_at, row.payload)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private scopeLegacyMatchupDiscussions(): void {
    const legacy = this.db.prepare(`SELECT id, project_id, deck_hash FROM matchup_discussions
      WHERE content_hash IS NULL`).all() as { id: string; project_id: string; deck_hash: string }[]
    if (!legacy.length) return
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of legacy) {
        const head = this.db.prepare(`SELECT h.version_id, r.revision_id, b.raw_text FROM deck_main_heads h
          JOIN deck_baselines b ON b.project_id = h.project_id
          LEFT JOIN deck_resolution_heads r ON r.project_id = h.project_id
          WHERE h.project_id = ?`).get(row.project_id) as
          { version_id: string; revision_id: string | null; raw_text: string } | undefined
        // A legacy hash includes selected identities; repeated raw text cannot prove which vN produced it.
        const sameTextVersions = head ? (this.db.prepare(`SELECT COUNT(*) AS count FROM deck_versions
          WHERE project_id = ? AND raw_text = ?`).get(row.project_id, head.raw_text) as { count: number }).count : 0
        const verifiedCurrent = head && sameTextVersions === 1 &&
          row.deck_hash === this.currentDeckHash(row.project_id)
        this.db.prepare(`UPDATE matchup_discussions SET content_hash = ?, deck_version_id = ?,
          deck_resolution_id = ? WHERE id = ?`).run(row.deck_hash,
            verifiedCurrent ? head.version_id : LEGACY_UNSCOPED_VERSION,
            verifiedCurrent ? head.revision_id : null, row.id)
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  list(): Project[] {
    const rows = this.db
      .prepare(`${projectQuery} WHERE p.archived_at IS NULL ORDER BY p.created_at DESC, p.id DESC`)
      .all() as unknown as ProjectRow[]
    return rows.map(toProject)
  }

  listArchived(): Project[] {
    const rows = this.db.prepare(`${projectQuery} WHERE p.archived_at IS NOT NULL ORDER BY p.archived_at DESC, p.id DESC`)
      .all() as unknown as ProjectRow[]
    return rows.map(toProject)
  }

  get(id: string): Project | null {
    if (typeof id !== 'string' || id.length > 100) {
      return null
    }
    const row = this.db
      .prepare(`${projectQuery} WHERE p.id = ? AND p.archived_at IS NULL`)
      .get(id) as ProjectRow | undefined
    return row ? toProject(row) : null
  }

  archive(id: string): Project {
    if (!this.get(id)) throw new Error('Progetto attivo non trovato.')
    const changed = this.db.prepare('UPDATE projects SET archived_at = ? WHERE id = ? AND archived_at IS NULL')
      .run(new Date().toISOString(), id)
    if (changed.changes !== 1) throw new Error('Archiviazione non riuscita.')
    return this.listArchived().find((project) => project.id === id)!
  }

  restore(id: string): Project {
    if (typeof id !== 'string' || id.length > 100) throw new Error('Progetto archiviato non valido.')
    const changed = this.db.prepare('UPDATE projects SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL').run(id)
    if (changed.changes !== 1) throw new Error('Progetto archiviato non trovato.')
    return this.get(id)!
  }

  deleteArchived(id: string, confirmationName: string): string[] {
    if (typeof id !== 'string' || id.length > 100 || typeof confirmationName !== 'string')
      throw new Error('Conferma di cancellazione non valida.')
    const archived = this.listArchived().find((project) => project.id === id)
    if (!archived) throw new Error('Progetto archiviato non trovato.')
    if (confirmationName !== archived.name) throw new Error('Il nome di conferma non corrisponde al progetto.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const active = this.db.prepare("SELECT 1 FROM ai_jobs WHERE project_id = ? AND status IN ('running', 'ready') LIMIT 1")
        .get(id)
      if (active) throw new Error('Attendi o annulla il job AI prima di cancellare il progetto.')
      const jobs = this.db.prepare('SELECT id FROM ai_jobs WHERE project_id = ?').all(id) as { id: string }[]
      this.db.prepare('DELETE FROM ai_jobs WHERE project_id = ?').run(id)
      const changed = this.db.prepare('DELETE FROM projects WHERE id = ? AND archived_at IS NOT NULL').run(id)
      if (changed.changes !== 1) throw new Error('Cancellazione non riuscita.')
      this.db.exec('COMMIT')
      return jobs.map((job) => job.id)
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  create(input: CreateProjectInput): Project {
    if (!input || typeof input.name !== 'string' || input.format !== 'STANDARD') {
      throw new Error('Dati del progetto non validi.')
    }
    const name = input.name.trim()
    if (!name || name.length > 120) {
      throw new Error('Inserisci un nome da 1 a 120 caratteri.')
    }

    const now = new Date().toISOString()
    const project: Project = {
      id: randomUUID(),
      name,
      format: input.format,
      circuit: 'WESTERN',
      circuitAssignment: 'CREATED',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      status: 'DA_COSTRUIRE',
      cardTotal: null
    }
    this.db
      .prepare('INSERT INTO projects (id, name, format, circuit, circuit_assignment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(project.id, project.name, project.format, project.circuit, project.circuitAssignment, project.createdAt, project.updatedAt)
    return project
  }

  getBaseline(projectId: string): DeckBaseline | null {
    if (!this.get(projectId)) return null
    const row = this.db.prepare(`
      SELECT project_id, source, file_name, raw_text, parsed_json, imported_at
      FROM deck_baselines WHERE project_id = ?
    `).get(projectId) as {
      project_id: string
      source: 'paste' | 'file'
      file_name: string | null
      raw_text: string
      parsed_json: string
      imported_at: string
    } | undefined
    if (!row) return null
    return {
      projectId: row.project_id,
      versionId: this.getCurrentDeckContext(projectId)?.versionId ?? null,
      resolutionId: this.getCurrentDeckContext(projectId)?.resolutionId ?? null,
      source: row.source,
      fileName: row.file_name,
      rawText: row.raw_text,
      importedAt: row.imported_at,
      ...(JSON.parse(row.parsed_json) as ParsedDeck)
    }
  }

  listDeckVersions(projectId: string): DeckVersion[] {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    const rows = this.db.prepare(`SELECT v.id, v.project_id, v.sequence, v.source, v.file_name,
      v.raw_text, v.parsed_json, v.created_at, a.thread_id, a.candidate_id,
      restored.source_version_id, source.sequence AS restored_sequence,
      annotation.label, annotation.note,
      (SELECT id FROM deck_resolution_revisions WHERE version_id = v.id
        ORDER BY sequence DESC LIMIT 1) AS resolution_id
      FROM deck_versions v LEFT JOIN deck_adoptions a ON a.version_id = v.id
      LEFT JOIN deck_restores restored ON restored.version_id = v.id
      LEFT JOIN deck_versions source ON source.id = restored.source_version_id
      LEFT JOIN deck_version_annotations annotation ON annotation.version_id = v.id
      WHERE v.project_id = ? ORDER BY v.sequence DESC`)
      .all(projectId) as {
        id: string; project_id: string; sequence: number; source: 'paste' | 'file'
        file_name: string | null; raw_text: string; parsed_json: string; created_at: string
        thread_id: string | null; candidate_id: string | null
        source_version_id: string | null; restored_sequence: number | null
        label: string | null; note: string | null; resolution_id: string | null
      }[]
    return rows.map((row) => ({
      id: row.id, projectId: row.project_id, sequence: row.sequence, source: row.source,
      fileName: row.file_name, rawText: row.raw_text,
      parsed: JSON.parse(row.parsed_json) as ParsedDeck, createdAt: row.created_at,
      adoption: row.thread_id && row.candidate_id ? { threadId: row.thread_id, candidateId: row.candidate_id } : null,
      restoredFrom: row.source_version_id && row.restored_sequence != null
        ? { id: row.source_version_id, sequence: row.restored_sequence } : null,
      label: row.label ?? '', note: row.note ?? '', resolutionId: row.resolution_id,
      resolutionKnown: row.resolution_id !== null
    }))
  }

  annotateDeckVersion(input: AnnotateDeckVersionInput): DeckVersion {
    if (!input || !this.get(input.projectId) || typeof input.label !== 'string' ||
      typeof input.note !== 'string' || input.label.trim().length > 80 ||
      input.note.trim().length > 1000 || input.label.includes('\0') || input.note.includes('\0'))
      throw new Error('Etichetta o nota della versione non valida.')
    const version = this.listDeckVersions(input.projectId).find((item) => item.id === input.versionId)
    if (!version) throw new Error('Versione non trovata in questo progetto.')
    this.db.prepare(`INSERT INTO deck_version_annotations (version_id, label, note, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(version_id) DO UPDATE SET
      label = excluded.label, note = excluded.note, updated_at = excluded.updated_at`)
      .run(input.versionId, input.label.trim(), input.note.trim(), new Date().toISOString())
    return this.listDeckVersions(input.projectId).find((item) => item.id === input.versionId)!
  }

  private applyResolutionSnapshot(projectId: string, resolutionId: string | null,
    importedAt: string): void {
    this.db.prepare('DELETE FROM deck_line_mappings WHERE project_id = ?').run(projectId)
    if (!resolutionId) return
    const snapshot = this.db.prepare(`SELECT mappings_json FROM deck_resolution_revisions
      WHERE id = ? AND project_id = ?`).get(resolutionId, projectId) as
      { mappings_json: string } | undefined
    if (!snapshot) throw new Error('Correzioni della versione non disponibili.')
    const mappings = JSON.parse(snapshot.mappings_json) as {
      line_number: number; raw_line: string; original_name: string; source_language: string | null
      print_snapshot: string; selected_at: string
    }[]
    const insert = this.db.prepare(`INSERT INTO deck_line_mappings
      (project_id, line_number, baseline_imported_at, raw_line, original_name,
        source_language, print_snapshot, selected_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) `)
    for (const mapping of mappings) insert.run(projectId, mapping.line_number, importedAt,
      mapping.raw_line, mapping.original_name, mapping.source_language,
      mapping.print_snapshot, mapping.selected_at)
  }

  restoreDeckVersion(input: RestoreDeckVersionInput): DeckBaseline {
    if (!input || !this.get(input.projectId) || typeof input.versionId !== 'string' ||
      typeof input.expectedHeadId !== 'string') throw new Error('Richiesta di ripristino non valida.')
    const now = new Date().toISOString()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const head = this.getCurrentDeckContext(input.projectId)
      if (!head || head.versionId !== input.expectedHeadId)
        throw new Error('La lista principale è cambiata: riapri il confronto prima di ripristinare.')
      if (input.expectedResolutionId !== undefined && head.resolutionId !== input.expectedResolutionId)
        throw new Error('Le correzioni della lista sono cambiate: riapri il confronto prima di ripristinare.')
      const versions = this.listDeckVersions(input.projectId)
      const target = versions.find((item) => item.id === input.versionId)
      const current = versions.find((item) => item.id === head.versionId)
      if (!target || !current) throw new Error('Versione non trovata in questo progetto.')
      if (target.id === current.id) throw new Error('Questa versione è già la lista principale.')
      const sameText = target.rawText === current.rawText
      if (sameText && target.resolutionId === head.resolutionId)
        throw new Error('La lista e le correzioni coincidono già con la versione principale.')
      const nextId = sameText ? current.id : randomUUID()
      if (!sameText) {
        this.db.prepare(`INSERT INTO deck_versions
          (id, project_id, sequence, source, file_name, raw_text, parsed_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(nextId, input.projectId, current.sequence + 1,
            target.source, target.fileName, target.rawText, JSON.stringify(target.parsed), now)
        this.db.prepare(`INSERT INTO deck_restores (version_id, source_version_id, restored_at)
          VALUES (?, ?, ?)`).run(nextId, target.id, now)
      }
      const parsed = target.parsed
      const problemCount = parsed.diagnostics.filter((item) =>
        item.code === 'UNPARSED' || item.code === 'TOTAL_MISMATCH').length
      this.db.prepare(`INSERT INTO deck_baselines
        (project_id, source, file_name, raw_text, parsed_json, interpreted_total, problem_count, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET source = excluded.source,
        file_name = excluded.file_name, raw_text = excluded.raw_text,
        parsed_json = excluded.parsed_json, interpreted_total = excluded.interpreted_total,
        problem_count = excluded.problem_count, imported_at = excluded.imported_at`)
        .run(input.projectId, target.source, target.fileName, target.rawText,
          JSON.stringify(parsed), parsed.interpretedTotal, problemCount, now)
      this.applyResolutionSnapshot(input.projectId, target.resolutionId, now)
      if (!sameText) this.db.prepare('UPDATE deck_main_heads SET version_id = ? WHERE project_id = ?')
        .run(nextId, input.projectId)
      const resolutionId = this.recordResolutionRevision(input.projectId, nextId, 'restore', now)
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, input.projectId)
      this.db.exec('COMMIT')
      return { projectId: input.projectId, versionId: nextId, resolutionId,
        rawText: target.rawText, source: target.source, fileName: target.fileName,
        importedAt: now, ...parsed }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  getStandardRuleAudit(): StandardRuleAudit | null {
    const row = this.db.prepare('SELECT payload_json FROM standard_rule_audit WHERE id = 1')
      .get() as { payload_json: string } | undefined
    return row ? JSON.parse(row.payload_json) as StandardRuleAudit : null
  }

  saveStandardRuleAudit(audit: StandardRuleAudit): void {
    this.db.prepare(`INSERT INTO standard_rule_audit (id, payload_json) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`).run(JSON.stringify(audit))
  }

  adoptDeckCandidate(input: AdoptDeckCandidateInput): DeckBaseline {
    if (!input || !this.get(input.projectId) || typeof input.threadId !== 'string' ||
      typeof input.candidateId !== 'string' || typeof input.expectedHeadId !== 'string')
      throw new Error('Richiesta di adozione non valida.')
    const now = new Date().toISOString()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const head = this.db.prepare('SELECT version_id FROM deck_main_heads WHERE project_id = ?')
        .get(input.projectId) as { version_id: string } | undefined
      const thread = this.db.prepare('SELECT base_version_id FROM deck_threads WHERE project_id = ? AND id = ?')
        .get(input.projectId, input.threadId) as { base_version_id: string | null } | undefined
      if (!head || !thread) throw new Error('Lista principale o thread non trovato nel progetto.')
      if (head.version_id !== input.expectedHeadId || thread.base_version_id !== head.version_id)
        throw new Error('La lista principale è cambiata: confronta la candidata con la versione corrente prima di adottarla.')
      const candidate = this.db.prepare(`SELECT raw_text FROM deck_thread_candidates WHERE thread_id = ? AND id = ?
        UNION ALL SELECT raw_text FROM deck_ai_candidates WHERE thread_id = ? AND id = ?`)
        .get(input.threadId, input.candidateId, input.threadId, input.candidateId) as { raw_text: string } | undefined
      if (!candidate) throw new Error('Candidata non trovata in questo thread.')
      const normalized = normalizeDeckCodes(candidate.raw_text)
      const parsed = parseDeck(normalized.rawText)
      if (parsed.interpretedTotal !== 60 || parsed.lines.some((line) => line.kind === 'unparsed') ||
        parsed.diagnostics.some((item) => item.code === 'TOTAL_MISMATCH'))
        throw new Error('La candidata deve contenere 60 carte e nessuna riga o totale incoerente.')
      if (normalized.unsupported.length)
        throw new Error('Alcuni codici set con punto non sono ancora verificati nell’export Limitless.')
      if (parsed.diagnostics.some((item) => item.code === 'ALT_PRINT'))
        throw new Error('Le stampe ALT non sono riconosciute in modo affidabile da Limitless.')
      const previous = this.db.prepare('SELECT raw_text FROM deck_baselines WHERE project_id = ?')
        .get(input.projectId) as { raw_text: string } | undefined
      if (previous?.raw_text === normalized.rawText) throw new Error('La candidata coincide già con la lista principale.')
      const latest = this.db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM deck_versions WHERE project_id = ?')
        .get(input.projectId) as { sequence: number }
      const versionId = randomUUID()
      this.db.prepare(`INSERT INTO deck_versions
        (id, project_id, sequence, source, file_name, raw_text, parsed_json, created_at)
        VALUES (?, ?, ?, 'paste', NULL, ?, ?, ?)`)
        .run(versionId, input.projectId, latest.sequence + 1, normalized.rawText, JSON.stringify(parsed), now)
      this.db.prepare('INSERT INTO deck_adoptions (version_id, thread_id, candidate_id, adopted_at) VALUES (?, ?, ?, ?)')
        .run(versionId, input.threadId, input.candidateId, now)
      this.db.prepare('DELETE FROM deck_line_mappings WHERE project_id = ?').run(input.projectId)
      this.db.prepare(`INSERT INTO deck_baselines
        (project_id, source, file_name, raw_text, parsed_json, interpreted_total, problem_count, imported_at)
        VALUES (?, 'paste', NULL, ?, ?, 60, 0, ?)
        ON CONFLICT(project_id) DO UPDATE SET source = excluded.source, file_name = NULL,
        raw_text = excluded.raw_text, parsed_json = excluded.parsed_json,
        interpreted_total = 60, problem_count = 0, imported_at = excluded.imported_at`)
        .run(input.projectId, normalized.rawText, JSON.stringify(parsed), now)
      this.db.prepare('UPDATE deck_main_heads SET version_id = ? WHERE project_id = ?').run(versionId, input.projectId)
      const resolutionId = this.recordResolutionRevision(input.projectId, versionId, 'adoption', now)
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, input.projectId)
      this.db.exec('COMMIT')
      return { projectId: input.projectId, versionId, resolutionId, rawText: normalized.rawText,
        source: 'paste', fileName: null, importedAt: now, ...parsed }
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  listDeckThreadSummaries(projectId: string): DeckThreadSummary[] {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    const rows = this.db.prepare(`SELECT t.id, t.project_id, t.title, t.base_version_id,
      t.base_resolution_id, t.parent_thread_id, t.seed_candidate_id,
      t.ai_session_ref, t.opening_ai_message_id, t.created_at, t.updated_at, v.sequence AS base_sequence,
      h.version_id AS current_version_id, rh.revision_id AS current_resolution_id,
      COALESCE((SELECT raw_text FROM deck_thread_candidates WHERE id = t.seed_candidate_id),
        (SELECT raw_text FROM deck_ai_candidates WHERE id = t.seed_candidate_id)) AS seed_candidate_text,
      (SELECT id FROM (
        SELECT id, sequence FROM deck_thread_candidates WHERE thread_id = t.id
        UNION ALL SELECT id, sequence FROM deck_ai_candidates WHERE thread_id = t.id
      ) ORDER BY sequence DESC LIMIT 1) AS latest_candidate_id
      FROM deck_threads t LEFT JOIN deck_versions v ON v.id = t.base_version_id
      LEFT JOIN deck_main_heads h ON h.project_id = t.project_id
      LEFT JOIN deck_resolution_heads rh ON rh.project_id = t.project_id
      WHERE t.project_id = ? ORDER BY t.created_at DESC, t.rowid DESC`).all(projectId) as {
        id: string; project_id: string; title: string; base_version_id: string | null
        base_resolution_id: string | null; parent_thread_id: string | null
        seed_candidate_id: string | null; seed_candidate_text: string | null
        ai_session_ref: string | null; opening_ai_message_id: string | null; created_at: string; updated_at: string
        base_sequence: number | null; current_version_id: string | null
        current_resolution_id: string | null; latest_candidate_id: string | null
      }[]
    return rows.map((row) => ({ id: row.id, projectId: row.project_id, title: row.title,
      baseVersionId: row.base_version_id, baseVersionNumber: row.base_sequence,
      baseResolutionId: row.base_resolution_id,
      resolutionChanged: row.base_version_id === row.current_version_id &&
        row.base_resolution_id !== null && row.base_resolution_id !== row.current_resolution_id,
      parentThreadId: row.parent_thread_id, seedCandidateId: row.seed_candidate_id,
      seedCandidateText: row.seed_candidate_text,
      currentVersionId: row.current_version_id,
      stale: row.base_version_id !== row.current_version_id,
      aiSessionRef: row.ai_session_ref, openingAiMessageId: row.opening_ai_message_id,
      createdAt: row.created_at, updatedAt: row.updated_at,
      latestCandidateId: row.latest_candidate_id }))
  }

  referencedTournamentSnapshotIds(): Set<string> {
    const rows = this.db.prepare(`SELECT DISTINCT json_extract(event.value, '$.snapshotId') AS id
      FROM deck_thread_messages AS message,
        json_each(CASE WHEN json_valid(message.evidence_json) THEN message.evidence_json
          ELSE '{}' END, '$.events') AS event
      WHERE json_type(event.value, '$.snapshotId') = 'text'`).all() as { id: string }[]
    const referenced = new Set(rows.map((row) => row.id))
    for (const [table, column] of [['deck_thread_messages', 'evidence_json'],
      ['matchup_reports', 'payload'], ['matchup_turns', 'report_payload']] as const) {
      for (const row of this.db.prepare(`SELECT DISTINCT json_extract(list.value, '$.snapshotId') AS id
        FROM ${table} AS evidence,
          json_each(CASE WHEN json_valid(evidence.${column}) THEN evidence.${column} ELSE '{}' END,
            '$.aiQueries.requests') AS request,
          json_each(request.value, '$.data.lists') AS list
        WHERE json_extract(request.value, '$.query.operation') = 'events.search'
          AND json_type(list.value, '$.snapshotId') = 'text'`).all() as { id: string }[])
        referenced.add(row.id)
    }
    return referenced
  }

  getDeckThread(projectId: string, threadId: string): DeckThread | null {
    return this.readDeckThreads(projectId, threadId)[0] ?? null
  }

  hasDeckThread(projectId: string, threadId: string): boolean {
    if (!this.get(projectId)) return false
    return Boolean(this.db.prepare('SELECT 1 FROM deck_threads WHERE project_id = ? AND id = ?')
      .get(projectId, threadId))
  }

  getDeckThreadWindow(projectId: string, threadId: string): DeckThread | null {
    return this.readDeckThreads(projectId, threadId, 50)[0] ?? null
  }

  getDeckThreadMessagesBefore(projectId: string, threadId: string,
    cursor: DeckThreadMessageCursor): DeckThreadMessagePage {
    if (!this.hasDeckThread(projectId, threadId)) throw new Error('Thread non trovato in questo progetto.')
    if (!cursor || typeof cursor.createdAt !== 'string' || !Number.isSafeInteger(cursor.rowId) || cursor.rowId < 1)
      throw new Error('Cursore della cronologia non valido.')
    const rows = this.db.prepare(`SELECT rowid AS row_id, id, text, created_at, author, ai_config_json,
      ai_turn_id, evidence_json, cited_source_ids_json FROM deck_thread_messages
      WHERE thread_id = ? AND (created_at < ? OR (created_at = ? AND rowid < ?))
      ORDER BY created_at DESC, rowid DESC LIMIT 50`)
      .all(threadId, cursor.createdAt, cursor.createdAt, cursor.rowId) as unknown as ThreadMessageRow[]
    return { messages: rows.reverse().map(parseThreadMessage), oldestCursor: rows.length ? messageCursor(rows[0]) : null }
  }

  listDeckThreads(projectId: string): DeckThread[] {
    return this.readDeckThreads(projectId)
  }

  private readDeckThreads(projectId: string, threadId?: string, recentLimit?: number): DeckThread[] {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    const current = this.getCurrentDeckContext(projectId)
    const rows = this.db.prepare(`SELECT t.id, t.project_id, t.title, t.base_version_id,
      t.base_resolution_id, t.parent_thread_id, t.seed_candidate_id,
      COALESCE((SELECT raw_text FROM deck_thread_candidates WHERE id = t.seed_candidate_id),
        (SELECT raw_text FROM deck_ai_candidates WHERE id = t.seed_candidate_id)) AS seed_candidate_text,
      t.ai_session_ref, t.opening_ai_message_id, t.created_at, t.updated_at, v.sequence AS base_sequence
      FROM deck_threads t LEFT JOIN deck_versions v ON v.id = t.base_version_id
      WHERE t.project_id = ? ${threadId === undefined ? '' : 'AND t.id = ?'}
      ORDER BY t.created_at DESC, t.rowid DESC`).all(...(threadId === undefined ? [projectId] : [projectId, threadId])) as {
        id: string; project_id: string; title: string; base_version_id: string | null
        base_resolution_id: string | null; parent_thread_id: string | null
        seed_candidate_id: string | null; seed_candidate_text: string | null
        ai_session_ref: string | null; opening_ai_message_id: string | null
        created_at: string; updated_at: string; base_sequence: number | null
      }[]
    const messages = this.db.prepare(`SELECT rowid AS row_id, id, text, created_at, author, ai_config_json, ai_turn_id,
      evidence_json, cited_source_ids_json FROM deck_thread_messages
      WHERE thread_id = ? ORDER BY created_at ${recentLimit ? 'DESC' : 'ASC'}, rowid ${recentLimit ? 'DESC' : 'ASC'}
      ${recentLimit ? 'LIMIT 50' : ''}`)
    const messageCount = recentLimit ? this.db.prepare('SELECT COUNT(*) AS count FROM deck_thread_messages WHERE thread_id = ?') : null
    const openingMessage = recentLimit ? this.db.prepare(`SELECT rowid AS row_id, id, text, created_at, author,
      ai_config_json, ai_turn_id, evidence_json, cited_source_ids_json FROM deck_thread_messages WHERE id = ? AND thread_id = ?`) : null
    const assistantExists = recentLimit ? this.db.prepare(`SELECT 1 FROM deck_thread_messages WHERE thread_id = ? AND author = 'assistant' LIMIT 1`) : null
    const candidates = this.db.prepare(`SELECT id, parent_candidate_id, sequence, raw_text, parsed_json, note, origin, created_at
      FROM deck_thread_candidates WHERE thread_id = ? ORDER BY sequence`)
    const aiCandidates = this.db.prepare(`SELECT id, parent_candidate_id, sequence, raw_text, parsed_json, note, sources_json,
      checks_json, ai_config_json, ai_turn_id, created_at FROM deck_ai_candidates WHERE thread_id = ? ORDER BY sequence`)
    return rows.map((row) => {
      const messageRows = messages.all(row.id) as unknown as ThreadMessageRow[]
      if (recentLimit) messageRows.reverse()
      const openingRow = openingMessage && row.opening_ai_message_id
        ? openingMessage.get(row.opening_ai_message_id, row.id) as ThreadMessageRow | undefined : undefined
      return {
      id: row.id, projectId: row.project_id, title: row.title,
      baseVersionId: row.base_version_id, baseVersionNumber: row.base_sequence,
      baseResolutionId: row.base_resolution_id,
      resolutionChanged: row.base_version_id === (current?.versionId ?? null) &&
        row.base_resolution_id !== null && row.base_resolution_id !== current?.resolutionId,
      parentThreadId: row.parent_thread_id, seedCandidateId: row.seed_candidate_id,
      seedCandidateText: row.seed_candidate_text,
      currentVersionId: current?.versionId ?? null,
      stale: row.base_version_id !== (current?.versionId ?? null),
      aiSessionRef: row.ai_session_ref, openingAiMessageId: row.opening_ai_message_id,
      createdAt: row.created_at, updatedAt: row.updated_at,
      messages: messageRows.map(parseThreadMessage),
      ...(recentLimit ? {
        messageCount: (messageCount!.get(row.id) as { count: number }).count,
        oldestMessageCursor: messageRows.length ? messageCursor(messageRows[0]) : null,
        openingAiMessage: openingRow ? parseThreadMessage(openingRow) : null,
        openingAiPending: Boolean(openingRow && !assistantExists!.get(row.id))
      } : {}),
      candidates: [...(candidates.all(row.id) as {
        id: string; parent_candidate_id: string | null; sequence: number; raw_text: string; parsed_json: string
        note: string; origin: 'manual'; created_at: string
      }[]).map((candidate): DeckCandidate => ({
        id: candidate.id, parentCandidateId: candidate.parent_candidate_id,
        sequence: candidate.sequence, rawText: candidate.raw_text,
        parsed: JSON.parse(candidate.parsed_json) as ParsedDeck,
        note: candidate.note, origin: candidate.origin, createdAt: candidate.created_at,
        aiConfig: null, aiTurnId: null, sources: [], checks: []
      })), ...(aiCandidates.all(row.id) as {
        id: string; parent_candidate_id: string | null; sequence: number; raw_text: string; parsed_json: string; note: string
        sources_json: string; checks_json: string; ai_config_json: string; ai_turn_id: string; created_at: string
      }[]).map((candidate): DeckCandidate => ({
        id: candidate.id, parentCandidateId: candidate.parent_candidate_id,
        sequence: candidate.sequence, rawText: candidate.raw_text,
        parsed: JSON.parse(candidate.parsed_json) as ParsedDeck,
        note: candidate.note, origin: 'ai', createdAt: candidate.created_at,
        aiConfig: JSON.parse(candidate.ai_config_json) as AiRunConfig, aiTurnId: candidate.ai_turn_id,
        sources: JSON.parse(candidate.sources_json) as DeckCandidate['sources'],
        checks: JSON.parse(candidate.checks_json) as string[]
      }))].sort((a, b) => a.sequence - b.sequence)
    }})
  }

  createDeckThread(input: CreateDeckThreadInput): DeckThread {
    if (!input || !this.get(input.projectId)) throw new Error('Progetto non trovato.')
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    const openingNote = typeof input.openingNote === 'string' ? input.openingNote.trim() : ''
    if (!title || title.length > 120 || title.includes('\0')) throw new Error('Inserisci un titolo da 1 a 120 caratteri.')
    if (openingNote.length > 5000 || openingNote.includes('\0')) throw new Error('Scrivi un messaggio fino a 5.000 caratteri.')
    if (input.startWithAi && !openingNote) throw new Error('Scrivi il primo messaggio per Codex.')
    const id = randomUUID()
    const openingId = openingNote ? randomUUID() : null
    const now = new Date().toISOString()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const head = this.getCurrentDeckContext(input.projectId)
      this.db.prepare(`INSERT INTO deck_threads
        (id, project_id, title, base_version_id, base_resolution_id,
          ai_session_ref, opening_ai_message_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`).run(id, input.projectId, title,
          head?.versionId ?? null, head?.resolutionId ?? null,
          input.startWithAi ? openingId : null, now, now)
      if (openingNote) this.db.prepare(`INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at)
        VALUES (?, ?, 'user', ?, ?)`).run(openingId, id, openingNote, now)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.getDeckThread(input.projectId, id)!
  }

  continueDeckThread(input: ContinueDeckThreadInput): DeckThread {
    if (!input || !this.get(input.projectId) || typeof input.title !== 'string' ||
      !input.title.trim() || input.title.trim().length > 120 || input.title.includes('\0'))
      throw new Error('Titolo del nuovo thread non valido.')
    const now = new Date().toISOString()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const source = this.db.prepare(`SELECT base_version_id FROM deck_threads
        WHERE id = ? AND project_id = ?`).get(input.threadId, input.projectId) as
        { base_version_id: string | null } | undefined
      const head = this.getCurrentDeckContext(input.projectId)
      if (!source || !head || source.base_version_id === head.versionId)
        throw new Error('Il thread deve avere una base precedente alla lista principale.')
      const candidate = this.db.prepare(`SELECT id FROM deck_thread_candidates WHERE id = ? AND thread_id = ?
        UNION ALL SELECT id FROM deck_ai_candidates WHERE id = ? AND thread_id = ?`)
        .get(input.candidateId, input.threadId, input.candidateId, input.threadId)
      if (!candidate) throw new Error('Candidata non trovata nel thread di origine.')
      const id = randomUUID()
      this.db.prepare(`INSERT INTO deck_threads
        (id, project_id, title, base_version_id, base_resolution_id,
          parent_thread_id, seed_candidate_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.projectId,
          input.title.trim(), head.versionId, head.resolutionId, input.threadId,
          input.candidateId, now, now)
      this.db.exec('COMMIT')
      return this.getDeckThread(input.projectId, id)!
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  addDeckThreadMessage(projectId: string, threadId: string, value: string, recent = false): DeckThread {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    if (!this.hasDeckThread(projectId, threadId)) throw new Error('Thread non trovato in questo progetto.')
    const message = typeof value === 'string' ? value.trim() : ''
    if (!message || message.length > 5000 || message.includes('\0'))
      throw new Error('Scrivi un messaggio da 1 a 5.000 caratteri.')
    const now = new Date().toISOString()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at)
        VALUES (?, ?, 'user', ?, ?)`).run(randomUUID(), threadId, message, now)
      this.db.prepare('UPDATE deck_threads SET updated_at = ? WHERE id = ?').run(now, threadId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return (recent ? this.getDeckThreadWindow(projectId, threadId) : this.getDeckThread(projectId, threadId))!
  }

  assignDeckAiSession(projectId: string, threadId: string, sessionId: string): DeckThread {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    if (!sessionId || sessionId.length > 200) throw new Error('Sessione Codex non valida.')
    const thread = this.getDeckThread(projectId, threadId)
    if (!thread) throw new Error('Thread non trovato in questo progetto.')
    if (thread.aiSessionRef && thread.aiSessionRef !== sessionId) throw new Error('Il thread ha già una sessione Codex diversa.')
    this.db.prepare(`UPDATE deck_threads SET ai_session_ref = ?, updated_at = ?
      WHERE id = ? AND project_id = ? AND (ai_session_ref IS NULL OR ai_session_ref = ?)`)
      .run(sessionId, new Date().toISOString(), threadId, projectId, sessionId)
    return this.getDeckThread(projectId, threadId)!
  }

  saveDeckAiExchange(projectId: string, threadId: string, sessionId: string,
    question: string, answer: string, turnId: string, config: AiRunConfig,
    proposal?: { rawText: string; note: string; sources: DeckCandidate['sources']; checks: string[] },
    evidence?: ThreadEvidencePacket, citedSourceIds: string[] = [], existingUserMessageId?: string): DeckThread {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    const thread = this.getDeckThread(projectId, threadId)
    if (!thread || thread.aiSessionRef !== sessionId) throw new Error('Sessione Codex non associata a questo thread.')
    const userText = typeof question === 'string' ? question.trim() : ''
    const aiText = typeof answer === 'string' ? answer.trim() : ''
    if (!userText || userText.length > 5000 || userText.includes('\0')) throw new Error('Scrivi un messaggio da 1 a 5.000 caratteri.')
    if (!aiText || aiText.length > 10000 || aiText.includes('\0')) throw new Error('Risposta Codex non valida.')
    if (!turnId || turnId.length > 200) throw new Error('Turno Codex non valido.')
    if (evidence && (evidence.schemaVersion !== 1 || JSON.stringify(evidence).length > 250_000 ||
      citedSourceIds.some((id) => !evidence.sources.some((source) => source.id === id))))
      throw new Error('Evidenze del turno non valide.')
    if (proposal && (!proposal.rawText || proposal.rawText.length > 200_000 ||
      !proposal.note || proposal.note.length > 5000 || proposal.sources.length > 100))
      throw new Error('Proposta Codex non valida.')
    const parsedProposal = proposal ? parseDeck(proposal.rawText) : null
    if (parsedProposal && (parsedProposal.interpretedTotal !== 60 ||
      parsedProposal.lines.some((line) => line.kind === 'unparsed') ||
      parsedProposal.diagnostics.some((item) => item.code === 'TOTAL_MISMATCH')))
      throw new Error('La proposta Codex non contiene una lista completa di 60 carte.')
    const now = new Date().toISOString()
    if (existingUserMessageId) {
      const existing = thread.messages.find((message) => message.id === existingUserMessageId)
      if (thread.openingAiMessageId !== existingUserMessageId || !existing ||
        existing.author !== 'user' || existing.text !== userText ||
        thread.messages.some((message) => message.author === 'assistant'))
        throw new Error('Primo messaggio Codex non recuperabile.')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (!existingUserMessageId) this.db.prepare(`INSERT INTO deck_thread_messages (id, thread_id, author, text, created_at)
        VALUES (?, ?, 'user', ?, ?)`).run(randomUUID(), threadId, userText, now)
      this.db.prepare(`INSERT INTO deck_thread_messages
        (id, thread_id, author, text, created_at, ai_config_json, ai_turn_id,
          evidence_json, cited_source_ids_json)
        VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), threadId, aiText, now, JSON.stringify(config), turnId,
          evidence ? JSON.stringify(evidence) : null, evidence ? JSON.stringify(citedSourceIds) : null)
      if (proposal && parsedProposal) {
        const next = this.nextCandidateLink(threadId)
        this.db.prepare(`INSERT INTO deck_ai_candidates
          (id, thread_id, parent_candidate_id, sequence, raw_text, parsed_json, note,
            sources_json, checks_json, ai_config_json, ai_turn_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), threadId, next.parentId, next.sequence,
            proposal.rawText, JSON.stringify(parsedProposal), proposal.note,
            JSON.stringify(proposal.sources), JSON.stringify(proposal.checks), JSON.stringify(config), turnId, now)
      }
      this.db.prepare('UPDATE deck_threads SET updated_at = ? WHERE id = ?').run(now, threadId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.getDeckThread(projectId, threadId)!
  }

  private nextCandidateLink(threadId: string): { sequence: number; parentId: string | null } {
    const row = this.db.prepare(`SELECT id, sequence FROM (
      SELECT id, sequence FROM deck_thread_candidates WHERE thread_id = ?
      UNION ALL SELECT id, sequence FROM deck_ai_candidates WHERE thread_id = ?)
      ORDER BY sequence DESC LIMIT 1`).get(threadId, threadId) as
      { id: string; sequence: number } | undefined
    const seed = this.db.prepare('SELECT seed_candidate_id FROM deck_threads WHERE id = ?')
      .get(threadId) as { seed_candidate_id: string | null } | undefined
    return { sequence: (row?.sequence ?? 0) + 1,
      parentId: row?.id ?? seed?.seed_candidate_id ?? null }
  }

  saveDeckCandidate(input: SaveDeckCandidateInput, recent = false): DeckThread {
    if (!input || !this.get(input.projectId)) throw new Error('Progetto non trovato.')
    if (!this.hasDeckThread(input.projectId, input.threadId)) throw new Error('Thread non trovato in questo progetto.')
    if (typeof input.rawText !== 'string' || !input.rawText.trim() ||
      input.rawText.length > 200_000 || input.rawText.includes('\0'))
      throw new Error('Inserisci una lista di testo non vuota, fino a 200.000 caratteri.')
    const note = typeof input.note === 'string' ? input.note.trim() : ''
    if (note.length > 5000 || note.includes('\0')) throw new Error('Scrivi una nota fino a 5.000 caratteri.')
    const parsed = parseDeck(input.rawText)
    if (parsed.lines.length > 5_000) throw new Error('La lista contiene troppe righe (massimo 5.000).')
    const now = new Date().toISOString()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const next = this.nextCandidateLink(input.threadId)
      this.db.prepare(`INSERT INTO deck_thread_candidates
        (id, thread_id, parent_candidate_id, sequence, raw_text, parsed_json, note, origin, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)`)
        .run(randomUUID(), input.threadId, next.parentId, next.sequence, input.rawText,
          JSON.stringify(parsed), note, now)
      this.db.prepare('UPDATE deck_threads SET updated_at = ? WHERE id = ?').run(now, input.threadId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return (recent ? this.getDeckThreadWindow(input.projectId, input.threadId)
      : this.getDeckThread(input.projectId, input.threadId))!
  }

  getReconciliation(projectId: string): DeckReconciliation {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    const baseline = this.getBaseline(projectId)
    if (!baseline) return {
      projectId, importedAt: null, mappings: [], identityTotals: [],
      resolvedLines: 0, unresolvedLines: 0, resolvedCopies: 0, unresolvedCopies: 0
    }
    const rows = this.db.prepare(`SELECT line_number, baseline_imported_at, raw_line, original_name,
      source_language, print_snapshot, selected_at FROM deck_line_mappings WHERE project_id = ? ORDER BY line_number`)
      .all(projectId) as {
        line_number: number; baseline_imported_at: string; raw_line: string; original_name: string
        source_language: string | null; print_snapshot: string; selected_at: string
      }[]
    const cardLines = baseline.lines.filter((line) => line.kind === 'card')
    const mappingByLine = new Map<number, DeckLineMapping>()
    for (const row of rows) {
      const line = cardLines.find((item) => item.lineNumber === row.line_number)
      if (!line || row.baseline_imported_at !== baseline.importedAt || row.raw_line !== line.raw) continue
      mappingByLine.set(row.line_number, {
        lineNumber: row.line_number, rawLine: row.raw_line, originalName: row.original_name,
        sourceLanguage: row.source_language, print: JSON.parse(row.print_snapshot) as MappedPrint,
        selectedAt: row.selected_at
      })
    }
    const totals = new Map<string, IdentityTotal>()
    let resolvedCopies = 0
    let unresolvedCopies = 0
    for (const line of cardLines) {
      const mapping = mappingByLine.get(line.lineNumber)
      if (!mapping) { unresolvedCopies += line.quantity ?? 0; continue }
      resolvedCopies += line.quantity ?? 0
      const key = mapping.print.identityId
      const total = totals.get(key) ?? { identityId: key, name: mapping.print.name, quantity: 0, printIds: [] }
      total.quantity += line.quantity ?? 0
      if (!total.printIds.includes(mapping.print.id)) total.printIds.push(mapping.print.id)
      totals.set(key, total)
    }
    return {
      projectId, importedAt: baseline.importedAt, mappings: [...mappingByLine.values()],
      identityTotals: [...totals.values()].sort((a, b) => a.name.localeCompare(b.name)),
      resolvedLines: mappingByLine.size, unresolvedLines: cardLines.length - mappingByLine.size,
      resolvedCopies, unresolvedCopies
    }
  }

  saveLineMapping(input: SaveLineMappingInput, print: MappedPrint): DeckReconciliation {
    const baseline = this.getBaseline(input?.projectId)
    if (!baseline) throw new Error('Importa una lista prima di riconciliare le carte.')
    const line = baseline.lines.find((item) => item.lineNumber === input.lineNumber && item.kind === 'card')
    if (!line || input.importedAt !== baseline.importedAt || input.rawLine !== line.raw || !print?.identityId || !print.id) {
      throw new Error('La lista è cambiata. Riapri il progetto e riprova.')
    }
    const language = input.sourceLanguage?.trim() || null
    if (language !== null && (language.length > 35 || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language))) {
      throw new Error('Lingua del testo non valida. Usa un codice come it, en o ja.')
    }
    const existing = this.db.prepare(`SELECT raw_line, original_name, source_language, print_snapshot
      FROM deck_line_mappings WHERE project_id = ? AND line_number = ?`)
      .get(input.projectId, input.lineNumber) as {
        raw_line: string; original_name: string; source_language: string | null; print_snapshot: string
      } | undefined
    if (existing?.raw_line === line.raw && existing.original_name === line.name &&
      existing.source_language === language && existing.print_snapshot === JSON.stringify(print))
      return this.getReconciliation(input.projectId)
    const now = new Date().toISOString()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`INSERT INTO deck_line_mappings
        (project_id, line_number, baseline_imported_at, raw_line, original_name, source_language, print_snapshot, selected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, line_number) DO UPDATE SET
          baseline_imported_at=excluded.baseline_imported_at, raw_line=excluded.raw_line,
          original_name=excluded.original_name, source_language=excluded.source_language,
          print_snapshot=excluded.print_snapshot, selected_at=excluded.selected_at`)
        .run(input.projectId, input.lineNumber, baseline.importedAt, line.raw, line.name!, language, JSON.stringify(print), now)
      const head = this.getCurrentDeckContext(input.projectId)
      if (head) this.recordResolutionRevision(input.projectId, head.versionId, 'mapping', now)
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, input.projectId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.getReconciliation(input.projectId)
  }

  clearLineMapping(input: ClearLineMappingInput): DeckReconciliation {
    const baseline = this.getBaseline(input?.projectId)
    if (!baseline) throw new Error('Importa una lista prima di riconciliare le carte.')
    if (input.importedAt !== baseline.importedAt ||
      !baseline.lines.some((line) => line.kind === 'card' && line.lineNumber === input.lineNumber && line.raw === input.rawLine)) {
      throw new Error('La lista è cambiata. Riapri il progetto e riprova.')
    }
    if (!this.db.prepare('SELECT 1 FROM deck_line_mappings WHERE project_id = ? AND line_number = ?')
      .get(input.projectId, input.lineNumber)) return this.getReconciliation(input.projectId)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM deck_line_mappings WHERE project_id = ? AND line_number = ?')
        .run(input.projectId, input.lineNumber)
      const head = this.getCurrentDeckContext(input.projectId)
      if (head) this.recordResolutionRevision(input.projectId, head.versionId, 'mapping')
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), input.projectId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.getReconciliation(input.projectId)
  }

  listConstraints(projectId: string): DeckConstraint[] {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    return (this.db.prepare(`SELECT id, project_id, identity_id, identity_name, print_id,
      kind, quantity, created_at, updated_at FROM deck_constraints WHERE project_id = ?
      ORDER BY created_at, id`).all(projectId) as {
        id: string; project_id: string; identity_id: string; identity_name: string
        print_id: string | null; kind: DeckConstraint['kind']; quantity: number
        created_at: string; updated_at: string
      }[]).map((row) => ({
      id: row.id, projectId: row.project_id, identityId: row.identity_id,
      identityName: row.identity_name, printId: row.print_id, kind: row.kind,
      quantity: row.quantity, createdAt: row.created_at, updatedAt: row.updated_at
    }))
  }

  saveConstraint(input: SaveConstraintInput, identityName: string): DeckConstraint {
    if (!input || !this.get(input.projectId)) throw new Error('Progetto non trovato.')
    if (typeof input.identityId !== 'string' || !input.identityId || input.identityId.length > 120 ||
      typeof identityName !== 'string' || !identityName || identityName.length > 160 ||
      (input.printId != null && (typeof input.printId !== 'string' || input.printId.length > 100)) ||
      !['required', 'minimum', 'exact'].includes(input.kind) ||
      !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 60 ||
      (input.kind === 'required' && input.quantity !== 1)) throw new Error('Vincolo non valido.')
    const existing = input.id ? this.listConstraints(input.projectId).find((item) => item.id === input.id) : null
    if (input.id && !existing) throw new Error('Vincolo non trovato in questo progetto.')
    const now = new Date().toISOString()
    const item: DeckConstraint = {
      id: existing?.id ?? randomUUID(), projectId: input.projectId,
      identityId: input.identityId, identityName, printId: input.printId ?? null,
      kind: input.kind, quantity: input.quantity,
      createdAt: existing?.createdAt ?? now, updatedAt: now
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`INSERT INTO deck_constraints
        (id, project_id, identity_id, identity_name, print_id, kind, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET identity_id=excluded.identity_id,
          identity_name=excluded.identity_name, print_id=excluded.print_id,
          kind=excluded.kind, quantity=excluded.quantity, updated_at=excluded.updated_at`)
        .run(item.id, item.projectId, item.identityId, item.identityName, item.printId,
          item.kind, item.quantity, item.createdAt, item.updatedAt)
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, item.projectId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return item
  }

  deleteConstraint(input: DeleteConstraintInput): DeckConstraint[] {
    if (!input || !this.get(input.projectId) || typeof input.id !== 'string') throw new Error('Progetto non trovato.')
    const existing = this.listConstraints(input.projectId).find((item) => item.id === input.id)
    if (!existing) throw new Error('Vincolo non trovato in questo progetto.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM deck_constraints WHERE project_id = ? AND id = ?')
        .run(input.projectId, input.id)
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), input.projectId)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.listConstraints(input.projectId)
  }

  importDeck(input: ImportDeckInput): DeckBaseline {
    if (!input || typeof input.projectId !== 'string' || !this.get(input.projectId)) {
      throw new Error('Progetto non trovato.')
    }
    if (typeof input.rawText !== 'string' || !input.rawText.trim() || input.rawText.length > 200_000 || input.rawText.includes('\0')) {
      throw new Error('Inserisci una lista di testo non vuota, fino a 200.000 caratteri.')
    }
    if (input.source !== 'paste' && input.source !== 'file') {
      throw new Error('Origine della lista non valida.')
    }
    const fileName = input.source === 'file' ? input.fileName : null
    if (input.source === 'file' &&
      (typeof fileName !== 'string' || fileName.length > 255 || !/^[^\\/]+\.txt$/i.test(fileName))) {
      throw new Error('Seleziona un file .txt.')
    }

    const parsed = parseDeck(input.rawText)
    if (parsed.lines.length > 5_000) {
      throw new Error('La lista contiene troppe righe (massimo 5.000).')
    }
    const importedAt = new Date().toISOString()
    const problemCount = parsed.diagnostics.filter((diagnostic) =>
      diagnostic.code === 'UNPARSED' || diagnostic.code === 'TOTAL_MISMATCH').length

    this.db.exec('BEGIN IMMEDIATE')
    try {
      const expected = this.getCurrentDeckContext(input.projectId)
      if (input.expectedHeadId !== undefined && (expected?.versionId ?? null) !== input.expectedHeadId)
        throw new Error('La lista principale è cambiata: riapri l’importazione prima di salvare.')
      const previous = this.db.prepare('SELECT raw_text FROM deck_baselines WHERE project_id = ?')
        .get(input.projectId) as { raw_text: string } | undefined
      if (previous && previous.raw_text !== input.rawText) {
        this.db.prepare('DELETE FROM deck_line_mappings WHERE project_id = ?').run(input.projectId)
      }
      this.db.prepare(`
        INSERT INTO deck_baselines
          (project_id, source, file_name, raw_text, parsed_json, interpreted_total, problem_count, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          source = excluded.source,
          file_name = excluded.file_name,
          raw_text = excluded.raw_text,
          parsed_json = excluded.parsed_json,
          interpreted_total = excluded.interpreted_total,
          problem_count = excluded.problem_count,
          imported_at = excluded.imported_at
      `).run(input.projectId, input.source, fileName ?? null, input.rawText, JSON.stringify(parsed), parsed.interpretedTotal, problemCount, importedAt)
      if (!previous || previous.raw_text !== input.rawText) {
        const latest = this.db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM deck_versions WHERE project_id = ?')
          .get(input.projectId) as { sequence: number }
        const versionId = randomUUID()
        this.db.prepare(`INSERT INTO deck_versions
          (id, project_id, sequence, source, file_name, raw_text, parsed_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(versionId, input.projectId, latest.sequence + 1, input.source, fileName ?? null,
            input.rawText, JSON.stringify(parsed), importedAt)
        this.db.prepare(`INSERT INTO deck_main_heads (project_id, version_id) VALUES (?, ?)
          ON CONFLICT(project_id) DO UPDATE SET version_id = excluded.version_id`)
          .run(input.projectId, versionId)
        this.recordResolutionRevision(input.projectId, versionId, 'import', importedAt)
      }
      if (previous?.raw_text === input.rawText) {
        this.db.prepare('UPDATE deck_line_mappings SET baseline_imported_at = ? WHERE project_id = ?')
          .run(importedAt, input.projectId)
      }
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(importedAt, input.projectId)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return {
      projectId: input.projectId,
      versionId: this.getCurrentDeckContext(input.projectId)?.versionId ?? null,
      resolutionId: this.getCurrentDeckContext(input.projectId)?.resolutionId ?? null,
      rawText: input.rawText,
      source: input.source,
      fileName: fileName ?? null,
      importedAt,
      ...parsed
    }
  }

  private currentDeckHash(projectId: string): string | null {
    const row = this.db.prepare('SELECT raw_text FROM deck_baselines WHERE project_id = ?')
      .get(projectId) as { raw_text: string } | undefined
    if (!row) return null
    const mappings = this.db.prepare('SELECT line_number, print_snapshot FROM deck_line_mappings WHERE project_id = ? ORDER BY line_number')
      .all(projectId) as { line_number: number; print_snapshot: string }[]
    if (mappings.length === 0) return deckHash(row.raw_text)
    const choices = mappings.map((mapping) => {
      const print = JSON.parse(mapping.print_snapshot) as MappedPrint
      return [mapping.line_number, print.identityId]
    })
    return deckHash(`${row.raw_text}\u0000${JSON.stringify(choices)}`)
  }

  getCurrentDeckHash(projectId: string): string | null {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    return this.currentDeckHash(projectId)
  }

  saveMetaSnapshot(snapshot: MetaSnapshot): void {
    this.db.prepare(`INSERT INTO meta_snapshots (id, fetched_at, payload) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload`)
      .run(snapshot.id, snapshot.fetchedAt, JSON.stringify({ ...snapshot, cached: false }))
  }

  getLatestMetaSnapshot(): MetaSnapshot | null {
    const row = this.db.prepare('SELECT payload FROM meta_snapshots ORDER BY fetched_at DESC LIMIT 1')
      .get() as { payload: string } | undefined
    return row ? { ...(JSON.parse(row.payload) as MetaSnapshot), cached: true } : null
  }

  listMatchupReports(projectId: string, metaId: string): MatchupReport[] {
    const hash = this.getCurrentDeckHash(projectId)
    if (!hash || typeof metaId !== 'string' || metaId.length !== 64) return []
    const rows = this.db.prepare(`SELECT payload FROM matchup_reports
      WHERE project_id = ? AND meta_id = ? AND deck_hash = ?`)
      .all(projectId, metaId, hash) as { payload: string }[]
    const context = this.getCurrentDeckContext(projectId)
    return rows.map((row) => JSON.parse(row.payload) as MatchupReport).filter((report) => {
      if (report.deckVersionId) return report.deckVersionId === context?.versionId &&
        report.deckResolutionId === context?.resolutionId
      const discussion = this.db.prepare(`SELECT id FROM matchup_discussions WHERE project_id = ?
        AND meta_id = ? AND opponent_id = ? AND (content_hash = ? OR deck_hash = ?)
        ORDER BY rowid DESC LIMIT 1`).get(projectId, metaId, report.opponentId,
          report.deckHash, report.deckHash) as { id: string } | undefined
      return discussion ? this.getMatchupDiscussion(discussion.id)?.current === true : false
    })
  }

  private reportMatchesCurrentContext(report: MatchupReport): boolean {
    if (this.getCurrentDeckHash(report.projectId) !== report.deckHash) return false
    if (!report.deckVersionId) return true
    const current = this.getCurrentDeckContext(report.projectId)
    return current?.versionId === report.deckVersionId &&
      current.resolutionId === report.deckResolutionId
  }

  private discussionMatchesCurrentContext(discussion: MatchupDiscussion): boolean {
    if (this.getCurrentDeckHash(discussion.projectId) !== discussion.deckHash) return false
    if (discussion.deckVersionId == null) return true
    const current = this.getCurrentDeckContext(discussion.projectId)
    return current?.versionId === discussion.deckVersionId &&
      current.resolutionId === discussion.deckResolutionId
  }

  hasMatchupJobResult(jobId: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM matchup_turns
      WHERE json_extract(report_payload, '$.jobId') = ? LIMIT 1`).get(jobId)
  }

  saveMatchupReport(report: MatchupReport): void {
    if (!this.reportMatchesCurrentContext(report))
      throw new Error('La lista è cambiata durante l’analisi. Riprova sulla lista corrente.')
    const snapshot = this.db.prepare('SELECT payload FROM meta_snapshots WHERE id = ?')
      .get(report.metaId) as { payload: string } | undefined
    if (!snapshot || !(JSON.parse(snapshot.payload) as MetaSnapshot).decks.some((deck) => deck.id === report.opponentId)) {
      throw new Error('Lo snapshot del metagame non è più disponibile.')
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const discussion = this.getOrCreateDiscussion(report)
      if (discussion.turns.some((turn) => !turn.report)) throw new Error('Completa o riprova il commento già in attesa.')
      const turnNo = discussion.turns.length
      this.db.prepare(`INSERT INTO matchup_turns
        (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary)
        VALUES (?, ?, ?, NULL, ?, ?, NULL)`)
        .run(randomUUID(), discussion.id, turnNo, report.generatedAt, JSON.stringify(report))
      this.writeLatestReport(report)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private writeLatestReport(report: MatchupReport): void {
    this.db.prepare(`INSERT INTO matchup_reports
      (project_id, meta_id, opponent_id, deck_hash, generated_at, payload) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, meta_id, opponent_id, deck_hash) DO UPDATE SET
      generated_at = excluded.generated_at, payload = excluded.payload`)
      .run(report.projectId, report.metaId, report.opponentId, report.deckHash, report.generatedAt, JSON.stringify(report))
  }

  private getOrCreateDiscussion(report: MatchupReport, parentId: string | null = null): MatchupDiscussion {
    const key = report.deckVersionId
      ? `${report.deckHash}:${report.deckVersionId}:${report.deckResolutionId ?? ''}` : report.deckHash
    const existing = this.db.prepare(`SELECT id FROM matchup_discussions
      WHERE project_id = ? AND meta_id = ? AND opponent_id = ? AND deck_hash = ?`)
      .get(report.projectId, report.metaId, report.opponentId, key) as { id: string } | undefined
    if (existing) return this.getMatchupDiscussion(existing.id)!
    const id = randomUUID()
    this.db.prepare(`INSERT INTO matchup_discussions
      (id, project_id, meta_id, opponent_id, deck_hash, content_hash,
        deck_version_id, deck_resolution_id, parent_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, report.projectId,
        report.metaId, report.opponentId, key, report.deckHash,
        report.deckVersionId ?? null, report.deckResolutionId ?? null, parentId, report.generatedAt)
    return this.getMatchupDiscussion(id)!
  }

  getMatchupDiscussion(id: string): MatchupDiscussion | null {
    if (typeof id !== 'string' || id.length > 100) return null
    const row = this.db.prepare('SELECT * FROM matchup_discussions WHERE id = ?').get(id) as {
      id: string; project_id: string; meta_id: string; opponent_id: string; deck_hash: string
      content_hash: string | null; deck_version_id: string | null; deck_resolution_id: string | null
      parent_id: string | null; created_at: string; context_summary: string; summarized_through: number
    } | undefined
    if (!row) return null
    const turns = this.db.prepare(`SELECT id, feedback, created_at, report_payload, change_summary FROM matchup_turns
      WHERE discussion_id = ? ORDER BY turn_no`).all(id) as {
      id: string; feedback: string | null; created_at: string; report_payload: string | null; change_summary: string | null
    }[]
    return {
      id: row.id, projectId: row.project_id, metaId: row.meta_id, opponentId: row.opponent_id,
      deckHash: row.content_hash ?? row.deck_hash,
      deckVersionId: row.deck_version_id, deckResolutionId: row.deck_resolution_id,
      parentId: row.parent_id, createdAt: row.created_at,
      current: this.discussionMatchesCurrentContext({ projectId: row.project_id,
        deckHash: row.content_hash ?? row.deck_hash, deckVersionId: row.deck_version_id,
        deckResolutionId: row.deck_resolution_id } as MatchupDiscussion) &&
        this.getLatestMetaSnapshot()?.id === row.meta_id,
      contextSummary: row.context_summary, summarizedThrough: row.summarized_through,
      turns: turns.map((turn): MatchupTurn => ({ id: turn.id, feedback: turn.feedback,
        createdAt: turn.created_at, report: turn.report_payload ? JSON.parse(turn.report_payload) as MatchupReport : null,
        changeSummary: turn.change_summary }))
    }
  }

  listMatchupDiscussions(projectId: string, opponentId: string): MatchupDiscussion[] {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    if (typeof opponentId !== 'string' || !/^\d+$/.test(opponentId)) throw new Error('Archetipo non valido.')
    const rows = this.db.prepare(`SELECT id FROM matchup_discussions WHERE project_id = ? AND opponent_id = ?
      ORDER BY created_at DESC, rowid DESC`).all(projectId, opponentId) as { id: string }[]
    return rows.map((row) => this.getMatchupDiscussion(row.id)!)
  }

  listHistoricalMatchupOpponents(projectId: string): MetaDeck[] {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    const rows = this.db.prepare(`SELECT d.opponent_id, s.payload
      FROM matchup_discussions d JOIN meta_snapshots s ON s.id = d.meta_id
      WHERE d.project_id = ? ORDER BY d.created_at DESC, d.rowid DESC`).all(projectId) as {
        opponent_id: string; payload: string
      }[]
    const decks = new Map<string, MetaDeck>()
    for (const row of rows) {
      if (decks.has(row.opponent_id)) continue
      const snapshot = JSON.parse(row.payload) as MetaSnapshot
      const deck = snapshot.decks.find((item) => item.id === row.opponent_id)
      if (deck) decks.set(deck.id, deck)
    }
    return [...decks.values()]
  }

  addMatchupFeedback(discussionId: string, feedback: string): MatchupDiscussion {
    const discussion = this.getMatchupDiscussion(discussionId)
    if (!discussion) throw new Error('Discussione Matchup non trovata.')
    const trimmed = typeof feedback === 'string' ? feedback.trim() : ''
    if (!trimmed || trimmed.length > 5000 || trimmed.includes('\0')) throw new Error('Scrivi un commento da 1 a 5.000 caratteri.')
    if (!this.discussionMatchesCurrentContext(discussion) ||
      this.getLatestMetaSnapshot()?.id !== discussion.metaId) throw new Error('La base dell’analisi è cambiata. Continua sulla nuova base.')
    if (discussion.turns.some((turn) => !turn.report)) throw new Error('Completa o riprova il commento già in attesa.')
    if (!discussion.turns.some((turn) => turn.report)) throw new Error('Genera prima una guida Matchup.')
    this.db.prepare(`INSERT INTO matchup_turns
      (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary)
      VALUES (?, ?, ?, ?, ?, NULL, NULL)`)
      .run(randomUUID(), discussionId, discussion.turns.length, trimmed, new Date().toISOString())
    return this.getMatchupDiscussion(discussionId)!
  }

  completeMatchupFeedback(discussionId: string, turnId: string, report: MatchupReport, changeSummary: string): MatchupDiscussion {
    const discussion = this.getMatchupDiscussion(discussionId)
    if (!discussion || !discussion.turns.some((turn) => turn.id === turnId && turn.feedback && !turn.report))
      throw new Error('Commento Matchup in attesa non trovato.')
    if (discussion.projectId !== report.projectId || discussion.metaId !== report.metaId ||
      discussion.opponentId !== report.opponentId || discussion.deckHash !== report.deckHash ||
      !this.discussionMatchesCurrentContext(discussion) || !this.reportMatchesCurrentContext(report) ||
      this.getLatestMetaSnapshot()?.id !== report.metaId)
      throw new Error('La base dell’analisi è cambiata. Continua sulla nuova base.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`UPDATE matchup_turns SET report_payload = ?, change_summary = ?
        WHERE id = ? AND discussion_id = ? AND report_payload IS NULL`)
        .run(JSON.stringify(report), changeSummary, turnId, discussionId)
      this.writeLatestReport(report)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.getMatchupDiscussion(discussionId)!
  }

  saveContinuedMatchupReport(report: MatchupReport, parentId: string): MatchupDiscussion {
    const parent = this.getMatchupDiscussion(parentId)
    if (!parent || parent.projectId !== report.projectId || parent.opponentId !== report.opponentId)
      throw new Error('Discussione di origine non valida.')
    if (!this.reportMatchesCurrentContext(report) || this.getLatestMetaSnapshot()?.id !== report.metaId)
      throw new Error('La base dell’analisi è cambiata. Riprova.')
    const current = this.listMatchupDiscussions(report.projectId, report.opponentId)
      .find((item) => item.metaId === report.metaId && item.deckHash === report.deckHash &&
        item.deckVersionId === report.deckVersionId && item.deckResolutionId === report.deckResolutionId)
    if (current) throw new Error('Esiste già una discussione per la base corrente.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const discussion = this.getOrCreateDiscussion(report, parentId)
      this.db.prepare(`INSERT INTO matchup_turns
        (id, discussion_id, turn_no, feedback, created_at, report_payload, change_summary)
        VALUES (?, ?, 0, NULL, ?, ?, ?)`)
        .run(randomUUID(), discussion.id, report.generatedAt, JSON.stringify(report), 'Rivalutazione sulla nuova lista o sul nuovo snapshot del meta.')
      this.writeLatestReport(report)
      this.db.exec('COMMIT')
      return this.getMatchupDiscussion(discussion.id)!
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  saveMatchupContextSummary(discussionId: string, summary: string, through: number): void {
    if (typeof summary !== 'string' || summary.length > 8000 || !Number.isInteger(through)) throw new Error('Riepilogo non valido.')
    const discussion = this.getMatchupDiscussion(discussionId)
    if (!discussion || through < discussion.summarizedThrough || through >= discussion.turns.length ||
      !discussion.turns[through].report) throw new Error('Riepilogo non valido.')
    this.db.prepare('UPDATE matchup_discussions SET context_summary = ?, summarized_through = ? WHERE id = ?')
      .run(summary, through, discussionId)
  }

  listMatchupNotes(projectId: string): MatchupNote[] {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    const currentHash = this.currentDeckHash(projectId)
    const rows = this.db.prepare(`
      SELECT id, project_id, deck_hash, opponent, strengths, weaknesses,
             our_key_cards, their_key_cards, strategy, created_at, updated_at
      FROM matchup_notes WHERE project_id = ? ORDER BY opponent COLLATE NOCASE, id
    `).all(projectId) as unknown as MatchupRow[]
    return rows.map((row) => toMatchupNote(row, currentHash))
  }

  saveMatchupNote(input: SaveMatchupNoteInput): MatchupNote {
    if (!input || !this.get(input.projectId)) throw new Error('Progetto non trovato.')
    if (input.id !== undefined && (typeof input.id !== 'string' || input.id.length > 100)) {
      throw new Error('Scheda Matchup non valida.')
    }
    const fields = ['opponent', 'strengths', 'weaknesses', 'ourKeyCards', 'theirKeyCards', 'strategy'] as const
    if (fields.some((field) => typeof input[field] !== 'string')) throw new Error('Scheda Matchup non valida.')
    const normalized = Object.fromEntries(fields.map((field) => [field, input[field].trim()])) as Record<typeof fields[number], string>
    if (!normalized.opponent || normalized.opponent.length > 120 ||
        fields.slice(1).some((field) => normalized[field].length > (field === 'strategy' ? 5_000 : 2_500)) ||
        fields.slice(1).every((field) => !normalized[field])) {
      throw new Error('Indica un archetipo e almeno una nota; rispetta i limiti dei campi.')
    }
    const currentHash = this.currentDeckHash(input.projectId)
    if (!currentHash) throw new Error('Importa una lista prima di creare una scheda Matchup.')
    const existing = input.id ? this.db.prepare('SELECT * FROM matchup_notes WHERE id = ? AND project_id = ?')
      .get(input.id, input.projectId) as MatchupRow | undefined : undefined
    if (input.id && !existing) throw new Error('Scheda Matchup non trovata in questo progetto.')
    const duplicate = this.db.prepare('SELECT id FROM matchup_notes WHERE project_id = ? AND opponent = ? COLLATE NOCASE AND id <> ?')
      .get(input.projectId, normalized.opponent, input.id ?? '')
    if (duplicate) throw new Error('Esiste già una scheda per questo archetipo nel progetto.')

    const now = new Date().toISOString()
    const row: MatchupRow = {
      id: input.id ?? randomUUID(),
      project_id: input.projectId,
      deck_hash: currentHash,
      opponent: normalized.opponent,
      strengths: normalized.strengths,
      weaknesses: normalized.weaknesses,
      our_key_cards: normalized.ourKeyCards,
      their_key_cards: normalized.theirKeyCards,
      strategy: normalized.strategy,
      created_at: existing?.created_at ?? now,
      updated_at: now
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`
        INSERT INTO matchup_notes (id, project_id, deck_hash, opponent, strengths, weaknesses,
          our_key_cards, their_key_cards, strategy, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          deck_hash = excluded.deck_hash, opponent = excluded.opponent,
          strengths = excluded.strengths, weaknesses = excluded.weaknesses,
          our_key_cards = excluded.our_key_cards, their_key_cards = excluded.their_key_cards,
          strategy = excluded.strategy, updated_at = excluded.updated_at
      `).run(row.id, row.project_id, row.deck_hash, row.opponent, row.strengths, row.weaknesses,
        row.our_key_cards, row.their_key_cards, row.strategy, row.created_at, row.updated_at)
      this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, input.projectId)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return toMatchupNote(row, currentHash)
  }

  deleteMatchupNote(projectId: string, noteId: string): boolean {
    if (!this.get(projectId)) throw new Error('Progetto non trovato.')
    if (typeof noteId !== 'string' || noteId.length > 100) return false
    const deleted = this.db.prepare('DELETE FROM matchup_notes WHERE project_id = ? AND id = ?')
      .run(projectId, noteId).changes > 0
    if (deleted) this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), projectId)
    return deleted
  }

  close(): void {
    this.db.close()
  }
}
