import type { AiEvidenceQueryResult } from '../shared/ai-evidence'
import type { AiEvidenceEngine } from './ai-evidence-engine'
import { AiEvidenceArchive, type EvidenceSearch } from './ai-evidence-archive'
import { AiFailure } from './ai-failure'
import type { AiCollectionDiagnostics } from '../shared/ai-diagnostics'

export type CollectionObserver = (progress: AiCollectionDiagnostics, force: boolean) => void

/** Drain one durable local search. Its cursor commits with its page, so restarting
 * never repeats successful queries. Cancellation is observed between pages and
 * after the engine returns; an incomplete page is safe to execute again. */
export async function collectArchivedEvidence(input: unknown, engine: AiEvidenceEngine,
  archive: AiEvidenceArchive, options: { signal?: AbortSignal;
    onPage?: (page: AiEvidenceQueryResult, search: EvidenceSearch) => void;
    onProgress?: CollectionObserver } = {}): Promise<EvidenceSearch> {
  let search = archive.search(input)
  let previousRemaining = archive.lastPageMetadata(search.key)?.remaining
  if (search.cursor === null) return search
  const startedAt = new Date().toISOString()
  const metrics: AiCollectionDiagnostics = {
    operation: (input as { operation?: string } | null)?.operation?.startsWith('events.') ? 'events' : 'catalog',
    stage: 'reading', startedAt, updatedAt: startedAt, pages: search.pages,
    queryMs: 0, persistMs: 0, dependencyMs: 0, maxPageMs: 0
  }
  const report = (stage: AiCollectionDiagnostics['stage'], force = false) => {
    metrics.stage = stage
    metrics.updatedAt = new Date().toISOString()
    options.onProgress?.({ ...metrics, queryMs: Math.round(metrics.queryMs),
      persistMs: Math.round(metrics.persistMs), dependencyMs: Math.round(metrics.dependencyMs),
      maxPageMs: Math.round(metrics.maxPageMs) }, force)
  }
  report('reading', true)
  // Publish the phase and let pause/shutdown requests arrive before local work.
  await new Promise<void>((resolve) => setImmediate(resolve))
  try {
    while (search.cursor !== null) {
      const check = () => {
        if (options.signal?.aborted) throw new AiFailure(options.signal.reason === 'pause' ? 'paused' : 'cancelled',
          options.signal.reason === 'pause' ? 'Analisi in pausa. Il lavoro completato è conservato.' : 'Analisi annullata.')
      }
      check()
      const pageStarted = performance.now()
      report('reading')
      let started = performance.now()
      let page: AiEvidenceQueryResult
      try { page = engine.execute(search.cursor) }
      finally { metrics.queryMs += performance.now() - started }
      check()
      const data = page.data as { remaining?: unknown; offset?: unknown } | null
      const query = page.query as { offset?: unknown; limit?: unknown } | null
      const remaining = data?.remaining
      let next: unknown | null = null
      if (page.status === 'ok') {
        if (!Number.isSafeInteger(remaining) || Number(remaining) < 0 ||
          (previousRemaining !== undefined && Number(remaining) >= previousRemaining))
          throw new AiFailure('query-limit', 'La ricerca non avanza sui dati salvati. Il lavoro completato è conservato.')
        if (Number(remaining) > 0) {
          if (!Number.isSafeInteger(query?.offset) || !Number.isSafeInteger(query?.limit) ||
            Number(query?.offset) < 0 || Number(query?.limit) <= 0 ||
            !Number.isSafeInteger(Number(query?.offset) + Number(query?.limit)))
            throw new AiFailure('invalid-plan', 'La ricerca non ha restituito un punto di ripresa valido.')
          next = { ...query, offset: Number(query!.offset) + Number(query!.limit) }
        }
      }
      report('saving')
      started = performance.now()
      try { archive.appendPage(search.key, search.cursor, page, next) }
      finally { metrics.persistMs += performance.now() - started }
      search = archive.getSearch(search.key)!
      metrics.pages = search.pages
      if (page.status === 'ok') {
        const scope = page.data as { totalMatches?: number; scope?: { matchingLists?: number } }
        const total = scope.totalMatches ?? scope.scope?.matchingLists
        metrics.remaining = Number(remaining)
        if (Number.isSafeInteger(total) && total! >= Number(remaining)) {
          metrics.total = total
          metrics.items = total! - Number(remaining)
        }
      }
      report('cards')
      started = performance.now()
      try { options.onPage?.(page, search) }
      finally { metrics.dependencyMs += performance.now() - started }
      metrics.maxPageMs = Math.max(metrics.maxPageMs, performance.now() - pageStarted)
      report(search.cursor === null ? 'complete' : 'page', search.cursor === null)
      previousRemaining = typeof remaining === 'number' ? remaining : undefined
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  } catch (error) { report('interrupted', true); throw error }
  return search
}
