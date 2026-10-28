import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { aiEvidenceForPrompt, runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
import { evidenceHash } from '../src/main/ai-evidence-archive'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import type { AiEvidenceEngine } from '../src/main/ai-evidence-engine'
import type { AiRunConfig } from '../src/shared/ai'

const config: AiRunConfig = { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
function fixture(count: number, bytes: number) {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-archive-pipeline-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Pipeline', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'thread')
  jobs.updateProgress(job.id, 'planning', 'Ricerca')
  let controller = new AbortController()
  let work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, controller.signal)
  let executions = 0
  const engine: AiEvidenceEngine = {
    describe: () => ({ operations: ['catalog.search'], catalog: {
      syncedAt: '2026-10-28', expected: count, indexed: count, gameplay: count },
      eventWindow: { from: '2026-10-01', to: '2026-10-28' } }),
    cardTargets: () => [], eventTargets: () => [],
    execute(input) {
      executions++
      const query = { offset: 0, limit: 1, ...input as object }
      const matches = Array.from({ length: Math.min(query.limit, count - query.offset) }, (_, i) => {
        const index = i + query.offset
        return { printId: `p${index}`, name: `Card ${index}`, sourceUrl: `https://api.tcgdex.net/v2/en/cards/p${index}`,
          comparableGameplay: true, gameplay: { effect: `${index}:` + 'x'.repeat(bytes) } }
      })
      const data = { totalMatches: count, offset: query.offset,
        remaining: Math.max(0, count - query.offset - matches.length), matches }
      return { query, status: 'ok', data, sourceIds: matches.map((m) => `card:${m.printId}`), fingerprint: evidenceHash(data) }
    }
  }
  return { engine, jobs, job, get executions() { return executions }, get work() { return work },
    pause() { controller.abort('pause') },
    reopen() {
      work.close(); jobs.suspend(job.id, 'Pausa di prova'); jobs.resume(job.id)
      controller = new AbortController()
      work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, controller.signal)
    },
    close() { work.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) } }
}
const plan = async () => ({ continueAfterResults: false,
  queries: [{ operation: 'catalog.search', terms: ['draw'], limit: 1 }] })

it('collects more than 64 MB through the application query path while keeping history compact', async () => {
  const f = fixture(70, 1_000_000)
  try {
    const trace = await runAiEvidenceQueries('Ricerca ampia', {}, f.engine, plan, { archive: f.work.archive })
    expect(trace.responseBytes).toBeGreaterThan(64_000_000)
    expect(trace.archive).toMatchObject({ cards: 70, pages: 70, completedSearches: 1 })
    expect(trace.exhausted).toBe(false)
    expect(JSON.stringify(trace).length).toBeLessThan(5000)
    f.reopen()
    await runAiEvidenceQueries('Ricerca ampia', {}, f.engine,
      async () => { throw new Error('Completed planning must be reused') }, { archive: f.work.archive })
    expect(f.executions).toBe(70)
    expect(f.work.archive.readRecord<{ name: string }>('card:p69')?.name).toBe('Card 69')
  } finally { f.close() }
}, 30_000)

it('resumes query and batch checkpoints, retains lineage and delivers original focused cards', async () => {
  const f = fixture(30, 8000)
  try {
    let trace = await runAiEvidenceQueries('Valuta tutte le carte', {}, f.engine, plan, { archive: f.work.archive })
    expect(JSON.stringify(trace)).not.toContain('xxxxxxx')
    const completed = new Set<string>()
    let calls = 0
    const answer = (prompt: string) => {
      const group = JSON.parse(prompt.split('\nDATI: ')[1].split('\nRestituisci')[0]) as {
        sourceIds: string[]; data: { original?: { printId?: string } } }[]
      for (const record of group) if (record.data.original?.printId) {
        expect(completed.has(record.data.original.printId)).toBe(false)
        completed.add(record.data.original.printId)
      }
      return { summary: 'Tutte le carte del lotto sono state considerate.', limitations: 'Campione locale.',
        sourceIds: [...new Set(group.flatMap((r) => r.sourceIds))].slice(0, 64) }
    }
    await expect(analyzeLargeEvidence(trace, 'Valuta tutte le carte', config, f.work, async (prompt) => {
      if (++calls === 2) { f.pause(); throw new Error('interruzione controllata') }
      return answer(prompt)
    })).rejects.toThrow('in pausa')
    expect(completed.size).toBeGreaterThan(0)
    f.reopen()
    trace = await runAiEvidenceQueries('Valuta tutte le carte', {}, f.engine,
      async () => { throw new Error('Plan replay') }, { archive: f.work.archive })
    await analyzeLargeEvidence(trace, 'Valuta tutte le carte', config, f.work, async (prompt) => answer(prompt))
    expect(f.executions).toBe(30)
    expect(completed.size).toBe(30)
    expect(trace.analysis).toMatchObject({ sourceCount: 30, records: 31 })
    const lineage = [...f.work.archive.values<{ inputRecords: string[] }>(`analysis:${trace.analysis!.generation}`)]
    expect(lineage.flatMap((entry) => entry.value.inputRecords)).toContain('card:p29')
    expect(trace.references?.some((source) => source.id === 'card:p29')).toBe(true)
    trace.focusedPrintIds = ['p29']
    expect(aiEvidenceForPrompt(trace)).toMatchObject({ focusedCards: [{ printId: 'p29', name: 'Card 29' }] })
    expect(f.jobs.diagnostics(f.job.id)?.cacheHits).toBeGreaterThan(0)
  } finally { f.close() }
})

