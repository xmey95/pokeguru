import { AiEvidenceArchive, evidenceHash, evidenceOccurrenceIdentity, exactDeckIdentity,
  type ArchivedEvidenceRecord } from './ai-evidence-archive'
import { aggregateEventRecords, eventPlayerIndex } from './ai-event-aggregates'
import { normalizedEvidenceText, type AiEvidenceQuery, type EvidenceEventRow } from './ai-evidence-engine'

export const DECISION_POLICY = 'decision-evidence-v1'

/** A sampled list authorizes inspection of all its sealed occurrences, not just
 * the one example sent with its profile. Other jobs cannot supply this membership. */
export function decisionEventDetails(archive: AiEvidenceArchive, deckKey: string, offset: number,
  limit: number, eventId?: string): unknown {
  if (!archive.readRecord(`deck:${deckKey}`)) throw new Error('Lista esatta non acquisita in questo job.')
  const cacheKey = evidenceHash([deckKey, eventId ?? null])
  let records = archive.value<ArchivedEvidenceRecord[]>('decision-event-details:v1', cacheKey)
  if (!records) {
    const originals = new Map<string, ArchivedEvidenceRecord>()
    for (const row of archive.eventRows<EvidenceEventRow>(deckKey)) {
      if (eventId !== undefined && row.id !== eventId) continue
      const { cards: _cards, pairings, ...data } = row
      const sourceId = `list:${evidenceHash(row.listUrl).slice(0, 16)}`
      const key = `occurrence:${evidenceOccurrenceIdentity(row)}`
      originals.set(key, { key, kind: 'occurrence', deckKey, sourceId, data })
      for (const match of pairings) {
        const key = `pairing:${evidenceHash([row.id, match.phase, match.round, match.table, match.match, match.player1, match.player2])}`
        const data = { eventId: row.id, ...match }, prior = originals.get(key)
        if (prior && evidenceHash(prior.data) !== evidenceHash(data)) throw new Error('Esiti incompatibili nello snapshot.')
        originals.set(key, { key, kind: 'pairing', deckKey: null, sourceId, data })
      }
    }
    records = [...originals.values()].sort((a, b) => a.key.localeCompare(b.key))
    archive.saveValue('decision-event-details:v1', cacheKey, records)
  }
  const selected = records.slice(offset, offset + limit)
  const sourceIds = new Set(selected.map(record => record.sourceId))
  const recordSources = records.filter(record => record.kind === 'occurrence' && sourceIds.has(record.sourceId))
    .map(record => {
      const row = record.data as EvidenceEventRow
      return { id: record.sourceId, label: `${row.deck} · ${row.name} · ${row.date}`,
        url: row.listUrl, fingerprint: evidenceHash(record.data) }
    })
  return { scope: { deckKey, eventId: eventId ?? null, totalRecords: records.length,
    source: 'all-exact-deck-occurrences-in-sealed-snapshot' }, records: selected, recordSources, offset,
    remaining: Math.max(0, records.length - offset - selected.length) }
}
type Search = Extract<AiEvidenceQuery, { operation: 'events.search' }>
type Counts = { wins: number; losses: number; ties: number; denominator: number }
interface ExactAggregate {
  participations: number; recordsAvailable: number; fieldRecord: Counts
  missingPlayerIds: number; ambiguousPlayerIds: number
  matchups: [string, string | null, string, number, number, number, number, number, number, number, number][]
}
interface Profile {
  profileId: string
  scope: { from: string; to: string; matchingParticipations: number; distinctDecks: number;
    events: number; recordsAvailable: number; missingPlayerIds: number; ambiguousPlayerIds: number }
  fieldRecord: Counts
  cards: [string, number, number, [number, number][]][]
  matchups: [string | null, string, number, number, number, number, number, number, number, number][]
  coverage: unknown
  sources: { id: string; date: string; kind: string; url: string }[]
  variants: { key: string; row: string; participations: number }[]
}

/** All matching participations contribute to exact distributions. Only explicitly
 * paged example lists are delivered to the model; originals remain in the sealed
 * job snapshot. Materialized facts are reusable across repeated query pages. */
