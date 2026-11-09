import {it,expect} from 'vitest'
import {guidePrizeRuleSources,extendGuidePrizeRules} from '../src/main/guide-prize-rule-sources'
import {guideHash,packetHash} from '../src/main/matchup-guide-packet'
import {assertGuideEvidenceExtension,assertGuideRuntimeEvidence} from '../src/main/guide-evidence-extension'
import {scopedConstructionPacket} from '../src/main/guide-causal-contract'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {createGuideSegments,appendGuideSegment} from '../src/main/guide-segments'
import {guidePremiseRequest} from '../src/main/guide-segment-generation'
import {readGuidePremiseReview} from '../src/main/guide-premise-review'
import {segmentFixture} from './fixtures/guide-segment'
import {auditSourceQuantities} from '../src/main/guide-audit-source-quantities'

it('delivers separate official versioned Prize excerpts, without claiming effects or unsupported eras',()=>{
 const sources=guidePrizeRuleSources('2026-11-05');expect(sources).toHaveLength(3)
 sources.forEach((s,i)=>{expect(s.kind).toBe('rules');expect(guideHash(s.content)).toBe(s.hash);expect(s.url).toMatch(/^https:\/\/(www|assets|press)\.pokemon\.com\//);expect(auditSourceQuantities(JSON.parse(s.content).excerpt)).toContain(i+1)})
 expect(guidePrizeRuleSources('2025-09-25')).toEqual([])
 expect(JSON.parse(sources[2].content).scope).toContain('not older Mega Pokémon-EX')
})
it('extends complete evidence append-only while preserving the native stock and binding',()=>{
 const anchor=syntheticSegmentProtocol('independent-rules').packet,native=scopedConstructionPacket(anchor,'their-list'),hash=guideHash(anchor),next=extendGuidePrizeRules(anchor)
 assertGuideEvidenceExtension(anchor,next);assertGuideRuntimeEvidence({scope:{projectId:anchor.basis.projectId,dependencyHash:anchor.basis.dependencyHash},packet:native,evidenceAnchor:anchor,evidencePacket:next})
 expect(guideHash(anchor)).toBe(hash);expect(next.sources.slice(0,anchor.sources.length)).toEqual(anchor.sources);expect(extendGuidePrizeRules(next)).toEqual(next)
 const forged=structuredClone(next);forged.sources.at(-1)!.content+=' invented';forged.sources.at(-1)!.hash=guideHash(forged.sources.at(-1)!.content);forged.basis.dependencyHash=packetHash(forged)
 expect(()=>assertGuideEvidenceExtension(anchor,forged)).toThrow('estensione non valida');expect(()=>extendGuidePrizeRules(forged)).toThrow('identificativo riservato')
})
it('supplies legacy native premises with bound rule evidence but preserves an already assigned old review',()=>{
 const f=segmentFixture(),{turns,developmentPlan,...setup}=f.scenario,packet=syntheticSegmentProtocol('rules-premise').packet;packet.basis.analysisContract='finite-evidence-1';packet.basis.dependencyHash=packetHash(packet)
 const scope={projectId:packet.basis.projectId,jobId:'synthetic',configHash:'synthetic',dependencyHash:packet.basis.dependencyHash},root=createGuideSegments(setup,scope,packet),journal=appendGuideSegment(root,scope,packet,turns.ours,developmentPlan.ours)
 const fresh=guidePremiseRequest(journal,scope,packet,5,{values:()=>[]} as any),data=fresh.data as any
 expect(fresh.cacheValidation.id).toBe('guide-premise-review-2');expect(data.gameRuleSources).toHaveLength(3)
 const raw={reviewedHash:data.witnessContext.reviewedHash,verdict:'revise',repairScope:'first-turn',findings:[{severity:'major',targetId:setup.id,message:'Synthetic modifier is not proven.',correction:'Retain the conditional limit.',sourceIds:[data.gameRuleSources[0].id],proposedActions:[],counterlines:[]}],checks:['Read original excerpt and conditions.'],revalidatedIds:[],textCorrections:[]}
 expect(()=>fresh.read(raw)).not.toThrow();expect(()=>readGuidePremiseReview(raw,journal,scope,packet)).not.toThrow();expect(()=>readGuidePremiseReview(raw,journal,scope,packet,[])).toThrow()
 const old={scopeHash:guideHash(scope),request:{validationId:'guide-premise-review-1',data:{packet,prefix:data.prefix}}},historic=guidePremiseRequest(journal,scope,packet,5,{values:(role:string)=>role==='guide-finite-request-v1'?[{key:'synthetic-only',value:old}]:[]} as any)
 expect(historic.cacheValidation.id).toBe('guide-premise-review-1');expect((historic.data as any).gameRuleSources).toBeUndefined()
})
