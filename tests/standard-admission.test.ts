import { expect, it } from 'vitest'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { evaluateSetAdmission } from '../src/shared/standard-admission'

function print(id: string, name: string, isPromo = false): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, localId, name, setName: setId, category: 'Trainer', rarity: 'Common',
    regulationMark: 'I', isPromo, variants: null, identityId: id, identityBasis: 'unverified',
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
}

const catalog: CatalogView = {
  circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: [], names: [] }, syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
  prints: [print('me02.5-001', 'Ascended Hero'), print('me03-001', 'Perfect Order'),
    print('sv06.5-040', 'Genesect'),
    print('30th-001', 'Celebration'), print('mep-051', 'Promo', true),
    print('future-001', 'Unknown')]
}

function baseline(rawText: string): DeckBaseline {
  return { projectId: 'p', importedAt: '2026-10-23T00:00:00.000Z', rawText,
    source: 'paste', fileName: null, ...parseDeck(rawText) }
}

it('usa la data esplicita di Ascended Heroes, non la data di uscita', () => {
  const deck = baseline('1 Ascended Hero ME02.5 001')
  expect(evaluateSetAdmission(deck, catalog, '2026-03-05').lines[0]).toMatchObject({
    status: 'waiting', legalDate: '2026-03-06'
  })
  expect(evaluateSetAdmission(deck, catalog, '2026-03-06').lines[0]).toMatchObject({
    status: 'admitted', legalDate: '2026-03-06'
  })
})

it('applica le due settimane ai set regolari coperti da calendario e regola', () => {
  const deck = baseline('2 Perfect Order ME03 001')
  expect(evaluateSetAdmission(deck, catalog, '2026-04-09').counts.waiting).toBe(2)
  expect(evaluateSetAdmission(deck, catalog, '2026-04-10').lines[0]).toMatchObject({
    status: 'admitted', legalDate: '2026-04-10'
  })
})

it('usa la data ufficiale dei Mondiali 2024 per Genesect SFA', () => {
  const deck = baseline('1 Genesect SFA 40')
  expect(evaluateSetAdmission(deck, catalog, '2024-08-15').lines[0]).toMatchObject({
    status: 'waiting', legalDate: '2024-08-16', setId: 'sv06.5'
  })
  expect(evaluateSetAdmission(deck, catalog, '2026-10-24').lines[0]).toMatchObject({
    status: 'admitted', legalDate: '2024-08-16', printId: 'sv06.5-040'
  })
})

it('lascia ignoti set speciali senza data confermata, promo e stampe non identificate', () => {
  const deck = baseline('1 Celebration 30TH 001\n1 Promo MEP 051\n1 Unknown FUTURE 001\n1 Missing ME03 999')
  const result = evaluateSetAdmission(deck, catalog, '2026-10-23')
  expect(result.lines.map((line) => line.status)).toEqual([
    'indeterminate', 'indeterminate', 'indeterminate', 'indeterminate'
  ])
  expect(result.lines[1].message).toContain('Promo')
  expect(result.counts.indeterminate).toBe(4)
  expect(evaluateSetAdmission(deck, null, '2026-10-23').counts.indeterminate).toBe(4)
})