export function decisionEventSearch(archive: AiEvidenceArchive, query: Search): unknown {
  const filter = { from: query.from!, to: query.to!, deck: normalizedEvidenceText(query.deckName ?? ''),
    card: normalizedEvidenceText(query.cardName ?? '') }
  const profileId = evidenceHash(['decision-event-profile-v1', filter])
  let profile = archive.value<Profile>('decision-event-profile:v1', profileId)
  if (!profile) {
    const all = () => archive.eventRows<EvidenceEventRow>()
    const players = eventPlayerIndex(all())
    const variants = new Map<string, { key: string; row: string; participations: number }>()
    const cards = new Map<string, { participations: number; decks: Set<string>; quantities: Map<number, number> }>()
    const sources = new Map<string, { id: string; date: string; kind: string; url: string }>()
    const occurrences: ArchivedEvidenceRecord[] = []
    const pairings = new Map<string, ArchivedEvidenceRecord>()
    const seen = new Set<string>()
    for (const row of all()) {
      if (row.date < filter.from || row.date > filter.to ||
        filter.deck && !normalizedEvidenceText(row.deck).includes(filter.deck) ||
        filter.card && !row.cards.some(line => normalizedEvidenceText(line).includes(filter.card))) continue
      const identity = evidenceOccurrenceIdentity(row)
      if (seen.has(identity)) continue
      seen.add(identity)
      const key = exactDeckIdentity(row.cards)
      const variant = variants.get(key) ?? { key, row: identity, participations: 0 }
      variant.participations++; variants.set(key, variant)
      sources.set(row.id, { id: row.id, date: row.date, kind: row.kind, url: row.url })
      const quantities = new Map<string, number>()
      for (const line of row.cards) {
        const match = /^(\d+)\s+(.+)$/.exec(line.trim())
        if (match) quantities.set(match[2], (quantities.get(match[2]) ?? 0) + Number(match[1]))
      }
      for (const [name, quantity] of quantities) {
        const card = cards.get(name) ?? { participations: 0, decks: new Set<string>(), quantities: new Map<number, number>() }
        card.participations++; card.decks.add(key)
        card.quantities.set(quantity, (card.quantities.get(quantity) ?? 0) + 1); cards.set(name, card)
      }
      const { cards: _cards, pairings: matches, ...data } = row
      const sourceId = `list:${evidenceHash(row.listUrl).slice(0, 16)}`
      occurrences.push({ key: `occurrence:${identity}`, kind: 'occurrence', deckKey: key, sourceId, data })
      for (const match of matches) {
        const pairingKey = evidenceHash([row.id, match.phase, match.round, match.table, match.match, match.player1, match.player2])
        const record = { key: `pairing:${pairingKey}`, kind: 'pairing', deckKey: null,
          sourceId, data: { eventId: row.id, ...match } }
        const prior = pairings.get(pairingKey)
        if (prior && evidenceHash(prior.data) !== evidenceHash(record.data))
          throw new Error('Esiti incompatibili per lo stesso incontro nello snapshot.')
        pairings.set(pairingKey, record)
      }
    }
    const aggregated = aggregateEventRecords(occurrences, pairings.values(), players)
    const fieldRecord: Counts = { wins: 0, losses: 0, ties: 0, denominator: 0 }
    let recordsAvailable = 0, missingPlayerIds = 0, ambiguousPlayerIds = 0
    const matchups = new Map<string, Profile['matchups'][number]>()
    for (const record of aggregated.slice(0, -1)) {
      const data = record.data as ExactAggregate
      recordsAvailable += data.recordsAvailable; missingPlayerIds += data.missingPlayerIds; ambiguousPlayerIds += data.ambiguousPlayerIds
      for (const key of ['wins', 'losses', 'ties', 'denominator'] as const) fieldRecord[key] += data.fieldRecord[key]
      for (const [, opponent, resolution, ...values] of data.matchups) {
        const key = JSON.stringify([opponent, resolution])
        const target = matchups.get(key) ?? [opponent, resolution, 0, 0, 0, 0, 0, 0, 0, 0]
        values.forEach((value, index) => { (target as (string | number | null)[])[index + 2] = Number(target[index + 2]) + value })
        matchups.set(key, target)
      }
    }
    profile = { profileId, scope: { from: filter.from, to: filter.to, matchingParticipations: occurrences.length,
      distinctDecks: variants.size, events: sources.size, recordsAvailable, missingPlayerIds, ambiguousPlayerIds }, fieldRecord,
      cards: [...cards].sort(([a], [b]) => a.localeCompare(b)).map(([name, card]) => [name, card.participations,
        card.decks.size, [...card.quantities].sort(([a], [b]) => a - b)]),
      matchups: [...matchups].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value),
      coverage: aggregated.at(-1)!.data, sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id)),
      variants: [...variants.values()].sort((a, b) => b.participations - a.participations || a.key.localeCompare(b.key)) }
    archive.saveValue('decision-event-profile:v1', profileId, profile)
  }
  const offset = query.offset ?? 0, limit = query.limit ?? 4
  const selected = profile.variants.slice(offset, offset + limit)
  const lists = selected.map(variant => {
    const row = archive.eventRow<EvidenceEventRow>(variant.row)
    if (!row) throw new Error('Originale della variante non disponibile nello snapshot del job.')
    const { cards: _cards, ...occurrence } = row
    return { ...row, exactDeckKey: variant.key, observedParticipations: variant.participations, occurrences: [occurrence] }
  })
  const { variants: _variants, ...facts } = profile
  return { kind: 'decision-event-profile', ...facts,
    profileSource: { id: `profile:${profileId}`, label: `Statistiche Eventi ${query.deckName ?? query.cardName ?? ''} · ${filter.from}–${filter.to}`,
      url: null, fingerprint: evidenceHash(facts) },
    tables: { cards: ['exactPrintLineWithoutQuantity', 'participationsContaining', 'distinctDecksContaining', '[quantity,participations][]'],
      matchups: ['opponentSourceLabel', 'resolution', 'wins', 'losses', 'ties', 'denominator', 'byes', 'doubleLosses', 'unresolved', 'invalid'] },
    limitations: [
      'Tutte le partecipazioni corrispondenti sono conteggiate; il modello riceve le distribuzioni complete e solo questa pagina di liste esatte.',
      'Le liste esemplificative sono ordinate per frequenza; le carte rare restano nella distribuzione completa. Per una variante rara cerca il suo cardName.',
      'Quantità zero: matchingParticipations meno participationsContaining. Le stampe restano distinte; i nomi uguali non provano regole equivalenti.',
      'I risultati sono dei campioni osservati contro il campo/avversari etichettati, non del mazzo utente. I matchup contano lati giocatore, non incontri unici.',
      'Gli aggregati di ricerche sovrapposte non sono additivi. Ogni fonte originale resta nello snapshot locale; i testi di gioco delle distribuzioni richiedono catalog.search.'
    ], lists, offset, remaining: Math.max(0, profile.scope.distinctDecks - offset - lists.length) }
}
