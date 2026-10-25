import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AiRunConfig } from '../shared/ai'
import type { DeckCandidate } from '../shared/deck-threads'
import type { ThreadEvidencePacket } from '../shared/thread-evidence'
import type { MatchupReport } from '../shared/meta-matchups'
import { CatalogStore } from './catalog'
import { CodexControl } from './codex-control'
import { readDeckDiscussionReply, readDeckDiscussionSourceIds, validateDeckProposal } from './deck-ai'
import { ProjectStore } from './project-store'
import { AiJobStore, type AiJob } from './ai-job-store'

interface ThreadRequest {
  message: string
  config: AiRunConfig
  evidence: ThreadEvidencePacket
  sources?: DeckCandidate['sources']
}

interface ThreadResult {
  sessionId: string
  turnId: string
  value: unknown
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
  const answer = job.kind === 'thread-ask'
    ? readDeckDiscussionReply(result.value) : null
  const sources = readDeckDiscussionSourceIds(result.value, request.evidence)
  let proposal: { rawText: string; note: string; sources: DeckCandidate['sources']; checks: string[] } | undefined
  let response = answer
  if (job.kind === 'thread-propose') {
    const checked = validateDeckProposal(result.value, job.projectId, catalog.view(),
      projects.listConstraints(job.projectId), request.sources ?? [])
    response = checked.rationale
    if (checked.outcome === 'candidate') proposal = { rawText: checked.rawText,
      note: checked.rationale, sources: checked.sources, checks: checked.checks }
  }
  if (!thread.aiSessionRef) projects.assignDeckAiSession(job.projectId, job.resourceId, result.sessionId)
  projects.saveDeckAiExchange(job.projectId, job.resourceId, result.sessionId,
    request.message, response!, result.turnId, request.config, proposal, request.evidence, sources)
  jobs.transition(job.id, 'applied')
  return 'applied'
}

type MatchupBase = Omit<MatchupReport, 'strengths' | 'weaknesses' | 'ourKeyCards' |
  'theirKeyCards' | 'strategy' | 'limitations'>
interface MatchupRequest {
  base: MatchupBase
  discussionId?: string
  turnId?: string
  parentId?: string
}
interface MatchupResult { report: MatchupReport; changeSummary?: string }
const matchupFields = ['strengths', 'weaknesses', 'ourKeyCards', 'theirKeyCards',
  'strategy', 'limitations'] as const

function matchupResult(job: AiJob, request: MatchupRequest, raw: unknown): MatchupResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Analisi Codex non valida.')
  const value = raw as Record<string, unknown>
  for (const field of matchupFields) if (typeof value[field] !== 'string' || value[field].length > 5000)
    throw new Error('Analisi Codex non valida.')
  if (job.kind === 'matchup-revise' &&
    (typeof value.changeSummary !== 'string' || value.changeSummary.length > 5000))
    throw new Error('Riepilogo della revisione non valido.')
  return { report: { ...request.base, jobId: job.id,
    strengths: value.strengths as string, weaknesses: value.weaknesses as string,
    ourKeyCards: value.ourKeyCards as string, theirKeyCards: value.theirKeyCards as string,
    strategy: value.strategy as string, limitations: value.limitations as string },
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
  let result = job.result as MatchupResult | null
  if (job.status === 'running') {
    const path = join(directory, 'result.json')
    result = matchupResult(job, request, readResult(path))
    jobs.ready(job.id, result)
  }
  if (!result?.report || result.report.jobId !== job.id)
    throw new Error('Risultato Matchup del job non leggibile.')
  if (projects.hasMatchupJobResult(job.id)) {
    jobs.transition(job.id, 'applied')
    return 'applied'
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
