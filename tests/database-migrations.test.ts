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
}, 30_000)

it('backs up schema 4 before adding the Catalog retry clock and job identity', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-schema-catalog-'))
  const path = join(folder, 'pokeguru.sqlite')
  try {
    const old = new DatabaseSync(path)
    old.exec(`CREATE TABLE catalog_job (
      id INTEGER PRIMARY KEY CHECK (id = 1), mode TEXT NOT NULL,
      state TEXT NOT NULL, phase TEXT NOT NULL, expected INTEGER NOT NULL,
      error TEXT, updated_at TEXT NOT NULL
    ) STRICT`)
    old.prepare('INSERT INTO catalog_job VALUES (1, ?, ?, ?, 0, NULL, ?)')
      .run('new', 'running', 'Lettura inventario TCGdex', '2026-10-25T00:00:00.000Z')
    old.exec('PRAGMA user_version = 4')
    old.close()

    const preparation = await prepareDatabaseMigration(path)
    expect(preparation).toMatchObject({ fromVersion: 4, needsMigration: true })
    expect(existsSync(`${preparation.backupPath}.verified`)).toBe(true)
    const catalog = new CatalogStore(path)
    expect(catalog.jobStatus()).toMatchObject({ state: 'interrupted', cooldownUntil: null })
    catalog.close()
    completeDatabaseMigration(path, preparation)
    expect(schemaVersion(path)).toBe(6)
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})

it('backs up schema 5 and preserves a Catalog job while adding run identity', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-schema-alerts-'))
  const path = join(folder, 'pokeguru.sqlite')
  try {
    const original = new CatalogStore(path)
    original.startJob('new')
    original.close()
    const old = new DatabaseSync(path)
    old.exec('ALTER TABLE catalog_job DROP COLUMN run_id; PRAGMA user_version = 5')
    old.close()
    const preparation = await prepareDatabaseMigration(path)
    expect(preparation).toMatchObject({ fromVersion: 5, needsMigration: true })
    expect(existsSync(`${preparation.backupPath}.verified`)).toBe(true)
    const upgraded = new CatalogStore(path)
    expect(upgraded.jobStatus()).toMatchObject({ state: 'interrupted', runId: null })
    upgraded.startJob('new')
    const runId = upgraded.jobStatus().runId
    expect(runId).toMatch(/^[a-f0-9-]{36}$/)
    upgraded.pauseJob(null)
    upgraded.close()
    completeDatabaseMigration(path, preparation)
    const reopened = new CatalogStore(path)
    expect(reopened.jobStatus().runId).toBe(runId)
    reopened.startJob('new')
    expect(reopened.jobStatus().runId).not.toBe(runId)
    reopened.close()
    expect(schemaVersion(path)).toBe(6)
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})

it('preserves a project and Catalog job across verified v3→v4→v6 upgrades', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-schema-chain-'))
  const path = join(folder, 'pokeguru.sqlite')
  try {
    const original = new ProjectStore(path)
    const project = original.create({ name: 'Continuità', format: 'STANDARD' })
    original.close()
    const initialCatalog = new CatalogStore(path)
    initialCatalog.startJob('new')
    initialCatalog.close()
    const legacy = new DatabaseSync(path)
    legacy.exec('ALTER TABLE projects DROP COLUMN archived_at; ALTER TABLE catalog_job DROP COLUMN retry_at; PRAGMA user_version = 3')
    legacy.close()

    const v3 = await prepareDatabaseMigration(path)
    expect(v3).toMatchObject({ fromVersion: 3, needsMigration: true })
    expect(existsSync(`${v3.backupPath}.verified`)).toBe(true)
    const archived = new ProjectStore(path)
    expect(archived.get(project.id)?.archivedAt).toBeNull()
    archived.close()
    verifyDatabase(path)
    const v4Marker = new DatabaseSync(path)
    v4Marker.exec('PRAGMA user_version = 4') // The APP-106 release completed before APP-104.
    v4Marker.close()

    const v4 = await prepareDatabaseMigration(path)
    expect(v4).toMatchObject({ fromVersion: 4, needsMigration: true })
    expect(v4.backupPath).not.toBe(v3.backupPath)
    expect(existsSync(`${v4.backupPath}.verified`)).toBe(true)
    const backup = new DatabaseSync(v4.backupPath!, { readOnly: true })
    try {
      const columns = (table: string) => (backup.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
        .map((column) => column.name)
      expect(columns('projects')).toContain('archived_at')
      expect(columns('catalog_job')).not.toContain('retry_at')
    } finally { backup.close() }
    const completedCatalog = new CatalogStore(path)
    expect(completedCatalog.jobStatus()).toMatchObject({ state: 'interrupted', cooldownUntil: null })
    completedCatalog.close()
    completeDatabaseMigration(path, v4)
    expect(schemaVersion(path)).toBe(6)
    const reopened = new ProjectStore(path)
    expect(reopened.get(project.id)?.name).toBe('Continuità')
    reopened.close()
    verifyDatabase(path)
  } finally { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
}, 30_000)

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
