import { expect, it } from 'vitest'
import type { AiEvidenceQueryTrace } from '../src/shared/ai-evidence'
import type { CatalogEvidenceMatch } from '../src/main/catalog-evidence-search'
import type { AiEvidenceEngine } from '../src/main/ai-evidence-engine'
import { aiEvidenceForPrompt } from '../src/main/ai-evidence-queries'
import { deckThreadPrompt } from '../src/main/deck-ai'
import type { DeckThread } from '../src/shared/deck-threads'
import type { ThreadEvidencePacket } from '../src/shared/thread-evidence'
import type { CatalogView } from '../src/shared/catalog'
import { cardForPrompt, deliveredCardFingerprint, draftNeedsEvidenceReview,
  evidenceCallContext, prepareEvidenceDelivery, queryPagesForPrompt } from '../src/main/ai-evidence-delivery'

function card(id: string, effect = 'Draw 2 cards.'): CatalogEvidenceMatch {
  const gameplay = { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
    effect, trainerType: 'Item', weaknesses: [], resistances: [], retreat: null }
  return { printId: id, identityId: id, name: `Card ${id}`, sourceUrl: `https://example.test/${id}`,
    detailAt: '2026-10-29T00:00:00.000Z', comparableGameplay: true,
    gameplay, printedGameplay: structuredClone(gameplay), errataStatus: 'no-correction', errataSourceUrl: null,
    rarity: 'Common', variants: null, reason: 'exact-print', matchedTerms: [] }
}
function fixture(cards = [card('a'), card('b')]): { trace: AiEvidenceQueryTrace; engine: AiEvidenceEngine } {
  const engine: AiEvidenceEngine = { describe: () => ({ operations: [],
    catalog: { syncedAt: null, expected: 3, indexed: 3, gameplay: 2 },
    eventWindow: { from: '2026-10-01', to: '2026-10-29' } }),
    cardTargets: (text) => ['a', 'b', 'missing'].filter((id) => text.includes(`Card ${id}`))
      .map((id) => ({ name: `Card ${id}`, printIds: [id] })), eventTargets: () => [],
    execute: () => { throw new Error('This helper test must not execute a query.') } }
  const trace: AiEvidenceQueryTrace = { schemaVersion: 1, responseBytes: 150_000,
    durationMs: 0, planningRounds: 1, exhausted: false, engine: engine.describe(),
    requests: [{ query: { operation: 'catalog.search' }, status: 'ok', data: { matches: cards },
      sourceIds: cards.map((item) => `card:${item.printId}`), fingerprint: 'fixture' }],
    analysis: { schemaVersion: 1, records: cards.length, batches: 1, sourceCount: cards.length,
      summary: 'Known evidence.', limitations: '', sourceIds: [] } }
  return { trace, engine }
}
function expandCard(input: unknown): unknown {
  const value = input as Record<string, unknown>
  if (value.printedGameplayRef === 'gameplay') {
    const { printedGameplayRef: _reference, ...card } = value
    return { ...card, printedGameplay: card.gameplay }
  }
  return value
}

it('selection does not claim delivery and an unprovided original still requires review', () => {
  const { trace, engine } = fixture()
  prepareEvidenceDelivery(trace, engine, ['Card a'])
  expect(trace.focusedPrintIds).toEqual(['a'])
  expect(trace.deliveredCards).toBeUndefined()
  expect(draftNeedsEvidenceReview(trace, engine, 'Card a')).toBe(true)
})

it('decision profiles still require review for a missing or changed original', () => {
  const { trace, engine } = fixture()
  trace.engine.eventQueryMode = 'decision-profiles'
  delete trace.analysis
  aiEvidenceForPrompt(trace)
  expect(draftNeedsEvidenceReview(trace, engine, 'Card a')).toBe(false)
  expect(draftNeedsEvidenceReview(trace, engine, 'Card missing')).toBe(true)
  const data = trace.requests[0].data as { matches: CatalogEvidenceMatch[] }
  data.matches[0] = card('a', 'A changed rule requires another review.')
  expect(draftNeedsEvidenceReview(trace, engine, 'Card a')).toBe(true)
})

it('seeds original delivery from the task, summary mentions and cited print IDs', () => {
  const { trace, engine } = fixture()
  trace.analysis!.summary = 'Card a is decisive.'
  trace.analysis!.sourceIds = ['card:b', 'event:unrelated']
  prepareEvidenceDelivery(trace, engine, ['A discussion without any explicit card'])
  expect(new Set(trace.focusedPrintIds)).toEqual(new Set(['a', 'b']))
  expect(trace.deliveredCards).toBeUndefined()
  aiEvidenceForPrompt(trace)
  expect(trace.deliveredCards?.map((item) => item.printId).sort()).toEqual(['a', 'b'])
})

