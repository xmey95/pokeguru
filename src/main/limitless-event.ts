import { createHash } from 'node:crypto'
import type { TournamentCard, TournamentPairing, TournamentParticipation, TournamentSnapshot } from '../shared/tournament'
import { readLimitedText } from './bounded-response'

const API = 'https://play.limitlesstcg.com/api'
const EVENT_ID = /^[a-f0-9]{24}$/
const cardCategories = ['pokemon', 'trainer', 'energy'] as const

export class LimitlessRateLimitError extends Error {
  constructor(readonly retryAt: string) { super('Limitless Play ha limitato le richieste. Riprova dopo il tempo indicato.') }
}

export class LimitlessSyncPaused extends Error {
  constructor() { super('Scansione Limitless Play in pausa.') }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function text(value: unknown, max = 160): string | null {
  return typeof value === 'string' && value.trim() && value.length <= max
    ? value.trim() : null
}

function whole(value: unknown, min = 0, max = 100_000): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
}

async function getJson(path: string, fetcher: typeof fetch): Promise<unknown> {
  const url = `${API}${path}`
  const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) })
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after')) ||
      Number(response.headers.get('ratelimit')?.match(/t=(\d+)/)?.[1]) || 300
    throw new LimitlessRateLimitError(new Date(Date.now() + Math.max(1, Math.min(seconds, 3600)) * 1000).toISOString())
  }
  if (!response.ok) throw new Error(`Limitless Play: HTTP ${response.status}.`)
  const body = await readLimitedText(response, 6_000_000, 'Risposta Limitless Play troppo grande.')
  try { return JSON.parse(body) as unknown }
  catch { throw new Error('Risposta Limitless Play non valida.') }
}

function parseCards(value: unknown): { status: TournamentParticipation['listStatus']; cards: TournamentCard[]; total: number | null } {
  if (value === null || value === undefined) return { status: 'missing', cards: [], total: null }
  const list = object(value)
  if (!list) return { status: 'invalid', cards: [], total: null }
  const cards: TournamentCard[] = []
  for (const category of cardCategories) {
    const raw = list[category]
    if (!Array.isArray(raw) || raw.length > 100) return { status: 'invalid', cards: [], total: null }
    for (const entry of raw) {
      const item = object(entry)
      const count = whole(item?.count, 1, 60)
      const name = text(item?.name)
      const set = text(item?.set, 20)
      const number = text(item?.number, 20)
      if (!count || !name || !set || !number) return { status: 'invalid', cards: [], total: null }
      cards.push({ category, count, name, set, number })
    }
  }
  if (!cards.length) return { status: 'invalid', cards: [], total: null }
  return { status: 'available', cards, total: cards.reduce((sum, card) => sum + card.count, 0) }
}

function parsePairings(value: unknown, participants: Set<string>): {
  pairings: TournamentPairing[]; coverage: NonNullable<TournamentSnapshot['pairingCoverage']>
} {
  if (!Array.isArray(value) || value.length > 500_000) throw new Error('Abbinamenti Limitless Play non validi.')
  const pairings: TournamentPairing[] = []
  let invalid = 0
  for (const valueRow of value) {
    const row = object(valueRow)
    const phase = whole(row?.phase, 1, 100)
    const round = whole(row?.round, 1, 1000)
    const player1 = text(row?.player1, 120)
    const player2 = text(row?.player2, 120)
    const table = row?.table === null || row?.table === undefined ? null : whole(row?.table, 0, 100_000)
    const match = text(row?.match, 80)
    const rawWinner = row?.winner
    const winner = rawWinner === 0 || rawWinner === -1 ? rawWinner : text(rawWinner, 120)
    if (!phase || !round || !player1 || (row?.table !== null && row?.table !== undefined && table === null) ||
      (rawWinner !== null && rawWinner !== undefined && winner === null)) { invalid++; continue }
    pairings.push({ phase, round, table, match, player1, player2, winner })
  }
  const between = pairings.filter((row) => row.player2 && participants.has(row.player1) && participants.has(row.player2))
  const decided = between.filter((row) => row.winner === row.player1 || row.winner === row.player2).length
  const tied = between.filter((row) => row.winner === 0).length
  return { pairings, coverage: {
    returned: value.length, betweenParticipants: between.length, decided, tied,
    byes: pairings.filter((row) => !row.player2).length,
    doubleLosses: between.filter((row) => row.winner === -1).length,
    unresolved: between.length - decided - tied - between.filter((row) => row.winner === -1).length,
    invalid
  } }
}

