import { createHash } from 'node:crypto'
import type { CatalogView } from '../shared/catalog'
import type { TournamentPairing, TournamentSnapshot } from '../shared/tournament'
import type { MainTournamentSnapshot } from '../shared/main-tournament'
import type { AiEvidenceQueryResult } from '../shared/ai-evidence'
import { searchCatalogEvidence } from './catalog-evidence-search'
import { exactDeckIdentity } from './ai-evidence-archive'

export type AiEvidenceQuery =
  | { operation: 'catalog.search'; terms?: string[]; printIds?: string[];
      identityIds?: string[]; mode?: 'any' | 'all'; offset?: number; limit?: number }
  | { operation: 'events.search'; deckName?: string; cardName?: string;
      from?: string; to?: string; offset?: number; limit?: number }

export interface AiEvidenceEngine {
  describe(): { operations: string[]; catalog: { syncedAt: string | null;
    expected: number; indexed: number; gameplay: number }; eventWindow: { from: string; to: string } }
  /** Resolve exact card names in discussion text to representative local prints.
   * Distinct rules remain distinct even when the printed name is the same. */
  cardTargets(text: string): { name: string; printIds: string[] }[]
  /** Resolve archetype labels that actually occur in complete local event lists. */
  eventTargets(text: string): string[]
  execute(input: unknown): AiEvidenceQueryResult
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function boundedString(value: unknown, max = 100): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\0')
}

function strings(value: unknown, max: number, size: number): value is string[] {
  return value === undefined || Array.isArray(value) && value.length <= max &&
    value.every((entry) => boundedString(entry, size))
}

function page(value: unknown, fallback: number, max: number): number | null {
  return value === undefined ? fallback : Number.isInteger(value) &&
    Number(value) >= 0 && Number(value) <= max ? Number(value) : null
}

function parseQuery(input: unknown, window: { from: string; to: string }): AiEvidenceQuery {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Query non valida.')
  const value = input as Record<string, unknown>
  if (value.operation === 'catalog.search') {
    if (Object.keys(value).some((key) => !['operation', 'terms', 'printIds', 'identityIds',
      'mode', 'offset', 'limit'].includes(key))) throw new Error('Argomenti Catalogo non consentiti.')
    if (!strings(value.terms, 8, 80) || !strings(value.printIds, 20, 40) ||
      !strings(value.identityIds, 20, 100) ||
      ![undefined, 'any', 'all'].includes(value.mode as string | undefined) ||
      page(value.offset, 0, 1_000_000) === null || page(value.limit, 12, 20) === null ||
      page(value.limit, 12, 20) === 0 ||
      ![value.terms, value.printIds, value.identityIds].some((items) =>
        Array.isArray(items) && items.length > 0)) throw new Error('Argomenti Catalogo non validi.')
    return { operation: 'catalog.search', terms: value.terms as string[] | undefined,
      printIds: value.printIds as string[] | undefined,
      identityIds: value.identityIds as string[] | undefined,
      mode: value.mode as 'any' | 'all' | undefined,
      offset: page(value.offset, 0, 1_000_000)!, limit: page(value.limit, 12, 20)! }
  }
  if (value.operation === 'events.search') {
    if (Object.keys(value).some((key) => !['operation', 'deckName', 'cardName', 'from',
      'to', 'offset', 'limit'].includes(key))) throw new Error('Argomenti Eventi non consentiti.')
    const from = value.from ?? window.from
    const to = value.to ?? window.to
    if (!boundedString(value.deckName, 100) && !boundedString(value.cardName, 100) ||
      value.deckName !== undefined && !boundedString(value.deckName, 100) ||
      value.cardName !== undefined && !boundedString(value.cardName, 100) ||
      !date(from) || !date(to) || from > to || from < window.from || to > window.to ||
      page(value.offset, 0, 1_000_000) === null || page(value.limit, 3, 4) === null ||
      page(value.limit, 3, 4) === 0) throw new Error('Argomenti Eventi non validi.')
    return { operation: 'events.search', deckName: value.deckName as string | undefined,
      cardName: value.cardName as string | undefined, from, to,
      offset: page(value.offset, 0, 1_000_000)!, limit: page(value.limit, 3, 4)! }
  }
  throw new Error('Operazione non consentita.')
}

