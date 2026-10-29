import type { ParsedDeck } from './deck-import'
import type { AiRunConfig } from './ai'
import type { ThreadEvidencePacket } from './thread-evidence'

export interface DeckVersion {
  id: string
  projectId: string
  sequence: number
  source: 'paste' | 'file'
  fileName: string | null
  rawText: string
  parsed: ParsedDeck
  createdAt: string
  adoption: { threadId: string; candidateId: string } | null
  restoredFrom: { id: string; sequence: number } | null
  label: string
  note: string
  resolutionId: string | null
  resolutionKnown: boolean
}

export interface DeckContextRef {
  versionId: string
  resolutionId: string | null
}

export interface RestoreDeckVersionInput {
  projectId: string
  versionId: string
  expectedHeadId: string
  expectedResolutionId?: string | null
}

export interface AnnotateDeckVersionInput {
  projectId: string
  versionId: string
  label: string
  note: string
}

export interface ContinueDeckThreadInput {
  projectId: string
  threadId: string
  candidateId: string
  title: string
}

export interface DeckThreadMessage {
  id: string
  text: string
  createdAt: string
  author: 'user' | 'assistant'
  aiConfig: AiRunConfig | null
  aiTurnId: string | null
  /** An immutable copy of the facts sent to this assistant turn. Legacy/manual messages omit it. */
  evidence?: ThreadEvidencePacket | null
  citedSourceIds?: string[]
}

export interface DeckThreadMessageCursor {
  createdAt: string
  rowId: number
}

export interface DeckThreadMessagePage {
  messages: DeckThreadMessage[]
  oldestCursor: DeckThreadMessageCursor | null
}

export interface DeckCandidate {
  adoptedVersionNumber?: number | null
  id: string
  parentCandidateId?: string | null
  sequence: number
  rawText: string
  parsed: ParsedDeck
  note: string
  createdAt: string
  origin: 'manual' | 'ai'
  aiConfig: AiRunConfig | null
  aiTurnId: string | null
  sources: { id: string; label: string; url: string | null }[]
  checks: string[]
}

export interface DeckThread {
  id: string
  projectId: string
  title: string
  baseVersionId: string | null
  baseVersionNumber: number | null
  baseResolutionId: string | null
  resolutionChanged: boolean
  parentThreadId: string | null
  seedCandidateId: string | null
  seedCandidateText: string | null
  currentVersionId: string | null
  stale: boolean
  aiSessionRef: string | null
  openingAiMessageId: string | null
  createdAt: string
  updatedAt: string
  messages: DeckThreadMessage[]
  candidates: DeckCandidate[]
  /** Present on a recent-message window; older messages can be fetched with oldestMessageCursor. */
  candidateCount?: number
  messageCount?: number
  oldestMessageCursor?: DeckThreadMessageCursor | null
  openingAiMessage?: DeckThreadMessage | null
  openingAiPending?: boolean
  /** Analysis projection retains all unanswered user notes without loading older evidence JSON. */
  pendingNotes?: string[]
}

export type DeckThreadSummary = Omit<DeckThread, 'messages' | 'candidates' | 'seedCandidateText' | 'pendingNotes' | 'openingAiMessage'> & {
  latestCandidateId: string | null
}

export interface CreateDeckThreadInput {
  projectId: string
  title: string
  openingNote?: string
  startWithAi?: boolean
}

export interface SaveDeckCandidateInput {
  projectId: string
  threadId: string
  rawText: string
  note?: string
}

export interface AdoptDeckCandidateInput {
  projectId: string
  threadId: string
  candidateId: string
  expectedHeadId: string
}