export function parseTournament(event: unknown, standings: unknown,
  fetchedAt = new Date().toISOString(), rawPairings?: unknown): TournamentSnapshot {
  const detail = object(event)
  const eventId = text(detail?.id, 24)
  const name = text(detail?.name)
  const date = detail?.date
  const reportedPlayers = whole(detail?.players, 1, 100_000)
  const platform = text(detail?.platform, 40)
  const isOnline = detail?.isOnline
  if (!eventId || !EVENT_ID.test(eventId) || detail?.game !== 'PTCG' || detail.format !== 'STANDARD' ||
    !platform || typeof isOnline !== 'boolean' || (isOnline && platform !== 'PTCGL') || detail.isPublic !== true ||
    detail.decklists !== true || !name || !validDate(date) || !reportedPlayers || !Array.isArray(standings) ||
    standings.length > 100_000 || !Array.isArray(detail.phases) ||
    (Array.isArray(detail.specialRules) && detail.specialRules.length > 0) ||
    (Array.isArray(detail.bannedCards) && detail.bannedCards.length > 0)) {
    throw new Error('Evento non pubblico, non occidentale Standard o risposta Limitless Play non valida.')
  }
  const phases = detail.phases.map((entry) => {
    const phase = object(entry)
    const number = whole(phase?.phase, 1, 100)
    const type = text(phase?.type, 80)
    const rounds = whole(phase?.rounds, 0, 100)
    const mode = text(phase?.mode, 10)
    if (!number || !type || rounds === null || !mode) throw new Error('Fasi dell’evento non leggibili.')
    return { phase: number, type, rounds, mode }
  })
  const ids = new Set<string>()
  const participations = standings.map((value): TournamentParticipation => {
    const row = object(value)
    const playerId = text(row?.player, 120)
    const playerName = text(row?.name, 160)
    if (!playerId || !playerName || ids.has(playerId)) throw new Error('Partecipazioni Limitless Play non univoche o incomplete.')
    ids.add(playerId)
    const parsed = parseCards(row?.decklist)
    const record = object(row?.record)
    const wins = whole(record?.wins)
    const losses = whole(record?.losses)
    const ties = whole(record?.ties)
    const deck = object(row?.deck)
    const deckId = text(deck?.id, 100)
    const deckName = text(deck?.name, 160)
    return {
      playerId, playerName, country: text(row?.country, 2),
      placing: whole(row?.placing, 1),
      record: wins !== null && losses !== null && ties !== null ? { wins, losses, ties } : null,
      deck: deckId && deckName ? { id: deckId, name: deckName } : null,
      listStatus: parsed.status, cards: parsed.cards, cardTotal: parsed.total
    }
  })
  if (!participations.length) throw new Error('Nessuna partecipazione restituita da Limitless Play.')
  const coverage = {
    returnedParticipants: participations.length,
    availableLists: participations.filter((item) => item.listStatus === 'available').length,
    invalidLists: participations.filter((item) => item.listStatus === 'invalid').length,
    missingLists: participations.filter((item) => item.listStatus === 'missing').length,
    complete60Lists: participations.filter((item) => item.cardTotal === 60).length
  }
  const parsedPairings = rawPairings === undefined ? null : parsePairings(rawPairings, ids)
  const id = createHash('sha256').update(JSON.stringify({ eventId, phases, participations,
    pairings: parsedPairings?.pairings, reportedPlayers })).digest('hex')
  return {
    id, eventId, fetchedAt, source: 'Limitless Play API',
    sourceUrl: `${API}/tournaments/${eventId}/standings`,
    publicUrl: `https://play.limitlesstcg.com/tournament/${eventId}`,
    name, date, circuit: isOnline ? 'WESTERN' : 'UNVERIFIED', format: 'STANDARD', platform, isOnline,
    reportedPlayers, phases, participations, coverage, cached: false,
    ...(parsedPairings ? { pairings: parsedPairings.pairings, pairingCoverage: parsedPairings.coverage } : {})
  }
}

