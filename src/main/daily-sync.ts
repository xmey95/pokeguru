import { DatabaseSync } from 'node:sqlite'
import type { DailySyncSource, DailySyncState } from '../shared/daily-sync'

const RETRY_DELAY_MS = 6 * 60 * 60_000
const DAILY_INTERVAL_MS = 24 * 60 * 60_000
const empty: DailySyncState = {
  lastAttemptAt: null, lastSuccessAt: null, trigger: null, outcome: 'idle', nextAttemptAt: null, error: null
}

/** App-level timestamps are independent of the resumable cursors of each provider. */
export class DailySyncStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec(`CREATE TABLE IF NOT EXISTS daily_sync (
      source TEXT PRIMARY KEY CHECK (source IN ('catalog', 'play', 'main')),
      last_attempt_at TEXT, last_success_at TEXT, trigger TEXT,
      outcome TEXT NOT NULL, next_attempt_at TEXT, error TEXT
    ) STRICT`)
    // Catalog jobs already recorded their completion time before this version.
    // Tournament cursors did not, so do not invent a success time for them.
    if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_job'").get() &&
      !this.db.prepare("SELECT 1 FROM daily_sync WHERE source='catalog'").get()) {
      const legacy = this.db.prepare('SELECT state, updated_at, retry_at FROM catalog_job WHERE id=1').get() as
        { state: string; updated_at: string; retry_at: string | null } | undefined
      if (legacy?.state === 'done') this.success('catalog', new Date(legacy.updated_at))
      else if (legacy?.state === 'paused') this.paused('catalog')
      else if (legacy?.state === 'cancelled') this.cancelled('catalog')
      else if (legacy && legacy.state !== 'idle') this.failed('catalog', 'Aggiornamento precedente interrotto.',
        legacy.retry_at, Number.isFinite(Date.parse(legacy.updated_at)) ? new Date(legacy.updated_at) : new Date())
    }
  }

  read(source: DailySyncSource): DailySyncState {
    const row = this.db.prepare(`SELECT last_attempt_at, last_success_at, trigger, outcome,
      next_attempt_at, error FROM daily_sync WHERE source = ?`).get(source) as {
      last_attempt_at: string | null; last_success_at: string | null
      trigger: DailySyncState['trigger']
      outcome: DailySyncState['outcome']; next_attempt_at: string | null; error: string | null
    } | undefined
    return row ? { lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at,
      trigger: row.trigger,
      outcome: row.outcome, nextAttemptAt: row.next_attempt_at, error: row.error } : { ...empty }
  }

  /** Require 24 elapsed hours, regardless of midnight, timezone or DST. */
  due(source: DailySyncSource, now = new Date()): boolean {
    const state = this.read(source)
    if (state.outcome === 'paused' || state.outcome === 'cancelled') return false
    if (state.lastSuccessAt && now.getTime() - Date.parse(state.lastSuccessAt) < DAILY_INTERVAL_MS)
      return false
    return !state.nextAttemptAt || Date.parse(state.nextAttemptAt) <= now.getTime()
  }

  /** Persist before scheduling any network work, so an immediate restart cannot duplicate it. */
  claim(source: DailySyncSource, now = new Date()): boolean {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (!this.due(source, now)) { this.db.exec('COMMIT'); return false }
      this.started(source, now, 'automatic')
      this.db.exec('COMMIT')
      return true
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  started(source: DailySyncSource, now = new Date(), trigger: 'automatic' | 'manual' = 'manual'): void {
    const at = now.toISOString()
    const next = new Date(now.getTime() + RETRY_DELAY_MS).toISOString()
    this.db.prepare(`INSERT INTO daily_sync
      (source, last_attempt_at, last_success_at, trigger, outcome, next_attempt_at, error)
      VALUES (?, ?, NULL, ?, 'running', ?, NULL)
      ON CONFLICT(source) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,
        trigger=excluded.trigger, outcome='running', next_attempt_at=excluded.next_attempt_at, error=NULL`).run(source, at, trigger, next)
  }

  success(source: DailySyncSource, now = new Date()): void {
    this.db.prepare(`INSERT INTO daily_sync
      (source, last_attempt_at, last_success_at, trigger, outcome, next_attempt_at, error)
      VALUES (?, ?, ?, NULL, 'success', NULL, NULL)
      ON CONFLICT(source) DO UPDATE SET last_success_at=excluded.last_success_at,
        outcome='success', next_attempt_at=NULL, error=NULL`).run(source, now.toISOString(), now.toISOString())
  }

  failed(source: DailySyncSource, error: string, retryAt?: string | null, now = new Date()): void {
    const validRetry = retryAt && Number.isFinite(Date.parse(retryAt)) ? Date.parse(retryAt) : 0
    const next = new Date(Math.max(now.getTime() + RETRY_DELAY_MS, validRetry)).toISOString()
    this.db.prepare(`INSERT INTO daily_sync
      (source, last_attempt_at, last_success_at, trigger, outcome, next_attempt_at, error)
      VALUES (?, ?, NULL, NULL, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET outcome=excluded.outcome,
        next_attempt_at=excluded.next_attempt_at, error=excluded.error`).run(
      source, now.toISOString(), validRetry ? 'rate-limited' : 'failed', next, error)
  }

  paused(source: DailySyncSource): void {
    this.db.prepare(`INSERT INTO daily_sync
      (source, last_attempt_at, last_success_at, trigger, outcome, next_attempt_at, error)
      VALUES (?, NULL, NULL, NULL, 'paused', NULL, NULL)
      ON CONFLICT(source) DO UPDATE SET outcome='paused', next_attempt_at=NULL`).run(source)
  }

  cancelled(source: DailySyncSource): void {
    this.db.prepare(`INSERT INTO daily_sync
      (source, last_attempt_at, last_success_at, trigger, outcome, next_attempt_at, error)
      VALUES (?, NULL, NULL, NULL, 'cancelled', NULL, NULL)
      ON CONFLICT(source) DO UPDATE SET outcome='cancelled', next_attempt_at=NULL`).run(source)
  }

  close(): void { this.db.close() }
}
