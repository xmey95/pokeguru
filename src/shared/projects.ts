import type { DeckBaseline, ImportDeckInput } from './deck-import'
import type { MatchupDiscussion, MatchupReport, MetaDeck, MetaSnapshot } from './meta-matchups'
import type { AiConnection, AiPreferences } from './ai'
import type { CatalogView } from './catalog'
import type { ClearLineMappingInput, DeckReconciliation, SaveLineMappingInput } from './reconciliation'

export type ProjectFormat = 'STANDARD'
export type CompetitiveCircuit = 'WESTERN' | 'JAPAN'

export interface Project {
  id: string
  name: string
  format: ProjectFormat
  circuit: CompetitiveCircuit
  circuitAssignment: 'CREATED' | 'MIGRATED'
  createdAt: string
  updatedAt: string
  status: 'DA_COSTRUIRE' | 'BOZZA' | 'PRONTA_PER_CONTROLLO'
  cardTotal: number | null
}

export interface CreateProjectInput {
  name: string
  format: ProjectFormat
}

export type OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export interface ProjectsApi {
  getCatalog(): Promise<OperationResult<CatalogView>>
  syncCatalog(): Promise<OperationResult<CatalogView>>
  openCatalogSource(url: string): Promise<OperationResult<boolean>>
  list(): Promise<OperationResult<Project[]>>
  get(id: string): Promise<OperationResult<Project | null>>
  create(input: CreateProjectInput): Promise<OperationResult<Project>>
  getBaseline(projectId: string): Promise<OperationResult<DeckBaseline | null>>
  importDeck(input: ImportDeckInput): Promise<OperationResult<DeckBaseline>>
  getReconciliation(projectId: string): Promise<OperationResult<DeckReconciliation>>
  saveLineMapping(input: SaveLineMappingInput): Promise<OperationResult<DeckReconciliation>>
  clearLineMapping(input: ClearLineMappingInput): Promise<OperationResult<DeckReconciliation>>
  getMeta(): Promise<OperationResult<MetaSnapshot>>
  listMatchupReports(projectId: string, metaId: string): Promise<OperationResult<MatchupReport[]>>
  generateMatchup(projectId: string, metaId: string, opponentId: string, override?: AiPreferences | null): Promise<OperationResult<MatchupReport>>
  listMatchupDiscussions(projectId: string, opponentId: string): Promise<OperationResult<MatchupDiscussion[]>>
  listHistoricalMatchupOpponents(projectId: string): Promise<OperationResult<MetaDeck[]>>
  reviseMatchup(discussionId: string, feedback: string, override?: AiPreferences | null): Promise<OperationResult<MatchupDiscussion>>
  retryMatchupTurn(discussionId: string, turnId: string, override?: AiPreferences | null): Promise<OperationResult<MatchupDiscussion>>
  continueMatchup(discussionId: string, metaId: string, override?: AiPreferences | null): Promise<OperationResult<MatchupDiscussion>>
  openLimitless(url: string): Promise<OperationResult<boolean>>
  getAiPreferences(): Promise<OperationResult<AiPreferences>>
  saveAiPreferences(value: AiPreferences): Promise<OperationResult<AiPreferences>>
  getAiConnection(): Promise<OperationResult<AiConnection>>
  startAiLogin(): Promise<OperationResult<boolean>>
  logoutAi(): Promise<OperationResult<boolean>>
  testAiConnection(): Promise<OperationResult<boolean>>
}
