import type { MainTournamentSnapshot } from '../../src/shared/main-tournament'

export function sharedEventList(): MainTournamentSnapshot {
  return { id: 'shared-list-snapshot', eventId: 'shared-list-event', name: 'Shared list fixture',
    date: '2026-10-20', country: 'IT', players: 4, url: 'https://limitlesstcg.com/tournaments/999999',
    fetchedAt: '2026-10-28T00:00:00Z', source: 'Limitless tournament database',
    circuit: 'WESTERN', format: 'STANDARD', type: 'IN_PERSON', cached: true,
    coverage: { returnedParticipants: 4, listedDecks: 4, fetchedLists: 4, complete60Lists: 4, noListLink: 0 },
    participants: [0, 1, 2, 3].map(index => ({ placing: index < 2 ? index + 1 : 3,
      playerId: index < 2 ? `player-${index}` : null, playerName: `Fixture ${index}`, country: 'IT',
      deckId: 'fixture-deck', deckName: 'Shared deck', listId: '999999',
      listUrl: 'https://limitlesstcg.com/decks/list/999999', cardTotal: 60,
      cards: [{ category: 'energy', count: 60, name: 'Basic Psychic Energy', set: 'SVE', number: '5' }] })) }
}
