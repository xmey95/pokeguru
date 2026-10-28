import type { AiJobSummary } from '../shared/ai-job'
import type { CatalogSyncStatus } from '../shared/catalog'
import type { DailySyncState } from '../shared/daily-sync'
import type { MainTournamentSyncProgress } from '../shared/main-tournament'
import type { TournamentSyncProgress } from '../shared/tournament'
import { readAiDiagnostics } from '../shared/ai-diagnostics'

export type UiLongTask = { at: string; durationMs: number }
export type RuntimeIncident = { at: string; kind: 'unresponsive' | 'renderer-gone'; reason?: string }

type Source = 'catalog' | 'play' | 'main'
type DailyStates = Record<Source, DailySyncState | null>

export interface DiagnosticInput {
  generatedAt: string
  version: string
  packaged: boolean
  platform: string
  architecture: string
  electron: string
  chrome: string
  node: string
  uptimeSeconds: number
  mainHeapBytes: number
  backendHeapBytes?: number
  database: { available: boolean; issue: 'integrity' | 'unavailable' | null; bytes: number | null; walBytes: number | null }
  projects: { active: number; archived: number } | null
  catalog: { sets: number; prints: number; groups: number; thumbnails: number; highImages: number;
    missingImages: number; syncedAt: string | null; coverageExpected: number | null; coverageAcquired: number | null } | null
  events: { play: number; regional: number } | null
  catalogSync: CatalogSyncStatus | null
  playSync: TournamentSyncProgress | null
  mainSync: MainTournamentSyncProgress | null
  daily: DailyStates
  jobs: AiJobSummary[] | null
  jobRuntime?: Record<string, { controllerActive: boolean; callActive: boolean;
    abortRequested: boolean; resultFilePresent: boolean; requestPrepared: boolean;
    validatedDraft: boolean | null; resultPrepared: boolean }>
  uiLongTasks: UiLongTask[]
  incidents: RuntimeIncident[]
  collectionMs: number
  unavailableSections: string[]
}

function errorCategory(value: string | null | undefined): 'none' | 'rate-limit' | 'network' | 'storage' | 'auth' | 'other' {
  if (!value) return 'none'
  if (/429|rate.?limit|temporan|cooldown/i.test(value)) return 'rate-limit'
  if (/fetch|network|rete|timeout|503|502|offline|connession/i.test(value)) return 'network'
  if (/sqlite|database|archivio|disk|disco|storage|scrittura/i.test(value)) return 'storage'
  if (/auth|login|accesso|token|credenzial/i.test(value)) return 'auth'
  return 'other'
}

function daily(value: DailySyncState | null) {
  return value ? { lastAttemptAt: value.lastAttemptAt, lastSuccessAt: value.lastSuccessAt,
    trigger: value.trigger, outcome: value.outcome, nextAttemptAt: value.nextAttemptAt,
    errorCategory: errorCategory(value.error) } : null
}

function duration(start: string, end: string): number | null {
  const milliseconds = Date.parse(end) - Date.parse(start)
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : null
}

