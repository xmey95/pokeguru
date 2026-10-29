import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { AiAnalysisWork, analyzeLargeEvidence } from '../src/main/ai-analysis-work'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import { evidenceHash } from '../src/main/ai-evidence-archive'
import { bindEvidenceArchive, refreshEvidenceArchive } from '../src/main/ai-evidence-access'
import { aiEvidenceForPrompt } from '../src/main/ai-evidence-queries'
import { runStructuredCodex } from '../src/main/codex-evidence-plan'
import { readAiTokenUsage, type AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { AiRunConfig } from '../src/shared/ai'
import { gradeQualitySummary, oracleQualityResponse, qualityCards, qualityOccurrence,
  qualityQuestion, QUALITY_CORPUS_VERSION, QUALITY_GRADER_VERSION } from '../tests/fixtures/ai-quality-corpus'

/** Run the identical file against frozen baseline and candidate src trees.
 * POKEGURU_AI_QUALITY=1 enables offline factual-transfer evaluation.
 * POKEGURU_AI_QUALITY_LIVE=1 additionally spends Codex quota; it requires an
 * explicit POKEGURU_AI_QUALITY_CONFIG JSON file and never chooses a model.
 * Keep the same config file for baseline and candidate and compare configHash.
 * POKEGURU_AI_QUALITY_LABEL / OUTPUT distinguish artifact destinations.
 * This small corpus cannot establish statistical or tactical non-inferiority. */
it.skipIf(process.env.POKEGURU_AI_QUALITY !== '1')('evaluates supplied facts and originals through the real evidence archive', async () => {
  const live = process.env.POKEGURU_AI_QUALITY_LIVE === '1'
  const label = process.env.POKEGURU_AI_QUALITY_LABEL ?? 'candidate'
  const configFile = process.env.POKEGURU_AI_QUALITY_CONFIG
  if (live && !configFile) throw new Error('Live comparison requires the pinned config JSON used by both variants.')
  const config: AiRunConfig = configFile ? JSON.parse(readFileSync(configFile, 'utf8'))
    : { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
  if (config.provider !== 'codex' || !(config.model === null || typeof config.model === 'string')
    || !(config.reasoningEffort === null || typeof config.reasoningEffort === 'string'))
    throw new Error('Invalid comparison configuration; model and effort must be explicit, including null.')
  const output = resolve(process.env.POKEGURU_AI_QUALITY_OUTPUT ?? `.verify/ai-quality-${label}.json`)
  mkdirSync(dirname(output), { recursive: true })
  mkdirSync(resolve('.verify'), { recursive: true })
  const folder = mkdtempSync(resolve('.verify/ai-quality-fixture-'))
  const file = join(folder, 'data.sqlite')
  const projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Factual fidelity fixture', format: 'STANDARD' })
  const job = jobs.start('thread-ask', project.id, 'quality-fixture')
  const work = new AiAnalysisWork(join(folder, job.id), jobs, job.id, new AbortController().signal)
  const archive = work.archive
  const cards = qualityCards()
  const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests: [], responseBytes: 0,
    durationMs: 0, planningRounds: 1, exhausted: false,
    engine: { operations: ['catalog.search', 'events.search'], catalog: {
      syncedAt: '2026-10-28T00:00:00.000Z', expected: cards.length, indexed: cards.length, gameplay: cards.length - 1 },
    eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
  const schema = { type: 'object', additionalProperties: false, required: ['summary', 'limitations', 'sourceIds'],
    properties: { summary: { type: 'string', maxLength: 2400 }, limitations: { type: 'string', maxLength: 1200 },
      sourceIds: { type: 'array', maxItems: 64, items: { type: 'string' } } } }
  const append = (query: unknown, data: unknown, sourceIds: string[]) => {
    const search = archive.search(query)
    archive.appendPage(search.key, search.cursor,
      { query, status: 'ok', data, sourceIds, fingerprint: evidenceHash([query, data]) }, null)
  }
  const rows: unknown[] = []
  let allCalls = 0
  const run = async (step: string) => {
    refreshEvidenceArchive(trace)
    let calls = 0, inputBytes = 0, outputBytes = 0, usageCalls = 0
    const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
    const delivered = new Set<string>()
    const started = performance.now()
    await analyzeLargeEvidence(trace, qualityQuestion, config, work, async (prompt) => {
      if (++allCalls > 12) throw new Error('The bounded comparison reached its 12-invocation safety cap.')
      calls++; inputBytes += Buffer.byteLength(prompt)
      const records = JSON.parse(prompt.split('\nDATI: ')[1].split('\nRestituisci')[0]) as { sourceIds: string[] }[]
      if (prompt.includes('LIVELLO: 0\n')) records.forEach((record) => record.sourceIds.forEach((id) => delivered.add(id)))
      const value = live ? await runStructuredCodex(prompt, config, schema, work.signal) : oracleQualityResponse(prompt)
      outputBytes += Buffer.byteLength(JSON.stringify(value))
      const tokens = readAiTokenUsage((value as { __usage?: unknown })?.__usage)
      if (tokens) { usageCalls++; usage.inputTokens += tokens.inputTokens;
        usage.cachedInputTokens += tokens.cachedInputTokens; usage.outputTokens += tokens.outputTokens }
      return value
    })
    const analysis = trace.analysis!
    const allSources = [...new Set([...archive.records()].map((record) => record.sourceId))]
    const checks = gradeQualitySummary(analysis.summary, analysis.limitations, analysis.sourceIds, allSources)
    trace.focusedPrintIds = cards.map((card) => card.printId)
    const promptData = aiEvidenceForPrompt(trace) as { focusedCards?: { printId: string; gameplay: unknown }[] }
    const originals = new Map([...archive.records('card')].map((record) => {
      const data = record.data as { printId: string; gameplay: unknown }
      return [data.printId, data.gameplay] as const
    }))
    const originalChecks = cards.map((card) => ({ printId: card.printId,
      exactGameplayDelivered: JSON.stringify(promptData.focusedCards?.find((value) => value.printId === card.printId)?.gameplay)
        === JSON.stringify(originals.get(card.printId)) }))
    const row = { step, elapsedMs: Math.round(performance.now() - started), calls, inputBytes, outputBytes,
      usageCalls, usage: usageCalls ? usage : null, evidenceBytes: trace.responseBytes,
      uniqueSourceCount: allSources.length, newlyInvokedLeafSourceCount: delivered.size,
      archive: archive.counts(), checks, originalChecks,
      summary: analysis.summary, limitations: analysis.limitations, sourceIds: analysis.sourceIds }
    rows.push(row)
    return row
  }
  try {
    append({ operation: 'catalog.search', printIds: cards.map((card) => card.printId) },
      { matches: cards, remaining: 0, offset: 0 }, cards.map((card) => `card:${card.printId}`))
    append({ operation: 'events.search', deckName: 'Synthetic field archetype' },
      { lists: [{ ...qualityOccurrence, cards: ['60 Synthetic Energy QA 1'], occurrences: [qualityOccurrence] }],
        remaining: 0 }, ['list:quality-field'])
    bindEvidenceArchive(trace, archive)
    expect(trace.responseBytes).toBeGreaterThan(120_000)
    const initial = await run('initial')
    const repeat = await run('identical_replay')
    append({ operation: 'catalog.search', terms: ['overlapping query'] },
      { matches: [cards.at(-1)!], remaining: 0 }, [`card:${cards.at(-1)!.printId}`])
    append({ operation: 'events.search', cardName: 'Synthetic Energy' },
      { lists: [{ ...qualityOccurrence, cards: ['60 Synthetic Energy QA 1'], occurrences: [qualityOccurrence] }],
        remaining: 0 }, ['list:quality-field'])
    const overlap = await run('overlapping_query_memberships')
    const report = { schemaVersion: 1, corpusVersion: QUALITY_CORPUS_VERSION, graderVersion: QUALITY_GRADER_VERSION,
      kind: live ? 'real-codex-factual-fidelity' : 'offline-oracle-transfer', label, config,
      configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
      node: process.version, platform: process.platform, maxInvocations: 12,
      limitations: live
        ? 'Small factual-fidelity corpus with one real curated card and five synthetic cases. Not a statistical or tactical non-inferiority claim. Null model/effort do not prove the service resolved the same defaults.'
        : 'Real archive and orchestration with an oracle callback copying supplied atomic facts. No Codex call, real latency, token measurement, or tactical quality claim.',
      rows }
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    expect(repeat.calls).toBe(0)
    expect(overlap.archive.cards).toBe(initial.archive.cards)
    expect(overlap.archive.occurrences).toBe(1)
    for (const row of [initial, repeat, overlap]) {
      expect(row.checks.filter((check) => !check.passed), `${row.step}: failed factual checks`).toEqual([])
      expect(row.originalChecks.every((check) => check.exactGameplayDelivered), `${row.step}: original rules changed`).toBe(true)
    }
  } finally { work.close(); jobs.close(); projects.close() }
}, 1_800_000)
