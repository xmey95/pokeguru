import type { AiEvidenceQueryResult } from '../shared/ai-evidence'
import type { AiEvidenceEngine } from './ai-evidence-engine'
import { AiEvidenceArchive, type EvidenceSearch } from './ai-evidence-archive'
import { AiFailure } from './ai-failure'

/** Drain one durable local search. Its cursor commits with its page, so restarting
 * never repeats successful queries. Cancellation is observed between pages and
 * after the engine returns; an incomplete page is safe to execute again. */
export async function collectArchivedEvidence(input: unknown, engine: AiEvidenceEngine,
  archive: AiEvidenceArchive, options: { signal?: AbortSignal;
    onPage?: (page: AiEvidenceQueryResult, search: EvidenceSearch) => void } = {}): Promise<EvidenceSearch> {
  let search = archive.search(input)
  let previousRemaining = archive.lastPageMetadata(search.key)?.remaining
  while (search.cursor !== null) {
    const check = () => {
      if (options.signal?.aborted) throw new AiFailure(options.signal.reason === 'pause' ? 'paused' : 'cancelled',
        options.signal.reason === 'pause' ? 'Analisi in pausa. Il lavoro completato è conservato.' : 'Analisi annullata.')
    }
    check()
    const page = engine.execute(search.cursor)
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
    archive.appendPage(search.key, search.cursor, page, next)
    search = archive.getSearch(search.key)!
    options.onPage?.(page, search)
    previousRemaining = typeof remaining === 'number' ? remaining : undefined
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  return search
}
