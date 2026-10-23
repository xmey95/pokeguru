import { describe, expect, it } from 'vitest'
import { parsePromoRegistry, promoKey } from '../src/main/promo-legality'
import { loadPromoPackage } from '../src/main/promo-package'

const html = `<div><a id="upcoming-promo-cards"></a></div><div><table>
  <tr><td>Card</td><td>Card Number</td><td>Legal Date</td></tr>
  <tr><td>Masquerain</td><td>MEP 111</td><td>11/20/2026</td></tr>
  <tr><td>Spritzee</td><td>NVP 001</td><td>Upon Release</td></tr></table></div>
  <div><a id="available-promo-cards"></a></div><div><table>
  <tr><td>Card</td><td>Card Number</td></tr>
  <tr><td>Oshawott</td><td>MEP 051</td></tr></table></div>`

describe('Registro ufficiale delle promo', () => {
  it('usa offline lo snapshot completo MEP/SVP e conserva le date future', async () => {
    const { registry } = await loadPromoPackage(undefined, async () => { throw new Error('offline') })
    expect(registry.version).toBe(2)
    expect(registry.complete).toBe(true)
    expect(registry.entries.size).toBe(346)
    expect(registry.entries.get(promoKey('MEP', '001'))?.state).toBe('available')
    expect(registry.entries.get(promoKey('MEP', '110'))?.state).toBe('available')
    expect(registry.entries.get(promoKey('SVP', '225'))?.state).toBe('available')
    expect(registry.entries.get(promoKey('MEP', '111'))).toMatchObject({ state: 'upcoming', legalDate: '2026-11-20' })
    expect(registry.entries.get(promoKey('MEP', '115'))).toMatchObject({ state: 'upcoming', legalDate: null, dateNote: 'Upon Release' })
    expect(registry.entries.get(promoKey('SWSH', '251'))?.state).toBe('available')
  })

  it('legge serie nuove, date esplicite e ammissione al rilascio senza inventare una data', () => {
    const registry = parsePromoRegistry(html, '2026-10-23T00:00:00.000Z')
    expect(registry.series).toEqual(['MEP', 'NVP'])
    expect(registry.entries.get(promoKey('mep', '111'))).toMatchObject({
      state: 'upcoming', legalDate: '2026-11-20'
    })
    expect(registry.entries.get(promoKey('nvp', '1'))).toMatchObject({
      state: 'upcoming', legalDate: null, dateNote: 'Upon Release'
    })
    expect(registry.entries.get(promoKey('MEP', '051'))?.state).toBe('available')
  })

  it('rifiuta struttura o date mutate anziché attribuire legalità incerta', () => {
    expect(() => parsePromoRegistry(html.replace('Card Number', 'Set'), '2026-10-23')).toThrow()
    expect(() => parsePromoRegistry(html.replace('11/20/2026', '11/40/2026'), '2026-10-23')).toThrow()
  })

  it('conserva lo snapshot incluso se un aggiornamento duplica un codice', async () => {
    const response = Response.json({ schema: 1, version: 3, checkedAt: '2026-10-24T00:00:00.000Z',
      sourceUrl: 'https://www.pokemon.com/uk/play-pokemon/about/pokemon-tcg-promo-card-legality-status',
      complete: true, availableRanges: [{ code: 'MEP', first: 1, last: 2 }],
      entries: [{ code: 'MEP', number: '001', state: 'available', legalDate: null, dateNote: null }] })
    const { registry, error } = await loadPromoPackage(undefined, async () => response)
    expect(registry.version).toBe(2)
    expect(registry.entries.size).toBe(346)
    expect(error).toContain('duplicato')
  })
})
