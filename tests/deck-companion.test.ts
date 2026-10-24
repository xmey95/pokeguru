import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DeckCompanion } from '../src/renderer/src/DeckCompanion'
import { parseDeck } from '../src/shared/deck-import'
import { hydrappleItalianDeck } from './fixtures/hydrapple-italian'

describe('DeckCompanion', () => {
  it('mostra 21 Pokémon, 25 Allenatori e 14 Energie per la lista italiana', () => {
    const baseline = {
      projectId: 'test', rawText: hydrappleItalianDeck, source: 'paste' as const,
      fileName: null, importedAt: '2026-10-24T00:00:00.000Z',
      ...parseDeck(hydrappleItalianDeck)
    }
    const html = renderToStaticMarkup(createElement(DeckCompanion, { baseline, loading: false }))
    expect(html).toContain('<strong>21</strong><span>Pokémon</span>')
    expect(html).toContain('<strong>25</strong><span>Allenatori</span>')
    expect(html).toContain('<strong>14</strong><span>Energie</span>')
    expect(html).toContain('Pronta per controllo')
  })
})
