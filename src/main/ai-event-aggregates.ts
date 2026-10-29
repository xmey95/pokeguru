import type { TournamentPairing } from '../shared/tournament'
import type { EvidenceEventRow } from './ai-evidence-engine'
import type { ArchivedEvidenceRecord } from './ai-evidence-archive'
import { evidenceOccurrenceIdentity, exactDeckIdentity } from './ai-evidence-archive'
import type { EvidenceRecord } from './ai-evidence-partition'

export interface EventCoverage {
  id: string; date: string; kind: 'online' | 'in-person'; url: string
  returnedParticipants: number; completeLists: number
}
type Score = { wins: number; losses: number; ties: number }
const emptyScore = (): Score => ({ wins: 0, losses: 0, ties: 0 })
const validScore = (value: unknown): value is Score => !!value && typeof value === 'object' &&
  ['wins', 'losses', 'ties'].every((key) => Number.isSafeInteger((value as Record<string, unknown>)[key]) &&
    Number((value as Record<string, unknown>)[key]) >= 0)
const addScore = (target: Score, value: Score) => { target.wins += value.wins; target.losses += value.losses; target.ties += value.ties }
const denominator = (score: Score) => score.wins + score.losses + score.ties
const ordered = <T>(map: Map<string, T>): [string, T][] => [...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
const labelOf = (label: unknown) => typeof label === 'string' && label.trim() ? label.trim() : null
const playerKey = (event: string, player: string) => JSON.stringify([event, player])
export const EVENT_TABLE_SCHEMAS = {
  'event-statistics-v1': {
    placements: ['placing', 'count'],
    events: ['eventId', 'date', 'kind', 'participations', 'recordsAvailable', 'fieldWins', 'fieldLosses', 'fieldTies', 'placements'],
    matchups: ['eventId', 'opponentSourceLabel', 'resolution', 'wins', 'losses', 'ties', 'denominator', 'byes', 'doubleLosses', 'unresolved', 'invalid']
  }
} as const

/** Frequencies describe only complete local lists. A missing list is never an
 * unobserved deck assigned to a known archetype. Labels are source labels, not a taxonomy. */
export function eventOverview(rows: Iterable<EvidenceEventRow>, from: string, to: string,
  coverage?: readonly EventCoverage[], check: () => void = () => {}): unknown {
  const groups = new Map<string, { label: string | null; participations: number; decks: Set<string>; events: Set<string> }>()
  const events = new Map<string, EventCoverage>(), seen = new Set<string>()
  for (const event of coverage ?? []) if (event.date >= from && event.date <= to) events.set(event.id, event)
  let completeLists = 0, unknownLabels = 0
  for (const row of rows) {
    if (row.date < from || row.date > to) continue
    const key = evidenceOccurrenceIdentity(row)
    if (seen.has(key)) continue
    seen.add(key); if (completeLists++ % 256 === 0) check()
    if (!events.has(row.id)) events.set(row.id, { id: row.id, date: row.date, kind: row.kind,
      url: row.url, returnedParticipants: row.participants, completeLists: row.completeLists })
    const label = labelOf(row.deck), groupKey = JSON.stringify(label)
    if (label === null) unknownLabels++
    const group = groups.get(groupKey) ?? { label, participations: 0, decks: new Set<string>(), events: new Set<string>() }
    group.participations++; group.decks.add(exactDeckIdentity(row.cards)); group.events.add(row.id); groups.set(groupKey, group)
  }
  const returnedParticipants = [...events.values()].reduce((n, e) => n + e.returnedParticipants, 0)
  return { kind: 'event-overview', from, to, scope: 'complete-local-lists-by-source-label',
    coverage: { events: events.size, returnedParticipants, completeLists,
      participantsWithoutCompleteList: Math.max(0, returnedParticipants - completeLists), unknownLabels,
      includesEventsWithoutCompleteLists: coverage !== undefined },
    groups: ordered(groups).map(([, group]) => ({ label: group.label, participations: group.participations,
      distinctDecks: group.decks.size, events: group.events.size, denominator: completeLists })),
    events: ordered(events).map(([, event]) => event),
    limitations: ['Le frequenze hanno come denominatore le sole liste complete disponibili, non il metagame globale.',
      'Le etichette originali non provano equivalenza fra archetipi o liste.',
      ...(coverage === undefined ? ['Lo snapshot legacy non censisce gli eventi privi di liste complete.'] : [])],
    offset: 0, remaining: 0 }
}

interface Player { deckKey: string; label: string | null }
export function eventPlayerIndex(rows: Iterable<EvidenceEventRow>, check: () => void = () => {}): Map<string, Player | null> {
  const players = new Map<string, Player | null>()
  let n = 0
  for (const row of rows) {
    if (n++ % 256 === 0) check()
    if (!row.playerId) continue
    const key = playerKey(row.id, row.playerId), value = { deckKey: exactDeckIdentity(row.cards), label: labelOf(row.deck) }
    if (!players.has(key)) players.set(key, value)
    else if (JSON.stringify(players.get(key)) !== JSON.stringify(value)) players.set(key, null)
  }
  return players
}

type Participation = Omit<EvidenceEventRow, 'cards' | 'pairings'>
type Pairing = TournamentPairing & { eventId: string }
interface Segment {
  eventId: string; date: string; kind: string; participations: number; recordsAvailable: number
  fieldRecord: Score; placements: Map<number, number>
}
interface Outcomes extends Score { byes: number; doubleLosses: number; unresolved: number; invalid: number }
const emptyOutcomes = (): Outcomes => ({ ...emptyScore(), byes: 0, doubleLosses: 0, unresolved: 0, invalid: 0 })
interface DeckAggregate {
  deckKey: string; sourceId: string; participations: number; recordsAvailable: number; fieldRecord: Score
  labels: Set<string>; segments: Map<string, Segment>; placements: Map<number, number>
  matchups: Map<string, { eventId: string; opponent: string | null; resolution: 'known-label' | 'missing-list-or-player' | 'ambiguous-player' | 'missing-label' | 'bye'; outcomes: Outcomes }>
  missingPlayerIds: number; ambiguousPlayerIds: number
}
function outcome(pairing: Pairing, player: string): keyof Outcomes {
  if (pairing.player1 === pairing.player2 || (player !== pairing.player1 && player !== pairing.player2)) return 'invalid'
  if (pairing.player2 === null) return 'byes'
  if (pairing.winner === null) return 'unresolved'
  if (pairing.winner === 0) return 'ties'
  if (pairing.winner === -1) return 'doubleLosses'
  if (pairing.winner !== pairing.player1 && pairing.winner !== pairing.player2) return 'invalid'
  return pairing.winner === player ? 'wins' : 'losses'
}
const placementRows = (values: Map<number, number>) => [...values].sort(([a], [b]) => a - b).map(([placing, count]) => [placing, count])

/** Counts unique archived records once. A shared pairing contributes once to each
 * selected player's side; the global pairing denominator remains unique matches.
 * Unknown outcomes/opponents and byes are never silently counted as wins/losses. */
export function aggregateEventRecords(occurrences: Iterable<ArchivedEvidenceRecord>, pairings: Iterable<ArchivedEvidenceRecord>,
  players: Map<string, Player | null>, check: () => void = () => {}): EvidenceRecord[] {
  const decks = new Map<string, DeckAggregate>(), selected = new Map<string, Set<string>>()
  const seenOccurrences = new Set<string>(), seenPairings = new Set<string>()
  let missingDeckKeys = 0
  for (const record of occurrences) {
    if (seenOccurrences.has(record.key)) continue
    seenOccurrences.add(record.key); if (seenOccurrences.size % 256 === 0) check()
    if (!record.deckKey) { missingDeckKeys++; continue }
    const item = record.data as Participation, deckKey = record.deckKey
    const deck = decks.get(deckKey) ?? { deckKey, sourceId: record.sourceId, participations: 0, recordsAvailable: 0,
      fieldRecord: emptyScore(), labels: new Set<string>(), segments: new Map(), placements: new Map(),
      matchups: new Map(), missingPlayerIds: 0, ambiguousPlayerIds: 0 }
    decks.set(deckKey, deck); deck.participations++
    const label = labelOf(item.deck); if (label) deck.labels.add(label)
    const segmentKey = JSON.stringify([item.id, item.date, item.kind])
    const segment: Segment = deck.segments.get(segmentKey) ?? { eventId: item.id, date: item.date, kind: item.kind,
      participations: 0, recordsAvailable: 0, fieldRecord: emptyScore(), placements: new Map() }
    segment.participations++; deck.segments.set(segmentKey, segment)
    if (Number.isSafeInteger(item.placing) && item.placing! > 0) {
      deck.placements.set(item.placing!, (deck.placements.get(item.placing!) ?? 0) + 1)
      segment.placements.set(item.placing!, (segment.placements.get(item.placing!) ?? 0) + 1)
    }
    if (validScore(item.record)) { deck.recordsAvailable++; segment.recordsAvailable++;
      addScore(deck.fieldRecord, item.record); addScore(segment.fieldRecord, item.record) }
    if (!item.playerId) deck.missingPlayerIds++
    else { const key = playerKey(item.id, item.playerId), prior = selected.get(key) ?? new Set<string>();
      prior.add(deckKey); selected.set(key, prior)
      // Archived selections also resolve players when a legacy snapshot has no index.
      const value = { deckKey, label }
      if (!players.has(key)) players.set(key, value)
      else if (JSON.stringify(players.get(key)) !== JSON.stringify(value)) players.set(key, null)
    }
  }
  for (const [player, keys] of selected) if (keys.size > 1 || players.get(player) === null)
    for (const key of keys) decks.get(key)!.ambiguousPlayerIds++
  let playerSides = 0, unassociatedPairings = 0, ambiguousSelectedSides = 0
  for (const record of pairings) {
    if (seenPairings.has(record.key)) continue
    seenPairings.add(record.key); if (seenPairings.size % 256 === 0) check()
    const pairing = record.data as Pairing
    let associated = false
    for (const player of new Set([pairing.player1, pairing.player2].filter((p): p is string => !!p))) {
      const keys = selected.get(playerKey(pairing.eventId, player)); if (!keys) continue
      associated = true
      if (keys.size !== 1 || players.get(playerKey(pairing.eventId, player)) === null) { ambiguousSelectedSides++; continue }
      const deck = decks.get([...keys][0])!, opponentId = player === pairing.player1 ? pairing.player2 : pairing.player1
      const opponent = opponentId ? players.get(playerKey(pairing.eventId, opponentId)) : undefined
      const resolution = !opponentId ? 'bye' : opponent === null ? 'ambiguous-player' : !opponent
        ? 'missing-list-or-player' : !opponent.label ? 'missing-label' : 'known-label'
      const opponentLabel = resolution === 'known-label' ? opponent!.label : null
      const key = JSON.stringify([pairing.eventId, opponentLabel, resolution])
      const matchup = deck.matchups.get(key) ?? { eventId: pairing.eventId, opponent: opponentLabel, resolution, outcomes: emptyOutcomes() }
      matchup.outcomes[outcome(pairing, player)]++; deck.matchups.set(key, matchup); playerSides++
    }
    if (!associated) unassociatedPairings++
  }
  const result: EvidenceRecord[] = ordered(decks).map(([, deck]) => ({ key: `event-statistics:${deck.deckKey}`,
    sourceIds: [deck.sourceId], data: { kind: 'event-statistics', schema: 'event-statistics-v1', deckKey: deck.deckKey,
      scope: 'selected-exact-deck-participations', labels: [...deck.labels].sort(), participations: deck.participations,
      recordsAvailable: deck.recordsAvailable, fieldRecord: { ...deck.fieldRecord, denominator: denominator(deck.fieldRecord) },
      placements: placementRows(deck.placements),
      events: ordered(deck.segments).map(([, segment]) => [segment.eventId, segment.date, segment.kind, segment.participations,
        segment.recordsAvailable, segment.fieldRecord.wins, segment.fieldRecord.losses, segment.fieldRecord.ties, placementRows(segment.placements)]),
      matchups: ordered(deck.matchups).map(([, m]) => [m.eventId, m.opponent, m.resolution, m.outcomes.wins, m.outcomes.losses, m.outcomes.ties,
        denominator(m.outcomes), m.outcomes.byes, m.outcomes.doubleLosses, m.outcomes.unresolved, m.outcomes.invalid]),
      missingPlayerIds: deck.missingPlayerIds, ambiguousPlayerIds: deck.ambiguousPlayerIds,
      originals: { operation: 'events.details', deckKey: deck.deckKey } } }))
  result.push({ key: 'event-coverage', sourceIds: [], data: { kind: 'event-aggregation-coverage',
    uniqueParticipations: seenOccurrences.size, uniquePairings: seenPairings.size, resolvedSelectedPlayerSides: playerSides,
    unassociatedPairings, ambiguousSelectedSides, missingDeckKeys,
    rules: ['Field records are not matchup records.', 'Matchup rows count player sides; never sum both sides as unique matches.',
      'Denominator is wins + losses + ties. Byes, double losses, unresolved and invalid outcomes are reported separately.',
      'Opponents use source labels only when their complete list and player identity are known.',
      'All individual records remain in the job archive and events.details can retrieve them.'] } })
  return result
}
