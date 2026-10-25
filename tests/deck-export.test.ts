import { describe, expect, it } from 'vitest'
import { parseDeck, type DeckBaseline } from '../src/shared/deck-import'
import { prepareDeckExport } from '../src/shared/deck-export'
import { hydrappleItalianDeck } from './fixtures/hydrapple-italian'

function baseline(rawText: string): DeckBaseline {
  return { projectId: 'project', importedAt: '2026-10-23T00:00:00.000Z', source: 'paste',
    fileName: null, rawText, ...parseDeck(rawText) }
}

function cardSignatures(rawText: string): string[] {
  return parseDeck(rawText).lines.filter((line) => line.kind === 'card')
    .map((line) => `${line.quantity}|${line.name}|${line.setCode ?? ''}|${line.cardNumber ?? ''}|${line.printVariant ?? ''}`)
}

describe('APP-008 export', () => {
  it('preserva quantità, set, numeri, ALT e variante PH nel round trip', () => {
    const raw = [
      'Pokémon: 7', '2 Zapdos PGO 29 PH', '1 Carta promo PR-SV 001a', '',
      'Trainers: 9', '2 Iono PAL 185', '1 Iono PAL 254', "1 Boss's Orders SWSHALT 127", '',
      'Energy: 1', '3 Basic {P} Energy SVE 5', '', 'Total Cards: 99'
    ].join('\n')
    const exportResult = prepareDeckExport(baseline(raw))
    expect(exportResult.canExport).toBe(true)
    expect(exportResult.cardTotal).toBe(10)
    expect(exportResult.text).toContain('Pokémon: 2\n2 Zapdos PGO 29 PH\n1 Carta promo PR-SV 001a')
    expect(exportResult.text).toContain('Trainer: 3')
    expect(exportResult.text).toContain('Energy: 1')
    expect(exportResult.text).toContain('Total Cards: 10')
    expect(exportResult.text).not.toContain('Total Cards: 99')
    expect(cardSignatures(exportResult.text)).toEqual(cardSignatures(raw))
    expect(parseDeck(exportResult.text).declaredTotal).toBe(10)
    expect(parseDeck(exportResult.text).diagnostics.some((item) => item.code === 'TOTAL_MISMATCH')).toBe(false)
    expect(exportResult.notes).toContain('Totale aggiornato da 99 a 10, calcolato dalle quantità delle carte.')
    expect(exportResult.notes.some((note) => note.includes('ALT'))).toBe(true)
  })

  it('blocca export di righe non interpretate per evitare perdita silenziosa', () => {
    const result = prepareDeckExport(baseline('2 Iono PAL 185\n? carta dubbia\nTotal Cards: 3'))
    expect(result.canExport).toBe(false)
    expect(result.text).toBe('')
    expect(result.notes.some((note) => note.includes('righe non interpretate'))).toBe(true)
  })

  it('mantiene le righe senza sezione e segnala la verifica necessaria nel client', () => {
    const raw = '2 Arven\n2 Iono\n7 Psychic Energy'
    const result = prepareDeckExport(baseline(raw))
    expect(result.text).toContain('2 Arven\n2 Iono\n7 Psychic Energy')
    expect(result.text).toContain('Total Cards: 11')
    expect(cardSignatures(result.text)).toEqual(cardSignatures(raw))
    expect(result.notes.some((note) => note.includes('non ha sezioni'))).toBe(true)
  })

  it('converte codici TCGdex e numeri nel formato Live senza cambiare stampa, variante o copie', () => {
    const raw = [
      'Pokémon: 99', '2 Mega Absol ex ME01 086 PH', "1 N's Zorua SVP 189",
      '1 Charcadet MEP 022', '', 'Trainer: 99', '2 Rare Candy SV04.5 089',
      '1 Iono PAL 254', '', 'Energy: 99', '14 Basic {G} Energy MEE 001'
    ].join('\n')
    const result = prepareDeckExport(baseline(raw))
    expect(result.canExport).toBe(true)
    expect(result.text).toBe([
      'Pokémon: 3', '2 Mega Absol ex MEG 86 PH', "1 N's Zorua PR-SV 189",
      '1 Charcadet MEP 22', '', 'Trainer: 2', '2 Rare Candy PAF 89',
      '1 Iono PAL 254', '', 'Energy: 1', '14 Basic {G} Energy MEE 1',
      '', 'Total Cards: 21', ''
    ].join('\n'))
    expect(parseDeck(result.text).interpretedTotal).toBe(21)
    expect(parseDeck(result.text).lines.filter((line) => line.kind === 'card')
      .map((line) => line.quantity)).toEqual([2, 1, 1, 2, 1, 14])
  })

  it('blocca un codice sorgente sconosciuto senza inventare una sigla Live', () => {
    const result = prepareDeckExport(baseline('1 Carta sconosciuta ME99.5 7'))
    expect(result.canExport).toBe(false)
    expect(result.text).toBe('')
    expect(result.notes.join(' ')).toContain('ME99.5')
  })

  it('usa la sigla ufficiale di un set nuovo già acquisito dal Catalogo e ne segnala la verifica nel client', () => {
    const result = prepareDeckExport(baseline('1 Carta nuova ME06 007'), { me06: 'NEX' })
    expect(result.canExport).toBe(true)
    expect(result.text).toContain('1 Carta nuova NEX 7')
    expect(result.notes.join(' ')).toContain('ME06 → NEX')
    const absent = prepareDeckExport(baseline('1 Carta nuova ME06 007'))
    expect(absent.canExport).toBe(false)
  })

  it('mantiene le tre sezioni della lista italiana reale senza spostare Allenatori ed Energie tra i Pokémon', () => {
    const result = prepareDeckExport(baseline(hydrappleItalianDeck))
    expect(result.canExport).toBe(true)
    expect(result.text).toContain('Pokémon: 11\n2 Bayleef MEG 9')
    expect(result.text).toContain('Trainer: 11\n4 Bug Catching Set PRE 102')
    expect(result.text).toContain('Energy: 1\n14 Basic {G} Energy MEE 1')
    expect(result.text).toContain('Total Cards: 60')
  })
})
