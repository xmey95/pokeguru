import type { MatchupTournamentEvidence, MetaDeck, MetaSnapshot } from './meta-matchups'
import type { TournamentSnapshot } from './tournament'
import type { MainTournamentSnapshot } from './main-tournament'
import type { CatalogView } from './catalog'
import { gameplaySummary } from './card-gameplay'
import { effectiveCardGameplay } from './card-errata'
import { localCalendarDate } from './calendar-date'
import { OFFICIAL_SET_CODES } from './set-codes'

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function fingerprint(value: unknown): string {
  const input = JSON.stringify(value)
  const mask = (1n << 64n) - 1n
  let first = 0xcbf29ce484222325n
  let second = 0x84222325cbf29cen
  for (let index = 0; index < input.length; index++) {
    const code = BigInt(input.charCodeAt(index))
    first = ((first ^ code) * 0x100000001b3n) & mask
    second = ((second ^ code) * 0x100000001b3n) & mask
  }
  return first.toString(16).padStart(16, '0') + second.toString(16).padStart(16, '0')
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

function sameNumber(left: string, right: string): boolean {
  return left.replace(/^0+/, '') === right.replace(/^0+/, '')
}

/** A versioned read-only packet spanning both Limitless sources; legacy reports retain their original packet. */
export function multiMatchupEvidence(meta: MetaSnapshot, opponent: MetaDeck,
  playEvents: TournamentSnapshot[], mainEvents: MainTournamentSnapshot[],
  catalog: CatalogView | null = null): MatchupTournamentEvidence {
  const printsByName = new Map<string, NonNullable<typeof catalog>['prints']>()
  for (const print of catalog?.prints ?? []) {
    const name = print.name.toLocaleLowerCase()
    const named = printsByName.get(name) ?? []
    named.push(print)
    printsByName.set(name, named)
  }
  const setCodes = new Map(catalog?.sets.flatMap((set) =>
    set.abbreviation ? [[set.id, set.abbreviation.toUpperCase()] as const] : []) ?? [])
  const metaTime = Date.parse(meta.fetchedAt)
  const inWindow = (date: string): boolean => {
    const time = Date.parse(date)
    return Number.isFinite(time) && Number.isFinite(metaTime) && time <= metaTime &&
      metaTime - time <= 31 * 86_400_000
  }
  const rows: { name: string; source: 'play' | 'main'; eventId: string; eventName: string;
    eventDate: string; eventUrl: string; participants: number; visible: number;
    completeLists: number; cards: { name: string; count: number; set: string; number: string }[];
    placing: number | null; url: string }[] = []
  const eventDetails: NonNullable<MatchupTournamentEvidence['events']> = []
  let wins = 0; let losses = 0; let ties = 0; let eligiblePairings = 0; let eventsWithPairings = 0
  const matchDates: string[] = []

  for (const event of playEvents.filter((item) => item.circuit === 'WESTERN' &&
    item.format === 'STANDARD' && item.isOnline && inWindow(item.date))) {
    const ids = [...new Set(event.participations.filter((entry) => entry.deck &&
      slug(entry.deck.id) === slug(opponent.name)).map((entry) => entry.deck!.id))]
    if (ids.length !== 1) continue
    const matching = event.participations.filter((entry) => entry.deck?.id === ids[0])
    const complete = matching.filter((entry) => entry.cardTotal === 60 && entry.listStatus === 'available')
    eventDetails.push({ source: 'play', eventId: event.eventId, name: event.name, date: event.date,
      url: event.publicUrl, totalParticipants: event.reportedPlayers,
      visibleParticipants: event.coverage.returnedParticipants,
      completeLists: event.coverage.complete60Lists, matchedLists: complete.length, circuit: event.circuit })
    for (const entry of complete) rows.push({ name: entry.playerName, source: 'play', eventId: event.eventId,
      eventName: event.name, eventDate: event.date, eventUrl: event.publicUrl,
      participants: event.reportedPlayers, visible: event.coverage.returnedParticipants,
      completeLists: event.coverage.complete60Lists, cards: entry.cards, placing: entry.placing,
      url: `${event.publicUrl}/player/${encodeURIComponent(entry.playerId)}/decklist` })
    const targetIds = new Set(matching.map((item) => item.playerId))
    const participants = new Map(event.participations.map((item) => [item.playerId, item]))
    let eventOutcomes = 0
    for (const pairing of event.pairings ?? []) {
      if (!pairing.player2 || !participants.has(pairing.player1) || !participants.has(pairing.player2)) continue
      const first = targetIds.has(pairing.player1)
      const second = targetIds.has(pairing.player2)
      if (first === second) continue
      const target = first ? pairing.player1 : pairing.player2
      const other = first ? pairing.player2 : pairing.player1
      if (!participants.get(other)?.deck) continue
      eligiblePairings++
      if (pairing.winner === target) { wins++; eventOutcomes++ }
      else if (pairing.winner === other) { losses++; eventOutcomes++ }
      else if (pairing.winner === 0) { ties++; eventOutcomes++ }
    }
    if (eventOutcomes) { eventsWithPairings++; matchDates.push(event.date) }
  }

  for (const event of mainEvents.filter((item) => item.circuit === 'WESTERN' &&
    item.format === 'STANDARD' && inWindow(item.date))) {
    const matching = event.participants.filter((entry) => entry.deckId === opponent.id)
    if (!matching.length) continue
    const complete = matching.filter((entry) => entry.cardTotal === 60 && entry.cards)
    eventDetails.push({ source: 'main', eventId: event.eventId, name: event.name, date: event.date,
      url: event.url, totalParticipants: event.players,
      visibleParticipants: event.coverage.returnedParticipants,
      completeLists: event.coverage.complete60Lists, matchedLists: complete.length, circuit: event.circuit })
    for (const entry of complete) rows.push({ name: entry.playerName, source: 'main', eventId: event.eventId,
      eventName: event.name, eventDate: event.date, eventUrl: event.url,
      participants: event.players, visible: event.coverage.returnedParticipants,
      completeLists: event.coverage.complete60Lists, cards: entry.cards!, placing: entry.placing,
      url: entry.listUrl! })
  }
  eventDetails.sort((a, b) => b.date.localeCompare(a.date) || a.eventId.localeCompare(b.eventId))
  rows.sort((a, b) => b.eventDate.localeCompare(a.eventDate) ||
    (a.placing ?? Infinity) - (b.placing ?? Infinity))
  const seen = new Map<string, { name: string; lists: number; examples: typeof rows[number]['cards'] }>()
  for (const row of rows) {
    const names = new Set(row.cards.map((card) => card.name.trim()).filter(Boolean))
    for (const name of names) {
      const key = name.toLocaleLowerCase()
      const current = seen.get(key) ?? { name, lists: 0, examples: [] }
      current.lists++
      current.examples.push(...row.cards.filter((card) => card.name.trim().toLocaleLowerCase() === key))
      seen.set(key, current)
    }
  }
  const sampledRows: typeof rows = []
  const sampledEvents = new Map<string, number>()
  for (const row of rows) {
    if (sampledRows.length >= 8) break
    const key = `${row.source}:${row.eventId}`
    if ((sampledEvents.get(key) ?? 0) >= 2) continue
    sampledRows.push(row)
    sampledEvents.set(key, (sampledEvents.get(key) ?? 0) + 1)
  }
  // Keep uncommon Pokémon from the displayed variants, even when staples occupy the top 24.
  const samplePokemon = new Set(sampledRows.flatMap((row) => row.cards)
    .filter((card) => printsByName.get(card.name.toLocaleLowerCase())?.some((print) => print.category === 'Pokemon'))
    .map((card) => card.name.toLocaleLowerCase()))
  const observedCards = [...seen.values()].sort((a, b) => b.lists - a.lists || a.name.localeCompare(b.name))
    .filter((item, index) => index < 24 || samplePokemon.has(item.name.toLocaleLowerCase()))
    .slice(0, 48).map(({ name, lists, examples }) => {
      const prints = (printsByName.get(name.toLocaleLowerCase()) ?? []).filter((print) => print.detailAt !== null)
      const exactPrints = examples.map((card) => {
        const candidates = prints.filter((print) =>
          ((setCodes.get(print.setId) ?? OFFICIAL_SET_CODES[print.setId]) === card.set.toUpperCase() ||
            print.setId.toUpperCase() === card.set.toUpperCase()) &&
          sameNumber(print.localId, card.number))
        return candidates.length === 1 ? candidates[0] : undefined
      })
      const exactIdentities = new Set(exactPrints.map((print) => print?.identityId).filter(Boolean))
      const exactComparable = exactPrints.length > 0 && exactPrints.every((print) => !!print?.identityId && !!print.gameplay) &&
        exactIdentities.size === 1
      const identities = new Set(prints.map((print) => print.identityId).filter(Boolean))
      const chosen = exactPrints.find((print) => print?.gameplay) ?? prints.find((print) => print.gameplay)
      const asOf = localCalendarDate()
      const described = (print: NonNullable<typeof chosen>): string | null => {
        const effective = effectiveCardGameplay(print, asOf, catalog?.rulePackage)
        return effective.effective ? gameplaySummary(effective.effective, print) +
          (effective.status === 'applied' || effective.status === 'source-already-corrected'
            ? `; errata ${effective.errataSourceUrl}` : effective.status === 'source-mismatch'
              ? '; errata non applicata: testo fonte non corrispondente' : '') : null
      }
      const exactWithGameplay = [...new Map(exactPrints.flatMap((print) =>
        print?.gameplay ? [[print.id, print] as const] : [])).values()]
      const mechanics = exactWithGameplay.length
        ? exactWithGameplay.map((print) =>
          `${setCodes.get(print.setId) ?? OFFICIAL_SET_CODES[print.setId] ?? print.setId.toUpperCase()} ${print.localId}: ${described(print)}; fonte ${print.sourceUrl}`).join(' | ')
        : chosen?.gameplay ? described(chosen) : null
      const recognized = !!chosen?.identityId && !!chosen.gameplay &&
        !prints.some((print) => ['applied', 'source-mismatch'].includes(
          effectiveCardGameplay(print, asOf, catalog?.rulePackage).status)) &&
        (exactComparable || (identities.size === 1 && prints.every((print) => !!print.gameplay)))
      return { name, lists, catalogIdentityId: recognized ? chosen!.identityId : null,
        catalogStatus: recognized ? 'recognized' as const : prints.length ? 'ambiguous' as const
          : 'not-in-catalog' as const,
        gameplay: mechanics,
        cardSourceUrl: chosen?.gameplay ? chosen.sourceUrl : null }
    })
  const samples: MatchupTournamentEvidence['sampleLists'] = sampledRows.map((row) =>
    ({ url: row.url, placing: row.placing, eventName: row.eventName,
      source: row.source, cards: row.cards.map((card) => `${card.count} ${card.name} ${card.set} ${card.number}`) }))
  const first = eventDetails[0]
  const opponentFieldRecord = wins + losses + ties > 0 ? {
    wins, losses, ties, denominator: wins + losses + ties, eligiblePairings,
    events: eventsWithPairings, windowStart: matchDates.sort()[0],
    windowEnd: matchDates.sort().at(-1)!, circuit: 'WESTERN' as const,
    eventType: 'ONLINE' as const, scope: 'opponent-versus-field' as const
  } : undefined
  const detail = rows.length
    ? `${rows.length} liste complete dell’archetipo in ${eventDetails.length} eventi pubblici; ${eventDetails.filter((item) => item.source === 'main').length} dal database principale.`
    : eventDetails.length ? 'Archetipo presente negli eventi, ma nessuna sua lista completa è stata acquisita.'
      : 'Nessun evento archiviato nella finestra del Meta contiene un collegamento verificato a questo archetipo.'
  const payload = { events: eventDetails, samples, observedCards, opponentFieldRecord }
  return { schemaVersion: 2, evidenceHash: fingerprint(payload),
    status: rows.length ? 'matched' : 'unavailable', detail,
    eventId: first?.eventId ?? null, eventName: first?.name ?? null,
    eventDate: first?.date ?? null, eventUrl: first?.url ?? null,
    eventLists: first?.completeLists ?? null,
    eventParticipants: first?.visibleParticipants ?? null,
    matchedDeckId: first ? opponent.id : null, matchedCompleteLists: rows.length,
    observedCards, sampleLists: samples, events: eventDetails, opponentFieldRecord }
}
