import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMeta, parseMeta } from '../src/main/limitless-meta'

const filter = `<ul data-selection>
  <li data-key="time" data-value="1months"></li>
  <li data-key="format" data-value="standard"></li>
  <li data-key="region" data-value="eu"></li>
  <li data-key="region" data-value="na"></li>
  <li data-key="region" data-value="la"></li>
  <li data-key="region" data-value="oc"></li>
</ul>`
const table = `<table class="data-table striped"><tr><th>#</th></tr>
  <tr><td>1</td><td></td><td><a href="/decks/284">Dragapult <span>ex</span></a></td><td>123</td><td>12.34%</td></tr>
  <tr><td>2</td><td></td><td><a href="/decks/339">Basic Box</a></td><td>45</td><td>4.50%</td></tr>
</table>`

describe('Limitless Metagame', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reads all rows and records the exact Western Standard filter', () => {
    const snapshot = parseMeta(filter + table, '2026-10-23T00:00:00.000Z')
    expect(snapshot.decks).toEqual([
      { id: '284', name: 'Dragapult ex', points: 123, share: 12.34, url: 'https://limitlesstcg.com/decks/284' },
      { id: '339', name: 'Basic Box', points: 45, share: 4.5, url: 'https://limitlesstcg.com/decks/339' }
    ])
    expect(snapshot.period).toBe('Ultimo mese')
    expect(snapshot.circuit).toBe('WESTERN')
  })

  it('rejects a changed region filter instead of labeling Asian data Western', () => {
    expect(() => parseMeta(filter.replace('data-value="oc"', 'data-value="asia"') + table)).toThrow(/filtri/)
  })

  it('includes every paginated archetype in one snapshot', async () => {
    const secondTable = table.replace('/decks/284', '/decks/500').replace('Dragapult', 'Altro')
      .replace('/decks/339', '/decks/501')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(filter + table + '<ul class="pagination" data-max="2"></ul>'))
      .mockResolvedValueOnce(new Response(filter + secondTable))
    vi.stubGlobal('fetch', fetchMock)
    const snapshot = await fetchMeta()
    expect(snapshot.decks.map((deck) => deck.id)).toEqual(['284', '339', '500', '501'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('page=2')
  })
})
