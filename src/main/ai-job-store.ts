import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { statementCache } from './database-statements'
import type { AiJobActivityPage, AiJobActivityStep, AiJobKind, AiJobPhase, AiJobProgress, AiJobStatus, AiJobSummary } from '../shared/ai-job'
import { readAiDiagnostics, type AiDiagnostics } from '../shared/ai-diagnostics'
import { AI_EVIDENCE_ARCHIVE_SCHEMA } from './ai-evidence-archive'
import type { AiCallState } from './ai-call-retry'

export interface AiJob extends AiJobSummary {
  request: unknown | null
  result: unknown | null
}

interface JobRow {
  id: string; kind: AiJobKind; project_id: string; resource_id: string
  status: AiJobStatus; request_json: string | null; result_json: string | null
  created_at: string; updated_at: string; error: string | null; progress_json: string | null
}

function progress(row: { progress_json: string | null }): AiJobProgress | null {
  if (!row.progress_json) return null
  try {
    const value = JSON.parse(row.progress_json) as Partial<AiJobProgress>
    const phases: AiJobPhase[] = ['preparing', 'catalog', 'events', 'planning', 'collecting',
      'analysis', 'verification', 'saving']
    if (!value || !phases.includes(value.phase!) || typeof value.detail !== 'string' ||
      (value.summary !== null && typeof value.summary !== 'string') ||
      typeof value.updatedAt !== 'string' || !Array.isArray(value.steps)) return null
    const steps = value.steps.filter((step) => step && phases.includes(step.phase) &&
      typeof step.detail === 'string' && typeof step.at === 'string').slice(-12)
      .map((step) => ({ phase: step.phase, detail: step.detail.slice(0, 180), at: step.at }))
    return { phase: value.phase!, detail: value.detail.slice(0, 180),
      summary: value.summary?.slice(0, 900) ?? null, updatedAt: value.updatedAt,
      sequence: Number.isSafeInteger(value.sequence) && value.sequence! >= 0 ? value.sequence : steps.length,
      steps, diagnostics: readAiDiagnostics(value.diagnostics) }
  }
  catch { return null }
}

function job(row: JobRow): AiJob {
  return { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
    status: row.status, request: row.request_json ? JSON.parse(row.request_json) as unknown : null,
    result: row.result_json ? JSON.parse(row.result_json) as unknown : null,
    createdAt: row.created_at, updatedAt: row.updated_at, error: row.error, progress: progress(row) }
}

export class AiJobStore {
  private readonly db: DatabaseSync
  private readonly statement: ReturnType<typeof statementCache>

  constructor(readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.db = new DatabaseSync(filePath)
    this.statement = statementCache(this.db)
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec(`CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('thread-ask', 'thread-propose', 'matchup-generate',
        'matchup-revise', 'matchup-continue')),
      project_id TEXT NOT NULL REFERENCES projects(id),
      resource_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'ready', 'applied', 'interrupted', 'cancelled', 'failed')),
      request_json TEXT, result_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT,
      progress_json TEXT
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_active_resource
      ON ai_jobs(project_id, resource_id) WHERE status IN ('running', 'ready');
    CREATE INDEX IF NOT EXISTS ai_jobs_recovery ON ai_jobs(status, updated_at);
    CREATE INDEX IF NOT EXISTS ai_jobs_resource_history ON ai_jobs(project_id, resource_id, created_at);`)
    const columns = this.statement('PRAGMA table_info(ai_jobs)').all() as { name: string }[]
    if (!columns.some((column) => column.name === 'progress_json'))
      this.db.exec('ALTER TABLE ai_jobs ADD COLUMN progress_json TEXT')
    this.db.exec(`CREATE TABLE IF NOT EXISTS ai_job_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
      phase TEXT NOT NULL,
      detail TEXT NOT NULL,
      summary TEXT,
      at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS ai_job_activity_page ON ai_job_activity(job_id, id DESC);`)
    this.db.exec(AI_EVIDENCE_ARCHIVE_SCHEMA)
    this.db.exec(`CREATE TABLE IF NOT EXISTS ai_call_state (
      job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
      key TEXT NOT NULL, state_json TEXT NOT NULL, PRIMARY KEY (job_id, key)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS ai_call_cache (
      job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
      key TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY (job_id, key)
    ) STRICT;`)
  }

