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
  id: string
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
  currentVersionId: string | null
  stale: boolean
  aiSessionRef: string | null
  openingAiMessageId: string | null
  createdAt: string
  updatedAt: string
  messages: DeckThreadMessage[]
  candidates: DeckCandidate[]
  /** Present on a recent-message window; older messages can be fetched with oldestMessageCursor. */
  messageCount?: number
  oldestMessageCursor?: DeckThreadMessageCursor | null
  openingAiMessage?: DeckThreadMessage | null
  openingAiPending?: boolean
}

export type DeckThreadSummary = Omit<DeckThread, 'messages' | 'candidates'> & {
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
