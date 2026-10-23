import { expect, it } from 'vitest'
import { normalizeDeckCodes } from '../src/shared/deck-code-normalization'

it('converte solo codici puntati verificati e conserva il resto del testo', () => {
  const original = 'Pokémon: 2\r\n2 Mega Audino ex ME02.5 172\r\n1 Rare Candy SV04.5 089\r\n1 Unknown XX02.5 7\r\nTotal Cards: 4'
  const result = normalizeDeckCodes(original)
  expect(result.rawText).toBe('Pokémon: 2\r\n2 Mega Audino ex ASC 172\r\n1 Rare Candy PAF 089\r\n1 Unknown XX02.5 7\r\nTotal Cards: 4')
  expect(result.conversions).toMatchObject([{ from: 'ME02.5', to: 'ASC', lineNumber: 2 },
    { from: 'SV04.5', to: 'PAF', lineNumber: 3 }])
  expect(result.unsupported).toEqual([{ code: 'XX02.5', lineNumber: 4 }])
})
