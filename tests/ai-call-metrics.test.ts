import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { AiFailure } from '../src/main/ai-failure'
import type { AiRunConfig } from '../src/shared/ai'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'

const config: AiRunConfig = { provider: 'codex', source: 'global', model: 'gpt-test', reasoningEffort: 'high' }
const usage = { input_tokens: 100, cached_input_tokens: 25, output_tokens: 10 }

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'pokeguru-call-metrics-'))
  const path = join(directory, 'data.sqlite')
  const projects = new ProjectStore(path)
  let jobs = new AiJobStore(path)
  const project = projects.create({ name: 'PRIVATE-PROJECT', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'PRIVATE-THREAD')
  const controller = new AbortController()
  let work = new AiAnalysisWork(join(directory, job.id), jobs, job.id, controller.signal)
  return { job, controller, get work() { return work }, get jobs() { return jobs },
    reopen() {
      work.close(); jobs.close(); jobs = new AiJobStore(path)
      work = new AiAnalysisWork(join(directory, job.id), jobs, job.id, new AbortController().signal)
    },
    close() { work.close(); jobs.close(); projects.close(); rmSync(directory, { recursive: true, force: true }) } }
}

it('keeps all attempts and phase totals beyond 40, reopens without charging cached replies again', async () => {
  const f = fixture()
  try {
    for (let index = 0; index < 45; index++) await f.work.run('batch', `PRIVATE-PROMPT-${index}`, config,
      async () => ({ __usage: usage, value: index }))
    expect(f.jobs.diagnostics(f.job.id)?.calls).toHaveLength(40)
    expect(f.jobs.callMetrics(f.job.id)?.totals).toMatchObject({ attempts: 45, succeeded: 45,
      usageKnownAttempts: 45, usage: { inputTokens: 4500, cachedInputTokens: 1125, outputTokens: 450 } })
    const first = f.jobs.callAttempts(f.job.id, '', 20)
    expect(first).toHaveLength(20)
    expect(f.jobs.callAttempts(f.job.id, first.at(-1)!.key)).toHaveLength(25)
    expect(first[0].attempt).toMatchObject({ requested: { model: 'gpt-test', reasoningEffort: 'high' },
      effective: { model: null, reasoningEffort: null } })
    f.reopen()
    for (let index = 0; index < 45; index++) await f.work.run('batch', `PRIVATE-PROMPT-${index}`, config,
      async () => { throw new Error('Must use the durable cache') })
    const metrics = f.jobs.callMetrics(f.job.id)!
    expect(metrics.totals).toMatchObject({ attempts: 45, cacheHits: 45, running: 0,
      usage: { inputTokens: 4500, cachedInputTokens: 1125, outputTokens: 450 } })
    expect(metrics.phases.batch).toEqual(metrics.totals)
    expect(JSON.stringify(metrics)).not.toContain('PRIVATE')
    expect(JSON.stringify(f.jobs.diagnostics(f.job.id)).length).toBeLessThan(15000)
  } finally { f.close() }
})

it('counts retries separately, preserves observed usage before validation, and separates waits from execution', async () => {
  const f = fixture()
  try {
    let attempts = 0
    const value = await f.work.run('planning', 'retry', config, async (reportUsage) => {
      if (++attempts === 1) { reportUsage(usage); throw new AiFailure('network', 'PRIVATE-FAILURE', 35) }
      return { queries: [] }
    })
    expect(value).toEqual({ queries: [] })
    const metrics = f.jobs.callMetrics(f.job.id)!
    expect(metrics.totals).toMatchObject({ attempts: 2, failed: 1, succeeded: 1, usageKnownAttempts: 1,
      usage: null, observedUsage: { inputTokens: 100, cachedInputTokens: 25, outputTokens: 10 } })
    expect(metrics.totals.waitingMs).toBeGreaterThanOrEqual(20)
    const records = f.jobs.callAttempts(f.job.id).map((entry) => entry.attempt)
    expect(metrics.totals.executionMs).toBe(records.reduce((sum, attempt) => sum + attempt.executionMs!, 0))
    expect(records.find((attempt) => attempt.status === 'succeeded')!.usage).toBeNull()
    await f.work.run('history', 'history', config, async (reportUsage) => { reportUsage(usage); return 'summary' })
    expect(f.jobs.callMetrics(f.job.id)?.phases.history).toMatchObject({ attempts: 1, succeeded: 1,
      usage: { inputTokens: 100, cachedInputTokens: 25, outputTokens: 10 } })
  } finally { f.close() }
})

