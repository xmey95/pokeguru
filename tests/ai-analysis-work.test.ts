import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence, readAiWorkflow } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { aiEvidenceForPrompt } from '../src/main/ai-evidence-queries'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
function trace(): AiEvidenceQueryTrace {
  const matches = Array.from({ length: 60 }, (_, index) => ({ printId: `card-${index}`,
    name: `Card ${index}`, gameplay: { effect: 'rule '.repeat(1500) } }))
  const requests = [{ query: { operation: 'catalog.search' }, status: 'ok' as const,
    data: { matches }, sourceIds: matches.map((card) => `card:${card.printId}`), fingerprint: 'fixture' }]
  return { schemaVersion: 1, requests, responseBytes: Buffer.byteLength(JSON.stringify(requests)),
    durationMs: 0, planningRounds: 1, exhausted: false, engine: { operations: [],
      catalog: { syncedAt: null, expected: 60, indexed: 60, gameplay: 60 },
      eventWindow: { from: '2026-10-01', to: '2026-10-28' } } }
}
function records(prompt: string): { sourceIds: string[]; data: { printId?: string } }[] {
  return JSON.parse(prompt.split('\nDATI: ')[1].split('\nRestituisci')[0])
}
function answer(prompt: string) {
  return { summary: 'Sintesi prudente dei record ricevuti.', limitations: 'Evidenze locali, non winrate.',
    sourceIds: [...new Set(records(prompt).flatMap((record) => record.sourceIds))].slice(0, 64) }
}

it('analyzes every record beyond the former budget and resumes completed batches after reopening', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-batches-'))
  const path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  let jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Large', format: 'STANDARD' })
    const job = jobs.start('thread-ask', project.id, 'thread')
    jobs.updateProgress(job.id, 'analysis', 'Lotti')
    const controller = new AbortController()
    const directory = join(folder, job.id)
    const work = new AiAnalysisWork(directory, jobs, job.id, controller.signal,
      { kind: 'thread-ask', args: [project.id, 'thread', 'Domanda privata'] })
    const input = trace()
    expect(input.responseBytes).toBeGreaterThan(240_000)
    let calls = 0
    const completed = new Set<string>()
    await expect(analyzeLargeEvidence(input, 'Analizza tutto', config, work, async (prompt) => {
      if (++calls === 3) { controller.abort('pause'); throw new Error('interruzione controllata') }
      for (const record of records(prompt)) if (record.data.printId) completed.add(record.data.printId)
      return answer(prompt)
    })).rejects.toThrow('interruzione')
    const before = new Set(completed)
    expect(before.size).toBeGreaterThan(0)
    expect(before.size).toBeLessThan(60)
    jobs.suspend(job.id, 'Pausa di prova')
    expect(() => jobs.start('thread-ask', project.id, 'thread')).toThrow(/Riprendi/)
    work.close()
    jobs.close(); jobs = new AiJobStore(path)
    expect(jobs.get(job.id)?.progress?.diagnostics?.resumable).toBe(true)
    expect(readAiWorkflow(directory)?.args[2]).toBe('Domanda privata')
    jobs.resume(job.id)
    const resumed = new AiAnalysisWork(directory, jobs, job.id, new AbortController().signal)
    await analyzeLargeEvidence(input, 'Analizza tutto', config, resumed, async (prompt) => {
      for (const record of records(prompt)) if (record.data.printId) {
        expect(before.has(record.data.printId)).toBe(false)
        completed.add(record.data.printId)
      }
      return answer(prompt)
    })
    expect(completed.size).toBe(60)
    expect(input.analysis).toMatchObject({ records: 60, sourceCount: 60 })
    expect(input.requests[0].sourceIds).toHaveLength(60)
    expect(JSON.stringify(aiEvidenceForPrompt(input))).not.toContain('rule rule')
    input.focusedPrintIds = ['card-59']
    expect(aiEvidenceForPrompt(input)).toMatchObject({ focusedCards: [{ printId: 'card-59' }] })
    expect(jobs.get(job.id)?.progress?.diagnostics?.cacheHits).toBe(2)
    expect(jobs.get(job.id)?.progress?.diagnostics?.batchesCompleted).toBe(input.analysis?.batches)
    resumed.close()
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it('does not cache invalid citations and separates jobs and changed model inputs', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-batch-sources-'))
  const projects = new ProjectStore(join(folder, 'data.sqlite'))
  const jobs = new AiJobStore(join(folder, 'data.sqlite'))
  try {
    const project = projects.create({ name: 'Sources', format: 'STANDARD' })
    const job = jobs.start('thread-ask', project.id, 'thread')
    const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
    await expect(analyzeLargeEvidence(trace(), 'Tutto', config, work,
      async () => ({ summary: 'Inventata', limitations: '', sourceIds: ['foreign-source'] })))
      .rejects.toThrow('non verificabile')
    let calls = 0
    await analyzeLargeEvidence(trace(), 'Tutto', config, work, async (prompt) => { calls++; return answer(prompt) })
    expect(calls).toBeGreaterThan(1)
    const other = jobs.start('thread-ask', project.id, 'other-thread')
    const isolated = new AiAnalysisWork(join(folder, other.id), jobs, other.id, new AbortController().signal)
    expect(await isolated.run('planning', 'same', config, async () => 1)).toBe(1)
    expect(await work.run('planning', 'same', config, async () => 2)).toBe(2)
    expect(await work.run('planning', 'same', { ...config, model: 'gpt-test' }, async () => 3)).toBe(3)
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