  start(kind: AiJobKind, projectId: string, resourceId: string): AiJob {
    const paused = this.statement(`SELECT progress_json FROM ai_jobs
      WHERE project_id = ? AND resource_id = ? AND status = 'interrupted'`).all(projectId, resourceId) as
      { progress_json: string | null }[]
    if (paused.some((row) => progress(row)?.diagnostics?.resumable))
      throw new Error('Riprendi o annulla prima l’analisi in pausa.')
    const id = randomUUID()
    const now = new Date().toISOString()
    this.statement(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status,
      request_json, result_json, created_at, updated_at, error)
      VALUES (?, ?, ?, ?, 'running', NULL, NULL, ?, ?, NULL)`)
      .run(id, kind, projectId, resourceId, now, now)
    return this.get(id)!
  }

  get(id: string): AiJob | null {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null
    const row = this.statement('SELECT * FROM ai_jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? job(row) : null
  }

  active(projectId: string, resourceId: string): AiJobSummary | null {
    const row = this.statement(`SELECT id, kind, project_id, resource_id, status, created_at, updated_at, error, progress_json
      FROM ai_jobs WHERE project_id = ? AND resource_id = ?
      AND status IN ('running', 'ready') LIMIT 1`).get(projectId, resourceId) as JobRow | undefined
    if (!row) return null
    return { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, error: row.error,
      progress: progress(row) }
  }

  latest(projectId: string, resourceId: string): AiJobSummary | null {
    const row = this.statement(`SELECT id, kind, project_id, resource_id, status, created_at, updated_at, error, progress_json
      FROM ai_jobs WHERE project_id = ? AND resource_id = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(projectId, resourceId) as JobRow | undefined
    return row ? { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, error: row.error,
      progress: progress(row) } : null
  }

  recent(limit = 30): AiJobSummary[] {
    const rows = this.statement(`SELECT id, kind, project_id, resource_id, status, created_at, updated_at, error, progress_json
      FROM ai_jobs ORDER BY rowid DESC LIMIT ?`).all(limit) as unknown as JobRow[]
    return rows.map((row) => ({ id: row.id, kind: row.kind, projectId: row.project_id,
      resourceId: row.resource_id, status: row.status, createdAt: row.created_at,
      updatedAt: row.updated_at, error: row.error, progress: progress(row) }))
  }

