import { expect, it } from 'vitest'
import { fetchMainDecklist, fetchMainTournament, fetchMainTournamentIndex } from '../src/main/limitless-main-tournament'

it.skipIf(process.env.POKEGURU_MAIN_TOURNAMENT_LIVE !== '1')('reads two current Western Regional results and an exact decklist', async () => {
  const entries = await fetchMainTournamentIndex()
  const selected = entries.filter((entry) => entry.eventId === '582' || entry.eventId === '581')
  expect(selected).toHaveLength(2)
  for (const entry of selected) {
    const event = await fetchMainTournament(entry)
    expect(event.participants.length).toBeGreaterThan(100)
    const hydrapple = event.participants.find((item) => item.deckId === '352' && item.listId)
    expect(hydrapple).toBeDefined()
    const list = await fetchMainDecklist(hydrapple!.listId!)
    expect(list.total).toBe(60)
    expect(list.cards.some((card) => card.name.includes('Hydrapple'))).toBe(true)
    console.log(`${entry.name}: ${event.coverage.returnedParticipants}/${event.players} piazzamenti, Hydrapple ${hydrapple!.placing}°, ${list.total} carte`)
  }
}, 45_000)
