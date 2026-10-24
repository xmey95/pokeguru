import type { CardGameplay } from './catalog'

export interface ThreadEvidenceSource {
  id: string
  label: string
  url: string | null
  fingerprint: string
}

export interface ThreadCardEvidence {
  name: string
  quantity: number
  printId: string | null
  setId: string | null
  localId: string | null
  category: string | null
  regulationMark: string | null
  identityStatus: 'exact' | 'same-gameplay' | 'unverified' | 'ambiguous' | 'missing'
  gameplay: CardGameplay | null
  gameplayText: string | null
  sourceId: string | null
  detailAt: string | null
}

export interface ThreadEventEvidence {
  sourceId: string
  eventId: string
  snapshotId: string
  name: string
  date: string
  kind: 'online' | 'in-person'
  participants: number
  completeLists: number
  lists: {
    sourceId: string
    deck: string
    placing: number | null
    url: string
    cards: string[]
  }[]
}

export interface ThreadEvidencePacket {
  schemaVersion: 1
  capturedAt: string
  baseVersionId: string | null
  candidateId: string | null
  catalogSyncedAt: string | null
  cardCoverage: { selected: number; withGameplay: number; omitted: number }
  cards: ThreadCardEvidence[]
  events: ThreadEventEvidence[]
  sources: ThreadEvidenceSource[]
  change: { updated: string[]; added: string[]; removed: string[] }
}
