import { describe, expect, it } from 'vitest'
import { matchupPlanParts } from '../src/renderer/src/matchup-plan-format'

describe('matchup game plan presentation', () => {
  it('separates a saved one-line plan without losing card references', () => {
    const source = 'Piano: Cerca [Mega Absol ex](https://limitlesstcg.com/cards/MEG/1). Fatti: La lista contiene due copie. Ipotesi: Conserva una carta di ricerca.'
    expect(matchupPlanParts(source)).toEqual([
      { label: 'Piano', text: 'Cerca [Mega Absol ex](https://limitlesstcg.com/cards/MEG/1).' },
      { label: 'Fatti', text: 'La lista contiene due copie.' },
      { label: 'Ipotesi', text: 'Conserva una carta di ricerca.' }
    ])
  })

  it('recognizes bold labels on separate lines and keeps unlabeled guidance', () => {
    expect(matchupPlanParts('Premessa tattica.\n**Piano:** Prepara la panchina.\n**Fatti**: Due liste osservate.\nIpotesi: Valuta il cambio.')).toEqual([
      { label: null, text: 'Premessa tattica.' },
      { label: 'Piano', text: 'Prepara la panchina.' },
      { label: 'Fatti', text: 'Due liste osservate.' },
      { label: 'Ipotesi', text: 'Valuta il cambio.' }
    ])
    const legacy = 'Una guida storica senza etichette.\nSeconda riga.'
    expect(matchupPlanParts(legacy)).toEqual([{ label: null, text: legacy }])
  })
})