it('includes originals in a small final prompt while persisting only the compact trace', async () => {
  const f = fixture(1, 1000)
  try {
    const trace = await runAiEvidenceQueries('Una carta', {}, f.engine, plan, { archive: f.work.archive })
    await analyzeLargeEvidence(trace, 'Una carta', config, f.work,
      async () => { throw new Error('Small evidence does not need a synthesis call') })
    expect(trace.analysis).toBeUndefined()
    expect(JSON.stringify(trace)).not.toContain('xxxxxxx')
    expect(aiEvidenceForPrompt(trace)).toMatchObject({ requests: [
      { data: { matches: [{ printId: 'p0', name: 'Card 0' }] } }] })
    expect(trace.references).toEqual([expect.objectContaining({ id: 'card:p0', label: 'Card 0' })])
  } finally { f.close() }
})

it('plans from actual discoveries beyond 24 productive rounds and replays the persisted progress', async () => {
  const f = fixture(30, 10)
  try {
    f.engine.execute = (input) => {
      const id = (input as { printIds: string[] }).printIds[0]
      const data = { totalMatches: 1, offset: 0, remaining: 0,
        matches: [{ printId: id, name: `Discover ${id}`, comparableGameplay: true }] }
      return { query: input, data, status: 'ok', sourceIds: [`card:${id}`], fingerprint: evidenceHash(data) }
    }
    let calls = 0
    const trace = await runAiEvidenceQueries('Esamina tutti gli aspetti', {}, f.engine, async (prompt) => {
      if (calls) expect(prompt).toContain(`Discover p${calls - 1}`)
      if (calls === 30) { calls++; return { queries: [], continueAfterResults: false } }
      const query = { operation: 'catalog.search', printIds: [`p${calls++}`] }
      return { queries: [query], continueAfterResults: calls < 30 }
    }, { archive: f.work.archive })
    expect(trace.planningRounds).toBe(31)
    expect(trace.archive?.cards).toBe(30)
    expect(trace.exhausted).toBe(false)
    f.reopen()
    const resumed = await runAiEvidenceQueries('Esamina tutti gli aspetti', {}, f.engine,
      async () => { throw new Error('Do not replan') }, { archive: f.work.archive })
    expect(resumed.planningRounds).toBe(31)
    expect(calls).toBe(31)
  } finally { f.close() }
})

it('stops repeated planning without new evidence and keeps that finding across reopen', async () => {
  const f = fixture(1, 10)
  let calls = 0
  const repeat = async () => { calls++; return { queries: [{ operation: 'catalog.search', printIds: ['p0'] }], continueAfterResults: true } }
  try {
    await expect(runAiEvidenceQueries('Valuta', {}, f.engine, repeat, { archive: f.work.archive }))
      .rejects.toMatchObject({ code: 'no-progress' })
    expect(calls).toBe(4)
    expect(f.executions).toBe(1)
    f.reopen()
    await expect(runAiEvidenceQueries('Valuta', {}, f.engine, repeat, { archive: f.work.archive }))
      .rejects.toMatchObject({ code: 'no-progress' })
    expect(calls).toBe(4)
    expect(f.work.archive.counts().cards).toBe(1)
  } finally { f.close() }
})
