/** Offline specification of partitioning. Uses unchanged production budget
 * limits. A whole original target is the smallest atom: no substring, span or
 * qualifier can disappear to make an indivisible target fit. */
import type {AuditLanguageTarget} from './guide-audit-language-review'
import type {GuideBudgetResult} from './guide-request-budget'
import {guideSegmentCapacity} from './guide-segment-scheduler'
import {guideHash as hashDelivery} from './matchup-guide-packet'

export interface DeliveryAuditGroup {targetIds:string[];targets:AuditLanguageTarget[];inputHash:string;budget:GuideBudgetResult}
export type DeliveryAuditPlan={status:'ready';contextHash:string;coverageHash:string;groups:DeliveryAuditGroup[]}|{status:'unsupported';reason:'atomic-size'|'group-limit';targetId:string|null;contextHash:string;budget?:GuideBudgetResult}
export function planDeliveryAudits(targets:AuditLanguageTarget[],contextHash:string,measure:(targets:AuditLanguageTarget[])=>GuideBudgetResult,maximumGroups=4):DeliveryAuditPlan {
  if(!targets.length||new Set(targets.map(t=>t.id)).size!==targets.length||targets.some(t=>!t.id||!t.text.trim()||t.text.length>t.maximum)||!contextHash||!Number.isSafeInteger(maximumGroups)||maximumGroups<1||maximumGroups>4)throw Error('Copertura audit non valida.')
  const groups:DeliveryAuditGroup[]=[],make=(items:AuditLanguageTarget[]):DeliveryAuditGroup=>{const original=structuredClone(items),budget=measure(structuredClone(original));return {targetIds:original.map(t=>t.id),targets:original,inputHash:hashDelivery({contextHash,targets:original}),budget}}
  const fits=(g:DeliveryAuditGroup)=>g.budget.fits&&guideSegmentCapacity(g.budget)
  let pending:DeliveryAuditGroup|null=null
  for(const target of targets){
    const single=make([target]);if(!fits(single))return {status:'unsupported',reason:'atomic-size',targetId:target.id,contextHash,budget:single.budget}
    if(!pending){pending=single;continue}
    const candidate=make([...pending.targets,target])
    if(fits(candidate))pending=candidate
    else {groups.push(pending);pending=single}
  }
  if(pending)groups.push(pending)
  if(groups.length>maximumGroups)return {status:'unsupported',reason:'group-limit',targetId:null,contextHash}
  return {status:'ready',contextHash,coverageHash:hashDelivery({contextHash,targets}),groups}
}
export interface DeliveryAuditReceipt {inputHash:string;contextHash:string;targetIds:string[];verdict:'pass'|'revise'}
/** Receipts must first have passed the existing independent reader. This only
 * checks aggregate completeness; it cannot invent a missing AI opinion. */
export function aggregateDeliveryAudits(targets:AuditLanguageTarget[],plan:Extract<DeliveryAuditPlan,{status:'ready'}>,receipts:DeliveryAuditReceipt[]){
  if(plan.coverageHash!==hashDelivery({contextHash:plan.contextHash,targets})||receipts.length!==plan.groups.length||new Set(receipts.map(r=>r.inputHash)).size!==receipts.length)throw Error('Audit incompleto o diverso dall’originale.')
  const seen=new Set<string>()
  for(const group of plan.groups){
    if(group.inputHash!==hashDelivery({contextHash:plan.contextHash,targets:group.targets})||hashDelivery(group.targets.map(t=>t.id))!==hashDelivery(group.targetIds))throw Error('Partizione alterata.')
    const receipt=receipts.find(r=>r.inputHash===group.inputHash)
    if(!receipt||receipt.contextHash!==plan.contextHash||hashDelivery(receipt.targetIds)!==hashDelivery(group.targetIds)||!['pass','revise'].includes(receipt.verdict))throw Error('Riesame di un altro gruppo o contesto.')
    for(const target of group.targets){if(seen.has(target.id)||hashDelivery(targets.find(t=>t.id===target.id))!==hashDelivery(target))throw Error('Target omesso, duplicato o troncato.');seen.add(target.id)}
  }
  if(seen.size!==targets.length)throw Error('Copertura quantitativa incompleta.')
  return {verdict:receipts.every(r=>r.verdict==='pass')?'pass' as const:'revise' as const,coverageHash:plan.coverageHash,reviewInputHashes:receipts.map(r=>r.inputHash)}
}
