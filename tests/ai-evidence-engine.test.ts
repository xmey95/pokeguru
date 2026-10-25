import { describe, expect, it } from 'vitest'
import { createAiEvidenceEngine } from '../src/main/ai-evidence-engine'
import { runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
import { CATALOG_SOURCE, type CatalogView } from '../src/shared/catalog'
import type { TournamentSnapshot } from '../src/shared/tournament'

const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE,
  sourceLanguage: 'en', scope: { kind: 'standard-marks', setIds: ['me01'], names: [] },
  syncedAt: '2026-10-25T00:00:00Z', sets: [], prints: [{ id: 'me01-001',
    setId: 'me01', setName: 'Mega Evolution', localId: '001', name: 'Rare Candy',
    category: 'Trainer', rarity: 'Uncommon', regulationMark: 'I', variants: null,
    identityId: 'rare-candy', identityBasis: 'trainer-text',
    gameplay: { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
      effect: 'Search your deck for an evolution Pokémon.', trainerType: 'Item',
      weaknesses: [], resistances: [], retreat: null },
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: 'https://api.tcgdex.net/v2/en/cards/me01-001',
    detailAt: '2026-10-25T00:00:00Z', error: null }] }

function event(): TournamentSnapshot {
  const cards = [{ category: 'trainer' as const, count: 4, name: 'Rare Candy',
    set: 'MEG', number: '001' }]
  return { id: 'snap-1', eventId: 'abc', fetchedAt: '2026-10-25T00:00:00Z',
    source: 'Limitless Play API', sourceUrl: 'https://play.limitlesstcg.com/tournament/abc',
    publicUrl: 'https://play.limitlesstcg.com/tournament/abc', name: 'Cup',
    date: '2026-10-20', circuit: 'WESTERN', format: 'STANDARD', platform: 'PTCGL',
    isOnline: true, reportedPlayers: 2, phases: [],
    participations: [{ playerId: 'p', playerName: 'Player', country: null,
      placing: 1, record: null, deck: { id: 'd', name: 'Gardevoir' },
      listStatus: 'available', cards, cardTotal: 60 }],
    coverage: { returnedParticipants: 2, availableLists: 1, invalidLists: 0,
      missingLists: 1, complete60Lists: 1 }, cached: true }
}

describe('AI evidence engine', () => {
  it('answers model-selected read-only catalog and event queries with bounded provenance', () => {
    const engine = createAiEvidenceEngine(catalog, [event()], [],
      { from: '2026-10-01', to: '2026-10-25' })
    expect(engine.describe().operations).toEqual(['catalog.search', 'events.search'])
    const card = engine.execute({ operation: 'catalog.search', terms: ['evolution'] })
    expect(card.status).toBe('ok')
    expect(card.sourceIds).toEqual(['card:me01-001'])
    expect(card.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    const lists = engine.execute({ operation: 'events.search', deckName: 'Gardevoir',
      cardName: 'Rare Candy' })
    expect(lists.status).toBe('ok')
    expect(lists.sourceIds).toHaveLength(1)
    expect((lists.data as { scope: { matchingLists: number } }).scope.matchingLists).toBe(1)
  })

  it('rejects arbitrary operations, oversized pages and dates outside the allowed period', () => {
    const engine = createAiEvidenceEngine(catalog, [event()], [],
      { from: '2026-10-01', to: '2026-10-25' })
    for (const query of [{ operation: 'sql', statement: 'SELECT * FROM projects' },
      { operation: 'catalog.search', terms: ['Candy'], limit: 200 },
      { operation: 'catalog.search', terms: ['Candy'], file: 'profile.sqlite' },
      { operation: 'events.search', deckName: 'Gardevoir', from: '2026-09-01' }]) {
      const result = engine.execute(query)
      expect(result.status).toBe('rejected')
      expect(result.sourceIds).toEqual([])
    }
  })

  it('lets a planner choose different queries from the request and records each result', async () => {
    const engine = createAiEvidenceEngine(catalog, [event()], [],
      { from: '2026-10-01', to: '2026-10-25' })
    const calls: string[] = []
    const trace = await runAiEvidenceQueries('Come funziona Rare Candy in Gardevoir?',
      { cards: [] }, engine, async (prompt) => {
        calls.push(prompt)
        return { continueAfterResults: false,
          queries: [{ operation: 'catalog.search', terms: ['Rare', 'Candy'],
            mode: 'all' }, { operation: 'events.search', deckName: 'Gardevoir' }] }
      })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('Come funziona Rare Candy')
    expect(trace.requests.map((result) => result.status)).toEqual(['ok', 'ok'])
    expect(trace.requests[0].sourceIds).toEqual(['card:me01-001'])
    expect(trace.requests[1].sourceIds).toHaveLength(1)
    expect(trace.responseBytes).toBeGreaterThan(100)
    expect(trace.planningRounds).toBe(1)
    await expect(runAiEvidenceQueries('x', {}, engine,
      async () => ({ continueAfterResults: false,
        queries: Array(5).fill({ operation: 'catalog.search', terms: ['x'] }) })))
      .rejects.toThrow(/Piano/)
  })

  it('lets the planner refine a search after seeing the first local result', async () => {
    const engine = createAiEvidenceEngine(catalog, [], [],
      { from: '2026-10-01', to: '2026-10-25' })
    const trace = await runAiEvidenceQueries('Verifica questa stampa', {}, engine,
      async (prompt) => prompt.includes('RISULTATI DELLE QUERY PRECEDENTI')
        ? { continueAfterResults: false,
          queries: [{ operation: 'catalog.search', printIds: ['me01-001'] }] }
        : { continueAfterResults: true,
          queries: [{ operation: 'catalog.search', terms: ['Candy'] }] })
    expect(trace.planningRounds).toBe(2)
    expect(trace.requests.map((entry) => entry.sourceIds)).toEqual([
      ['card:me01-001'], ['card:me01-001']])
  })
})
