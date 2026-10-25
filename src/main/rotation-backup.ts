import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { backup, type DatabaseSync } from 'node:sqlite'
import { verifyDatabase } from './database-migrations'

/** A destructive rotation change needs its own consistent backup, even when the schema is current. */
export async function backupBeforeRotation(db: DatabaseSync, filePath: string, area: 'catalog' | 'events',
  rotationStart: string): Promise<string> {
  const folder = join(dirname(filePath), 'backups')
  mkdirSync(folder, { recursive: true })
  const destination = join(folder, `pokeguru-pre-${area}-rotation-${rotationStart}-${randomUUID()}.sqlite`)
  try {
    await backup(db, destination)
    verifyDatabase(destination)
    writeFileSync(`${destination}.verified`,
      `SQLite integrity_check=ok; foreign_key_check=ok; before ${area} rotation ${rotationStart}\n`, { flag: 'wx' })
    return destination
  } catch (error) {
    try { if (existsSync(destination)) unlinkSync(destination) } catch { /* Unverified copy is never used. */ }
    throw error
  }
}
