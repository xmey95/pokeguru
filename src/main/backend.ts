import { backendContext, callHost } from './backend-host'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ProjectStore } from './project-store'
import type { DeckBaseline, ImportDeckInput } from '../shared/deck-import'
import type { AdoptDeckCandidateInput, AnnotateDeckVersionInput, ContinueDeckThreadInput, CreateDeckThreadInput, DeckContextRef, DeckThread, DeckThreadMessageCursor, DeckThreadMessagePage, DeckThreadSummary, DeckVersion, RestoreDeckVersionInput, SaveDeckCandidateInput } from '../shared/deck-threads'
import { reviewCandidate } from '../shared/candidate-review'
import { auditStandardRuleSources } from './standard-rule-audit'
import type { StandardRuleAudit } from '../shared/standard-rule-audit'
import type { OperationResult, Project } from '../shared/projects'
import type { MatchupDiscussion, MatchupReport, MatchupTournamentEvidence, MetaDeck, MetaSnapshot } from '../shared/meta-matchups'
import type { AiConnection, AiLoginProgress, AiLoginStart, AiPreferences, AiRunConfig, CodexSetupStatus } from '../shared/ai'
import type { AiEvidenceQueryResult, AiEvidenceQueryTrace } from '../shared/ai-evidence'
import { fetchMeta, fetchOpponentSample } from './limitless-meta'
import { generateMatchup, matchupHistoryContext, reviseMatchup, summarizeMatchupContext, testCodex } from './codex-matchup'
import { AiPreferencesStore, resolveAiConfig } from './ai-preferences'
import { CodexControl } from './codex-control'
import { CodexSetup } from './codex-setup'
import { deckThreadPrompt, DECK_THREAD_SCHEMA, readDeckThreadTurn } from './deck-ai'
import { buildThreadEvidence } from './thread-evidence'
import { createAiEvidenceEngine, type AiEvidenceEngine } from './ai-evidence-engine'
import { createArchivedEvidenceEngine } from './ai-evidence-snapshot'
import { AiEvidenceArchive } from './ai-evidence-archive'
import { extendAiEvidenceForText, makeAiPromptAudit, runAiEvidenceQueries,
  threadEvidenceWithQueries } from './ai-evidence-queries'
import { planEvidenceQueriesWithCodex } from './codex-evidence-plan'
import { questionUsesCurrentDeck,
  searchCatalogAdvanced, type CatalogAdvancedExecution } from './catalog-advanced-service'
import { advancedCatalogPage } from './catalog-advanced-search'
import type { ThreadEvidencePacket } from '../shared/thread-evidence'
import { CatalogStore, enrichCatalogPrints, fetchCatalogSample, syncStandardCatalog } from './catalog'
import type { CatalogAdvancedPage, CatalogAdvancedSearchInput, CatalogAdvancedSearchSummary,
  CatalogBrowseOverview, CatalogBrowsePage, CatalogBrowseGroup,
  CatalogPrint, CatalogSyncMode, CatalogSyncStatus, CatalogView } from '../shared/catalog'
import { buildDeckCards, matchupDeckContext, snapshotPrint,
  type ClearLineMappingInput, type DeckReconciliation, type SaveLineMappingInput } from '../shared/reconciliation'
import { multiMatchupEvidence } from '../shared/matchup-evidence'
import type { DeckConstraint, DeleteConstraintInput, SaveConstraintInput } from '../shared/constraints'
import { prepareDeckExport, type DeckExportPreview, type DeckExportRequest } from '../shared/deck-export'
import { WESTERN_ROTATION_RULES } from '../shared/standard-rotation'
import { PROMO_LEGALITY_SOURCE } from './promo-legality'
import { OFFICIAL_SET_RELEASE_SOURCE } from './official-set-releases'
import { SET_ADMISSION_OLDER_RULE_SOURCE, SET_ADMISSION_RULE_SOURCE } from '../shared/standard-admission'
import { ACE_SPEC_SOURCE, DECK_CONSTRUCTION_SOURCE } from '../shared/deck-construction'
import { BUNDLED_WESTERN_RULE_PACKAGE } from '../shared/western-rule-package'
import { gameplaySummary } from '../shared/card-gameplay'
import { effectiveCardGameplay } from '../shared/card-errata'
import { OFFICIAL_SET_CODES } from '../shared/set-codes'
import { evaluateStandardDeck } from '../shared/standard-deck'
import { localCalendarDate } from '../shared/calendar-date'
import { safeThreadLink } from '../shared/thread-links'
import { TournamentStore } from './tournament-store'
import { DatabaseIntegrityError, completeDatabaseMigration, prepareDatabaseMigration } from './database-migrations'
import { AiJobStore } from './ai-job-store'
import type { AiJob } from './ai-job-store'
import type { AiJobPhase, AiJobSummary } from '../shared/ai-job'
import { recoverMatchupJob, recoverThreadJob, settleFailedAiJob } from './ai-job-recovery'
import { AiAnalysisWork, analyzeLargeEvidence, readAiWorkflow } from './ai-analysis-work'
import { canResumeAiJob } from '../shared/ai-job-lifecycle'
import { aiFailureCode } from './ai-failure'
import { fetchRecentWesternTournament } from './limitless-event'
import { syncTournamentBlock } from './tournament-sync'
import { syncMainTournamentBlock } from './main-tournament-sync'
import { TournamentSyncJob } from './tournament-sync-job'
import { DailySyncStore } from './daily-sync'
import type { DailySyncSource } from '../shared/daily-sync'
import type { TournamentSnapshot, TournamentSummary, TournamentSyncProgress } from '../shared/tournament'
import type { MainTournamentSnapshot, MainTournamentSummary, MainTournamentSyncProgress } from '../shared/main-tournament'
import type { CardPreviewData, CardPreviewLookup } from '../shared/card-preview'
import { buildDiagnosticReport, type RuntimeIncident, type UiLongTask } from './diagnostics'
import { readDiagnosticIncidents, writeDiagnosticIncidents } from './diagnostic-incidents'

// Only the authenticated main-frame IPC gateway can invoke these handlers.
export const backendHandlers = new Map<string, (...args: any[]) => unknown>()
function registerHandler(channel: string, handler: (...args: any[]) => unknown): void { backendHandlers.set(channel, handler) }

let aiJobStore: AiJobStore | null = null
let projectStore: ProjectStore | null = null
let catalogStore: CatalogStore | null = null
let tournamentStore: TournamentStore | null = null
let dailySyncStore: DailySyncStore | null = null
let playTournamentJob: TournamentSyncJob<TournamentSyncProgress> | null = null
let mainTournamentJob: TournamentSyncJob<MainTournamentSyncProgress> | null = null
let storageError: string | null = null
let storageIssue: 'integrity' | 'unavailable' | null = null
const uiLongTasks: UiLongTask[] = []
const runtimeIncidents: RuntimeIncident[] = []
let diagnosticIncidentsPath: string | null = null

export function recordRuntimeIncident(incident: RuntimeIncident): void {
  runtimeIncidents.push(incident)
  if (runtimeIncidents.length > 20) runtimeIncidents.shift()
  if (diagnosticIncidentsPath) {
    try { writeDiagnosticIncidents(diagnosticIncidentsPath, runtimeIncidents) }
    catch { /* Diagnostics must not affect the application. */ }
  }
}
let aiPreferencesStore: AiPreferencesStore | null = null
const codexControl = new CodexControl(() => backendContext.userData)
const codexSetup = new CodexSetup(() => backendContext.userData)
const generatingProjects = new Set<string>()
const generatingDeckThreads = new Set<string>()
const activeAiControllers = new Map<string, AbortController>()
const activeAiWork = new Map<string, AiAnalysisWork>()
const resumeRunners = new Map<AiJob['kind'], (job: AiJob, args: unknown[]) => Promise<unknown>>()

function beginAiWork(job: AiJob, controller: AbortController, args: unknown[]): AiAnalysisWork {
  const work = new AiAnalysisWork(aiArtifactDirectory(job.id), aiJobStore!, job.id,
    controller.signal, { kind: job.kind, args })
  activeAiWork.set(job.id, work)
  return work
}

async function pinnedAiConfig(work: AiAnalysisWork, override: unknown): Promise<AiRunConfig> {
  const saved = work.archive.value<AiRunConfig>('input', 'config')
  if (saved) return saved
  const config = await runConfig(override)
  return work.snapshot('config', [], () => config)
}

function jobProgress(job: AiJob, phase: AiJobPhase, detail: string, summary?: string): void {
  aiJobStore?.updateProgress(job.id, phase, detail, summary)
}

function jobSummary(job: AiJob, phase: AiJobPhase, detail: string): (summary: string) => void {
  return (summary) => jobProgress(job, phase, detail, summary)
}

async function yieldAiPreparation(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
  if (signal.aborted) throw new Error('Operazione Codex annullata.')
}
const catalogAdvancedResults = new Map<string, CatalogAdvancedExecution>()
let activeCatalogAdvancedSearch: AbortController | null = null
let recoveringAiJobs = false
let drainingAiQueue = false
let aiShuttingDown = false

function aiArtifactDirectory(jobId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error('Identificativo job AI non valido.')
  return join(backendContext.userData, 'data', 'ai-jobs', jobId)
}

function clearAiArtifacts(jobId: string): void {
  const directory = aiArtifactDirectory(jobId)
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true })
}

function finishAiJob(job: AiJob, error: unknown): unknown {
  try { persistAiJobFailure(job, error) }
  catch (storageError) {
    // A full disk can prevent even the error status from being committed. Keep
    // the prior checkpoint and return an actionable IPC error to the renderer.
    if (['storage', 'storage-full'].includes(aiFailureCode(storageError))) return storageError
    throw storageError
  }
  return error
}

function persistAiJobFailure(job: AiJob, error: unknown): void {
  if (!aiJobStore || aiShuttingDown) return
  const current = aiJobStore.get(job.id)
  if (current?.status === 'running' && activeAiWork.has(job.id)) {
    const controller = activeAiControllers.get(job.id)
    if (!controller?.signal.aborted || controller.signal.reason === 'pause') {
      aiJobStore.recordDiagnostics(job.id, { failureCode: controller?.signal.reason === 'pause'
        ? 'paused' : aiFailureCode(error) })
      aiJobStore.suspend(job.id, controller?.signal.reason === 'pause'
        ? 'Analisi in pausa. Riprendi per continuare dai lotti salvati.'
        : error instanceof Error ? error.message : 'Analisi interrotta. Puoi riprenderla.',
      controller?.signal.reason === 'pause' ? 'user' : 'failure')
      return
    }
  }
  if (settleFailedAiJob(aiJobStore, job.id, error,
    activeAiControllers.get(job.id)?.signal.aborted ?? false,
    existsSync(join(aiArtifactDirectory(job.id), 'result.json')))) {
    clearAiArtifacts(job.id)
  }
}

function resumeSavedAiJob(job: AiJob, explicit: boolean): Promise<unknown> {
  if (!aiJobStore || !projectStore || aiShuttingDown) throw new Error('Archivio non disponibile.')
  if (!canResumeAiJob(job)) throw new Error('Questa analisi non può proseguire con gli stessi input. Avvia una nuova richiesta.')
  const input = readAiWorkflow(aiArtifactDirectory(job.id), aiJobStore, job.id)
  const runner = input && input.kind === job.kind ? resumeRunners.get(job.kind) : null
  if (!runner || !input) throw new Error('Contesto di ripresa non disponibile.')
  if (input.schemaVersion !== 2) {
    const message = 'Questa analisi proviene da una versione che non salvava tutti gli input. Gli esiti completati restano disponibili; annulla il lavoro e avvia una nuova analisi sui dati attuali.'
    aiJobStore.suspend(job.id, message, 'legacy')
    throw new Error(message)
  }
  const targetProject = job.kind === 'thread-ask' || job.kind === 'matchup-generate'
    ? input.args[0] : typeof input.args[0] === 'string'
      ? projectStore.getMatchupDiscussion(input.args[0])?.projectId : null
  const targetResource = job.kind === 'thread-ask' ? input.args[1] : `matchup:${targetProject}`
  if (targetProject !== job.projectId || targetResource !== job.resourceId)
    throw new Error('Contesto di ripresa non appartenente al progetto.')
  if (explicit) aiJobStore.retryAfterIntervention(job.id)
  return runner(job, input.args)
}

async function drainAiQueue(): Promise<void> {
  if (!aiJobStore || drainingAiQueue || aiShuttingDown) return
  drainingAiQueue = true
  try {
    for (const queued of aiJobStore.automaticResumable()) {
      if (aiShuttingDown || !aiJobStore) break
      const job = aiJobStore.get(queued.id)
      if (!job || job.status !== 'interrupted' || job.progress?.diagnostics?.suspensionReason !== 'shutdown' ||
        activeAiControllers.has(job.id)) continue
      try {
        const result = await resumeSavedAiJob(job, false) as { ok?: boolean; error?: string }
        if (result?.ok === false && aiJobStore?.get(job.id)?.progress?.diagnostics?.suspensionReason === 'shutdown')
          aiJobStore.suspend(job.id, result.error ?? 'Ripresa non riuscita.', 'failure')
      } catch (error) {
        if (!aiShuttingDown && aiJobStore && aiJobStore.get(job.id)?.progress?.diagnostics?.suspensionReason !== 'legacy')
          aiJobStore.suspend(job.id, error instanceof Error ? error.message : 'Ripresa non riuscita.', 'failure')
      }
    }
  } finally { drainingAiQueue = false }
}

