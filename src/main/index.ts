import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { ProjectStore } from './project-store'
import type { DeckBaseline, ImportDeckInput } from '../shared/deck-import'
import type { AdoptDeckCandidateInput, CreateDeckThreadInput, DeckThread, DeckVersion, SaveDeckCandidateInput } from '../shared/deck-threads'
import { reviewCandidate } from '../shared/candidate-review'
import { auditStandardRuleSources } from './standard-rule-audit'
import type { StandardRuleAudit } from '../shared/standard-rule-audit'
import type { OperationResult, Project } from '../shared/projects'
import type { MatchupDiscussion, MatchupReport, MetaDeck, MetaSnapshot } from '../shared/meta-matchups'
import type { AiConnection, AiPreferences, AiRunConfig } from '../shared/ai'
import { fetchMeta, fetchOpponentSample } from './limitless-meta'
import { generateMatchup, matchupHistoryContext, reviseMatchup, summarizeMatchupContext, testCodex } from './codex-matchup'
import { AiPreferencesStore, resolveAiConfig } from './ai-preferences'
import { CodexControl } from './codex-control'
import { deckDiscussionPrompt, DECK_DISCUSSION_SCHEMA, readDeckDiscussionReply,
  deckProposalPrompt, DECK_PROPOSAL_SCHEMA, validateDeckProposal } from './deck-ai'
import { CatalogStore, fetchCatalogSample, syncStandardCatalog } from './catalog'
import type { CatalogSyncMode, CatalogSyncStatus, CatalogView } from '../shared/catalog'
import { matchupDeckContext, snapshotPrint, type ClearLineMappingInput, type DeckReconciliation, type SaveLineMappingInput } from '../shared/reconciliation'
import { matchupTournamentEvidence } from '../shared/matchup-evidence'
import type { DeckConstraint, DeleteConstraintInput, SaveConstraintInput } from '../shared/constraints'
import { prepareDeckExport, type DeckExportPreview, type DeckExportRequest } from '../shared/deck-export'
import { WESTERN_ROTATION_RULES } from '../shared/standard-rotation'
import { PROMO_LEGALITY_SOURCE } from './promo-legality'
import { OFFICIAL_SET_RELEASE_SOURCE } from './official-set-releases'
import { SET_ADMISSION_OLDER_RULE_SOURCE, SET_ADMISSION_RULE_SOURCE } from '../shared/standard-admission'
import { ACE_SPEC_SOURCE, DECK_CONSTRUCTION_SOURCE } from '../shared/deck-construction'
import { BUNDLED_WESTERN_RULE_PACKAGE } from '../shared/western-rule-package'
import { TournamentStore } from './tournament-store'
import { fetchRecentWesternTournament } from './limitless-event'
import type { TournamentSnapshot } from '../shared/tournament'

app.setName('Pokeguru')

