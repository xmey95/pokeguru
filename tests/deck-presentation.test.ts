import { describe, expect, it } from 'vitest'
import { hydrappleItalianDeck } from './fixtures/hydrapple-italian'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { buildDeckCards } from '../src/shared/reconciliation'
import { deckGameplayPrint, deckImageCopies, deckThumbnail, groupDeckCards } from '../src/renderer/src/deck-presentation'

const print = (id: string, category: string, thumbnail: string | null = null): CatalogPrint => ({
  id, setId: 'sv02', setName: 'Fixture', localId: id.split('-')[1], name: 'Iono',
  category, rarity: null, variants: null, identityId: 'iono', identityBasis: 'trainer-text',
  imageBase: null, thumbnail, highImageAvailable: null, sourceUpdated: null,
  sourceUrl: 'https://api.tcgdex.net/v2/en/cards/' + id, detailAt: '2026-10-24T00:00:00Z', error: null
})
const catalog: CatalogView = {
  circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: ['sv02'], names: ['Iono'] }, sets: [], syncedAt: '2026-10-24T00:00:00Z',
  prints: [print('sv02-185', 'Trainer', 'image-a'), print('sv02-254', 'Trainer', 'image-b')]
}
function baseline(rawText: string): DeckBaseline {
  return { ...parseDeck(rawText), projectId: 'p', importedAt: '2026-10-24T00:00:00Z', rawText, source: 'paste', fileName: null }
}

describe('Presentazione delle categorie della lista', () => {
  it('conserva i conteggi italiani nella lista principale anche senza catalogo', () => {
    const deck = baseline(hydrappleItalianDeck)
    const result = groupDeckCards(buildDeckCards(deck, { ...catalog, prints: [] }), deck)
    expect(result.groups.map(group => group.total)).toEqual([21, 25, 14, 0])
  })
  it('conta le copie dopo la riconciliazione e preferisce il catalogo alle intestazioni errate', () => {
    const deck = baseline('1 Sconosciuta\nPokémon: 99\n2 Iono PAL 185\nAllenatori: 0\n1 Iono PAL 254\nEnergy: 999\n4 Energia non identificata')
    const cards = buildDeckCards(deck, catalog)
    const result = groupDeckCards(cards, deck)
    expect(result.groups.map((group) => [group.name, group.total])).toEqual([
      ['Pokémon', 0], ['Allenatori', 3], ['Energie', 4], ['Da classificare', 1]
    ])
    expect(result.groups[1].cards).toHaveLength(1)
    expect(result.groups.reduce((sum, group) => sum + group.total, 0)).toBe(deck.interpretedTotal)
    expect(result.usesImportHeadings).toBe(true)
  })

  it('non deduce la categoria dal nome o da identità ambigue senza intestazioni', () => {
    const deck = baseline('2 Mega Absol ex\n3 Basic Psychic Energy\n1 Iono ALT 12')
    const result = groupDeckCards(buildDeckCards(deck, catalog), deck)
    expect(result.groups.map((group) => group.total)).toEqual([0, 0, 0, 6])
    expect(result.usesImportHeadings).toBe(false)
    expect(buildDeckCards(deck, catalog).map(deckThumbnail)).toEqual([null, null, null])
  })

  it('lascia da classificare dati del catalogo discordanti e righe raggruppate sotto intestazioni diverse', () => {
    const deck = baseline('Pokémon\n2 Iono PAL 185\nEnergy\n1 Iono PAL 254')
    const cards = buildDeckCards(deck, catalog)
    const conflicting = [{ ...cards[0], prints: [print('sv02-185', 'Trainer'), print('sv02-254', 'Energy')] }]
    expect(groupDeckCards(conflicting, deck).groups[3].total).toBe(3)
    expect(groupDeckCards([{ ...cards[0], prints: [] }], deck).groups[3].total).toBe(3)
  })

  it('sceglie la miniatura della stampa importata, poi una della stessa identità', () => {
    const deck = baseline('1 Iono PAL 254')
    const card = buildDeckCards(deck, catalog)[0]
    expect(deckThumbnail(card)).toBe('image-b')
    expect(deckThumbnail({ ...card, prints: [print('sv02-185', 'Trainer', 'image-a'), print('sv02-254', 'Trainer')] })).toBe('image-a')
    expect(deckThumbnail({ ...card, prints: [] })).toBeNull()
  })

  it('mostra ogni copia nella stampa importata, senza sostituire una scansione assente con un’altra stampa', () => {
    const card = buildDeckCards(baseline('2 Iono PAL 185\n1 Iono PAL 254'), catalog)[0]
    expect(deckImageCopies(card)).toEqual([
      { src: 'image-a', print: 'PAL 185' }, { src: 'image-a', print: 'PAL 185' },
      { src: 'image-b', print: 'PAL 254' }
    ])
    const missing = { ...card, prints: [print('sv02-185', 'Trainer'), print('sv02-254', 'Trainer', 'image-b')] }
    expect(deckImageCopies(missing).map((copy) => copy.src)).toEqual([null, null, 'image-b'])
  })

  it('mostra il testo di una sola stampa della stessa identità, preferendo quella importata', () => {
    const card = buildDeckCards(baseline('1 Iono PAL 254'), catalog)[0]
    const gameplay = {
      hp: null, types: [], evolveFrom: null, attacks: [], abilities: [],
      effect: 'UI fixture', trainerType: 'Supporter', weaknesses: [], resistances: [], retreat: null
    }
    const other = { ...card.prints[0], gameplay }
    const imported = { ...card.prints[1], gameplay: { ...gameplay, trainerType: null } }
    expect(deckGameplayPrint({ ...card, prints: [other, imported] })).toBe(imported)
    expect(deckGameplayPrint({ ...card, prints: [other, imported] })?.gameplay?.trainerType).toBeNull()
    expect(deckGameplayPrint({ ...card, prints: [other, card.prints[1]] })).toBe(other)
    expect(deckGameplayPrint({ ...card, prints: [] })).toBeNull()
  })
})