it('a delivered original avoids revision; absent, changed or never-resolved originals still require it', () => {
  const { trace, engine } = fixture()
  prepareEvidenceDelivery(trace, engine, ['Card a'])
  const payload = aiEvidenceForPrompt(trace) as { focusedCards: unknown[] }
  expect(payload.focusedCards.map(expandCard)).toEqual([card('a')])
  expect(draftNeedsEvidenceReview(trace, engine, 'Card a')).toBe(false)
  expect(draftNeedsEvidenceReview(trace, engine, 'Card b')).toBe(true)
  expect(draftNeedsEvidenceReview(trace, engine, 'Card missing')).toBe(true)
  const data = trace.requests[0].data as { matches: CatalogEvidenceMatch[] }
  data.matches[0] = card('a', 'Draw 3 cards after the source correction.')
  expect(draftNeedsEvidenceReview(trace, engine, 'Card a')).toBe(true)
  aiEvidenceForPrompt(trace)
  expect(draftNeedsEvidenceReview(trace, engine, 'Card a')).toBe(false)
})

it('the registry describes the latest serialized payload and is excluded from every prompt', () => {
  const { trace, engine } = fixture()
  prepareEvidenceDelivery(trace, engine, ['Card a'])
  const first = aiEvidenceForPrompt(trace)
  const inputKey = JSON.stringify(evidenceCallContext(trace))
  expect(trace.deliveredCards?.map((item) => item.printId)).toEqual(['a'])
  expect(JSON.stringify(first)).not.toContain('deliveredCards')
  trace.deliveredCards = [{ printId: 'bookkeeping-only', fingerprint: 'not-input' }]
  trace.durationMs += 500
  expect(JSON.stringify(evidenceCallContext(trace))).toBe(inputKey)
  trace.focusedPrintIds = ['b']
  const second = aiEvidenceForPrompt(trace)
  expect(trace.deliveredCards?.map((item) => item.printId)).toEqual(['b'])
  expect(JSON.stringify(second)).not.toContain('deliveredCards')
  expect(draftNeedsEvidenceReview(trace, engine, 'Card a')).toBe(true)
  delete trace.analysis
  const direct = aiEvidenceForPrompt(trace)
  expect(trace.deliveredCards?.map((item) => item.printId)).toEqual(['a', 'b'])
  expect(JSON.stringify(direct)).not.toContain('deliveredCards')
})

it('keeps a complete small prompt stable when focus bookkeeping is reconstructed on resume', () => {
  const { trace, engine } = fixture()
  delete trace.analysis
  const original = aiEvidenceForPrompt(trace)
  prepareEvidenceDelivery(trace, engine, [])
  expect(aiEvidenceForPrompt(trace)).toEqual(original)
  prepareEvidenceDelivery(trace, engine, ['Card a'])
  expect(aiEvidenceForPrompt(trace)).toEqual(original)
  expect(trace.deliveredCards?.map((card) => card.printId)).toEqual(['a', 'b'])
})

it('exact printed-rule duplication is reversible while errata and missing fields remain explicit', () => {
  const original = card('a')
  expect(cardForPrompt(original)).toMatchObject({ printedGameplayRef: 'gameplay' })
  expect(expandCard(cardForPrompt(original))).toEqual(original)
  const corrected = { ...card('a', 'Corrected effect'), printedGameplay: card('a').gameplay,
    errataStatus: 'applied' as const, errataSourceUrl: 'https://example.test/errata' }
  expect(cardForPrompt(corrected)).toEqual(corrected)
  expect(cardForPrompt(corrected)).not.toHaveProperty('printedGameplayRef')
  const missing = { ...card('missing'), gameplay: null, printedGameplay: null, comparableGameplay: false }
  expect(cardForPrompt(missing)).toEqual(missing)
  const noCost = { ...original, gameplay: { ...original.gameplay!, attacks: [
    { name: 'Unknown', cost: null, damage: '50', effect: null }] }, printedGameplay: null }
  expect(cardForPrompt(noCost)).toMatchObject({ gameplay: { attacks: [{ cost: null }] } })
})

it('overlapping pages compact losslessly with per-query provenance and conflicting print content preserved', () => {
  const original = card('a', 'An exact long effect. '.repeat(150))
  const changed = card('a', 'A different original with the same print ID. '.repeat(120))
  const pages = [original, { ...original, reason: 'text' as const, matchedTerms: ['draw'] }, changed,
    { ...changed, reason: 'same-identity' as const, matchedTerms: ['different'] }].map((value, index) => ({
      query: { operation: 'catalog.search', offset: index }, status: 'ok' as const,
      data: { matches: [value], totalMatches: 4, remaining: 3 - index },
      sourceIds: [`card:${value.printId}`], fingerprint: `page-${index}` }))
  const compact = queryPagesForPrompt(pages)
  expect(compact.cardDefinitions).toBeDefined()
  expect(Object.keys(compact.cardDefinitions!)).toHaveLength(2)
  const restored = compact.requests.map((input) => {
    const page = input as typeof pages[number]
    return { ...page, data: { ...page.data, matches: page.data.matches.map((input) => {
      const reference = input as unknown as { cardRef: string; reason: string; matchedTerms: string[] }
      return { ...expandCard(compact.cardDefinitions![reference.cardRef]) as object,
        reason: reference.reason, matchedTerms: reference.matchedTerms }
    }) } }
  })
  expect(restored).toEqual(pages)
  expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(Buffer.byteLength(JSON.stringify({ requests: pages })))
  expect(deliveredCardFingerprint(pages[0].data.matches[0])).toBe(deliveredCardFingerprint(pages[1].data.matches[0]))
  expect(deliveredCardFingerprint(original)).not.toBe(deliveredCardFingerprint(changed))
})

