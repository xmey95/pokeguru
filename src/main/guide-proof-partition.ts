import {guideHash} from './matchup-guide-packet'
import type {GuideContent} from '../shared/matchup-guide'
import type {GuideSegmentRequest} from './guide-segment-generation'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {prepareGuideSegmentBatch,guideSegmentAcceptedUnit} from './guide-segment-batch'
import {guideSegmentCapacity} from './guide-segment-scheduler'
import {scaleGuideUnits,guideBudgetStop} from './guide-request-budget'
import {guideOutputCapacity} from './guide-output-capacity'

const proofFields=new Set(['turns','steps','lineEvents','expandedLineEvents','unreachedPlan'])
/** A directory is not a witness: the corresponding full option is supplied to
 * its mandatory proof units. No text, number or condition is rewritten. */
export function guideOptionDirectory(option:any){return Object.fromEntries(Object.entries(option).filter(([key])=>!proofFields.has(key)))}
export function projectGuideCaseProofs<T>(value:T,caseId:string,branchIds:string[]):T{
 const selected=new Set(branchIds),out=structuredClone(value) as any
 if(Array.isArray(out.scenarios)){
  out.scenarios=out.scenarios.filter((s:any)=>s.id===caseId)
  for(const scenario of out.scenarios){
   if(scenario.replyComparison?.options)scenario.replyComparison.options=scenario.replyComparison.options.filter((o:any)=>selected.has(o.id))
   if(Array.isArray(scenario.tacticalAudit))scenario.tacticalAudit=scenario.tacticalAudit.filter((r:any)=>r.lineIds.some((id:string)=>id==='main'||selected.has(id)))
  }
 }else if(out?.id===caseId&&out.replyComparison?.options)out.replyComparison.options=out.replyComparison.options.filter((o:any)=>selected.has(o.id))
 return out
}
export function guideProofDirectory(draft:GuideContent,caseId:string){
 const scenario=draft.scenarios.find(s=>s.id===caseId)
 if(!scenario)throw new Error('Partizione: caso estraneo.')
 return (scenario.replyComparison?.options??[]).map(guideOptionDirectory)
}
/** Use exactly the scheduler's token/output/call rules before dispatch. */
export function planGuideProofPhase(requests:GuideSegmentRequest<any>[],options:GuideConstructionRuntime,stage:string){
 const pending=requests.filter(r=>guideSegmentAcceptedUnit(options.archive,r)===undefined),buckets=new Map<string,typeof pending>()
 for(const request of pending){const key=guideHash([request.role,request.instructions,(request.data as any)?.packet]);buckets.set(key,[...buckets.get(key)??[],request])}
 const groups=[...buckets.values()].flatMap(bucket=>scaleGuideUnits(bucket,group=>{
  if(group.length>Math.min(...group.map(r=>guideOutputCapacity(r,options.archive))))return false
  const request=prepareGuideSegmentBatch(group,{stage,reserveCalls:Math.max(...group.map(r=>r.reserveCalls))}).request,budget=options.estimate(request)
  return guideSegmentCapacity(budget,true)||group.length===1&&guideSegmentCapacity(budget)
 }))
 return {groups:groups.map(group=>group.map(r=>r.unitKey!)),uncachedCalls:groups.filter(group=>!options.isCached(prepareGuideSegmentBatch(group,{stage,reserveCalls:Math.max(...group.map(r=>r.reserveCalls))}).request)).length}
}
export function assertGuideProofReserve(calls:number,reserve:number,options:GuideConstructionRuntime,stage:string){
 if(calls>0&&options.remainingCalls()<calls+reserve)throw guideBudgetStop(stage,options.remainingCalls(),calls+reserve)
}
export function guideProofPairs(ids:string[]):string[][]{
 if(new Set(ids).size!==ids.length||!ids.length)throw new Error('Partizione: identità mancanti o duplicate.')
 return ids.length===1?[[ids[0]]]:ids.flatMap((id,i)=>ids.slice(i+1).map(other=>[id,other]))
}
export function assertGuideProofCoverage(ids:string[],groups:{branchIds:string[];requirementIds:string[]}[],requirements:{id:string;branchIds:string[]}[]){
 if(groups.some(g=>new Set(g.branchIds).size!==g.branchIds.length||g.branchIds.some(id=>!ids.includes(id))))throw new Error('Partizione: gruppo duplicato o estraneo.')
 for(const pair of guideProofPairs(ids))if(!groups.some(g=>pair.every(id=>g.branchIds.includes(id))))throw new Error('Partizione: ramo o confronto fra coppie omesso.')
 for(const requirement of requirements){const owners=groups.filter(g=>g.requirementIds.includes(requirement.id));if(owners.length!==1||!requirement.branchIds.every(id=>owners[0].branchIds.includes(id)))throw new Error('Partizione: obbligo originale senza tutti i testimoni o con audit duplicato.')}
 if(groups.some(g=>g.requirementIds.some(id=>!requirements.some(r=>r.id===id))))throw new Error('Partizione: obbligo estraneo.')
}
