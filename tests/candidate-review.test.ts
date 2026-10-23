import { expect, it } from 'vitest'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import type { DeckConstraint } from '../src/shared/constraints'
import { parseDeck } from '../src/shared/deck-import'
import type { DeckCandidate } from '../src/shared/deck-threads'
import { reviewCandidate } from '../src/shared/candidate-review'

function print(id: string, name: string, category: string, stage: string | null): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, localId, name, setName: setId, category, stage, rarity: 'Common',
    regulationMark: 'I', variants: null, identityId: id, identityBasis: 'unverified',
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
}

const catalog: CatalogView = { circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: [], names: [] }, syncedAt: '2026-10-23T00:00:00.000Z', sets: [], prints: [
    print('me01-086', 'Mega Absol ex', 'Pokemon', 'Basic'), print('sv02-185', 'Iono', 'Trainer', null)
  ] }

function candidate(rawText: string): DeckCandidate {
  return { id: 'candidate', sequence: 1, rawText, parsed: parseDeck(rawText), note: '',
    createdAt: '2026-10-23T00:00:00.000Z', origin: 'manual', aiConfig: null, aiTurnId: null,
    sources: [], checks: [] }
}

const ionoConstraint: DeckConstraint = { id: 'constraint', projectId: 'p', identityId: 'sv02-185',
  identityName: 'Iono', printId: null, kind: 'required', quantity: 1,
  createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z' }

it('blocca vincoli mancanti e righe illeggibili, ma non trasforma l’incertezza in legalità', () => {
  const withoutIono = candidate('1 Mega Absol ex MEG 86\n59 Basic Psychic Energy')
  const review = reviewCandidate('p', withoutIono, catalog, [ionoConstraint], '2026-10-23')
  expect(review.blockers.some((item) => item.includes('Vincolo Iono'))).toBe(true)
  const valid = reviewCandidate('p', candidate('1 Mega Absol ex MEG 86\n58 Basic Psychic Energy\n1 Iono PAL 185'),
    catalog, [ionoConstraint], '2026-10-23')
  expect(valid.blockers).toEqual([])
  expect(valid.toReview.length).toBeGreaterThan(0)
  expect(valid.legal).toBe('indeterminate')
  const unreadable = reviewCandidate('p', candidate('1 Mega Absol ex MEG 86\n58 Basic Psychic Energy\n?'),
    catalog, [], '2026-10-23')
  expect(unreadable.blockers.some((item) => item.includes('righe non interpretate'))).toBe(true)
  const dotted = reviewCandidate('p', candidate('1 Mega Absol ex ME99.5 86\n59 Basic Psychic Energy'),
    catalog, [], '2026-10-23')
  expect(dotted.blockers.some((item) => item.includes('Codici set con punto'))).toBe(true)
})