let mainWindow: BrowserWindow | null = null
let projectStore: ProjectStore | null = null
let catalogStore: CatalogStore | null = null
let tournamentStore: TournamentStore | null = null
let storageError: string | null = null
let aiPreferencesStore: AiPreferencesStore | null = null
const codexControl = new CodexControl()
const generatingProjects = new Set<string>()
const generatingDeckThreads = new Set<string>()
let catalogSyncing = false
let catalogRetryTimer: ReturnType<typeof setTimeout> | null = null

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
async function prepareMatchupHistory(discussion: MatchupDiscussion, config: AiRunConfig): Promise<MatchupDiscussion> {
  if (!projectStore) throw new Error(unavailableMessage())
  let current = discussion
  const lastToSummarize = current.turns.length - 5
  while (lastToSummarize > current.summarizedThrough) {
    const through = Math.min(current.summarizedThrough + 5, lastToSummarize)
    if (!current.turns[through]?.report) break
    const summary = await summarizeMatchupContext(current, through, config)
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
    mainWindow !== null && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame

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

  ipcMain.handle('projects:get', (event, id: unknown): OperationResult<Project | null> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.get(id as string))
  })

  ipcMain.handle('projects:create', (event, input: unknown): OperationResult<Project> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.create(input as Parameters<ProjectStore['create']>[0]))
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

  ipcMain.handle('deck:create-thread', (event, input: unknown): OperationResult<DeckThread> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.createDeckThread(input as CreateDeckThreadInput))
  })

  ipcMain.handle('deck:add-thread-message', (event, projectId: unknown, threadId: unknown, message: unknown): OperationResult<DeckThread> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    return withStore(() => projectStore!.addDeckThreadMessage(projectId as string, threadId as string, message as string))
  })

  ipcMain.handle('deck:ask-thread', async (event, projectId: unknown, threadId: unknown,
    message: unknown, override: unknown): Promise<OperationResult<DeckThread>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || typeof projectId !== 'string' || typeof threadId !== 'string' ||
      typeof message !== 'string' || !message.trim() || message.trim().length > 5000 || message.includes('\0'))
      return { ok: false, error: 'Scrivi una domanda da 1 a 5.000 caratteri.' }
    const project = projectStore.get(projectId)
    if (!project) return { ok: false, error: 'Progetto non trovato.' }
    if (project.circuit !== 'WESTERN') return { ok: false, error: 'Le sessioni Codex sono disponibili solo per il circuito occidentale.' }
    const thread = projectStore.listDeckThreads(projectId).find((item) => item.id === threadId)
    if (!thread) return { ok: false, error: 'Thread non trovato in questo progetto.' }
    if (generatingDeckThreads.has(threadId)) return { ok: false, error: 'Risposta Codex già in corso per questo thread.' }
    generatingDeckThreads.add(threadId)
    try {
      const config = await runConfig(override)
      const base = thread.baseVersionId
        ? projectStore.listDeckVersions(projectId).find((version) => version.id === thread.baseVersionId) ?? null
        : null
      const cwd = join(app.getPath('temp'), 'pokeguru-codex-deck')
      mkdirSync(cwd, { recursive: true })
      const prompt = deckDiscussionPrompt(thread, base, message.trim())
      const sessionId = thread.aiSessionRef ?? await codexControl.startThread(cwd, config)
      if (thread.aiSessionRef) await codexControl.resumeThread(sessionId, cwd)
      else projectStore.assignDeckAiSession(projectId, threadId, sessionId)
      const result = await codexControl.jsonTurn(sessionId, cwd, prompt, config, DECK_DISCUSSION_SCHEMA)
      const answer = readDeckDiscussionReply(result.value)
      return { ok: true, value: projectStore.saveDeckAiExchange(projectId, threadId, sessionId,
        message.trim(), answer, result.turnId, config) }
    } catch (error) {
      return { ok: false, error: aiError(error) }
    } finally {
      generatingDeckThreads.delete(threadId)
    }
  })

  ipcMain.handle('deck:propose-thread', async (event, projectId: unknown, threadId: unknown,
    request: unknown, override: unknown): Promise<OperationResult<DeckThread>> => {
    if (!isMainFrame(event)) return { ok: false, error: 'Richiesta non autorizzata.' }
    if (!projectStore || !catalogStore || typeof projectId !== 'string' || typeof threadId !== 'string' ||
      typeof request !== 'string' || !request.trim() || request.trim().length > 5000 || request.includes('\0'))
      return { ok: false, error: 'Descrivi una modifica da valutare (massimo 5.000 caratteri).' }
    const project = projectStore.get(projectId)
    if (!project) return { ok: false, error: 'Progetto non trovato.' }
    if (project.circuit !== 'WESTERN') return { ok: false, error: 'Le proposte Codex sono disponibili solo per il circuito occidentale.' }
    const thread = projectStore.listDeckThreads(projectId).find((item) => item.id === threadId)
    if (!thread) return { ok: false, error: 'Thread non trovato in questo progetto.' }
    if (!thread.baseVersionId) return { ok: false, error: 'Importa una lista prima di chiedere una proposta completa.' }
    if (generatingDeckThreads.has(threadId)) return { ok: false, error: 'Codex sta già lavorando su questo thread.' }
    generatingDeckThreads.add(threadId)
    try {
      const base = projectStore.listDeckVersions(projectId).find((version) => version.id === thread.baseVersionId)
      if (!base) throw new Error('Versione di partenza del thread non disponibile.')
      const config = await runConfig(override)
      const cwd = join(app.getPath('temp'), 'pokeguru-codex-deck')
      mkdirSync(cwd, { recursive: true })
      const catalog = catalogStore.view()
      const constraints = projectStore.listConstraints(projectId)
      const context = deckProposalPrompt(thread, base, request.trim(), constraints, catalog,
        tournamentStore?.latest() ?? null)
      const sessionId = thread.aiSessionRef ?? await codexControl.startThread(cwd, config)
      if (thread.aiSessionRef) await codexControl.resumeThread(sessionId, cwd)
      else projectStore.assignDeckAiSession(projectId, threadId, sessionId)
      const result = await codexControl.jsonTurn(sessionId, cwd, context.prompt, config, DECK_PROPOSAL_SCHEMA)
      const proposal = validateDeckProposal(result.value, projectId, catalog, constraints, context.sources)
      const citedSources = proposal.sources.filter((source) => !source.id.startsWith('print:'))
      const answer = proposal.rationale + (citedSources.length
        ? `\n\nFonti: ${citedSources.map((source) => source.label).join('; ')}.` : '')
      return { ok: true, value: projectStore.saveDeckAiExchange(projectId, threadId, sessionId,
        request.trim(), answer, result.turnId, config,
        proposal.outcome === 'candidate' ? { rawText: proposal.rawText, note: proposal.rationale,
          sources: proposal.sources, checks: proposal.checks } : undefined) }
    } catch (error) {
      return { ok: false, error: aiError(error) }
    } finally {
      generatingDeckThreads.delete(threadId)
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
        /^\/tournament\/[a-f0-9]{24}$/.test(url.pathname)
      if (url.protocol !== 'https:' || (!tcgdex && !limitless) || url.search || url.hash)
        return { ok: false, error: 'URL fonte non valido.' }
      await shell.openExternal(url.toString())
      return { ok: true, value: true }
    } catch { return { ok: false, error: 'Impossibile aprire la fonte.' } }
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
      const thread = projectStore!.listDeckThreads(request.projectId).find((item) => item.id === request.threadId)
      const candidate = thread?.candidates.find((item) => item.id === request.candidateId)
      if (!thread || !candidate) throw new Error('Candidata non trovata in questo progetto.')
      const today = new Date().toLocaleDateString('sv-SE')
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
    if (!projectStore) return { ok: false, error: unavailableMessage() }
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
    generatingProjects.add(projectId)
    try {
      const config = await runConfig(override)
      const sample = await fetchOpponentSample(opponent)
      const deckContext = matchupDeckContext(baseline, projectStore.getReconciliation(projectId), catalogStore?.view())
      const evidence = matchupTournamentEvidence(snapshot, opponent, tournamentStore?.latest() ?? null,
        catalogStore?.view() ?? null)
      const report = await generateMatchup(projectId, hash, deckContext, snapshot, opponent, sample, config, evidence)
      projectStore.saveMatchupReport(report)
      return { ok: true, value: report }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Analisi non completata.' }
    } finally {
      generatingProjects.delete(projectId)
    }
  })

  async function runRevision(discussionId: unknown, turnId: unknown, feedback: unknown,
    override: unknown): Promise<OperationResult<MatchupDiscussion>> {
    if (!projectStore || typeof discussionId !== 'string') return { ok: false, error: 'Discussione Matchup non valida.' }
    const discussion = projectStore.getMatchupDiscussion(discussionId)
    if (!discussion || generatingProjects.has(discussion.projectId)) return { ok: false, error: 'Discussione non trovata o analisi già in corso.' }
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
      const context = await prepareMatchupHistory(pending, config)
      const sample = await fetchOpponentSample(opponent)
      const deckContext = matchupDeckContext(baseline, projectStore.getReconciliation(discussion.projectId), catalogStore?.view())
      const evidence = [...context.turns].reverse().find((turn) => turn.report)?.report?.tournamentEvidence ??
        matchupTournamentEvidence(snapshot, opponent, tournamentStore?.latest() ?? null, catalogStore?.view() ?? null)
      const revised = await reviseMatchup(context, target.feedback, deckContext, snapshot, opponent, sample, config, evidence)
      return { ok: true, value: projectStore.completeMatchupFeedback(discussion.id, target.id, revised.report, revised.changeSummary) }
    } catch (error) {
      return { ok: false, error: aiError(error) }
    } finally {
      generatingProjects.delete(discussion.projectId)
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
    if (!projectStore || typeof discussionId !== 'string' || typeof metaId !== 'string')
      return { ok: false, error: 'Discussione Matchup non valida.' }
    const parent = projectStore.getMatchupDiscussion(discussionId)
    if (!parent || generatingProjects.has(parent.projectId)) return { ok: false, error: 'Discussione non trovata o analisi già in corso.' }
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
      const context = await prepareMatchupHistory(parent, config)
      const sample = await fetchOpponentSample(opponent)
      const deckContext = matchupDeckContext(baseline, projectStore.getReconciliation(parent.projectId), catalogStore?.view())
      const evidence = matchupTournamentEvidence(snapshot, opponent, tournamentStore?.latest() ?? null,
        catalogStore?.view() ?? null)
      const report = await generateMatchup(parent.projectId, hash, deckContext, snapshot, opponent, sample,
        config, evidence, matchupHistoryContext(context))
      return { ok: true, value: projectStore.saveContinuedMatchupReport(report, parent.id) }
    } catch (error) {
      return { ok: false, error: aiError(error) }
    } finally {
      generatingProjects.delete(parent.projectId)
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
    width: 1120,
    height: 760,
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  try {
    const override = process.env.POKEGURU_DATA_DIR
    if (override) {
      mkdirSync(override, { recursive: true })
      app.setPath('userData', override)
    }
    const databasePath = join(app.getPath('userData'), 'data', 'pokeguru.sqlite')
    projectStore = new ProjectStore(databasePath)
    catalogStore = new CatalogStore(databasePath)
    tournamentStore = new TournamentStore(databasePath)
    const previousJob = catalogStore.jobStatus()
    if (previousJob.state === 'paused' && previousJob.mode) {
      setTimeout(() => runCatalogJob(previousJob.mode!), 2_000)
    }
    aiPreferencesStore = new AiPreferencesStore(app.getPath('userData'))
  } catch (error) {
    console.error('Impossibile aprire l’archivio locale:', error)
    storageError = 'Archivio locale non disponibile. Controlla i permessi della cartella dati e riavvia l’app.'
  }

  registerProjectHandlers()
  createWindow()

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
  projectStore = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
