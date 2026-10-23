import { describe, expect, it } from 'vitest'
import { parseDeck } from '../src/shared/deck-import'

describe('parseDeck', () => {
  it('conserva ogni riga, interpreta quantità e stampe senza fidarsi del totale dichiarato', () => {
    const input = 'Pokémon: 4\r\n2 Mega Absol ex MEG 86\r\n2 Mega Audino ex (MEG-103)\r\n\r\nTrainers: 4\r\n4 Ultra Ball SVI 196\r\nEnergy: 4\r\n4 Basic Darkness Energy SVE 7\r\nTotal Cards: 60'
    const result = parseDeck(input)
    expect(result.lines).toHaveLength(9)
    expect(result.lines[1]).toMatchObject({ raw: '2 Mega Absol ex MEG 86', kind: 'card', quantity: 2, name: 'Mega Absol ex', setCode: 'MEG', cardNumber: '86' })
    expect(result.lines[2]).toMatchObject({ kind: 'card', setCode: 'MEG', cardNumber: '103' })
    expect(result.lines[3].kind).toBe('blank')
    expect(result.interpretedTotal).toBe(12)
    expect(result.declaredTotal).toBe(60)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'TOTAL_MISMATCH' }))
  })

  it('mantiene ALT, promo e righe non interpretate visibili', () => {
    const result = parseDeck('1 Carta speciale ALT 12A\n2 Carta promo PR-SV 001a\n3 Carta senza stampa\nnota libera')
    expect(result.interpretedTotal).toBe(6)
    expect(result.lines[1]).toMatchObject({ setCode: 'PR-SV', cardNumber: '001a' })
    expect(result.lines[3]).toMatchObject({ raw: 'nota libera', kind: 'unparsed' })
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['ALT_PRINT', 'PRINT_UNKNOWN', 'UNPARSED'])
  })
})
