import type {AiAnalysisWork} from './ai-analysis-work'
import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {isGuideDelivery,guideDeliveryBudget} from '../shared/guide-delivery'
import {guideUntilValidAuthority,GUIDE_UNLIMITED_CAPACITY} from './guide-run-policy'
export const GUIDE_MAX_ATTEMPTS=16

/** Trusted main-process input, never model output or renderer-supplied content.
 * An exceptional ceiling must name the existing job and frozen input. */
export interface GuideCallBudgetAuthorization {
 jobId:string;projectId:string;dependencyHash:string;maximum:number;reason:string
}
export function guideAttemptLimit(packet:GuidePacket,work:AiAnalysisWork,requested?:number,authorization?:GuideCallBudgetAuthorization):number{
 const untilValid=guideUntilValidAuthority(work.archive)
 if(untilValid){
  if(untilValid.packetHash!==guideHash(packet)||authorization||requested!==undefined&&requested!==GUIDE_UNLIMITED_CAPACITY)throw Error('La politica senza tetto richiede le fonti autorizzate e non ammette un secondo limite implicito.')
  return GUIDE_UNLIMITED_CAPACITY
 }
 const current=['matchup-guide-24','matchup-guide-25','matchup-guide-26','matchup-guide-27','matchup-guide-28'].includes(packet.basis.promptVersion),delivery=isGuideDelivery(packet.basis),ordinary=delivery?guideDeliveryBudget().maximum:current?GUIDE_MAX_ATTEMPTS:8
 const validate=(grant:GuideCallBudgetAuthorization)=>{
  if(!current||grant.jobId!==work.id||grant.projectId!==packet.basis.projectId||grant.dependencyHash!==packet.basis.dependencyHash||
   !Number.isSafeInteger(grant.maximum)||grant.maximum<(delivery?1:ordinary)||typeof grant.reason!=='string'||!grant.reason.trim()||grant.reason.length>2000)
   throw new Error('Autorizzazione del budget della guida non valida per questo job e queste fonti.')
 }
 if(authorization){validate(authorization);work.archive.saveValue('guide-call-budget-authorization',guideHash(authorization),authorization)}
 const grants=[...work.archive.values<GuideCallBudgetAuthorization>('guide-call-budget-authorization')].map(r=>r.value)
 for(const value of grants)validate(value)
 // A bounded manifest is an upper bound, never authority to exceed the
 // residual campaign allowance. A larger grant cannot enlarge its graph.
 const maximum=delivery?Math.min(ordinary,grants.length?Math.max(...grants.map(g=>g.maximum)):ordinary):Math.max(ordinary,...grants.map(g=>g.maximum))
 const limit=Math.min(maximum,requested??maximum)
 if(!Number.isSafeInteger(limit)||limit<1)throw new Error('Budget della guida non valido.')
 return limit
}
