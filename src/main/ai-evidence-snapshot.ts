import type { CatalogView } from '../shared/catalog'
import type { TournamentSnapshot } from '../shared/tournament'
import type { MainTournamentSnapshot } from '../shared/main-tournament'
import { AiEvidenceArchive, evidenceOccurrenceIdentity, exactDeckIdentity } from './ai-evidence-archive'
import { createAiEvidenceEngine, evidenceEventRows, normalizedEvidenceText,
  type EvidenceEventRow } from './ai-evidence-engine'
import { eventOverview, type EventCoverage } from './ai-event-aggregates'

interface SourceSnapshot { catalog: CatalogView; window: { from: string; to: string }; eventCoverage?: EventCoverage[] }

/** Source factories are lazy: resumed work reads only its sealed source snapshot.
 * Event pages count participations, so one popular deck cannot create an unbounded
 * occurrence array. Exact deck deduplication happens across pages in the archive. */
export function createArchivedEvidenceEngine(archive: AiEvidenceArchive,
  sources: () => SourceSnapshot & { play: Iterable<TournamentSnapshot>; main: Iterable<MainTournamentSnapshot> }) {
  let snapshot = archive.value<SourceSnapshot>('snapshot', 'sources')
  if (!snapshot) {
    const { catalog, window, play, main } = sources()
    const eventCoverage: EventCoverage[] = []
    function* playEvents() {
      for (const event of play) {
        if (event.circuit === 'WESTERN' && event.format === 'STANDARD' && event.date >= window.from && event.date <= window.to)
          eventCoverage.push({ id: `play:${event.eventId}`, date: event.date, kind: event.isOnline ? 'online' : 'in-person',
            url: event.publicUrl, returnedParticipants: event.coverage.returnedParticipants, completeLists: event.coverage.complete60Lists })
        yield event
      }
    }
    function* mainEvents() {
      for (const event of main) {
        if (event.circuit === 'WESTERN' && event.format === 'STANDARD' && event.date >= window.from && event.date <= window.to)
          eventCoverage.push({ id: `main:${event.eventId}`, date: event.date, kind: 'in-person', url: event.url,
            returnedParticipants: event.coverage.returnedParticipants, completeLists: event.coverage.complete60Lists })
        yield event
      }
    }
    function* rows() {
      for (const row of evidenceEventRows(playEvents(), mainEvents())) {
        if (row.date < window.from || row.date > window.to) continue
        yield { key: evidenceOccurrenceIdentity(row), deckKey: exactDeckIdentity(row.cards),
          date: row.date, placing: row.placing, deckName: row.deck,
          deckText: normalizedEvidenceText(row.deck),
          cardsText: row.cards.map(normalizedEvidenceText).join('\n'), value: row }
      }
    }
    archive.captureSources({ catalog, window, eventCoverage }, rows())
    snapshot = { catalog, window, eventCoverage }
  }
  const engine = createAiEvidenceEngine(snapshot.catalog, [], [], snapshot.window, {
    names: () => archive.eventNames(),
    overview: (from, to) => eventOverview(archive.eventRows<EvidenceEventRow>(), from, to, snapshot.eventCoverage),
    details: (deckKey, offset, limit, eventId) => archive.eventDetails(deckKey, offset, limit, eventId),
    search(query) {
      const { rows, ...scope } = archive.eventPage<EvidenceEventRow>({
        from: query.from!, to: query.to!, deck: normalizedEvidenceText(query.deckName ?? ''),
        card: normalizedEvidenceText(query.cardName ?? ''), offset: query.offset!, limit: query.limit! })
      const groups = new Map<string, EvidenceEventRow & { occurrences: Omit<EvidenceEventRow, 'cards'>[] }>()
      for (const row of rows) {
        const key = exactDeckIdentity(row.cards)
        const { cards: _cards, ...occurrence } = row
        const existing = groups.get(key)
        if (existing) existing.occurrences.push(occurrence)
        else groups.set(key, { ...row, occurrences: [occurrence] })
      }
      return { scope: { ...scope, from: query.from, to: query.to,
        duplicateLists: scope.matchingLists - scope.distinctDecks },
        paginationUnit: 'participation', offset: query.offset,
        remaining: Math.max(0, scope.matchingLists - query.offset! - rows.length), lists: [...groups.values()] }
    }
  })
  return { engine, catalog: snapshot.catalog }
}
