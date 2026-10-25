import type { TournamentCard } from './tournament'

export interface MainTournamentEntry {
  eventId: string
  name: string
  date: string
  country: string
  players: number
  url: string
}

export interface MainTournamentParticipant {
  placing: number
  playerName: string
  playerId: string | null
  country: string | null
  deckId: string | null
  deckName: string | null
  listId: string | null
  listUrl: string | null
  cards: TournamentCard[] | null
  cardTotal: number | null
  listUnavailable?: boolean
}

export interface MainTournamentSnapshot extends MainTournamentEntry {
  id: string
  fetchedAt: string
  source: 'Limitless tournament database'
  circuit: 'WESTERN'
  format: 'STANDARD'
  type: 'IN_PERSON'
  participants: MainTournamentParticipant[]
  coverage: {
    returnedParticipants: number
    listedDecks: number
    fetchedLists: number
    complete60Lists: number
    noListLink: number
  }
  cached: boolean
}

export interface MainTournamentSyncProgress {
  runId?: string | null
  mode: 'new' | 'full' | null
  status: 'idle' | 'running' | 'rate-limited' | 'complete'
  /** In-memory job state; absent from persisted legacy progress. */
  active?: boolean
  stopping?: boolean
  page: number
  maxPages: number | null
  pendingEvents: MainTournamentEntry[]
  pendingLists: { eventId: string; listId: string }[]
  inspectedEvents: number
  fetchedLists: number
  rotationStart: string | null
  scannedPages: number
  indexedRows: number
  eligibleEvents: number
  ineligibleEvents: number
  unavailableIndexRows: number
  outsideRotationEvents: number
  alreadyAcquiredEvents: number
  unavailableEvents: MainTournamentEntry[]
  unavailableLists: { eventId: string; listId: string }[]
  watermark: string | null
  previousWatermark: string | null
  newestSeen: string | null
  stopAfterPage: boolean
  cooldownUntil: string | null
  lastError: string | null
}

export type MainTournamentSummary = Pick<MainTournamentSnapshot,
  'eventId' | 'name' | 'date' | 'country' | 'players' | 'url' | 'coverage'>
