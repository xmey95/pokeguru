import {readGuideContent,type MatchupGuide} from '../shared/matchup-guide'
import {guideUntilValidAuthority} from './guide-run-policy'
import {checkTacticalAudit} from '../shared/guide-tactical-frontier'
import {finiteNativeWitnesses} from './guide-finite-cases'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../shared/guide-analysis-scope'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {readGuideFiniteOriginals} from './guide-finite-originals'
import {finiteReviewRequest,finiteReviewRunKey,aggregateFiniteGuideReviews,type GuideFiniteReview} from './guide-finite-review'
import {finiteCriticContract} from './guide-finite-critic-contract'
import {prepareFiniteRequest,assertFiniteTransportHistory} from './guide-finite-runtime'
import {restoreGuideTransportRequest,readAcceptedGuideTransport} from './guide-transport-evidence'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {assertGuideDeliveryApproval,guideDeliverySeal} from './guide-delivery-policy'
import {isGuideDelivery} from '../shared/guide-delivery'
import {finiteFinalReviewUnits,hasFinalTextPartitions} from './guide-final-text-partitions'
interface Approval{version:2|3;guideHash:string;scope:GuideConstructionRuntime['scope'];evidencePacket:GuidePacket;bindings:{caseId?:string;reviewId?:string;unitId:string;outcomeKey:string}[]}
const role='guide-finite-final-approval-v1'
/** Pure recovery gate: reconstruct the actual final critic request under the
 * current validators and its pinned complete history, including retry rejects. */
export function assertFiniteGuideApproval(guide:MatchupGuide,archive:GuideConstructionRuntime['archive']):void{
  assertGuideDeliveryApproval(guide,archive as import('./ai-evidence-archive').AiEvidenceArchive)
  const approval=archive.value<Approval>(role,'validated'),originals=readGuideFiniteOriginals(guide)
  if(guide.basis.analysisContract!==GUIDE_FINITE_ANALYSIS_CONTRACT||!approval||![2,3].includes(approval.version)||approval.guideHash!==guideHash(guide)||!originals||guideHash(approval.scope)!==guideHash(originals.saved.sourceScope)||approval.scope.jobId!==archive.id||approval.scope.projectId!==archive.projectId||approval.scope.configHash!==guideHash({config:guide.generation.config,protocol:'segments-v28-1'}))throw Error('Guida finita senza approvazione verificabile del job e della configurazione.')
  for(const key of ['basis','ourList','opponentLists','sources'] as const)if(guideHash(approval.evidencePacket[key])!==guideHash(guide[key]))throw Error('Critica finita: fonti diverse dalla guida salvata.')
  if(approval.evidencePacket.gaps.some(g=>!guide.limitations.includes(g)))throw Error('Critica finita: lacuna delle fonti omessa.')
  assertFiniteTransportHistory(archive,approval.scope)
  const draft=readGuideContent(guide,'matchup-guide-28',GUIDE_FINITE_ANALYSIS_CONTRACT),natives=originals.natives.map(n=>n.native)
  const options:GuideConstructionRuntime={scope:approval.scope,packet:originals.saved.nativePacket,evidencePacket:approval.evidencePacket,archive,reserveOutside:0,remainingCalls:()=>0,isCached:()=>false,estimate:()=>{throw Error('Il lettore non stima nuove richieste.')},call:async()=>{throw Error('Il lettore non può chiamare un provider.')},check:()=>{}}
  if(guideUntilValidAuthority(archive))for(const native of natives){
    const rebuilt=finiteNativeWitnesses(native,originals.plans.find(p=>p.caseId===native.id)!,options)
    const errors=rebuilt.content.scenarios.flatMap(s=>checkTacticalAudit(s,options.packet.sources,2))
    if(errors.length)throw Error('Copertura completa delle carte assegnate: '+errors.join('\n'))
  }
  const runKey=finiteReviewRunKey(draft,natives,originals.plans,options,true),run=archive.value<{version:1;history:GuideFiniteReview[]}>('guide-finite-review-run-v1',runKey)
  const units=finiteFinalReviewUnits(draft,options),partitioned=hasFinalTextPartitions(options)
  if(!run||run.version!==1||(approval.version===3)!==partitioned||approval.bindings.length!==units.length||guideHash(approval.bindings.map(b=>partitioned?b.reviewId:b.caseId))!==guideHash(units.map(u=>u.id)))throw Error('Critica finita: perimetro o storia finale incompleti.')
  const reviews=approval.bindings.map((binding,index)=>{
    const unit=units[index]
    const descriptor=archive.value<any>('guide-finite-request-v1',binding.unitId),outcome=archive.value<any>('guide-segment-unit-result-v1',binding.outcomeKey)
    const bare=prepareFiniteRequest(finiteReviewRequest(draft,natives,originals.plans,run.history,options,true,unit.proofCaseIds,unit.partition),options,false)
    if(!descriptor||descriptor.scopeHash!==guideHash(approval.scope)||descriptor.request.role!=='critic'||descriptor.request.validationId!==bare.cacheValidation.id||descriptor.request.data.reviewScope!==(unit.partition?'complete-guide-partition':'complete-guide')||guideHash(descriptor.request.data.proofCaseIds)!==guideHash(unit.proofCaseIds)||!outcome||outcome.unitId!==binding.unitId)throw Error('Critica finita: descrittore o risposta finale mancanti.')
    const request=restoreGuideTransportRequest(bare,descriptor.request,archive),accepted=readAcceptedGuideTransport(request,{key:binding.outcomeKey,value:outcome},archive)
    if(accepted.value.verdict!=='pass'||accepted.value.findings.length)throw Error('Critica finita: nessun pass finale corrispondente alla guida.')
    return accepted.value
  })
  if(guideHash(aggregateFiniteGuideReviews(reviews,partitioned))!==guideHash(guide.review))throw Error('Critica finita: riepilogo diverso dalle risposte finali complete.')
}
export function saveFiniteGuideApproval(guide:MatchupGuide,reviews:GuideFiniteReview[],options:GuideConstructionRuntime){
  const units=finiteFinalReviewUnits(guide,options),partitioned=hasFinalTextPartitions(options)
  const bindings=units.map((unit,index)=>{
    const source=[...options.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.accepted&&guideHash(r.value.value)===guideHash(reviews[index]))
    if(!source)throw Error('Critica finita: risposta originale finale non archiviata.')
    return {...partitioned?{reviewId:unit.id}:{caseId:unit.id},unitId:source.value.unitId,outcomeKey:source.key}
  })
  if(reviews.length!==bindings.length)throw Error('Critica finita: unità finali mancanti.')
  const approval:Approval={version:partitioned?3:2,guideHash:guideHash(guide),scope:options.scope,evidencePacket:options.evidencePacket??options.packet,bindings}
  const delivery=isGuideDelivery(guide.basis)?guideDeliverySeal(guide,options.archive as import('./ai-evidence-archive').AiEvidenceArchive):undefined
  // Prevalidate using a read-through view before making the final binding.
  const view=new Proxy(options.archive,{get(target,key){if(key==='value')return (r:string,k:string)=>r===role&&k==='validated'?structuredClone(approval):delivery&&r==='guide-delivery-final-v1'&&k==='validated'?structuredClone(delivery):target.value(r,k);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
  assertFiniteGuideApproval(guide,view)
  if(delivery)(options.archive as import('./ai-evidence-archive').AiEvidenceArchive).saveValues([{role,key:'validated',value:approval},{role:'guide-delivery-final-v1',key:'validated',value:delivery}])
  else options.archive.saveValue(role,'validated',approval)
}