it('does not create a dictionary when unique short cards would increase the payload', () => {
  const { trace } = fixture([card('a')])
  expect(queryPagesForPrompt(trace.requests).cardDefinitions).toBeUndefined()
})

it('deck references only delivered identical gameplay and preserves annotations, originals and citation provenance', () => {
  const { trace, engine } = fixture([card('a'), card('b'), card('c')])
  prepareEvidenceDelivery(trace, engine, ['Card a and Card b'])
  const thread: DeckThread = { id: 'thread', projectId: 'project', title: 'Delivery fixture',
    baseVersionId: null, baseVersionNumber: null, baseResolutionId: null, resolutionChanged: false,
    parentThreadId: null, seedCandidateId: null, seedCandidateText: null, currentVersionId: null,
    stale: false, aiSessionRef: null, openingAiMessageId: null, createdAt: '', updatedAt: '',
    messages: [], candidates: [] }
  const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
    scope: { setIds: [], names: [] }, syncedAt: null, sets: [], prints: [] }
  const initialCards = [card('a'), card('b', 'A distinct original must stay explicit.'), card('c')]
  const packet: ThreadEvidencePacket = { schemaVersion: 1, capturedAt: '2026-10-29T00:00:00.000Z',
    baseVersionId: null, candidateId: null, catalogSyncedAt: null,
    cardCoverage: { selected: 3, withGameplay: 3, omitted: 0 },
    cards: initialCards.map((original) => ({ name: original.name, quantity: 1, printId: original.printId,
      setId: 'qa', localId: original.printId, category: 'Trainer', regulationMark: null,
      identityStatus: 'exact', gameplay: original.gameplay ?? null,
      gameplayText: 'Errata provenance and Prize annotations stay attached.',
      sourceId: `card:${original.printId}`, detailAt: original.detailAt })),
    events: [], sources: initialCards.map((original) => ({ id: `card:${original.printId}`,
      label: original.name, url: original.sourceUrl, fingerprint: deliveredCardFingerprint(original) })),
    change: { updated: [], added: [], removed: [] }, aiQueries: trace }
  const before = structuredClone(packet.cards)
  const { prompt } = deckThreadPrompt(thread, null, 'Check Card a and Card b.', [], catalog, packet, '2026-10-29')
  const context = JSON.parse(prompt.split('\n\n').at(-1)!)
  expect(context.evidence.cards[0]).not.toHaveProperty('gameplay')
  expect(context.evidence.cards[0].gameplayRef).toEqual({ printId: 'a', field: 'gameplay' })
  expect(context.evidence.cards[0].gameplayText).toBe(before[0].gameplayText)
  expect(context.evidence.aiQueries.focusedCards.find((original: { printId: string }) => original.printId === 'a').gameplay)
    .toEqual(before[0].gameplay)
  // b is delivered with different rules; c's original is archived but not delivered in this prompt.
  expect(context.evidence.cards[1]).toEqual(before[1])
  expect(context.evidence.cards[2]).toEqual(before[2])
  expect(context.evidence.sources).toEqual(packet.sources)
  expect(context.allowedSourceIds).toEqual(expect.arrayContaining(['card:a', 'card:b', 'card:c']))
  expect(packet.cards).toEqual(before)
  expect(trace.deliveredCards?.map((original) => original.printId)).toEqual(['a', 'b'])
  expect(prompt).not.toContain('deliveredCards')

  // Legacy/direct traces can preserve two contradictory originals for one print ID.
  // A printId-only reference would be ambiguous even when one version matches exactly.
  delete trace.analysis
  trace.requests.unshift({ query: { operation: 'catalog.search', terms: ['older source'] },
    status: 'ok', data: { matches: [card('a', 'An older conflicting source.')] },
    sourceIds: ['card:a'], fingerprint: 'conflicting-source' })
  const ambiguousPrompt = deckThreadPrompt(thread, null, 'Check Card a.', [], catalog, packet, '2026-10-29').prompt
  const ambiguousContext = JSON.parse(ambiguousPrompt.split('\n\n').at(-1)!)
  expect(ambiguousContext.evidence.cards[0]).toEqual(before[0])
  expect(ambiguousContext.evidence.cards[0]).not.toHaveProperty('gameplayRef')
  expect(ambiguousPrompt).toContain('An older conflicting source.')
  expect(ambiguousPrompt).toContain('Draw 2 cards.')
})
