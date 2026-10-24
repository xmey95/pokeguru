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
  expect(snapshot.pairingCoverage?.returned).toBeGreaterThan(0)
  expect(snapshot.pairingCoverage?.decided).toBeGreaterThan(0)
}, 30_000)

it.skipIf(process.env.POKEGURU_EVENT_LIVE !== '1')('compares a second public event with pairings', async () => {
  const snapshot = await fetchTournament('6aceb2328a8383117e3eb45e')
  console.log(`Evento ${snapshot.eventId}: ${snapshot.coverage.complete60Lists} liste, ${snapshot.pairingCoverage?.decided} match decisi`)
  expect(snapshot.reportedPlayers).toBeGreaterThan(300)
  expect(snapshot.pairingCoverage?.betweenParticipants).toBeGreaterThan(100)
  expect(snapshot.pairingCoverage?.decided).toBeGreaterThan(100)
}, 30_000)
