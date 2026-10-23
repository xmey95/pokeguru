import { expect, it } from 'vitest'
import { fetchTournament } from '../src/main/limitless-event'

it.skipIf(process.env.POKEGURU_EVENT_LIVE !== '1')('reads the observed public Standard Play event', async () => {
  const snapshot = await fetchTournament('6ad92350115c12b73a5a9419')
  console.log(`Evento ${snapshot.eventId}: ${JSON.stringify(snapshot.coverage)}`)
  expect(snapshot.name).toContain('Plantel Battle')
  expect(snapshot.reportedPlayers).toBe(109)
  expect(snapshot.coverage.returnedParticipants).toBe(109)
  expect(snapshot.coverage.availableLists).toBeGreaterThan(100)
  expect(snapshot.participations.some((entry) => entry.cardTotal === 60)).toBe(true)
}, 30_000)
