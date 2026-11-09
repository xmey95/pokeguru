import { it, expect } from 'vitest'
import {guideObligationFixture as fixture} from './fixtures/guide-obligation'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ProjectStore } from '../src/main/project-store'
import { AiJobStore } from '../src/main/ai-job-store'
import { AiEvidenceArchive } from '../src/main/ai-evidence-archive'
import { syntheticSegmentProtocol } from './fixtures/guide-segment-protocol'
import { constructGuideMainLines } from '../src/main/guide-mainline-phase'
import { constructGuideReplyPlans, constructGuideReplyBranches, type GuideConstructionRuntime } from '../src/main/guide-reply-phase'
import { createGuideReplyChoiceContext, guideReplyPlanChoiceRequest } from '../src/main/guide-reply-plan-choice'
import { guideHash, guideSource } from '../src/main/matchup-guide-packet'
import { planGuideRequest, guideStageFamily } from '../src/main/guide-request-budget'
import { guideReplySeeds, type GuideReplyPlan } from '../src/main/guide-reply-plan'
import { readGuideReplyObligationOrigins } from '../src/main/guide-obligation-origins'
import { guideObligationAssessmentRequest } from '../src/main/guide-obligation-assessment'


it('imports accepted initial intentions without writes, provider calls or approvals', async () => {
  const f = await fixture()
  try {
    const calls = f.calls, readonly = { ...f.options, archive: { id: f.archive.id, projectId: f.archive.projectId,
      value: <T>(role: string, key: string) => f.archive.value<T>(role, key), values: <T>(role: string) => f.archive.values<T>(role), saveValue: () => { throw Error('UNEXPECTED_WRITE') } }, call: async () => { throw Error('UNEXPECTED_PROVIDER') } }
    const imported = readGuideReplyObligationOrigins(f.main, f.before, readonly)
    expect(imported.origins.map(o => JSON.parse(o.rawJson))).toEqual(expect.arrayContaining(guideReplySeeds(f.before)))
    expect(imported.origins).toHaveLength(guideReplySeeds(f.before).length)
    expect(imported.origins.every(o => o.occurrences.every(r => r.role === 'guide-segment-unit-result-v1'))).toBe(true)
    expect(imported.tacticalApprovalReused).toBe(false)
    expect(imported.coverage.guideInvariants).toBe(false)
    expect(f.calls).toBe(calls)
  } finally { f.close() }
})

it('preserves adopted ancestry and pending needs, ignoring unadopted proposals and unrelated frames', async () => {
  const f = await fixture()
  try {
    const adopted = await f.adopt(), second = f.need(adopted.plan, adopted.branches, 'A pending requirement on the current construction')
    const unused = { ...structuredClone(adopted.plan), others: [{ ...adopted.plan.others[0], goal: 'UNADOPTED_PROPOSAL_NOT_AN_INVARIANT' }] }
    f.archive.saveValue('guide-reply-plan-selection-result-v1', 'unadopted', { selectionHash: 'unadopted', plan: unused })
    const unrelated = { ...second, constructionHash: guideHash('different actual frame'), requirements: [{ ...second.requirements[0], goal: 'UNRELATED_FRAME_NOT_CURRENT' }] }
    f.archive.saveValue('guide-metadata-needs-v1', guideHash(unrelated), unrelated)
    const imported = readGuideReplyObligationOrigins(f.main, adopted.plan, f.options), json = JSON.stringify(imported)
    expect(imported.origins.filter(o => o.origin === 'ai').map(o => JSON.parse(o.rawJson))).toEqual(expect.arrayContaining([...adopted.first.requirements, ...second.requirements]))
    for (const seed of [...guideReplySeeds(f.before), ...guideReplySeeds(adopted.plan)]) expect(imported.origins.some(o => o.rawJson === JSON.stringify(seed))).toBe(true)
    expect(imported.pendingNeedKeys).toEqual([guideHash(second)])
    expect(imported.adoptedChoiceKeys).toHaveLength(1)
    expect(json).not.toContain('UNADOPTED_PROPOSAL_NOT_AN_INVARIANT'); expect(json).not.toContain('UNRELATED_FRAME_NOT_CURRENT')
    expect(readGuideReplyObligationOrigins(f.main, adopted.plan, f.options)).toEqual(imported)
  } finally { f.close() }
})

