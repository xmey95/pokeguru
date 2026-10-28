import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AiJobKind, AiJobPhase, AiJobProgress, AiJobStatus, AiJobSummary } from '../shared/ai-job'
import { readAiDiagnostics, type AiDiagnostics } from '../shared/ai-diagnostics'

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
    const phases: AiJobPhase[] = ['preparing', 'catalog', 'events', 'planning',
      'analysis', 'verification', 'saving']
    if (!value || !phases.includes(value.phase!) || typeof value.detail !== 'string' ||
      (value.summary !== null && typeof value.summary !== 'string') ||
      typeof value.updatedAt !== 'string' || !Array.isArray(value.steps)) return null
    const steps = value.steps.filter((step) => step && phases.includes(step.phase) &&
      typeof step.detail === 'string' && typeof step.at === 'string').slice(-12)
      .map((step) => ({ phase: step.phase, detail: step.detail.slice(0, 180), at: step.at }))
    return { phase: value.phase!, detail: value.detail.slice(0, 180),
      summary: value.summary?.slice(0, 900) ?? null, updatedAt: value.updatedAt, steps,
      diagnostics: readAiDiagnostics(value.diagnostics) }
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

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.db = new DatabaseSync(filePath)
    this.db.exec('PRAGMA journal_mode = WAL')
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
    CREATE INDEX IF NOT EXISTS ai_jobs_recovery ON ai_jobs(status, updated_at);`)
    const columns = this.db.prepare('PRAGMA table_info(ai_jobs)').all() as { name: string }[]
    if (!columns.some((column) => column.name === 'progress_json'))
      this.db.exec('ALTER TABLE ai_jobs ADD COLUMN progress_json TEXT')
  }

  start(kind: AiJobKind, projectId: string, resourceId: string): AiJob {
    const paused = this.db.prepare(`SELECT progress_json FROM ai_jobs
      WHERE project_id = ? AND resource_id = ? AND status = 'interrupted'`).all(projectId, resourceId) as
      { progress_json: string | null }[]
    if (paused.some((row) => progress(row)?.diagnostics?.resumable))
      throw new Error('Riprendi o annulla prima l’analisi in pausa.')
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status,
      request_json, result_json, created_at, updated_at, error)
      VALUES (?, ?, ?, ?, 'running', NULL, NULL, ?, ?, NULL)`)
      .run(id, kind, projectId, resourceId, now, now)
    return this.get(id)!
  }

  get(id: string): AiJob | null {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null
    const row = this.db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id) as JobRow | undefined
    return row ? job(row) : null
  }

  active(projectId: string, resourceId: string): AiJobSummary | null {
    const row = this.db.prepare(`SELECT id, kind, project_id, resource_id, status, created_at, updated_at, error, progress_json
      FROM ai_jobs WHERE project_id = ? AND resource_id = ?
      AND status IN ('running', 'ready') LIMIT 1`).get(projectId, resourceId) as JobRow | undefined
    if (!row) return null
    return { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, error: row.error,
      progress: progress(row) }
  }

  latest(projectId: string, resourceId: string): AiJobSummary | null {
    const row = this.db.prepare(`SELECT id, kind, project_id, resource_id, status, created_at, updated_at, error, progress_json
      FROM ai_jobs WHERE project_id = ? AND resource_id = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(projectId, resourceId) as JobRow | undefined
    return row ? { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, error: row.error,
      progress: progress(row) } : null
  }

  recent(limit = 30): AiJobSummary[] {
    const rows = this.db.prepare(`SELECT id, kind, project_id, resource_id, status, created_at, updated_at, error, progress_json
      FROM ai_jobs ORDER BY rowid DESC LIMIT ?`).all(limit) as unknown as JobRow[]
    return rows.map((row) => ({ id: row.id, kind: row.kind, projectId: row.project_id,
      resourceId: row.resource_id, status: row.status, createdAt: row.created_at,
      updatedAt: row.updated_at, error: row.error, progress: progress(row) }))
  }

  updateProgress(id: string, phase: AiJobPhase, detail: string, summary?: string): void {
    const current = this.db.prepare('SELECT status, progress_json FROM ai_jobs WHERE id = ?')
      .get(id) as { status: AiJobStatus; progress_json: string | null } | undefined
    if (!current || current.status !== 'running') return
    const at = new Date().toISOString()
    const cleanDetail = detail.trim().slice(0, 180)
    const previous = progress(current)
    const next: AiJobProgress = { phase, detail: cleanDetail, diagnostics: previous?.diagnostics,
      summary: summary === undefined ? (previous?.phase === phase ? previous.summary : null) :
        summary.trim().slice(0, 900) || null,
      updatedAt: at, steps: [...(previous?.steps ?? []),
        { phase, detail: cleanDetail, at }].slice(-12) }
    this.db.prepare(`UPDATE ai_jobs SET progress_json = ?, updated_at = ?
      WHERE id = ? AND status = 'running'`).run(JSON.stringify(next), at, id)
  }

  recoverable(): AiJob[] {
    return (this.db.prepare(`SELECT * FROM ai_jobs WHERE status IN ('running', 'ready')
      ORDER BY created_at, id`).all() as unknown as JobRow[]).map(job)
  }

  recordDiagnostics(id: string, change: AiDiagnostics): void {
    const current = this.db.prepare('SELECT status, progress_json FROM ai_jobs WHERE id = ?')
      .get(id) as { status: AiJobStatus; progress_json: string | null } | undefined
    if (!current || !['running', 'ready', 'cancelled'].includes(current.status)) return
    const at = new Date().toISOString()
    const prior = progress(current) ?? { phase: 'preparing' as const, detail: 'Preparazione',
      summary: null, updatedAt: at, steps: [] }
    this.db.prepare('UPDATE ai_jobs SET progress_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...prior, diagnostics: readAiDiagnostics({ ...prior.diagnostics, ...change }) }), id)
  }

  diagnostics(id: string): AiDiagnostics | undefined {
    const row = this.db.prepare('SELECT progress_json FROM ai_jobs WHERE id = ?')
      .get(id) as { progress_json: string | null } | undefined
    return row ? progress(row)?.diagnostics : undefined
  }

  runtimeFacts(id: string): { requestPrepared: boolean; validatedDraft: boolean | null; resultPrepared: boolean } {
    const row = this.db.prepare(`SELECT request_json IS NOT NULL AS requestPrepared,
      CASE WHEN json_valid(request_json) THEN json_extract(request_json, '$.validatedDraft') END AS validatedDraft,
      result_json IS NOT NULL AS resultPrepared FROM ai_jobs WHERE id = ?`).get(id) as
      { requestPrepared: number; validatedDraft: number | null; resultPrepared: number }
    return { requestPrepared: !!row?.requestPrepared, resultPrepared: !!row?.resultPrepared,
      validatedDraft: row?.validatedDraft === 1 ? true : row?.validatedDraft === 0 ? false : null }
  }

  suspend(id: string, error: string): void {
    this.recordDiagnostics(id, { resumable: true })
    this.db.prepare(`UPDATE ai_jobs SET status = 'interrupted', error = ?, updated_at = ?
      WHERE id = ? AND status = 'running'`).run(error, new Date().toISOString(), id)
  }

  resume(id: string): AiJob {
    const result = this.db.prepare(`UPDATE ai_jobs SET status = 'running', error = NULL, updated_at = ?
      WHERE id = ? AND status = 'interrupted'`).run(new Date().toISOString(), id)
    if (result.changes !== 1) throw new Error('Analisi non riprendibile.')
    this.recordDiagnostics(id, { resumable: false, failureCode: undefined })
    return this.get(id)!
  }

  prepare(id: string, request: unknown): void {
    const changed = this.db.prepare(`UPDATE ai_jobs SET request_json = ?, updated_at = ?
      WHERE id = ? AND status = 'running'`).run(JSON.stringify(request), new Date().toISOString(), id)
    if (changed.changes !== 1) throw new Error('Job AI non più attivo.')
  }

  ready(id: string, result: unknown): void {
    const changed = this.db.prepare(`UPDATE ai_jobs SET result_json = ?, status = 'ready', updated_at = ?
      WHERE id = ? AND status = 'running'`).run(JSON.stringify(result), new Date().toISOString(), id)
    if (changed.changes !== 1) throw new Error('Job AI non più attivo.')
  }

  transition(id: string, status: Exclude<AiJobStatus, 'running' | 'ready'>,
    error: string | null = null): void {
    this.db.prepare(`UPDATE ai_jobs SET status = ?, error = ?, updated_at = ?,
      request_json = NULL, result_json = NULL
      WHERE id = ? AND (status IN ('running', 'ready') OR (status = 'interrupted' AND ? = 'cancelled'))`)
      .run(status, error, new Date().toISOString(), id, status)
  }

  noteError(id: string, error: string): void {
    this.db.prepare(`UPDATE ai_jobs SET error = ?, updated_at = ?
      WHERE id = ? AND status IN ('running', 'ready')`)
      .run(error.slice(0, 500), new Date().toISOString(), id)
  }

  close(): void { this.db.close() }
}
