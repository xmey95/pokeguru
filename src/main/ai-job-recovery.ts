import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AiRunConfig } from '../shared/ai'
import type { CatalogView } from '../shared/catalog'
import type { DeckConstraint } from '../shared/constraints'
import type { DeckVersion } from '../shared/deck-threads'
import { readAiTokenUsage } from '../shared/ai-evidence'
import type { DeckCandidate } from '../shared/deck-threads'
import type { ThreadEvidencePacket } from '../shared/thread-evidence'
import type { MatchupReport } from '../shared/meta-matchups'
import { CatalogStore } from './catalog'
import { CodexControl } from './codex-control'
import { readDeckDiscussionReply, readDeckDiscussionSourceIds, readDeckThreadTurn,
  validateDeckProposal } from './deck-ai'
import { ProjectStore } from './project-store'
import { AiJobStore, type AiJob } from './ai-job-store'
import { makeAiPromptAudit } from './ai-evidence-queries'
import { readMatchupAnalysis } from './matchup-analysis'
import { hasStrategyPhases } from '../shared/meta-matchups'
import { aiFailureCode } from './ai-failure'
import { AiEvidenceArchive } from './ai-evidence-archive'

interface ThreadRequest {
  schemaVersion?: number
  validatedDraft?: boolean
  message: string
  existingUserMessageId?: string
  config: AiRunConfig
  evidence: ThreadEvidencePacket
  sources?: DeckCandidate['sources']
}

interface ThreadResult {
  sessionId: string
  turnId: string
  value: unknown
  usage?: unknown
}

/** Finalize a failed invocation; true means its artifacts can be discarded. */
export function settleFailedAiJob(jobs: AiJobStore, id: string, error: unknown,
  aborted: boolean, hasResult: boolean): boolean {
  const current = jobs.get(id)
  if (!current || current.status === 'applied') return false
  if (current.status === 'cancelled') return true
  if (aborted) {
    jobs.transition(id, 'cancelled')
    return true
  }
  const message = error instanceof Error ? error.message : 'Operazione AI non completata.'
  jobs.recordDiagnostics(id, { failureCode: aiFailureCode(error) })
  const request = current.request as { validatedDraft?: boolean } | null
  // A CLI file may be an internal draft, rejected by the evidence gate. Recovery
  // refuses these drafts too; keeping one running cannot finish the user's turn.
  const recoverableFile = current.status === 'running' && hasResult &&
    request && request.validatedDraft !== false
  if (recoverableFile || current.status === 'ready') {
    jobs.noteError(id, message)
    return false
  }
  jobs.transition(id, 'failed', message)
  return true
}

function readResult(path: string): unknown {
  if (statSync(path).size > 100_000) throw new Error('Risultato Codex troppo lungo.')
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

/** Replays a generated Thread result after a process interruption without starting a new model turn. */
export async function recoverThreadJob(job: AiJob, jobs: AiJobStore, projects: ProjectStore,
  catalog: CatalogStore, codex: Pick<CodexControl, 'latestTurnId'>,
  directory: string): Promise<'applied' | 'interrupted'> {
  if (job.kind !== 'thread-ask' && job.kind !== 'thread-propose') throw new Error('Job Thread non valido.')
  if (job.status === 'running' && !existsSync(join(directory, 'result.json'))) {
    jobs.transition(job.id, 'interrupted', 'Codex è stato interrotto prima di produrre il risultato.')
    return 'interrupted'
  }
  const thread = projects.getDeckThread(job.projectId, job.resourceId)
  if (!thread) throw new Error('Thread del job non trovato nel progetto.')
  const request = job.request as ThreadRequest | null
  if (!request || typeof request.message !== 'string' || !request.config || !request.evidence)
    throw new Error('Contesto del job Codex incompleto.')
  if (job.status === 'running' && request.validatedDraft === false) {
    jobs.transition(job.id, 'interrupted', 'Bozza interrotta prima della verifica delle schede. Riprova il turno.')
    return 'interrupted'
  }
  let result = job.result as ThreadResult | null
  if (job.status === 'running') {
    const path = join(directory, 'result.json')
    const sessionPath = join(directory, 'session-id.txt')
    const sessionId = existsSync(sessionPath) ? readFileSync(sessionPath, 'utf8').trim()
      : thread.aiSessionRef
    if (!sessionId || sessionId.length > 200) throw new Error('Sessione Codex non recuperabile.')
    const value = readResult(path)
    const turnId = await codex.latestTurnId(sessionId)
    result = { sessionId, turnId, value }
    jobs.ready(job.id, result)
  }
  if (!result || typeof result.sessionId !== 'string' || typeof result.turnId !== 'string')
    throw new Error('Risultato del job non leggibile.')
  if (thread.messages.some((message) => message.aiTurnId === result!.turnId)) {
    jobs.transition(job.id, 'applied')
    return 'applied'
  }
  const archive = new AiEvidenceArchive(jobs.filePath, job, true)
  let frozen: { catalog?: CatalogView; constraints?: DeckConstraint[]; base?: DeckVersion | null; referenceDate?: string }
  try {
    frozen = { catalog: archive.value<{ catalog: CatalogView }>('snapshot', 'sources')?.catalog,
      constraints: archive.value<DeckConstraint[]>('input', 'constraints'),
      base: archive.value<DeckVersion | null>('input', 'base'),
      referenceDate: archive.value<string>('input', 'reference-date') }
  } finally { archive.close() }
  const newTurn = job.kind === 'thread-ask' && request.schemaVersion === 2
    ? readDeckThreadTurn(result.value, job.projectId,
      frozen.base !== undefined ? frozen.base : thread.baseVersionId ? projects.listDeckVersions(job.projectId)
        .find((version) => version.id === thread.baseVersionId) ?? null : null,
      frozen.catalog ?? catalog.view(), frozen.constraints ?? projects.listConstraints(job.projectId), request.evidence,
      request.sources ?? [], frozen.referenceDate) : null
  const answer = newTurn?.answer ?? (job.kind === 'thread-ask'
    ? readDeckDiscussionReply(result.value) : null)
  const sources = newTurn?.citedSourceIds ?? readDeckDiscussionSourceIds(result.value, request.evidence)
  let proposal: { rawText: string; note: string; sources: DeckCandidate['sources']; checks: string[] } | undefined = newTurn?.proposal
  let response = answer
  if (job.kind === 'thread-propose') {
    const checked = validateDeckProposal(result.value, job.projectId, catalog.view(),
      projects.listConstraints(job.projectId), request.sources ?? [])
    response = checked.rationale
    if (checked.outcome === 'candidate') proposal = { rawText: checked.rawText,
      note: checked.rationale, sources: checked.sources, checks: checked.checks }
  }
  if (!thread.aiSessionRef) projects.assignDeckAiSession(job.projectId, job.resourceId, result.sessionId)
  if (request.evidence.promptAudit) request.evidence.promptAudit = makeAiPromptAudit(
    request.evidence.promptAudit.text, request.evidence.promptAudit.durationMs,
    readAiTokenUsage(result.usage))
  projects.saveDeckAiExchange(job.projectId, job.resourceId, result.sessionId,
    request.message, response!, result.turnId, request.config, proposal, request.evidence, sources,
    request.existingUserMessageId)
  jobs.transition(job.id, 'applied')
  return 'applied'
}

type MatchupBase = Omit<MatchupReport, 'strengths' | 'weaknesses' | 'ourKeyCards' |
  'theirKeyCards' | 'strategy' | 'limitations'>
interface MatchupRequest {
  analysisVersion?: 2
  validatedDraft?: boolean
  base: MatchupBase
  discussionId?: string
  turnId?: string
  parentId?: string
}
interface MatchupResult { report: MatchupReport; changeSummary?: string }

function matchupResult(job: AiJob, request: MatchupRequest, raw: unknown): MatchupResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Analisi Codex non valida.')
  const value = raw as Record<string, unknown>
  const analysis = readMatchupAnalysis(raw, request.analysisVersion ?? 1)
  if (job.kind === 'matchup-revise' &&
    (typeof value.changeSummary !== 'string' || value.changeSummary.length > 5000))
    throw new Error('Riepilogo della revisione non valido.')
  return { report: { ...request.base, jobId: job.id,
    ...analysis },
  ...(job.kind === 'matchup-revise' ? { changeSummary: value.changeSummary as string } : {}) }
}