export async function fetchTournament(eventId: string, fetcher: typeof fetch = fetch,
  shouldStop: () => boolean = () => false): Promise<TournamentSnapshot> {
  if (!EVENT_ID.test(eventId)) throw new Error('ID evento Limitless Play non valido.')
  if (shouldStop()) throw new LimitlessSyncPaused()
  const details = await getJson(`/tournaments/${eventId}/details`, fetcher)
  const detail = object(details)
  if (!detail || detail.game !== 'PTCG' || detail.format !== 'STANDARD' || detail.isPublic !== true ||
    detail.decklists !== true || (Array.isArray(detail.specialRules) && detail.specialRules.length > 0) ||
    (Array.isArray(detail.bannedCards) && detail.bannedCards.length > 0))
    throw new Error('Evento fuori perimetro o con regole personalizzate.')
  if (shouldStop()) throw new LimitlessSyncPaused()
  const standings = await getJson(`/tournaments/${eventId}/standings`, fetcher)
  if (shouldStop()) throw new LimitlessSyncPaused()
  const pairings = await getJson(`/tournaments/${eventId}/pairings`, fetcher)
  return parseTournament(details, standings, new Date().toISOString(), pairings)
}

export interface TournamentIndexEntry { id: string; name: string; date: string; players: number }

export async function fetchTournamentIndex(page: number, fetcher: typeof fetch = fetch): Promise<TournamentIndexEntry[]> {
  if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new Error('Pagina tornei non valida.')
  const index = await getJson(`/tournaments?game=PTCG&format=STANDARD&limit=50&page=${page}`, fetcher)
  if (!Array.isArray(index) || index.length > 50) throw new Error('Indice tornei Limitless Play non valido.')
  return index.flatMap((value) => {
    const item = object(value)
    const id = text(item?.id, 24)
    const name = text(item?.name)
    const date = item?.date
    const players = whole(item?.players, 1)
    return id && EVENT_ID.test(id) && name && validDate(date) && players !== null &&
      item?.game === 'PTCG' && item.format === 'STANDARD' ? [{ id, name, date, players }] : []
  })
}

export async function fetchRecentWesternTournament(fetcher: typeof fetch = fetch,
  now = new Date()): Promise<TournamentSnapshot> {
  const index = await getJson('/tournaments?game=PTCG&format=STANDARD&limit=50', fetcher)
  if (!Array.isArray(index)) throw new Error('Indice tornei Limitless Play non valido.')
  const candidates = index.filter((value) => {
    const item = object(value)
    return item?.game === 'PTCG' && item.format === 'STANDARD' &&
      whole(item.players, 100) !== null && validDate(item.date) &&
      Date.parse(item.date) < now.getTime() - 18 * 60 * 60 * 1000 &&
      typeof item.id === 'string' && EVENT_ID.test(item.id)
  }).slice(0, 8)
  let limited = false
  for (const item of candidates) {
    try {
      const snapshot = await fetchTournament((item as { id: string }).id, fetcher)
      if (snapshot.participations.some((entry) => entry.placing !== null) && snapshot.coverage.availableLists > 0)
        return snapshot
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTP 429')) { limited = true; break }
      // A candidate may be private, unfinished or outside the Western PTCGL circuit.
    }
  }
  if (limited) throw new Error('Limitless Play ha limitato le richieste. Riprova più tardi; lo snapshot locale resta disponibile.')
  throw new Error('Nessun evento Standard occidentale con piazzamenti e liste pubbliche nei tornei recenti di Limitless Play.')
}