async function recoverAiJobs(): Promise<void> {
  if (!aiJobStore || !projectStore || !catalogStore || recoveringAiJobs) return
  recoveringAiJobs = true
  try {
    for (const job of aiJobStore.recoverable()) {
      if (activeAiControllers.has(job.id)) continue
      try {
        const workflow = job.status === 'running' ? readAiWorkflow(aiArtifactDirectory(job.id), aiJobStore, job.id) : null
        if (job.status === 'running' && workflow && (workflow.schemaVersion === 2 ||
          (job.request as { validatedDraft?: boolean } | null)?.validatedDraft !== true)) {
          const voluntary = job.progress?.diagnostics?.suspensionReason === 'user'
          aiJobStore.suspend(job.id, voluntary ? 'Analisi in pausa su tua richiesta.'
            : 'Ripresa automatica dai risultati salvati alla riapertura.', voluntary ? 'user' : 'shutdown')
          continue
        }
        const outcome = job.kind === 'thread-ask' || job.kind === 'thread-propose'
          ? await recoverThreadJob(job, aiJobStore, projectStore, catalogStore,
            codexControl, aiArtifactDirectory(job.id))
          : recoverMatchupJob(job, aiJobStore, projectStore, aiArtifactDirectory(job.id))
        if (outcome === 'applied' || outcome === 'interrupted') clearAiArtifacts(job.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Recupero Codex non riuscito.'
        aiJobStore.recordDiagnostics(job.id, { failureCode: aiFailureCode(error) })
        if (aiJobStore.get(job.id)?.status === 'running') aiJobStore.transition(job.id, 'interrupted', message)
        else aiJobStore.noteError(job.id, message)
      }
    }
  } finally { recoveringAiJobs = false }
  void drainAiQueue()
}
function hasRecoverableThreadJob(): boolean {
  return !!aiJobStore?.recoverable().some((job) =>
    job.kind === 'thread-ask' || job.kind === 'thread-propose')
}
let catalogSyncing = false
let catalogRetryTimer: ReturnType<typeof setTimeout> | null = null
let catalogJobController: AbortController | null = null
let catalogShuttingDown = false
let startupSyncTimer: ReturnType<typeof setTimeout> | null = null
function catalogJobStatus(store: CatalogStore): CatalogSyncStatus {
  const status = store.jobStatus()
  return { ...status, daily: dailySyncStore?.read('catalog'), running: status.state === 'running' ? catalogSyncing
    : status.state === 'rate-limited' ? catalogSyncing || catalogRetryTimer !== null : false }
}

function runCatalogJob(mode: CatalogSyncMode, background = false): void {
  const store = catalogStore
  if (!store || catalogSyncing) return
  const status = store.jobStatus()
  if (status.state === 'rate-limited' && status.cooldownUntil &&
    Date.parse(status.cooldownUntil) > Date.now()) {
    if (catalogRetryTimer) clearTimeout(catalogRetryTimer)
    catalogRetryTimer = setTimeout(() => {
      catalogRetryTimer = null
      runCatalogJob(mode, background)
    }, Math.min(60 * 60_000, Date.parse(status.cooldownUntil) - Date.now()))
    return
  }
  catalogSyncing = true
  const controller = new AbortController()
  catalogJobController = controller
  void syncStandardCatalog(store, undefined, mode, controller.signal).then(() => {
    if (!catalogShuttingDown) dailySyncStore?.success('catalog')
  }).catch((error) => {
    if (!catalogShuttingDown && !controller.signal.aborted) {
      const message = error instanceof Error ? error.message : 'Catalogo non aggiornato.'
      dailySyncStore?.failed('catalog', message,
        /HTTP 429|HTTP 503|limitato temporaneamente/i.test(message) ? store.jobStatus().cooldownUntil : null)
    }
  }).finally(() => {
    catalogSyncing = false
    if (catalogJobController === controller) catalogJobController = null
    if (!background && !catalogShuttingDown && catalogStore === store && store.jobStatus().state === 'rate-limited')
      runCatalogJob(mode)
  })
}

function startDailySync(): void {
  startupSyncTimer = null
  if (catalogShuttingDown || !dailySyncStore || !catalogStore || !playTournamentJob || !mainTournamentJob) return
  const attempt = (source: DailySyncSource, allowed: boolean, start: () => void): void => {
    if (!allowed || !dailySyncStore?.claim(source)) return
    try { start() }
    catch (error) { dailySyncStore?.failed(source, error instanceof Error ? error.message : 'Avvio non riuscito.') }
  }
  const catalog = catalogStore.jobStatus()
  attempt('catalog', !catalogSyncing && !catalogRetryTimer &&
    !(catalog.state === 'paused' && dailySyncStore.read('catalog').outcome === 'paused') &&
    !(catalog.mode === 'full' && !['done', 'idle'].includes(catalog.state)),
  () => runCatalogJob('new', true))
  const play = tournamentStore?.progress()
  attempt('play', !playTournamentJob.status().active &&
    !(dailySyncStore.read('play').outcome === 'idle' && play &&
      (play.status === 'running' || play.status === 'rate-limited')) &&
    !(play?.mode === 'full' && play.status !== 'complete') && dailySyncStore.read('play').outcome !== 'paused',
  () => { playTournamentJob!.start('new', true) })
  const main = tournamentStore?.mainProgress()
  attempt('main', !mainTournamentJob.status().active &&
    !(dailySyncStore.read('main').outcome === 'idle' && main &&
      (main.status === 'running' || main.status === 'rate-limited')) &&
    !(main?.mode === 'full' && main.status !== 'complete') && dailySyncStore.read('main').outcome !== 'paused',
  () => { mainTournamentJob!.start('new', true) })
}
async function prepareMatchupHistory(discussion: MatchupDiscussion, config: AiRunConfig,
  work: AiAnalysisWork): Promise<MatchupDiscussion> {
  if (!projectStore) throw new Error(unavailableMessage())
  let current = discussion
  const lastToSummarize = current.turns.length - 5
  while (lastToSummarize > current.summarizedThrough) {
    const through = Math.min(current.summarizedThrough + 5, lastToSummarize)
    if (!current.turns[through]?.report) break
    const summary = await work.snapshotAsync(`history-summary:${through}`,
      () => summarizeMatchupContext(current, through, config, work.signal))
    projectStore.saveMatchupContextSummary(current.id, summary, through)
    current = { ...current, contextSummary: summary, summarizedThrough: through }
  }
  return current
}

function aiError(error: unknown): string {
  if (aiFailureCode(error) === 'storage-full')
    return 'Lo spazio su disco è esaurito. I checkpoint già salvati restano disponibili; libera spazio e riapri Pokéguru per recuperarli.'
  return error instanceof Error ? error.message : 'Operazione Codex non riuscita.'
}

async function runConfig(override?: unknown): Promise<AiRunConfig> {
  if (!aiPreferencesStore) throw new Error(unavailableMessage())
  const connection = await codexControl.connection()
  if (connection.account !== 'chatgpt' && connection.account !== 'apiKey') {
    throw new Error('Accedi a Codex con ChatGPT o con una chiave API prima di generare analisi.')
  }
  const source = override === null || override === undefined ? 'global' : 'override'
  const selected = resolveAiConfig(source === 'global' ? aiPreferencesStore.read() : override, connection.models, source)
  if (!selected.model) selected.model = connection.models.find((model) => model.isDefault)?.id ?? null
  return selected
}

function unavailableMessage(): string {
  return storageError ?? 'Archivio locale non disponibile. Controlla i permessi della cartella dati e riavvia l’app.'
}

function captureMatchupSelection(projectId: string, metaId: string, opponentId: string) {
  const project = projectStore!.get(projectId)
  const baseline = projectStore!.getBaseline(projectId)
  const snapshot = projectStore!.getLatestMetaSnapshot()
  const opponent = snapshot?.decks.find((deck) => deck.id === opponentId)
  const hash = projectStore!.getCurrentDeckHash(projectId)
  if (!project || project.circuit !== 'WESTERN' || !baseline || !snapshot || snapshot.id !== metaId || !opponent || !hash)
    throw new Error('Importa una lista e aggiorna il metagame prima di generare l’analisi.')
  return { projectId, baseline, snapshot, opponent, hash,
    deckVersion: projectStore!.getCurrentDeckContext(projectId),
    reconciliation: projectStore!.getReconciliation(projectId),
    ruleAudit: projectStore!.getStandardRuleAudit(), asOf: localCalendarDate() }
}

async function prepareStableMatchup(work: AiAnalysisWork, selection: ReturnType<typeof captureMatchupSelection>,
  config: AiRunConfig, discussion?: MatchupDiscussion, reusePrevious = false) {
  const { projectId, baseline, snapshot, opponent, reconciliation, ruleAudit, asOf } = selection
  const context = discussion ? await work.snapshotAsync('matchup-history',
    () => prepareMatchupHistory(work.snapshot('discussion', [], () => discussion), config, work)) : undefined
  const previous = reusePrevious ? [...context?.turns ?? []].reverse().find((turn) => turn.report)?.report : undefined
  const sampleDeck = await work.snapshotAsync('opponent-deck', async () => previous?.sampleDeckCards
    ? { url: previous.sampleDeckUrl, cards: previous.sampleDeckCards } : fetchOpponentSample(opponent))
  await work.snapshotAsync('deck-enrichment', async () => { await enrichMatchupDeck(projectId, baseline, reconciliation); return true })
  if (!reusePrevious) await work.snapshotAsync('opponent-enrichment', async () => { await enrichOpponentCards(snapshot, opponent); return true })
  const evidence = work.snapshot('tournament-evidence', [], () => previous?.tournamentEvidence ?? currentMatchupEvidence(snapshot, opponent))
  const sample = await work.snapshotAsync('opponent-mechanics', async () => previous?.sampleDeckCards
    ? { ...sampleDeck, mechanics: previous.sampleDeckMechanics ?? [] } : opponentSampleWithMechanics(sampleDeck, evidence))
  const deckContext = work.snapshot('deck-context', [], () => {
    const catalog = catalogStore?.view() ?? null
    return matchupDeckContext(baseline, reconciliation, catalog, evaluateStandardDeck(baseline, catalog, asOf, ruleAudit))
  })
  return { context, evidence, sample, deckContext }
}

function currentAiEventWindow(catalog: CatalogView, recentDays?: number, to = localCalendarDate()):
  { from: string; to: string } {
  const rotation = catalog.rulePackage?.rotations.find((period) =>
    period.effectiveFrom <= to && period.effectiveUntil >= to)
  const recent = recentDays ? new Date(Date.parse(`${to}T00:00:00Z`) -
    recentDays * 86_400_000).toISOString().slice(0, 10) : null
  return { from: recent && rotation ? (recent > rotation.effectiveFrom ? recent
    : rotation.effectiveFrom) : recent ?? rotation?.effectiveFrom ?? to, to }
}

function catalogAdvancedEvents(question: string, catalog: CatalogView):
  { label: string; url: string; cards: string[] }[] {
  const normalized = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, ' ').trim()
  const text = ` ${normalized(question)} `
  const archetype = projectStore?.getLatestMetaSnapshot()?.decks
    .filter((deck) => text.includes(` ${normalized(deck.name)} `))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (!archetype) return []
  const engine = createAiEvidenceEngine(catalog, tournamentStore?.list() ?? [],
    tournamentStore?.listMain() ?? [], currentAiEventWindow(catalog, 90))
  const result = engine.execute({ operation: 'events.search', deckName: archetype.name, limit: 3 })
  if (result.status !== 'ok') return []
  const lists = (result.data as { lists?: { name: string; date: string; deck: string;
    listUrl: string; cards: string[] }[] }).lists ?? []
  return lists.map((list) => ({ label: `${list.deck} · ${list.name} · ${list.date}`,
    url: list.listUrl, cards: list.cards }))
}

async function matchupAiQueries(request: string, deckContext: string,
  sample: { url: string | null; cards: string[]; mechanics?: unknown },
  evidence: MatchupTournamentEvidence, config: AiRunConfig,
  signal: AbortSignal, history?: string, job?: AiJob) {
  if (!catalogStore) throw new Error('Catalogo non disponibile per le query AI.')
  await yieldAiPreparation(signal)
  const work = job ? activeAiWork.get(job.id) : undefined
  if (!work) throw new Error('Job di analisi non disponibile.')
  const { engine, catalog } = createArchivedEvidenceEngine(work.archive, () => {
    const current = catalogStore!.view()
    const selection = work.archive.value<ReturnType<typeof captureMatchupSelection>>('input', 'matchup-selection')
    return { catalog: current, window: currentAiEventWindow(current, 31, selection?.asOf),
      play: tournamentStore?.iterate() ?? [], main: tournamentStore?.iterateMain() ?? [] }
  })
  if (job) jobProgress(job, 'planning', 'Codex seleziona le ricerche locali utili alla guida.')
  const initial = { deckContext, sample, evidence, history }
  const stableInitial = work?.snapshot('matchup-initial', [request, catalog.syncedAt, deckContext,
    sample.cards, history], () => initial) ?? initial
  const trace = await runAiEvidenceQueries(request, stableInitial, engine,
    (prompt) => {
      const execute = () => planEvidenceQueriesWithCodex(prompt, config, signal,
        job ? jobSummary(job, 'planning', 'Codex sceglie le ricerche pertinenti.') : undefined)
      return work ? work.run('planning', prompt, config, execute) : execute()
    },
    { archive: work.archive, contextTexts: [stableInitial.deckContext, stableInitial.sample.cards.join('\n'), stableInitial.history ?? ''],
      signal, onTrace: (value) => work?.evidence(value),
      summarize: (trace) => analyzeLargeEvidence(trace, request, config, work),
      onRound: (round, queries) => { if (job) jobProgress(job, 'planning',
        `Ricerca ${round}: ${queries} interrogazioni locali completate.`) } })
  if (work) await analyzeLargeEvidence(trace, request, config, work)
  return { trace, engine }
}

function matchupDraftText(report: MatchupReport, changeSummary = ''): string {
  return [report.strengths, report.weaknesses, report.ourKeyCards, report.theirKeyCards,
    report.strategy, ...Object.values(report.strategyPhases ?? {}), report.limitations,
    changeSummary].join('\n')
}

