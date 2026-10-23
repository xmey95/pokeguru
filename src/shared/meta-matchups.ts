import type { AiRunConfig } from './ai'

export interface MetaDeck {
  id: string
  name: string
  points: number
  share: number
  url: string
}

export interface MetaSnapshot {
  id: string
  fetchedAt: string
  sourceUrl: string
  period: string
  circuit: 'WESTERN'
  format: 'STANDARD'
  decks: MetaDeck[]
  cached: boolean
}

export interface MatchupReport {
  projectId: string
  metaId: string
  opponentId: string
  deckHash: string
  generatedAt: string
  sampleDeckUrl: string | null
  metaSourceUrl?: string
  metaPeriod?: string
  metaFetchedAt?: string
  opponentSourceUrl?: string
  strengths: string
  weaknesses: string
  ourKeyCards: string
  theirKeyCards: string
  strategy: string
  limitations: string
  ai?: AiRunConfig
  tournamentEvidence?: MatchupTournamentEvidence
}

export interface MatchupTournamentEvidence {
  status: 'matched' | 'unavailable' | 'incompatible'
  detail: string
  eventId: string | null
  eventName: string | null
  eventDate: string | null
  eventUrl: string | null
  eventLists: number | null
  eventParticipants: number | null
  matchedDeckId: string | null
  matchedCompleteLists: number
  observedCards: { name: string; lists: number; catalogIdentityId: string | null;
    catalogStatus: 'recognized' | 'ambiguous' | 'not-in-catalog' }[]
  sampleLists: { url: string; placing: number | null }[]
}

export interface MatchupTurn {
  id: string
  feedback: string | null
  createdAt: string
  report: MatchupReport | null
  changeSummary: string | null
}

export interface MatchupDiscussion {
  id: string
  projectId: string
  metaId: string
  opponentId: string
  deckHash: string
  parentId: string | null
  current: boolean
  createdAt: string
  contextSummary: string
  summarizedThrough: number
  turns: MatchupTurn[]
}