/** Replays a generated Matchup report after a process interruption without another Codex call. */
export function recoverMatchupJob(job: AiJob, jobs: AiJobStore, projects: ProjectStore,
  directory: string): 'applied' | 'interrupted' {
  if (!job.kind.startsWith('matchup-')) throw new Error('Job Matchup non valido.')
  if (job.status === 'running' && !existsSync(join(directory, 'result.json'))) {
    jobs.transition(job.id, 'interrupted', 'Codex è stato interrotto prima di produrre il risultato.')
    return 'interrupted'
  }
  const request = job.request as MatchupRequest | null
  if (!request?.base || request.base.projectId !== job.projectId || request.base.jobId !== job.id)
    throw new Error('Contesto Matchup del job incompleto.')
  if (job.status === 'running' && request.validatedDraft === false) {
    jobs.transition(job.id, 'interrupted', 'Bozza interrotta prima della verifica delle schede. Riprova la guida.')
    return 'interrupted'
  }
  let result = job.result as MatchupResult | null
  if (job.status === 'running') {
    const path = join(directory, 'result.json')
    result = matchupResult(job, request, readResult(path))
    jobs.ready(job.id, result)
  }
  if (!result?.report || result.report.jobId !== job.id)
    throw new Error('Risultato Matchup del job non leggibile.')
  if (request.analysisVersion === 2 && !hasStrategyPhases(result.report.strategyPhases))
    throw new Error('Il piano di gioco è incompleto. Riprova.')
  if (projects.hasMatchupJobResult(job.id)) {
    jobs.transition(job.id, 'applied')
    return 'applied'
  }
  if (!result.report.deckVersionId) {
    const baseline = projects.getBaseline(job.projectId)
    const context = projects.getCurrentDeckContext(job.projectId)
    const matchingVersions = baseline ? projects.listDeckVersions(job.projectId)
      .filter((version) => version.rawText === baseline.rawText) : []
    if (!context || !baseline || matchingVersions.length !== 1 ||
      projects.getCurrentDeckHash(job.projectId) !== result.report.deckHash)
      throw new Error('La base della guida precedente non è determinabile. Riprova sulla lista corrente.')
    result = { ...result, report: { ...result.report,
      deckVersionId: context.versionId, deckResolutionId: context.resolutionId } }
  }
  if (job.kind === 'matchup-generate') projects.saveMatchupReport(result.report)
  else if (job.kind === 'matchup-revise') {
    if (!request.discussionId || !request.turnId || typeof result.changeSummary !== 'string')
      throw new Error('Revisione Matchup incompleta.')
    projects.completeMatchupFeedback(request.discussionId, request.turnId,
      result.report, result.changeSummary)
  } else {
    if (!request.parentId) throw new Error('Discussione Matchup di origine mancante.')
    projects.saveContinuedMatchupReport(result.report, request.parentId)
  }
  jobs.transition(job.id, 'applied')
  return 'applied'
}
