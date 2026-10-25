export interface TournamentCard {
  category: 'pokemon' | 'trainer' | 'energy'
  count: number
  name: string
  set: string
  number: string
}

export interface TournamentParticipation {
  playerId: string
  playerName: string
  country: string | null
  placing: number | null
  record: { wins: number; losses: number; ties: number } | null
  deck: { id: string; name: string } | null
  listStatus: 'available' | 'missing' | 'invalid'
  cards: TournamentCard[]
  cardTotal: number | null
}

export interface TournamentPairing {
  phase: number
  round: number
  table: number | null
  match: string | null
  player1: string
  player2: string | null
  winner: string | 0 | -1 | null
}

export interface TournamentSnapshot {
  id: string
  eventId: string
  fetchedAt: string
  source: 'Limitless Play API'
  sourceUrl: string
  publicUrl: string
  name: string
  date: string
  circuit: 'WESTERN' | 'UNVERIFIED'
  format: 'STANDARD'
  platform: string
  isOnline: boolean
  reportedPlayers: number
  phases: { phase: number; type: string; rounds: number; mode: string }[]
  participations: TournamentParticipation[]
  pairings?: TournamentPairing[]
  pairingCoverage?: {
    returned: number
    betweenParticipants: number
    decided: number
    tied: number
    byes: number
    doubleLosses: number
    unresolved: number
    invalid: number
  }
  coverage: {
    returnedParticipants: number
    availableLists: number
    invalidLists: number
    missingLists: number
    complete60Lists: number
  }
  cached: boolean
}

export interface TournamentSyncProgress {
  mode: 'new' | 'full' | null
  status: 'idle' | 'running' | 'rate-limited' | 'complete'
  /** In-memory job state; absent from persisted legacy progress. */
  active?: boolean
  stopping?: boolean
  page: number
  pending: { id: string; date: string }[]
  inspected: number
  saved: number
  skipped: number
  watermark: string | null
  previousWatermark: string | null
  newestSeen: string | null
  stopAfterPage: boolean
  cooldownUntil: string | null
  lastError: string | null
}

export type TournamentSummary = Pick<TournamentSnapshot,
  'eventId' | 'name' | 'date' | 'circuit' | 'platform' | 'isOnline' | 'reportedPlayers' | 'coverage' | 'pairingCoverage'>
