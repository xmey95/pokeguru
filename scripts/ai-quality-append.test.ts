import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { evidenceHash } from '../src/main/ai-evidence-archive'
import { bindEvidenceArchive, refreshEvidenceArchive } from '../src/main/ai-evidence-access'
import { aiEvidenceForPrompt } from '../src/main/ai-evidence-queries'
import { runStructuredCodex } from '../src/main/codex-evidence-plan'
import { AiFailure, aiFailureCode } from '../src/main/ai-failure'
import { readAiTokenUsage, type AiEvidenceQueryTrace, type AiTokenUsage } from '../src/shared/ai-evidence'
import type { AiRunConfig } from '../src/shared/ai'
import { gradeQualitySummary, oracleQualityResponse, qualityCards,
  qualityQuestion, QUALITY_CORPUS_VERSION } from '../tests/fixtures/ai-quality-corpus'

/** Extends a completed comparison fixture; never creates a replacement job or
 * repeats its initial analysis. Copy this identical script into the frozen tree.
 * Required: POKEGURU_AI_QUALITY_APPEND=1, POKEGURU_AI_QUALITY_APPEND_FIXTURE.
 * Reuses CONFIG/LABEL/OUTPUT and LIVE from ai-quality-comparison.test.ts.
 * Live also requires POKEGURU_AI_QUALITY_APPEND_PRIOR (the preceding report),
 * tying the fixture's cached final answer, config and seven calls to that report.
 * Five additional attempts are journaled durably, including failed attempts. */
