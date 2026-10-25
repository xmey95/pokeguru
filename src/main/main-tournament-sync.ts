import type { MainTournamentParticipant, MainTournamentSyncProgress } from '../shared/main-tournament'
import { completeMainTournament, fetchMainDecklist, fetchMainTournament,
  fetchMainTournamentIndexPage, MainLimitlessRateLimitError } from './limitless-main-tournament'
import type { TournamentStore } from './tournament-store'

const REQUESTS_PER_BLOCK = 7
const LISTS_PER_EVENT = 16
const FIRST_SYNC_DAYS = 90

function initial(mode: 'new' | 'full', old: MainTournamentSyncProgress, now: Date): MainTournamentSyncProgress {
  return { mode, status: 'running', page: 1, maxPages: null, pendingEvents: [], pendingLists: [],
    inspectedEvents: 0, fetchedLists: 0, watermark: old.watermark,
    previousWatermark: mode === 'new' ? old.watermark ??
      new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000).toISOString() : null,
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
  fetcher: typeof fetch = fetch, now = new Date()): Promise<MainTournamentSyncProgress> {
  let progress = store.mainProgress()
  if (progress.mode !== mode || progress.status === 'idle' || progress.status === 'complete') {
    progress = initial(mode, progress, now)
    store.saveMainProgress(progress)
  }
  if (progress.cooldownUntil && Date.parse(progress.cooldownUntil) > now.getTime()) return progress
  if (progress.status === 'rate-limited') {
    progress = { ...progress, status: 'running', cooldownUntil: null }
    store.saveMainProgress(progress)
  }
  let requests = 0
  while (requests < REQUESTS_PER_BLOCK) {
    try {
      if (progress.pendingLists.length) {
        const pending = progress.pendingLists[0]
        const event = store.getMain(pending.eventId)
        if (!event) throw new Error('Evento Regional in coda non trovato.')
        const list = await fetchMainDecklist(pending.listId, fetcher)
        const participants = event.participants.map((item) => item.listId === pending.listId
          ? { ...item, cards: list.cards, cardTotal: list.total } : item)
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
          cardTotal: item.listId ? cardsById.get(item.listId)?.total ?? null : null }))
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
        const index = await fetchMainTournamentIndexPage(progress.page, fetcher)
        const cutoff = progress.previousWatermark
        progress = { ...progress, page: progress.page + 1, maxPages: index.maxPages,
          newestSeen: progress.newestSeen ?? index.entries[0]?.date ?? null,
          stopAfterPage: Boolean(cutoff && index.entries.some((entry) => entry.date < cutoff)),
          pendingEvents: index.entries.filter((entry) => (!cutoff || entry.date >= cutoff) &&
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
      progress = { ...progress, lastError: error instanceof Error ? error.message : 'Fonte Regional non leggibile.' }
      store.saveMainProgress(progress)
      throw error
    }
  }
  return progress
}
