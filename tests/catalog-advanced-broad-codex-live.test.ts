import { expect, it } from 'vitest'
import { searchCatalogAdvanced } from '../src/main/catalog-advanced-service'
import { CATALOG_SOURCE, type CatalogPrint, type CatalogView } from '../src/shared/catalog'

const card = (id: string, name: string, effect: string, category = 'Trainer'): CatalogPrint => ({
  id, setId: 'me01', setName: 'Fixture', localId: id.split('-')[1], name, category,
  stage: category === 'Pokemon' ? 'Basic' : null, energyType: null, rarity: null,
  regulationMark: 'I', identityId: id, identityBasis: 'trainer-text', variants: null,
  gameplay: { hp: category === 'Pokemon' ? 110 : null, types: category === 'Pokemon' ? ['Darkness'] : [],
    evolveFrom: null, attacks: [], abilities: [], effect, trainerType: category === 'Trainer' ? 'Item' : null,
    weaknesses: [], resistances: [], retreat: category === 'Pokemon' ? 1 : null },
  imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
  sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
  detailAt: '2026-10-27T10:00:00Z', error: null
})

it.skipIf(process.env.POKEGURU_LIVE_CODEX !== '1')('filters broad Italian questions with real Codex', async () => {
  const catalog: CatalogView = { circuit: 'WESTERN', source: CATALOG_SOURCE,
    sourceLanguage: 'en', scope: { kind: 'standard-marks', setIds: ['me01'], names: [] },
    syncedAt: '2026-10-27T10:00:00Z', sets: [], prints: [
      card('me01-001', 'Munkidori', 'If this Pokémon has any Darkness Energy attached, you may move up to 3 damage counters from 1 of your Pokémon to 1 of your opponent’s Pokémon.', 'Pokemon'),
      card('me01-002', 'Ability Lock', 'Your opponent’s Pokémon have no Abilities.'),
      card('me01-003', 'Energy Removal', 'Discard an Energy from 1 of your opponent’s Pokémon.'),
      card('me01-004', 'Bench Hitter', 'This attack does 30 damage to 1 of your opponent’s Benched Pokémon.', 'Pokemon')
    ] }
  for (const [question, expected] of [
    ['Tutte le carte che contrastano Munkidori', 'Ability Lock'],
    ['Carte utili contro le Abilità', 'Ability Lock'],
    ['Carte che fanno danni alla Panchina', 'Bench Hitter']
  ]) {
    const result = await searchCatalogAdvanced(catalog, question,
      { selected: [], deckText: null, events: [] },
      { provider: 'codex', model: null, reasoningEffort: null, source: 'global' })
    expect(result.matches.map((item) => item.name)).toContain(expected)
    expect(result.scope.semantic).toBe(true)
  }
}, 240_000)
