import { describe, expect, it } from 'vitest'
import type { CatalogPrint, CatalogView } from '../src/shared/catalog'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { evaluateDeckConstruction } from '../src/shared/deck-construction'

function print(id: string, name: string, category: string, stage: string | null = null,
  energyType: string | null = null, rarity: string | null = null): CatalogPrint {
  const [setId, localId] = id.split('-')
  return { id, setId, setName: setId, localId, name, category, stage, energyType,
    rarity, regulationMark: 'G', variants: null, identityId: id,
    identityBasis: 'unverified', imageBase: null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null,
    sourceUrl: `https://api.tcgdex.net/v2/en/cards/${id}`,
    detailAt: '2026-10-23T00:00:00.000Z', error: null }
}

const catalog: CatalogView = {
  circuit: 'WESTERN', source: 'TCGdex REST v2/en', sourceLanguage: 'en',
  scope: { setIds: ['sv02', 'sv04.5'], names: ['Iono', 'Mew ex'] },
  syncedAt: '2026-10-23T00:00:00.000Z', sets: [], prints: [
    print('sv02-185', 'Iono', 'Trainer'), print('sv02-254', 'Iono', 'Trainer'),
    print('sv04.5-216', 'Mew ex', 'Pokemon', 'Basic'),
    print('sv02-001', 'Floragato', 'Pokemon', 'Stage1'),
    print('sv02-002', 'Psychic Energy', 'Energy', null, 'Normal'),
    print('sv05-154', 'Maximum Belt', 'Trainer', null, null, 'ACE SPEC Rare'),
    print('sv05-157', 'Prime Catcher', 'Trainer', null, null, 'ACE SPEC Rare')
  ]
}

function baseline(rawText: string): DeckBaseline {
  return { projectId: 'p', importedAt: '2026-10-23T00:00:00.000Z', source: 'paste',
    fileName: null, rawText, ...parseDeck(rawText) }
}

describe('Costruzione generale del mazzo', () => {
  it('richiede esattamente 60 carte interpretate', () => {
    expect(evaluateDeckConstruction(baseline('59 Basic Psychic Energy'), catalog).cardCount.status).toBe('problem')
    expect(evaluateDeckConstruction(baseline('60 Basic Psychic Energy\n1 Iono PAL 185'), catalog).cardCount.status).toBe('problem')
  })

  it('conta 60 copie e un Pokémon Base esatto senza dichiarare legalità Standard', () => {
    const result = evaluateDeckConstruction(baseline('1 Mew ex PAF 216\n59 Basic Psychic Energy'), catalog)
    expect(result.cardCount.status).toBe('met')
    expect(result.copyLimit.status).toBe('met')
    expect(result.basicPokemon.status).toBe('met')
    expect(result.legality).toBe('indeterminate')
  })

  it('somma le rarità dello stesso nome e non esenta le Energie speciali', () => {
    const result = evaluateDeckConstruction(baseline('3 Iono PAL 185\n2 Iono PAL 254\n5 Double Turbo Energy'), catalog)
    expect(result.exceedingNames).toEqual([
      { name: 'Iono', quantity: 5 }, { name: 'Double Turbo Energy', quantity: 5 }
    ])
    expect(result.copyLimit.status).toBe('problem')
    expect(result.cardCount.status).toBe('problem')
  })

  it('lascia incerto il Pokémon Base quando il catalogo non copre una riga', () => {
    const result = evaluateDeckConstruction(baseline('4 Iono PAL 185\n56 Unknown Pokémon XYZ 001'), catalog)
    expect(result.basicPokemon.status).toBe('indeterminate')
    expect(result.copyLimit.status).toBe('problem')
  })

  it('rileva assenza di Base se tutte le carte sono classificate, e distingue righe non interpretate', () => {
    const noBasic = evaluateDeckConstruction(baseline('4 Iono PAL 185\n1 Floragato PAL 001'), catalog)
    expect(noBasic.basicPokemon.status).toBe('problem')
    const ambiguous = evaluateDeckConstruction(baseline('4 Iono PAL 185\n? carta incerta'), catalog)
    expect(ambiguous.cardCount.status).toBe('indeterminate')
    expect(ambiguous.copyLimit.status).toBe('indeterminate')
    expect(ambiguous.basicPokemon.status).toBe('indeterminate')
  })

  it('considera le Energie Base anche quando il catalogo non è stato sincronizzato', () => {
    const result = evaluateDeckConstruction(baseline('60 Basic Psychic Energy'), null)
    expect(result.copyLimit.status).toBe('met')
    expect(result.basicPokemon.status).toBe('problem')
    expect(result.cardCount.status).toBe('met')
  })

  it('limita a una sola carta ACE SPEC totale, anche con nomi diversi', () => {
    const two = evaluateDeckConstruction(baseline('1 Maximum Belt SV05 154\n1 Prime Catcher SV05 157'), catalog)
    expect(two.aceSpec.status).toBe('problem')
    expect(two.aceSpec.message).toContain('2 copie ACE SPEC')
    const one = evaluateDeckConstruction(baseline('1 Prime Catcher SV05 157'), catalog)
    expect(one.aceSpec.status).toBe('met')
    const unknown = evaluateDeckConstruction(baseline('1 Prime Catcher SV05 157\n1 Unknown XYZ 001'), catalog)
    expect(unknown.aceSpec.status).toBe('indeterminate')
  })
})
