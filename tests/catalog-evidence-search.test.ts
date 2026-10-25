import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { searchCatalogEvidence } from '../src/main/catalog-evidence-search'
import { CatalogStore } from '../src/main/catalog'
import { CATALOG_SOURCE, type CatalogPrint, type CatalogView } from '../src/shared/catalog'
import { effectiveCardGameplay } from '../src/shared/card-errata'
import { BUNDLED_WESTERN_RULE_PACKAGE, parseWesternRulePackage } from '../src/shared/western-rule-package'

function trainer(id: string, effect: string | null): CatalogPrint {
  return { id, setId: 'me01', setName: 'Mega Evolution', localId: id.split('-')[1],
    name: 'Rare Candy', category: 'Trainer', stage: null, energyType: null,
    rarity: 'Uncommon', regulationMark: 'I', variants: { normal: true, reverse: true },
    identityId: effect ? `trainer-${effect}` : id,
    identityBasis: effect ? 'trainer-text' : 'unverified',
    gameplaySchemaVersion: 1,
    gameplay: effect ? { hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
      effect, trainerType: 'Item', weaknesses: [], resistances: [], retreat: null } : null,
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: effect ? '2026-10-25T08:00:00Z' : null, error: null }
}

function view(prints: CatalogPrint[], expected = prints.length): CatalogView {
  return { circuit: 'WESTERN', source: CATALOG_SOURCE, sourceLanguage: 'en',
    scope: { kind: 'standard-marks', setIds: ['me01'], names: [] },
    standardCoverage: { expected, acquired: prints.filter((print) => print.detailAt).length,
      missing: prints.filter((print) => !print.detailAt).length,
      gameplayAcquired: prints.filter((print) => !!print.gameplay).length,
      gameplayMissing: prints.filter((print) => !print.gameplay).length,
      marks: ['I'], releaseSource: { url: 'https://www.pokemon.com', version: 1,
        checkedAt: '2026-10-25' },
      officialSets: { expected: 1, present: 1, missing: 0, missingSets: [] },
      bySet: [], promos: { expected: 0, acquired: 0, missing: 0, series: 0,
        available: 0, upcoming: 0, unlisted: 0, unchecked: 0 } },
    syncedAt: '2026-10-25T08:00:00Z', sets: [], prints }
}

describe('Catalog evidence search', () => {
  it('searches all local prints before paging and reports gaps separately', () => {
    const cards = [trainer('me01-001', 'Search your deck for a Pokémon that evolves.'),
      trainer('me01-002', 'Search your deck for a Pokémon that evolves.'),
      trainer('me01-003', 'Put two damage counters on the opponent.'),
      trainer('me01-004', null)]
    const catalog = view(cards)
    const result = searchCatalogEvidence(catalog, { terms: ['search', 'evolves'],
      mode: 'all', limit: 1 })
    expect(result.totalMatches).toBe(2)
    expect(result.matches.map((item) => item.printId)).toEqual(['me01-001'])
    expect(result.remaining).toBe(1)
    expect(result.scope).toMatchObject({ expected: 4, indexed: 4, withDetail: 3,
      withGameplay: 3, withoutDetail: 1, incompleteGameplay: 1, notInventoried: 0 })
    expect(result.scope.missingPreview).toEqual(['me01-004'])
    expect(result.completeForLocalCriterion).toBe(false)
    expect(searchCatalogEvidence(catalog, { terms: ['damage'] }).matches
      .map((item) => item.printId)).toEqual(['me01-003'])
  })

  it('keeps exact prints and different game identities distinct', () => {
    const catalog = view([trainer('me01-001', 'Draw two cards.'),
      trainer('me01-002', 'Draw two cards.'),
      trainer('me01-003', 'Draw three cards.')])
    const result = searchCatalogEvidence(catalog, {
      printIds: ['me01-003'], identityIds: ['trainer-Draw two cards.'] })
    expect(result.matches.map((item) => [item.printId, item.reason])).toEqual([
      ['me01-003', 'exact-print'], ['me01-001', 'same-identity'],
      ['me01-002', 'same-identity']])
    expect(result.completeForLocalCriterion).toBe(true)
    const revised = view([trainer('me01-001', 'Draw one card.'),
      ...catalog.prints.slice(1)])
    expect(searchCatalogEvidence(revised, { terms: ['draw'] }).snapshotHash)
      .not.toBe(searchCatalogEvidence(catalog, { terms: ['draw'] }).snapshotHash)
    const missing = searchCatalogEvidence(catalog, { printIds: ['me01-999'],
      identityIds: ['unseen'] })
    expect(missing.unknownPrintIds).toEqual(['me01-999'])
    expect(missing.unknownIdentityIds).toEqual(['unseen'])
    expect(missing.completeForLocalCriterion).toBe(false)
  })

  it('uses only an exact, sourced and effective correction while preserving printed text', () => {
    const original = trainer('me01-001', 'Draw one card.')
    const different = trainer('me01-002', 'Draw one card.')
    const corrected = { ...original.gameplay!, effect: 'Draw two cards.' }
    const rules = structuredClone(BUNDLED_WESTERN_RULE_PACKAGE)
    rules.errata.corrections = [{ printId: original.id, effectiveFrom: '2026-10-24',
      sourceUrl: 'https://play.pokemon.com/en-us/resources/documents/tcg-errata/',
      printed: original.gameplay!, corrected }]
    const packageWithErrata = parseWesternRulePackage(rules)
    const catalog = { ...view([original, different]), rulePackage: packageWithErrata }
    const result = searchCatalogEvidence(catalog, { terms: ['two'], asOf: '2026-10-25' })
    expect(result.matches.map((match) => match.printId)).toEqual(['me01-001'])
    expect(result.matches[0]).toMatchObject({ gameplay: corrected,
      printedGameplay: original.gameplay, errataStatus: 'applied' })
    expect(searchCatalogEvidence(catalog, { terms: ['two'], asOf: '2026-10-23' }).totalMatches).toBe(0)
    expect(effectiveCardGameplay(different, '2026-10-25', packageWithErrata).status).toBe('no-correction')
    expect(effectiveCardGameplay({ ...original,
      gameplay: { ...original.gameplay!, effect: 'Draw three cards.' } },
    '2026-10-25', packageWithErrata).status).toBe('source-mismatch')
    const unsafe = structuredClone(rules)
    unsafe.errata.corrections![0].sourceUrl = 'https://example.org/errata'
    expect(() => parseWesternRulePackage(unsafe)).toThrow(/Errata/)
  })

  it('reopens the indexed inventory from SQLite with the same evidence hash', () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-evidence-index-'))
    const path = join(folder, 'catalog.sqlite')
    try {
      let store = new CatalogStore(path)
      store.save({ sets: [{ id: 'me01', name: 'Mega Evolution', sourceTotal: 2,
        sampleTotal: 2, fetchedAt: '2026-10-25T00:00:00Z' }],
      prints: [trainer('me01-001', 'Draw two cards.'),
        trainer('me01-002', 'Search your deck.')],
      fetchedAt: '2026-10-25T00:00:00Z' }, 'standard-marks')
      const before = searchCatalogEvidence(store.view(), { terms: ['search'], asOf: '2026-10-25' })
      store.close()
      store = new CatalogStore(path)
      const after = searchCatalogEvidence(store.view(), { terms: ['search'], asOf: '2026-10-25' })
      expect(after.snapshotHash).toBe(before.snapshotHash)
      expect(after.matches.map((card) => card.printId)).toEqual(['me01-002'])
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
})
