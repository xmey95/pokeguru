import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    jobs.prepare(started.id, { question: 'Test' })
    jobs.ready(started.id, { answer: 'Result' })
    jobs.close(); jobs = new AiJobStore(path)
    expect(jobs.active(project.id, thread.id)).toMatchObject({ id: started.id, status: 'ready' })
    expect(jobs.recoverable()[0]).toMatchObject({ request: { question: 'Test' },
      result: { answer: 'Result' } })
    jobs.transition(started.id, 'applied')
    expect(jobs.active(project.id, thread.id)).toBeNull()
    expect(jobs.get(started.id)).toMatchObject({ status: 'applied', request: null, result: null })
    expect(jobs.recent()).toMatchObject([{ id: started.id, status: 'applied',
      projectId: project.id, resourceId: thread.id }])
    expect('request' in jobs.recent()[0]).toBe(false)
    expect(jobs.start('thread-propose', project.id, thread.id).status).toBe('running')
  } finally { jobs?.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
