import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { bindEvidenceArchive } from '../src/main/ai-evidence-access'
import { aiEvidenceForPrompt } from '../src/main/ai-evidence-queries'
import type { AiEvidenceQueryTrace, AiTokenUsage } from '../src/shared/ai-evidence'
import type { AiRunConfig } from '../src/shared/ai'
import { gradeQualitySummary, qualityCards, QUALITY_CORPUS_VERSION } from '../tests/fixtures/ai-quality-corpus'

/** Read-only recovery of the candidate report if its output file was overwritten.
 * No Codex runner, job writer or model invocation is imported or executed.
 * POKEGURU_AI_QUALITY_RECOVER=1 + RECOVER_FIXTURE + CONFIG + OUTPUT. */
it.skipIf(process.env.POKEGURU_AI_QUALITY_RECOVER !== '1')('recovers candidate evidence from persisted checkpoints and measured attempts', () => {
  const input = process.env.POKEGURU_AI_QUALITY_RECOVER_FIXTURE
  const configFile = process.env.POKEGURU_AI_QUALITY_CONFIG
  if (!input || !configFile) throw new Error('Recovery requires an existing fixture and the pinned configuration file.')
  const folder = resolve(input), file = join(folder, 'data.sqlite')
  const config = JSON.parse(readFileSync(configFile, 'utf8')) as AiRunConfig
  const db = new DatabaseSync(file, { readOnly: true })
  let archive: AiEvidenceArchive | undefined
  try {
    const owners = db.prepare(`SELECT j.id, j.project_id, j.resource_id, j.created_at, j.updated_at
      FROM ai_jobs j JOIN projects p ON p.id = j.project_id WHERE j.resource_id = 'quality-fixture'
      AND p.name = 'Factual fidelity fixture'`).all() as {
        id: string; project_id: string; resource_id: string; created_at: string; updated_at: string }[]
    if (owners.length !== 1) throw new Error('Expected exactly one synthetic comparison job.')
    const owner = owners[0]
    function object<T>(hash: string): T {
      const chunks = db.prepare('SELECT ordinal, body FROM ai_evidence_chunks WHERE object_hash = ? ORDER BY ordinal')
        .all(hash) as { ordinal: number; body: Uint8Array }[]
      if (chunks.some((chunk, index) => chunk.ordinal !== index)) throw new Error('Incomplete checkpoint chunks.')
      const bytes = Buffer.concat(chunks.map((chunk) => gunzipSync(chunk.body)))
      const expected = db.prepare('SELECT bytes FROM ai_evidence_objects WHERE hash = ?').get(hash) as { bytes: number }
      if (bytes.length !== expected?.bytes || createHash('sha256').update(bytes).digest('hex') !== hash)
        throw new Error('Checkpoint integrity verification failed.')
      return JSON.parse(bytes.toString('utf8')) as T
    }
    const finals = (db.prepare(`SELECT object_hash FROM ai_evidence_values WHERE job_id = ?
      AND role = 'analysis-final:v1' ORDER BY rowid`).all(owner.id) as { object_hash: string }[])
      .map((row) => object<{ analysis: NonNullable<AiEvidenceQueryTrace['analysis']>; batches: number; syntheses: number }>(row.object_hash))
    type Attempt = { kind: string; startedAt: string; endedAt: string; status: string;
      inputBytes: number; executionMs: number; usage: AiTokenUsage | null;
      requested: { model: string | null; reasoningEffort: string | null } }
    const attempts = (db.prepare(`SELECT state_json FROM ai_call_state WHERE job_id = ?
      AND key LIKE 'metrics:v1:attempt:%'`).all(owner.id) as { state_json: string }[])
      .map((row) => JSON.parse(row.state_json) as Attempt).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    if (finals.length !== 3 || finals[0].analysis.generation !== finals[1].analysis.generation ||
      finals[1].analysis.generation === finals[2].analysis.generation || finals[0].analysis.batches !== 5 ||
      attempts.length !== 7 || attempts.some((attempt) => attempt.status !== 'succeeded' || !attempt.usage ||
        attempt.requested.model !== config.model || attempt.requested.reasoningEffort !== config.reasoningEffort))
      throw new Error('The persisted data does not match the expected completed five/zero/two-call candidate run.')
    expect(attempts.map((attempt) => attempt.kind)).toEqual(['batch', 'batch', 'batch', 'batch', 'synthesis', 'batch', 'synthesis'])
    const aggregateRow = db.prepare("SELECT state_json FROM ai_call_state WHERE job_id = ? AND key = 'metrics:v1:summary'")
      .get(owner.id) as { state_json: string }
    const recordedMetrics = JSON.parse(aggregateRow.state_json) as { totals: { attempts: number } }
    expect(recordedMetrics.totals.attempts).toBe(7)
    archive = new AiEvidenceArchive(file, { id: owner.id, projectId: owner.project_id, resourceId: owner.resource_id }, true)
    const cards = qualityCards()
    const allSources = [...new Set([...archive.records()].map((record) => record.sourceId))]
    const originals = new Map([...archive.records('card')].map((record) => {
      const value = record.data as { printId: string; gameplay: unknown }
      return [value.printId, value.gameplay] as const
    }))
    const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0, durationMs: 0,
      planningRounds: 1, exhausted: false, focusedPrintIds: cards.map((card) => card.printId),
      engine: { operations: ['catalog.search', 'events.search'], catalog: { syncedAt: '2026-10-28T00:00:00.000Z',
        expected: cards.length, indexed: cards.length, gameplay: cards.length - 1 },
      eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
    bindEvidenceArchive(trace, archive)
    const groups = [attempts.slice(0, 5), [], attempts.slice(5)]
    const rows = finals.map((checkpoint, index) => {
      trace.analysis = checkpoint.analysis
      const supplied = aiEvidenceForPrompt(trace) as { focusedCards?: { printId: string; gameplay: unknown }[] }
      const originalChecks = cards.map((card) => ({ printId: card.printId,
        exactGameplayDelivered: JSON.stringify(supplied.focusedCards?.find((entry) => entry.printId === card.printId)?.gameplay)
          === JSON.stringify(originals.get(card.printId)) }))
      const selected = groups[index]
      const usage = selected.reduce((sum, attempt) => ({ inputTokens: sum.inputTokens + attempt.usage!.inputTokens,
        cachedInputTokens: sum.cachedInputTokens + attempt.usage!.cachedInputTokens,
        outputTokens: sum.outputTokens + attempt.usage!.outputTokens }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 })
      return { step: ['initial', 'identical_replay', 'overlapping_query_memberships'][index],
        calls: selected.length, elapsedMs: null,
        recordedModelExecutionMs: selected.reduce((sum, attempt) => sum + attempt.executionMs, 0),
        firstAttemptAt: selected[0]?.startedAt ?? null, lastAttemptAt: selected.at(-1)?.endedAt ?? null,
        inputBytes: selected.reduce((sum, attempt) => sum + attempt.inputBytes, 0), outputBytes: null,
        usageCalls: selected.filter((attempt) => attempt.usage).length, usage: selected.length ? usage : null,
        uniqueSourceCount: checkpoint.analysis.sourceCount,
        checks: gradeQualitySummary(checkpoint.analysis.summary, checkpoint.analysis.limitations, checkpoint.analysis.sourceIds, allSources),
        originalChecks, originalChecksReverifiedAfterRecovery: true,
        summary: checkpoint.analysis.summary, limitations: checkpoint.analysis.limitations, sourceIds: checkpoint.analysis.sourceIds }
    })
    const output = resolve(process.env.POKEGURU_AI_QUALITY_OUTPUT ?? 'docs/AI-QUALITY-AFTER-LIVE-RECOVERED.json')
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify({ schemaVersion: 1, corpusVersion: QUALITY_CORPUS_VERSION,
      kind: 'real-codex-factual-fidelity', label: 'candidate-recovered', recovered: true, config,
      configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
      node: null, platform: null, recoveryRuntime: { node: process.version, platform: process.platform },
      fixtureDirectory: folder, jobCreatedAt: owner.created_at, jobUpdatedAt: owner.updated_at, maxInvocations: 12,
      recovery: { readOnly: true, newModelInvocations: 0, checkpointCount: finals.length,
        reason: 'The original candidate report was overwritten by an unintended second baseline test. Restored exact final answers and per-attempt measurements from the candidate SQLite fixture.',
        phaseAssignment: 'Sequential successful attempts; the first checkpoint records five calls, its identical-generation replay adds zero, and the two remaining attempts precede the changed-generation checkpoint.',
        unavailable: ['original harness end-to-end elapsedMs', 'original raw outputBytes', 'runtime of original process'],
        verification: 'Checkpoint compressed chunks, byte lengths and SHA-256 verified; all seven attempts succeeded with usage and the pinned requested configuration. Grader rerun unchanged; original gameplay delivery rechecked read-only.' },
      limitations: 'Small factual-fidelity corpus; not statistical or tactical non-inferiority. recordedModelExecutionMs excludes local preparation/verification and cannot be compared directly to baseline elapsedMs. Effective service defaults were not observed.',
      recordedMetrics, attempts, rows }, null, 2) + '\n')
    for (const row of rows) {
      expect(row.checks.filter((check) => !check.passed)).toEqual([])
      expect(row.originalChecks.every((check) => check.exactGameplayDelivered)).toBe(true)
    }
  } finally { archive?.close(); db.close() }
})
