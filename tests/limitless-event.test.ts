import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchRecentWesternTournament, parseTournament } from '../src/main/limitless-event'
import { TournamentStore } from '../src/main/tournament-store'

const event = {
  id: '6ad92350115c12b73a5a9419', game: 'PTCG', format: 'STANDARD', platform: 'PTCGL',
  isOnline: true, isPublic: true, decklists: true, name: 'Plantel Battle #35',
  date: '2026-10-22T23:00:00.000Z', players: 3,
  phases: [{ phase: 1, type: 'SWISS', rounds: 7, mode: 'BO1' }]
}
const list = { pokemon: [], trainer: [], energy: [{ count: 60, set: 'MEE', number: '9', name: 'Grass Energy' }] }
const standings = [
  { player: 'one', name: 'One', placing: 1, country: 'US', record: { wins: 2, losses: 0, ties: 0 },
    deck: { id: 'grass', name: 'Grass' }, decklist: list },
  { player: 'two', name: 'Two', placing: 2, country: 'CA', record: { wins: 1, losses: 1, ties: 0 },
    deck: { id: 'grass', name: 'Grass' }, decklist: list },
  { player: 'three', name: 'Three', placing: null, decklist: null }
]

describe('Limitless Play event', () => {
  it('keeps distinct participations for identical lists, print codes and coverage', () => {
    const snapshot = parseTournament(event, standings, '2026-10-23T20:00:00.000Z')
    expect(snapshot.circuit).toBe('WESTERN')
    expect(snapshot.coverage).toEqual({ returnedParticipants: 3, availableLists: 2, invalidLists: 0,
      missingLists: 1, complete60Lists: 2 })
    expect(snapshot.participations[0].cards).toEqual(snapshot.participations[1].cards)
    expect(snapshot.participations.map((entry) => entry.playerId)).toEqual(['one', 'two', 'three'])
    expect(snapshot.participations[0].cards[0]).toMatchObject({ set: 'MEE', number: '9', count: 60 })
  })

  it('rejects Japanese or private events and duplicate player IDs', () => {
    expect(() => parseTournament({ ...event, platform: 'OTHER', isOnline: false }, standings)).toThrow()
    expect(() => parseTournament({ ...event, isPublic: false }, standings)).toThrow()
    expect(() => parseTournament(event, [...standings, standings[0]])).toThrow(/univoche/)
  })

  it('marks malformed lists without dropping their participation', () => {
    const bad = [...standings, { player: 'four', name: 'Four', decklist: { pokemon: [{ count: 4 }], trainer: [], energy: [] } }]
    const snapshot = parseTournament(event, bad)
    expect(snapshot.coverage.invalidLists).toBe(1)
    expect(snapshot.participations[3]).toMatchObject({ playerId: 'four', listStatus: 'invalid', cardTotal: null })
  })

  it('stores a repeatable snapshot, reopens it offline and preserves the first capture', () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-event-'))
    const path = join(folder, 'data.sqlite')
    try {
      const snapshot = parseTournament(event, standings, '2026-10-23T20:00:00.000Z')
      const store = new TournamentStore(path)
      store.save(snapshot)
      store.save({ ...snapshot, fetchedAt: '2026-10-23T20:10:00.000Z' })
      store.close()
      const reopened = new TournamentStore(path)
      expect(reopened.latest()).toMatchObject({ id: snapshot.id, fetchedAt: snapshot.fetchedAt, cached: true })
      expect(reopened.latest()?.participations).toHaveLength(3)
      reopened.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('selects a completed public Western event from the documented index', async () => {
    const later = '6ad92350115c12b73a5a9420'
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input)
      if (url.includes('?')) return Response.json([
        { id: later, game: 'PTCG', format: 'STANDARD', date: event.date, players: 200 },
        { id: event.id, game: 'PTCG', format: 'STANDARD', date: event.date, players: 109 }
      ])
      if (url.includes(later)) return Response.json({ ...event, id: later, isOnline: false })
      return Response.json(url.endsWith('/details') ? event : standings)
    }
    const selected = await fetchRecentWesternTournament(fetcher as typeof fetch, new Date('2026-10-24T23:00:00Z'))
    expect(selected.eventId).toBe(event.id)
  })
})
