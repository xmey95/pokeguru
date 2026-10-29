import { DatabaseSync } from 'node:sqlite'

/** Refresh planner statistics once at startup, before background jobs. SQLite's
 * optimize analysis limit bounds the work; busy maintenance can wait for next
 * startup. No VACUUM, blocking checkpoint, or durability downgrade. */
export function optimizeDatabase(filePath: string): void {
  const db = new DatabaseSync(filePath)
  try {
    db.exec('PRAGMA busy_timeout = 1000; PRAGMA optimize = 0x10012')
  } catch (error) {
    if (!error || typeof error !== 'object' || !('errcode' in error) ||
      ![5, 6].includes(Number(error.errcode) & 255)) throw error
  } finally { db.close() }
}
