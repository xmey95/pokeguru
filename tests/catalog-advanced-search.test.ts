import { describe, expect, it } from 'vitest'
import { CATALOG_SOURCE, type CardGameplay, type CatalogPrint, type CatalogView } from '../src/shared/catalog'
import { advancedCatalogCandidates, advancedCatalogMatches, advancedCatalogPage,
  hasCatalogAdvancedCriteria, readCatalogAdvancedAssessments, readCatalogAdvancedPlan,
  type CatalogAdvancedPlan } from '../src/main/catalog-advanced-search'
import { namedCatalogReferences, questionUsesCurrentDeck,
  searchCatalogAdvanced } from '../src/main/catalog-advanced-service'

function print(id: string, name: string, category: string, gameplay: CardGameplay | null,
  overrides: Partial<CatalogPrint> = {}): CatalogPrint {
  return { id, setId: id.split('-')[0], setName: 'Example', localId: id.split('-')[1],
    name, category, stage: category === 'Pokemon' ? 'Basic' : null, energyType: null,
    rarity: null, regulationMark: 'I', identityId: `game-${name}`,
    identityBasis: 'pokemon-text', variants: null, gameplay,
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: gameplay ? '2026-10-27T10:00:00Z' : null, error: null, ...overrides }
}

function game(effect: string, hp: number | null = null, retreat: number | null = null): CardGameplay {
  return { hp, types: hp === null ? [] : ['Darkness'], evolveFrom: null,
    attacks: [], abilities: [], effect, trainerType: hp === null ? 'Item' : null,
    weaknesses: [], resistances: [], retreat }
}

function catalog(prints: CatalogPrint[]): CatalogView {
  return { circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
    scope: { kind: 'standard-marks', setIds: ['me01', 'me02'], names: [] },
    syncedAt: '2026-10-27T10:00:00Z', sets: [], prints }
}

const emptyPlan: CatalogAdvancedPlan = { mode: 'exact', interpretation: 'Pokémon Base con almeno 200 PS e ritiro massimo 1.',
  category: 'Pokemon', stage: 'Basic', type: null, minHp: 200, maxHp: null,
  maxRetreat: 1, textGroups: [] }

