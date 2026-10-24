import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMainTournamentIndex, parseMainTournament, parseMainDecklist } from '../src/main/limitless-main-tournament'
import { syncMainTournamentBlock } from '../src/main/main-tournament-sync'
import { TournamentStore } from '../src/main/tournament-store'

const index = `<div data-selection><span data-key="format" data-value="standard"></span></div>
  <ul class="pagination" data-max="1"></ul><table>
  <tr><th>Date</th><th>Country</th><th>Name</th><th>Format</th><th>Players</th></tr>
  <tr><td>17 Oct 26</td><td><img class="flag" alt="FR"></td><td><a href="/tournaments/582">Regional Nice</a></td>
    <td><img alt="standard"></td><td>2336</td></tr>
  <tr><td>10 Oct 26</td><td><img class="flag" alt="US"></td><td><a href="/tournaments/581">Regional Louisville, KY</a></td>
    <td><img alt="standard"></td><td>2927</td></tr>
  <tr><td>20 Sep 26</td><td><img class="flag" alt="JP"></td><td><a href="/tournaments/579">Champions League Yokohama</a></td>
    <td><img alt="standard-jp"></td><td>5000</td></tr></table>`

const event = (name: string, first: string, second: string) => `<title>${name} – Limitless</title><table>
  <tr><th>#</th><th>Player</th><th>Country</th><th>Deck</th><th>List</th></tr>
  <tr><td>3</td><td><a href="/players/310">Paulo Mimoso</a></td><td><img class="flag" alt="PT"></td>
    <td><a href="/decks/352"><span data-tooltip="Hydrapple"></span></a></td>
    <td><a href="/decks/list/${first}">List</a></td></tr>
  <tr><td>7</td><td><a href="/players/3995">Riley McKay</a></td><td><img class="flag" alt="CA"></td>
    <td><a href="/decks/284"><span data-tooltip="Dragapult"></span></a></td>
    <td><a href="/decks/list/${second}">List</a></td></tr></table>`

const list = `<div data-text-decklist><div class="decklist-column"><div class="decklist-column-heading">Pokémon (4)</div>
  <div class="decklist-card" data-set="TWM" data-number="25"><a class="card-link"><span class="card-count">4</span>
    <span class="card-name">Teal Mask Ogerpon ex</span></a></div></div>
  <div class="decklist-column"><div class="decklist-column-heading">Energy (56)</div>
  <div class="decklist-card" data-set="MEE" data-number="9"><a class="card-link"><span class="card-count">56</span>
    <span class="card-name">Grass Energy</span></a></div></div></div>`

describe('main Limitless tournament archive', () => {
  it('filters to Western Standard, parses result coverage and exact cards', () => {
    const entries = parseMainTournamentIndex(index)
    expect(entries.map((item) => item.eventId)).toEqual(['582', '581'])
    const snapshot = parseMainTournament(event(entries[0].name, '30518', '30519'), entries[0])
    expect(snapshot.coverage).toMatchObject({ returnedParticipants: 2, listedDecks: 2, fetchedLists: 0 })
    expect(snapshot.participants[0]).toMatchObject({ placing: 3, deckId: '352', listId: '30518' })
    expect(parseMainDecklist(list)).toMatchObject({ total: 60,
      cards: [{ category: 'pokemon', count: 4, name: 'Teal Mask Ogerpon ex', set: 'TWM', number: '25' },
        { category: 'energy', count: 56, name: 'Grass Energy', set: 'MEE', number: '9' }] })
    expect(() => parseMainTournamentIndex(index.replace('data-value="standard"', 'data-value="expanded"'))).toThrow()
  })

  it('saves two Regional and representative lists across blocks and reopens offline', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-main-event-'))
    try {
      const path = join(folder, 'data.sqlite')
      const calls: string[] = []
      const fetcher = async (input: string | URL | Request): Promise<Response> => {
        const url = String(input)
        calls.push(url)
        if (url.includes('/tournaments?')) return new Response(index)
        if (url.endsWith('/tournaments/582')) return new Response(event('Regional Nice', '30518', '30519'))
        if (url.endsWith('/tournaments/581')) return new Response(event('Regional Louisville, KY', '30520', '30521'))
        return new Response(list)
      }
      const store = new TournamentStore(path)
      const first = await syncMainTournamentBlock(store, 'new', fetcher as typeof fetch,
        new Date('2026-10-24T12:00:00.000Z'))
      expect(first).toMatchObject({ status: 'running', inspectedEvents: 2, fetchedLists: 4 })
      store.close()
      const reopened = new TournamentStore(path)
      const done = await syncMainTournamentBlock(reopened, 'new', fetcher as typeof fetch,
        new Date('2026-10-24T12:00:00.000Z'))
      expect(done.status).toBe('complete')
      expect(reopened.mainSummaries()).toHaveLength(2)
      expect(reopened.getMain('582')?.coverage).toMatchObject({ fetchedLists: 2, complete60Lists: 2 })
      const before = calls.filter((url) => url.includes('/decks/list/')).length
      await syncMainTournamentBlock(reopened, 'new', fetcher as typeof fetch,
        new Date('2026-10-24T12:00:00.000Z'))
      expect(calls.filter((url) => url.includes('/decks/list/'))).toHaveLength(before)
      reopened.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
})
