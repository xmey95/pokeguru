import { expect, it } from 'vitest'
import type { CatalogPrint, CatalogView, PromoStatus } from '../src/shared/catalog'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { evaluatePromoAdmission } from '../src/shared/promo-admission'

function print(number: string, status: PromoStatus | null): CatalogPrint {
  const id = `mep-${number}`
  return { id, setId: 'mep', localId: number, name: `Promo ${number}`, setName: 'MEP',
    category: 'Pokemon', rarity: 'Promo', regulationMark: 'J', isPromo: true,
    promoStatus: status, variants: null, identityId: id, identityBasis: 'unverified',
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
}

const checkedAt = '2026-10-23T12:00:00.000Z'
const catalog: CatalogView = {
  circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: ['mep'], names: [] }, syncedAt: checkedAt, sets: [],
  promoAudit: { sourceUrl: 'https://www.pokemon.com/uk/play-pokemon/about/pokemon-tcg-promo-card-legality-status',
    checkedAt, error: null, series: ['MEP'], packageVersion: 2, complete: true },
  prints: [
    print('051', { state: 'available', legalDate: null, dateNote: null, checkedAt }),
    print('111', { state: 'upcoming', legalDate: '2026-11-20', dateNote: null, checkedAt }),
    print('117', { state: 'upcoming', legalDate: null, dateNote: 'Upon Release', checkedAt }),
    print('999', { state: 'unlisted', legalDate: null, dateNote: null, checkedAt }),
    print('998', null)
  ]
}

function baseline(text: string): DeckBaseline {
  return { projectId: 'p', importedAt: checkedAt, rawText: text,
    source: 'paste', fileName: null, ...parseDeck(text) }
}

it('non inventa la data storica delle promo disponibili', () => {
  const deck = baseline('2 Promo 051 MEP 051')
  expect(evaluatePromoAdmission(deck, catalog, '2026-10-22').lines[0].status).toBe('indeterminate')
  const current = evaluatePromoAdmission(deck, catalog, '2026-10-23')
  expect(current.counts.admitted).toBe(2)
  expect(current.packageVersion).toBe(2)
})

it('una promo futura passa da attesa a indeterminata finché il registro non viene aggiornato', () => {
  const deck = baseline('1 Promo 111 MEP 111')
  expect(evaluatePromoAdmission(deck, catalog, '2026-11-19').lines[0]).toMatchObject({ status: 'waiting' })
  expect(evaluatePromoAdmission(deck, catalog, '2026-11-20').lines[0]).toMatchObject({ status: 'indeterminate' })
})

it('lascia indeterminate promo con Upon Release, assenti e non classificate', () => {
  const deck = baseline('1 Promo 117 MEP 117\n1 Promo 999 MEP 999\n1 Promo 998 MEP 998')
  const result = evaluatePromoAdmission(deck, catalog, '2026-10-23')
  expect(result.lines.map((line) => line.status)).toEqual(['indeterminate', 'indeterminate', 'indeterminate'])
  expect(result.lines[0].message).toContain('Upon Release')
  expect(result.counts.indeterminate).toBe(3)
})
