import { createHash } from 'node:crypto'
import type { CatalogPrint, CatalogView } from '../shared/catalog'
import type { DeckConstraint } from '../shared/constraints'
import { parseDeck } from '../shared/deck-import'
import type { DeckThread, DeckVersion } from '../shared/deck-threads'
import type { MainTournamentSnapshot } from '../shared/main-tournament'
import { gameplaySummary } from '../shared/card-gameplay'
import { effectiveCardGameplay } from '../shared/card-errata'
import { localCalendarDate } from '../shared/calendar-date'
import { suggestPrints } from '../shared/reconciliation'
import type { ThreadCardEvidence, ThreadEvidencePacket, ThreadEvidenceSource,
  ThreadEventEvidence } from '../shared/thread-evidence'
import type { TournamentCard, TournamentSnapshot } from '../shared/tournament'

const MAX_CARDS = 36
const MAX_LISTS = 6
const MAX_EVENTS = 4
// Verified Italian/English names for cards discussed by users but indexed in the English catalog.
const CARD_NAME_ALIASES: readonly (readonly [string, string])[] = [
  ['Compassione di Lino', "Wally's Compassion"]
]

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normal(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokens(value: string): string[] {
  return normal(value).split(' ').filter((part) => part.length >= 5 &&
    !['questo', 'questa', 'contro', 'mazzo', 'lista', 'carta', 'carte', 'vorrei', 'valuta',
      'giocare', 'modifica', 'strategia', 'sostituisci', 'migliora'].includes(part))
}

function source(id: string, label: string, url: string | null, value: unknown): ThreadEvidenceSource {
  return { id, label, url, fingerprint: hash(value) }
}

function choosePrint(name: string, line: ReturnType<typeof parseDeck>['lines'][number] | null,
  catalog: CatalogView, explicit: CatalogPrint | null = null):
  { print: CatalogPrint | null; status: ThreadCardEvidence['identityStatus'] } {
  if (line?.kind === 'card') {
    const exact = suggestPrints(line, catalog).filter((item) => item.reason === 'same-print' && item.print.detailAt)
    if (exact.length === 1) return { print: exact[0].print, status: 'exact' }
    if (exact.length > 1) return { print: null, status: 'ambiguous' }
  }
  if (explicit) return { print: explicit, status: 'exact' }
  const matches = catalog.prints.filter((print) => print.detailAt && normal(print.name) === normal(name))
  if (!matches.length) return { print: null, status: 'missing' }
  if (matches.length === 1) return { print: matches[0],
    status: matches[0].gameplay ? 'same-gameplay' : 'unverified' }
  const identities = new Set(matches.map((print) => print.identityId).filter(Boolean))
  const gameplayTexts = new Set(matches.map((print) => print.gameplay
    ? JSON.stringify({ ...print.gameplay, weaknesses: print.gameplay.weaknesses.map((weakness) =>
      ({ ...weakness, value: weakness.value.replace(/[×x]/gi, 'x') })) }) : null))
  if (matches.some((print) => !print.gameplay) ||
    (identities.size !== 1 && gameplayTexts.size !== 1))
    return { print: null, status: 'ambiguous' }
  return { print: matches.sort((a, b) => (b.detailAt ?? '').localeCompare(a.detailAt ?? ''))[0],
    status: 'same-gameplay' }
}

interface ListRow {
  eventId: string
  snapshotId: string
  eventName: string
  eventDate: string
  eventUrl: string
  kind: ThreadEventEvidence['kind']
  participants: number
  completeLists: number
  deck: string
  placing: number | null
  url: string
  cards: TournamentCard[]
  score: number
}

function eventRows(play: TournamentSnapshot[], main: MainTournamentSnapshot[], query: string,
  ownPokemon: Set<string>): ListRow[] {
  const words = tokens(query)
  const rows: ListRow[] = []
  const score = (deck: string, cards: TournamentCard[]): number => {
    const deckName = normal(deck)
    const queryMatches = words.filter((word) => deckName.split(' ').some((part) => part.startsWith(word))).length
    const cardMatches = words.filter((word) => cards.some((card) => normal(card.name).split(' ')
      .some((part) => part.startsWith(word)))).length
    const overlap = new Set(cards.filter((card) => card.category === 'pokemon' &&
      ownPokemon.has(normal(card.name))).map((card) => normal(card.name))).size
    return queryMatches * 10 + cardMatches * 4 + overlap * 2
  }
  for (const event of play.filter((item) => item.circuit === 'WESTERN' && item.format === 'STANDARD')) {
    for (const item of event.participations.filter((entry) => entry.listStatus === 'available' && entry.cardTotal === 60)) {
      const rank = score(item.deck?.name ?? '', item.cards)
      if (rank < 2) continue
      rows.push({ eventId: `play:${event.eventId}`, snapshotId: event.id, eventName: event.name,
        eventDate: event.date, eventUrl: event.publicUrl, kind: 'online',
        participants: event.coverage.returnedParticipants, completeLists: event.coverage.complete60Lists,
        deck: item.deck?.name ?? 'Archetipo non classificato', placing: item.placing,
        url: `${event.publicUrl}/player/${encodeURIComponent(item.playerId)}/decklist`,
        cards: item.cards, score: rank })
    }
  }
  for (const event of main.filter((item) => item.circuit === 'WESTERN' && item.format === 'STANDARD')) {
    for (const item of event.participants.filter((entry) => entry.cardTotal === 60 && entry.cards && entry.listUrl)) {
      const rank = score(item.deckName ?? '', item.cards!)
      if (rank < 2) continue
      rows.push({ eventId: `main:${event.eventId}`, snapshotId: event.id, eventName: event.name,
        eventDate: event.date, eventUrl: event.url, kind: 'in-person',
        participants: event.coverage.returnedParticipants, completeLists: event.coverage.complete60Lists,
        deck: item.deckName ?? 'Archetipo non classificato', placing: item.placing,
        url: item.listUrl!, cards: item.cards!, score: rank })
    }
  }
  return rows.sort((a, b) => b.score - a.score || b.eventDate.localeCompare(a.eventDate) ||
    (a.placing ?? Infinity) - (b.placing ?? Infinity))
}

/** A bounded, immutable copy of the local facts supplied to one Codex turn. */
export function buildThreadEvidence(thread: DeckThread, base: DeckVersion | null, question: string,
  constraints: DeckConstraint[], catalog: CatalogView, play: TournamentSnapshot[],
  main: MainTournamentSnapshot[]): ThreadEvidencePacket {
  const candidate = thread.candidates.at(-1) ?? null
  const deckText = candidate?.rawText ?? thread.seedCandidateText ?? base?.rawText ?? ''
  const lines = parseDeck(deckText).lines.filter((line) => line.kind === 'card')
  const byName = new Map<string, { name: string; quantity: number; line: typeof lines[number] | null }>()
  for (const line of lines) {
    const name = line.name?.trim()
    if (!name) continue
    const key = normal(name)
    const prior = byName.get(key)
    byName.set(key, { name, quantity: (prior?.quantity ?? 0) + (line.quantity ?? 0), line })
  }
  const searchText = [thread.title, ...thread.messages.filter((message) => message.author === 'user')
    .slice(-6).map((message) => message.text), question].join('\n')
  const normalizedQuestion = normal(searchText)
  const mentioned = new Set<string>()
  let unmatchedText = ` ${normalizedQuestion} `
  const catalogNames = [...new Set(catalog.prints.map((print) => normal(print.name))
    .filter((name) => name.length >= 4))].sort((a, b) => b.length - a.length)
  for (const name of catalogNames) {
    const phrase = ` ${name} `
    if (!unmatchedText.includes(phrase)) continue
    mentioned.add(name)
    while (unmatchedText.includes(phrase)) unmatchedText = unmatchedText.replace(phrase, ' ')
  }
  const matchedAliases = new Map<string, string>()
  for (const [alias, canonical] of CARD_NAME_ALIASES) {
    const key = normal(canonical)
    if (` ${normalizedQuestion} `.includes(` ${normal(alias)} `) &&
      catalog.prints.some((print) => normal(print.name) === key && print.detailAt)) {
      mentioned.add(key)
      matchedAliases.set(key, alias)
    }
  }
  const explicitPrints = new Map<string, CatalogPrint[]>()
  for (const print of catalog.prints.filter((item) => item.detailAt && mentioned.has(normal(item.name)))) {
    const set = catalog.sets.find((item) => item.id === print.setId)
    if (![print.setId, set?.abbreviation].filter((code): code is string => Boolean(code))
      .some((code) => normalizedQuestion.includes(normal(`${print.name} ${code} ${print.localId}`)))) continue
    const key = normal(print.name)
    explicitPrints.set(key, [...(explicitPrints.get(key) ?? []), print])
  }
  for (const constraint of constraints) mentioned.add(normal(constraint.identityName))
  const ownPokemon = new Set([...byName.values()].filter((item) =>
    choosePrint(item.name, item.line, catalog).print?.category === 'Pokemon').map((item) => normal(item.name)))
  const ranked = eventRows(play, main, searchText, ownPokemon)
  const chosenRows: ListRow[] = []
  const perEvent = new Map<string, number>()
  for (const row of ranked) {
    if (chosenRows.length >= MAX_LISTS) break
    if ((perEvent.get(row.eventId) ?? 0) >= 2 ||
      (perEvent.size >= MAX_EVENTS && !perEvent.has(row.eventId))) continue
    chosenRows.push(row)
    perEvent.set(row.eventId, (perEvent.get(row.eventId) ?? 0) + 1)
  }
  const names = [...byName.values()]
  for (const key of mentioned) if (!byName.has(key)) {
    const print = catalog.prints.find((item) => normal(item.name) === key)
    if (print) names.push({ name: print.name, quantity: 0, line: null })
  }
  names.sort((a, b) => Number(mentioned.has(normal(b.name))) -
    Number(mentioned.has(normal(a.name))) ||
    Number(choosePrint(b.name, b.line, catalog).print?.category === 'Pokemon') -
    Number(choosePrint(a.name, a.line, catalog).print?.category === 'Pokemon') ||
    b.quantity - a.quantity || a.name.localeCompare(b.name))
  const observed = new Map<string, { name: string; count: number; category: TournamentCard['category'] }>()
  for (const row of chosenRows) for (const card of row.cards) {
    const key = normal(card.name)
    if (byName.has(key) || mentioned.has(key) || card.category === 'energy') continue
    const prior = observed.get(key)
    observed.set(key, { name: card.name, count: (prior?.count ?? 0) + 1, category: card.category })
  }
  for (const item of [...observed.values()].sort((a, b) =>
    Number(b.category === 'pokemon') - Number(a.category === 'pokemon') ||
    b.count - a.count || a.name.localeCompare(b.name)))
    names.push({ name: item.name, quantity: 0, line: null })
  const selected = names.slice(0, MAX_CARDS)
  const asOf = localCalendarDate()
  const cards: ThreadCardEvidence[] = selected.map((item) => {
    const explicit = explicitPrints.get(normal(item.name)) ?? []
    const chosen = choosePrint(item.name, item.line, catalog, explicit.length === 1 ? explicit[0] : null)
    const print = chosen.print
    const effective = print ? effectiveCardGameplay(print, asOf, catalog.rulePackage) : null
    return { name: item.name, ...(matchedAliases.has(normal(item.name))
      ? { mentionedAs: matchedAliases.get(normal(item.name)) } : {}),
      quantity: item.quantity, printId: print?.id ?? null,
      setId: print?.setId ?? null, localId: print?.localId ?? null,
      category: print?.category ?? null, regulationMark: print?.regulationMark ?? null,
      identityStatus: chosen.status, gameplay: effective?.effective ?? null,
      gameplayText: print && effective?.effective ? gameplaySummary(effective.effective, print) +
        (effective.status === 'applied' || effective.status === 'source-already-corrected'
          ? `; errata ${effective.errataSourceUrl}` : effective.status === 'source-mismatch'
            ? '; errata non applicata: testo fonte non corrispondente' : '') : null,
      sourceId: print ? `card:${print.id}` : null, detailAt: print?.detailAt ?? null }
  })
  const eventMap = new Map<string, ThreadEventEvidence>()
  const sources: ThreadEvidenceSource[] = []
  if (base) sources.push(source('base', `Lista base v${base.sequence}`, null, base.rawText))
  if (candidate) sources.push(source('candidate', `Candidata ${candidate.sequence}`, null, candidate.rawText))
  else if (thread.seedCandidateText) sources.push(source('seed-candidate',
    'Candidata del Thread precedente', null, thread.seedCandidateText))
  if (constraints.length) sources.push(source('constraints', 'Vincoli del progetto', null, constraints))
  for (const card of cards) {
    const print = catalog.prints.find((item) => item.id === card.printId)
    if (print && card.sourceId) sources.push(source(card.sourceId,
      `${print.name} · ${print.setName} ${print.localId}`, print.sourceUrl,
      { gameplay: card.gameplay, printedGameplay: print.gameplay,
        identityId: print.identityId, category: print.category,
        mark: print.regulationMark, updated: print.sourceUpdated }))
  }
  for (const row of chosenRows) {
    let event = eventMap.get(row.eventId)
    if (!event) {
      event = { sourceId: `event:${row.eventId}`, eventId: row.eventId, snapshotId: row.snapshotId,
        name: row.eventName, date: row.eventDate, kind: row.kind, participants: row.participants,
        completeLists: row.completeLists, lists: [] }
      eventMap.set(row.eventId, event)
      sources.push(source(event.sourceId, `${row.eventName} · ${row.eventDate}`, row.eventUrl,
        row.snapshotId))
    }
    const listSourceId = `list:${hash(row.url).slice(0, 16)}`
    event.lists.push({ sourceId: listSourceId, deck: row.deck, placing: row.placing,
      url: row.url, cards: row.cards.map((card) =>
        `${card.count} ${card.name} ${card.set} ${card.number}`) })
    sources.push(source(listSourceId, `${row.deck} · ${row.eventName} · posto ${row.placing ?? '?'}`,
      row.url, { snapshot: row.snapshotId, cards: row.cards, placing: row.placing }))
  }
  const previous = [...thread.messages].reverse().find((message) => message.author === 'assistant' &&
    message.evidence)?.evidence
  const before = new Map(previous?.sources.map((item) => [item.id, item]) ?? [])
  const after = new Map(sources.map((item) => [item.id, item]))
  const change = previous ? {
    updated: sources.filter((item) => before.has(item.id) && before.get(item.id)!.fingerprint !== item.fingerprint)
      .map((item) => item.label),
    added: sources.filter((item) => !before.has(item.id)).map((item) => item.label),
    removed: previous.sources.filter((item) => !after.has(item.id)).map((item) => item.label)
  } : { updated: [], added: [], removed: [] }
  return { schemaVersion: 1, capturedAt: new Date().toISOString(), baseVersionId: base?.id ?? null,
    candidateId: candidate?.id ?? null, catalogSyncedAt: catalog.syncedAt,
    cardCoverage: { selected: cards.length, withGameplay: cards.filter((item) => item.gameplay).length,
      omitted: Math.max(0, names.length - cards.length) }, cards,
    events: [...eventMap.values()], sources, change }
}
