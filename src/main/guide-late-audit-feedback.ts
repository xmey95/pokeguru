import {guideHash} from './matchup-guide-packet'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {readAuditLanguageReview,type AuditLanguageReviewRef} from './guide-audit-language-review'
import {pendingFiniteAuditGroups} from './guide-audit-count-gate'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
export interface LateAuditLink {proposal:{unitId:string;outcomeKey:string};review:AuditLanguageReviewRef}

/** Reconstruct feedback from paid originals, never from a rewritten verdict.
 * Provisional patches are not candidates; only a later patch with every audit
 * certified may enter the candidate chain. */
export function lateAuditFeedback(links:LateAuditLink[],candidateHash:string,findings:unknown[],options:GuideConstructionRuntime,build:(raw:any,protocol:3|4)=>any[]){
 if(!links.length)return undefined
 const prior:LateAuditLink[]=[],reviews:any[]=[];let proposedPatch:any
 for(const link of links){
  const source=options.archive.value<any>('guide-segment-unit-result-v1',link.proposal.outcomeKey),d=options.archive.value<any>('guide-finite-request-v1',link.proposal.unitId)
  if(!source?.accepted||source.unitId!==link.proposal.unitId||guideHash(source)!==link.proposal.outcomeKey||guideHash(source.raw)!==guideHash(source.value)||!d||d.scopeHash!==guideHash(options.scope)||guideSegmentUnitIdentity({...d.request,cacheValidation:{id:d.request.validationId}} as any).unitId!==link.proposal.unitId||!['guide-finite-native-repair-3','guide-finite-native-repair-4'].includes(d.request.validationId)||d.request.data.candidateHash!==candidateHash||guideHash(d.request.data.findings)!==guideHash(findings)||guideHash(d.request.data.lateAuditFeedback?.history??[])!==guideHash(prior))throw Error('Riparazione audit tardivi: proposta o catena non autenticata.')
  assertNativeScenarioSchema(source.raw,d.request.schema)
  const protocol=d.request.validationId==='guide-finite-native-repair-4'?4:3,natives=build(source.raw,protocol),review=readAuditLanguageReview(link.review,options)
  if(review.value.verdict==='pass')throw Error('Riparazione audit tardivi: feedback privo di rifiuto.')
  const groups=pendingFiniteAuditGroups(natives,options,false,d.request.data.auditPositionEvidenceVersion===1)
  if(!groups.some(g=>guideHash(g.targets)===guideHash(review.data.targets.map((t:any)=>{const {key,spans,contextHash,...target}=t;return target}))&&guideHash(g.context)===guideHash(review.data.context)&&guideHash(g.facts)===guideHash(review.data.contextFacts)))throw Error('Riparazione audit tardivi: rifiuto di testi, finestre o proposta differenti.')
  proposedPatch=structuredClone(source.raw)
  reviews.push({ref:structuredClone(link.review),targets:review.data.targets,review:review.value})
  prior.push(structuredClone(link))
 }
 return {history:prior,proposedPatch,reviews}
}
