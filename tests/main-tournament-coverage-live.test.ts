import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncMainTournamentBlock } from '../src/main/main-tournament-sync'
import { TournamentStore } from '../src/main/tournament-store'

it.skipIf(process.env.POKEGURU_MAIN_COVERAGE_LIVE !== '1')(
  'persists one low-volume block from the real Regional index in an isolated database', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'pokeguru-regional-live-'))
    const path = join(folder, 'events.sqlite')
    try {
      const store = new TournamentStore(path)
      const progress = await syncMainTournamentBlock(store, 'new')
      expect(progress.scannedPages).toBeGreaterThanOrEqual(1)
      expect(progress.rotationStart).toBe('2026-04-10')
      expect(progress.indexedRows).toBeGreaterThan(0)
      store.close()
      const reopened = new TournamentStore(path)
      try {
        expect(reopened.mainProgress()).toMatchObject({ page: progress.page,
          scannedPages: progress.scannedPages, indexedRows: progress.indexedRows })
        expect(reopened.mainSummaries().length).toBeGreaterThan(0)
        console.log(JSON.stringify({ pages: progress.scannedPages, indexed: progress.indexedRows,
          eligible: progress.eligibleEvents, ineligible: progress.ineligibleEvents,
          archived: reopened.mainSummaries().map(({ eventId, name, coverage }) =>
            ({ eventId, name, coverage })) }))
      } finally { reopened.close() }
    } finally { rmSync(folder, { recursive: true, force: true }) }
  }, 90_000)
