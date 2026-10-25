import { afterEach, describe, expect, it, vi } from 'vitest'
import { TournamentSyncJob } from '../src/main/tournament-sync-job'

type Progress = { mode: 'new' | 'full' | null; status: 'idle' | 'running' | 'rate-limited' | 'complete';
  cooldownUntil: string | null; lastError: string | null; saved: number; active?: boolean; stopping?: boolean }

const idle = (): Progress => ({ mode: null, status: 'idle', cooldownUntil: null, lastError: null, saved: 0 })

afterEach(() => vi.useRealTimers())

describe('automatic event acquisition', () => {
  it('stops a silent run after one 429 and reports the retry time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z'))
    const retryAt = new Date(Date.now() + 60_000).toISOString()
    let persisted: Progress = idle()
    const block = vi.fn(async () => {
      persisted = { ...persisted, mode: 'new', status: 'rate-limited', cooldownUntil: retryAt }
      return persisted
    })
    const terminal = vi.fn()
    const job = new TournamentSyncJob(() => persisted, block, 100, undefined, terminal)
    job.start('new', true)
    await vi.advanceTimersByTimeAsync(0)
    expect(block).toHaveBeenCalledTimes(1)
    expect(job.status().active).toBe(false)
    expect(terminal).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rate-limited', retryAt }))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(block).toHaveBeenCalledTimes(1)
  })
  it('advances persisted blocks to completion after one start', async () => {
    vi.useFakeTimers()
    let persisted = idle()
    const block = vi.fn(async (mode: 'new' | 'full') => {
      persisted = { ...persisted, mode, saved: persisted.saved + 1,
        status: persisted.saved === 1 ? 'complete' : 'running' }
      return persisted
    })
    const job = new TournamentSyncJob(() => persisted, block, 31_000)
    expect(job.start('new').active).toBe(true)
    await vi.advanceTimersByTimeAsync(31_000)
    expect(block).toHaveBeenCalledTimes(2)
    expect(job.status()).toMatchObject({ status: 'complete', saved: 2, active: false })
  })

  it('pauses between blocks and needs an explicit resume after restart', async () => {
    vi.useFakeTimers()
    let persisted = idle()
    const block = vi.fn(async (mode: 'new' | 'full') => {
      persisted = { ...persisted, mode, status: persisted.saved === 0 ? 'running' : 'complete',
        saved: persisted.saved + 1 }
      return persisted
    })
    const first = new TournamentSyncJob(() => persisted, block, 100)
    first.start('new')
    await vi.advanceTimersByTimeAsync(0)
    expect(first.status()).toMatchObject({ saved: 1, active: true })
    expect(first.pause().active).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    expect(block).toHaveBeenCalledTimes(1)
    first.shutdown()
    const reopened = new TournamentSyncJob(() => persisted, block, 100)
    await vi.advanceTimersByTimeAsync(500)
    expect(reopened.status()).toMatchObject({ saved: 1, active: false })
    reopened.start('new')
    await vi.advanceTimersByTimeAsync(0)
    expect(reopened.status()).toMatchObject({ status: 'complete', saved: 2, active: false })
  })

  it('waits through a rate limit and resumes automatically unless paused', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'))
    let persisted = idle()
    const block = vi.fn(async (mode: 'new' | 'full') => {
      persisted = persisted.saved === 0
        ? { ...persisted, mode, saved: 1, status: 'rate-limited',
          cooldownUntil: new Date(Date.now() + 30_000).toISOString() }
        : { ...persisted, status: 'complete', cooldownUntil: null }
      return persisted
    })
    const job = new TournamentSyncJob(() => persisted, block, 100)
    job.start('new')
    await vi.advanceTimersByTimeAsync(0)
    expect(job.status()).toMatchObject({ status: 'rate-limited', active: true })
    await vi.advanceTimersByTimeAsync(29_000)
    expect(block).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(block).toHaveBeenCalledTimes(2)
    expect(job.status().active).toBe(false)
  })

  it('does not start another request after pausing an in-flight block', async () => {
    vi.useFakeTimers()
    let persisted = idle()
    let release: (() => void) | undefined
    const inFlight = new Promise<void>((resolve) => { release = resolve })
    const block = vi.fn(async (mode: 'new' | 'full', shouldStop: () => boolean) => {
      await inFlight
      persisted = { ...persisted, mode, status: 'running', saved: 1 }
      expect(shouldStop()).toBe(true)
      return persisted
    })
    const job = new TournamentSyncJob(() => persisted, block, 100)
    job.start('new')
    await vi.advanceTimersByTimeAsync(0)
    expect(job.pause()).toMatchObject({ active: true, stopping: true })
    release!()
    await vi.advanceTimersByTimeAsync(500)
    expect(block).toHaveBeenCalledTimes(1)
    expect(job.status()).toMatchObject({ saved: 1, active: false })
  })

  it('keeps the source pacing when a paused job is resumed in the same session', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T10:00:00.000Z'))
    let persisted = idle()
    const block = vi.fn(async (mode: 'new' | 'full') => {
      persisted = { ...persisted, mode, saved: persisted.saved + 1,
        status: persisted.saved === 1 ? 'complete' : 'running' }
      return persisted
    })
    const job = new TournamentSyncJob(() => persisted, block, () => 15_000)
    job.start('new')
    await vi.advanceTimersByTimeAsync(0)
    job.pause()
    job.start('new')
    await vi.advanceTimersByTimeAsync(14_999)
    expect(block).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(job.status()).toMatchObject({ status: 'complete', saved: 2, active: false })
  })
})
