import type { TournamentSyncProgress } from '../shared/tournament'
import { fetchTournament, fetchTournamentIndex, LimitlessRateLimitError } from './limitless-event'
import type { TournamentStore } from './tournament-store'

const EVENTS_PER_BLOCK = 3
const INDEX_PAGES_PER_BLOCK = 2
const FIRST_SYNC_DAYS = 90

function initial(mode: 'new' | 'full', previous: TournamentSyncProgress, now: Date): TournamentSyncProgress {
  return {
    mode, status: 'running', page: 1, pending: [], inspected: 0, saved: 0, skipped: 0,
    watermark: previous.watermark, previousWatermark: mode === 'new'
      ? previous.watermark ?? new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000).toISOString() : null,
    newestSeen: null, stopAfterPage: false, cooldownUntil: null, lastError: null
  }
}

function finish(progress: TournamentSyncProgress): TournamentSyncProgress {
  return { ...progress, status: 'complete', pending: [], stopAfterPage: false,
    watermark: progress.newestSeen && (!progress.watermark || progress.newestSeen > progress.watermark)
      ? progress.newestSeen : progress.watermark }
}

/** One explicit, persisted block makes a 50-in-5-min API quota manageable without an unbounded background job. */
export async function syncTournamentBlock(store: TournamentStore, mode: 'new' | 'full',
  fetcher: typeof fetch = fetch, now = new Date()): Promise<TournamentSyncProgress> {
  let progress = store.progress()
  if (progress.mode !== mode || progress.status === 'idle' || progress.status === 'complete') {
    progress = initial(mode, progress, now)
    store.saveProgress(progress)
  }
  if (progress.cooldownUntil && Date.parse(progress.cooldownUntil) > now.getTime()) return progress
  if (progress.status === 'rate-limited') {
    progress = { ...progress, status: 'running', cooldownUntil: null }
    store.saveProgress(progress)
  }
  let processed = 0
  let pages = 0
  while (processed < EVENTS_PER_BLOCK) {
    if (!progress.pending.length) {
      if (progress.stopAfterPage || progress.page > 10_000) {
        progress = finish(progress)
        store.saveProgress(progress)
        return progress
      }
      if (pages >= INDEX_PAGES_PER_BLOCK) return progress
      let index
      try { index = await fetchTournamentIndex(progress.page, fetcher) }
      catch (error) {
        if (error instanceof LimitlessRateLimitError) {
          progress = { ...progress, status: 'rate-limited', cooldownUntil: error.retryAt }
          store.saveProgress(progress)
          return progress
        }
        throw error
      }
      pages++
      if (!index.length) {
        progress = finish(progress)
        store.saveProgress(progress)
        return progress
      }
      const cutoff = progress.previousWatermark
      const completed = index.filter((entry) => Date.parse(entry.date) < now.getTime() - 18 * 3_600_000)
      const eligible = index.filter((entry) => Date.parse(entry.date) < now.getTime() - 18 * 3_600_000 &&
        (!cutoff || entry.date >= cutoff) && entry.players >= 8 &&
        (mode === 'full' || !store.hasEvent(entry.id)))
      progress = { ...progress, page: progress.page + 1,
        newestSeen: progress.newestSeen ?? completed[0]?.date ?? null,
        stopAfterPage: Boolean(cutoff && index.some((entry) => entry.date < cutoff)) || index.length < 50,
        pending: eligible.map((entry) => ({ id: entry.id, date: entry.date })) }
      store.saveProgress(progress)
      continue
    }
    const candidate = progress.pending[0]
    try {
      store.save(await fetchTournament(candidate.id, fetcher))
      progress = { ...progress, pending: progress.pending.slice(1), inspected: progress.inspected + 1,
        saved: progress.saved + 1, lastError: null }
    } catch (error) {
      if (error instanceof LimitlessRateLimitError) {
        progress = { ...progress, status: 'rate-limited', cooldownUntil: error.retryAt }
        store.saveProgress(progress)
        return progress
      }
      const message = error instanceof Error ? error.message : 'Risposta evento non valida.'
      if (!message.includes('fuori perimetro') && !message.includes('non pubblico') &&
        !message.includes('risposta Limitless Play non valida') && !message.includes('HTTP 404')) {
        progress = { ...progress, lastError: message }
        store.saveProgress(progress)
        throw error
      }
      progress = { ...progress, pending: progress.pending.slice(1), inspected: progress.inspected + 1,
        skipped: progress.skipped + 1, lastError: message }
    }
    processed++
    store.saveProgress(progress)
  }
  return progress
}
