import { app, BrowserWindow, clipboard, ipcMain, protocol, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { ProjectStore } from './project-store'
import type { DeckBaseline, ImportDeckInput } from '../shared/deck-import'
import type { AdoptDeckCandidateInput, CreateDeckThreadInput, DeckThread, DeckThreadSummary, DeckVersion, SaveDeckCandidateInput } from '../shared/deck-threads'
import { reviewCandidate } from '../shared/candidate-review'
import { auditStandardRuleSources } from './standard-rule-audit'
import type { StandardRuleAudit } from '../shared/standard-rule-audit'
import type { OperationResult, Project } from '../shared/projects'
import type { MatchupDiscussion, MatchupReport, MatchupTournamentEvidence, MetaDeck, MetaSnapshot } from '../shared/meta-matchups'
import type { AiConnection, AiPreferences, AiRunConfig } from '../shared/ai'
import { fetchMeta, fetchOpponentSample } from './limitless-meta'
import { generateMatchup, matchupHistoryContext, reviseMatchup, summarizeMatchupContext, testCodex } from './codex-matchup'
import { AiPreferencesStore, resolveAiConfig } from './ai-preferences'
import { CodexControl } from './codex-control'
import { deckDiscussionPrompt, DECK_DISCUSSION_SCHEMA, readDeckDiscussionReply,
  readDeckDiscussionSourceIds,
  deckProposalPrompt, DECK_PROPOSAL_SCHEMA, validateDeckProposal } from './deck-ai'
import { buildThreadEvidence } from './thread-evidence'
import type { ThreadEvidencePacket } from '../shared/thread-evidence'
import { CatalogStore, enrichCatalogPrints, fetchCatalogSample, syncStandardCatalog } from './catalog'
import type { CatalogBrowseOverview, CatalogBrowsePage, CatalogBrowseGroup,
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
import { OFFICIAL_SET_CODES } from '../shared/set-codes'
import { evaluateStandardDeck } from '../shared/standard-deck'
import { localCalendarDate } from '../shared/calendar-date'
import { safeThreadLink } from '../shared/thread-links'
import { TournamentStore } from './tournament-store'
import { completeDatabaseMigration, prepareDatabaseMigration } from './database-migrations'
import { AiJobStore } from './ai-job-store'
import type { AiJob } from './ai-job-store'
import { recoverMatchupJob, recoverThreadJob } from './ai-job-recovery'
import { fetchRecentWesternTournament } from './limitless-event'
import { syncTournamentBlock } from './tournament-sync'
import { syncMainTournamentBlock } from './main-tournament-sync'
import type { TournamentSnapshot, TournamentSummary, TournamentSyncProgress } from '../shared/tournament'
import type { MainTournamentSnapshot, MainTournamentSummary, MainTournamentSyncProgress } from '../shared/main-tournament'
import type { CardPreviewData, CardPreviewLookup } from '../shared/card-preview'

app.setName('Pokeguru')
protocol.registerSchemesAsPrivileged([{
  scheme: 'pokeguru', privileges: { standard: true, secure: true }
}])

let mainWindow: BrowserWindow | null = null
let aiJobStore: AiJobStore | null = null
let projectStore: ProjectStore | null = null
let catalogStore: CatalogStore | null = null
let tournamentStore: TournamentStore | null = null
let tournamentSyncBusy = false
let mainTournamentSyncBusy = false
let storageError: string | null = null
let aiPreferencesStore: AiPreferencesStore | null = null
const codexControl = new CodexControl()
const generatingProjects = new Set<string>()
const generatingDeckThreads = new Set<string>()
const activeAiControllers = new Map<string, AbortController>()
let recoveringAiJobs = false

function aiArtifactDirectory(jobId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error('Identificativo job AI non valido.')
  return join(app.getPath('userData'), 'data', 'ai-jobs', jobId)
}

function clearAiArtifacts(jobId: string): void {
  const directory = aiArtifactDirectory(jobId)
  if (existsSync(directory)) rmSync(directory, { recursive: true, force: true })
}

function finishAiJob(job: AiJob, error: unknown): void {
  if (!aiJobStore) return
  const current = aiJobStore.get(job.id)
  if (!current || current.status === 'applied') return
  if (current.status === 'cancelled') {
    clearAiArtifacts(job.id)
    return
  }
  if (activeAiControllers.get(job.id)?.signal.aborted) {
    aiJobStore.transition(job.id, 'cancelled')
    clearAiArtifacts(job.id)
  } else if (current.status === 'running' && existsSync(join(aiArtifactDirectory(job.id), 'result.json'))) {
    // The completed CLI output is retained for recovery after a downstream failure.
  } else if (current.status === 'ready') {
    // A validated response is awaiting its project transaction; keep it recoverable.
  } else {
    aiJobStore.transition(job.id, 'failed', error instanceof Error ? error.message : 'Operazione AI non completata.')
    clearAiArtifacts(job.id)
  }
}

async function recoverAiJobs(): Promise<void> {
  if (!aiJobStore || !projectStore || !catalogStore || recoveringAiJobs) return
  recoveringAiJobs = true
  try {
    for (const job of aiJobStore.recoverable()) {
      if (activeAiControllers.has(job.id)) continue
      try {
        const outcome = job.kind === 'thread-ask' || job.kind === 'thread-propose'
          ? await recoverThreadJob(job, aiJobStore, projectStore, catalogStore,
            codexControl, aiArtifactDirectory(job.id))
          : recoverMatchupJob(job, aiJobStore, projectStore, aiArtifactDirectory(job.id))
        if (outcome === 'applied' || outcome === 'interrupted') clearAiArtifacts(job.id)
      } catch (error) {
        aiJobStore.noteError(job.id, error instanceof Error ? error.message : 'Recupero Codex non riuscito.')
      }
    }
  } finally { recoveringAiJobs = false }
}
function hasRecoverableThreadJob(): boolean {
  return !!aiJobStore?.recoverable().some((job) =>
    job.kind === 'thread-ask' || job.kind === 'thread-propose')
}
let catalogSyncing = false
let catalogRetryTimer: ReturnType<typeof setTimeout> | null = null
const rendererFile = join(__dirname, '../renderer/index.html')
const rendererUrl = 'pokeguru://bundle/index.html'
const packagedCsp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: pokeguru://cards",
  "font-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'",
  "form-action 'none'", "frame-src 'none'"
].join('; ')
let trustedRendererUrl: string | null = null

function developmentRendererUrl(): string | null {
  if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL) return null
  try {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) return null
    return url.toString()
  } catch { return null }
}

