import { join } from 'node:path'
import { AiJobStore } from '../../src/main/ai-job-store'
import { AiAnalysisWork } from '../../src/main/ai-analysis-work'
import { ProjectStore } from '../../src/main/project-store'
import { guideHash, type GuidePacket } from '../../src/main/matchup-guide-packet'
import { guideCampaignAllowance, type GuideCampaignCounts, type GuideCampaignCeilings } from '../../src/main/guide-campaign-budget'
import { guideDeliveryBudget } from '../../src/shared/guide-delivery'

export interface CampaignStartInput {
  database: string
  directory: string
  campaignId: string
  caseId: string
  projectId: string
  packet: GuidePacket
  counts: GuideCampaignCounts[]
  caps: number[]
  ceilings: GuideCampaignCeilings
  calibration: unknown[]
  request: string
  authorityReference: string
}

/** Identity is fixed in the campaign manifest, never a per-attempt nonce. */
export function guideCampaignResource(campaignId: string, caseId: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(campaignId) || !caseId.trim())
    throw Error('Identità della campagna non valida.')
  return 'bounded-delivery-1:campaign:' + campaignId + ':' + guideHash(caseId)
}

/** Shared by the real runner and its offline gate. No provider is invoked here.
 * All inherited jobs/evidence remain in place; only the new campaign's resource
 * is isolated. Accounting uses the entire linked database, not this resource. */
export function startGuideCampaignCase(input: CampaignStartInput) {
  const resourceId = guideCampaignResource(input.campaignId, input.caseId)
  const index = input.counts.findIndex(c => c.id === input.caseId)
  if (input.caps.length !== input.counts.length || input.caps.some((cap, i) =>
    !Number.isSafeInteger(cap) || cap < 1 || cap > input.ceilings.perGuide || input.counts[i].calls > cap))
    throw Error('Tetti cumulativi della campagna non validi.')
  const allowance = guideCampaignAllowance(input.counts, input.caseId, input.ceilings)
  allowance.remaining = Math.min(allowance.remaining, input.caps[index] - allowance.consumedByGuide)
  const maximum = guideDeliveryBudget().maximum
  if (allowance.remaining < maximum) throw Error('Profilo completo non ammesso dal budget cumulativo.')
  if (input.packet.basis.projectId !== input.projectId) throw Error('Progetto della lista non coerente.')
  const projects = new ProjectStore(input.database)
  let jobs: AiJobStore | undefined, work: AiAnalysisWork | undefined
  try {
    if (projects.getCurrentDeckHash(input.projectId) !== input.packet.basis.deckHash)
      throw Error('La lista corrente non coincide con quella congelata.')
    jobs = new AiJobStore(input.database)
    // A terminal/paused job cannot be replaced by another job under this identity.
    if (jobs.latest(input.projectId, resourceId)) throw Error('Campagna già avviata su questa risorsa; nessun riavvio implicito.')
    const job = jobs.start('matchup-generate', input.projectId, resourceId)
    const controller = new AbortController()
    work = new AiAnalysisWork(join(input.directory, job.id), jobs, job.id, controller.signal)
    work.archive.saveValues(input.calibration.map((value, i) => ({ role: 'guide-token-sample', key: 'inherited-calibration-' + i, value })))
    const callBudgetAuthorization = { jobId: job.id, projectId: input.projectId,
      dependencyHash: input.packet.basis.dependencyHash, maximum: Math.min(maximum, allowance.remaining),
      reason: 'Explicit bounded campaign authority ' + input.authorityReference + '; inherited calls remain counted.' }
    const boundJobs = jobs, boundWork = work
    return { job, jobs: boundJobs, projects, work: boundWork, controller, resourceId, allowance, maximum,
      generation: { packet: input.packet, work: boundWork, request: input.request, attemptLimit: maximum, callBudgetAuthorization },
      close() { boundWork.close(); boundJobs.close(); projects.close() } }
  } catch (error) {
    work?.close(); jobs?.close(); projects.close(); throw error
  }
}