describe('Catalog advanced search', () => {
  it('filters all local prints before grouping, paging and expansion filtering', () => {
    const cards = [
      print('me01-001', 'Example A', 'Pokemon', game('', 210, 1)),
      print('me02-011', 'Example A', 'Pokemon', game('', 210, 1)),
      print('me01-002', 'Example B', 'Pokemon', game('', 220, 2)),
      print('me02-012', 'Example C', 'Pokemon', game('', 230, 0), { stage: 'Stage1' }),
      print('me01-003', 'Example D', 'Pokemon', null)
    ]
    const candidates = advancedCatalogCandidates(catalog(cards), emptyPlan, '2026-10-27')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].printIds).toEqual(['me01-001', 'me02-011'])
    const matches = advancedCatalogMatches(candidates, emptyPlan, new Map(), 0)
    expect(advancedCatalogPage(matches, 'all', 0, 1)).toMatchObject({ total: 1,
      supported: 1, possible: 0 })
    expect(advancedCatalogPage(matches, 'me02', 0).groups[0].key).toBe('game-Example A')
    expect(advancedCatalogPage(matches, 'me03', 0).total).toBe(0)
  })

  it('keeps conditional and unreviewed semantic candidates visible after supported ones', () => {
    const cards = [
      print('me01-001', 'Energy Recycler', 'Trainer', game('Put Energy cards from your discard pile into your deck.')),
      print('me01-002', 'Energy Search', 'Trainer', game('Search your deck for an Energy card.')),
      print('me01-003', 'Discard Recovery', 'Trainer', game('Put a card from your discard pile into your hand.'))
    ]
    const plan: CatalogAdvancedPlan = { ...emptyPlan, mode: 'interpretive',
      interpretation: 'Carte che recuperano Energie dagli scarti.', category: null,
      stage: null, minHp: null, maxRetreat: null,
      textGroups: [['Energy'], ['discard pile']] }
    const candidates = advancedCatalogCandidates(catalog(cards), plan, '2026-10-27')
    expect(candidates).toHaveLength(3)
    const assessments = readCatalogAdvancedAssessments({ assessments: [
      { key: 'game-Energy Recycler', status: 'supported', reason: 'Recupera Energie dagli scarti.', conditions: null },
      { key: 'game-Energy Search', status: 'exclude', reason: 'Cerca nel mazzo.', conditions: null }
    ] }, candidates)
    const matches = advancedCatalogMatches(candidates, plan, assessments, 3)
    expect(matches.map((item) => [item.name, item.assessment])).toEqual([
      ['Energy Recycler', 'supported'], ['Discard Recovery', 'possible']])
    expect(matches[1].conditions).toMatch(/non è stata valutata/)
  })

  it('uses Codex for interpretation and semantic assessment with a bounded local candidate set', async () => {
    const cards = [print('me01-001', 'Energy Recycler', 'Trainer',
      game('Put Energy cards from your discard pile into your deck.'))]
    const source = catalog(cards)
    const prompts: string[] = []
    const result = await searchCatalogAdvanced(source, 'Carte che recuperano Energie dagli scarti',
      { selected: [], deckText: null, events: [] },
      { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }, undefined,
      async (prompt) => {
        prompts.push(prompt)
        return prompts.length === 1 ? { mode: 'interpretive',
          interpretation: 'Recupero di Energie dalla pila degli scarti.', category: null,
          stage: null, type: null, minHp: null, maxHp: null, maxRetreat: null,
          textGroups: [['Energy'], ['discard pile']] }
          : { assessments: [{ key: 'game-Energy Recycler', status: 'supported',
            reason: 'Rimette Energie dagli scarti nel mazzo.', conditions: null }] }
      })
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('Carte che recuperano Energie dagli scarti')
    expect(prompts[1]).toContain('me01-001')
    expect(result.scope).toMatchObject({ candidateGroups: 1, reviewedGroups: 1,
      unreviewedGroups: 0, semantic: true })
    expect(result.matches[0]).toMatchObject({ assessment: 'supported',
      printIds: ['me01-001'] })
  })

  it('does not treat literal effect terms as exact proof and sends deck context only on explicit request', () => {
    expect(readCatalogAdvancedPlan({ ...emptyPlan, textGroups: [['discard']] }).mode)
      .toBe('interpretive')
    expect(hasCatalogAdvancedCriteria(readCatalogAdvancedPlan({ ...emptyPlan, textGroups: [],
      category: null, stage: null, minHp: null, maxRetreat: null }))).toBe(false)
    expect(questionUsesCurrentDeck('Carte utili al mio mazzo contro Dragapult')).toBe(true)
    expect(questionUsesCurrentDeck('Carte utili contro Dragapult')).toBe(false)
    const source = catalog([print('me01-001', 'Munkidori', 'Pokemon', game('', 110, 1))])
    expect(namedCatalogReferences(source, 'Carte contro Munkidori XXX 123', []))
      .toHaveLength(1)
  })

  it('accepts broad Codex plans and finds non-contiguous English effect text', () => {
    const raw = { ...emptyPlan, mode: 'interpretive', category: null, stage: null,
      minHp: null, maxRetreat: null,
      textGroups: [Array.from({ length: 24 }, (_, index) => `unrelated ${index}`)
        .concat('recover Energy from discard pile')] }
    const plan = readCatalogAdvancedPlan(raw)
    expect(plan.textGroups[0]).toHaveLength(25)
    const cards = [print('me01-001', 'Energy Recycler', 'Trainer',
      game('Shuffle up to 5 basic Energy cards from your discard pile into your deck.'))]
    expect(advancedCatalogCandidates(catalog(cards), plan, '2026-10-27')
      .map((item) => item.group.name)).toEqual(['Energy Recycler'])
  })

  it('ranks a direct Ability lock ahead of generic Ability mentions', () => {
    const cards = Array.from({ length: 100 }, (_, index) =>
      print(`me01-${String(index).padStart(3, '0')}`, `Ability Card ${index}`, 'Trainer',
        game('This Pokémon has an Ability.')))
    cards.push(print('me01-999', 'Ability Lock', 'Trainer',
      game('Your opponent’s Pokémon have no Abilities.')))
    const plan = readCatalogAdvancedPlan({ ...emptyPlan, category: null, stage: null,
      minHp: null, maxRetreat: null, mode: 'interpretive',
      textGroups: [['Ability', 'no Abilities']] })
    expect(advancedCatalogCandidates(catalog(cards), plan, '2026-10-27')[0].group.name)
      .toBe('Ability Lock')
  })

  it('broadens a plan with no usable criteria instead of blaming the question', async () => {
    const cards = [print('me01-001', 'Ability Lock', 'Trainer',
      game('Your opponent’s Pokémon have no Abilities.'))]
    const calls: string[] = []
    const result = await searchCatalogAdvanced(catalog(cards), 'Carte utili contro le Abilità',
      { selected: [], deckText: null, events: [] },
      { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }, undefined,
      async (prompt) => {
        calls.push(prompt)
        if (calls.length === 1) return { ...emptyPlan, mode: 'interpretive',
          category: null, stage: null, minHp: null, maxRetreat: null, textGroups: [] }
        if (calls.length === 2) return { ...emptyPlan, mode: 'interpretive',
          category: null, stage: null, minHp: null, maxRetreat: null,
          textGroups: [['no Abilities']] }
        return { assessments: [{ key: 'game-Ability Lock', status: 'supported',
          reason: 'Impedisce le Abilità avversarie.', conditions: null }] }
      })
    expect(calls).toHaveLength(3)
    expect(calls[1]).toContain('Non chiedere chiarimenti')
    expect(result.matches[0]).toMatchObject({ name: 'Ability Lock', assessment: 'supported' })
  })

  it('tries broader retrieval when an English hint finds no local card', async () => {
    const cards = [print('me01-001', 'Bench Hitter', 'Pokemon',
      game('This attack does 30 damage to 1 of your opponent’s Benched Pokémon.', 110, 1))]
    let calls = 0
    const result = await searchCatalogAdvanced(catalog(cards), 'Carte che fanno danni alla Panchina',
      { selected: [], deckText: null, events: [] },
      { provider: 'codex', model: null, reasoningEffort: null, source: 'global' }, undefined,
      async () => {
        calls++
        if (calls === 1) return { ...emptyPlan, mode: 'interpretive',
          category: null, stage: null, minHp: null, maxRetreat: null,
          textGroups: [['sniping the farthest bench target']] }
        if (calls === 2) return { ...emptyPlan, mode: 'interpretive',
          category: null, stage: null, minHp: null, maxRetreat: null,
          textGroups: [['Benched Pokémon', 'damage to 1 of your opponent’s Pokémon']] }
        return { assessments: [{ key: 'game-Bench Hitter', status: 'supported',
          reason: 'Infligge danni alla Panchina avversaria.', conditions: null }] }
      })
    expect(calls).toBe(3)
    expect(result.matches[0].name).toBe('Bench Hitter')
  })

  it.skipIf(process.env.POKEGURU_PERF !== '1')('scans 5,000 and 10,000 prints before paging', () => {
    for (const count of [5_000, 10_000]) {
      const cards = Array.from({ length: count }, (_, index) =>
        print(`me01-${String(index).padStart(5, '0')}`, `Card ${index}`, 'Pokemon',
          game('', index % 2 ? 210 : 180, index % 3 ? 1 : 2)))
      const source = catalog(cards)
      const started = performance.now()
      const candidates = advancedCatalogCandidates(source, emptyPlan, '2026-10-27')
      const elapsed = Math.round(performance.now() - started)
      expect(candidates.length).toBe(cards.filter((item) =>
        item.gameplay!.hp! >= 200 && item.gameplay!.retreat! <= 1).length)
      const matches = advancedCatalogMatches(candidates, emptyPlan, new Map(), 0)
      expect(advancedCatalogPage(matches, 'all', 0).groups).toHaveLength(100)
      expect(advancedCatalogPage(matches, 'all', 100)).toMatchObject({ offset: 100,
        total: candidates.length })
      console.log(`Catalogo avanzato: ${count} stampe in ${elapsed} ms`)
      const semantic = readCatalogAdvancedPlan({ ...emptyPlan, mode: 'interpretive',
        category: null, stage: null, minHp: null, maxRetreat: null,
        textGroups: [Array.from({ length: 24 }, (_, index) => `irrelevant ${index}`)
          .concat('Darkness')] })
      const semanticStarted = performance.now()
      expect(advancedCatalogCandidates(source, semantic, '2026-10-27')).toHaveLength(count)
      console.log(`Catalogo semantico: ${count} stampe in ${Math.round(performance.now() - semanticStarted)} ms`)
    }
  })
})
