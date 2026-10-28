import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'

it('persists one active AI job per resource and retains a ready result through reopening', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-ai-jobs-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  let jobs: AiJobStore | null = null
  try {
    const project = projects.create({ name: 'Jobs', format: 'STANDARD' })
    const thread = projects.createDeckThread({ projectId: project.id, title: 'Test' })
    jobs = new AiJobStore(path)
    const started = jobs.start('thread-ask', project.id, thread.id)
    expect(() => jobs!.start('thread-ask', project.id, thread.id)).toThrow()
    jobs.updateProgress(started.id, 'catalog', 'Schede raccolte')
    jobs.updateProgress(started.id, 'analysis', 'Codex elabora', 'Sintesi del passaggio')
    jobs.prepare(started.id, { question: 'Test' })
    jobs.ready(started.id, { answer: 'Result' })
    jobs.close(); jobs = new AiJobStore(path)
    expect(jobs.active(project.id, thread.id)).toMatchObject({ id: started.id, status: 'ready' })
    expect(jobs.latest(project.id, thread.id)?.progress).toMatchObject({ phase: 'analysis',
      summary: 'Sintesi del passaggio', steps: [{ phase: 'catalog' }, { phase: 'analysis' }] })
    expect(jobs.recoverable()[0]).toMatchObject({ request: { question: 'Test' },
      result: { answer: 'Result' } })
    jobs.transition(started.id, 'applied')
    jobs.updateProgress(started.id, 'saving', 'Non deve cambiare')
    expect(jobs.get(started.id)?.progress?.phase).toBe('analysis')
    expect(jobs.active(project.id, thread.id)).toBeNull()
    expect(jobs.get(started.id)).toMatchObject({ status: 'applied', request: null, result: null })
    expect(jobs.recent()).toMatchObject([{ id: started.id, status: 'applied',
      projectId: project.id, resourceId: thread.id }])
    expect('request' in jobs.recent()[0]).toBe(false)
    const damaged = new DatabaseSync(path)
    damaged.prepare('UPDATE ai_jobs SET progress_json = ? WHERE id = ?').run('{"phase":"analysis"}', started.id)
    damaged.close()
    expect(jobs.latest(project.id, thread.id)?.progress).toBeNull()
    const next = jobs.start('thread-propose', project.id, thread.id)
    jobs.updateProgress(next.id, 'planning', 'Ricerche in corso')
    jobs.transition(next.id, 'cancelled')
    jobs.updateProgress(next.id, 'analysis', 'Non deve apparire')
    expect(jobs.get(next.id)?.progress).toMatchObject({ phase: 'planning' })
  } finally { jobs?.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('upgrades an existing job table without losing earlier jobs', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-ai-jobs-old-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  try {
    const project = projects.create({ name: 'Old jobs', format: 'STANDARD' })
    const db = new DatabaseSync(path)
    db.exec(`CREATE TABLE ai_jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL,
      project_id TEXT NOT NULL, resource_id TEXT NOT NULL, status TEXT NOT NULL,
      request_json TEXT, result_json TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, error TEXT) STRICT`)
    db.prepare(`INSERT INTO ai_jobs (id, kind, project_id, resource_id, status, created_at, updated_at)
      VALUES (?, 'matchup-generate', ?, ?, 'applied', ?, ?)`)
      .run('00000000-0000-4000-8000-000000000001', project.id, `matchup:${project.id}`,
        '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z')
    db.close()
    const jobs = new AiJobStore(path)
    expect(jobs.get('00000000-0000-4000-8000-000000000001'))
      .toMatchObject({ status: 'applied', progress: null })
    jobs.close()
  } finally { projects.close(); rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})
