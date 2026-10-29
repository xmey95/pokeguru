import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { deckThreadPrompt, DECK_THREAD_SCHEMA } from '../src/main/deck-ai'
import { runStructuredCodex } from '../src/main/codex-evidence-plan'
import { readAiTokenUsage, type AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { AiRunConfig } from '../src/shared/ai'
import type { CatalogView, CardGameplay } from '../src/shared/catalog'
import type { DeckThread } from '../src/shared/deck-threads'
import type { ThreadEvidencePacket } from '../src/shared/thread-evidence'
import { gradeQualitySummary, qualityCards, qualityOccurrence, qualityQuestion,
  QUALITY_CORPUS_VERSION, QUALITY_GRADER_VERSION } from '../tests/fixtures/ai-quality-corpus'

/** One final-prompt invocation per variant. Copy this file and its fixture into
 * the frozen baseline tree, use the same config JSON and absolute Codex binary.
 * Enable POKEGURU_AI_PROMPT_FIDELITY=1; real calls additionally require
 * POKEGURU_AI_QUALITY_LIVE=1 and POKEGURU_AI_QUALITY_CONFIG. */
it.skipIf(process.env.POKEGURU_AI_PROMPT_FIDELITY !== '1')('retains factual fidelity in the final deck prompt with compact card references', async () => {
  const live = process.env.POKEGURU_AI_QUALITY_LIVE === '1'
  const label = process.env.POKEGURU_AI_QUALITY_LABEL ?? 'candidate'
  const configFile = process.env.POKEGURU_AI_QUALITY_CONFIG
  if (live && !configFile) throw new Error('Live comparison requires the same pinned config JSON for both variants.')
  const config: AiRunConfig = configFile ? JSON.parse(readFileSync(configFile, 'utf8'))
    : { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }
  if (config.provider !== 'codex' || !(config.model === null || typeof config.model === 'string')
    || !(config.reasoningEffort === null || typeof config.reasoningEffort === 'string'))
    throw new Error('Invalid comparison configuration.')
  const cards = qualityCards(0).map((card, index) => ({ ...card,
    identityId: card.printId, errataStatus: index === 5 ? 'applied' : 'no-correction',
    errataSourceUrl: index === 5 ? 'https://example.test/ai-quality/errata-observation-b' : null,
    printedGameplay: index === 5 ? { effect: 'A different uncorrected printed rule.' } : structuredClone(card.gameplay),
    reason: 'exact-print', matchedTerms: [] as string[] }))
  const sourceIds = [...cards.map((card) => `card:${card.printId}`), 'list:quality-field']
  const requests = [
    ...[0, 1, 2].map((index) => ({ query: { operation: 'catalog.search', terms: [`overlap-${index}`] },
      status: 'ok' as const, data: { matches: cards.map((card) => ({ ...card,
        reason: index ? 'text' : 'exact-print', matchedTerms: index ? [`overlap-${index}`] : [] })), remaining: 0 },
      sourceIds: cards.map((card) => `card:${card.printId}`), fingerprint: `cards-query-${index}` })),
    { query: { operation: 'events.search', deckName: 'Synthetic field archetype' }, status: 'ok' as const,
      data: { lists: [{ ...qualityOccurrence, cards: ['60 Synthetic Energy QA 1'], occurrences: [qualityOccurrence] }], remaining: 0 },
      sourceIds: ['list:quality-field'], fingerprint: 'field-query' }
  ]
  const trace: AiEvidenceQueryTrace = { schemaVersion: 1, requests,
    responseBytes: Buffer.byteLength(JSON.stringify(requests)), durationMs: 0, planningRounds: 1, exhausted: false,
    engine: { operations: ['catalog.search', 'events.search'], catalog: { syncedAt: '2026-10-28T00:00:00.000Z',
      expected: cards.length, indexed: cards.length, gameplay: cards.length - 1 },
    eventWindow: { from: '2026-10-01', to: '2026-10-29' } } }
  const thread: DeckThread = { id: 'thread', projectId: 'project', title: 'Factual fidelity fixture',
    baseVersionId: null, baseVersionNumber: null, baseResolutionId: null, resolutionChanged: false,
    parentThreadId: null, seedCandidateId: null, seedCandidateText: null, currentVersionId: null,
    stale: false, aiSessionRef: null, openingAiMessageId: null, createdAt: '', updatedAt: '', messages: [], candidates: [] }
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: [], names: [] }, syncedAt: null, sets: [], prints: [] }
  const packet: ThreadEvidencePacket = { schemaVersion: 1, capturedAt: '2026-10-29T00:00:00.000Z',
    baseVersionId: null, candidateId: null, catalogSyncedAt: null,
    cardCoverage: { selected: cards.length, withGameplay: cards.length - 1, omitted: 0 },
    cards: cards.map((card) => ({ name: card.name, quantity: 1, printId: card.printId, setId: null,
      localId: null, category: null, regulationMark: null, identityStatus: 'unverified',
      gameplay: card.gameplay as CardGameplay, gameplayText: card.fixtureNote,
      sourceId: `card:${card.printId}`, detailAt: card.detailAt })), events: [],
    sources: sourceIds.map((id) => ({ id, label: id,
      url: cards.find((card) => id === `card:${card.printId}`)?.sourceUrl ?? qualityOccurrence.listUrl,
      fingerprint: `fixture:${id}` })), change: { updated: [], added: [], removed: [] }, aiQueries: trace }
  const question = `${qualityQuestion} Return kind="thought", rawText="", and put every Q1–Q6 conclusion in reply.`
  const { prompt } = deckThreadPrompt(thread, null, question, [], catalog, packet, '2026-10-29')
  const started = performance.now()
  const response = live ? await runStructuredCodex(prompt, config, DECK_THREAD_SCHEMA)
    : { kind: 'thought', rawText: '', reply: [...cards.map((card) => card.evaluationFact), qualityOccurrence.evaluationFact].join('\n'), sourceIds }
  const elapsedMs = Math.round(performance.now() - started)
  const value = response as { reply?: unknown; sourceIds?: unknown; __usage?: unknown }
  const reply = typeof value.reply === 'string' ? value.reply : ''
  const cited = Array.isArray(value.sourceIds) ? value.sourceIds.filter((id): id is string => typeof id === 'string') : []
  const checks = gradeQualitySummary(reply, '', cited, sourceIds)
  const output = resolve(process.env.POKEGURU_AI_PROMPT_FIDELITY_OUTPUT ?? `.verify/ai-prompt-fidelity-${label}.json`)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, JSON.stringify({ schemaVersion: 1, corpusVersion: QUALITY_CORPUS_VERSION,
    graderVersion: QUALITY_GRADER_VERSION, label,
    kind: live ? 'real-codex-final-prompt-fidelity' : 'offline-fixture-oracle', config,
    configHash: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
    calls: live ? 1 : 0, inputBytes: Buffer.byteLength(prompt), promptSha256: createHash('sha256').update(prompt).digest('hex'),
    outputBytes: Buffer.byteLength(JSON.stringify(response)), elapsedMs,
    usage: live ? readAiTokenUsage(value.__usage) : null, checks, reply, sourceIds: cited,
    limitations: 'Six targeted factual probes, one real curated printing; no statistical or tactical non-inferiority claim. Offline mode is an oracle and measures neither model behavior nor model latency.'
  }, null, 2) + '\n')
  expect(checks.filter((check) => !check.passed)).toEqual([])
}, 900_000)
