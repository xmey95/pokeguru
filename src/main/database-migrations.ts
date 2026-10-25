import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

/** Version 1 records legacy migrations, 2 AI jobs, 3 the opening AI message link. */
export const CURRENT_SCHEMA_VERSION = 3

export interface MigrationPreparation {
  fromVersion: number
  needsMigration: boolean
  backupPath: string | null
}

export function verifyDatabase(filePath: string): void {
  const db = new DatabaseSync(filePath, { readOnly: true })
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      throw new Error('Integrità SQLite non verificata.')
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Relazioni SQLite non integre.')
  } finally { db.close() }
}

export async function prepareDatabaseMigration(filePath: string): Promise<MigrationPreparation> {
  mkdirSync(dirname(filePath), { recursive: true })
  const existing = existsSync(filePath) && statSync(filePath).size > 0
  if (!existing) return { fromVersion: 0, needsMigration: true, backupPath: null }
  const db = new DatabaseSync(filePath, { readOnly: true })
  let fromVersion: number
  try {
    fromVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (!Number.isInteger(fromVersion) || fromVersion < 0 || fromVersion > CURRENT_SCHEMA_VERSION)
      throw new Error('Versione dell’archivio SQLite non supportata.')
    if (fromVersion === CURRENT_SCHEMA_VERSION)
      return { fromVersion, needsMigration: false, backupPath: null }
    verifyDatabase(filePath)
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
