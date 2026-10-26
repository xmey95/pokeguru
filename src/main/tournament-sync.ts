import type { TournamentSyncProgress } from '../shared/tournament'
import { fetchTournament, fetchTournamentIndex, LimitlessRateLimitError, LimitlessSyncPaused } from './limitless-event'
import type { TournamentStore } from './tournament-store'
import { westernRotationRule } from '../shared/standard-rotation'
import { localCalendarDate } from '../shared/calendar-date'
import { randomUUID } from 'node:crypto'

const EVENTS_PER_BLOCK = 3
const INDEX_PAGES_PER_BLOCK = 2
const PLAY_LOOKBACK_DAYS = 90
const MIN_PLAY_PLAYERS = 50

function windowStart(now: Date, rotationStart: string): string {
  const recent = new Date(now.getTime() - PLAY_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  return recent > rotationStart ? recent : rotationStart
}

function initial(mode: 'new' | 'full', previous: TournamentSyncProgress,
  rotationStart: string, now: Date): TournamentSyncProgress {
  return {
    mode, runId: randomUUID(), status: 'running', page: 1, pending: [], inspected: 0, saved: 0, skipped: 0,
    watermark: previous.watermark, previousWatermark: windowStart(now, rotationStart),
    newestSeen: null, stopAfterPage: false, cooldownUntil: null, lastError: null,
    rotationStart, rotationCleanup: previous.rotationCleanup
  }
}

function finish(progress: TournamentSyncProgress): TournamentSyncProgress {
  return { ...progress, status: 'complete', pending: [], stopAfterPage: false,
    watermark: progress.newestSeen && (!progress.watermark || progress.newestSeen > progress.watermark)
      ? progress.newestSeen : progress.watermark }
}

/** One persisted block; the application job advances subsequent blocks at a controlled pace. */
export async function syncTournamentBlock(store: TournamentStore, mode: 'new' | 'full',
  fetcher: typeof fetch = fetch, now = new Date(), shouldStop: () => boolean = () => false): Promise<TournamentSyncProgress> {
  const rotation = westernRotationRule(localCalendarDate(now))
  if (!rotation) throw new Error('Nessuna rotazione Standard occidentale inclusa per la data corrente.')
  let firstIndex: Awaited<ReturnType<typeof fetchTournamentIndex>> | null = null
  if (store.rotationNeedsPreflight(rotation)) {
    // Keep the old global archive intact when the new source cannot be read.
    try { firstIndex = await fetchTournamentIndex(1, fetcher) }
    catch (error) {
      if (error instanceof LimitlessRateLimitError) {
        const delayed = { ...store.progress(), status: 'rate-limited' as const, cooldownUntil: error.retryAt }
        store.saveProgress(delayed)
        return delayed
      }
      throw error
    }
    if (!firstIndex.length) throw new Error('Indice Play vuoto: archivio precedente conservato.')
  }
  await store.ensureRotation(rotation)
  let progress = store.progress()
  if (progress.mode !== mode || progress.status === 'idle' || progress.status === 'complete') {
    progress = initial(mode, progress, rotation.effectiveFrom, now)
    store.saveProgress(progress)
  } else {
    const cutoff = windowStart(now, rotation.effectiveFrom)
    if (!progress.previousWatermark || progress.previousWatermark < cutoff) {
      progress = { ...progress, previousWatermark: cutoff,
        pending: progress.pending.filter((entry) => entry.date >= cutoff) }
      store.saveProgress(progress)
    }
  }
  if (progress.cooldownUntil && Date.parse(progress.cooldownUntil) > now.getTime()) return progress
  if (progress.status === 'rate-limited') {
    progress = { ...progress, status: 'running', cooldownUntil: null }
    store.saveProgress(progress)
  }
  let processed = 0
  let pages = 0
  while (processed < EVENTS_PER_BLOCK) {
    if (westernRotationRule(localCalendarDate())?.version !== rotation.version)
      throw new Error('La rotazione Standard è cambiata durante la scansione Play; riprendi con il nuovo periodo.')
    if (shouldStop()) return progress
    if (!progress.pending.length) {
      if (progress.stopAfterPage || progress.page > 10_000) {
        progress = finish(progress)
        store.saveProgress(progress)
        return progress
      }
      if (pages >= INDEX_PAGES_PER_BLOCK) return progress
      let index
      try { index = progress.page === 1 && firstIndex ? firstIndex : await fetchTournamentIndex(progress.page, fetcher) }
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
        (!cutoff || entry.date >= cutoff) && entry.players >= MIN_PLAY_PLAYERS &&
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
      store.save(await fetchTournament(candidate.id, fetcher, shouldStop))
      progress = { ...progress, pending: progress.pending.slice(1), inspected: progress.inspected + 1,
        saved: progress.saved + 1, lastError: null }
    } catch (error) {
      if (error instanceof LimitlessSyncPaused) return progress
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
