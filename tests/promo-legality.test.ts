import { describe, expect, it } from 'vitest'
import { parsePromoRegistry, promoKey } from '../src/main/promo-legality'

const html = `<div><a id="upcoming-promo-cards"></a></div><div><table>
  <tr><td>Card</td><td>Card Number</td><td>Legal Date</td></tr>
  <tr><td>Masquerain</td><td>MEP 111</td><td>11/20/2026</td></tr>
  <tr><td>Spritzee</td><td>NVP 001</td><td>Upon Release</td></tr></table></div>
  <div><a id="available-promo-cards"></a></div><div><table>
  <tr><td>Card</td><td>Card Number</td></tr>
  <tr><td>Oshawott</td><td>MEP 051</td></tr></table></div>`

describe('Registro ufficiale delle promo', () => {
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
})
