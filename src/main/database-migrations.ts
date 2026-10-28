import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

/** Version 1 records legacy migrations, 2 AI jobs, 3 the opening AI message link,
 * 4 project archives, 5 Catalog cooldowns, 6 Catalog job run IDs,
 * 7 rotation history, 8 daily sync outcomes, 9 deck version context and restoration,
 * 10 persisted AI job progress, 11 paged AI activity history,
 * 12 durable evidence originals, query cursors and immutable source snapshots. */
export const CURRENT_SCHEMA_VERSION = 12

export interface MigrationPreparation {
  fromVersion: number
  needsMigration: boolean
  backupPath: string | null
}

export class DatabaseIntegrityError extends Error {
  constructor(cause?: unknown) {
    super('Archivio SQLite non integro.', { cause })
    this.name = 'DatabaseIntegrityError'
  }
}

function isCorruptDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('errcode' in error)) return false
  return error.errcode === 11 || error.errcode === 26 // SQLITE_CORRUPT / SQLITE_NOTADB
}

export function verifyDatabase(filePath: string): void {
  try {
    const db = new DatabaseSync(filePath, { readOnly: true })
    try {
      const integrity = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
        throw new DatabaseIntegrityError()
      if (db.prepare('PRAGMA foreign_key_check').all().length)
        throw new DatabaseIntegrityError()
    } finally { db.close() }
  } catch (error) {
    if (error instanceof DatabaseIntegrityError) throw error
    if (isCorruptDatabaseError(error)) throw new DatabaseIntegrityError(error)
    throw error
  }
}

export async function prepareDatabaseMigration(filePath: string): Promise<MigrationPreparation> {
  mkdirSync(dirname(filePath), { recursive: true })
  const existing = existsSync(filePath) && statSync(filePath).size > 0
  if (!existing) return { fromVersion: 0, needsMigration: true, backupPath: null }
  // Check current schemas too, before any store opens a writable connection or starts a sync.
  verifyDatabase(filePath)
  const db = new DatabaseSync(filePath, { readOnly: true })
  let fromVersion: number
  try {
    fromVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (!Number.isInteger(fromVersion) || fromVersion < 0 || fromVersion > CURRENT_SCHEMA_VERSION)
      throw new Error('Versione dell’archivio SQLite non supportata.')
    if (fromVersion === CURRENT_SCHEMA_VERSION)
      return { fromVersion, needsMigration: false, backupPath: null }
    const backupDir = join(dirname(filePath), 'backups')
    mkdirSync(backupDir, { recursive: true })
    const destination = join(backupDir,
      `pokeguru-pre-v${fromVersion}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`)
    try {
      await backup(db, destination)
      verifyDatabase(destination)
      writeFileSync(`${destination}.verified`,
        `SQLite integrity_check=ok; foreign_key_check=ok; source user_version=${fromVersion}\n`,
        { flag: 'wx' })
    } catch (error) {
      try { if (existsSync(destination)) unlinkSync(destination) } catch { /* Incomplete backup remains unmarked. */ }
      throw error
    }
    return { fromVersion, needsMigration: true, backupPath: destination }
  } finally { db.close() }
}

export function completeDatabaseMigration(filePath: string, preparation: MigrationPreparation): void {
  if (!preparation.needsMigration) return
  verifyDatabase(filePath)
  const db = new DatabaseSync(filePath)
  try {
    const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (current !== preparation.fromVersion) throw new Error('Versione SQLite cambiata durante la migrazione.')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); throw error }
  } finally { db.close() }
}
