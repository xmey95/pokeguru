import type { DeckBaseline, ImportDeckInput } from './deck-import'
import type { MatchupDiscussion, MatchupReport, MatchupTournamentEvidence, MetaDeck, MetaSnapshot } from './meta-matchups'
import type { AiConnection, AiLoginProgress, AiLoginStart, AiPreferences, CodexSetupStatus } from './ai'
import type { CatalogAdvancedPage, CatalogAdvancedSearchInput, CatalogAdvancedSearchSummary,
  CatalogBrowseOverview, CatalogBrowsePage, CatalogBrowseGroup,
  CatalogPrint, CatalogSyncMode, CatalogSyncStatus, CatalogView } from './catalog'
import type { ClearLineMappingInput, DeckReconciliation, SaveLineMappingInput } from './reconciliation'
import type { DeckConstraint, DeleteConstraintInput, SaveConstraintInput } from './constraints'
import type { DeckExportRequest } from './deck-export'
import type { AdoptDeckCandidateInput, AnnotateDeckVersionInput, ContinueDeckThreadInput, CreateDeckThreadInput, DeckThread, DeckThreadMessageCursor, DeckThreadMessagePage, DeckThreadSummary, DeckVersion, RestoreDeckVersionInput, SaveDeckCandidateInput } from './deck-threads'
import type { TournamentSnapshot, TournamentSummary, TournamentSyncProgress } from './tournament'
import type { MainTournamentSnapshot, MainTournamentSummary, MainTournamentSyncProgress } from './main-tournament'
import type { StandardRuleAudit } from './standard-rule-audit'
import type { ThreadEvidencePacket } from './thread-evidence'
import type { AiJobSummary } from './ai-job'
import type { CardPreviewData, CardPreviewLookup } from './card-preview'

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
  archivedAt: string | null
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
  exportDiagnostics(): Promise<OperationResult<{ saved: boolean; fileName?: string }>>
  recordUiLongTask(durationMs: number): Promise<void>
  getCatalog(): Promise<OperationResult<CatalogView>>
  getCatalogBrowseOverview(): Promise<OperationResult<CatalogBrowseOverview>>
  searchCatalog(query: string, setId: string, offset: number): Promise<OperationResult<CatalogBrowsePage>>
  searchCatalogAdvanced(input: CatalogAdvancedSearchInput): Promise<OperationResult<CatalogAdvancedSearchSummary>>
  getCatalogAdvancedPage(id: string, setId: string, offset: number): Promise<OperationResult<CatalogAdvancedPage>>
  cancelCatalogAdvancedSearch(): Promise<OperationResult<boolean>>
  getCatalogGroup(key: string): Promise<OperationResult<{ group: CatalogBrowseGroup; prints: CatalogPrint[] } | null>>
  getCatalogPrint(id: string): Promise<OperationResult<CatalogPrint | null>>
  getCardPreview(lookup: CardPreviewLookup): Promise<OperationResult<CardPreviewData>>
  getCardPreviews(lookups: CardPreviewLookup[]): Promise<OperationResult<CardPreviewData[]>>
  syncCatalog(): Promise<OperationResult<CatalogView>>
  syncStandardCatalog(mode: CatalogSyncMode): Promise<OperationResult<CatalogSyncStatus>>
  getCatalogSyncStatus(): Promise<OperationResult<CatalogSyncStatus>>
  pauseCatalogSync(): Promise<OperationResult<CatalogSyncStatus>>
  cancelCatalogSync(): Promise<OperationResult<CatalogSyncStatus>>
  openCatalogSource(url: string): Promise<OperationResult<boolean>>
  openStandardSource(sourceId: string): Promise<OperationResult<boolean>>
  getStandardRuleAudit(): Promise<OperationResult<StandardRuleAudit | null>>
  checkStandardRuleSources(): Promise<OperationResult<StandardRuleAudit>>
  list(): Promise<OperationResult<Project[]>>
  listArchived(): Promise<OperationResult<Project[]>>
  get(id: string): Promise<OperationResult<Project | null>>
  create(input: CreateProjectInput): Promise<OperationResult<Project>>
  archive(id: string): Promise<OperationResult<Project>>
  restore(id: string): Promise<OperationResult<Project>>
  deleteArchived(id: string, confirmationName: string): Promise<OperationResult<boolean>>
  getBaseline(projectId: string): Promise<OperationResult<DeckBaseline | null>>
  importDeck(input: ImportDeckInput): Promise<OperationResult<DeckBaseline>>
  listDeckVersions(projectId: string): Promise<OperationResult<DeckVersion[]>>
  annotateDeckVersion(input: AnnotateDeckVersionInput): Promise<OperationResult<DeckVersion>>
  restoreDeckVersion(input: RestoreDeckVersionInput): Promise<OperationResult<DeckBaseline>>
  listDeckThreads(projectId: string): Promise<OperationResult<DeckThread[]>>
  listDeckThreadSummaries(projectId: string): Promise<OperationResult<DeckThreadSummary[]>>
  getDeckThread(projectId: string, threadId: string): Promise<OperationResult<DeckThread | null>>
  getDeckThreadWindow(projectId: string, threadId: string): Promise<OperationResult<DeckThread | null>>
  getDeckThreadMessagesBefore(projectId: string, threadId: string,
    cursor: DeckThreadMessageCursor): Promise<OperationResult<DeckThreadMessagePage>>
  getAiJobStatus(projectId: string, resourceId: string): Promise<OperationResult<AiJobSummary | null>>
  listRecentAiJobs(): Promise<OperationResult<AiJobSummary[]>>
  cancelAiJob(projectId: string, resourceId: string): Promise<OperationResult<boolean>>
  pauseAiJob(projectId: string, resourceId: string): Promise<OperationResult<boolean>>
  resumeAiJob(projectId: string, resourceId: string): Promise<OperationResult<boolean>>
  recoverAiJobs(): Promise<OperationResult<boolean>>
  createDeckThread(input: CreateDeckThreadInput): Promise<OperationResult<DeckThread>>
  continueDeckThread(input: ContinueDeckThreadInput): Promise<OperationResult<DeckThread>>
  addDeckThreadMessage(projectId: string, threadId: string, text: string): Promise<OperationResult<DeckThread>>
  previewDeckThreadEvidence(projectId: string, threadId: string, text: string): Promise<OperationResult<ThreadEvidencePacket>>
  askDeckThread(projectId: string, threadId: string, text: string, override?: AiPreferences | null,
    existingUserMessageId?: string): Promise<OperationResult<DeckThread>>
  openDeckSource(url: string): Promise<OperationResult<boolean>>
  openThreadLink(url: string): Promise<OperationResult<boolean>>
  saveDeckCandidate(input: SaveDeckCandidateInput): Promise<OperationResult<DeckThread>>
  adoptDeckCandidate(input: AdoptDeckCandidateInput): Promise<OperationResult<DeckBaseline>>
  copyDeckExport(input: DeckExportRequest): Promise<OperationResult<string[]>>
  getReconciliation(projectId: string): Promise<OperationResult<DeckReconciliation>>
  saveLineMapping(input: SaveLineMappingInput): Promise<OperationResult<DeckReconciliation>>
  clearLineMapping(input: ClearLineMappingInput): Promise<OperationResult<DeckReconciliation>>
  listConstraints(projectId: string): Promise<OperationResult<DeckConstraint[]>>
  saveConstraint(input: SaveConstraintInput): Promise<OperationResult<DeckConstraint>>
  deleteConstraint(input: DeleteConstraintInput): Promise<OperationResult<DeckConstraint[]>>
  getMeta(): Promise<OperationResult<MetaSnapshot>>
  getMatchupEvidence(metaId: string, opponentId: string): Promise<OperationResult<MatchupTournamentEvidence>>
  listMatchupReports(projectId: string, metaId: string): Promise<OperationResult<MatchupReport[]>>
  generateMatchup(projectId: string, metaId: string, opponentId: string, override?: AiPreferences | null): Promise<OperationResult<MatchupReport>>
  listMatchupDiscussions(projectId: string, opponentId: string): Promise<OperationResult<MatchupDiscussion[]>>
  listHistoricalMatchupOpponents(projectId: string): Promise<OperationResult<MetaDeck[]>>
  reviseMatchup(discussionId: string, feedback: string, override?: AiPreferences | null): Promise<OperationResult<MatchupDiscussion>>
  retryMatchupTurn(discussionId: string, turnId: string, override?: AiPreferences | null): Promise<OperationResult<MatchupDiscussion>>
  continueMatchup(discussionId: string, metaId: string, override?: AiPreferences | null): Promise<OperationResult<MatchupDiscussion>>
  openLimitless(url: string): Promise<OperationResult<boolean>>
  getTournament(): Promise<OperationResult<TournamentSnapshot | null>>
  refreshTournament(): Promise<OperationResult<TournamentSnapshot>>
  listTournaments(): Promise<OperationResult<TournamentSummary[]>>
  getTournamentEvent(eventId: string): Promise<OperationResult<TournamentSnapshot | null>>
  getTournamentSync(): Promise<OperationResult<TournamentSyncProgress>>
  syncTournaments(mode: 'new' | 'full'): Promise<OperationResult<TournamentSyncProgress>>
  pauseTournamentSync(): Promise<OperationResult<TournamentSyncProgress>>
  listMainTournaments(): Promise<OperationResult<MainTournamentSummary[]>>
  getMainTournament(eventId: string): Promise<OperationResult<MainTournamentSnapshot | null>>
  getMainTournamentSync(): Promise<OperationResult<MainTournamentSyncProgress>>
  syncMainTournaments(mode: 'new' | 'full'): Promise<OperationResult<MainTournamentSyncProgress>>
  pauseMainTournamentSync(): Promise<OperationResult<MainTournamentSyncProgress>>
  openMainTournament(url: string): Promise<OperationResult<boolean>>
  openTournament(url: string): Promise<OperationResult<boolean>>
  getAiPreferences(): Promise<OperationResult<AiPreferences>>
  saveAiPreferences(value: AiPreferences): Promise<OperationResult<AiPreferences>>
  getAiConnection(): Promise<OperationResult<AiConnection>>
  getCodexSetupStatus(): Promise<OperationResult<CodexSetupStatus>>
  startAiLogin(mode: 'browser' | 'device'): Promise<OperationResult<AiLoginStart>>
  getAiLoginProgress(): Promise<OperationResult<AiLoginProgress>>
  cancelAiLogin(): Promise<OperationResult<boolean>>
  logoutAi(): Promise<OperationResult<boolean>>
  testAiConnection(): Promise<OperationResult<boolean>>
}
