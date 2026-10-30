import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, readAiWorkflow } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', source: 'global', model: null, reasoningEffort: null }
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-ai-inputs-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Input', format: 'STANDARD' })
  const job = jobs.start('matchup-generate', project.id, `matchup:${project.id}`), directory = join(folder, job.id)
  let controller = new AbortController()
  let work = new AiAnalysisWork(directory, jobs, job.id, controller.signal)
  return { directory, job, jobs, projects, project, get work() { return work }, get controller() { return controller },
    reopen() { work.close(); jobs.suspend(job.id, 'Interruzione'); jobs.resume(job.id); controller = new AbortController()
      work = new AiAnalysisWork(directory, jobs, job.id, controller.signal) },
    close() { work.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}

it('keeps completed preparation stages across a pause and never commits an interrupted stage', async () => {
  const f = fixture()
  try {
    const initial = { meta: 'old-meta', baseline: 'old-list', date: '2026-10-28', correction: 'old-print' }
    f.work.snapshot('selection', [], () => initial)
    await f.work.snapshotAsync('history', async () => ({ summary: 'Original discussion', through: 5 }))
    let release!: (value: string) => void
    const partial = f.work.snapshotAsync('sample', () => new Promise<string>((resolve) => { release = resolve }))
    f.controller.abort('pause'); release('old incomplete network response')
    await expect(partial).rejects.toThrow(/pausa/)
    expect(f.work.archive.value('input', 'sample')).toBeUndefined()
    f.reopen()
    expect(f.work.snapshot('selection', ['changed'], () => ({ meta: 'new-meta' }))).toEqual(initial)
    expect(await f.work.snapshotAsync('history', async () => { throw new Error('Completed work repeated') }))
      .toEqual({ summary: 'Original discussion', through: 5 })
    expect(await f.work.snapshotAsync('sample', async () => 'complete response')).toBe('complete response')
    f.reopen()
    expect(await f.work.snapshotAsync('sample', async () => { throw new Error('Network repeated') })).toBe('complete response')
    const other = f.jobs.start('matchup-generate', f.project.id, 'another-resource')
    const separate = new AiAnalysisWork(join(f.directory, 'other'), f.jobs, other.id, new AbortController().signal)
    try { expect(separate.snapshot('selection', [], () => 'own input')).toBe('own input') }
    finally { separate.close() }
  } finally { f.close() }
})

it('reads v0.3.4 workflow and compatible call checkpoints without overwriting their payloads', async () => {
  const f = fixture()
  try {
    mkdirSync(f.directory, { recursive: true })
    const legacy = { kind: 'matchup-generate', args: [f.project.id, 'original-meta', '123', null] }
    writeFileSync(join(f.directory, 'workflow.json'), JSON.stringify(legacy))
    const digest = createHash('sha256').update(JSON.stringify(['planning', 'same prompt', config])).digest('hex')
    writeFileSync(join(f.directory, `call-${digest}.json`), JSON.stringify({ queries: [], continueAfterResults: false }))
    f.reopen()
    expect(readAiWorkflow(f.directory)).toEqual(legacy)
    expect(await f.work.run('planning', 'same prompt', config, async () => { throw new Error('Compatible call repeated') }))
      .toEqual({ queries: [], continueAfterResults: false })
    expect(await f.work.run('planning', 'changed prompt', config, async () => 'new call')).toBe('new call')
  } finally { f.close() }
})

it('recovers the original workflow from SQLite when temporary job files are absent', () => {
  const f = fixture()
  try {
    f.work.close()
    const input = { kind: 'matchup-generate' as const, args: [f.project.id, 'meta', '123', null] }
    const started = new AiAnalysisWork(f.directory, f.jobs, f.job.id, f.controller.signal, input)
    started.close()
    unlinkSync(join(f.directory, 'workflow.json'))
    expect(readAiWorkflow(f.directory, f.jobs, f.job.id)).toEqual({ ...input, schemaVersion: 4 })
  } finally { f.close() }
})
