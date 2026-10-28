import type { CatalogSyncStatus } from '../../shared/catalog'
import type { TournamentSyncProgress } from '../../shared/tournament'
import type { MainTournamentSyncProgress } from '../../shared/main-tournament'
import type { AiJobSummary } from '../../shared/ai-job'

export type AlertState = 'working' | 'paused' | 'complete' | 'failed' | 'cancelled'
export type AlertSource = 'catalog' | 'play' | 'main' | 'ai'
export interface ObservedJob {
  key: string
  source: AlertSource
  state: AlertState
  title: string
  detail: string
  projectId?: string
  resourceId?: string
  aiKind?: AiJobSummary['kind']
}
export interface AlertLedger {
  sources: Partial<Record<AlertSource, true>>
  jobs: Record<string, AlertState>
}
export const emptyAlertLedger = (): AlertLedger => ({ sources: {}, jobs: {} })

/** The first successful read of each source establishes a baseline for old jobs. */
export function observeJobs(ledger: AlertLedger, source: AlertSource, jobs: ObservedJob[]): ObservedJob[] {
  const baseline = !ledger.sources[source]
  ledger.sources[source] = true
  const alerts: ObservedJob[] = []
  for (const job of jobs) {
    const previous = ledger.jobs[job.key]
    if (!baseline && job.state !== 'working' && job.state !== 'paused' &&
      previous !== job.state) alerts.push(job)
    ledger.jobs[job.key] = job.state
  }
  // Recent AI jobs and the latest run of each acquisition are sufficient for deduplication.
  const keys = Object.keys(ledger.jobs)
  for (const key of keys.slice(0, Math.max(0, keys.length - 200))) delete ledger.jobs[key]
  return alerts
}

export function catalogObservation(status: CatalogSyncStatus): ObservedJob[] {
  if (!status.runId) return []
  const state: AlertState = status.state === 'done' ? 'complete'
    : status.state === 'cancelled' ? 'cancelled'
      : status.state === 'paused' && status.error ? 'failed'
        : status.state === 'paused' || status.state === 'interrupted' ? 'paused' : 'working'
  const operation = status.mode === 'full' ? 'Scansione completa del Catalogo' : 'Aggiornamento del Catalogo'
  const feminine = status.mode === 'full'
  return [{ key: `catalog:${status.runId}`, source: 'catalog', state,
    title: `${operation} ${state === 'complete' ? feminine ? 'completata' : 'completato'
      : state === 'failed' ? 'in pausa per errore' : state === 'cancelled' ? feminine ? 'annullata' : 'annullato' : 'in corso'}`,
    detail: state === 'complete' ? 'Le carte acquisite sono disponibili nel Catalogo.'
      : state === 'failed' ? status.error ?? 'Apri il Catalogo per controllare il problema.'
        : state === 'cancelled' ? 'I dati già acquisiti restano disponibili.' : '' }]
}

export function tournamentObservation(source: 'play' | 'main', status: TournamentSyncProgress | MainTournamentSyncProgress): ObservedJob[] {
  if (!status.runId) return []
  const state: AlertState = status.active ? 'working' : status.lastError ? 'failed'
    : status.status === 'complete' ? 'complete' : 'paused'
  const operation = source === 'play' ? 'Acquisizione Eventi Play' : 'Acquisizione Regional'
  return [{ key: `${source}:${status.runId}`, source, state,
    title: `${operation} ${state === 'complete' ? 'completata' : state === 'failed' ? 'interrotta' : 'in corso'}`,
    detail: state === 'complete' ? 'Gli eventi acquisiti sono disponibili offline.'
      : state === 'failed' ? status.lastError ?? 'Apri Eventi per controllare il problema.' : '' }]
}

export function aiObservations(jobs: AiJobSummary[]): ObservedJob[] {
  return jobs.map((job) => {
    const state: AlertState = job.status === 'applied' ? 'complete'
      : job.status === 'failed' ? 'failed' : job.status === 'cancelled' ? 'cancelled'
        : job.status === 'interrupted' ? ['failure', 'legacy'].includes(job.progress?.diagnostics?.suspensionReason ?? '')
          ? 'failed' : 'paused' : 'working'
    const kind = job.kind.startsWith('thread') ? 'Thread' : 'Matchup'
    return { key: `ai:${job.id}`, source: 'ai', state, projectId: job.projectId,
      resourceId: job.resourceId, aiKind: job.kind,
      title: `Analisi ${kind} ${state === 'complete' ? 'completata' : state === 'failed' ? 'non riuscita'
        : state === 'cancelled' ? 'annullata' : 'in corso'}`,
      detail: state === 'complete' ? `Apri ${kind} per vedere il risultato.`
        : state === 'failed' ? job.error ?? 'Apri il lavoro per controllare il problema.'
          : state === 'cancelled' ? 'Nessun risultato è stato applicato.' : '' }
  })
}
