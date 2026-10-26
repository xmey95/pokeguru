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
      expect(block.runId).toMatch(/^[a-f0-9-]{36}$/)
      expect(first.list()).toHaveLength(3)
      first.close()
      const reopened = new TournamentStore(path)
      const finished = await syncTournamentBlock(reopened, 'new', network.fetcher, now)
      expect(finished).toMatchObject({ status: 'complete', inspected: 4, saved: 4 })
      expect(finished.runId).toBe(block.runId)
      expect(reopened.summaries()).toHaveLength(4)
      expect(reopened.summaries()).toEqual(reopened.list().map(({ eventId, name, date, circuit, platform,
        isOnline, reportedPlayers, coverage, pairingCoverage }) => ({ eventId, name, date, circuit,
        platform, isOnline, reportedPlayers, coverage, pairingCoverage })))
      expect(reopened.getEvent(ids[0])?.pairingCoverage?.decided).toBe(1)
      expect(network.calls.filter((url) => url.includes('/tournaments?'))).toHaveLength(1)
      const before = network.calls.filter((url) => url.includes('/details')).length
      const repeat = await syncTournamentBlock(reopened, 'new', network.fetcher, now)
      expect(repeat).toMatchObject({ status: 'complete', inspected: 0, saved: 0 })
      expect(repeat.runId).not.toBe(block.runId)
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

  it('limits both scan modes to 90 days and events with at least 50 players', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-window-'))
    try {
      const store = new TournamentStore(join(folder, 'data.sqlite'))
      const cutoff = new Date(new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10))
      const network = source()
      const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (String(input).includes('/tournaments?')) return Response.json([
          { id: ids[0], game: 'PTCG', format: 'STANDARD', name: 'Too old',
            date: new Date(cutoff.getTime() - 1000).toISOString(), players: 100 },
          { id: ids[1], game: 'PTCG', format: 'STANDARD', name: 'Too small',
            date: cutoff.toISOString(), players: 49 },
          { id: ids[2], game: 'PTCG', format: 'STANDARD', name: 'At both limits',
            date: cutoff.toISOString(), players: 50 },
          { id: ids[3], game: 'PTCG', format: 'STANDARD', name: 'Recent',
            date: '2026-10-22T12:00:00.000Z', players: 64 }
        ])
        return network.fetcher(input, init)
      }
      const fresh = await syncTournamentBlock(store, 'new', fetcher as typeof fetch, now)
      expect(fresh).toMatchObject({ status: 'complete', saved: 2, previousWatermark: cutoff.toISOString().slice(0, 10) })
      expect(store.summaries()).toHaveLength(2)
      expect(network.calls.filter((url) => url.endsWith('/details'))).toHaveLength(2)
      const full = await syncTournamentBlock(store, 'full', fetcher as typeof fetch, now)
      expect(full).toMatchObject({ status: 'complete', saved: 2, previousWatermark: cutoff.toISOString().slice(0, 10) })
      expect(network.calls.filter((url) => url.endsWith('/details'))).toHaveLength(4)
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('finds late-listed events within 90 days even before the previous watermark', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-late-'))
    try {
      const store = new TournamentStore(join(folder, 'data.sqlite'))
      const network = source()
      let listed = ids[0]
      const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (String(input).includes('/tournaments?')) return Response.json([{
          id: listed, game: 'PTCG', format: 'STANDARD', name: 'Late listing',
          date: listed === ids[0] ? '2026-10-22T12:00:00.000Z' : '2026-10-20T12:00:00.000Z',
          players: 64
        }])
        return network.fetcher(input, init)
      }
      expect(await syncTournamentBlock(store, 'new', fetcher as typeof fetch, now))
        .toMatchObject({ status: 'complete', saved: 1, watermark: '2026-10-22T12:00:00.000Z' })
      listed = ids[1]
      expect(await syncTournamentBlock(store, 'new', fetcher as typeof fetch, now))
        .toMatchObject({ status: 'complete', saved: 1 })
      expect(store.summaries()).toHaveLength(2)
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('drops stale queued events when a paused older scan resumes', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-resume-window-'))
    try {
      const store = new TournamentStore(join(folder, 'data.sqlite'))
      store.saveProgress({ ...store.progress(), mode: 'new', status: 'running', page: 2,
        previousWatermark: '2026-04-10', stopAfterPage: true,
        pending: [{ id: ids[0], date: '2026-06-01T00:00:00.000Z' },
          { id: ids[1], date: '2026-10-22T12:00:00.000Z' }] })
      const network = source()
      const result = await syncTournamentBlock(store, 'new', network.fetcher, now)
      expect(result).toMatchObject({ status: 'complete', saved: 1, inspected: 1 })
      expect(result.previousWatermark).toBe(new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10))
      expect(network.calls.some((url) => url.includes(`/tournaments/${ids[0]}/`))).toBe(false)
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })

  it('skips a queued event whose detail has fallen below 50 players before downloading standings', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-sync-small-detail-'))
    try {
      const store = new TournamentStore(join(folder, 'data.sqlite'))
      const network = source([ids[0]])
      const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url.endsWith('/details')) {
          const response = await network.fetcher(input, init)
          return Response.json({ ...await response.json() as object, players: 49 })
        }
        return network.fetcher(input, init)
      }
      const result = await syncTournamentBlock(store, 'new', fetcher as typeof fetch, now)
      expect(result).toMatchObject({ status: 'complete', skipped: 1, saved: 0 })
      expect(network.calls.some((url) => url.endsWith('/standings'))).toBe(false)
      store.close()
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
})
