import { guideHash } from './matchup-guide-packet'
import { verifyGuideSegments, type GuideSegmentJournal } from './guide-segments'
import { readGuideReplyPlan, guideReplySeeds, type GuideReplyPlan } from './guide-reply-plan'
import { guideReplyRequirementLedger } from './guide-reply-requirements'
import { readGuideReplyBranchSnapshots, type GuideConstructionRuntime } from './guide-reply-phase'
import type { GuideMetadataBranchNeed } from './guide-scenario-metadata'

interface OriginRef { role: string; key: string; objectHash: string; pointer: string }
export interface GuideObligationOrigin {
  id: string
  origin: 'seed' | 'ai'
  rawJson: string
  sourceIds: string[]
  occurrences: OriginRef[]
}
/** Provenance import only. A source binding is NOT an independent review,
 * mechanical approval, producer-call receipt, or a migration of the whole guide. */
export interface GuideReplyObligationOrigins {
  version: 1
  scope: GuideConstructionRuntime['scope']
  packetHash: string
  caseId: string
  rootHash: string
  mainHash: string
  planHash: string
  constructionHash: string
  origins: GuideObligationOrigin[]
  adoptedChoiceKeys: string[]
  pendingNeedKeys: string[]
  coverage: { adoptedSeedAncestry: true; adoptedMetadataNeeds: true; currentMetadataNeeds: true; historicalWitnessLibrary: false; guideInvariants: false; criticalFindings: false; producerCallReceipts: false }
  tacticalApprovalReused: false
}

/** Read and validate the adopted ancestry plus CURRENT missing-proof requests.
 * No writes, request factories, scheduler or provider capabilities are invoked.
 * Unadopted proposal seeds do not silently become required current goals. */
