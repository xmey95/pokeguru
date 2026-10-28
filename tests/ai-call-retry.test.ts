import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runRecoverableAiCall, type AiCallState } from '../src/main/ai-call-retry'
import { AiFailure, aiFailureCode } from '../src/main/ai-failure'
import { codexErrorEvent, codexFailure } from '../src/main/codex-failure'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'

it('persists quota deadline and attempt budget across a paused wait and database reopen', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-retry-')), path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  let jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Retry', format: 'STANDARD' })
    const job = jobs.start('thread-ask', project.id, 'thread')
    const journal = { read: () => jobs.callState(job.id, 'quota'), write: (state: AiCallState) => jobs.saveCallState(job.id, 'quota', state) }
    let now = 1000, calls = 0
    const execute = async () => { calls++; throw new AiFailure('quota', 'Limite temporaneo', 90_000) }
    const controller = new AbortController()
    await expect(runRecoverableAiCall(execute, journal, { signal: controller.signal, now: () => now,
      wait: async (ms) => { expect(ms).toBe(30_000); now += 5000; controller.abort('pause'); throw new Error('AbortError') } }))
      .rejects.toMatchObject({ code: 'paused' })
    expect(calls).toBe(1)
    expect(journal.read()).toMatchObject({ status: 'waiting', failures: 1, nextAttemptAt: 91_000 })
    jobs.close(); jobs = new AiJobStore(path)
    const delays: number[] = []
    await expect(runRecoverableAiCall(execute, journal, { signal: new AbortController().signal, now: () => now,
      wait: async (ms) => { delays.push(ms); now += ms } })).rejects.toMatchObject({ code: 'quota' })
    expect(delays.reduce((sum, ms) => sum + ms, 0)).toBe(175_000)
    expect(calls).toBe(3)
    expect(journal.read()).toMatchObject({ status: 'blocked', failures: 3 })
    await expect(runRecoverableAiCall(execute, journal, { signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'quota' })
    expect(calls).toBe(3)
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it.each(['context-limit', 'storage-full', 'auth'] as const)('never repeats an unchanged structural failure: %s', async (code) => {
  let state: AiCallState | undefined, calls = 0
  const journal = { read: () => state, write: (value: AiCallState) => { state = value } }
  for (let reopen = 0; reopen < 2; reopen++) await expect(runRecoverableAiCall(async () => {
    calls++; throw new AiFailure(code, 'richiede intervento')
  }, journal, { signal: new AbortController().signal, wait: async () => { throw new Error('must not wait') } }))
    .rejects.toMatchObject({ code })
  expect(calls).toBe(1)
})

it('recovers transient failures within the budget and does not count a user pause as failure', async () => {
  let state: AiCallState | undefined, calls = 0, now = 0
  const journal = { read: () => state, write: (value: AiCallState) => { state = value } }
  expect(await runRecoverableAiCall(async () => {
    if (++calls < 3) throw new AiFailure('network', 'rete')
    return 'completato'
  }, journal, { signal: new AbortController().signal, now: () => now, wait: async (ms) => { now += ms } })).toBe('completato')
  expect(now).toBe(3000)
  expect(state).toMatchObject({ failures: 2, status: 'complete' })
  state = undefined
  const controller = new AbortController()
  await expect(runRecoverableAiCall(async () => { controller.abort('pause'); throw new Error('interrupted') }, journal,
    { signal: controller.signal })).rejects.toMatchObject({ code: 'paused' })
  expect(state).toMatchObject({ failures: 0, status: 'running' })
})

it('classifies provider failures without leaking raw messages or confusing context with disk limits', () => {
  const raw = codexErrorEvent(JSON.stringify({ type: 'turn.failed', error: { message: 'maximum context length: PRIVATE CONTENT' } }))
  expect(codexFailure(raw)).toMatchObject({ code: 'context-limit' })
  expect(codexFailure(raw).message).not.toContain('PRIVATE')
  expect(codexErrorEvent(JSON.stringify({ type: 'item.completed', message: 'quota' }))).toBe('')
  expect(codexFailure('429 rate limit; retry-after: 45')).toMatchObject({ code: 'quota', retryAfterMs: 45_000 })
  expect(aiFailureCode(new Error('SQLITE_FULL: database or disk is full'))).toBe('storage-full')
  expect(codexFailure('Not logged in')).toMatchObject({ code: 'auth' })
})