it('publishes cache and attempt once, recovers an unfinished invocation without fabricating its duration', async () => {
  const f = fixture()
  try {
    const completed = f.jobs.beginCallAttempt(f.job.id, 'completed', 'analysis', 10, config)
    f.jobs.recordCallUsage(f.job.id, completed, usage)
    f.jobs.finishCallAttempt(f.job.id, completed, 'succeeded', 11, { key: 'completed', value: 'saved' })
    f.jobs.finishCallAttempt(f.job.id, completed, 'succeeded', 999, { key: 'completed', value: 'duplicate' })
    expect(f.jobs.callResult(f.job.id, 'completed')?.value).toBe('saved')
    const unfinished = f.jobs.beginCallAttempt(f.job.id, 'unfinished', 'analysis', 20, config)
    f.jobs.recordCallUsage(f.job.id, unfinished, usage)
    f.reopen(); f.jobs.recoverCallMetrics(f.job.id)
    expect(f.jobs.callMetrics(f.job.id)?.totals).toMatchObject({ attempts: 2, succeeded: 1,
      interrupted: 1, running: 0, executionMs: null, incompleteTimingAttempts: 1, observedExecutionMs: 11,
      usage: { inputTokens: 200, cachedInputTokens: 50, outputTokens: 20 } })
    expect(f.jobs.callAttempts(f.job.id).find((entry) => entry.key === unfinished)?.attempt)
      .toMatchObject({ status: 'interrupted', endedAt: null, executionMs: null })
  } finally { f.close() }
})

it('records a paused invocation as interrupted and retains the observed provider usage', async () => {
  const f = fixture()
  try {
    await expect(f.work.run('analysis', 'pause', config, async (reportUsage) => {
      reportUsage(usage); f.controller.abort('pause'); throw new Error('aborted')
    })).rejects.toMatchObject({ code: 'paused' })
    expect(f.jobs.callMetrics(f.job.id)?.totals).toMatchObject({ attempts: 1, interrupted: 1,
      failed: 0, usageKnownAttempts: 1 })
    f.reopen()
    expect(f.jobs.callMetrics(f.job.id)?.totals.attempts).toBe(1)
  } finally { f.close() }
})

it('corrects measured prompt bytes, keeps repeated usage callbacks idempotent, and isolates job journals', async () => {
  const f = fixture()
  try {
    await f.work.run('analysis', 'short cache signature', config, async (reportUsage) => {
      f.work.promptBytes(1234)
      reportUsage(usage); reportUsage(usage)
      return { report: { promptAudit: { usage } } }
    })
    const metrics = f.jobs.callMetrics(f.job.id)!
    expect(metrics.totals).toMatchObject({ inputBytes: 1234, attempts: 1, usageKnownAttempts: 1,
      usage: { inputTokens: 100, cachedInputTokens: 25, outputTokens: 10 } })
    expect(f.jobs.callAttempts(f.job.id)[0].attempt.inputBytes).toBe(1234)
    const other = f.jobs.start('thread-ask', f.job.projectId, 'other-private-thread')
    expect(f.jobs.callAttempts(other.id)).toEqual([])
    expect(f.jobs.callMetrics(other.id)).toBeUndefined()
    f.jobs.saveCallState(f.job.id, 'blocked-call', { status: 'blocked', failures: 3, code: 'network' })
    f.jobs.suspend(f.job.id, 'retry')
    f.jobs.retryAfterIntervention(f.job.id)
    expect(f.jobs.callState(f.job.id, 'blocked-call')).toBeUndefined()
    expect(f.jobs.callMetrics(f.job.id)).toEqual(metrics)
    expect(f.jobs.callAttempts(f.job.id)).toHaveLength(1)
  } finally { f.close() }
})

