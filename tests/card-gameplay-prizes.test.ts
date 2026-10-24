import { expect, it } from 'vitest'
import { gameplaySummary } from '../src/shared/card-gameplay'
import type { CardGameplay } from '../src/shared/catalog'
import type { CatalogPrint } from '../src/shared/catalog'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardFace } from '../src/renderer/src/CardOverview'

const gameplay: CardGameplay = { hp: 170, types: ['Colorless'], evolveFrom: null,
  attacks: [], abilities: [], effect: null, trainerType: null,
  weaknesses: [], resistances: [], retreat: 1 }

it('conserva la regola dei Premi nel dettaglio carta del redesign', () => {
  const print: CatalogPrint = { id: 'fixture-1', name: 'Mega Lucario ex', category: 'Pokemon',
    setId: 'fixture', setName: 'Fixture', localId: '1', rarity: null, variants: null,
    identityId: 'fixture', identityBasis: 'pokemon-text', imageBase: null, thumbnail: null,
    highImageAvailable: null, sourceUpdated: null, sourceUrl: 'https://example.test/card',
    detailAt: '2026-10-24T00:00:00Z', error: null, gameplay }
  const render = (card: CatalogPrint) => renderToStaticMarkup(createElement(CardFace, { print: card, imagePrint: card }))
  expect(render(print)).toContain('<dt>Premi al KO</dt><dd>3</dd>')
  expect(render({ ...print, name: 'Meowth ex' })).toContain('<dt>Premi al KO</dt><dd>2</dd>')
  expect(render({ ...print, name: 'Riolu' })).not.toContain('Premi al KO')
  expect(render({ ...print, name: 'Trainer ex', category: 'Trainer' })).not.toContain('Premi al KO')
})

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