it('refuses lost adopted originals and a foreign owner rather than importing partial provenance', async () => {
  const f = await fixture()
  try {
    const adopted = await f.adopt()
    expect(() => readGuideReplyObligationOrigins(f.main, adopted.plan, { ...f.options, scope: { ...f.options.scope, jobId: 'foreign' } })).toThrow('archivio estraneo')
    const db = new DatabaseSync(f.file)
    try { db.prepare("DELETE FROM ai_evidence_values WHERE role='guide-metadata-needs-v1' AND key=?").run(guideHash(adopted.first)) } finally { db.close() }
    expect(() => readGuideReplyObligationOrigins(f.main, adopted.plan, f.options)).toThrow()
  } finally { f.close() }
})

it('assesses only full selected proofs, requiring retrieval before construction and refusing a directory as evidence', async () => {
  const f = await fixture()
  try {
    const manifest = readGuideReplyObligationOrigins(f.main, f.before, f.options), originId = manifest.origins[0].id
    const request = guideObligationAssessmentRequest(f.main, f.before, manifest, originId, ['main'], f.options, 3), data = request.data as any
    const main = data.directory.find((d: any) => d.lineId === 'main'), other = data.directory.find((d: any) => d.lineId !== 'main')
    const value = { originId, contextHash: data.contextHash, disposition: 'resolved', reason: 'Exact independent evidence judgment', sourceIds: ['card:p'],
      witnesses: [{ lineId: main.lineId, reviewedHash: main.reviewedHash, turnNumbers: [1] }], missingWitnessIds: [], next: 'none' }
    expect(request.read(value)).toMatchObject({ version: 1, disposition: 'resolved' })
    expect(() => request.read({ ...value, witnesses: [] })).toThrow('senza prova')
    expect(() => request.read({ ...value, witnesses: [{ lineId: other.lineId, reviewedHash: other.reviewedHash, turnNumbers: [1] }] })).toThrow()
    expect(() => request.read({ ...value, disposition: 'still-open', next: 'construct' })).toThrow()
    const retrieval = { ...value, disposition: 'needs-context', next: 'retrieve', witnesses: [], missingWitnessIds: [other.lineId] }
    expect(request.read(retrieval)).toMatchObject({ disposition: 'needs-context', next: 'retrieve' })
    expect(() => request.read({ ...retrieval, missingWitnessIds: ['main'] })).toThrow()
    expect(() => request.read({ ...value, disposition: 'still-open', next: 'evaluate', witnesses: [] })).toThrow('senza testimoni')
    expect(() => guideObligationAssessmentRequest(f.main, f.before, { ...manifest, planHash: 'changed' }, originId, ['main'], f.options, 3)).toThrow('manifest superato')
    expect(() => guideObligationAssessmentRequest(f.main, f.before, manifest, originId, ['main', 'main'], f.options, 3)).toThrow('selezione duplicata')
    const cached = request.read(value)
    expect(() => request.cacheValidation.validate({ ...cached, contextHash: 'foreign' })).toThrow()
    expect(request.role).toBe('critic')
    expect(guideStageFamily(request.stage)).toBe('obligation-assessment')
    expect(request.outputCapacity?.kind).toBe('guide-obligation-assessment-1')
    const evidence = structuredClone(f.options.packet)
    evidence.sources.push(guideSource('card:late', 'card', 'Late local source', null, { effect: 'Additional verified evidence' }))
    const updated = guideObligationAssessmentRequest(f.main, f.before, manifest, originId, ['main'], { ...f.options, evidencePacket: evidence }, 3)
    expect((updated.data as any).packet).toEqual(evidence)
    expect((updated.data as any).packetHash).toBe(guideHash(f.options.packet))
    expect((updated.data as any).evidencePacketHash).toBe(guideHash(evidence))
    expect((updated.data as any).contextHash).not.toBe(data.contextHash)
    expect(() => updated.cacheValidation.validate(cached)).toThrow()
    const allIds = data.directory.map((d: any) => d.lineId)
    const all = guideObligationAssessmentRequest(f.main, f.before, manifest, originId, allIds, f.options, 3)
    expect(manifest.coverage.historicalWitnessLibrary).toBe(false)
    expect(() => all.read({ ...value, contextHash: (all.data as any).contextHash, disposition: 'still-open', next: 'construct' })).toThrow()
  } finally { f.close() }
})
