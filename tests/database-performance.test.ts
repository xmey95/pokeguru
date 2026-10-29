import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { CatalogStore } from '../src/main/catalog'
import { TournamentStore } from '../src/main/tournament-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive, collectUnusedEvidence } from '../src/main/ai-evidence-archive'

// Opt-in, real SQLite. No user data, model, network, or wall-time assertions.
it.skipIf(process.env.POKEGURU_DB_PERF !== '1')('audits query plans and scaled database paths', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-db-perf-'))
  const path = join(folder, 'audit.sqlite')
  const projects = new ProjectStore(path), catalog = new CatalogStore(path)
  const events = new TournamentStore(path), jobs = new AiJobStore(path)
  const db = new DatabaseSync(path)
  let archive: AiEvidenceArchive | undefined
  try {
    const project = projects.create({ name: 'Synthetic audit', format: 'STANDARD' })
    const owner = jobs.start('thread-ask', project.id, 'resource')
    archive = new AiEvidenceArchive(path, owner)
    const n = 12_000, at = '2026-10-29T00:00:00Z'
    const addJob = db.prepare(`INSERT INTO ai_jobs
      (id, kind, project_id, resource_id, status, created_at, updated_at)
      VALUES (?, 'thread-ask', ?, ?, 'applied', ?, ?)`)
    const addActivity = db.prepare(`INSERT INTO ai_job_activity(job_id, phase, detail, at)
      VALUES (?, 'collecting', 'Fixture', ?)`)
    const body = Buffer.from('{}'), hash = createHash('sha256').update(body).digest('hex')
    db.prepare('INSERT OR IGNORE INTO ai_evidence_objects VALUES (?, ?)').run(hash, body.length)
    db.prepare('INSERT OR IGNORE INTO ai_evidence_chunks VALUES (?, 0, ?)').run(hash, gzipSync(body))
    const addRecord = db.prepare('INSERT INTO ai_evidence_records VALUES (?, ?, ?, ?, NULL, ?)')
    const addSearch = db.prepare('INSERT INTO ai_evidence_searches VALUES (?, ?, ?, NULL, 0, 0)')
    const addPage = db.prepare('INSERT INTO ai_evidence_pages VALUES (?, ?, ?, ?, ?, ?)')
    const addValue = db.prepare('INSERT INTO ai_evidence_values VALUES (?, ?, ?, ?)')
    const addEvent = db.prepare('INSERT INTO ai_evidence_event_index VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    db.exec('BEGIN')
    for (let i = 0; i < n; i++) {
      const key = String(i).padStart(6, '0')
      addJob.run(`job-${key}`, project.id, `resource-${i % 200}`, at, at)
      addActivity.run(owner.id, at)
      addRecord.run(owner.id, key, i % 2 ? 'card' : 'occurrence', key, hash)
      addValue.run(owner.id, 'audit', key, hash)
      addEvent.run(owner.id, key, `deck-${i % 500}`, '2026-10-20', i % 7 ? i : null,
        'Fixture', 'fixture', 'fixture card', hash)
      if (i < 2000) addSearch.run(owner.id, key, '{}')
      addPage.run(owner.id, '000000', key, i, key, hash)
    }
    db.exec('COMMIT')
    const metrics: Record<string, number> = {}
    const measure = (name: string, action: () => void) => {
      const start = performance.now(); action(); metrics[name] = +(performance.now() - start).toFixed(2)
    }
    measure('latestJob500', () => { for (let i = 0; i < 500; i++) jobs.latest(project.id, 'resource-100') })
    measure('activityDeep200', () => { for (let i = 0; i < 200; i++) jobs.activity(project.id, owner.resourceId, owner.id, 1000) })
    measure('records6000', () => expect([...archive!.records('card')]).toHaveLength(6000))
    measure('values12000', () => expect([...archive!.values('audit')]).toHaveLength(n))
    measure('eventPages200', () => {
      for (let i = 0; i < 200; i++) expect(archive!.eventPage({ from: '2026-10-01', to: '2026-10-29',
        deck: '', card: '', offset: i * 50, limit: 50 }).rows).toHaveLength(50)
    })
    measure('lastPage500', () => {
      const query = db.prepare('SELECT object_hash FROM ai_evidence_pages WHERE job_id = ? AND search_key = ? ORDER BY sequence DESC LIMIT 1')
      for (let i = 0; i < 500; i++) query.get(owner.id, '000000')
    })
    const plan = (sql: string, ...args: SQLInputValue[]) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args)
    const plans = {
      latest: plan('SELECT id FROM ai_jobs WHERE project_id = ? AND resource_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', project.id, 'resource-100'),
      lastPage: plan('SELECT object_hash FROM ai_evidence_pages WHERE job_id = ? AND search_key = ? ORDER BY sequence DESC LIMIT 1', owner.id, '000000'),
      events: plan(`SELECT object_hash FROM ai_evidence_event_index WHERE job_id = ? AND date >= ? AND date <= ?
        ORDER BY date DESC, placing IS NULL, placing, key LIMIT 50`, owner.id, '2026-10-01', '2026-10-29'),
      recovery: plan("SELECT 1 FROM matchup_turns WHERE json_extract(report_payload, '$.jobId') = ? LIMIT 1", owner.id)
    }
    const missingForeignKeyIndexes: string[] = []
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    for (const { name } of tables) {
      const keys = db.prepare(`PRAGMA foreign_key_list("${name}")`).all() as { id: number; seq: number; from: string }[]
      const indexes = db.prepare(`PRAGMA index_list("${name}")`).all() as { name: string; partial: number }[]
      const indexed = indexes.filter((i) => !i.partial).map((i) =>
        (db.prepare(`PRAGMA index_info("${i.name}")`).all() as { name: string }[]).map((c) => c.name))
      for (const id of new Set(keys.map((k) => k.id))) {
        const columns = keys.filter((k) => k.id === id).sort((a, b) => a.seq - b.seq).map((k) => k.from)
        if (!indexed.some((index) => columns.every((c, i) => c === index[i]))) missingForeignKeyIndexes.push(`${name}(${columns.join(',')})`)
      }
    }
    // Leave 2k unreachable objects: exercises reverse FK checks during collection.
    db.exec('BEGIN')
    const addObject = db.prepare('INSERT INTO ai_evidence_objects VALUES (?, 2)')
    for (let i = 0; i < 2000; i++) addObject.run(`unreachable-${i}`)
    db.exec('COMMIT')
    measure('collect2000', () => expect(collectUnusedEvidence(db)).toBe(2000))
    const result = { node: process.version, sqlite: db.prepare('SELECT sqlite_version() AS version').get(),
      fixture: { jobs: n, records: n, pages: n, events: n }, metrics, plans, missingForeignKeyIndexes,
      bytes: Number(db.prepare('PRAGMA page_count').get()!.page_count) * Number(db.prepare('PRAGMA page_size').get()!.page_size) }
    console.log(JSON.stringify(result, null, 2))
    if (process.env.POKEGURU_DB_PERF_OUTPUT) writeFileSync(process.env.POKEGURU_DB_PERF_OUTPUT, JSON.stringify(result, null, 2))
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    archive?.close(); db.close(); jobs.close(); events.close(); catalog.close(); projects.close()
    rmSync(folder, { recursive: true, force: true })
  }
}, 120_000)
