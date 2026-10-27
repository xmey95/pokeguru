import { describe, expect, it } from 'vitest'
import { matchupPlanNarrative } from '../src/renderer/src/matchup-plan-format'

describe('matchup game plan presentation', () => {
  it('reads a saved one-line plan as prose without losing card references', () => {
    const source = 'Piano: Cerca [Mega Absol ex](https://limitlesstcg.com/cards/MEG/1). Fatti: La lista contiene due copie. Ipotesi: Conserva una carta di ricerca.'
    expect(matchupPlanNarrative(source)).toBe("Cerca [Mega Absol ex](https://limitlesstcg.com/cards/MEG/1).\n\nLa lista contiene due copie.\n\nQuesto passaggio è un'ipotesi da verificare. Conserva una carta di ricerca.")
  })

  it('removes bold labels from older guides and leaves unlabeled guidance unchanged', () => {
    expect(matchupPlanNarrative('Premessa tattica.\n**Piano:** Prepara la panchina.\n**Fatti**: Due liste osservate.\nIpotesi: Valuta il cambio.'))
      .toBe("Premessa tattica.\n\nPrepara la panchina.\n\nDue liste osservate.\n\nQuesto passaggio è un'ipotesi da verificare. Valuta il cambio.")
    const legacy = 'Una guida storica senza etichette.\nSeconda riga.'
    expect(matchupPlanNarrative(legacy)).toBe(legacy)
  })
})