function extendMatchupDraftEvidence(trace: AiEvidenceQueryTrace, engine: AiEvidenceEngine,
  report: MatchupReport,
  changeSummary = ''): number {
  const text = matchupDraftText(report, changeSummary)
  const added = extendAiEvidenceForText(trace, engine, text)
  const focus = engine.cardTargets(text).flatMap((target) => target.printIds)
  const needsFocus = !!trace.analysis && focus.some((id) => !trace.focusedPrintIds?.includes(id))
  trace.focusedPrintIds = [...new Set([...(trace.focusedPrintIds ?? []), ...focus])]
  return added || (needsFocus ? 1 : 0)
}

function requireNamedEvidence(trace: AiEvidenceQueryTrace): void {
  const missing = trace.cardTargets?.filter((target) => target.status === 'not-supplied') ?? []
  if (missing.length) throw new Error(`Prove locali non consegnate per ${missing.map((item) => item.name).join(', ')}. Riprova l’analisi.`)
}

async function enrichMatchupDeck(projectId: string, baseline: DeckBaseline,
  frozenReconciliation?: DeckReconciliation): Promise<void> {
  if (!catalogStore || !projectStore || catalogSyncing) return
  const reconciliation = frozenReconciliation ?? projectStore.getReconciliation(projectId)
  const cards = buildDeckCards(baseline, catalogStore.view(), reconciliation)
  const ids = [...new Set([
    ...cards.flatMap((card) => card.importedPrintIds),
    ...reconciliation.mappings.map((mapping) => mapping.print.id)
  ])]
  try { await enrichCatalogPrints(catalogStore, ids) }
  catch { /* A source outage is reported through the resulting missing card data. */ }
}

function currentMatchupEvidence(snapshot: MetaSnapshot, opponent: MetaDeck): MatchupTournamentEvidence {
  return multiMatchupEvidence(snapshot, opponent, tournamentStore?.list() ?? [],
    tournamentStore?.listMain() ?? [], catalogStore?.view() ?? null)
}

function matchupJobBase(jobId: string, projectId: string, deckHash: string,
  snapshot: MetaSnapshot, opponent: MetaDeck,
  sample: { url: string | null; cards: string[];
    mechanics?: { name: string; text: string; sourceUrl: string }[] },
  config: AiRunConfig, evidence: MatchupTournamentEvidence,
  aiQueries?: AiEvidenceQueryTrace, deckVersion?: DeckContextRef | null):
  Omit<MatchupReport, 'strengths' | 'weaknesses' | 'ourKeyCards' | 'theirKeyCards' |
    'strategy' | 'limitations'> {
  return { jobId, projectId, deckHash,
    deckVersionId: deckVersion?.versionId ?? null, deckResolutionId: deckVersion?.resolutionId ?? null,
    metaId: snapshot.id, opponentId: opponent.id,
    generatedAt: aiJobStore?.get(jobId)?.createdAt ?? new Date().toISOString(), sampleDeckUrl: sample.url,
    sampleDeckCards: sample.cards, sampleDeckMechanics: sample.mechanics ?? [], ai: config,
    metaSourceUrl: snapshot.sourceUrl, metaPeriod: snapshot.period,
    metaFetchedAt: snapshot.fetchedAt, opponentSourceUrl: opponent.url,
    tournamentEvidence: evidence, aiQueries }
}

async function enrichOpponentCards(snapshot: MetaSnapshot, opponent: MetaDeck): Promise<void> {
  if (!catalogStore || catalogSyncing) return
  const preview = currentMatchupEvidence(snapshot, opponent)
  const catalog = catalogStore.view()
  const prints = catalog.prints
  const codes = new Map(catalog.sets.flatMap((set) =>
    set.abbreviation ? [[set.id, set.abbreviation.toUpperCase()] as const] : []))
  const names = new Set(preview.observedCards.map((card) => card.name.toLocaleLowerCase()))
  const exactIds = preview.sampleLists.flatMap((sample) => sample.cards ?? []).flatMap((line) => {
    const match = /^(?:\d+)\s+(.+)\s+([A-Z0-9.]+)\s+([A-Z0-9]+)$/i.exec(line)
    if (!match || !names.has(match[1].toLocaleLowerCase())) return []
    const matches = prints.filter((candidate) => candidate.name.toLocaleLowerCase() === match[1].toLocaleLowerCase() &&
      (codes.get(candidate.setId) ?? OFFICIAL_SET_CODES[candidate.setId]) === match[2].toUpperCase() &&
      candidate.localId.replace(/^0+/, '') === match[3].replace(/^0+/, ''))
    return matches.length === 1 ? [matches[0].id] : []
  })
  const fallbackIds = preview.observedCards.filter((card) => !card.gameplay).flatMap((card) => {
    const print = prints.find((candidate) => candidate.name.toLocaleLowerCase() === card.name.toLocaleLowerCase() &&
      candidate.detailAt !== null && candidate.gameplaySchemaVersion !== 1)
    return print ? [print.id] : []
  })
  try { await enrichCatalogPrints(catalogStore, [...new Set([...exactIds, ...fallbackIds])]) }
  catch { /* The evidence packet keeps each remaining mechanics gap explicit. */ }
}

async function opponentSampleWithMechanics(sample: { url: string | null; cards: string[] },
  evidence: MatchupTournamentEvidence): Promise<{
  url: string | null; cards: string[]; mechanics: { name: string; text: string; sourceUrl: string }[]
}> {
  if (!catalogStore || catalogSyncing) return { ...sample, mechanics: [] }
  const names = [...new Set(sample.cards.map((line) => line.replace(/^\d+\s+/, '').trim()).filter(Boolean))].slice(0, 60)
  const initial = catalogStore.view().prints
  const ids = names.flatMap((name) => {
    const print = initial.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
      item.detailAt !== null && !item.gameplay)
    return print ? [print.id] : []
  })
  try { await enrichCatalogPrints(catalogStore, ids) }
  catch { /* The prompt receives only the mechanics actually present after this attempt. */ }
  const catalog = catalogStore.view()
  const prints = catalog.prints
  const mechanics = names.flatMap((name) => {
    const observed = evidence.observedCards.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    if (observed?.gameplay && observed.cardSourceUrl) return [{ name,
      text: observed.gameplay, sourceUrl: observed.cardSourceUrl }]
    const comparable = prints.filter((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.gameplay)
    const summaries = new Set(comparable.map((item) => {
      const effective = effectiveCardGameplay(item, localCalendarDate(), catalog.rulePackage)
      return effective.effective ? gameplaySummary(effective.effective, item) : ''
    }))
    return summaries.size === 1 && comparable[0]
      ? [{ name, text: [...summaries][0], sourceUrl: comparable[0].sourceUrl }] : []
  })
  return { ...sample, mechanics }
}

function withStore<T>(operation: () => T): OperationResult<T> {
  if (!projectStore) {
    return { ok: false, error: unavailableMessage() }
  }
  try {
    return { ok: true, value: operation() }
  } catch (error) {
    console.error('Errore archivio progetti:', error)
    const message = error instanceof Error ? error.message : ''
    if ([
      'Dati del progetto non validi.',
      'Inserisci un nome da 1 a 120 caratteri.',
      'Progetto non trovato.',
      'Inserisci una lista di testo non vuota, fino a 200.000 caratteri.',
      'Origine della lista non valida.',
      'Seleziona un file .txt.',
      'La lista contiene troppe righe (massimo 5.000).',
      'La lista è cambiata durante l’analisi. Riprova sulla lista corrente.',
      'Lo snapshot del metagame non è più disponibile.'
    ].includes(message)) {
      return { ok: false, error: message }
    }
    return { ok: false, error: 'Operazione non salvata. Controlla l’archivio locale e riprova.' }
  }
}