function isTrustedRendererUrl(value: string): boolean {
  if (!trustedRendererUrl) return false
  try {
    return new URL(value).href === new URL(trustedRendererUrl).href
  } catch { return false }
}

function runCatalogJob(mode: CatalogSyncMode): void {
  const store = catalogStore
  if (!store || catalogSyncing) return
  catalogSyncing = true
  void syncStandardCatalog(store, undefined, mode).then(() => {
    catalogSyncing = false
  }).catch((error: unknown) => {
    catalogSyncing = false
    const message = error instanceof Error ? error.message : 'Aggiornamento interrotto.'
    if (/HTTP 429|HTTP 503|limitato temporaneamente/.test(message)) {
      catalogRetryTimer = setTimeout(() => runCatalogJob(mode), 60_000)
    }
  })
}
async function prepareMatchupHistory(discussion: MatchupDiscussion, config: AiRunConfig,
  signal?: AbortSignal): Promise<MatchupDiscussion> {
  if (!projectStore) throw new Error(unavailableMessage())
  let current = discussion
  const lastToSummarize = current.turns.length - 5
  while (lastToSummarize > current.summarizedThrough) {
    const through = Math.min(current.summarizedThrough + 5, lastToSummarize)
    if (!current.turns[through]?.report) break
    const summary = await summarizeMatchupContext(current, through, config, signal)
    projectStore.saveMatchupContextSummary(current.id, summary, through)
    current = projectStore.getMatchupDiscussion(current.id)!
  }
  return current
}