it('accounts for a recovered subtree in one batch without counting invocations or historical tokens', async () => {
  const f = fixture()
  try {
    // A legacy subtree can have no instrumented invocation at all.
    f.work.reuse('batch', 187)
    f.work.reuse('synthesis', 9)
    f.work.reuse('batch', 0)
    expect(() => f.work.reuse('batch', -1)).toThrow('Conteggio riuso')
    expect(f.jobs.callMetrics(f.job.id)).toMatchObject({ coverage: 'recorded-attempts',
      totals: { attempts: 0, cacheHits: 196, usage: null, observedUsage: null },
      phases: { batch: { attempts: 0, cacheHits: 187 }, synthesis: { attempts: 0, cacheHits: 9 } } })
    expect(f.jobs.diagnostics(f.job.id)?.cacheHits).toBe(196)
    expect(f.jobs.callAttempts(f.job.id)).toEqual([])
    f.reopen()
    expect(f.jobs.callMetrics(f.job.id)?.totals).toMatchObject({ attempts: 0, cacheHits: 196, usage: null })
  } finally { f.close() }
})

it('reads an uninstrumented legacy call cache without treating its old token envelope as new consumption', async () => {
  const f = fixture()
  try {
    const prompt = 'legacy prompt'
    const key = createHash('sha256').update(JSON.stringify(['planning', prompt, config])).digest('hex')
    f.jobs.saveCallResult(f.job.id, key, { queries: [], __usage: usage })
    f.jobs.recordDiagnostics(f.job.id, { cacheHits: 8 })
    f.reopen()
    expect(f.jobs.callMetrics(f.job.id)).toBeUndefined()
    expect(await f.work.run('planning', prompt, config, async () => { throw new Error('No new call') }))
      .toMatchObject({ queries: [], __usage: usage })
    expect(f.jobs.callMetrics(f.job.id)?.totals).toMatchObject({ attempts: 0, cacheHits: 1,
      usage: null, observedUsage: null, executionMs: null })
    expect(f.jobs.diagnostics(f.job.id)?.cacheHits).toBe(9)
    expect(f.jobs.callAttempts(f.job.id)).toEqual([])
  } finally { f.close() }
})

it('captures batch usage before the summary validator drops the provider envelope', async () => {
  const f = fixture()
  try {
    const matches = [0, 1, 2].map((index) => ({ printId: `p${index}`, effect: 'x'.repeat(45000) }))
    const trace: AiEvidenceQueryTrace = { schemaVersion: 1, engine: { operations: [],
      catalog: { syncedAt: null, expected: 3, indexed: 3, gameplay: 3 }, eventWindow: { from: '', to: '' } },
      requests: [{ query: {}, status: 'ok', data: { matches }, sourceIds: ['card:p0', 'card:p1', 'card:p2'], fingerprint: 'test' }],
      responseBytes: 140000, durationMs: 0, planningRounds: 0, exhausted: false }
    await analyzeLargeEvidence(trace, 'Question', config, f.work, async () => ({ summary: 'Summary', limitations: '',
      sourceIds: [], __usage: usage }))
    const metrics = f.jobs.callMetrics(f.job.id)!
    expect(metrics.totals.attempts).toBeGreaterThan(1)
    expect(metrics.totals.usageKnownAttempts).toBe(metrics.totals.attempts)
    expect(metrics.totals.usage!.inputTokens).toBe(metrics.totals.attempts * 100)
    expect(trace.analysis).not.toHaveProperty('__usage')
  } finally { f.close() }
})