function normalized(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

type EventRow = { id: string; snapshotId: string; name: string; date: string;
  kind: 'online' | 'in-person'; url: string; participants: number; completeLists: number;
  deck: string; placing: number | null; listUrl: string; cards: string[];
  playerId: string | null; record: { wins: number; losses: number; ties: number } | null;
  pairings: TournamentPairing[] }

function eventRows(play: TournamentSnapshot[], main: MainTournamentSnapshot[]): EventRow[] {
  const rows: EventRow[] = []
  for (const event of play) {
    if (event.circuit !== 'WESTERN' || event.format !== 'STANDARD') continue
    const pairings = new Map<string, TournamentPairing[]>()
    for (const pairing of event.pairings ?? []) {
      for (const player of new Set([pairing.player1, pairing.player2].filter((id): id is string => !!id))) {
        const matches = pairings.get(player) ?? []
        matches.push(pairing)
        pairings.set(player, matches)
      }
    }
    for (const item of event.participations) {
      if (item.listStatus !== 'available' || item.cardTotal !== 60) continue
      rows.push({ id: `play:${event.eventId}`, snapshotId: event.id, name: event.name,
        date: event.date, kind: event.isOnline ? 'online' : 'in-person', url: event.publicUrl,
        participants: event.coverage.returnedParticipants,
        completeLists: event.coverage.complete60Lists, deck: item.deck?.name ?? '',
        placing: item.placing, listUrl: `${event.publicUrl}/player/${encodeURIComponent(item.playerId)}/decklist`,
        playerId: item.playerId, record: item.record, pairings: pairings.get(item.playerId) ?? [],
        cards: item.cards.map((card) => `${card.count} ${card.name} ${card.set} ${card.number}`) })
    }
  }
  for (const event of main) {
    if (event.circuit !== 'WESTERN' || event.format !== 'STANDARD') continue
    for (const item of event.participants) {
      if (item.cardTotal !== 60 || !item.cards || !item.listUrl) continue
      rows.push({ id: `main:${event.eventId}`, snapshotId: event.id, name: event.name,
        date: event.date, kind: 'in-person', url: event.url,
        participants: event.coverage.returnedParticipants,
        completeLists: event.coverage.complete60Lists, deck: item.deckName ?? '',
        placing: item.placing, listUrl: item.listUrl,
        playerId: null, record: null, pairings: [],
        cards: item.cards.map((card) => `${card.count} ${card.name} ${card.set} ${card.number}`) })
    }
  }
  return rows
}

/** A read-only, bounded gateway from model-chosen queries to local app data. */
export function createAiEvidenceEngine(catalog: CatalogView, play: TournamentSnapshot[],
  main: MainTournamentSnapshot[], window: { from: string; to: string }): AiEvidenceEngine {
  if (!date(window.from) || !date(window.to) || window.from > window.to)
    throw new Error('Intervallo Eventi non valido.')
  const rows = eventRows(play, main)
  const scope = searchCatalogEvidence(catalog, { terms: ['pokemon'], limit: 1 }).scope
  const setCodes = new Map(catalog.sets.map((set) => [set.id,
    [set.id, set.abbreviation].filter((code): code is string => Boolean(code))]))
  const names = new Map<string, CatalogView['prints']>()
  for (const print of catalog.prints) {
    const key = normalized(print.name)
    if (key.length < 4) continue
    names.set(key, [...(names.get(key) ?? []), print])
  }
  const sortedNames = [...names.keys()].sort((a, b) => b.length - a.length)
  const decks = new Map(rows.filter((row) => normalized(row.deck).length >= 5)
    .map((row) => [normalized(row.deck), row.deck]))
  const sortedDecks = [...decks.keys()].sort((a, b) => b.length - a.length)
  const eventSearches = new Map<string, { matchingLists: number;
    groups: (EventRow & { occurrences: Omit<EventRow, 'cards'>[] })[] }>()
  return {
    describe: () => ({ operations: ['catalog.search', 'events.search'],
      catalog: { syncedAt: catalog.syncedAt, expected: scope.expected,
        indexed: scope.indexed, gameplay: scope.withGameplay }, eventWindow: window }),
    cardTargets(text) {
      const normalizedText = ` ${normalized(text)} `
      let remaining = normalizedText
      const found: { name: string; printIds: string[] }[] = []
      for (const key of sortedNames) {
        const phrase = ` ${key} `
        if (!remaining.includes(phrase)) continue
        const prints = names.get(key)!
        // A name can have more than one competitive identity. Fetch one current
        // representative of each distinct rules text, plus unknown texts.
        const representatives = new Map<string, typeof prints[number]>()
        for (const print of prints) {
          const group = print.gameplay ? JSON.stringify(print.gameplay) : `missing:${print.id}`
          const existing = representatives.get(group)
          if (!existing || Boolean(print.detailAt) && !existing.detailAt)
            representatives.set(group, print)
        }
        const printIds = new Set([...representatives.values()].map((print) => print.id))
        for (const print of prints) {
          const codes = setCodes.get(print.setId) ?? [print.setId]
          if (codes.some((code) => normalizedText.includes(
            ` ${normalized(`${print.name} ${code} ${print.localId}`)} `))) printIds.add(print.id)
        }
        found.push({ name: prints[0].name, printIds: [...printIds] })
        while (remaining.includes(phrase)) remaining = remaining.replace(phrase, ' ')
      }
      return found
    },
    eventTargets(text) {
      let remaining = ` ${normalized(text)} `
      const found: string[] = []
      for (const key of sortedDecks) {
        const phrase = ` ${key} `
        if (!remaining.includes(phrase)) continue
        found.push(decks.get(key)!)
        while (remaining.includes(phrase)) remaining = remaining.replace(phrase, ' ')
      }
      return found
    },
    execute(input) {
      let query: AiEvidenceQuery
      try { query = parseQuery(input, window) }
      catch (error) {
        const rejected = { query: String(JSON.stringify(input) ?? input).slice(0, 1000),
          status: 'rejected' as const,
          data: { error: error instanceof Error ? error.message : 'Query non valida.' },
          sourceIds: [] as string[] }
        return { ...rejected, fingerprint: fingerprint({ input, ...rejected }) }
      }
      if (query.operation === 'catalog.search') {
        const data = searchCatalogEvidence(catalog, { ...query, asOf: window.to })
        const sourceIds = data.matches.map((item) => `card:${item.printId}`)
        return { query, status: 'ok', data, sourceIds,
          fingerprint: fingerprint({ query, data }) }
      }
      const deck = query.deckName ? normalized(query.deckName) : null
      const card = query.cardName ? normalized(query.cardName) : null
      const searchKey = fingerprint({ deck, card, from: query.from, to: query.to })
      let search = eventSearches.get(searchKey)
      if (!search) {
        const matching = rows.filter((row) => row.date >= query.from! && row.date <= query.to! &&
          (!deck || normalized(row.deck).includes(deck)) &&
          (!card || row.cards.some((line) => normalized(line).includes(card))))
          .sort((a, b) => b.date.localeCompare(a.date) ||
            (a.placing ?? Infinity) - (b.placing ?? Infinity))
        const grouped = new Map<string, EventRow & { occurrences: Omit<EventRow, 'cards'>[] }>()
        for (const row of matching) {
          const key = exactDeckIdentity(row.cards)
          const { cards: _cards, ...occurrence } = row
          const existing = grouped.get(key)
          if (existing) existing.occurrences.push(occurrence)
          else grouped.set(key, { ...row, occurrences: [occurrence] })
        }
        search = { matchingLists: matching.length, groups: [...grouped.values()] }
        if (eventSearches.size >= 32) eventSearches.delete(eventSearches.keys().next().value!)
        eventSearches.set(searchKey, search)
      }
      const { groups, matchingLists } = search
      const selected = groups.slice(query.offset, query.offset! + query.limit!)
      const data = { scope: { from: query.from, to: query.to, listsInspected: rows.length,
        matchingLists, distinctDecks: groups.length,
        duplicateLists: matchingLists - groups.length }, offset: query.offset, remaining: Math.max(0,
        groups.length - query.offset! - selected.length), lists: selected }
      const sourceIds = selected.map((item) => `list:${fingerprint(item.listUrl).slice(0, 16)}`)
      return { query, status: 'ok', data, sourceIds,
        fingerprint: fingerprint({ query, data }) }
    }
  }
}
