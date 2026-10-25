import type { MainTournamentParticipant, MainTournamentSyncProgress } from '../shared/main-tournament'
import { completeMainTournament, fetchMainDecklist, fetchMainTournament,
  fetchMainTournamentIndexPage, MainLimitlessRateLimitError,
  MainLimitlessUnavailableError } from './limitless-main-tournament'
import type { TournamentStore } from './tournament-store'
import { randomUUID } from 'node:crypto'
import { westernRotationRule } from '../shared/standard-rotation'
import { localCalendarDate } from '../shared/calendar-date'

const REQUESTS_PER_BLOCK = 7
const LISTS_PER_EVENT = 16
function initial(mode: 'new' | 'full', old: MainTournamentSyncProgress, rotationStart: string): MainTournamentSyncProgress {
  return { mode, runId: randomUUID(), status: 'running', page: 1, maxPages: null, pendingEvents: [], pendingLists: [],
    inspectedEvents: 0, fetchedLists: 0, rotationStart, scannedPages: 0, indexedRows: 0,
    eligibleEvents: 0, ineligibleEvents: 0, unavailableIndexRows: 0, outsideRotationEvents: 0,
    alreadyAcquiredEvents: 0, unavailableEvents: [], unavailableLists: [], watermark: old.watermark,
    previousWatermark: rotationStart, rotationCleanup: old.rotationCleanup,
    newestSeen: null, stopAfterPage: false, cooldownUntil: null, lastError: null }
}

function finish(progress: MainTournamentSyncProgress): MainTournamentSyncProgress {
  return { ...progress, status: 'complete', stopAfterPage: false,
    watermark: progress.newestSeen && (!progress.watermark || progress.newestSeen > progress.watermark)
      ? progress.newestSeen : progress.watermark }
}

function selectedLists(participants: MainTournamentParticipant[]): string[] {
  const seen = new Set<string>()
  const listIds: string[] = []
  for (const participant of participants) {
    if (!participant.deckId || !participant.listId || seen.has(participant.deckId)) continue
    seen.add(participant.deckId)
    listIds.push(participant.listId)
    if (listIds.length >= LISTS_PER_EVENT) break
  }
  return listIds
}

