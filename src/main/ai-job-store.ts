import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AiJobKind, AiJobStatus, AiJobSummary } from '../shared/ai-job'

export interface AiJob extends AiJobSummary {
  request: unknown | null
  result: unknown | null
}

interface JobRow {
  id: string; kind: AiJobKind; project_id: string; resource_id: string
  status: AiJobStatus; request_json: string | null; result_json: string | null
  created_at: string; updated_at: string; error: string | null
}

function job(row: JobRow): AiJob {
  return { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
    status: row.status, request: row.request_json ? JSON.parse(row.request_json) as unknown : null,
    result: row.result_json ? JSON.parse(row.result_json) as unknown : null,
    createdAt: row.created_at, updatedAt: row.updated_at, error: row.error }
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
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_active_resource
      ON ai_jobs(project_id, resource_id) WHERE status IN ('running', 'ready');
    CREATE INDEX IF NOT EXISTS ai_jobs_recovery ON ai_jobs(status, updated_at);`)
  }

  start(kind: AiJobKind, projectId: string, resourceId: string): AiJob {
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
    const row = this.db.prepare(`SELECT * FROM ai_jobs WHERE project_id = ? AND resource_id = ?
      AND status IN ('running', 'ready') LIMIT 1`).get(projectId, resourceId) as JobRow | undefined
    if (!row) return null
    return { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, error: row.error }
  }

  latest(projectId: string, resourceId: string): AiJobSummary | null {
    const row = this.db.prepare(`SELECT * FROM ai_jobs WHERE project_id = ? AND resource_id = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(projectId, resourceId) as JobRow | undefined
    return row ? { id: row.id, kind: row.kind, projectId: row.project_id, resourceId: row.resource_id,
      status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, error: row.error } : null
  }

  recoverable(): AiJob[] {
    return (this.db.prepare(`SELECT * FROM ai_jobs WHERE status IN ('running', 'ready')
      ORDER BY created_at, id`).all() as unknown as JobRow[]).map(job)
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
      WHERE id = ? AND status IN ('running', 'ready')`)
      .run(status, error, new Date().toISOString(), id)
  }

  noteError(id: string, error: string): void {
    this.db.prepare(`UPDATE ai_jobs SET error = ?, updated_at = ?
      WHERE id = ? AND status IN ('running', 'ready')`)
      .run(error.slice(0, 500), new Date().toISOString(), id)
  }

  close(): void { this.db.close() }
}
