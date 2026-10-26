import { describe, expect, it } from 'vitest'
import { aiObservations, catalogObservation, emptyAlertLedger, observeJobs,
  tournamentObservation } from '../src/renderer/src/job-alerts'
import type { CatalogSyncStatus } from '../src/shared/catalog'
import type { TournamentSyncProgress } from '../src/shared/tournament'
import type { AiJobSummary } from '../src/shared/ai-job'

const catalog = (state: CatalogSyncStatus['state'], runId = 'run-1', error: string | null = null): CatalogSyncStatus => ({
  runId, state, mode: 'new', running: state === 'running' || state === 'rate-limited',
  phase: '', expected: 10, acquired: 10, error, cooldownUntil: null
})
const play = (status: TournamentSyncProgress['status'], active: boolean,
  runId = 'play-1', lastError: string | null = null): TournamentSyncProgress => ({
  runId, mode: 'new', status, active, page: 1, pending: [], inspected: 1, saved: 1, skipped: 0,
  watermark: null, previousWatermark: null, newestSeen: null, stopAfterPage: false,
  cooldownUntil: null, lastError
})
const ai = (status: AiJobSummary['status'], id = 'ai-1'): AiJobSummary => ({
  id, kind: 'thread-propose', projectId: 'project-1', resourceId: 'thread-1', status,
  createdAt: '2026-10-25T10:00:00.000Z', updatedAt: '2026-10-25T10:00:00.000Z', error: null
})

describe('global job alerts', () => {
  it('announces a catalog completion once across polls and a restored ledger', () => {
    const ledger = emptyAlertLedger()
    expect(observeJobs(ledger, 'catalog', catalogObservation(catalog('running')))).toEqual([])
    const finished = catalogObservation(catalog('done'))
    expect(observeJobs(ledger, 'catalog', finished)).toHaveLength(1)
    expect(observeJobs(ledger, 'catalog', finished)).toEqual([])
    expect(observeJobs(JSON.parse(JSON.stringify(ledger)), 'catalog', finished)).toEqual([])
    expect(observeJobs(ledger, 'catalog', catalogObservation(catalog('done', 'run-2')))).toHaveLength(1)
  })

  it('does not report a historical terminal job or a pause/rate limit as completed', () => {
    const ledger = emptyAlertLedger()
    expect(observeJobs(ledger, 'catalog', catalogObservation(catalog('done')))).toEqual([])
    expect(observeJobs(ledger, 'catalog', catalogObservation(catalog('rate-limited', 'run-2', 'Attesa fonte')))).toEqual([])
    expect(observeJobs(ledger, 'catalog', catalogObservation(catalog('paused', 'run-2')))).toEqual([])
    const error = catalogObservation(catalog('paused', 'run-2', 'Dettaglio non disponibile'))
    expect(observeJobs(ledger, 'catalog', error)).toMatchObject([{ state: 'failed' }])
    expect(observeJobs(ledger, 'catalog', error)).toEqual([])
    expect(observeJobs(ledger, 'catalog', catalogObservation(catalog('cancelled', 'run-3'))))
      .toMatchObject([{ state: 'cancelled' }])
  })

  it('announces Play and Regional only after the runner stops with a final outcome', () => {
    const ledger = emptyAlertLedger()
    observeJobs(ledger, 'play', tournamentObservation('play', play('idle', false, 'old')))
    expect(observeJobs(ledger, 'play', tournamentObservation('play', play('rate-limited', true)))).toEqual([])
    expect(observeJobs(ledger, 'play', tournamentObservation('play', play('complete', false))))
      .toMatchObject([{ state: 'complete' }])
    observeJobs(ledger, 'main', [])
    const failed = tournamentObservation('main', play('running', false, 'regional-1', 'Fonte non disponibile'))
    expect(observeJobs(ledger, 'main', failed)).toMatchObject([{ state: 'failed' }])
    expect(observeJobs(ledger, 'main', failed)).toEqual([])
  })

  it('uses persisted AI job IDs and only committed results count as success', () => {
    const ledger = emptyAlertLedger()
    observeJobs(ledger, 'ai', aiObservations([]))
    expect(observeJobs(ledger, 'ai', aiObservations([ai('running')]))).toEqual([])
    expect(observeJobs(ledger, 'ai', aiObservations([ai('ready')]))).toEqual([])
    expect(observeJobs(ledger, 'ai', aiObservations([ai('applied')]))).toMatchObject([{ state: 'complete' }])
    expect(observeJobs(ledger, 'ai', aiObservations([ai('applied')]))).toEqual([])
    expect(observeJobs(ledger, 'ai', aiObservations([ai('failed', 'ai-2')]))).toMatchObject([{ state: 'failed' }])
  })
})
