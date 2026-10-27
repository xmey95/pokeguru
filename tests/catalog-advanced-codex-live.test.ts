import { expect, it } from 'vitest'
import { searchCatalogAdvanced } from '../src/main/catalog-advanced-service'
import { CATALOG_SOURCE, type CatalogPrint, type CatalogView } from '../src/shared/catalog'

function card(id: string, name: string, effect: string): CatalogPrint {
  return { id, setId: 'me01', setName: 'Fixture', localId: id.split('-')[1],
    name, category: 'Trainer', stage: null, energyType: null, rarity: 'Uncommon',
    regulationMark: 'I', identityId: id, identityBasis: 'trainer-text',
    variants: null, gameplay: { hp: null, types: [], evolveFrom: null,
      attacks: [], abilities: [], effect, trainerType: 'Item',
      weaknesses: [], resistances: [], retreat: null },
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-27T10:00:00Z', error: null }
}

it.skipIf(process.env.POKEGURU_LIVE_CODEX !== '1')('filters a local catalog with real Codex interpretation and assessment', async () => {
  const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE,
    sourceLanguage: 'en', scope: { kind: 'standard-marks', setIds: ['me01'], names: [] },
    syncedAt: '2026-10-27T10:00:00Z', sets: [], prints: [
      card('me01-001', 'Energy Recycler', 'Shuffle up to 5 basic Energy cards from your discard pile into your deck.'),
      card('me01-002', 'Energy Search', 'Search your deck for a basic Energy card. Reveal it and put it into your hand.'),
      card('me01-003', 'Discard Recovery', 'Put a Pokémon from your discard pile into your hand.')
    ] }
  const result = await searchCatalogAdvanced(catalog,
    'Mostrami le carte che recuperano Energie dalla pila degli scarti.',
    { selected: [], deckText: null, events: [] },
    { provider: 'codex', model: null, reasoningEffort: null, source: 'global' })
  expect(result.scope.semantic).toBe(true)
  expect(result.scope.indexedPrints).toBe(3)
  expect(result.matches.map((item) => item.name)).toContain('Energy Recycler')
  expect(result.matches.every((item) => catalog.prints.some((print) => print.id === item.printIds[0])))
    .toBe(true)
  console.log('Ricerca Catalogo Codex:', { candidate: result.scope.candidateGroups,
    reviewed: result.scope.reviewedGroups, matches: result.matches.map((item) =>
      ({ name: item.name, assessment: item.assessment, reason: item.reason })) })

  const numeric: CatalogView = { ...catalog, prints: [
    { ...card('me01-011', 'Sturdy Basic', ''), category: 'Pokemon', stage: 'Basic',
      gameplay: { hp: 220, types: ['Darkness'], evolveFrom: null, attacks: [], abilities: [],
        effect: null, trainerType: null, weaknesses: [], resistances: [], retreat: 1 } },
    { ...card('me01-012', 'Slow Basic', ''), category: 'Pokemon', stage: 'Basic',
      gameplay: { hp: 230, types: ['Darkness'], evolveFrom: null, attacks: [], abilities: [],
        effect: null, trainerType: null, weaknesses: [], resistances: [], retreat: 2 } },
    { ...card('me01-013', 'Evolved', ''), category: 'Pokemon', stage: 'Stage1',
      gameplay: { hp: 240, types: ['Darkness'], evolveFrom: 'Sturdy Basic', attacks: [], abilities: [],
        effect: null, trainerType: null, weaknesses: [], resistances: [], retreat: 0 } }
  ] }
  const exact = await searchCatalogAdvanced(numeric,
    'Mostrami tutti i Pokémon Base con almeno 200 PS e costo di ritirata massimo 1.',
    { selected: [], deckText: null, events: [] },
    { provider: 'codex', model: null, reasoningEffort: null, source: 'global' })
  expect(exact.matches.map((item) => item.name)).toEqual(['Sturdy Basic'])
  expect(exact.scope).toMatchObject({ semantic: false, reviewedGroups: 1, unreviewedGroups: 0 })
}, 240_000)