it.skipIf(process.env.POKEGURU_AI_QUALITY_APPEND !== '1')('measures an early-key append using the existing completed fixture', async () => {
  const live = process.env.POKEGURU_AI_QUALITY_LIVE === '1'
  const label = process.env.POKEGURU_AI_QUALITY_LABEL ?? 'candidate'
  const fixtureInput = process.env.POKEGURU_AI_QUALITY_APPEND_FIXTURE
  const configFile = process.env.POKEGURU_AI_QUALITY_CONFIG
  const priorFile = process.env.POKEGURU_AI_QUALITY_APPEND_PRIOR
  if (!fixtureInput || live && (!configFile || !priorFile))
    throw new Error('Append requires an existing fixture; live additionally requires pinned config and its preceding report.')
  const folder = resolve(fixtureInput), file = join(folder, 'data.sqlite')
  if (!existsSync(file)) throw new Error('The supplied fixture database does not exist.')
  const config: AiRunConfig = configFile ? JSON.parse(readFileSync(configFile, 'utf8'))
    : { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
  if (config.provider !== 'codex' || !(config.model === null || typeof config.model === 'string') ||
    !(config.reasoningEffort === null || typeof config.reasoningEffort === 'string'))
    throw new Error('Invalid comparison configuration; model and effort must be explicitly present, including null.')
  const configHash = createHash('sha256').update(JSON.stringify(config)).digest('hex')
  const prior = priorFile ? JSON.parse(readFileSync(priorFile, 'utf8')) as {
    kind: string; corpusVersion: string; configHash: string; rows: { calls: number; summary: string }[] } : undefined
  if (prior && (prior.corpusVersion !== QUALITY_CORPUS_VERSION || prior.configHash !== configHash ||
    live && prior.kind !== 'real-codex-factual-fidelity' || prior.rows.reduce((sum, row) => sum + row.calls, 0) !== 7))
    throw new Error('The preceding report must match this corpus/config and contain exactly seven prior invocations.')
  const inspection = new DatabaseSync(file, { readOnly: true })
  let owner: { id: string; project_id: string; kind: string; status: string }
  let cached: { result_json: string }[]
  try {
    const jobs = inspection.prepare(`SELECT j.id, j.project_id, j.kind, j.status FROM ai_jobs j
      JOIN projects p ON p.id = j.project_id WHERE j.resource_id = 'quality-fixture'
      AND p.name = 'Factual fidelity fixture'`).all() as typeof owner[]
    if (jobs.length !== 1 || jobs[0].kind !== 'thread-ask' || jobs[0].status !== 'running')
      throw new Error('Expected the one running synthetic quality-fixture job from the preceding comparison.')
    owner = jobs[0]
    cached = inspection.prepare('SELECT result_json FROM ai_call_cache WHERE job_id = ?').all(owner.id) as typeof cached
    if (prior && !cached.some((row) => (JSON.parse(row.result_json) as { summary?: string }).summary === prior.rows.at(-1)?.summary))
      throw new Error('The fixture does not contain the final answer from the supplied preceding report.')
  } finally { inspection.close() }
  const output = resolve(process.env.POKEGURU_AI_QUALITY_OUTPUT ?? `.verify/ai-quality-append-${label}.json`)
  mkdirSync(dirname(output), { recursive: true })
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const work = new AiAnalysisWork(join(folder, owner.id), jobs, owner.id, new AbortController().signal)
  const archive = work.archive, originalCards = qualityCards()
  const addedCard = { ...originalCards.at(-1)!, printId: '0000-quality-new', name: 'Synthetic Added Early Printing',
    sourceUrl: 'https://example.test/ai-quality/0000-quality-new' }
  const cards = [...originalCards, addedCard]
  const schema = { type: 'object', additionalProperties: false, required: ['summary', 'limitations', 'sourceIds'],
    properties: { summary: { type: 'string', maxLength: 2400 }, limitations: { type: 'string', maxLength: 1200 },
      sourceIds: { type: 'array', maxItems: 64, items: { type: 'string' } } } }
  const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0, durationMs: 0,
    planningRounds: 1, exhausted: false, focusedPrintIds: originalCards.map((card) => card.printId),
    engine: { operations: ['catalog.search', 'events.search'], catalog: {
      syncedAt: '2026-10-28T00:00:00.000Z', expected: originalCards.length,
      indexed: originalCards.length, gameplay: originalCards.length - 1 },
    eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
  const attempts: { ordinal: number; kind: string; elapsedMs: number; inputBytes: number; promptHash: string;
    outputBytes: number; usage: AiTokenUsage | null; value?: unknown; failureCode?: string }[] = []
  const delivered = new Set<string>()
  let priorInvocations = 7, priorAttemptCount = 0, started = 0, failure: unknown
  try {
    const existingCards = [...archive.records('card')].map((record) => record.data as { printId: string })
    for (const card of originalCards) if (!existingCards.some((value) => evidenceHash(value) === evidenceHash(card)))
      throw new Error('The supplied fixture differs from the pinned quality corpus.')
    if (existingCards.some((card) => !cards.some((expected) => expected.printId === card.printId)))
      throw new Error('The supplied fixture contains cards outside this bounded experiment.')
    const controlRole = 'quality-append-control:v1'
    const control = archive.value<{ corpusVersion: string; configHash: string; live: boolean; priorInvocations: number }>(controlRole, 'input')
    if (control) {
      if (control.configHash !== configHash || control.corpusVersion !== QUALITY_CORPUS_VERSION || control.live !== live)
        throw new Error('A different append experiment already owns this fixture.')
      priorInvocations = control.priorInvocations
    } else {
      if (cached.length !== 7 || archive.counts().cards !== 7 || archive.counts().occurrences !== 1 || archive.counts().searches !== 4)
        throw new Error('Append requires the completed seven-call, seven-card, four-search comparison fixture.')
      archive.saveValue(controlRole, 'input', { corpusVersion: QUALITY_CORPUS_VERSION, configHash, live, priorInvocations })
    }
    priorAttemptCount = [...archive.values('quality-append-attempt:v1')].length
    const query = { operation: 'catalog.search', printIds: [addedCard.printId] }
    const search = archive.search(query)
    if (search.cursor !== null) {
      const data = { matches: [addedCard], remaining: 0, offset: 0 }
      archive.appendPage(search.key, search.cursor, { query, status: 'ok', data,
        sourceIds: [`card:${addedCard.printId}`], fingerprint: evidenceHash([query, data]) }, null)
    }
    if (evidenceHash(archive.readRecord(`card:${addedCard.printId}`)) !== evidenceHash(addedCard))
      throw new Error('The appended printing differs from the prescribed early-key record.')
    bindEvidenceArchive(trace, archive); refreshEvidenceArchive(trace)
    started = performance.now()
    await analyzeLargeEvidence(trace, qualityQuestion, config, work, async (prompt, reportUsage?: (usage: unknown) => void) => {
      if (priorAttemptCount + attempts.length >= 5)
        throw new AiFailure('query-limit', 'The append comparison reached its durable five-additional-invocation cap.')
      const ordinal = priorAttemptCount + attempts.length + 1
      archive.saveValue('quality-append-attempt:v1', String(ordinal).padStart(2, '0'), { startedAt: new Date().toISOString() })
      const records = JSON.parse(prompt.split('\nDATI: ')[1].split('\nRestituisci')[0]) as { sourceIds: string[] }[]
      const kind = prompt.includes('LIVELLO: 0\n') ? 'batch' : 'synthesis'
      if (kind === 'batch') for (const record of records) for (const id of record.sourceIds) delivered.add(id)
      const attempt = { ordinal, kind, elapsedMs: 0, inputBytes: Buffer.byteLength(prompt),
        promptHash: createHash('sha256').update(prompt).digest('hex'), outputBytes: 0, usage: null as AiTokenUsage | null }
      attempts.push(attempt)
      const callStarted = performance.now()
      const observe = (raw: unknown) => { const usage = readAiTokenUsage(raw); if (usage) { attempt.usage = usage; reportUsage?.(usage) } }
      try {
        // The optional sixth argument is ignored by the frozen baseline invoker;
        // both variants expose successful usage in the same __usage envelope.
        const invoke = runStructuredCodex as (prompt: string, config: AiRunConfig, schema: unknown,
          signal?: AbortSignal, onSummary?: (summary: string) => void, onUsage?: (usage: unknown) => void) => Promise<unknown>
        const value = live ? await invoke(prompt, config, schema, work.signal, undefined, observe) : oracleQualityResponse(prompt)
        observe((value as { __usage?: unknown })?.__usage)
        attempt.outputBytes = Buffer.byteLength(JSON.stringify(value))
        Object.assign(attempt, { value })
        return value
      } catch (error) { Object.assign(attempt, { failureCode: aiFailureCode(error) }); throw error }
      finally {
        attempt.elapsedMs = Math.round(performance.now() - callStarted)
        archive.saveValue('quality-append-answer:v1', String(ordinal).padStart(2, '0'), attempt)
      }
    })
  } catch (error) { failure = error }
  try {
    const elapsedMs = started ? Math.round(performance.now() - started) : 0
    const allSources = [...new Set([...archive.records()].map((record) => record.sourceId))]
    const analysis = trace.analysis
    const checks = analysis ? gradeQualitySummary(analysis.summary, analysis.limitations, analysis.sourceIds, allSources) : []
    trace.focusedPrintIds = cards.map((card) => card.printId)
    const promptData = aiEvidenceForPrompt(trace) as { focusedCards?: { printId: string; gameplay: unknown }[] }
    const originals = new Map([...archive.records('card')].map((record) => {
      const data = record.data as { printId: string; gameplay: unknown }
      return [data.printId, data.gameplay] as const
    }))
    const originalChecks = cards.map((card) => ({ printId: card.printId,
      exactGameplayDelivered: JSON.stringify(promptData.focusedCards?.find((value) => value.printId === card.printId)?.gameplay)
        === JSON.stringify(originals.get(card.printId)) }))
    const usageCalls = attempts.filter((attempt) => attempt.usage).length
    const usage = attempts.reduce((sum, attempt) => ({ inputTokens: sum.inputTokens + (attempt.usage?.inputTokens ?? 0),
      cachedInputTokens: sum.cachedInputTokens + (attempt.usage?.cachedInputTokens ?? 0),
      outputTokens: sum.outputTokens + (attempt.usage?.outputTokens ?? 0) }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 })
    writeFileSync(output, JSON.stringify({ schemaVersion: 1, corpusVersion: QUALITY_CORPUS_VERSION,
      kind: live ? 'real-codex-factual-fidelity-append' : 'offline-oracle-transfer-append', label,
      fixtureDirectory: folder, precedingReport: priorFile ? resolve(priorFile) : null, config, configHash,
      node: process.version, platform: process.platform, priorInvocations, priorAppendAttempts: priorAttemptCount,
      maxAdditionalInvocations: 5, totalInvocationsIncludingThisRun: priorInvocations + priorAttemptCount + attempts.length,
      limitations: 'One small early-key append to an existing completed synthetic fixture. The appended card retains an existing atomic fact but has a distinct print identity. Not statistical or tactical non-inferiority; retained caches and server cache warmth affect timing.',
      step: 'append_one_early_key', elapsedMs, calls: attempts.length,
      inputBytes: attempts.reduce((sum, attempt) => sum + attempt.inputBytes, 0),
      outputBytes: attempts.reduce((sum, attempt) => sum + attempt.outputBytes, 0), usageCalls, usage: usageCalls ? usage : null,
      evidenceBytes: trace.responseBytes, archive: archive.counts(), uniqueSourceCount: allSources.length,
      newlyInvokedLeafSourceCount: delivered.size, newlyInvokedLeafSources: [...delivered], checks, originalChecks,
      summary: analysis?.summary ?? null, limitationsText: analysis?.limitations ?? null, sourceIds: analysis?.sourceIds ?? [],
      attempts, ...(failure ? { failureCode: aiFailureCode(failure) } : {}) }, null, 2) + '\n')
    if (failure) throw failure
    expect(attempts.length + priorAttemptCount).toBeLessThanOrEqual(5)
    expect(archive.counts().cards).toBe(8)
    expect(checks).toHaveLength(7)
    expect(checks.filter((check) => !check.passed)).toEqual([])
    expect(originalChecks.every((check) => check.exactGameplayDelivered)).toBe(true)
  } finally { work.close(); jobs.close(); projects.close() }
}, 1_800_000)
