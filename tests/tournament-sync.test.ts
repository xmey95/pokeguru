import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TournamentStore } from '../src/main/tournament-store'
import { syncTournamentBlock } from '../src/main/tournament-sync'
import { TournamentSyncJob } from '../src/main/tournament-sync-job'

const now = new Date('2026-10-24T23:00:00.000Z')
const ids = [1, 2, 3, 4].map((number) => `6ad92350115c12b73a5a94${String(number).padStart(2, '0')}`)
const list = { pokemon: [], trainer: [], energy: [{ count: 60, set: 'MEE', number: '9', name: 'Grass Energy' }] }
const standings = [
  { player: 'one', name: 'One', placing: 1, deck: { id: 'grass', name: 'Grass' }, decklist: list },
  { player: 'two', name: 'Two', placing: 2, deck: { id: 'grass', name: 'Grass' }, decklist: list }
]

function source(idsToReturn = ids): { fetcher: typeof fetch; calls: string[] } {
  const calls: string[] = []
  const fetcher = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/tournaments?')) return Response.json(idsToReturn.map((id) => ({
      id, game: 'PTCG', format: 'STANDARD', name: `Event ${id}`, date: '2026-10-22T12:00:00.000Z', players: 64
    })))
    const id = url.match(/tournaments\/([a-f0-9]{24})\//)?.[1]
    if (!id) return new Response(null, { status: 404 })
    if (url.endsWith('/details')) return Response.json({
      id, game: 'PTCG', format: 'STANDARD', name: `Event ${id}`,
      date: '2026-10-22T12:00:00.000Z', players: 64, platform: 'PTCGL',
      isOnline: true, isPublic: true, decklists: true,
      phases: [{ phase: 1, type: 'SWISS', rounds: 1, mode: 'BO1' }]
    })
    if (url.endsWith('/standings')) return Response.json(standings)
    return Response.json([{ phase: 1, round: 1, table: 1, player1: 'one', player2: 'two', winner: 'one' }])
  }
  return { fetcher: fetcher as typeof fetch, calls }
}

describe('global Limitless Play archive', () => {
  it('archives all queued events from one start across persisted blocks', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-auto-'))
    try {
      const store = new TournamentStore(join(folder, 'data.sqlite'))
      const network = source()
      const job = new TournamentSyncJob(() => store.progress(),
        (mode, shouldStop) => syncTournamentBlock(store, mode, network.fetcher, now, shouldStop), 0)
      job.start('new')
      await vi.waitFor(() => expect(job.status()).toMatchObject({ status: 'complete', saved: 4, active: false }),
        { timeout: 3_000 })
      expect(store.summaries()).toHaveLength(4)
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('saves three events per block and resumes the fourth after reopening', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-'))
    const path = join(folder, 'data.sqlite')
    try {
      const network = source()
      const first = new TournamentStore(path)
      const block = await syncTournamentBlock(first, 'new', network.fetcher, now)
      expect(block).toMatchObject({ status: 'running', inspected: 3, saved: 3 })
      expect(first.list()).toHaveLength(3)
      first.close()
      const reopened = new TournamentStore(path)
      const finished = await syncTournamentBlock(reopened, 'new', network.fetcher, now)
      expect(finished).toMatchObject({ status: 'complete', inspected: 4, saved: 4 })
      expect(reopened.summaries()).toHaveLength(4)
      expect(reopened.summaries()).toEqual(reopened.list().map(({ eventId, name, date, circuit, platform,
        isOnline, reportedPlayers, coverage, pairingCoverage }) => ({ eventId, name, date, circuit,
        platform, isOnline, reportedPlayers, coverage, pairingCoverage })))
      expect(reopened.getEvent(ids[0])?.pairingCoverage?.decided).toBe(1)
      expect(network.calls.filter((url) => url.includes('/tournaments?'))).toHaveLength(1)
      const before = network.calls.filter((url) => url.includes('/details')).length
      const repeat = await syncTournamentBlock(reopened, 'new', network.fetcher, now)
      expect(repeat).toMatchObject({ status: 'complete', inspected: 0, saved: 0 })
      expect(network.calls.filter((url) => url.includes('/details'))).toHaveLength(before)
      expect(reopened.summaries()).toHaveLength(4)
      reopened.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('keeps the queued event and cooldown after a 429', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-'))
    const path = join(folder, 'data.sqlite')
    try {
      const store = new TournamentStore(path)
      const network = source([ids[0]])
      let limited = true
      const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (limited && String(input).endsWith('/details')) {
          limited = false
          return new Response('', { status: 429, headers: { 'retry-after': '120' } })
        }
        return network.fetcher(input, init)
      }
      const paused = await syncTournamentBlock(store, 'new', fetcher as typeof fetch, new Date())
      expect(paused).toMatchObject({ status: 'rate-limited', inspected: 0 })
      expect(paused.pending).toHaveLength(1)
      const same = await syncTournamentBlock(store, 'new', fetcher as typeof fetch, new Date())
      expect(same).toEqual(paused)
      const resumed = await syncTournamentBlock(store, 'new', fetcher as typeof fetch,
        new Date(Date.parse(paused.cooldownUntil!) + 1000))
      expect(resumed).toMatchObject({ status: 'complete', inspected: 1, saved: 1 })
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('keeps the event queued when paused during its first API request', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-pause-'))
    try {
      const store = new TournamentStore(join(folder, 'data.sqlite'))
      const network = source([ids[0]])
      let announce = () => {}
      let release = () => {}
      const started = new Promise<void>((resolve) => { announce = resolve })
      const gate = new Promise<void>((resolve) => { release = resolve })
      const calls: string[] = []
      const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith('/details')) { announce(); await gate }
        return network.fetcher(input, init)
      }
      let stopped = false
      const block = syncTournamentBlock(store, 'new', fetcher as typeof fetch, now, () => stopped)
      await started
      stopped = true
      release()
      expect(await block).toMatchObject({ status: 'running', inspected: 0, saved: 0 })
      expect(store.progress().pending).toHaveLength(1)
      expect(calls.filter((url) => url.includes(`/tournaments/${ids[0]}/`))).toHaveLength(1)
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('continues to the next index page when the first 50 events are not completed', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-'))
    try {
      const store = new TournamentStore(join(folder, 'data.sqlite'))
      const network = source([ids[0]])
      const pages: string[] = []
      const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url.includes('/tournaments?')) {
          pages.push(url)
          if (url.includes('page=1')) return Response.json(Array.from({ length: 50 }, (_, index) => ({
            id: `6ad92350115c12b73a5b${index.toString(16).padStart(4, '0')}`,
            game: 'PTCG', format: 'STANDARD', name: 'Future', date: '2026-10-30T12:00:00.000Z', players: 64
          })))
        }
        return network.fetcher(input, init)
      }
      const result = await syncTournamentBlock(store, 'new', fetcher as typeof fetch, now)
      expect(result).toMatchObject({ status: 'complete', page: 3, saved: 1,
        watermark: '2026-10-22T12:00:00.000Z' })
      expect(pages).toHaveLength(2)
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
})