function aiError(error: unknown): string {
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

function currentMatchupDeckContext(projectId: string, baseline: DeckBaseline): string {
  const catalog = catalogStore?.view() ?? null
  const asOf = localCalendarDate()
  const standard = evaluateStandardDeck(baseline, catalog, asOf,
    projectStore?.getStandardRuleAudit() ?? null)
  return matchupDeckContext(baseline, projectStore!.getReconciliation(projectId), catalog, standard)
}

async function enrichMatchupDeck(projectId: string, baseline: DeckBaseline): Promise<void> {
  if (!catalogStore || !projectStore || catalogSyncing) return
  const reconciliation = projectStore.getReconciliation(projectId)
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
  config: AiRunConfig, evidence: MatchupTournamentEvidence):
  Omit<MatchupReport, 'strengths' | 'weaknesses' | 'ourKeyCards' | 'theirKeyCards' |
    'strategy' | 'limitations'> {
  return { jobId, projectId, deckHash, metaId: snapshot.id, opponentId: opponent.id,
    generatedAt: new Date().toISOString(), sampleDeckUrl: sample.url,
    sampleDeckCards: sample.cards, sampleDeckMechanics: sample.mechanics ?? [], ai: config,
    metaSourceUrl: snapshot.sourceUrl, metaPeriod: snapshot.period,
    metaFetchedAt: snapshot.fetchedAt, opponentSourceUrl: opponent.url,
    tournamentEvidence: evidence }
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
  const prints = catalogStore.view().prints
  const mechanics = names.flatMap((name) => {
    const observed = evidence.observedCards.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    if (observed?.gameplay && observed.cardSourceUrl) return [{ name,
      text: observed.gameplay, sourceUrl: observed.cardSourceUrl }]
    const comparable = prints.filter((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.gameplay)
    const summaries = new Set(comparable.map((item) => gameplaySummary(item.gameplay!, item)))
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
  const isMainFrame = (event: Electron.IpcMainInvokeEvent): boolean =>
    mainWindow !== null && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame && isTrustedRendererUrl(event.senderFrame.url)

  ipcMain.handle('tournament:get', (event): OperationResult<TournamentSnapshot | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.latest() } }
    catch { return { ok: false, error: 'Evento salvato non leggibile.' } }
  })

  ipcMain.handle('tournament:refresh', async (event): Promise<OperationResult<TournamentSnapshot>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.save(await fetchRecentWesternTournament()) } }
    catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Evento Limitless Play non disponibile.' }
    }
  })

  ipcMain.handle('tournament:list', (event): OperationResult<TournamentSummary[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.summaries() } }
    catch { return { ok: false, error: 'Archivio tornei non leggibile.' } }
  })

  ipcMain.handle('tournament:get-event', (event, eventId: unknown): OperationResult<TournamentSnapshot | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    if (typeof eventId !== 'string' || !/^[a-f0-9]{24}$/.test(eventId))
      return { ok: false, error: 'ID evento non valido.' }
    try { return { ok: true, value: tournamentStore.getEvent(eventId) } }
    catch { return { ok: false, error: 'Evento salvato non leggibile.' } }
  })

  ipcMain.handle('tournament:sync-status', (event): OperationResult<TournamentSyncProgress> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.progress() } }
    catch { return { ok: false, error: 'Stato aggiornamento tornei non leggibile.' } }
  })

  ipcMain.handle('tournament:sync', async (event, mode: unknown): Promise<OperationResult<TournamentSyncProgress>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    if (mode !== 'new' && mode !== 'full') return { ok: false, error: 'Modalità aggiornamento non valida.' }
    if (tournamentSyncBusy) return { ok: false, error: 'Aggiornamento tornei già in corso.' }
    tournamentSyncBusy = true
    try { return { ok: true, value: await syncTournamentBlock(tournamentStore, mode) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Aggiornamento tornei non riuscito.' } }
    finally { tournamentSyncBusy = false }
  })

  ipcMain.handle('tournament:main-list', (event): OperationResult<MainTournamentSummary[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.mainSummaries() } }
    catch { return { ok: false, error: 'Archivio Regional non leggibile.' } }
  })

  ipcMain.handle('tournament:main-get', (event, eventId: unknown): OperationResult<MainTournamentSnapshot | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    if (typeof eventId !== 'string' || !/^\d{1,10}$/.test(eventId)) return { ok: false, error: 'ID Regional non valido.' }
    try { return { ok: true, value: tournamentStore.getMain(eventId) } }
    catch { return { ok: false, error: 'Regional salvato non leggibile.' } }
  })

  ipcMain.handle('tournament:main-sync-status', (event): OperationResult<MainTournamentSyncProgress> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: tournamentStore.mainProgress() } }
    catch { return { ok: false, error: 'Stato Regional non leggibile.' } }
  })

  ipcMain.handle('tournament:main-sync', async (event, mode: unknown): Promise<OperationResult<MainTournamentSyncProgress>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!tournamentStore) return { ok: false, error: unavailableMessage() }
    if (mode !== 'new' && mode !== 'full') return { ok: false, error: 'Modalità Regional non valida.' }
    if (mainTournamentSyncBusy) return { ok: false, error: 'Aggiornamento Regional già in corso.' }
    mainTournamentSyncBusy = true
    try {
      const value = await syncMainTournamentBlock(tournamentStore, mode)
      if (projectStore && generatingDeckThreads.size === 0 && !hasRecoverableThreadJob())
        tournamentStore.pruneMainIntermediates(projectStore.referencedTournamentSnapshotIds())
      return { ok: true, value }
    }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Aggiornamento Regional non riuscito.' } }
    finally { mainTournamentSyncBusy = false }
  })

  ipcMain.handle('tournament:open-main-source', async (event, input: unknown): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event) || typeof input !== 'string' || input.length > 300)
      return { ok: false, error: 'URL Regional non valido.' }
    try {
      const url = new URL(input)
      if (url.protocol !== 'https:' || url.hostname !== 'limitlesstcg.com' ||
        !/^\/(tournaments|decks\/list)\/\d+$/.test(url.pathname))
        return { ok: false, error: 'URL Regional non consentito.' }
      await shell.openExternal(url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Fonte Regional non apribile.' } }
  })

  ipcMain.handle('tournament:open-source', async (event, input: unknown): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event) || typeof input !== 'string' || input.length > 300)
      return { ok: false, error: 'URL evento non valido.' }
    try {
      const url = new URL(input)
      if (url.protocol !== 'https:' || url.hostname !== 'play.limitlesstcg.com' ||
        !/^\/tournament\/[a-f0-9]{24}$/.test(url.pathname) || url.search || url.hash)
        return { ok: false, error: 'URL evento non valido.' }
      await shell.openExternal(url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire l’evento nel browser.' } }
  })

  ipcMain.handle('catalog:get', (event): OperationResult<CatalogView> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: catalogStore.view() } }
    catch { return { ok: false, error: 'Catalogo locale non disponibile.' } }
  })

  ipcMain.handle('catalog:browse-overview', (event): OperationResult<CatalogBrowseOverview> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: catalogStore.browseOverview() } }
    catch { return { ok: false, error: 'Catalogo locale non disponibile.' } }
  })

  ipcMain.handle('catalog:search', (event, query: unknown, setId: unknown,
    offset: unknown): OperationResult<CatalogBrowsePage> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (typeof query !== 'string' || query.length > 200 || query.includes('\0') ||
      typeof setId !== 'string' || (setId !== 'all' && !/^[a-zA-Z0-9.]{1,20}$/.test(setId)) ||
      !Number.isInteger(offset) || (offset as number) < 0 || (offset as number) > 1_000_000) {
      return { ok: false, error: 'Ricerca catalogo non valida.' }
    }
    try { return { ok: true, value: catalogStore.browseSearch(query, setId, offset as number) } }
    catch { return { ok: false, error: 'Ricerca catalogo non disponibile.' } }
  })

  ipcMain.handle('catalog:group', (event, key: unknown): OperationResult<{
    group: CatalogBrowseGroup; prints: CatalogPrint[] } | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (typeof key !== 'string' || key.length > 150 || key.includes('\0'))
      return { ok: false, error: 'Carta catalogo non valida.' }
    try { return { ok: true, value: catalogStore.browseGroup(key) } }
    catch { return { ok: false, error: 'Dettaglio carta non disponibile.' } }
  })

  ipcMain.handle('catalog:card-preview', (event, value: unknown): OperationResult<CardPreviewData> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    const input = value as Partial<CardPreviewLookup> | null
    if (!input || typeof input.name !== 'string' || input.name.length < 1 || input.name.length > 150 ||
      [input.name, input.printId, input.identityId, input.setCode, input.cardNumber].some((part) =>
        part != null && (typeof part !== 'string' || part.length > 150 || part.includes('\0'))) ||
      (input.printId != null && !/^[a-zA-Z0-9.-]{1,100}$/.test(input.printId)) ||
      (input.setCode != null && !/^[a-zA-Z0-9.]{1,20}$/.test(input.setCode)) ||
      (input.cardNumber != null && !/^[a-zA-Z0-9/.-]{1,20}$/.test(input.cardNumber)))
      return { ok: false, error: 'Carta non valida.' }
    try { return { ok: true, value: catalogStore.cardPreview(input as CardPreviewLookup) } }
    catch { return { ok: false, error: 'Anteprima non disponibile.' } }
  })

  ipcMain.handle('catalog:sync', async (event): Promise<OperationResult<CatalogView>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (catalogSyncing) return { ok: false, error: 'Sincronizzazione già in corso.' }
    if (catalogStore.scopeKind() === 'standard-marks') return { ok: false, error: 'Usa Aggiorna catalogo Standard.' }
    catalogSyncing = true
    try { return { ok: true, value: catalogStore.save(await fetchCatalogSample()) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Sincronizzazione non riuscita.' } }
    finally { catalogSyncing = false }
  })

  ipcMain.handle('catalog:sync-status', (event): OperationResult<CatalogSyncStatus> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    return { ok: true, value: catalogStore.jobStatus() }
  })

  ipcMain.handle('catalog:sync-standard', (event, mode: unknown): OperationResult<CatalogSyncStatus> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!catalogStore) return { ok: false, error: unavailableMessage() }
    if (mode !== 'new' && mode !== 'full') return { ok: false, error: 'Modalità catalogo non valida.' }
    if (catalogSyncing) return { ok: false, error: 'Sincronizzazione già in corso.' }
    if (catalogRetryTimer) { clearTimeout(catalogRetryTimer); catalogRetryTimer = null }
    runCatalogJob(mode)
    return { ok: true, value: catalogStore.jobStatus() }
  })

  ipcMain.handle('catalog:open-source', async (event, input: unknown): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event) || typeof input !== 'string') return { ok: false, error: 'URL non valido.' }
    try {
      const url = new URL(input)
      if (url.protocol !== 'https:' || url.hostname !== 'api.tcgdex.net' ||
        !/^\/v2\/en\/(cards|sets)\/[a-zA-Z0-9.-]+$/.test(url.pathname) || url.search || url.hash) {
        return { ok: false, error: 'URL non valido.' }
      }
      await shell.openExternal(url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire TCGdex nel browser.' } }
  })

  ipcMain.handle('standard:open-source', async (event, sourceId: unknown): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event) || typeof sourceId !== 'string') return { ok: false, error: 'Fonte non valida.' }
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
      await shell.openExternal(sourceUrl)
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire la fonte Play! Pokémon.' } }
  })

  ipcMain.handle('standard:get-rule-audit', (event): OperationResult<StandardRuleAudit | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.getStandardRuleAudit())
  })

  ipcMain.handle('standard:check-rule-sources', async (event): Promise<OperationResult<StandardRuleAudit>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    const previous = withStore(() => projectStore!.getStandardRuleAudit())
    if (!previous.ok) return previous
    const audit = await auditStandardRuleSources(previous.value)
    return withStore(() => { projectStore!.saveStandardRuleAudit(audit); return audit })
  })

  ipcMain.handle('ai:get-preferences', (event): OperationResult<AiPreferences> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!aiPreferencesStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: aiPreferencesStore.read() } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  ipcMain.handle('ai:get-connection', async (event): Promise<OperationResult<AiConnection>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    try { return { ok: true, value: await codexControl.connection() } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  ipcMain.handle('ai:save-preferences', async (event, value: unknown): Promise<OperationResult<AiPreferences>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!aiPreferencesStore) return { ok: false, error: unavailableMessage() }
    try {
      const models = value && typeof value === 'object' && (value as AiPreferences).model === null
        ? [] : await codexControl.models()
      const valid = resolveAiConfig(value, models, 'global')
      return { ok: true, value: aiPreferencesStore.write({ model: valid.model, reasoningEffort: valid.reasoningEffort }) }
    } catch (error) { return { ok: false, error: aiError(error) } }
  })

  ipcMain.handle('ai:start-login', async (event): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    try {
      const url = await codexControl.startLogin()
      await shell.openExternal(url)
      return { ok: true, value: true }
    } catch (error) { return { ok: false, error: aiError(error) } }
  })

  ipcMain.handle('ai:logout', async (event): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    try { await codexControl.logout(); return { ok: true, value: true } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  ipcMain.handle('ai:test', async (event): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    try { await testCodex(await runConfig()); return { ok: true, value: true } }
    catch (error) { return { ok: false, error: aiError(error) } }
  })

  ipcMain.handle('projects:list', (event): OperationResult<Project[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.list())
  })

  ipcMain.handle('projects:list-archived', (event): OperationResult<Project[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listArchived())
  })

  ipcMain.handle('projects:get', (event, id: unknown): OperationResult<Project | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.get(id as string))
  })

  ipcMain.handle('projects:create', (event, input: unknown): OperationResult<Project> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.create(input as Parameters<ProjectStore['create']>[0]))
  })

  function projectHasActiveAiJob(id: string): boolean {
    return Boolean(aiJobStore?.recoverable().some((job) => job.projectId === id)) ||
      generatingProjects.has(id) || Boolean(projectStore?.listDeckThreadSummaries(id).some((thread) => generatingDeckThreads.has(thread.id)))
  }

  ipcMain.handle('projects:archive', (event, id: unknown): OperationResult<Project> => {
    if (!isMainFrame(event) || typeof id !== 'string') return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore?.get(id)) return { ok: false, error: 'Progetto attivo non trovato.' }
    if (projectHasActiveAiJob(id)) return { ok: false, error: 'Attendi o annulla il job AI prima di archiviare il progetto.' }
    return withStore(() => projectStore!.archive(id))
  })

  ipcMain.handle('projects:restore', (event, id: unknown): OperationResult<Project> => {
    if (!isMainFrame(event) || typeof id !== 'string') return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.restore(id))
  })

  ipcMain.handle('projects:delete-archived', (event, id: unknown, confirmationName: unknown): OperationResult<boolean> => {
    if (!isMainFrame(event) || typeof id !== 'string' || typeof confirmationName !== 'string')
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

  ipcMain.handle('projects:get-baseline', (event, projectId: unknown): OperationResult<DeckBaseline | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.getBaseline(projectId as string))
  })

  ipcMain.handle('projects:import-deck', (event, input: unknown): OperationResult<DeckBaseline> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.importDeck(input as ImportDeckInput))
  })

  ipcMain.handle('deck:list-versions', (event, projectId: unknown): OperationResult<DeckVersion[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listDeckVersions(projectId as string))
  })

  ipcMain.handle('deck:list-threads', (event, projectId: unknown): OperationResult<DeckThread[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listDeckThreads(projectId as string))
  })

  ipcMain.handle('deck:list-thread-summaries', (event, projectId: unknown): OperationResult<DeckThreadSummary[]> => {
    if (!isMainFrame(event) || typeof projectId !== 'string') return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listDeckThreadSummaries(projectId))
  })

  ipcMain.handle('deck:get-thread', (event, projectId: unknown, threadId: unknown): OperationResult<DeckThread | null> => {
    if (!isMainFrame(event) || typeof projectId !== 'string' || typeof threadId !== 'string')
      return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.getDeckThread(projectId, threadId))
  })

  function validAiResource(projectId: unknown, resourceId: unknown): projectId is string {
    if (!projectStore || typeof projectId !== 'string' || typeof resourceId !== 'string' ||
      !projectStore.get(projectId)) return false
    return resourceId === `matchup:${projectId}` || Boolean(projectStore.getDeckThread(projectId, resourceId))
  }

  ipcMain.handle('ai:job-status', (event, projectId: unknown, resourceId: unknown) => {
    if (!isMainFrame(event) || !aiJobStore || !validAiResource(projectId, resourceId))
      return { ok: false, error: 'Job AI non disponibile.' }
    return { ok: true, value: aiJobStore.latest(projectId, resourceId as string) }
  })

  ipcMain.handle('ai:cancel-job', (event, projectId: unknown, resourceId: unknown) => {
    if (!isMainFrame(event) || !aiJobStore || !validAiResource(projectId, resourceId))
      return { ok: false, error: 'Job AI non disponibile.' }
    const job = aiJobStore.active(projectId, resourceId as string)
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

  ipcMain.handle('ai:recover-jobs', async (event) => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    await recoverAiJobs()
    return { ok: true, value: true }
  })

  ipcMain.handle('deck:create-thread', (event, input: unknown): OperationResult<DeckThread> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.createDeckThread(input as CreateDeckThreadInput))
  })

  ipcMain.handle('deck:add-thread-message', (event, projectId: unknown, threadId: unknown, message: unknown): OperationResult<DeckThread> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.addDeckThreadMessage(projectId as string, threadId as string, message as string))
  })

  ipcMain.handle('deck:preview-evidence', (event, projectId: unknown, threadId: unknown,
    question: unknown): OperationResult<ThreadEvidencePacket> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || !catalogStore || typeof projectId !== 'string' || typeof threadId !== 'string' ||
      typeof question !== 'string' || !question.trim() || question.length > 5000)
      return { ok: false, error: 'Scrivi prima una domanda o una modifica da valutare.' }
    return withStore(() => {
      const thread = projectStore!.getDeckThread(projectId, threadId)
      if (!thread) throw new Error('Thread non trovato in questo progetto.')
      const base = thread.baseVersionId
        ? projectStore!.listDeckVersions(projectId).find((version) => version.id === thread.baseVersionId) ?? null : null
      return buildThreadEvidence(thread, base, question.trim(), projectStore!.listConstraints(projectId),
        catalogStore!.view(), tournamentStore?.list() ?? [], tournamentStore?.listMain() ?? [])
    })
  })

  ipcMain.handle('deck:ask-thread', async (event, projectId: unknown, threadId: unknown,
    message: unknown, override: unknown, existingUserMessageId: unknown): Promise<OperationResult<DeckThread>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || !catalogStore || !aiJobStore || typeof projectId !== 'string' || typeof threadId !== 'string' ||
      typeof message !== 'string' || !message.trim() || message.trim().length > 5000 || message.includes('\0'))
      return { ok: false, error: 'Scrivi una domanda da 1 a 5.000 caratteri.' }
    const project = projectStore.get(projectId)
    if (!project) return { ok: false, error: 'Progetto non trovato.' }
    if (project.circuit !== 'WESTERN') return { ok: false, error: 'Le sessioni Codex sono disponibili solo per il circuito occidentale.' }
    const thread = projectStore.getDeckThread(projectId, threadId)
    if (!thread) return { ok: false, error: 'Thread non trovato in questo progetto.' }
    if (existingUserMessageId !== undefined && (typeof existingUserMessageId !== 'string' ||
      thread.openingAiMessageId !== existingUserMessageId ||
      !thread.messages.some((entry) => entry.id === existingUserMessageId &&
        entry.author === 'user' && entry.text === message.trim()) ||
      thread.messages.some((entry) => entry.author === 'assistant')))
      return { ok: false, error: 'Primo messaggio Codex non recuperabile.' }
    if (generatingDeckThreads.has(threadId)) return { ok: false, error: 'Risposta Codex già in corso per questo thread.' }
    let job: AiJob
    try { job = aiJobStore.start('thread-ask', projectId, threadId) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo thread.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingDeckThreads.add(threadId)
    try {
      const config = await runConfig(override)
      const base = thread.baseVersionId
        ? projectStore.listDeckVersions(projectId).find((version) => version.id === thread.baseVersionId) ?? null
        : null
      const evidence = buildThreadEvidence(thread, base, message.trim(),
        projectStore.listConstraints(projectId), catalogStore.view(),
        tournamentStore?.list() ?? [], tournamentStore?.listMain() ?? [])
      aiJobStore.prepare(job.id, { message: message.trim(), config, evidence, existingUserMessageId })
      const cwd = join(app.getPath('temp'), 'pokeguru-codex-deck')
      mkdirSync(cwd, { recursive: true })
      const prompt = deckDiscussionPrompt(thread, base, message.trim(), evidence)
      const result = await codexControl.jsonTurn(thread.aiSessionRef, cwd, prompt, config,
        DECK_DISCUSSION_SCHEMA, { jobId: job.id, jobDirectory: aiArtifactDirectory(job.id),
          signal: controller.signal, onSessionStarted: (id) => {
            if (!thread.aiSessionRef) projectStore!.assignDeckAiSession(projectId, threadId, id)
          } })
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      aiJobStore.ready(job.id, result)
      const sessionId = result.sessionId
      if (!thread.aiSessionRef) projectStore.assignDeckAiSession(projectId, threadId, sessionId)
      const answer = readDeckDiscussionReply(result.value)
      const citedSourceIds = readDeckDiscussionSourceIds(result.value, evidence)
      const saved = projectStore.saveDeckAiExchange(projectId, threadId, sessionId,
        message.trim(), answer, result.turnId, config, undefined, evidence, citedSourceIds,
        typeof existingUserMessageId === 'string' ? existingUserMessageId : undefined)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: saved }
    } catch (error) {
      finishAiJob(job, error)
      return { ok: false, error: aiError(error) }
    } finally {
      generatingDeckThreads.delete(threadId)
      activeAiControllers.delete(job.id)
    }
  })

  ipcMain.handle('deck:propose-thread', async (event, projectId: unknown, threadId: unknown,
    request: unknown, override: unknown): Promise<OperationResult<DeckThread>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || !catalogStore || !aiJobStore || typeof projectId !== 'string' || typeof threadId !== 'string' ||
      typeof request !== 'string' || !request.trim() || request.trim().length > 5000 || request.includes('\0'))
      return { ok: false, error: 'Descrivi una modifica da valutare (massimo 5.000 caratteri).' }
    const project = projectStore.get(projectId)
    if (!project) return { ok: false, error: 'Progetto non trovato.' }
    if (project.circuit !== 'WESTERN') return { ok: false, error: 'Le proposte Codex sono disponibili solo per il circuito occidentale.' }
    const thread = projectStore.getDeckThread(projectId, threadId)
    if (!thread) return { ok: false, error: 'Thread non trovato in questo progetto.' }
    if (!thread.baseVersionId) return { ok: false, error: 'Importa una lista prima di chiedere una proposta completa.' }
    if (generatingDeckThreads.has(threadId)) return { ok: false, error: 'Codex sta già lavorando su questo thread.' }
    let job: AiJob
    try { job = aiJobStore.start('thread-propose', projectId, threadId) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo thread.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingDeckThreads.add(threadId)
    try {
      const base = projectStore.listDeckVersions(projectId).find((version) => version.id === thread.baseVersionId)
      if (!base) throw new Error('Versione di partenza del thread non disponibile.')
      const config = await runConfig(override)
      const cwd = join(app.getPath('temp'), 'pokeguru-codex-deck')
      mkdirSync(cwd, { recursive: true })
      const catalog = catalogStore.view()
      const constraints = projectStore.listConstraints(projectId)
      const evidence = buildThreadEvidence(thread, base, request.trim(), constraints, catalog,
        tournamentStore?.list() ?? [], tournamentStore?.listMain() ?? [])
      const context = deckProposalPrompt(thread, base, request.trim(), constraints, catalog, evidence)
      aiJobStore.prepare(job.id, { message: request.trim(), config, evidence, sources: context.sources })
      const result = await codexControl.jsonTurn(thread.aiSessionRef, cwd, context.prompt, config,
        DECK_PROPOSAL_SCHEMA, { jobId: job.id, jobDirectory: aiArtifactDirectory(job.id),
          signal: controller.signal })
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      aiJobStore.ready(job.id, result)
      const sessionId = result.sessionId
      if (!thread.aiSessionRef) projectStore.assignDeckAiSession(projectId, threadId, sessionId)
      const proposal = validateDeckProposal(result.value, projectId, catalog, constraints, context.sources)
      const citedSourceIds = [...new Set((result.value as { sourceIds: string[] }).sourceIds)]
      const answer = proposal.rationale
      const saved = projectStore.saveDeckAiExchange(projectId, threadId, sessionId,
        request.trim(), answer, result.turnId, config,
        proposal.outcome === 'candidate' ? { rawText: proposal.rawText, note: proposal.rationale,
          sources: proposal.sources, checks: proposal.checks } : undefined, evidence, citedSourceIds)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: saved }
    } catch (error) {
      finishAiJob(job, error)
      return { ok: false, error: aiError(error) }
    } finally {
      generatingDeckThreads.delete(threadId)
      activeAiControllers.delete(job.id)
    }
  })

  ipcMain.handle('deck:open-source', async (event, input: unknown): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event) || typeof input !== 'string' || input.length > 300)
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
      await shell.openExternal(url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire la fonte.' } }
  })

  ipcMain.handle('thread:open-link', async (event, input: unknown): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    const url = safeThreadLink(input)
    if (!url) return { ok: false, error: 'Link non valido: è consentito solo HTTPS.' }
    try {
      await shell.openExternal(url)
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire il link.' } }
  })

  ipcMain.handle('deck:save-candidate', (event, input: unknown): OperationResult<DeckThread> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.saveDeckCandidate(input as SaveDeckCandidateInput))
  })

  ipcMain.handle('deck:adopt-candidate', (event, input: unknown): OperationResult<DeckBaseline> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
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
    return prepareDeckExport(baseline)
  }

  ipcMain.handle('deck:copy-export', (event, input: unknown): OperationResult<boolean> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    try {
      const preview = exportFor(input)
      if (!preview.canExport) throw new Error('Correggi le righe non interpretate prima di esportare.')
      clipboard.writeText(preview.text)
      return { ok: true, value: true }
    } catch (error) { return { ok: false, error: aiError(error) } }
  })

  ipcMain.handle('deck:get-reconciliation', (event, projectId: unknown): OperationResult<DeckReconciliation> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.getReconciliation(projectId as string))
  })

  ipcMain.handle('deck:save-line-mapping', (event, input: unknown): OperationResult<DeckReconciliation> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
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

  ipcMain.handle('deck:clear-line-mapping', (event, input: unknown): OperationResult<DeckReconciliation> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: projectStore.clearLineMapping(input as ClearLineMappingInput) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Scelta della stampa non rimossa.' } }
  })

  ipcMain.handle('constraints:list', (event, projectId: unknown): OperationResult<DeckConstraint[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listConstraints(projectId as string))
  })

  ipcMain.handle('constraints:save', (event, input: unknown): OperationResult<DeckConstraint> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
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

  ipcMain.handle('constraints:delete', (event, input: unknown): OperationResult<DeckConstraint[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore) return { ok: false, error: unavailableMessage() }
    try { return { ok: true, value: projectStore.deleteConstraint(input as DeleteConstraintInput) } }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Vincolo non eliminato.' } }
  })

  ipcMain.handle('matchups:get-meta', async (event): Promise<OperationResult<MetaSnapshot>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
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

  ipcMain.handle('matchups:evidence-preview', (event, metaId: unknown,
    opponentId: unknown): OperationResult<MatchupTournamentEvidence> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || !tournamentStore) return { ok: false, error: unavailableMessage() }
    const meta = projectStore.getLatestMetaSnapshot()
    const opponent = meta?.decks.find((item) => item.id === opponentId)
    if (typeof metaId !== 'string' || meta?.id !== metaId || !opponent)
      return { ok: false, error: 'Snapshot Meta non disponibile.' }
    try { return { ok: true, value: currentMatchupEvidence(meta, opponent) } }
    catch { return { ok: false, error: 'Evidenze torneo non leggibili.' } }
  })

  ipcMain.handle('matchups:list-reports', (event, projectId: unknown, metaId: unknown): OperationResult<MatchupReport[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listMatchupReports(projectId as string, metaId as string))
  })

  ipcMain.handle('matchups:list-discussions', (event, projectId: unknown, opponentId: unknown): OperationResult<MatchupDiscussion[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listMatchupDiscussions(projectId as string, opponentId as string))
  })

  ipcMain.handle('matchups:list-historical-opponents', (event, projectId: unknown): OperationResult<MetaDeck[]> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.listHistoricalMatchupOpponents(projectId as string))
  })

  ipcMain.handle('matchups:generate', async (event, projectId: unknown, metaId: unknown, opponentId: unknown, override: unknown): Promise<OperationResult<MatchupReport>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || !aiJobStore) return { ok: false, error: unavailableMessage() }
    if (typeof projectId !== 'string' || typeof metaId !== 'string' || typeof opponentId !== 'string' ||
      !/^\d+$/.test(opponentId) || generatingProjects.has(projectId)) {
      return { ok: false, error: 'Analisi già in corso o richiesta non valida.' }
    }
    const project = projectStore.get(projectId)
    const baseline = projectStore.getBaseline(projectId)
    const snapshot = projectStore.getLatestMetaSnapshot()
    const opponent = snapshot?.decks.find((deck) => deck.id === opponentId)
    if (!project || project.circuit !== 'WESTERN' || !baseline || !snapshot || snapshot.id !== metaId || !opponent) {
      return { ok: false, error: 'Importa una lista e aggiorna il metagame prima di generare l’analisi.' }
    }
    const hash = projectStore.getCurrentDeckHash(projectId)!
    let job: AiJob
    try { job = aiJobStore.start('matchup-generate', projectId, `matchup:${projectId}`) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo progetto.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingProjects.add(projectId)
    try {
      const config = await runConfig(override)
      const sampleDeck = await fetchOpponentSample(opponent)
      await enrichMatchupDeck(projectId, baseline)
      await enrichOpponentCards(snapshot, opponent)
      const sample = await opponentSampleWithMechanics(sampleDeck, currentMatchupEvidence(snapshot, opponent))
      const deckContext = currentMatchupDeckContext(projectId, baseline)
      const evidence = currentMatchupEvidence(snapshot, opponent)
      const base = matchupJobBase(job.id, projectId, hash, snapshot, opponent, sample, config, evidence)
      aiJobStore.prepare(job.id, { base })
      const generated = await generateMatchup(projectId, hash, deckContext, snapshot, opponent,
        sample, config, evidence, undefined, { jobDirectory: aiArtifactDirectory(job.id),
          signal: controller.signal })
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      const report = { ...generated, jobId: job.id, generatedAt: base.generatedAt }
      aiJobStore.ready(job.id, { report })
      projectStore.saveMatchupReport(report)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: report }
    } catch (error) {
      finishAiJob(job, error)
      return { ok: false, error: error instanceof Error ? error.message : 'Analisi non completata.' }
    } finally {
      generatingProjects.delete(projectId)
      activeAiControllers.delete(job.id)
    }
  })

  async function runRevision(discussionId: unknown, turnId: unknown, feedback: unknown,
    override: unknown): Promise<OperationResult<MatchupDiscussion>> {
    if (!projectStore || !aiJobStore || typeof discussionId !== 'string') return { ok: false, error: 'Discussione Matchup non valida.' }
    const discussion = projectStore.getMatchupDiscussion(discussionId)
    if (!discussion || generatingProjects.has(discussion.projectId)) return { ok: false, error: 'Discussione non trovata o analisi già in corso.' }
    let job: AiJob
    try { job = aiJobStore.start('matchup-revise', discussion.projectId,
      `matchup:${discussion.projectId}`) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo progetto.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingProjects.add(discussion.projectId)
    try {
      const pending = turnId === null
        ? projectStore.addMatchupFeedback(discussion.id, feedback as string)
        : discussion
      const target = pending.turns.find((turn) => turn.id === turnId) ??
        (turnId === null ? pending.turns.at(-1) : undefined)
      if (!target || !target.feedback || target.report || target !== pending.turns.at(-1))
        throw new Error('Commento Matchup in attesa non trovato.')
      const project = projectStore.get(discussion.projectId)
      const baseline = projectStore.getBaseline(discussion.projectId)
      const snapshot = projectStore.getLatestMetaSnapshot()
      const opponent = snapshot?.decks.find((deck) => deck.id === discussion.opponentId)
      if (!project || project.circuit !== 'WESTERN' || !baseline || !snapshot ||
        snapshot.id !== discussion.metaId || projectStore.getCurrentDeckHash(discussion.projectId) !== discussion.deckHash || !opponent)
        throw new Error('La base dell’analisi è cambiata. Continua sulla nuova base.')
      const config = await runConfig(override)
      const context = await prepareMatchupHistory(pending, config, controller.signal)
      const previousReport = [...context.turns].reverse().find((turn) => turn.report)?.report
      const sample = previousReport?.sampleDeckCards
        ? { url: previousReport.sampleDeckUrl, cards: previousReport.sampleDeckCards,
          mechanics: previousReport.sampleDeckMechanics ?? [] }
        : await opponentSampleWithMechanics(await fetchOpponentSample(opponent),
          currentMatchupEvidence(snapshot, opponent))
      await enrichMatchupDeck(discussion.projectId, baseline)
      const deckContext = currentMatchupDeckContext(discussion.projectId, baseline)
      const evidence = previousReport?.tournamentEvidence ??
        currentMatchupEvidence(snapshot, opponent)
      const base = matchupJobBase(job.id, discussion.projectId, discussion.deckHash,
        snapshot, opponent, sample, config, evidence)
      aiJobStore.prepare(job.id, { base, discussionId: discussion.id, turnId: target.id })
      const revised = await reviseMatchup(context, target.feedback, deckContext, snapshot,
        opponent, sample, config, evidence, { jobDirectory: aiArtifactDirectory(job.id),
          signal: controller.signal })
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      const report = { ...revised.report, jobId: job.id, generatedAt: base.generatedAt }
      aiJobStore.ready(job.id, { report, changeSummary: revised.changeSummary })
      const saved = projectStore.completeMatchupFeedback(discussion.id, target.id,
        report, revised.changeSummary)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: saved }
    } catch (error) {
      finishAiJob(job, error)
      return { ok: false, error: aiError(error) }
    } finally {
      generatingProjects.delete(discussion.projectId)
      activeAiControllers.delete(job.id)
    }
  }

  ipcMain.handle('matchups:revise', (event, discussionId: unknown, feedback: unknown, override: unknown): Promise<OperationResult<MatchupDiscussion>> => {
    if (!isMainFrame(event)) return Promise.resolve({ ok: false, error: 'Richiesta non autorizzata.' })
    return runRevision(discussionId, null, feedback, override)
  })

  ipcMain.handle('matchups:retry-turn', (event, discussionId: unknown, turnId: unknown, override: unknown): Promise<OperationResult<MatchupDiscussion>> => {
    if (!isMainFrame(event)) return Promise.resolve({ ok: false, error: 'Richiesta non autorizzata.' })
    return runRevision(discussionId, turnId, null, override)
  })

  ipcMain.handle('matchups:continue', async (event, discussionId: unknown, metaId: unknown,
    override: unknown): Promise<OperationResult<MatchupDiscussion>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || !aiJobStore || typeof discussionId !== 'string' || typeof metaId !== 'string')
      return { ok: false, error: 'Discussione Matchup non valida.' }
    const parent = projectStore.getMatchupDiscussion(discussionId)
    if (!parent || generatingProjects.has(parent.projectId)) return { ok: false, error: 'Discussione non trovata o analisi già in corso.' }
    let job: AiJob
    try { job = aiJobStore.start('matchup-continue', parent.projectId, `matchup:${parent.projectId}`) }
    catch { return { ok: false, error: 'Esiste già un job Codex per questo progetto.' } }
    const controller = new AbortController()
    activeAiControllers.set(job.id, controller)
    generatingProjects.add(parent.projectId)
    try {
      const project = projectStore.get(parent.projectId)
      const baseline = projectStore.getBaseline(parent.projectId)
      const snapshot = projectStore.getLatestMetaSnapshot()
      const opponent = snapshot?.decks.find((deck) => deck.id === parent.opponentId)
      const hash = projectStore.getCurrentDeckHash(parent.projectId)
      if (!project || project.circuit !== 'WESTERN' || !baseline || !snapshot || snapshot.id !== metaId || !opponent || !hash)
        throw new Error('Importa una lista e aggiorna il metagame prima di continuare.')
      if (parent.metaId === metaId && parent.deckHash === hash) throw new Error('Questa discussione usa già la base corrente.')
      if (projectStore.listMatchupDiscussions(parent.projectId, parent.opponentId)
        .some((item) => item.metaId === metaId && item.deckHash === hash))
        throw new Error('Esiste già una discussione per la base corrente.')
      const config = await runConfig(override)
      const context = await prepareMatchupHistory(parent, config, controller.signal)
      const sampleDeck = await fetchOpponentSample(opponent)
      await enrichMatchupDeck(parent.projectId, baseline)
      await enrichOpponentCards(snapshot, opponent)
      const sample = await opponentSampleWithMechanics(sampleDeck, currentMatchupEvidence(snapshot, opponent))
      const deckContext = currentMatchupDeckContext(parent.projectId, baseline)
      const evidence = currentMatchupEvidence(snapshot, opponent)
      const base = matchupJobBase(job.id, parent.projectId, hash,
        snapshot, opponent, sample, config, evidence)
      aiJobStore.prepare(job.id, { base, parentId: parent.id })
      const generated = await generateMatchup(parent.projectId, hash, deckContext, snapshot, opponent, sample,
        config, evidence, matchupHistoryContext(context), { jobDirectory: aiArtifactDirectory(job.id),
          signal: controller.signal })
      if (controller.signal.aborted) throw new Error('Operazione Codex annullata.')
      const report = { ...generated, jobId: job.id, generatedAt: base.generatedAt }
      aiJobStore.ready(job.id, { report })
      const saved = projectStore.saveContinuedMatchupReport(report, parent.id)
      aiJobStore.transition(job.id, 'applied')
      clearAiArtifacts(job.id)
      return { ok: true, value: saved }
    } catch (error) {
      finishAiJob(job, error)
      return { ok: false, error: aiError(error) }
    } finally {
      generatingProjects.delete(parent.projectId)
      activeAiControllers.delete(job.id)
    }
  })

  ipcMain.handle('matchups:open-source', async (event, input: unknown): Promise<OperationResult<boolean>> => {
    if (!isMainFrame(event) || typeof input !== 'string' || input.length > 500) return { ok: false, error: 'URL non valido.' }
    try {
      const url = new URL(input)
      const mainDeck = url.hostname === 'limitlesstcg.com' && url.pathname.startsWith('/decks')
      const playList = url.hostname === 'play.limitlesstcg.com' && !url.search && !url.hash &&
        /^\/tournament\/[a-f0-9]{24}(?:\/player\/[^/]+\/decklist)?\/?$/.test(url.pathname)
      if (url.protocol !== 'https:' || url.username || url.password || (!mainDeck && !playList)) {
        return { ok: false, error: 'URL non valido.' }
      }
      await shell.openExternal(url.toString())
      return { ok: true, value: true }
    } catch {
      return { ok: false, error: 'Impossibile aprire Limitless nel browser.' }
    }
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    title: 'Pokéguru',
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png'),
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 580,
    backgroundColor: '#edf1ed',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  mainWindow = window

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  const developmentUrl = developmentRendererUrl()
  trustedRendererUrl = developmentUrl ?? rendererUrl
  void window.loadURL(trustedRendererUrl)
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('io.github.xmey95.pokeguru')
  try {
    const override = process.env.POKEGURU_DATA_DIR
    if (override) {
      mkdirSync(override, { recursive: true })
      app.setPath('userData', override)
    }
    const databasePath = join(app.getPath('userData'), 'data', 'pokeguru.sqlite')
    const migration = await prepareDatabaseMigration(databasePath)
    projectStore = new ProjectStore(databasePath)
    catalogStore = new CatalogStore(databasePath)
    tournamentStore = new TournamentStore(databasePath)
    aiJobStore = new AiJobStore(databasePath)
    completeDatabaseMigration(databasePath, migration)
    if (!hasRecoverableThreadJob())
      tournamentStore.pruneMainIntermediates(projectStore.referencedTournamentSnapshotIds())
    const previousJob = catalogStore.jobStatus()
    if (previousJob.state === 'paused' && previousJob.mode) {
      setTimeout(() => runCatalogJob(previousJob.mode!), 2_000)
    }
    aiPreferencesStore = new AiPreferencesStore(app.getPath('userData'))
  } catch (error) {
    console.error('Impossibile aprire l’archivio locale:', error)
    tournamentStore?.close(); tournamentStore = null
    catalogStore?.close(); catalogStore = null
    aiJobStore?.close(); aiJobStore = null
    projectStore?.close(); projectStore = null
    storageError = 'Archivio locale non disponibile. Controlla i permessi della cartella dati e riavvia l’app.'
  }

  const imageDirectory = join(app.getPath('userData'), 'data', 'catalog-images')
  try { mkdirSync(imageDirectory, { recursive: true }) } catch { /* Storage error is shown in the renderer. */ }
  protocol.registerSource('pokeguru', { routes: [
    { match: { host: 'bundle' }, source: { type: 'directory', root: dirname(rendererFile),
      headers: { 'Content-Security-Policy': packagedCsp } } },
    { match: { host: 'cards' }, source: { type: 'directory', root: imageDirectory } }
  ] })

  registerProjectHandlers()
  createWindow()
  setTimeout(() => { void recoverAiJobs() }, 0)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (catalogRetryTimer) clearTimeout(catalogRetryTimer)
  void codexControl.stop()
  projectStore?.close()
  catalogStore?.close()
  tournamentStore?.close()
  aiJobStore?.close()
  projectStore = null
  aiJobStore = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