export function readGuideReplyObligationOrigins(main: GuideSegmentJournal, plan: GuideReplyPlan, options: GuideConstructionRuntime): GuideReplyObligationOrigins {
  const { archive, scope, packet } = options
  if (archive.id !== scope.jobId || archive.projectId !== scope.projectId) throw new Error('Originali degli obblighi: archivio estraneo.')
  verifyGuideSegments(main, scope, packet); readGuideReplyPlan(main, scope, packet, plan)
  const ledger = guideReplyRequirementLedger(main, plan, options)
  const branches = readGuideReplyBranchSnapshots([main], [plan], options)
  const constructionHash = guideHash({ main: main.segments[2].hash, branches: branches.map(b => ({ seed: b.seed, line: b.line, head: b.journal.segments.at(-1)!.hash })) })
  const origins = new Map<string, GuideObligationOrigin>()
  const sources = new Set(packet.sources.map(s => s.id))
  const add = (origin: GuideObligationOrigin['origin'], value: any, ref: OriginRef) => {
    if (!value || !Array.isArray(value.sourceIds) || !value.sourceIds.length || new Set(value.sourceIds).size !== value.sourceIds.length || value.sourceIds.some((s: unknown) => typeof s !== 'string' || !sources.has(s))) throw new Error('Originali degli obblighi: fonte mancante o estranea.')
    const rawJson = JSON.stringify(value), id = guideHash({ origin, rawJson })
    const prior = origins.get(id)
    if (prior) { if (!prior.occurrences.some(r => guideHash(r) === guideHash(ref))) prior.occurrences.push(ref) }
    else origins.set(id, { id, origin, rawJson, sourceIds: [...value.sourceIds], occurrences: [ref] })
  }
  const addPlan = (value: GuideReplyPlan, role: string, key: string, objectHash: string, pointer: string) => {
    readGuideReplyPlan(main, scope, packet, value)
    const seeds = guideReplySeeds(value)
    for (const seed of seeds) add('seed', seed, { role, key, objectHash, pointer: pointer + '/' + (seed.role === 'other' ? 'others/' + value.others.findIndex(s => s.id === seed.id) : seed.role) })
  }
  const adoptedNeedHashes = new Set<string>()
  for (const key of ledger.choiceKeys) {
    const role = 'guide-reply-plan-choice-context-v1', saved = archive.value<any>(role, key), chosen = archive.value<any>('guide-reply-plan-choice-result-v1', key)
    if (!saved || saved.hash !== guideHash(saved.context) || chosen?.contextHash !== saved.hash) throw new Error('Originali degli obblighi: scelta adottata non verificabile.')
    const context = saved.context, sourceHash = guideHash(saved)
    addPlan(context.before, role, key, sourceHash, '/context/before')
    addPlan(chosen.result.plan, 'guide-reply-plan-choice-result-v1', key, guideHash(chosen), '/result/plan')
    adoptedNeedHashes.add(context.metadataNeedHash)
  }
  // The initial plan has no adopted choice. Bind it to its accepted AI unit;
  // never call a request factory while merely reading/migrating originals.
  if (!ledger.choiceKeys.length) {
    const matching = [...archive.values<any>('guide-segment-unit-result-v1')].filter(row => row.value.accepted === true && guideHash(row.value.value) === guideHash(plan))
    if (!matching.length) throw new Error('Originali degli obblighi: piano iniziale senza unità AI accettata.')
    for (const row of matching) addPlan(plan, 'guide-segment-unit-result-v1', row.key, guideHash(row.value), '/value')
  }
  const pendingNeedKeys: string[] = []
  for (const row of archive.values<GuideMetadataBranchNeed>('guide-metadata-needs-v1')) {
    const need = row.value, adopted = adoptedNeedHashes.has(row.key)
    if (!adopted && (need.caseId !== main.setup.id || need.constructionHash !== constructionHash)) continue
    if (row.key !== guideHash(need) || need.kind !== 'needs-branches' || need.caseId !== main.setup.id || !Array.isArray(need.requirements) || !need.requirements.length) throw new Error('Originali degli obblighi: richiesta metadata alterata o estranea.')
    for (const [i, requirement] of need.requirements.entries()) {
      if (!requirement || typeof requirement.goal !== 'string' || !requirement.goal.trim() || requirement.goal.length > 1600 || typeof requirement.reason !== 'string' || !requirement.reason.trim() || requirement.reason.length > 4000 || !Array.isArray(requirement.sourceIds) || requirement.sourceIds.length > 30 || Object.keys(requirement).sort().join('|') !== 'goal|reason|sourceIds') throw new Error('Originali degli obblighi: requisito incompleto.')
      add('ai', requirement, { role: 'guide-metadata-needs-v1', key: row.key, objectHash: guideHash(need), pointer: '/requirements/' + i })
    }
    if (!adopted) pendingNeedKeys.push(row.key)
    adoptedNeedHashes.delete(row.key)
  }
  if (adoptedNeedHashes.size) throw new Error('Originali degli obblighi: una richiesta adottata è andata persa.')
  const expected = new Set(ledger.requirements.map(r => r.id))
  for (const origin of origins.values()) if (origin.origin === 'ai') expected.delete(guideHash(JSON.parse(origin.rawJson)))
  if (expected.size) throw new Error('Originali degli obblighi: registro storico incompleto.')
  return {
    version: 1, scope: structuredClone(scope), packetHash: guideHash(packet), caseId: main.setup.id,
    rootHash: main.rootHash, mainHash: main.segments[2].hash, planHash: guideHash(plan), constructionHash,
    origins: [...origins.values()].map(o => ({ ...o, occurrences: o.occurrences.sort((a, b) => guideHash(a).localeCompare(guideHash(b))) })).sort((a, b) => a.id.localeCompare(b.id)),
    adoptedChoiceKeys: [...ledger.choiceKeys], pendingNeedKeys: pendingNeedKeys.sort(),
    coverage: { adoptedSeedAncestry: true, adoptedMetadataNeeds: true, currentMetadataNeeds: true, historicalWitnessLibrary: false, guideInvariants: false, criticalFindings: false, producerCallReceipts: false },
    tacticalApprovalReused: false
  }
}
