import type { AiRunConfig } from './ai'
import type { AiEvidenceQueryTrace, AiPromptAudit } from './ai-evidence'

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

export interface MatchupStrategyPhases {
  opening: string
  development: string
  closing: string
}

export function hasStrategyPhases(value: unknown): value is MatchupStrategyPhases {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const phases = value as Record<string, unknown>
  return ['opening', 'development', 'closing'].every((key) =>
    typeof phases[key] === 'string' && phases[key].trim().length > 0 && phases[key].length <= 5000)
}

export interface MatchupReport {
  jobId?: string
  projectId: string
  metaId: string
  opponentId: string
  deckHash: string
  deckVersionId?: string | null
  deckResolutionId?: string | null
  generatedAt: string
  sampleDeckUrl: string | null
  sampleDeckCards?: string[]
  sampleDeckMechanics?: { name: string; text: string; sourceUrl: string }[]
  metaSourceUrl?: string
  metaPeriod?: string
  metaFetchedAt?: string
  opponentSourceUrl?: string
  strengths: string
  weaknesses: string
  ourKeyCards: string
  theirKeyCards: string
  strategy: string
  /** Explicit phases in new reports. Legacy strategy is never split or rewritten. */
  strategyPhases?: MatchupStrategyPhases
  limitations: string
  ai?: AiRunConfig
  tournamentEvidence?: MatchupTournamentEvidence
  aiQueries?: AiEvidenceQueryTrace
  promptAudit?: AiPromptAudit
}

export interface MatchupTournamentEvidence {
  schemaVersion?: 2
  evidenceHash?: string
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
    catalogStatus: 'recognized' | 'ambiguous' | 'not-in-catalog';
    gameplay?: string | null; cardSourceUrl?: string | null }[]
  sampleLists: { url: string; placing: number | null; eventName?: string;
    source?: 'play' | 'main'; cards?: string[] }[]
  events?: { source: 'play' | 'main'; eventId: string; name: string; date: string;
    url: string; totalParticipants: number; visibleParticipants: number;
    completeLists: number; matchedLists: number; circuit: string }[]
  opponentFieldRecord?: { wins: number; losses: number; ties: number; denominator: number;
    eligiblePairings: number; events: number; windowStart: string; windowEnd: string;
    circuit: 'WESTERN'; eventType: 'ONLINE'; scope: 'opponent-versus-field' }
}

export interface MatchupTurn {
  turnNo?: number
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
  deckVersionId?: string | null
  deckResolutionId?: string | null
  parentId: string | null
  current: boolean
  createdAt: string
  contextSummary: string
  summarizedThrough: number
  turns: MatchupTurn[]
  turnCount?: number
  baseVersionNumber?: number | null
  baseVersionLabel?: string
  historyCursor?: { createdAt: string; rowId: number }
}


export interface MatchupDiscussionPage {
  items: MatchupDiscussion[]
  currentId: string | null
  nextCursor: { createdAt: string; rowId: number } | null
}