/** Stores result rows first, then retrieves a bounded set of representative decklists over resumable blocks. */
export async function syncMainTournamentBlock(store: TournamentStore, mode: 'new' | 'full',
  fetcher: typeof fetch = fetch, now = new Date(), shouldStop: () => boolean = () => false): Promise<MainTournamentSyncProgress> {
  const rotation = westernRotationRule(localCalendarDate(now))
  if (!rotation) throw new Error('Nessuna rotazione Standard occidentale inclusa per la data corrente.')
  let firstIndex: Awaited<ReturnType<typeof fetchMainTournamentIndexPage>> | null = null
  if (store.rotationNeedsPreflight(rotation)) {
    // A failed index request must leave the previous global archive available.
    try { firstIndex = await fetchMainTournamentIndexPage(1, fetcher) }
    catch (error) {
      if (error instanceof MainLimitlessRateLimitError) {
        const delayed = { ...store.mainProgress(), status: 'rate-limited' as const, cooldownUntil: error.retryAt }
        store.saveMainProgress(delayed)
        return delayed
      }
      throw error
    }
    if (!firstIndex.entries.length) throw new Error('Indice Regional vuoto: archivio precedente conservato.')
  }
  await store.ensureRotation(rotation)
  let progress = store.mainProgress()
  if (progress.mode !== mode || progress.status === 'idle' || progress.status === 'complete' ||
    progress.rotationStart !== rotation.effectiveFrom) {
    const next = initial(mode, progress, rotation.effectiveFrom)
    // A legacy current-period queue still finishes before the wider backfill.
    progress = progress.mode === mode && (progress.status === 'running' || progress.status === 'rate-limited')
      ? { ...next, runId: progress.runId ?? next.runId, status: progress.status, cooldownUntil: progress.cooldownUntil,
        pendingEvents: progress.pendingEvents, pendingLists: progress.pendingLists }
      : next
    store.saveMainProgress(progress)
  }
  if (progress.cooldownUntil && Date.parse(progress.cooldownUntil) > now.getTime()) return progress
  if (progress.status === 'rate-limited') {
    progress = { ...progress, status: 'running', cooldownUntil: null }
    store.saveMainProgress(progress)
  }
  let requests = 0
  while (requests < REQUESTS_PER_BLOCK) {
    if (westernRotationRule(localCalendarDate())?.version !== rotation.version)
      throw new Error('La rotazione Standard è cambiata durante la scansione Regional; riprendi con il nuovo periodo.')
    if (shouldStop()) return progress
    try {
      if (progress.pendingLists.length) {
        const pending = progress.pendingLists[0]
        const event = store.getMain(pending.eventId)
        if (!event) throw new Error('Evento Regional in coda non trovato.')
        const list = await fetchMainDecklist(pending.listId, fetcher)
        const participants = event.participants.map((item) => item.listId === pending.listId
          ? { ...item, cards: list.cards, cardTotal: list.total, listUnavailable: false } : item)
        const remaining = progress.pendingLists.slice(1)
        store.saveMain(completeMainTournament({ ...event, fetchedAt: new Date().toISOString(),
          participants, cached: false }), remaining.length === 0)
        progress = { ...progress, pendingLists: remaining,
          fetchedLists: progress.fetchedLists + 1, lastError: null }
      } else if (progress.pendingEvents.length) {
        const entry = progress.pendingEvents[0]
        const old = store.getMain(entry.eventId)
        const fresh = await fetchMainTournament(entry, fetcher)
        const cardsById = new Map(old?.participants.filter((item) => item.listId && item.cards)
          .map((item) => [item.listId!, { cards: item.cards, total: item.cardTotal }]) ?? [])
        const participants = fresh.participants.map((item) => ({ ...item,
          cards: item.listId ? cardsById.get(item.listId)?.cards ?? null : null,
          cardTotal: item.listId ? cardsById.get(item.listId)?.total ?? null : null,
          listUnavailable: false }))
        const pendingLists = selectedLists(participants).map((listId) => ({ eventId: entry.eventId, listId }))
        store.saveMain(completeMainTournament({ ...fresh, participants }), pendingLists.length === 0)
        progress = { ...progress, pendingEvents: progress.pendingEvents.slice(1),
          pendingLists,
          inspectedEvents: progress.inspectedEvents + 1, lastError: null }
      } else if (progress.stopAfterPage || (progress.maxPages !== null && progress.page > progress.maxPages)) {
        progress = finish(progress)
        store.saveMainProgress(progress)
        return progress
      } else {
        const index = progress.page === 1 && firstIndex ? firstIndex
          : await fetchMainTournamentIndexPage(progress.page, fetcher)
        const cutoff = progress.rotationStart!
        const inRotation = index.entries.filter((entry) => entry.date.slice(0, 10) >= cutoff)
        const already = mode === 'new' ? inRotation.filter((entry) => store.getMain(entry.eventId)) : []
        progress = { ...progress, page: progress.page + 1, maxPages: index.maxPages,
          scannedPages: progress.scannedPages + 1,
          indexedRows: progress.indexedRows + index.indexedRows,
          eligibleEvents: progress.eligibleEvents + inRotation.length,
          ineligibleEvents: progress.ineligibleEvents + index.ineligibleRows,
          unavailableIndexRows: progress.unavailableIndexRows + index.unavailableRows,
          outsideRotationEvents: progress.outsideRotationEvents + index.entries.length - inRotation.length,
          alreadyAcquiredEvents: progress.alreadyAcquiredEvents + already.length,
          newestSeen: progress.newestSeen ?? index.entries[0]?.date ?? null,
          stopAfterPage: Boolean(index.oldestDate && index.oldestDate.slice(0, 10) < cutoff),
          pendingEvents: inRotation.filter((entry) =>
            (mode === 'full' || !store.getMain(entry.eventId))) }
      }
      requests++
      store.saveMainProgress(progress)
    } catch (error) {
      if (error instanceof MainLimitlessRateLimitError) {
        progress = { ...progress, status: 'rate-limited', cooldownUntil: error.retryAt }
        store.saveMainProgress(progress)
        return progress
      }
      if (error instanceof MainLimitlessUnavailableError && progress.pendingLists.length) {
        const pending = progress.pendingLists[0]
        const event = store.getMain(pending.eventId)
        if (!event) throw new Error('Evento Regional in coda non trovato.')
        const remaining = progress.pendingLists.slice(1)
        const participants = event.participants.map((item) => item.listId === pending.listId
          ? { ...item, listUnavailable: true } : item)
        store.saveMain(completeMainTournament({ ...event, fetchedAt: new Date().toISOString(),
          participants, cached: false }), remaining.length === 0)
        progress = { ...progress, pendingLists: remaining,
          unavailableLists: [...progress.unavailableLists, pending] }
        requests++
        store.saveMainProgress(progress)
        continue
      }
      if (error instanceof MainLimitlessUnavailableError && progress.pendingEvents.length) {
        progress = { ...progress, pendingEvents: progress.pendingEvents.slice(1),
          unavailableEvents: [...progress.unavailableEvents, progress.pendingEvents[0]] }
        requests++
        store.saveMainProgress(progress)
        continue
      }
      progress = { ...progress, lastError: error instanceof Error ? error.message : 'Fonte Regional non leggibile.' }
      store.saveMainProgress(progress)
      throw error
    }
  }
  return progress
}
