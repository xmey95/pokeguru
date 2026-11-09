import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ProjectStore } from '../../src/main/project-store'
import { AiJobStore } from '../../src/main/ai-job-store'
import { AiEvidenceArchive } from '../../src/main/ai-evidence-archive'
import { syntheticSegmentProtocol } from './guide-segment-protocol'
import { constructGuideMainLines } from '../../src/main/guide-mainline-phase'
import { constructGuideReplyPlans, constructGuideReplyBranches, type GuideConstructionRuntime } from '../../src/main/guide-reply-phase'
import { createGuideReplyChoiceContext, guideReplyPlanChoiceRequest } from '../../src/main/guide-reply-plan-choice'
import { guideHash, guideSource } from '../../src/main/matchup-guide-packet'
import { planGuideRequest, guideStageFamily } from '../../src/main/guide-request-budget'
import { guideReplySeeds, type GuideReplyPlan } from '../../src/main/guide-reply-plan'
import { readGuideReplyObligationOrigins } from '../../src/main/guide-obligation-origins'
import { guideObligationAssessmentRequest } from '../../src/main/guide-obligation-assessment'

export async function guideObligationFixture() {
  const folder = mkdtempSync(join(tmpdir(), 'app231-origins-')), file = join(folder, 'data.sqlite'), projects = new ProjectStore(file), jobs = new AiJobStore(file)
  const project = projects.create({ name: 'Independent complete origin fixture', format: 'STANDARD' }), job = jobs.start('matchup-generate', project.id, 'generic-matchup'), archive = new AiEvidenceArchive(file, job)
  const protocol = syntheticSegmentProtocol(project.id), scope = { projectId: project.id, jobId: job.id, dependencyHash: protocol.packet.basis.dependencyHash, configHash: guideHash({ test: 'origin-provenance' }) }
  let calls = 0
  let constructorNote: string | null = null
  const options: GuideConstructionRuntime = { scope, packet: protocol.packet, archive, call: async r => {
    calls++
    const raw = protocol.response(r.stage, r.data, r.schema) as any
    if (constructorNote && r.role === 'constructor') for (const unit of raw?.units ?? []) if (unit.response?.development) unit.response.development.reason = constructorNote
    return r.read(raw)
  },
    estimate: r => planGuideRequest(r.stage, r.instructions, r.data, r.schema, [], 100, r.reserveCalls, r.units).budget, isCached: () => false, remainingCalls: () => 100, check: () => {}, reserveOutside: 3 }
  const initial = protocol.response('plan', {}, {}) as any, setup = (protocol.response('setup-1', { caseId: 'scenario-1' }, {}) as any).caseSetup
  const main = (await constructGuideMainLines({ ...options, setups: [{ ...setup, opening: initial.initialOpenings[0].opening }] }))[0].journal
  const before = (await constructGuideReplyPlans([main], options))[0]
  const branches = await constructGuideReplyBranches([main], [before], options)
  const construction = (plan: GuideReplyPlan, branches: Awaited<ReturnType<typeof constructGuideReplyBranches>>) => guideHash({ main: main.segments[2].hash,
    branches: branches.map(b => ({ seed: b.seed, line: b.line, head: b.journal.segments.at(-1)!.hash })) })
  const need = (plan: GuideReplyPlan, branches: Awaited<ReturnType<typeof constructGuideReplyBranches>>, goal: string) => {
    const value = { kind: 'needs-branches', caseId: main.setup.id, constructionHash: construction(plan, branches), requirements: [{ goal, reason: 'Retain exact original requirements', sourceIds: ['card:p'] }] }
    archive.saveValue('guide-metadata-needs-v1', guideHash(value), value); return value
  }
  return { archive, options, main, before, branches, need, file, get calls() { return calls }, setConstructorNote(value: string) { constructorNote = value },
    async adopt(previous: GuideReplyPlan = before, previousBranches = branches, replacementGoal?: string) {
      const first = need(previous, previousBranches, replacementGoal ?? 'Original requirement for the first additional witness'), selection = { scope, packetHash: guideHash(options.packet), caseId: main.setup.id, mainHash: previous.mainHash, before: previous, requirements: first.requirements }, key = guideHash(selection)
      archive.saveValue('guide-reply-plan-selection-v1', key, selection)
      const added = { id: 'scenario-1-reply-extra-1', role: 'other' as const, intent: 'attack' as const, goal: replacementGoal ?? 'An adopted additional intention', sourceIds: ['card:p'] }
      const proposal: GuideReplyPlan = { ...structuredClone(previous), others: replacementGoal ? previous.others.map(s => s.id === added.id ? added : s) : [...previous.others, added] }
      // This helper creates a synthetic model proposal before the ordinary
      // choice reader. Keep its accepted source, just like the real transport,
      // so provenance tests never rely on an unrecorded host-authored seed.
      const sourceId='synthetic-fixture-proposal-'+guideHash(proposal),source={stage:'synthetic-fixture-plan',batchHash:sourceId,unitId:sourceId,unitKey:sourceId,retryOrdinal:0,accepted:true,value:proposal,raw:structuredClone(proposal)}
      archive.saveValue('guide-segment-unit-result-v1',guideHash(source),source)
      const context = createGuideReplyChoiceContext(key, previous, proposal, first.requirements, previousBranches, main, options)
      const decision = { caseId: main.setup.id, contextHash: guideHash(context), choices: guideReplySeeds(proposal).map(seed => ({ id: seed.id,
        source: seed.id === 'scenario-1-reply-extra-1' ? 'proposal' : 'previous', requirementIds: seed.id === 'scenario-1-reply-extra-1' ? first.requirements.map(guideHash) : [], reason: 'Explicit independent fixture assignment' })) }
      const result = guideReplyPlanChoiceRequest(context, main, options, 0).read(decision)
      archive.saveValue('guide-reply-plan-choice-context-v1', key, { hash: guideHash(context), context })
      archive.saveValue('guide-reply-plan-choice-result-v1', key, { contextHash: guideHash(context), result })
      const currentBranches = await constructGuideReplyBranches([main], [result.plan], options)
      return { plan: result.plan, branches: currentBranches, first }
    },
    close() { archive.close(); jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
  }
}

