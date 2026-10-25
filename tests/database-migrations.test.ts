import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { CatalogStore } from '../src/main/catalog'
import { TournamentStore } from '../src/main/tournament-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { CURRENT_SCHEMA_VERSION, completeDatabaseMigration,
  prepareDatabaseMigration, verifyDatabase } from '../src/main/database-migrations'

function schemaVersion(path: string): number {
  const db = new DatabaseSync(path, { readOnly: true })
  try { return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version }
  finally { db.close() }
}

it('versions a fresh archive and reopens it without another backup', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-schema-new-'))
  const path = join(folder, 'data', 'pokeguru.sqlite')
  try {
    const preparation = await prepareDatabaseMigration(path)
    expect(preparation).toMatchObject({ fromVersion: 0, needsMigration: true, backupPath: null })
    const projects = new ProjectStore(path)
    const catalog = new CatalogStore(path)
    const events = new TournamentStore(path)
    const jobs = new AiJobStore(path)
    const project = projects.create({ name: 'New', format: 'STANDARD' })
    completeDatabaseMigration(path, preparation)
    expect(projects.get(project.id)?.name).toBe('New')
    jobs.close(); events.close(); catalog.close(); projects.close()
    verifyDatabase(path)
    const current = await prepareDatabaseMigration(path)
    expect(current).toMatchObject({ fromVersion: CURRENT_SCHEMA_VERSION,
      needsMigration: false, backupPath: null })
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})

it('backs up a live WAL archive before legacy migration and restores its evidence after interruption', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-schema-legacy-'))
  const path = join(folder, 'pokeguru.sqlite')
  let projects: ProjectStore | null = null
  try {
    projects = new ProjectStore(path)
    const project = projects.create({ name: 'Legacy', format: 'STANDARD' })
    projects.importDeck({ projectId: project.id, source: 'paste', rawText: '60 Card MEG 1' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Evidence', openingNote: 'Keep me' })
    const preparation = await prepareDatabaseMigration(path)
    expect(preparation).toMatchObject({ fromVersion: 0, needsMigration: true })
    expect(preparation.backupPath && existsSync(preparation.backupPath)).toBe(true)
    expect(existsSync(`${preparation.backupPath}.verified`)).toBe(true)
    const restoredPath = join(folder, 'restored.sqlite')
    cpSync(preparation.backupPath!, restoredPath)
    verifyDatabase(restoredPath)
    const restored = new ProjectStore(restoredPath)
    expect(restored.get(project.id)?.name).toBe('Legacy')
    expect(restored.getDeckThread(project.id, thread.id)?.messages[0].text).toBe('Keep me')
    restored.close()
    // A process may exit after one constructor but before the version marker is committed.
    projects.close(); projects = null
    const partial = new CatalogStore(path)
    partial.close()
    expect(schemaVersion(path)).toBe(0)
    const retry = await prepareDatabaseMigration(path)
    const reopenedProjects = new ProjectStore(path)
    const reopenedCatalog = new CatalogStore(path)
    const reopenedEvents = new TournamentStore(path)
    const reopenedJobs = new AiJobStore(path)
    completeDatabaseMigration(path, retry)
    expect(reopenedProjects.getDeckThread(project.id, thread.id)?.messages[0].text).toBe('Keep me')
    reopenedJobs.close(); reopenedEvents.close(); reopenedCatalog.close(); reopenedProjects.close()
    verifyDatabase(path)
    expect(schemaVersion(path)).toBe(CURRENT_SCHEMA_VERSION)
  } finally { projects?.close(); rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})

it('refuses a newer archive schema before opening stores', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-schema-future-'))
  const path = join(folder, 'future.sqlite')
  try {
    const db = new DatabaseSync(path)
    db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`)
    db.close()
    await expect(prepareDatabaseMigration(path)).rejects.toThrow('non supportata')
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})