function registerProjectHandlers(): void {
  registerHandler('diagnostics:ui-long-task', (duration: unknown): void => {
    if (typeof duration !== 'number' || !Number.isFinite(duration) ||
      duration < 50 || duration > 60_000) return
    uiLongTasks.push({ at: new Date().toISOString(), durationMs: duration })
    if (uiLongTasks.length > 50) uiLongTasks.shift()
  })

  registerHandler('diagnostics:export', async (): Promise<OperationResult<{ saved: boolean; fileName?: string }>> => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    const fileName = `Pokeguru-diagnostica-${stamp}.json`
    try {
      const choice = await callHost('save-dialog', {
        title: 'Esporta diagnostica', defaultPath: join(backendContext.downloads, fileName),
        filters: [{ name: 'Diagnostica JSON', extensions: ['json'] }]
      }) as { canceled: boolean; filePath?: string }
      if (choice.canceled || !choice.filePath) return { ok: true, value: { saved: false } }
      const start = performance.now()
      const unavailableSections: string[] = []
      const collect = <T>(name: string, read: () => T): T | null => {
        try { return read() } catch { unavailableSections.push(name); return null }
      }
      const databasePath = join(backendContext.userData, 'data', 'pokeguru.sqlite')
      const size = (path: string): number | null => {
        try { return statSync(path).size } catch { return null }
      }
      const projects = collect('projects', () => projectStore
        ? { active: projectStore.list().length, archived: projectStore.listArchived().length } : null)
      const catalog = collect('catalog', () => {
        if (!catalogStore) return null
        const overview = catalogStore.browseOverview()
        return { sets: overview.sets.length, prints: overview.stats.acquired,
          groups: overview.stats.groups, thumbnails: overview.stats.thumbnails,
          highImages: overview.stats.highImages, missingImages: overview.stats.imageCacheMissing,
          syncedAt: overview.syncedAt, coverageExpected: overview.standardCoverage?.expected ?? null,
          coverageAcquired: overview.standardCoverage?.acquired ?? null }
      })
      const events = collect('events', () => tournamentStore
        ? { play: tournamentStore.summaries().length, regional: tournamentStore.mainSummaries().length } : null)
      const catalogSync = collect('catalogSync', () => catalogStore ? catalogJobStatus(catalogStore) : null)
      const playSync = collect('playSync', () => playTournamentJob?.status() ?? null)
      const mainSync = collect('mainSync', () => mainTournamentJob?.status() ?? null)
      const jobs = collect('aiJobs', () => aiJobStore?.recent(30) ?? null)
      const runtime = await callHost('runtime-metrics', null) as { mainHeapBytes: number }
      const report = buildDiagnosticReport({
        generatedAt: new Date().toISOString(), version: backendContext.version, packaged: backendContext.packaged,
        platform: process.platform, architecture: process.arch,
        electron: backendContext.electron, chrome: backendContext.chrome,
        node: process.versions.node, uptimeSeconds: process.uptime(),
        mainHeapBytes: runtime.mainHeapBytes, backendHeapBytes: process.memoryUsage().heapUsed,
        database: { available: !!projectStore, issue: storageIssue,
          bytes: size(databasePath), walBytes: size(`${databasePath}-wal`) },
        projects, catalog, events, catalogSync, playSync, mainSync,
        daily: { catalog: collect('dailyCatalog', () => dailySyncStore?.read('catalog') ?? null),
          play: collect('dailyPlay', () => dailySyncStore?.read('play') ?? null),
          main: collect('dailyMain', () => dailySyncStore?.read('main') ?? null) },
        jobs, jobRuntime: Object.fromEntries((jobs ?? []).map((job) => {
          const controller = activeAiControllers.get(job.id)
          return [job.id, { controllerActive: !!controller,
            callActive: !!controller && job.progress?.diagnostics?.calls?.at(-1)?.status === 'running',
            abortRequested: controller?.signal.aborted ?? false,
            resultFilePresent: existsSync(join(aiArtifactDirectory(job.id), 'result.json')),
            ...aiJobStore!.runtimeFacts(job.id) }]
        })), uiLongTasks, incidents: runtimeIncidents,
        collectionMs: performance.now() - start, unavailableSections
      })
      await writeFile(choice.filePath, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
      return { ok: true, value: { saved: true, fileName: choice.filePath.split(/[\\/]/).pop() ?? fileName } }
    } catch { return { ok: false, error: 'Esportazione non riuscita. Scegli un’altra cartella e riprova.' } }
  })

  registerHandler('tournament:get', (): OperationResult<TournamentSnapshot | null> => {
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.latest() } }
    catch { return { ok: false, error: 'Evento salvato non leggibile.' } }
  })

  registerHandler('tournament:refresh', async (): Promise<OperationResult<TournamentSnapshot>> => {
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.save(await fetchRecentWesternTournament()) } }
    catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Evento Limitless Play non disponibile.' }
    }
  })

  registerHandler('tournament:list', (): OperationResult<TournamentSummary[]> => {
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.summaries() } }
    catch { return { ok: false, error: 'Archivio tornei non leggibile.' } }
  })

  registerHandler('tournament:get-event', (eventId: unknown): OperationResult<TournamentSnapshot | null> => {
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    if (typeof eventId !== 'string' || !/^[a-f0-9]{24}$/.test(eventId))
      return { ok: false, error: 'ID evento non valido.' }
    try { return { ok: true, value: tournamentStore.getEvent(eventId) } }
    catch { return { ok: false, error: 'Evento salvato non leggibile.' } }
  })

  registerHandler('tournament:sync-status', (): OperationResult<TournamentSyncProgress> => {
    if (!playTournamentJob) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: { ...playTournamentJob.status(), daily: dailySyncStore?.read('play') } } }
    catch { return { ok: false, error: 'Stato aggiornamento tornei non leggibile.' } }
  })

  registerHandler('tournament:sync', (mode: unknown): OperationResult<TournamentSyncProgress> => {
    if (!playTournamentJob) return { ok: false, error: unavailableMessage() }
    if (mode !== 'new' && mode !== 'full') return { ok: false, error: 'Modalità aggiornamento non valida.' }
    try {
      if (!playTournamentJob.status().active) dailySyncStore?.started('play')
      return { ok: true, value: { ...playTournamentJob.start(mode), daily: dailySyncStore?.read('play') } }
    }
    catch (error) {
      dailySyncStore?.failed('play', error instanceof Error ? error.message : 'Aggiornamento tornei non riuscito.')
      return { ok: false, error: error instanceof Error ? error.message : 'Aggiornamento tornei non riuscito.' }
    }
  })

  registerHandler('tournament:sync-pause', (): OperationResult<TournamentSyncProgress> => {
    if (!playTournamentJob) return { ok: false, error: unavailableMessage() }
    if (!playTournamentJob.status().active) return { ok: false, error: 'Nessuna scansione da mettere in pausa.' }
    try {
      const value = playTournamentJob.pause()
      dailySyncStore?.paused('play')
      return { ok: true, value: { ...value, daily: dailySyncStore?.read('play') } }
    }
    catch { return { ok: false, error: 'Pausa tornei non riuscita.' } }
  })

  registerHandler('tournament:main-list', (): OperationResult<MainTournamentSummary[]> => {
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.mainSummaries() } }
    catch { return { ok: false, error: 'Archivio Regional non leggibile.' } }
  })

  registerHandler('tournament:main-get', (eventId: unknown): OperationResult<MainTournamentSnapshot | null> => {
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    if (typeof eventId !== 'string' || !/^\d{1,10}$/.test(eventId)) return { ok: false, error: 'ID Regional non valido.' }
    try { return { ok: true, value: tournamentStore.getMain(eventId) } }
    catch { return { ok: false, error: 'Regional salvato non leggibile.' } }
  })

  registerHandler('tournament:main-sync-status', (): OperationResult<MainTournamentSyncProgress> => {
    if (!mainTournamentJob) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: { ...mainTournamentJob.status(), daily: dailySyncStore?.read('main') } } }
    catch { return { ok: false, error: 'Stato Regional non leggibile.' } }
  })

  registerHandler('tournament:main-sync', (mode: unknown): OperationResult<MainTournamentSyncProgress> => {
    if (!mainTournamentJob) return { ok: false, error: unavailableMessage() }
    if (mode !== 'new' && mode !== 'full') return { ok: false, error: 'Modalità Regional non valida.' }
    try {
      if (!mainTournamentJob.status().active) dailySyncStore?.started('main')
      return { ok: true, value: { ...mainTournamentJob.start(mode), daily: dailySyncStore?.read('main') } }
    }
    catch (error) {
      dailySyncStore?.failed('main', error instanceof Error ? error.message : 'Aggiornamento Regional non riuscito.')
      return { ok: false, error: error instanceof Error ? error.message : 'Aggiornamento Regional non riuscito.' }
    }
  })

  registerHandler('tournament:main-sync-pause', (): OperationResult<MainTournamentSyncProgress> => {
    if (!mainTournamentJob) return { ok: false, error: unavailableMessage() }
    if (!mainTournamentJob.status().active) return { ok: false, error: 'Nessuna scansione da mettere in pausa.' }
    try {
      const value = mainTournamentJob.pause()
      dailySyncStore?.paused('main')
      return { ok: true, value: { ...value, daily: dailySyncStore?.read('main') } }
    }
    catch { return { ok: false, error: 'Pausa Regional non riuscita.' } }
  })

  registerHandler('tournament:open-main-source', async (input: unknown): Promise<OperationResult<boolean>> => {
    if (typeof input !== 'string' || input.length > 300)
      return { ok: false, error: 'URL Regional non valido.' }
    try {
      const url = new URL(input)
      if (url.protocol !== 'https:' || url.hostname !== 'limitlesstcg.com' ||
        !/^\/(tournaments|decks\/list)\/\d+$/.test(url.pathname))
        return { ok: false, error: 'URL Regional non consentito.' }
      await callHost('open-external', url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Fonte Regional non apribile.' } }
  })

  registerHandler('tournament:open-source', async (input: unknown): Promise<OperationResult<boolean>> => {
    if (typeof input !== 'string' || input.length > 300)
      return { ok: false, error: 'URL evento non valido.' }
    try {
      const url = new URL(input)
      if (url.protocol !== 'https:' || url.hostname !== 'play.limitlesstcg.com' ||
        !/^\/tournament\/[a-f0-9]{24}$/.test(url.pathname) || url.search || url.hash)
        return { ok: false, error: 'URL evento non valido.' }
      await callHost('open-external', url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire l’evento nel browser.' } }
  })

  registerHandler('catalog:get', (): OperationResult<CatalogView> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: catalogStore.view() } }
    catch { return { ok: false, error: 'Catalogo locale non disponibile.' } }
  })

  registerHandler('catalog:browse-overview', (): OperationResult<CatalogBrowseOverview> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: catalogStore.browseOverview() } }
    catch { return { ok: false, error: 'Catalogo locale non disponibile.' } }
  })

  registerHandler('catalog:search', (query: unknown, setId: unknown,
    offset: unknown): OperationResult<CatalogBrowsePage> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (typeof query !== 'string' || query.length > 200 || query.includes('\0') ||
      typeof setId !== 'string' || (setId !== 'all' && !/^[a-zA-Z0-9.]{1,20}$/.test(setId)) ||
      !Number.isInteger(offset) || (offset as number) < 0 || (offset as number) > 1_000_000) {
      return { ok: false, error: 'Ricerca catalogo non valida.' }
    }
    try { return { ok: true, value: catalogStore.browseSearch(query, setId, offset as number) } }
    catch { return { ok: false, error: 'Ricerca catalogo non disponibile.' } }
  })

  registerHandler('catalog:advanced-search', async (input: unknown):
    Promise<OperationResult<CatalogAdvancedSearchSummary>> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    const value = input as Partial<CatalogAdvancedSearchInput> | null
    if (!value || typeof value !== 'object' || typeof value.query !== 'string' ||
      value.query.trim().length < 4 || value.query.length > 500 || value.query.includes('\0') ||
      value.selectedKey !== null && (typeof value.selectedKey !== 'string' ||
        value.selectedKey.length > 150 || value.selectedKey.includes('\0')) ||
      value.projectId !== null && (typeof value.projectId !== 'string' ||
        value.projectId.length > 100 || value.projectId.includes('\0'))) {
      return { ok: false, error: 'Domanda di ricerca non valida.' }
    }
    if (activeCatalogAdvancedSearch) return { ok: false, error: 'Una ricerca avanzata è già in corso.' }
    const controller = new AbortController()
    activeCatalogAdvancedSearch = controller
    try {
      const catalog = catalogStore.view()
      if (!catalog.syncedAt || !catalog.prints.length) throw new Error('Aggiorna il Catalogo prima della ricerca avanzata.')
      const selected = value.selectedKey ? catalogStore.browseGroup(value.selectedKey)?.prints ?? [] : []
      const deckRequested = questionUsesCurrentDeck(value.query)
      let deckText: string | null = null
      if (deckRequested) {
        const project = value.projectId ? projectStore?.get(value.projectId) : null
        if (!project || project.circuit !== 'WESTERN')
          throw new Error('Seleziona un progetto occidentale per cercare nel tuo mazzo.')
        const baseline = projectStore!.getBaseline(project.id)
        if (!baseline) throw new Error('Il progetto selezionato non ha ancora una lista.')
        deckText = baseline.rawText
      }
      if (/\b(?:questa carta|carta selezionata|this card)\b/i.test(value.query) && !selected.length)
        throw new Error('Seleziona prima una carta del Catalogo.')
      const config = await runConfig()
      const result = await searchCatalogAdvanced(catalog, value.query.trim(),
        { selected, deckText, events: catalogAdvancedEvents(value.query, catalog) },
        config, controller.signal)
      const id = randomUUID()
      catalogAdvancedResults.set(id, result)
      if (catalogAdvancedResults.size > 5) catalogAdvancedResults.delete(catalogAdvancedResults.keys().next().value!)
      return { ok: true, value: { id, query: result.query,
        interpretation: result.interpretation, searchedAt: result.searchedAt,
        catalogSyncedAt: result.catalogSyncedAt, scope: result.scope,
        page: advancedCatalogPage(result.matches, 'all', 0) } }
    } catch (error) { return { ok: false, error: aiError(error) } }
    finally { if (activeCatalogAdvancedSearch === controller) activeCatalogAdvancedSearch = null }
  })

  registerHandler('catalog:advanced-page', (id: unknown, setId: unknown,
    offset: unknown): OperationResult<CatalogAdvancedPage> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) ||
      typeof setId !== 'string' || (setId !== 'all' && !/^[a-zA-Z0-9.]{1,20}$/.test(setId)) ||
      !Number.isInteger(offset) || (offset as number) < 0 || (offset as number) > 1_000_000)
      return { ok: false, error: 'Pagina della ricerca non valida.' }
    const stored = catalogAdvancedResults.get(id)
    if (!stored) return { ok: false, error: 'La ricerca è scaduta. Ripeti la ricerca.' }
    return { ok: true, value: advancedCatalogPage(stored.matches, setId, offset as number) }
  })

  registerHandler('catalog:advanced-cancel', (): OperationResult<boolean> => {
    activeCatalogAdvancedSearch?.abort()
    return { ok: true, value: true }
  })

  registerHandler('catalog:group', (key: unknown): OperationResult<{
    group: CatalogBrowseGroup; prints: CatalogPrint[] } | null> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (typeof key !== 'string' || key.length > 150 || key.includes('\0'))
      return { ok: false, error: 'Carta catalogo non valida.' }
    try { return { ok: true, value: catalogStore.browseGroup(key) } }
    catch { return { ok: false, error: 'Dettaglio carta non disponibile.' } }
  })

  registerHandler('catalog:print', (id: unknown): OperationResult<CatalogPrint | null> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (typeof id !== 'string' || !/^[a-zA-Z0-9.-]{1,100}$/.test(id))
      return { ok: false, error: 'Stampa non valida.' }
    try { return { ok: true, value: catalogStore.getPrint(id) } }
    catch { return { ok: false, error: 'Dettaglio stampa non disponibile.' } }
  })

  function validCardPreviewLookup(value: unknown): value is CardPreviewLookup {
    const input = value as Partial<CardPreviewLookup> | null
    return !!input && typeof input.name === 'string' && input.name.length >= 1 && input.name.length <= 150 &&
      ![input.name, input.printId, input.identityId, input.setCode, input.cardNumber].some((part) =>
        part != null && (typeof part !== 'string' || part.length > 150 || part.includes('\0'))) &&
      (input.printId == null || /^[a-zA-Z0-9.-]{1,100}$/.test(input.printId)) &&
      (input.setCode == null || /^[a-zA-Z0-9.]{1,20}$/.test(input.setCode)) &&
      (input.cardNumber == null || /^[a-zA-Z0-9/.-]{1,20}$/.test(input.cardNumber))
  }

  registerHandler('catalog:card-preview', (value: unknown): OperationResult<CardPreviewData> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (!validCardPreviewLookup(value))
      return { ok: false, error: 'Carta non valida.' }
    try { return { ok: true, value: catalogStore.cardPreview(value) } }
    catch { return { ok: false, error: 'Anteprima non disponibile.' } }
  })

  registerHandler('catalog:card-previews', (value: unknown): OperationResult<CardPreviewData[]> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (!Array.isArray(value) || value.length > 120 || !value.every(validCardPreviewLookup))
      return { ok: false, error: 'Lista carte non valida.' }
    try { return { ok: true, value: value.map((lookup) => catalogStore!.cardPreview(lookup)) } }
    catch { return { ok: false, error: 'Immagini locali non disponibili.' } }
  })

  registerHandler('catalog:sync', async (): Promise<OperationResult<CatalogView>> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (catalogSyncing) return { ok: false, error: 'Sincronizzazione già in corso.' }
    if (catalogStore.scopeKind() === 'standard-marks') return { ok: false, error: 'Usa Aggiorna catalogo Standard.' }
    catalogSyncing = true
    try { return { ok: true, value: catalogStore.save(await fetchCatalogSample()) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Sincronizzazione non riuscita.' } }
    finally { catalogSyncing = false }
  })

  registerHandler('catalog:sync-status', (): OperationResult<CatalogSyncStatus> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    return { ok: true, value: catalogJobStatus(catalogStore) }
  })

  registerHandler('catalog:sync-standard', (mode: unknown): OperationResult<CatalogSyncStatus> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (mode !== 'new' && mode !== 'full') return { ok: false, error: 'Modalità catalogo non valida.' }
    if (catalogSyncing) return { ok: false, error: 'Sincronizzazione già in corso.' }
    const status = catalogStore.jobStatus()
    if (['paused', 'interrupted', 'rate-limited'].includes(status.state) && status.mode !== mode)
      return { ok: false, error: 'Completa o annulla l’aggiornamento recuperabile prima di cambiare modalità.' }
    if (catalogRetryTimer) { clearTimeout(catalogRetryTimer); catalogRetryTimer = null }
    dailySyncStore?.started('catalog')
    runCatalogJob(mode)
    return { ok: true, value: catalogJobStatus(catalogStore) }
  })

  registerHandler('catalog:pause', (): OperationResult<CatalogSyncStatus> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    const status = catalogStore.jobStatus()
    if (status.state !== 'running' && status.state !== 'rate-limited')
      return { ok: false, error: 'Nessun aggiornamento da mettere in pausa.' }
    if (catalogRetryTimer) { clearTimeout(catalogRetryTimer); catalogRetryTimer = null }
    catalogStore.pauseJob(null, 'In pausa su richiesta')
    dailySyncStore?.paused('catalog')
    catalogJobController?.abort()
    return { ok: true, value: catalogJobStatus(catalogStore) }
  })

  registerHandler('catalog:cancel', (): OperationResult<CatalogSyncStatus> => {
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    const status = catalogStore.jobStatus()
    if (!['running', 'rate-limited', 'paused', 'interrupted'].includes(status.state))
      return { ok: false, error: 'Nessun aggiornamento da annullare.' }
    if (catalogRetryTimer) { clearTimeout(catalogRetryTimer); catalogRetryTimer = null }
    catalogStore.cancelJob()
    dailySyncStore?.cancelled('catalog')
    catalogJobController?.abort()
    return { ok: true, value: catalogJobStatus(catalogStore) }
  })

  registerHandler('catalog:open-source', async (input: unknown): Promise<OperationResult<boolean>> => {
    if (typeof input !== 'string') return { ok: false, error: 'URL non valido.' }
    try {
      const url = new URL(input)
      if (url.protocol !== 'https:' || url.hostname !== 'api.tcgdex.net' ||
        !/^\/v2\/en\/(cards|sets)\/[a-zA-Z0-9.-]+$/.test(url.pathname) || url.search || url.hash) {
        return { ok: false, error: 'URL non valido.' }
      }
      await callHost('open-external', url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire TCGdex nel browser.' } }
  })

  registerHandler('standard:open-source', async (sourceId: unknown): Promise<OperationResult<boolean>> => {
    if (typeof sourceId !== 'string') return { ok: false, error: 'Fonte non valida.' }
    const sourceUrl = sourceId === 'construction' ? DECK_CONSTRUCTION_SOURCE
      : sourceId === 'promo' ? PROMO_LEGALITY_SOURCE
      : sourceId === 'ace-spec' ? ACE_SPEC_SOURCE
      : sourceId === 'set-releases' ? OFFICIAL_SET_RELEASE_SOURCE
      : sourceId === 'set-admission' ? SET_ADMISSION_RULE_SOURCE
      : sourceId === 'set-admission-older' ? SET_ADMISSION_OLDER_RULE_SOURCE
      : sourceId === 'standard-bans' ? BUNDLED_WESTERN_RULE_PACKAGE.standardBans.sourceUrl
      : sourceId === 'errata' ? BUNDLED_WESTERN_RULE_PACKAGE.errata.sourceUrl
      : WESTERN_ROTATION_RULES.find((item) => item.version === sourceId)?.sourceUrl
    if (!sourceUrl) return { ok: false, error: 'Fonte non valida.' }
    try {
      await callHost('open-external', sourceUrl)
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire la fonte Play! Pokémon.' } }
  })

  registerHandler('standard:get-rule-audit', (): OperationResult<StandardRuleAudit | null> => {
    return withStore(() => projectStore!.getStandardRuleAudit())
  })

  registerHandler('standard:check-rule-sources', async (): Promise<OperationResult<StandardRuleAudit>> => {
    const previous = withStore(() => projectStore!.getStandardRuleAudit())
    if (!previous.ok) return previous
    const audit = await auditStandardRuleSources(previous.value)
    return withStore(() => { projectStore!.saveStandardRuleAudit(audit); return audit })
  })

  registerHandler('ai:get-preferences', (): OperationResult<AiPreferences> => {
    if (!aiPreferencesStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: aiPreferencesStore.read() } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('ai:get-connection', async (): Promise<OperationResult<AiConnection>> => {
    try { return { ok: true, value: await codexControl.connection() } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('ai:setup-status', async (): Promise<OperationResult<CodexSetupStatus>> => {
    try { return { ok: true, value: await codexSetup.status() } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('ai:save-preferences', async (value: unknown): Promise<OperationResult<AiPreferences>> => {
    if (!aiPreferencesStore) return { ok: false, error: unavailableMessage() }
    try {
      const models = value && typeof value === 'object' && (value as AiPreferences).model === null
        ? [] : await codexControl.models()
      const valid = resolveAiConfig(value, models, 'global')
      return { ok: true, value: aiPreferencesStore.write({ model: valid.model, reasoningEffort: valid.reasoningEffort }) }
    } catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('ai:start-login', async (mode: unknown): Promise<OperationResult<AiLoginStart>> => {
    if (mode !== 'browser' && mode !== 'device') return { ok: false, error: 'Modalità di accesso non valida.' }
    try {
      const result = await codexControl.startLogin(mode)
      await callHost('open-external', result.url)
      if (result.mode === 'device') return { ok: true, value: { mode: 'device',
        verificationUrl: result.verificationUrl, userCode: result.userCode } }
      return { ok: true, value: { mode: 'browser' } }
    } catch (error) {
      await codexControl.cancelLogin().catch(() => undefined)
      return { ok: false, error: aiError(error) }
    }
  })

  registerHandler('ai:login-progress', (): OperationResult<AiLoginProgress> => {
    return { ok: true, value: codexControl.loginProgress() }
  })

  registerHandler('ai:cancel-login', async (): Promise<OperationResult<boolean>> => {
    try { await codexControl.cancelLogin(); return { ok: true, value: true } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('ai:logout', async (): Promise<OperationResult<boolean>> => {
    try { await codexControl.logout(); return { ok: true, value: true } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('ai:test', async (): Promise<OperationResult<boolean>> => {
    try { await testCodex(await runConfig()); return { ok: true, value: true } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('projects:list', (): OperationResult<Project[]> => {
    return withStore(() => projectStore!.list())
  })

  registerHandler('projects:list-archived', (): OperationResult<Project[]> => {
    return withStore(() => projectStore!.listArchived())
  })

  registerHandler('projects:get', (id: unknown): OperationResult<Project | null> => {
    return withStore(() => projectStore!.get(id as string))
  })

  registerHandler('projects:create', (input: unknown): OperationResult<Project> => {
    return withStore(() => projectStore!.create(input as Parameters<ProjectStore['create']>[0]))
  })

  function projectHasActiveAiJob(id: string): boolean {
    return Boolean(aiJobStore?.recoverable().some((job) => job.projectId === id)) ||
      generatingProjects.has(id) || Boolean(projectStore?.listDeckThreadSummaries(id).some((thread) => generatingDeckThreads.has(thread.id)))
  }

  registerHandler('projects:archive', (id: unknown): OperationResult<Project> => {
    if (typeof id !== 'string') return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore?.get(id)) return { ok: false, error: 'Progetto attivo non trovato.' }
    if (projectHasActiveAiJob(id)) return { ok: false, error: 'Attendi o annulla il job AI prima di archiviare il progetto.' }
    return withStore(() => projectStore!.archive(id))
  })

  registerHandler('projects:restore', (id: unknown): OperationResult<Project> => {
    if (typeof id !== 'string') return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.restore(id))
  })

  registerHandler('projects:delete-archived', (id: unknown, confirmationName: unknown): OperationResult<boolean> => {
    if (typeof id !== 'string' || typeof confirmationName !== 'string')
      return { ok: false, error: 'Richiesta non autorizzata.' }
    if (generatingProjects.has(id) || Boolean(aiJobStore?.recoverable().some((job) => job.projectId === id)))
      return { ok: false, error: 'Attendi o annulla il job AI prima di cancellare il progetto.' }
    const result = withStore(() => projectStore!.deleteArchived(id, confirmationName))
    if (!result.ok) return result
    for (const jobId of result.value) {
      try { clearAiArtifacts(jobId) }
      catch (error) { console.warn('Pulizia dei file temporanei AI da completare:', jobId, error) }
    }
    return { ok: true, value: true }
  })

  registerHandler('projects:get-baseline', (projectId: unknown): OperationResult<DeckBaseline | null> => {
    return withStore(() => projectStore!.getBaseline(projectId as string))
  })

  registerHandler('projects:import-deck', (input: unknown): OperationResult<DeckBaseline> => {
    return withStore(() => projectStore!.importDeck(input as ImportDeckInput))
  })

  registerHandler('deck:list-versions', (projectId: unknown): OperationResult<DeckVersion[]> => {
    return withStore(() => projectStore!.listDeckVersions(projectId as string))
  })

  registerHandler('deck:annotate-version', (input: unknown): OperationResult<DeckVersion> => {
    return withStore(() => projectStore!.annotateDeckVersion(input as AnnotateDeckVersionInput))
  })

  registerHandler('deck:restore-version', (input: unknown): OperationResult<DeckBaseline> => {
    return withStore(() => projectStore!.restoreDeckVersion(input as RestoreDeckVersionInput))
  })

  registerHandler('deck:list-threads', (projectId: unknown): OperationResult<DeckThread[]> => {
    return withStore(() => projectStore!.listDeckThreads(projectId as string))
  })

  registerHandler('deck:list-thread-summaries', (projectId: unknown): OperationResult<DeckThreadSummary[]> => {
    if (typeof projectId !== 'string') return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listDeckThreadSummaries(projectId))
  })

  registerHandler('deck:get-thread', (projectId: unknown, threadId: unknown): OperationResult<DeckThread | null> => {
    if (typeof projectId !== 'string' || typeof threadId !== 'string')
      return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.getDeckThread(projectId, threadId))
  })

  registerHandler('deck:get-thread-window', (projectId: unknown, threadId: unknown): OperationResult<DeckThread | null> => {
    if (typeof projectId !== 'string' || typeof threadId !== 'string')
      return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.getDeckThreadWindow(projectId, threadId))
  })

  registerHandler('deck:get-thread-before', (projectId: unknown, threadId: unknown,
    cursor: unknown): OperationResult<DeckThreadMessagePage> => {
    if (typeof projectId !== 'string' || typeof threadId !== 'string' ||
      !cursor || typeof cursor !== 'object') return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.getDeckThreadMessagesBefore(projectId, threadId, cursor as DeckThreadMessageCursor))
  })

  function validAiResource(projectId: unknown, resourceId: unknown): projectId is string {
    if (!projectStore || typeof projectId !== 'string' || typeof resourceId !== 'string' ||
      !projectStore.get(projectId)) return false
    return resourceId === `matchup:${projectId}` || projectStore.hasDeckThread(projectId, resourceId)
  }

  registerHandler('ai:job-status', (projectId: unknown, resourceId: unknown) => {
    if (!aiJobStore || !validAiResource(projectId, resourceId))
      return { ok: false, error: 'Job AI non disponibile.' }
    return { ok: true, value: aiJobStore.latest(projectId, resourceId as string) }
  })

  registerHandler('ai:job-activity', (projectId: unknown, resourceId: unknown,
    jobId: unknown, before: unknown) => {
    if (!aiJobStore || !validAiResource(projectId, resourceId) ||
      typeof jobId !== 'string' || before !== undefined && typeof before !== 'number')
      return { ok: false, error: 'Attività Codex non disponibile.' }
    const page = aiJobStore.activity(projectId, resourceId as string, jobId, before as number | undefined)
    return page ? { ok: true, value: page } : { ok: false, error: 'Attività Codex non disponibile.' }
  })

  registerHandler('ai:evidence-page', (projectId: unknown, resourceId: unknown,
    jobId: unknown, searchKey: unknown, sequence: unknown): OperationResult<AiEvidenceQueryResult | null> => {
    if (!aiJobStore || typeof projectId !== 'string' || typeof resourceId !== 'string' ||
      typeof jobId !== 'string' || typeof searchKey !== 'string' || typeof sequence !== 'number')
      return { ok: false, error: 'Richiesta non autorizzata.' }
    const job = aiJobStore.get(jobId)
    if (!job || job.projectId !== projectId || job.resourceId !== resourceId)
      return { ok: false, error: 'Prove non appartenenti al progetto.' }
    try {
      const archive = new AiEvidenceArchive(aiJobStore.filePath, job, true)
      try { return { ok: true, value: archive.page(searchKey, sequence) } }
      finally { archive.close() }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Prove non disponibili.' } }
  })

  registerHandler('ai:recent-jobs', (): OperationResult<AiJobSummary[]> => {
    if (!aiJobStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: aiJobStore.recent() } }
    catch { return { ok: false, error: 'Stato dei job AI non leggibile.' } }
  })

  registerHandler('ai:cancel-job', (projectId: unknown, resourceId: unknown) => {
    if (!aiJobStore || !validAiResource(projectId, resourceId))
      return { ok: false, error: 'Job AI non disponibile.' }
    const latest = aiJobStore.latest(projectId, resourceId as string)
    const job = aiJobStore.active(projectId, resourceId as string) ??
      (latest?.status === 'interrupted' && latest.progress?.diagnostics?.resumable ? latest : null)
    if (!job) return { ok: false, error: 'Nessun job AI da annullare.' }
    aiJobStore.transition(job.id, 'cancelled')
    const controller = activeAiControllers.get(job.id)
    if (controller) {
      controller.abort()
      codexControl.cancelTurn(job.id)
    } else {
      clearAiArtifacts(job.id)
    }
    return { ok: true, value: true }
  })

  registerHandler('ai:pause-job', (projectId: unknown, resourceId: unknown) => {
    if (!aiJobStore || !validAiResource(projectId, resourceId))
      return { ok: false, error: 'Analisi non disponibile.' }
    const job = aiJobStore.active(projectId, resourceId as string) ?? aiJobStore.latest(projectId, resourceId as string)
    if (job?.status === 'interrupted' && job.progress?.diagnostics?.suspensionReason === 'shutdown') {
      aiJobStore.suspend(job.id, 'Analisi in pausa su tua richiesta.', 'user')
      return { ok: true, value: true }
    }
    const controller = job && activeAiControllers.get(job.id)
    if (!job || !controller || !activeAiWork.has(job.id)) return { ok: false, error: 'Analisi non sospendibile.' }
    aiJobStore.recordDiagnostics(job.id, { suspensionReason: 'user' })
    controller.abort('pause')
    return { ok: true, value: true }
  })

  registerHandler('ai:resume-job', async (projectId: unknown, resourceId: unknown) => {
    if (!aiJobStore || !validAiResource(projectId, resourceId))
      return { ok: false, error: 'Analisi non disponibile.' }
    const summary = aiJobStore.latest(projectId, resourceId as string)
    const job = summary && aiJobStore.get(summary.id)
    if (!job || job.status !== 'interrupted' || !job.progress?.diagnostics?.resumable)
      return { ok: false, error: 'Nessuna analisi da riprendere.' }
    try {
      const pending = resumeSavedAiJob(job, true)
      if (!activeAiControllers.has(job.id)) return await pending
      void pending.catch((error) => finishAiJob(job, error))
      return { ok: true, value: true }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Contesto di ripresa non leggibile.' } }
  })

  registerHandler('ai:recover-jobs', async () => {
    await recoverAiJobs()
    return { ok: true, value: true }
  })

  registerHandler('deck:delete-thread', (projectId: unknown, threadId: unknown, title: unknown): OperationResult<boolean> => {
    if (typeof projectId !== 'string' || typeof threadId !== 'string' || typeof title !== 'string')
      return { ok: false, error: 'Conferma di cancellazione non valida.' }
    if (generatingDeckThreads.has(threadId))
      return { ok: false, error: 'Attendi la conclusione dell’analisi o del suo annullamento.' }
    return withStore(() => {
      const jobs = projectStore!.deleteDeckThread(projectId, threadId, title)
      for (const id of jobs) {
        try { clearAiArtifacts(id) } catch { /* Database deletion remains authoritative; orphan files are inert. */ }
      }
      return true
    })
  })

  registerHandler('deck:create-thread', (input: unknown): OperationResult<DeckThread> => {
    return withStore(() => {
      const saved = projectStore!.createDeckThread(input as CreateDeckThreadInput)
      return projectStore!.getDeckThreadWindow(saved.projectId, saved.id)!
    })
  })

  registerHandler('deck:continue-thread', (input: unknown): OperationResult<DeckThread> => {
    return withStore(() => {
      const saved = projectStore!.continueDeckThread(input as ContinueDeckThreadInput)
      return projectStore!.getDeckThreadWindow(saved.projectId, saved.id)!
    })
  })

  registerHandler('deck:add-thread-message', (projectId: unknown, threadId: unknown, message: unknown): OperationResult<DeckThread> => {
    return withStore(() => projectStore!.addDeckThreadMessage(projectId as string,
      threadId as string, message as string, true))
  })

  registerHandler('deck:preview-evidence', (projectId: unknown, threadId: unknown,
    question: unknown): OperationResult<ThreadEvidencePacket> => {
    if (!projectStore || !catalogStore || typeof projectId !== 'string' || typeof threadId !== 'string' ||
      typeof question !== 'string' || !question.trim() || question.length > 5000)
      return { ok: false, error: 'Scrivi prima una domanda o una modifica da valutare.' }
    return withStore(() => {
      const thread = projectStore!.getDeckThread(projectId, threadId)
      if (!thread) throw new Error('Strategia non trovata in questo progetto.')
      const base = thread.baseVersionId
        ? projectStore!.listDeckVersions(projectId).find((version) => version.id === thread.baseVersionId) ?? null : null
      return buildThreadEvidence(thread, base, question.trim(), projectStore!.listConstraints(projectId),
        catalogStore!.view(), tournamentStore?.list() ?? [], tournamentStore?.listMain() ?? [])
    })
  })

  async function askThread(projectId: unknown, threadId: unknown,
    message: unknown, override: unknown, existingUserMessageId: unknown,
    resumedJob?: AiJob): Promise<OperationResult<DeckThread>> {
    if (!projectStore || !catalogStore || !aiJobStore || typeof projectId !== 'string' || typeof threadId !== 'string' ||
      typeof message !== 'string' || !message.trim() || message.trim().length > 5000 || message.includes('\0'))
      return { ok: false, error: 'Scrivi una domanda da 1 a 5.000 caratteri.' }
    const project = projectStore.get(projectId)
    if (!project) return { ok: false, error: 'Progetto non trovato.' }
    if (project.circuit !== 'WESTERN') return { ok: false, error: 'Le sessioni Codex sono disponibili solo per il circuito occidentale.' }
    let thread = projectStore.getDeckThread(projectId, threadId)
    if (!thread) return { ok: false, error: 'Strategia non trovata in questo progetto.' }
    if (existingUserMessageId !== undefined && (typeof existingUserMessageId !== 'string' ||
      thread.openingAiMessageId !== existingUserMessageId ||
      !thread.messages.some((entry) => entry.id === existingUserMessageId &&
        entry.author === 'user' && entry.text === message.trim()) ||
      thread.messages.some((entry) => entry.author === 'assistant')))
      return { ok: false, error: 'Primo messaggio Codex non recuperabile.' }
    if (generatingDeckThreads.has(threadId)) return { ok: false, error: 'Risposta Codex già in corso per questa strategia.' }
    let job: AiJob
    try { job = resumedJob ? aiJobStore.resume(resumedJob.id) : aiJobStore.start('thread-ask', projectId, threadId) }
    catch { return { ok: false, error: 'Esiste già un’analisi Codex per questa strategia.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingDeckThreads.add(threadId)
    try {
      jobProgress(job, 'preparing', 'Preparo il turno e le preferenze Codex.')
      const work = beginAiWork(job, controller, [projectId, threadId, message, override, existingUserMessageId])
      const referenceDate = work.snapshot('reference-date', [], localCalendarDate)
      const config = await pinnedAiConfig(work, override)
      const currentSession = thread.aiSessionRef
      thread = work.snapshot('thread-context', [], () => thread!)
      const constraints = work.snapshot('constraints', [], () => projectStore!.listConstraints(projectId))
      const base = work.snapshot('base', [], () => thread!.baseVersionId
        ? projectStore!.listDeckVersions(projectId).find((version) => version.id === thread!.baseVersionId) ?? null
        : null)
      jobProgress(job, 'catalog', 'Raccolgo la lista e le schede del Catalogo.')
      const { engine, catalog } = createArchivedEvidenceEngine(work.archive, () => {
        const current = catalogStore!.view()
        return { catalog: current, window: currentAiEventWindow(current, undefined, referenceDate),
          play: tournamentStore?.iterate() ?? [], main: tournamentStore?.iterateMain() ?? [] }
      })
      const initialEvidence = work.snapshot('initial-evidence', [],
        () => buildThreadEvidence(thread!, base, message.trim(), constraints, catalog,
          tournamentStore?.iterate() ?? [], tournamentStore?.iterateMain() ?? []))
      await yieldAiPreparation(controller.signal)
      jobProgress(job, 'events', 'Collego le liste e i risultati degli Eventi pertinenti.')
      jobProgress(job, 'planning', 'Codex seleziona le ricerche locali utili alla domanda.')
      const queryTrace = await runAiEvidenceQueries(message.trim(), initialEvidence,
        engine, (prompt) => work.run('planning', prompt, config,
          () => planEvidenceQueriesWithCodex(prompt, config, controller.signal,
            jobSummary(job, 'planning', 'Codex sceglie le ricerche pertinenti.'))),
        { archive: work.archive, contextTexts: [thread.title, ...thread.messages.slice(-12).map((item) => item.text),
          base?.rawText ?? '', thread.candidates.at(-1)?.rawText ?? thread.seedCandidateText ?? ''],
        eventContextTexts: thread.messages.slice(-2).map((item) => item.text),
        signal: controller.signal, onTrace: (trace) => work.evidence(trace),
        summarize: (trace) => analyzeLargeEvidence(trace, message.trim(), config, work),
        onRound: (round, queries) => jobProgress(job, 'planning',
          `Ricerca ${round}: ${queries} interrogazioni locali completate.`) })
      await analyzeLargeEvidence(queryTrace, message.trim(), config, work)
      let evidence = threadEvidenceWithQueries(initialEvidence, queryTrace)
      const cwd = join(backendContext.temp, 'pokeguru-codex-deck')
      mkdirSync(cwd, { recursive: true })
      let context = deckThreadPrompt(thread, base, message.trim(),
        constraints, catalog, evidence, referenceDate)
      evidence.promptAudit = makeAiPromptAudit(context.prompt)
      aiJobStore.prepare(job.id, { schemaVersion: 2, validatedDraft: false,
        message: message.trim(), config, evidence,
        sources: context.sources, existingUserMessageId })
      let sessionRef = currentSession ?? thread.aiSessionRef
      let result: Awaited<ReturnType<typeof codexControl.jsonTurn>> | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        jobProgress(job, 'analysis', attempt ? `Codex rielabora la risposta con nuove schede (${attempt + 1}/4).` :
          'Codex elabora la risposta con le prove raccolte.')
        const answerStarted = Date.now()
        result = await work.run('analysis', context.prompt, config, () => codexControl.jsonTurn(sessionRef, cwd, context.prompt, config,
          DECK_THREAD_SCHEMA, { jobId: job.id, jobDirectory: aiArtifactDirectory(job.id),
            signal: controller.signal,
            onSummary: jobSummary(job, 'analysis', 'Codex elabora la risposta con le prove raccolte.'),
            onSessionStarted: (id) => {
              if (!sessionRef) projectStore!.assignDeckAiSession(projectId, threadId, id)
              sessionRef = id
            } }))
        sessionRef = result.sessionId
        evidence.promptAudit = makeAiPromptAudit(context.prompt, Date.now() - answerStarted, result.usage)
        const draft = result.value as { reply?: unknown; rawText?: unknown }
        const added = extendAiEvidenceForText(queryTrace, engine,
          [draft.reply, draft.rawText].filter((part): part is string => typeof part === 'string').join('\n'))
        const focus = engine.cardTargets([draft.reply, draft.rawText].filter((part): part is string => typeof part === 'string').join('\n')).flatMap((target) => target.printIds)
        const needsFocus = !!queryTrace.analysis && focus.some((id) => !queryTrace.focusedPrintIds?.includes(id))
        queryTrace.focusedPrintIds = [...new Set([...(queryTrace.focusedPrintIds ?? []), ...focus])]
        work.evidence(queryTrace)
        if (!added && !needsFocus) break
        if (attempt === 3) throw new Error('La risposta ha introdotto altre carte: completa il recupero delle prove e riprova.')
        await analyzeLargeEvidence(queryTrace, message.trim(), config, work)
        evidence = threadEvidenceWithQueries(initialEvidence, queryTrace)
        context = deckThreadPrompt(thread, base, message.trim(),
          constraints, catalog, evidence, referenceDate)
        evidence.promptAudit = makeAiPromptAudit(context.prompt)
        aiJobStore.prepare(job.id, { schemaVersion: 2, validatedDraft: false,
          message: message.trim(), config, evidence,
          sources: context.sources, existingUserMessageId })
      }
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      jobProgress(job, 'verification', 'Verifico le carte citate e la risposta strutturata.')
      if (!result || queryTrace.cardTargets?.some((target) => target.status === 'not-supplied'))
        throw new Error('Le schede nominate non sono state tutte consegnate a Codex. Riprova l’analisi.')
      const turn = readDeckThreadTurn(result.value, projectId, base, catalog,
        constraints, evidence, context.sources, referenceDate)
      aiJobStore.prepare(job.id, { schemaVersion: 2, validatedDraft: true,
        message: message.trim(), config, evidence, sources: context.sources, existingUserMessageId })
      jobProgress(job, 'saving', 'Salvo la risposta e la candidata nel Thread.')
      aiJobStore.ready(job.id, result)
      const sessionId = result.sessionId
      if (!thread.aiSessionRef) projectStore.assignDeckAiSession(projectId, threadId, sessionId)
      const saved = projectStore.saveDeckAiExchange(projectId, threadId, sessionId,
        message.trim(), turn.answer, result.turnId, config, turn.proposal, evidence, turn.citedSourceIds,
        typeof existingUserMessageId === 'string' ? existingUserMessageId : undefined)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: projectStore.getDeckThreadWindow(saved.projectId, saved.id)! }
    } catch (error) {
      return { ok: false, error: aiError(finishAiJob(job, error)) }
    } finally {
      generatingDeckThreads.delete(threadId)
      activeAiControllers.delete(job.id)
      activeAiWork.get(job.id)?.close()
      activeAiWork.delete(job.id)
    }
  }
  registerHandler('deck:ask-thread', (projectId, threadId, message, override, existingUserMessageId) =>
    askThread(projectId, threadId, message, override, existingUserMessageId))
  resumeRunners.set('thread-ask', (job, args) => askThread(args[0], args[1], args[2], args[3], args[4] ?? undefined, job))

  registerHandler('deck:open-source', async (input: unknown): Promise<OperationResult<boolean>> => {
    if (typeof input !== 'string' || input.length > 300)
      return { ok: false, error: 'URL fonte non valido.' }
    try {
      const url = new URL(input)
      const tcgdex = url.hostname === 'api.tcgdex.net' &&
        /^\/v2\/en(?:\/(?:cards|sets)\/[a-zA-Z0-9.-]+)?$/.test(url.pathname)
      const limitless = url.hostname === 'play.limitlesstcg.com' &&
        /^\/tournament\/[a-f0-9]{24}(?:\/player\/[a-zA-Z0-9_-]+\/decklist)?$/.test(url.pathname)
      const mainTournament = url.hostname === 'limitlesstcg.com' &&
        /^\/(?:tournaments|decks\/list)\/\d+$/.test(url.pathname)
      if (url.protocol !== 'https:' || (!tcgdex && !limitless && !mainTournament) || url.search || url.hash)
        return { ok: false, error: 'URL fonte non valido.' }
      await callHost('open-external', url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire la fonte.' } }
  })

  registerHandler('thread:open-link', async (input: unknown): Promise<OperationResult<boolean>> => {
    const url = safeThreadLink(input)
    if (!url) return { ok: false, error: 'Link non valido: è consentito solo HTTPS.' }
    try {
      await callHost('open-external', url)
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire il link.' } }
  })

  registerHandler('deck:save-candidate', (input: unknown): OperationResult<DeckThread> => {
    return withStore(() => projectStore!.saveDeckCandidate(input as SaveDeckCandidateInput, true))
  })

  registerHandler('deck:adopt-candidate', (input: unknown): OperationResult<DeckBaseline> => {
    return withStore(() => {
      if (!catalogStore || !input || typeof input !== 'object') throw new Error('Catalogo o richiesta non disponibile.')
      const request = input as AdoptDeckCandidateInput
      const thread = projectStore!.getDeckThread(request.projectId, request.threadId)
      const candidate = thread?.candidates.find((item) => item.id === request.candidateId)
      if (!thread || !candidate) throw new Error('Candidata non trovata in questo progetto.')
      const today = localCalendarDate()
      const review = reviewCandidate(request.projectId, candidate, catalogStore.view(),
        projectStore!.listConstraints(request.projectId), today, projectStore!.getStandardRuleAudit())
      if (review.blockers.length) throw new Error(`Adozione bloccata: ${review.blockers.join(' ')}`)
      return projectStore!.adoptDeckCandidate(request)
    })
  })

  function exportFor(input: unknown): DeckExportPreview {
    if (!projectStore || !input || typeof input !== 'object') throw new Error(unavailableMessage())
    const request = input as Partial<DeckExportRequest>
    if (typeof request.projectId !== 'string' || typeof request.importedAt !== 'string') throw new Error('Richiesta export non valida.')
    const project = projectStore.get(request.projectId)
    const baseline = projectStore.getBaseline(request.projectId)
    if (!project || !baseline) throw new Error('Lista corrente non disponibile.')
    if (baseline.importedAt !== request.importedAt) throw new Error('La lista è cambiata. Riapri il progetto prima di esportare.')
    return prepareDeckExport(baseline, catalogStore?.setAbbreviations() ?? {})
  }

  registerHandler('deck:copy-export', async (input: unknown): Promise<OperationResult<string[]>> => {
    try {
      const preview = exportFor(input)
      if (!preview.canExport) throw new Error(preview.notes.find((note) => note.startsWith('Codici TCGdex'))
        ?? 'Correggi le righe non interpretate prima di esportare.')
      await callHost('copy-text', preview.text)
      return { ok: true, value: preview.notes }
    } catch (error) { return { ok: false, error: aiError(error) } }
  })

  registerHandler('deck:get-reconciliation', (projectId: unknown): OperationResult<DeckReconciliation> => {
    return withStore(() => projectStore!.getReconciliation(projectId as string))
  })

  registerHandler('deck:save-line-mapping', (input: unknown): OperationResult<DeckReconciliation> => {
    if (!projectStore || !catalogStore) return { ok: false, error: unavailableMessage() }
    try {
      const value = input as SaveLineMappingInput
      if (projectStore.get(value?.projectId)?.circuit !== 'WESTERN') {
        return { ok: false, error: 'Il catalogo disponibile copre soltanto il circuito occidentale.' }
      }
      const print = catalogStore.getPrint(value?.printId)
      if (!print) return { ok: false, error: 'Stampa non presente nel catalogo locale.' }
      return { ok: true, value: projectStore.saveLineMapping(value, snapshotPrint(print)) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Scelta della stampa non salvata.' }
    }
  })

  registerHandler('deck:clear-line-mapping', (input: unknown): OperationResult<DeckReconciliation> => {
    if (!projectStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: projectStore.clearLineMapping(input as ClearLineMappingInput) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Scelta della stampa non rimossa.' } }
  })

  registerHandler('constraints:list', (projectId: unknown): OperationResult<DeckConstraint[]> => {
    return withStore(() => projectStore!.listConstraints(projectId as string))
  })

  registerHandler('constraints:save', (input: unknown): OperationResult<DeckConstraint> => {
    if (!projectStore || !catalogStore) return { ok: false, error: unavailableMessage() }
    try {
      const value = input as SaveConstraintInput
      if (projectStore.get(value?.projectId)?.circuit !== 'WESTERN')
        throw new Error('Il catalogo disponibile copre soltanto il circuito occidentale.')
      const prints = catalogStore.view().prints.filter((print) =>
        print.identityId === value?.identityId && print.detailAt)
      if (!prints.length || (value.printId && !prints.some((print) => print.id === value.printId)))
        throw new Error('Carta o stampa non presente nel catalogo locale.')
      return { ok: true, value: projectStore.saveConstraint(value, prints[0].name) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Vincolo non salvato.' }
    }
  })

  registerHandler('constraints:delete', (input: unknown): OperationResult<DeckConstraint[]> => {
    if (!projectStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: projectStore.deleteConstraint(input as DeleteConstraintInput) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Vincolo non eliminato.' } }
  })

  registerHandler('matchups:get-meta', async (): Promise<OperationResult<MetaSnapshot>> => {
    if (!projectStore) return { ok: false, error: unavailableMessage() }
    try {
      const snapshot = await fetchMeta()
      projectStore.saveMetaSnapshot(snapshot)
      return { ok: true, value: snapshot }
    } catch (error) {
      const cached = projectStore.getLatestMetaSnapshot()
      if (cached) return { ok: true, value: cached }
      return { ok: false, error: error instanceof Error ? error.message : 'Impossibile leggere il metagame Limitless.' }
    }
  })

  registerHandler('matchups:evidence-preview', (metaId: unknown,
    opponentId: unknown): OperationResult<MatchupTournamentEvidence> => {
    if (!projectStore || !tournamentStore) return { ok: false, error: unavailableMessage() }
    const meta = projectStore.getLatestMetaSnapshot()
    const opponent = meta?.decks.find((item) => item.id === opponentId)
    if (typeof metaId !== 'string' || meta?.id !== metaId || !opponent)
      return { ok: false, error: 'Snapshot Meta non disponibile.' }
    try { return { ok: true, value: currentMatchupEvidence(meta, opponent) } }
    catch { return { ok: false, error: 'Evidenze torneo non leggibili.' } }
  })

  registerHandler('matchups:list-reports', (projectId: unknown, metaId: unknown): OperationResult<MatchupReport[]> => {
    return withStore(() => projectStore!.listMatchupReports(projectId as string, metaId as string))
  })

  registerHandler('matchups:list-discussions', (projectId: unknown, opponentId: unknown): OperationResult<MatchupDiscussion[]> => {
    return withStore(() => projectStore!.listMatchupDiscussions(projectId as string, opponentId as string))
  })

  registerHandler('matchups:list-historical-opponents', (projectId: unknown): OperationResult<MetaDeck[]> => {
    return withStore(() => projectStore!.listHistoricalMatchupOpponents(projectId as string))
  })

  async function generateGuide(projectId: unknown, metaId: unknown, opponentId: unknown,
    override: unknown, resumedJob?: AiJob): Promise<OperationResult<MatchupReport>> {
    if (!projectStore || !aiJobStore) return { ok: false, error: unavailableMessage() }
    if (typeof projectId !== 'string' || typeof metaId !== 'string' || typeof opponentId !== 'string' ||
      !/^\d+$/.test(opponentId) || generatingProjects.has(projectId)) {
      return { ok: false, error: 'Analisi già in corso o richiesta non valida.' }
    }
    let initialSelection: ReturnType<typeof captureMatchupSelection> | undefined
    try { if (!resumedJob) initialSelection = captureMatchupSelection(projectId, metaId, opponentId) }
    catch (error) { return { ok: false, error: aiError(error) } }
    let job: AiJob
    try { job = resumedJob ? aiJobStore.resume(resumedJob.id) : aiJobStore.start('matchup-generate', projectId, `matchup:${projectId}`) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo progetto.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingProjects.add(projectId)
    try {
      jobProgress(job, 'preparing', 'Preparo l’avversario e le preferenze Codex.')
      const work = beginAiWork(job, controller, [projectId, metaId, opponentId, override])
      const selection = work.snapshot('matchup-selection', [],
        () => initialSelection ?? captureMatchupSelection(projectId, metaId, opponentId))
      const { snapshot, opponent, hash, deckVersion } = selection
      const config = await pinnedAiConfig(work, override)
      jobProgress(job, 'catalog', 'Raccolgo le schede delle due liste dal Catalogo.')
      const { evidence, sample, deckContext } = await prepareStableMatchup(work, selection, config)
      jobProgress(job, 'events', 'Collego le liste e i risultati dei tornei.')
      const { trace: aiQueries, engine: queryEngine } = await matchupAiQueries(`Analizza ${opponent.name} contro la nostra lista`,
        deckContext, sample, evidence, config, controller.signal, undefined, job)
      const base = matchupJobBase(job.id, projectId, hash, snapshot, opponent, sample, config,
        evidence, aiQueries, deckVersion)
      let generated: MatchupReport | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        jobProgress(job, 'analysis', attempt ? `Codex rielabora la guida con nuove schede (${attempt + 1}/4).` :
          'Codex costruisce la guida usando lista, schede e tornei.')
        generated = await work.run('analysis', JSON.stringify(['generate-v2', projectId, hash, deckContext, snapshot,
          opponent, sample, evidence, { ...aiQueries, durationMs: 0 }]), config, () => generateMatchup(projectId, hash, deckContext, snapshot, opponent,
          sample, config, evidence, undefined, { jobDirectory: aiArtifactDirectory(job.id),
            signal: controller.signal, aiQueries,
            onPrompt: (audit) => { work.promptBytes(audit.utf8Bytes); aiJobStore!.prepare(job.id,
              { analysisVersion: 2, validatedDraft: false,
                base: { ...base, promptAudit: audit } }) },
            onSummary: jobSummary(job, 'analysis', 'Codex costruisce la guida usando le prove raccolte.') }))
        const added = extendMatchupDraftEvidence(aiQueries, queryEngine, generated)
        work.evidence(aiQueries)
        if (!added) break
        await analyzeLargeEvidence(aiQueries, `Analizza ${opponent.name} contro la nostra lista`, config, work)
        if (attempt === 3) throw new Error('La guida ha introdotto altre carte: completa il recupero delle prove e riprova.')
      }
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      jobProgress(job, 'verification', 'Controllo le carte nominate e i campi della guida.')
      requireNamedEvidence(aiQueries)
      if (!generated) throw new Error('Guida Matchup non prodotta.')
      aiJobStore.prepare(job.id, { analysisVersion: 2, validatedDraft: true,
        base: { ...base, promptAudit: generated.promptAudit } })
      const report = { ...generated, jobId: job.id, generatedAt: base.generatedAt,
        deckVersionId: base.deckVersionId, deckResolutionId: base.deckResolutionId }
      jobProgress(job, 'saving', 'Salvo la guida Matchup.')
      aiJobStore.ready(job.id, { report })
      projectStore.saveMatchupReport(report)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: report }
    } catch (error) {
      return { ok: false, error: aiError(finishAiJob(job, error)) }
    } finally {
      generatingProjects.delete(projectId)
      activeAiControllers.delete(job.id)
      activeAiWork.get(job.id)?.close()
      activeAiWork.delete(job.id)
    }
  }
  registerHandler('matchups:generate', (projectId, metaId, opponentId, override) =>
    generateGuide(projectId, metaId, opponentId, override))
  resumeRunners.set('matchup-generate', (job, args) => generateGuide(args[0], args[1], args[2], args[3], job))

  async function runRevision(discussionId: unknown, turnId: unknown, feedback: unknown,
    override: unknown, resumedJob?: AiJob): Promise<OperationResult<MatchupDiscussion>> {
    if (!projectStore || !aiJobStore || typeof discussionId !== 'string') return { ok: false, error: 'Discussione Matchup non valida.' }
    const discussion = projectStore.getMatchupDiscussion(discussionId)
    if (!discussion || generatingProjects.has(discussion.projectId)) return { ok: false, error: 'Discussione non trovata o analisi già in corso.' }
    let job: AiJob
    try { job = resumedJob ? aiJobStore.resume(resumedJob.id) : aiJobStore.start('matchup-revise', discussion.projectId,
      `matchup:${discussion.projectId}`) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo progetto.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingProjects.add(discussion.projectId)
    try {
      jobProgress(job, 'preparing', 'Preparo lo storico e il commento della discussione.')
      const pending = turnId === null
        ? projectStore.addMatchupFeedback(discussion.id, feedback as string)
        : discussion
      const target = pending.turns.find((turn) => turn.id === turnId) ??
        (turnId === null ? pending.turns.at(-1) : undefined)
      if (!target || !target.feedback || target.report || target !== pending.turns.at(-1))
        throw new Error('Commento Matchup in attesa non trovato.')
      const work = beginAiWork(job, controller, [discussionId, target.id, null, override])
      const selection = work.snapshot('matchup-selection', [], () => {
        const value = captureMatchupSelection(discussion.projectId, discussion.metaId, discussion.opponentId)
        if (value.hash !== discussion.deckHash || (discussion.deckVersionId &&
          (value.deckVersion?.versionId !== discussion.deckVersionId || value.deckVersion?.resolutionId !== discussion.deckResolutionId)))
          throw new Error('La base dell’analisi è cambiata. Continua sulla nuova base.')
        return value
      })
      const { snapshot, opponent } = selection
      const config = await pinnedAiConfig(work, override)
      jobProgress(job, 'catalog', 'Aggiorno le schede della lista corrente.')
      const { context, evidence, sample, deckContext } = await prepareStableMatchup(work, selection, config, pending, true)
      jobProgress(job, 'events', 'Ricollego le evidenze dei tornei alla revisione.')
      const { trace: aiQueries, engine: queryEngine } = await matchupAiQueries(target.feedback, deckContext,
        sample, evidence, config, controller.signal, matchupHistoryContext(context!), job)
      const base = matchupJobBase(job.id, discussion.projectId, discussion.deckHash,
        snapshot, opponent, sample, config, evidence, aiQueries,
        discussion.deckVersionId ? { versionId: discussion.deckVersionId,
          resolutionId: discussion.deckResolutionId ?? null } : null)
      let revised: Awaited<ReturnType<typeof reviseMatchup>> | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        jobProgress(job, 'analysis', attempt ? `Codex rielabora la revisione con nuove schede (${attempt + 1}/4).` :
          'Codex rivede la guida alla luce del tuo commento.')
        revised = await work.run('analysis', JSON.stringify(['revise-v2', context, target.feedback, deckContext, snapshot,
          opponent, sample, evidence, { ...aiQueries, durationMs: 0 }]), config, () => reviseMatchup(context!, target.feedback!, deckContext, snapshot,
          opponent, sample, config, evidence, { jobDirectory: aiArtifactDirectory(job.id),
            signal: controller.signal, aiQueries,
            onPrompt: (audit) => { work.promptBytes(audit.utf8Bytes); aiJobStore!.prepare(job.id,
              { analysisVersion: 2, validatedDraft: false,
                base: { ...base, promptAudit: audit },
                discussionId: discussion.id, turnId: target.id }) },
            onSummary: jobSummary(job, 'analysis', 'Codex rivede la guida alla luce del tuo commento.') }))
        const added = extendMatchupDraftEvidence(aiQueries, queryEngine, revised.report, revised.changeSummary)
        work.evidence(aiQueries)
        if (!added) break
        await analyzeLargeEvidence(aiQueries, target.feedback, config, work)
        if (attempt === 3) throw new Error('La revisione ha introdotto altre carte: completa il recupero delle prove e riprova.')
      }
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      jobProgress(job, 'verification', 'Controllo le carte citate e la guida aggiornata.')
      requireNamedEvidence(aiQueries)
      if (!revised) throw new Error('Revisione Matchup non prodotta.')
      aiJobStore.prepare(job.id, { analysisVersion: 2, validatedDraft: true,
        base: { ...base, promptAudit: revised.report.promptAudit },
        discussionId: discussion.id, turnId: target.id })
      const report = { ...revised.report, jobId: job.id, generatedAt: base.generatedAt,
        deckVersionId: base.deckVersionId, deckResolutionId: base.deckResolutionId }
      jobProgress(job, 'saving', 'Salvo la revisione nella discussione.')
      aiJobStore.ready(job.id, { report, changeSummary: revised.changeSummary })
      const saved = projectStore.completeMatchupFeedback(discussion.id, target.id,
        report, revised.changeSummary)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: saved }
    } catch (error) {
      return { ok: false, error: aiError(finishAiJob(job, error)) }
    } finally {
      generatingProjects.delete(discussion.projectId)
      activeAiControllers.delete(job.id)
      activeAiWork.get(job.id)?.close()
      activeAiWork.delete(job.id)
    }
  }
  resumeRunners.set('matchup-revise', (job, args) => runRevision(args[0], args[1], args[2], args[3], job))

  registerHandler('matchups:revise', (discussionId: unknown, feedback: unknown, override: unknown): Promise<OperationResult<MatchupDiscussion>> => {
    return runRevision(discussionId, null, feedback, override)
  })

  registerHandler('matchups:retry-turn', (discussionId: unknown, turnId: unknown, override: unknown): Promise<OperationResult<MatchupDiscussion>> => {
    return runRevision(discussionId, turnId, null, override)
  })

  async function continueGuide(discussionId: unknown, metaId: unknown,
    override: unknown, resumedJob?: AiJob): Promise<OperationResult<MatchupDiscussion>> {
    if (!projectStore || !aiJobStore || typeof discussionId !== 'string' || typeof metaId !== 'string')
      return { ok: false, error: 'Discussione Matchup non valida.' }
    const parent = projectStore.getMatchupDiscussion(discussionId)
    if (!parent || generatingProjects.has(parent.projectId)) return { ok: false, error: 'Discussione non trovata o analisi già in corso.' }
    let job: AiJob
    try { job = resumedJob ? aiJobStore.resume(resumedJob.id) : aiJobStore.start('matchup-continue', parent.projectId, `matchup:${parent.projectId}`) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo progetto.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingProjects.add(parent.projectId)
    try {
      jobProgress(job, 'preparing', 'Preparo la nuova base della discussione.')
      const work = beginAiWork(job, controller, [discussionId, metaId, override])
      const selection = work.snapshot('matchup-selection', [], () => {
        const value = captureMatchupSelection(parent.projectId, metaId, parent.opponentId)
        if (parent.metaId === metaId && parent.deckHash === value.hash &&
          parent.deckVersionId === value.deckVersion?.versionId && parent.deckResolutionId === value.deckVersion?.resolutionId)
          throw new Error('Questa discussione usa già la base corrente.')
        if (projectStore!.listMatchupDiscussions(parent.projectId, parent.opponentId)
          .some((item) => item.metaId === metaId && item.deckHash === value.hash &&
            item.deckVersionId === value.deckVersion?.versionId && item.deckResolutionId === value.deckVersion?.resolutionId))
          throw new Error('Esiste già una discussione per la base corrente.')
        return value
      })
      const { snapshot, opponent, hash, deckVersion } = selection
      const config = await pinnedAiConfig(work, override)
      jobProgress(job, 'catalog', 'Aggiorno le schede delle due liste.')
      const { context, evidence, sample, deckContext } = await prepareStableMatchup(work, selection, config, parent)
      jobProgress(job, 'events', 'Collego i tornei della nuova base.')
      const { trace: aiQueries, engine: queryEngine } = await matchupAiQueries(`Continua l'analisi di ${opponent.name} sulla nuova lista e sul nuovo metagame`,
        deckContext, sample, evidence, config, controller.signal,
        matchupHistoryContext(context!), job)
      const base = matchupJobBase(job.id, parent.projectId, hash,
        snapshot, opponent, sample, config, evidence, aiQueries, deckVersion)
      let generated: MatchupReport | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        jobProgress(job, 'analysis', attempt ? `Codex rielabora la guida con nuove schede (${attempt + 1}/4).` :
          'Codex aggiorna la guida sulla nuova base.')
        generated = await work.run('analysis', JSON.stringify(['continue-v2', parent.projectId, hash, deckContext, snapshot,
          opponent, sample, evidence, matchupHistoryContext(context!), { ...aiQueries, durationMs: 0 }]), config, () => generateMatchup(parent.projectId, hash, deckContext, snapshot, opponent, sample,
          config, evidence, matchupHistoryContext(context!), { jobDirectory: aiArtifactDirectory(job.id),
            signal: controller.signal, aiQueries,
            onPrompt: (audit) => { work.promptBytes(audit.utf8Bytes); aiJobStore!.prepare(job.id,
              { analysisVersion: 2, validatedDraft: false,
                base: { ...base, promptAudit: audit }, parentId: parent.id }) },
            onSummary: jobSummary(job, 'analysis', 'Codex aggiorna la guida sulla nuova base.') }))
        const added = extendMatchupDraftEvidence(aiQueries, queryEngine, generated)
        work.evidence(aiQueries)
        if (!added) break
        await analyzeLargeEvidence(aiQueries, `Analizza ${opponent.name} contro la nostra lista`, config, work)
        if (attempt === 3) throw new Error('La guida ha introdotto altre carte: completa il recupero delle prove e riprova.')
      }
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      jobProgress(job, 'verification', 'Controllo le carte citate e la guida aggiornata.')
      requireNamedEvidence(aiQueries)
      if (!generated) throw new Error('Guida Matchup non prodotta.')
      aiJobStore.prepare(job.id, { analysisVersion: 2, validatedDraft: true,
        base: { ...base, promptAudit: generated.promptAudit }, parentId: parent.id })
      const report = { ...generated, jobId: job.id, generatedAt: base.generatedAt,
        deckVersionId: base.deckVersionId, deckResolutionId: base.deckResolutionId }
      jobProgress(job, 'saving', 'Salvo la nuova guida Matchup.')
      aiJobStore.ready(job.id, { report })
      const saved = projectStore.saveContinuedMatchupReport(report, parent.id)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: saved }
    } catch (error) {
      return { ok: false, error: aiError(finishAiJob(job, error)) }
    } finally {
      generatingProjects.delete(parent.projectId)
      activeAiControllers.delete(job.id)
      activeAiWork.get(job.id)?.close()
      activeAiWork.delete(job.id)
    }
  }
  registerHandler('matchups:continue', (discussionId, metaId, override) =>
    continueGuide(discussionId, metaId, override))
  resumeRunners.set('matchup-continue', (job, args) => continueGuide(args[0], args[1], args[2], job))

  registerHandler('matchups:open-source', async (input: unknown): Promise<OperationResult<boolean>> => {
    if (typeof input !== 'string' || input.length > 500) return { ok: false, error: 'URL non valido.' }
    try {
      const url = new URL(input)
      const mainDeck = url.hostname === 'limitlesstcg.com' && url.pathname.startsWith('/decks')
      const playList = url.hostname === 'play.limitlesstcg.com' && !url.search && !url.hash &&
        /^\/tournament\/[a-f0-9]{24}(?:\/player\/[^/]+\/decklist)?\/?$/.test(url.pathname)
      if (url.protocol !== 'https:' || url.username || url.password || (!mainDeck && !playList)) {
        return { ok: false, error: 'URL non valido.' }
      }
      await callHost('open-external', url.toString())
      return { ok: true, value: true }
    } catch {
      return { ok: false, error: 'Impossibile aprire Limitless nel browser.' }
    }
  })
}


export async function initializeBackend(): Promise<void> {
  try {
    diagnosticIncidentsPath = join(backendContext.userData, 'data', 'diagnostic-incidents.json')
    runtimeIncidents.push(...readDiagnosticIncidents(diagnosticIncidentsPath))
    const databasePath = join(backendContext.userData, 'data', 'pokeguru.sqlite')
    const migration = await prepareDatabaseMigration(databasePath)
    projectStore = new ProjectStore(databasePath)
    catalogStore = new CatalogStore(databasePath)
    tournamentStore = new TournamentStore(databasePath)
    dailySyncStore = new DailySyncStore(databasePath)
    const eventStore = tournamentStore
    let playBlockRequests = 0
    playTournamentJob = new TournamentSyncJob(() => eventStore.progress(),
      async (mode, shouldStop) => {
        playBlockRequests = 0
        const countedFetch: typeof fetch = (input, init) => {
          playBlockRequests++
          return fetch(input, init)
        }
        return syncTournamentBlock(eventStore, mode, countedFetch, new Date(), shouldStop)
      }, () => Math.max(7_500, playBlockRequests * 7_500), undefined, (result) => {
        if (result.kind === 'success') dailySyncStore?.success('play')
        else dailySyncStore?.failed('play', result.error ?? 'Play non aggiornato.', result.retryAt)
      })
    mainTournamentJob = new TournamentSyncJob(() => eventStore.mainProgress(),
      (mode, shouldStop) => syncMainTournamentBlock(eventStore, mode, fetch, new Date(), shouldStop), 300,
      () => {
        if (projectStore && generatingDeckThreads.size === 0 && !hasRecoverableThreadJob())
          eventStore.pruneMainIntermediates(projectStore.referencedTournamentSnapshotIds())
      }, (result) => {
        if (result.kind === 'success') dailySyncStore?.success('main')
        else dailySyncStore?.failed('main', result.error ?? 'Regional non aggiornati.', result.retryAt)
      })
    aiJobStore = new AiJobStore(databasePath)
    completeDatabaseMigration(databasePath, migration)
    if (!hasRecoverableThreadJob())
      tournamentStore.pruneMainIntermediates(projectStore.referencedTournamentSnapshotIds())
    aiPreferencesStore = new AiPreferencesStore(backendContext.userData)
  } catch (error) {
    console.error('Impossibile aprire l’archivio locale:', error)
    playTournamentJob?.shutdown(); playTournamentJob = null
    mainTournamentJob?.shutdown(); mainTournamentJob = null
    tournamentStore?.close(); tournamentStore = null
    dailySyncStore?.close(); dailySyncStore = null
    catalogStore?.close(); catalogStore = null
    aiJobStore?.close(); aiJobStore = null
    projectStore?.close(); projectStore = null
    storageError = error instanceof DatabaseIntegrityError
      ? 'Archivio locale danneggiato. Gli aggiornamenti sono stati fermati per evitare altre modifiche. Conserva la cartella dati e segnala il problema.'
      : 'Archivio locale non disponibile. Controlla i permessi della cartella dati e riavvia l’app.'
    storageIssue = error instanceof DatabaseIntegrityError ? 'integrity' : 'unavailable'
  }

  registerProjectHandlers()
  if (!storageError && process.env.POKEGURU_AUTO_SYNC !== '0') {
    const requestedDelay = Number(process.env.POKEGURU_AUTO_SYNC_DELAY_MS)
    const delay = Number.isFinite(requestedDelay) && requestedDelay >= 3_000 && requestedDelay <= 30_000
      ? requestedDelay : 3_000
    startupSyncTimer = setTimeout(startDailySync, delay)
  }
  if (!storageError) setTimeout(() => { void recoverAiJobs() }, 0)

}

export async function shutdownBackend(): Promise<void> {
  aiShuttingDown = true
  for (const [id, work] of activeAiWork) {
    work.close()
    const controller = activeAiControllers.get(id)
    const voluntary = controller?.signal.reason === 'pause' || aiJobStore?.diagnostics(id)?.suspensionReason === 'user'
    try {
      aiJobStore?.suspend(id, voluntary ? 'Analisi in pausa su tua richiesta.'
        : 'Analisi salvata alla chiusura. Riprenderà automaticamente alla riapertura.', voluntary ? 'user' : 'shutdown')
    } catch { /* Recover the last committed state if storage cannot accept the shutdown marker. */ }
    finally { controller?.abort('shutdown') }
  }
  catalogShuttingDown = true
  if (startupSyncTimer) clearTimeout(startupSyncTimer)
  playTournamentJob?.shutdown()
  mainTournamentJob?.shutdown()
  if (catalogRetryTimer) clearTimeout(catalogRetryTimer)
  catalogStore?.interruptJob()
  catalogJobController?.abort()
  await codexControl.stop()
  projectStore?.close()
  catalogStore?.close()
  tournamentStore?.close()
  dailySyncStore?.close()
  aiJobStore?.close()
  projectStore = null
  aiJobStore = null
}