  updateProgress(id: string, phase: AiJobPhase, detail: string, summary?: string): void {
    const current = this.statement('SELECT status, progress_json FROM ai_jobs WHERE id = ?')
      .get(id) as { status: AiJobStatus; progress_json: string | null } | undefined
    if (!current || current.status !== 'running') return
    const at = new Date().toISOString()
    const cleanDetail = detail.trim().slice(0, 180)
    const cleanSummary = summary?.trim().slice(0, 900) || null
    const previous = progress(current)
    const next: AiJobProgress = { phase, detail: cleanDetail, diagnostics: previous?.diagnostics,
      summary: summary === undefined ? (previous?.phase === phase ? previous.summary : null) : cleanSummary,
      updatedAt: at, sequence: (previous?.sequence ?? 0) + 1,
      steps: [...(previous?.steps ?? []),
        { phase, detail: cleanDetail, at }].slice(-12) }
    this.transaction(() => {
      this.ensureActivity(id, previous)
      this.statement(`UPDATE ai_jobs SET progress_json = ?, updated_at = ?
        WHERE id = ? AND status = 'running'`).run(JSON.stringify(next), at, id)
      this.statement(`INSERT INTO ai_job_activity (job_id, phase, detail, summary, at)
        VALUES (?, ?, ?, ?, ?)`).run(id, phase, cleanDetail, cleanSummary, at)
    })
  }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = action()
      this.db.exec('COMMIT')
      return result
    }
    catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private ensureActivity(id: string, previous: AiJobProgress | null): void {
    const existing = this.statement('SELECT 1 FROM ai_job_activity WHERE job_id = ? LIMIT 1').get(id)
    if (existing || !previous?.steps.length) return
    const insert = this.statement(`INSERT INTO ai_job_activity (job_id, phase, detail, summary, at)
      VALUES (?, ?, ?, ?, ?)`)
    previous.steps.forEach((step, index) => insert.run(id, step.phase, step.detail,
      index === previous.steps.length - 1 ? previous.summary : null, step.at))
  }

  activity(projectId: string, resourceId: string, jobId: string,
    before?: number, limit = 25): AiJobActivityPage | null {
    if (!/^[a-f0-9-]{36}$/i.test(jobId) ||
      before !== undefined && (!Number.isSafeInteger(before) || before < 1) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50) return null
    const row = this.statement(`SELECT progress_json FROM ai_jobs
      WHERE id = ? AND project_id = ? AND resource_id = ?`).get(jobId, projectId, resourceId) as
      { progress_json: string | null } | undefined
    if (!row) return null
    const legacy = progress(row)
    if (legacy?.steps.length && !this.statement('SELECT 1 FROM ai_job_activity WHERE job_id = ? LIMIT 1').get(jobId))
      this.transaction(() => this.ensureActivity(jobId, legacy))
    const entries = this.statement(`SELECT id, phase, detail, summary, at FROM ai_job_activity
      WHERE job_id = ? ${before === undefined ? '' : 'AND id < ?'}
      ORDER BY id DESC LIMIT ?`).all(jobId, ...(before === undefined ? [] : [before]), limit + 1) as unknown as
      AiJobActivityStep[]
    return { steps: entries.slice(0, limit).reverse(), hasMore: entries.length > limit }
  }

  recoverable(): AiJob[] {
    return (this.statement(`SELECT * FROM ai_jobs WHERE status IN ('running', 'ready')
      ORDER BY created_at, id`).all() as unknown as JobRow[]).map(job)
  }

  automaticResumable(): AiJob[] {
    return (this.statement(`SELECT * FROM ai_jobs WHERE status = 'interrupted'
      AND json_extract(progress_json, '$.diagnostics.resumable') = 1
      AND json_extract(progress_json, '$.diagnostics.suspensionReason') = 'shutdown'
      ORDER BY created_at, id`).all() as unknown as JobRow[]).map(job)
  }

  /** Only an explicit retry after intervention renews a transient failure budget.
   * Context, invalid content and no-progress failures keep their original state. */
  retryAfterIntervention(id: string): void {
    if (this.get(id)?.status !== 'interrupted') throw new Error('Analisi non riprendibile.')
    this.statement(`DELETE FROM ai_call_state WHERE job_id = ?
      AND json_extract(state_json, '$.status') = 'blocked'
      AND json_extract(state_json, '$.code') IN ('network', 'timeout', 'quota', 'auth',
        'cli-unavailable', 'storage', 'storage-full')`).run(id)
  }

  recordDiagnostics(id: string, change: AiDiagnostics): void {
    const current = this.statement('SELECT status, progress_json FROM ai_jobs WHERE id = ?')
      .get(id) as { status: AiJobStatus; progress_json: string | null } | undefined
    if (!current || !['running', 'ready', 'cancelled', 'interrupted'].includes(current.status)) return
    const at = new Date().toISOString()
    const prior = progress(current) ?? { phase: 'preparing' as const, detail: 'Preparazione',
      summary: null, updatedAt: at, steps: [] }
    this.statement('UPDATE ai_jobs SET progress_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...prior, diagnostics: readAiDiagnostics({ ...prior.diagnostics, ...change }) }), id)
  }

  diagnostics(id: string): AiDiagnostics | undefined {
    const row = this.statement('SELECT progress_json FROM ai_jobs WHERE id = ?')
      .get(id) as { progress_json: string | null } | undefined
    return row ? progress(row)?.diagnostics : undefined
  }

  callState(id: string, key: string): AiCallState | undefined {
    const row = this.statement('SELECT state_json FROM ai_call_state WHERE job_id = ? AND key = ?').get(id, key) as
      { state_json: string } | undefined
    return row ? JSON.parse(row.state_json) as AiCallState : undefined
  }
  saveCallState(id: string, key: string, state: AiCallState): void {
    this.statement(`INSERT INTO ai_call_state VALUES (?, ?, ?) ON CONFLICT(job_id, key)
      DO UPDATE SET state_json = excluded.state_json`).run(id, key, JSON.stringify(state))
  }
  callResult<T>(id: string, key: string): { value: T } | undefined {
    const row = this.statement('SELECT result_json FROM ai_call_cache WHERE job_id = ? AND key = ?').get(id, key) as
      { result_json: string } | undefined
    return row ? { value: JSON.parse(row.result_json) as T } : undefined
  }
  saveCallResult(id: string, key: string, result: unknown): void {
    this.statement('INSERT OR IGNORE INTO ai_call_cache VALUES (?, ?, ?)').run(id, key, JSON.stringify(result))
  }

  runtimeFacts(id: string): { requestPrepared: boolean; validatedDraft: boolean | null; resultPrepared: boolean } {
    const row = this.statement(`SELECT request_json IS NOT NULL AS requestPrepared,
      CASE WHEN json_valid(request_json) THEN json_extract(request_json, '$.validatedDraft') END AS validatedDraft,
      result_json IS NOT NULL AS resultPrepared FROM ai_jobs WHERE id = ?`).get(id) as
      { requestPrepared: number; validatedDraft: number | null; resultPrepared: number }
    return { requestPrepared: !!row?.requestPrepared, resultPrepared: !!row?.resultPrepared,
      validatedDraft: row?.validatedDraft === 1 ? true : row?.validatedDraft === 0 ? false : null }
  }

  suspend(id: string, error: string, reason: NonNullable<AiDiagnostics['suspensionReason']> = 'failure'): void {
    this.recordDiagnostics(id, { resumable: true, suspensionReason: reason })
    this.statement(`UPDATE ai_jobs SET status = 'interrupted', error = ?, updated_at = ?
      WHERE id = ? AND status IN ('running', 'interrupted')`).run(error, new Date().toISOString(), id)
  }

  resume(id: string): AiJob {
    const result = this.statement(`UPDATE ai_jobs SET status = 'running', error = NULL, updated_at = ?
      WHERE id = ? AND status = 'interrupted'`).run(new Date().toISOString(), id)
    if (result.changes !== 1) throw new Error('Analisi non riprendibile.')
    this.recordDiagnostics(id, { resumable: false, failureCode: undefined, suspensionReason: undefined, automaticWait: false })
    return this.get(id)!
  }

  prepare(id: string, request: unknown): void {
    const changed = this.statement(`UPDATE ai_jobs SET request_json = ?, updated_at = ?
      WHERE id = ? AND status = 'running'`).run(JSON.stringify(request), new Date().toISOString(), id)
    if (changed.changes !== 1) throw new Error('Job AI non più attivo.')
  }

  ready(id: string, result: unknown): void {
    const changed = this.statement(`UPDATE ai_jobs SET result_json = ?, status = 'ready', updated_at = ?
      WHERE id = ? AND status = 'running'`).run(JSON.stringify(result), new Date().toISOString(), id)
    if (changed.changes !== 1) throw new Error('Job AI non più attivo.')
  }

  transition(id: string, status: Exclude<AiJobStatus, 'running' | 'ready'>,
    error: string | null = null): void {
    this.statement(`UPDATE ai_jobs SET status = ?, error = ?, updated_at = ?,
      request_json = NULL, result_json = NULL
      WHERE id = ? AND (status IN ('running', 'ready') OR (status = 'interrupted' AND ? = 'cancelled'))`)
      .run(status, error, new Date().toISOString(), id, status)
  }

  noteError(id: string, error: string): void {
    this.statement(`UPDATE ai_jobs SET error = ?, updated_at = ?
      WHERE id = ? AND status IN ('running', 'ready')`)
      .run(error.slice(0, 500), new Date().toISOString(), id)
  }

  close(): void { this.db.close() }
}
