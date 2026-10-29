import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { PassThrough, Writable } from 'node:stream'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { planEvidenceQueriesWithCodex } from '../src/main/codex-evidence-plan'
import { CodexControl } from '../src/main/codex-control'
import { generateMatchup, reviseMatchup, summarizeMatchupContext } from '../src/main/codex-matchup'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import type { AiRunConfig } from '../src/shared/ai'
import type { AiCallKind } from '../src/shared/ai-call-metrics'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { MatchupDiscussion, MatchupTournamentEvidence, MetaSnapshot } from '../src/shared/meta-matchups'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('../src/main/codex-setup', () => ({ codexLauncher: () => ({ command: 'fixture-codex', prefix: [] }) }))

const config: AiRunConfig = { provider: 'codex', source: 'global', model: 'gpt-test', reasoningEffort: 'high' }
const rawUsage = { input_tokens: 100, cached_input_tokens: 25, output_tokens: 10 }
let output = '{invalid JSON', exitCode = 0

// Synthetic subprocess events exercise the real adapters, parsers and SQLite
// accounting. This is deliberately not a live Codex integration test.
beforeEach(() => {
  output = '{invalid JSON'; exitCode = 0
  vi.mocked(spawn).mockImplementation((...parameters: unknown[]) => {
    const args = parameters[1] as string[]
    const resultPath = args[args.indexOf('--output-last-message') + 1]
    const child = Object.assign(new EventEmitter(), { stdin: new Writable({ write(_chunk, _encoding, done) { done() } }),
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true) })
    child.stdin.once('finish', () => queueMicrotask(() => {
      writeFileSync(resultPath, output)
      child.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'fixture-thread' })}\n`)
      child.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: rawUsage })}\n`)
      child.emit('close', exitCode)
    }))
    return child as unknown as ReturnType<typeof spawn>
  })
})
afterEach(() => vi.restoreAllMocks())

async function measuredFailure(kind: AiCallKind,
  execute: (reportUsage: (usage: unknown) => void) => Promise<unknown>): Promise<void> {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-provider-usage-'))
  const file = join(folder, 'data.sqlite'), projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Usage fixture', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'fixture')
  const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
  try {
    await expect(work.run(kind, 'fixture input', config, execute)).rejects.toThrow()
    const totals = jobs.callMetrics(job.id)!.totals
    expect(totals.attempts).toBeGreaterThan(0)
    expect(totals.failed).toBe(totals.attempts)
    expect(totals.usageKnownAttempts).toBe(totals.attempts)
    expect(totals.usage).toEqual({ inputTokens: totals.attempts * 100,
      cachedInputTokens: totals.attempts * 25, outputTokens: totals.attempts * 10 })
    expect(jobs.callAttempts(job.id).every(({ attempt }) => attempt.usage !== null)).toBe(true)
  } finally { work.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
}

it('records planner usage when completed CLI output is not valid JSON', async () => {
  await measuredFailure('planning', (report) => planEvidenceQueriesWithCodex('fixture', config, undefined, undefined, report))
})

it('records observed usage even if the CLI subsequently exits with an error', async () => {
  exitCode = 1
  await measuredFailure('planning', (report) => planEvidenceQueriesWithCodex('fixture', config, undefined, undefined, report))
})

it('records thread usage before JSON decoding or session validation rejects the reply', async () => {
  const control = new CodexControl()
  vi.spyOn(control, 'latestTurnId').mockResolvedValue('fixture-turn')
  await measuredFailure('analysis', (report) => control.jsonTurn(null, tmpdir(), 'fixture', config,
    { type: 'object' }, { onUsage: report }))
})

const opponent = { id: 'opponent', name: 'Fixture', points: 0, share: 0, url: 'https://example.test' }
const snapshot: MetaSnapshot = { id: 'meta', fetchedAt: '2026-10-29', sourceUrl: 'https://example.test',
  period: 'fixture', circuit: 'WESTERN', format: 'STANDARD', decks: [opponent], cached: true }
const sample = { url: null, cards: [] }
const evidence = { status: 'missing', detail: 'Fixture' } as unknown as MatchupTournamentEvidence
const discussion = { projectId: 'project', metaId: 'meta', opponentId: 'opponent', deckHash: 'hash',
  turns: [], summarizedThrough: -1, contextSummary: '' } as unknown as MatchupDiscussion

it.each(['generate', 'revise'] as const)('records %s usage when domain validation rejects empty guide fields', async (mode) => {
  output = JSON.stringify({ strengths: '', weaknesses: '', ourKeyCards: '', theirKeyCards: '',
    opening: '', development: '', closing: '', limitations: '', changeSummary: '' })
  await measuredFailure('analysis', (report) => mode === 'generate'
    ? generateMatchup('project', 'hash', '', snapshot, opponent, sample, config, evidence, undefined, { onUsage: report })
    : reviseMatchup(discussion, 'feedback', '', snapshot, opponent, sample, config, evidence, { onUsage: report }))
})

it('records history usage before the size validator rejects the summary', async () => {
  output = JSON.stringify({ summary: 'x'.repeat(8001) })
  await measuredFailure('history', (report) => summarizeMatchupContext(discussion, 1, config, undefined, report))
})

it('forwards the default batch adapter usage even when no parsed result reaches its validator', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-batch-usage-')), file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Batch usage', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'fixture')
  const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
  try {
    const trace: AiEvidenceQueryTrace = { schemaVersion: 1, engine: { operations: [],
      catalog: { syncedAt: null, expected: 1, indexed: 1, gameplay: 1 }, eventWindow: { from: '', to: '' } },
      requests: [{ query: {}, status: 'ok', data: { matches: [{ printId: 'one', text: 'x'.repeat(130000) }] },
        sourceIds: ['card:one'], fingerprint: 'fixture' }], responseBytes: 130000, durationMs: 0,
      planningRounds: 0, exhausted: false }
    await expect(analyzeLargeEvidence(trace, 'fixture', config, work)).rejects.toThrow()
    const totals = jobs.callMetrics(job.id)!.totals
    expect(totals.usageKnownAttempts).toBe(totals.attempts)
    expect(totals.usage!.inputTokens).toBe(totals.attempts * 100)
  } finally { work.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})
