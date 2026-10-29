import { describe, expect, it } from 'vitest'
import { createAiEvidenceEngine } from '../src/main/ai-evidence-engine'
import { aiQueryPlanningPrompt, extendAiEvidenceForText,
  runAiEvidenceQueries } from '../src/main/ai-evidence-queries'
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
  it('does not present missing overview support as an empty event sample', () => {
    const engine = createAiEvidenceEngine(catalog, [], [],
      { from: '2026-10-01', to: '2026-10-25' }, { names: () => [], search: () => ({ lists: [] }) })
    expect(engine.describe().operations).not.toContain('events.overview')
    expect(engine.execute({ operation: 'events.overview' }).status).toBe('rejected')
  })

  it('answers model-selected read-only catalog and event queries with bounded provenance', () => {
    const engine = createAiEvidenceEngine(catalog, [event()], [],
      { from: '2026-10-01', to: '2026-10-25' })
    expect(engine.describe().operations).toEqual(['catalog.search', 'events.search', 'events.overview'])
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
    expect(trace.requests.map((result) => result.status)).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(trace.requests[0].sourceIds).toEqual(['card:me01-001'])
    expect(trace.requests[1].sourceIds).toHaveLength(1)
    expect(trace.cardTargets).toEqual([{ name: 'Rare Candy', printIds: ['me01-001'], status: 'supplied' }])
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

  it('keeps a huge result set out of the planning context without dropping its originals', () => {
    const engine = createAiEvidenceEngine(catalog, [], [], { from: '2026-10-01', to: '2026-10-25' })
    const lists = Array.from({ length: 300 }, (_, index) => ({ listUrl: `https://example.test/${index}`,
      deck: `Deck ${index}`, cards: Array(60).fill('1 Illustrative Card MEG 001') }))
    const previous = [{ query: { operation: 'events.search' }, status: 'ok' as const,
      sourceIds: [], fingerprint: 'large', data: { lists } }]
    const prompt = aiQueryPlanningPrompt('Esamina tutte le varianti', {}, engine, previous)
    expect(Buffer.byteLength(prompt)).toBeLessThan(10_000)
    expect(prompt).toContain('"distinctDeckCount":300')
    expect(previous[0].data.lists).toHaveLength(300)
    expect(previous[0].data.lists[299].cards).toHaveLength(60)
  })

  it('recovers exact cards from assistant history and then from a draft without asking the user', async () => {
    const original = catalog.prints[0]
    const expanded: CatalogView = { ...catalog, prints: [original,
      { ...original, id: 'me01-200', localId: '200', name: 'Dragapult ex',
        identityId: 'dragapult-ex', gameplay: { ...original.gameplay!, hp: 320,
          attacks: [{ name: 'Phantom Dive', cost: ['Psychic'], damage: '200', effect: 'Put damage counters.' }] } },
      { ...original, id: 'me02-210', setId: 'me02', localId: '210', name: 'Dragapult ex',
        identityId: 'dragapult-ex', gameplay: { ...original.gameplay!, hp: 320,
          attacks: [{ name: 'Phantom Dive', cost: ['Psychic'], damage: '200', effect: 'Put damage counters.' }] } },
      { ...original, id: 'me01-201', localId: '201', name: 'Brave Bangle',
        identityId: 'brave-bangle', gameplay: { ...original.gameplay!, effect: 'Extra damage.' } }] }
    const engine = createAiEvidenceEngine(expanded, [], [],
      { from: '2026-10-01', to: '2026-10-25' })
    expect(engine.cardTargets('2 Dragapult ex ME02 210')[0].printIds)
      .toEqual(['me01-200', 'me02-210'])
    const trace = await runAiEvidenceQueries('E contro quel mazzo?', {}, engine,
      async () => ({ queries: [], continueAfterResults: false }),
      { contextTexts: ['La risposta precedente citava Dragapult ex.'] })
    expect(trace.cardTargets).toEqual([{ name: 'Dragapult ex',
      printIds: ['me01-200'], status: 'supplied' }])
    expect(trace.requests.flatMap((item) => item.sourceIds)).toContain('card:me01-200')
    expect(trace.requests.flatMap((item) => item.sourceIds)).not.toContain('card:me02-210')
    expect(extendAiEvidenceForText(trace, engine, 'Proverei Brave Bangle contro Dragapult ex.')).toBe(1)
    expect(trace.cardTargets?.find((item) => item.name === 'Brave Bangle')?.status).toBe('supplied')
    expect(trace.requests.flatMap((item) => item.sourceIds)).toContain('card:me01-201')
  })

  it('follows an archetype search into every named card of the returned event list', async () => {
    const original = catalog.prints[0]
    const expanded: CatalogView = { ...catalog, prints: [original,
      { ...original, id: 'me01-200', localId: '200', name: 'Dragapult ex',
        gameplay: { ...original.gameplay!, hp: 320 } },
      { ...original, id: 'me01-201', localId: '201', name: 'Meowth ex',
        gameplay: { ...original.gameplay!, hp: 190 } }] }
    const sample = event()
    sample.participations[0].deck = { id: 'basic-box', name: 'Basic Box' }
    sample.participations[0].cards = [
      { category: 'pokemon', count: 2, name: 'Dragapult ex', set: 'MEG', number: '200' },
      { category: 'pokemon', count: 2, name: 'Meowth ex', set: 'MEG', number: '201' }]
    const engine = createAiEvidenceEngine(expanded, [sample], [],
      { from: '2026-10-01', to: '2026-10-25' })
    const trace = await runAiEvidenceQueries('Confronta Basic Box con la mia lista', {}, engine,
      async () => ({ queries: [], continueAfterResults: false }))
    expect(trace.requests[0].query).toMatchObject({ operation: 'events.search', deckName: 'Basic Box' })
    expect(trace.requests.flatMap((item) => item.sourceIds)).toEqual(expect.arrayContaining([
      'card:me01-200', 'card:me01-201']))
    expect(trace.cardTargets?.map((item) => [item.name, item.status])).toEqual([
      ['Dragapult ex', 'supplied'], ['Meowth ex', 'supplied']])
  })

  it('keeps the end of a large evidence packet and permits iterative follow-up beyond two rounds', async () => {
    const engine = createAiEvidenceEngine(catalog, [], [],
      { from: '2026-10-01', to: '2026-10-25' })
    const prompt = aiQueryPlanningPrompt('Valuta', { long: 'x'.repeat(40_000),
      finalCard: 'Rare Candy' }, engine)
    expect(prompt).toContain('"finalCard":"Rare Candy"')
    let rounds = 0
    const trace = await runAiEvidenceQueries('Valuta la ricerca', {}, engine,
      async () => ({ queries: [{ operation: 'catalog.search', printIds: ['me01-001'] }],
        continueAfterResults: ++rounds < 4 }))
    expect(trace.planningRounds).toBe(4)
    expect(trace.exhausted).toBe(false)
  })

  it('collects every page while grouping identical lists and preserving every occurrence', async () => {
    const sample = event()
    const participant = sample.participations[0]
    sample.participations = Array.from({ length: 22 }, (_, index) => {
      const variant = Math.floor(index / 2)
      const cards = [
        { category: 'trainer' as const, count: variant + 1, name: 'Rare Candy', set: 'MEG', number: '001' },
        { category: 'energy' as const, count: 59 - variant, name: 'Basic Energy', set: 'SVE', number: '001' }]
      return { ...participant, playerId: `player-${index}`, placing: index + 1,
        deck: { id: 'wide-deck', name: 'Wide Deck' }, cards: index % 2 ? cards.reverse() : cards }
    })
    const engine = createAiEvidenceEngine(catalog, [sample], [],
      { from: '2026-10-01', to: '2026-10-25' })
    const trace = await runAiEvidenceQueries('Confronta le varianti', {}, engine,
      async () => ({ continueAfterResults: false,
        queries: [{ operation: 'events.search', deckName: 'Wide Deck', limit: 4 }] }))
    const pages = trace.requests.filter((request) => (request.query as { operation: string }).operation === 'events.search')
    expect(pages).toHaveLength(3)
    const lists = pages.flatMap((page) => (page.data as { lists: { cards: string[]; occurrences: { placing: number }[] }[] }).lists)
    expect(lists).toHaveLength(11)
    expect(lists.flatMap((list) => list.occurrences).map((item) => item.placing).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 22 }, (_, index) => index + 1))
    expect(pages[0].data).toMatchObject({ scope: { matchingLists: 22, distinctDecks: 11, duplicateLists: 11 } })
    expect(pages.at(-1)?.data).toMatchObject({ remaining: 0 })
  })

  it('distinguishes a delivered but incomplete local sheet from an unsent card', async () => {
    const incomplete: CatalogView = { ...catalog, prints: [{ ...catalog.prints[0],
      id: 'me01-099', localId: '099', name: 'Mystery Tool', gameplay: null }] }
    const engine = createAiEvidenceEngine(incomplete, [], [],
      { from: '2026-10-01', to: '2026-10-25' })
    const trace = await runAiEvidenceQueries('Valuta Mystery Tool', {}, engine,
      async () => ({ queries: [], continueAfterResults: false }))
    expect(trace.cardTargets).toEqual([{ name: 'Mystery Tool',
      printIds: ['me01-099'], status: 'missing-gameplay' }])
    expect(trace.exhausted).toBe(false)
  })

  it('preserves available records and each participation pairing without inventing missing outcomes', () => {
    const sample = event()
    sample.participations[0].record = { wins: 4, losses: 1, ties: 1 }
    sample.pairings = [{ phase: 1, round: 1, table: 3, match: null,
      player1: 'p', player2: 'opponent', winner: 'p' },
    { phase: 1, round: 2, table: null, match: null, player1: 'p', player2: null, winner: 'p' },
    { phase: 1, round: 3, table: 2, match: null, player1: 'x', player2: 'y', winner: null }]
    const engine = createAiEvidenceEngine(catalog, [sample], [], { from: '2026-10-01', to: '2026-10-25' })
    const result = engine.execute({ operation: 'events.search', deckName: 'Gardevoir' })
    const lists = (result.data as { lists: { occurrences: unknown[] }[] }).lists
    expect(lists[0].occurrences).toEqual([expect.objectContaining({ playerId: 'p',
      record: { wins: 4, losses: 1, ties: 1 }, pairings: sample.pairings.slice(0, 2) })])
  })
})
