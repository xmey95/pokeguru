import type { MatchupTournamentEvidence, MetaDeck, MetaSnapshot } from './meta-matchups'
import type { TournamentSnapshot } from './tournament'
import type { CatalogView } from './catalog'

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function empty(status: MatchupTournamentEvidence['status'], detail: string,
  event: TournamentSnapshot | null): MatchupTournamentEvidence {
  return { status, detail, eventId: event?.eventId ?? null, eventName: event?.name ?? null,
    eventDate: event?.date ?? null, eventUrl: event?.publicUrl ?? null,
    eventLists: event?.coverage.complete60Lists ?? null,
    eventParticipants: event?.coverage.returnedParticipants ?? null,
    matchedDeckId: null, matchedCompleteLists: 0, observedCards: [], sampleLists: [] }
}

/** Only an exact Limitless Play archetype slug counts as a match to the separate Metagame taxonomy. */
export function matchupTournamentEvidence(meta: MetaSnapshot, opponent: MetaDeck,
  event: TournamentSnapshot | null, catalog: CatalogView | null = null): MatchupTournamentEvidence {
  if (!event) return empty('unavailable', 'Nessun torneo online salvato.', null)
  const eventTime = Date.parse(event.date)
  const metaTime = Date.parse(meta.fetchedAt)
  if (meta.circuit !== 'WESTERN' || meta.format !== 'STANDARD' || event.circuit !== 'WESTERN' ||
    event.format !== 'STANDARD' || event.platform !== 'PTCGL' || !event.isOnline ||
    !Number.isFinite(eventTime) || !Number.isFinite(metaTime) || eventTime > metaTime ||
    metaTime - eventTime > 31 * 86_400_000) {
    return empty('incompatible', 'Evento fuori dal circuito, formato o periodo dello snapshot Meta.', event)
  }
  const matchingIds = [...new Set(event.participations.filter((entry) => entry.deck &&
    slug(entry.deck.id) === slug(opponent.name)).map((entry) => entry.deck!.id))]
  if (matchingIds.length !== 1) return empty('unavailable', matchingIds.length > 1
    ? 'Identità dell’archetipo ambigua fra le partecipazioni.'
    : 'Nessun archetipo dell’evento coincide con il nome dello snapshot Meta.', event)
  const matchedDeckId = matchingIds[0]
  const lists = event.participations.filter((entry) => entry.deck?.id === matchedDeckId &&
    entry.listStatus === 'available' && entry.cardTotal === 60)
  if (lists.length === 0) return empty('unavailable', 'Archetipo presente, ma nessuna lista completa leggibile.', event)
  const counts = new Map<string, number>()
  for (const participation of lists) {
    const names = new Set(participation.cards.map((card) => card.name.trim()).filter(Boolean))
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const observedCards = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 18).map(([name, seen]) => {
      const prints = catalog?.prints.filter((print) => print.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase() &&
        print.detailAt !== null) ?? []
      const identities = new Set(prints.map((print) => print.identityId).filter(Boolean))
      const recognized = prints.length > 0 && identities.size === 1 &&
        prints.every((print) => print.identityBasis === 'trainer-text')
      return { name, lists: seen, catalogIdentityId: recognized ? [...identities][0] : null,
        catalogStatus: recognized ? 'recognized' as const : prints.length ? 'ambiguous' as const : 'not-in-catalog' as const }
    })
  const sampleLists = [...lists].sort((a, b) => (a.placing ?? Infinity) - (b.placing ?? Infinity))
    .slice(0, 3).map((entry) => ({ placing: entry.placing,
      url: `${event.publicUrl}/player/${encodeURIComponent(entry.playerId)}/decklist` }))
  return { status: 'matched', detail: 'Liste di un singolo torneo online pubblico, separate dal Metagame principale.',
    eventId: event.eventId, eventName: event.name, eventDate: event.date, eventUrl: event.publicUrl,
    eventLists: event.coverage.complete60Lists, eventParticipants: event.coverage.returnedParticipants,
    matchedDeckId, matchedCompleteLists: lists.length, observedCards, sampleLists }
}
