import type { ParsedDeck } from './deck-import'

export interface DeckVersion {
  id: string
  projectId: string
  sequence: number
  source: 'paste' | 'file'
  fileName: string | null
  rawText: string
  parsed: ParsedDeck
  createdAt: string
}

export interface DeckThreadMessage {
  id: string
  text: string
  createdAt: string
  author: 'user' | 'assistant'
}

export interface DeckCandidate {
  id: string
  sequence: number
  rawText: string
  parsed: ParsedDeck
  note: string
  createdAt: string
  origin: 'manual'
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
  createdAt: string
  updatedAt: string
  messages: DeckThreadMessage[]
  candidates: DeckCandidate[]
}

export interface CreateDeckThreadInput {
  projectId: string
  title: string
  openingNote?: string
}

export interface SaveDeckCandidateInput {
  projectId: string
  threadId: string
  rawText: string
  note?: string
}
