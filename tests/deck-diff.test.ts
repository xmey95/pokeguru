import { expect, it } from 'vitest'
import { parseDeck } from '../src/shared/deck-import'
import { compareDecks } from '../src/shared/deck-diff'

it('mostra quantità della lista intera e separa cambi di stampa da cambi di nome', () => {
  const before = parseDeck('2 Iono PAL 185\n1 Rare Candy MEG 125')
  const after = parseDeck('1 Iono PAL 185\n1 Iono PAL 254\n2 Rare Candy MEG 125')
  const diff = compareDecks(before, after)
  expect(diff.beforeTotal).toBe(3)
  expect(diff.afterTotal).toBe(4)
  expect(diff.byName).toEqual([{ name: 'Rare Candy', before: 1, after: 2, delta: 1 }])
  expect(diff.byPrint).toMatchObject([
    { name: 'Iono · PAL 185', before: 2, after: 1 },
    { name: 'Iono · PAL 254', before: 0, after: 1 },
    { name: 'Rare Candy · MEG 125', before: 1, after: 2 }
  ])
})
