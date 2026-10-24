import { describe, expect, it } from 'vitest'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { evaluateWesternRotation, westernRotationRule } from '../src/shared/standard-rotation'

function print(id: string, name: string, mark: string | null, identityId: string): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, localId, name, setName: setId, category: 'Trainer', rarity: 'Common',
    regulationMark: mark, variants: null, identityId, identityBasis: 'trainer-text',
    imageBase: null, thumbnail: null, highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
}

const oldCandy = print('sv01-191', 'Rare Candy', 'G', 'rare-candy')
const newCandy = print('me01-125', 'Rare Candy', 'I', 'rare-candy')
const differentTextCandy = print('me01-126', 'Rare Candy', 'I', 'different-effect')
const oldIono = print('sv02-185', 'Iono', 'G', 'iono')
const oldIonoAlt = print('sv02-254', 'Iono', 'G', 'iono')
const noMark = print('sv04.5-089', 'Rare Candy', null, 'rare-candy')
const catalog: CatalogView = {
  circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: ['sv01', 'sv02', 'me01'], names: ['Rare Candy', 'Iono'] },
  syncedAt: '2026-10-23T00:00:00.000Z', sets: [],
  prints: [oldCandy, newCandy, differentTextCandy, oldIono, oldIonoAlt, noMark]
}

function baseline(rawText: string): DeckBaseline {
  return { projectId: 'p', importedAt: '2026-10-23T00:00:00.000Z', rawText,
    source: 'paste', fileName: null, ...parseDeck(rawText) }
}

describe('Rotazione Standard occidentale, solo marchio', () => {
  it('cambia automaticamente sul confine 2026 senza modificare la lista', () => {
    const deck = baseline('2 Iono PAL 185\n1 Iono PAL 254')
    const before = evaluateWesternRotation(deck, catalog, '2026-04-09')
    const after = evaluateWesternRotation(deck, catalog, '2026-04-10')
    expect(before.rule?.version).toBe('play-2025-01-09')
    expect(before.counts['mark-accepted']).toBe(3)
    expect(after.rule?.version).toBe('play-2026-01-09')
    expect(after.counts['mark-rotated']).toBe(3)
    expect(after.legality).toBe('indeterminate')
    expect(deck.rawText).toBe('2 Iono PAL 185\n1 Iono PAL 254')
  })

  it('riconosce una stampa Trainer storica già nota con identità e stampa corrente ammesse', () => {
    const result = evaluateWesternRotation(baseline('1 Rare Candy SVI 191\n1 Rare Candy MEG 125'), catalog, '2026-10-23')
    expect(result.lines.map((line) => line.status)).toEqual(['mark-accepted', 'mark-accepted'])
    expect(result.lines[0].message).toContain('me01-125')
    expect(result.legality).toBe('indeterminate')
  })

  it('non cambia l’esito storico in base a omonimi o altre stampe correnti', () => {
    const result = evaluateWesternRotation(baseline('1 Iono PAL 185'), catalog, '2026-10-23')
    expect(result.lines[0].status).toBe('mark-rotated')
    const withoutEquivalent = { ...catalog, prints: catalog.prints.filter((print) => print.id !== newCandy.id) }
    expect(evaluateWesternRotation(baseline('1 Rare Candy SVI 191'), withoutEquivalent, '2026-10-23')
      .lines[0].status).toBe('mark-rotated')
    const wrongText = { ...catalog, prints: catalog.prints.filter((print) => print.id !== newCandy.id) }
    expect(evaluateWesternRotation(baseline('1 Rare Candy SVI 191'), wrongText, '2026-10-23')
      .lines[0].status).toBe('mark-rotated')
  })

  it('lascia indeterminate stampa ignota, ALT, marchio mancante e futuro non documentato', () => {
    const result = evaluateWesternRotation(baseline('1 Iono PAL 999\n1 Iono SWSHALT 127\n1 Rare Candy PAF 089'), catalog, '2026-10-23')
    expect(result.lines.every((line) => line.status === 'indeterminate')).toBe(true)
    expect(result.lines[2].regulationMark).toBeNull()
    expect(westernRotationRule('2027-01-01')).toBeNull()
    expect(evaluateWesternRotation(baseline('1 Iono PAL 185'), catalog, '2027-01-01').counts.indeterminate).toBe(1)
  })

  it('non usa il solo nome né il set per attribuire un marchio', () => {
    const result = evaluateWesternRotation(baseline('1 Iono\n1 Iono PAL 185'), catalog, '2026-10-23')
    expect(result.lines.map((line) => line.status)).toEqual(['indeterminate', 'mark-rotated'])
    expect(evaluateWesternRotation(baseline('1 Iono PAL 185'), null, '2026-10-23').counts.indeterminate).toBe(1)
  })
})