/** Explicit allowlist: never serialize store objects, raw error text, deck data or AI content. */
export function buildDiagnosticReport(input: DiagnosticInput) {
  const tasks = input.uiLongTasks.slice(-50)
  const recentJobs = input.jobs?.slice(0, 30).map((job) => ({ kind: job.kind, status: job.status,
    createdAt: job.createdAt, updatedAt: job.updatedAt,
    elapsedMs: duration(job.createdAt,
      job.status === 'running' || job.status === 'ready' ? input.generatedAt : job.updatedAt),
    sinceLastUpdateMs: duration(job.updatedAt, input.generatedAt),
    progress: job.progress ? { phase: job.progress.phase, updatedAt: job.progress.updatedAt,
      steps: job.progress.steps.slice(-12).map((step) => ({ phase: step.phase, at: step.at })) } : null,
    diagnostics: readAiDiagnostics(job.progress?.diagnostics),
    execution: input.jobRuntime?.[job.id] ? {
      controllerActive: input.jobRuntime[job.id].controllerActive,
      callActive: input.jobRuntime[job.id].callActive,
      abortRequested: input.jobRuntime[job.id].abortRequested,
      resultFilePresent: input.jobRuntime[job.id].resultFilePresent,
      requestPrepared: input.jobRuntime[job.id].requestPrepared,
      validatedDraft: input.jobRuntime[job.id].validatedDraft,
      resultPrepared: input.jobRuntime[job.id].resultPrepared } : null,
    errorCategory: errorCategory(job.error) })) ?? null
  return {
    schemaVersion: 3,
    generatedAt: input.generatedAt,
    privacy: { contentExcluded: ['nomi e liste dei progetti', 'messaggi e risposte AI',
      'identificativi dei job', 'URL e percorsi locali', 'credenziali e token', 'testi degli errori'],
    transmission: 'Nessun invio automatico; file salvato solo dopo azione dell’utente.' },
    app: { version: input.version, packaged: input.packaged, platform: input.platform,
      architecture: input.architecture, electron: input.electron, chrome: input.chrome,
      node: input.node, uptimeSeconds: Math.round(input.uptimeSeconds), mainHeapBytes: input.mainHeapBytes,
      backendHeapBytes: input.backendHeapBytes ?? null },
    security: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      navigationBlocked: true, newWindowsBlocked: true, packagedCsp: input.packaged,
      devToolsEnabled: !input.packaged },
    database: input.database,
    projects: input.projects,
    catalog: input.catalog,
    events: input.events,
    sync: {
      catalog: input.catalogSync ? { state: input.catalogSync.state, mode: input.catalogSync.mode,
        running: input.catalogSync.running, expected: input.catalogSync.expected,
        acquired: input.catalogSync.acquired, cooldownUntil: input.catalogSync.cooldownUntil,
        errorCategory: errorCategory(input.catalogSync.error) } : null,
      play: input.playSync ? { status: input.playSync.status, mode: input.playSync.mode,
        active: input.playSync.active ?? false, page: input.playSync.page,
        inspected: input.playSync.inspected, saved: input.playSync.saved,
        skipped: input.playSync.skipped, pending: input.playSync.pending.length,
        cooldownUntil: input.playSync.cooldownUntil, errorCategory: errorCategory(input.playSync.lastError) } : null,
      regional: input.mainSync ? { status: input.mainSync.status, mode: input.mainSync.mode,
        active: input.mainSync.active ?? false, page: input.mainSync.page,
        inspectedEvents: input.mainSync.inspectedEvents, fetchedLists: input.mainSync.fetchedLists,
        pendingEvents: input.mainSync.pendingEvents.length,
        pendingLists: input.mainSync.pendingLists.length,
        unavailableEvents: input.mainSync.unavailableEvents.length,
        unavailableLists: input.mainSync.unavailableLists.length,
        cooldownUntil: input.mainSync.cooldownUntil, errorCategory: errorCategory(input.mainSync.lastError) } : null,
      daily: { catalog: daily(input.daily.catalog), play: daily(input.daily.play),
        regional: daily(input.daily.main) }
    },
    ai: { recentJobs },
    performance: { collectionMs: Math.round(input.collectionMs), uiLongTaskCount: tasks.length,
      uiLongTaskMaxMs: tasks.length ? Math.round(Math.max(...tasks.map((task) => task.durationMs))) : 0,
      recentUiLongTasks: tasks.map((task) => ({ at: task.at, durationMs: Math.round(task.durationMs) })),
      incidents: input.incidents.slice(-20).map((incident) => ({ at: incident.at, kind: incident.kind,
        ...(incident.kind === 'renderer-gone' ? { reason: ['crashed', 'killed', 'oom',
          'launch-failed', 'integrity-failure'].includes(incident.reason ?? '') ? incident.reason : 'other' } : {}) })) },
    unavailableSections: input.unavailableSections
  }
}
