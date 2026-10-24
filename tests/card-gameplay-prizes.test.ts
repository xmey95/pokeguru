import { expect, it } from 'vitest'
import { gameplaySummary } from '../src/shared/card-gameplay'
import type { CardGameplay } from '../src/shared/catalog'

const gameplay: CardGameplay = { hp: 170, types: ['Colorless'], evolveFrom: null,
  attacks: [], abilities: [], effect: null, trainerType: null,
  weaknesses: [], resistances: [], retreat: 1 }

it('aggiunge la regola Premi ufficiale alla scheda dei Pokémon ex, distinguendo Mega ex', () => {
  expect(gameplaySummary(gameplay, { name: 'Mega Lucario ex', category: 'Pokemon' }))
    .toContain('Premi concessi al KO 3')
  expect(gameplaySummary(gameplay, { name: 'Meowth ex', category: 'Pokemon' }))
    .toContain('Premi concessi al KO 2')
  expect(gameplaySummary(gameplay, { name: 'Riolu', category: 'Pokemon' }))
    .not.toContain('Premi concessi')
  expect(gameplaySummary(gameplay, { name: 'Battle Cage', category: 'Trainer' }))
    .not.toContain('Premi concessi')
})
