import type {AiEvidenceArchive} from './ai-evidence-archive'
import type {GuideSegmentCaller,GuideSegmentRequest} from './guide-segment-generation'
import {callGuideSegmentBatch,guideSegmentAcceptedUnit,prepareGuideSegmentBatch} from './guide-segment-batch'
import {GUIDE_BUDGET_POLICY,guideBudgetStop,scaleGuideUnits,type GuideBudgetResult} from './guide-request-budget'
import {aiFailureCode} from './ai-failure'
import {guideHash} from './matchup-guide-packet'
import {guideOutputCapacity,recordGuideOutputCapacity} from './guide-output-capacity'
import {setImmediate as yieldControl} from 'node:timers/promises'

export interface GuideSegmentUnit<T>{id:string;request:()=>GuideSegmentRequest<T>;accept:(value:T)=>void}
type Archive=Pick<AiEvidenceArchive,'saveValue'|'values'>
/** Token grouping is independent of call availability; the actual call reserve
 * is checked separately, including uncached groups still required this phase. */
export function guideSegmentCapacity(p:GuideBudgetResult,target=false){
  return p.bytes<=GUIDE_BUDGET_POLICY.requestBytes&&p.estimatedResponseCharacters<=GUIDE_BUDGET_POLICY.responseCharacters&&p.estimatedInput<=(target?GUIDE_BUDGET_POLICY.inputTarget:GUIDE_BUDGET_POLICY.inputMaximum)&&p.estimatedInput+p.reservedOutput+p.margin<=GUIDE_BUDGET_POLICY.totalEnvelope
}
export async function runGuideSegmentPhase<T>(units:GuideSegmentUnit<T>[],options:{stage:string;archive:Archive;call:GuideSegmentCaller;estimate:(request:GuideSegmentRequest<any>)=>GuideBudgetResult;isCached:(request:GuideSegmentRequest<any>)=>boolean;remainingCalls:()=>number;check:()=>void;refreshAfterGroup?:boolean;shouldContinue?:()=>boolean;outputFits?:(stage:string,units:number)=>boolean;preflight?:(requests:GuideSegmentRequest<any>[])=>void;prepareRequest?:<V>(request:GuideSegmentRequest<V>)=>GuideSegmentRequest<V>}):Promise<void>{
  if(new Set(units.map(u=>u.id)).size!==units.length)throw new Error('Fase segmenti: identificativi duplicati.')
  if(options.prepareRequest)units=units.map(unit=>({...unit,request:()=>options.prepareRequest!(unit.request())}))
  let pending=[...units],maximumGroup=Number.MAX_SAFE_INTEGER
  const rejectedInputs=new Set<string>(),identity=(request:GuideSegmentRequest<T>)=>guideHash([request.stage,request.role,request.instructions,request.task,request.data,request.schema,request.cacheValidation.id])
  const capacityLimits=new Map<string,number>()
  const capacity=(request:GuideSegmentRequest<T>)=>{const key=guideHash(request.outputCapacity);let value=capacityLimits.get(key);if(value===undefined){value=guideOutputCapacity(request,options.archive);capacityLimits.set(key,value)}return value}
  while(pending.length){
    options.check()
    if(options.shouldContinue?.()===false)return
    const remaining:typeof units=[]
    const preparedPending=pending.map(unit=>({unit,request:unit.request()}))
    for(const [position,{unit,request}]of preparedPending.entries()){
      const cached=guideSegmentAcceptedUnit(options.archive,request)
      const future=[...preparedPending.filter(u=>remaining.some(r=>r.id===u.unit.id)),...preparedPending.slice(position+1)]
      const outside=Math.max(...preparedPending.map(u=>u.request.reserveCalls))+future.reduce((n,u)=>n+(u.request.minimumConstructCalls??1),0)
      if(cached!==undefined){unit.accept(request.finalize?await request.finalize(cached,outside):cached);await yieldControl();options.check()}
      else if(request.construct){unit.accept(await request.construct(outside));await yieldControl();options.check()}
      else remaining.push(unit)
    }
    pending=remaining;if(!pending.length)return
    const candidates=pending.map(unit=>({unit,request:unit.request()}))
    if(candidates.some(c=>rejectedInputs.has(identity(c.request))))throw new Error('Fase segmenti: identità del retry invariata dopo un rifiuto; nessuna nuova chiamata eseguita.')
    const reserve=Math.max(...candidates.map(c=>c.request.reserveCalls))
    const descriptor=(group:typeof candidates,reserved=reserve)=>prepareGuideSegmentBatch(group.map(c=>c.request),{stage:options.stage,reserveCalls:reserved}).request
    // Distinct constructor contracts (native turn vs narrative patch) cannot
    // share a batch header. Plan every bucket before spending any calls, so
    // future uncached groups still count in the same reserve calculation.
    const buckets=new Map<string,typeof candidates>()
    const first=candidates[0].request,packetHash=guideHash((first.data as any)?.packet)
    if(candidates.some(c=>c.request.role!==first.role||guideHash((c.request.data as any)?.packet)!==packetHash))throw new Error('Fase segmenti: non mescolare ruoli, progetti o fonti differenti.')
    for(const candidate of candidates){
      const key=guideHash([candidate.request.role,candidate.request.instructions,(candidate.request.data as any)?.packet])
      buckets.set(key,[...buckets.get(key)??[],candidate])
    }
    const groups=[...buckets.values()].flatMap(bucket=>scaleGuideUnits(bucket,g=>{
      if(g.length>maximumGroup||g.length>Math.min(...g.map(c=>capacity(c.request))))return false
      if(options.outputFits?.(options.stage,g.reduce((n,c)=>n+(c.request.units??1),0))===false){
        if(g.length===1){const blocked=options.estimate(descriptor(g));throw guideBudgetStop(blocked.stage,options.remainingCalls(),reserve+1,blocked)}
        return false
      }
      const plan=options.estimate(descriptor(g))
      return guideSegmentCapacity(plan,true)||(g.length===1&&guideSegmentCapacity(plan,false))
    }))
    const cached=groups.map(g=>options.isCached(descriptor(g)))
    const ordered=groups.map((group,index)=>({group,cached:cached[index]})).sort((a,b)=>Number(b.cached)-Number(a.cached))
    const unpaid=ordered.filter(g=>!g.cached).map(g=>descriptor(g.group))
    if(unpaid.length)options.preflight?.(unpaid)
    const planRecord={stage:options.stage,units:candidates.map(c=>({id:c.unit.id,unitKey:c.request.unitKey,retryOrdinal:c.request.retryOrdinal})),groups:groups.map(g=>g.map(c=>c.unit.id)),reserve,maximumGroup,uncached:cached.filter(v=>!v).length}
    options.archive.saveValue('guide-segment-batch-plan-v1',guideHash(planRecord),planRecord)
    let regroup=false
    for(const [index,item]of ordered.entries()){
      options.check()
      const future=ordered.slice(index+1).filter(g=>!g.cached).length,reserved=reserve+future
      if(!item.cached&&options.remainingCalls()<reserved+1)throw guideBudgetStop(options.stage,options.remainingCalls(),reserved+1)
      let result:Awaited<ReturnType<typeof callGuideSegmentBatch<T>>>
      try{
        result=await callGuideSegmentBatch(item.group.map(c=>c.request),{stage:options.stage,reserveCalls:reserved,archive:options.archive,call:options.call})
      }catch(error){
        if(item.group.length>1&&['output-limit','request-limit'].includes(aiFailureCode(error))){if(aiFailureCode(error)==='output-limit'){recordGuideOutputCapacity(item.group.map(c=>c.request),options.archive);capacityLimits.clear()}maximumGroup=Math.max(1,Math.floor(item.group.length/2));regroup=true;break}
        throw error
      }
        for(const [i,outcome]of result.outcomes.entries())if(outcome.accepted){
          const request=item.group[i].request
          item.group[i].unit.accept(request.finalize?await request.finalize(outcome.value,reserved+item.group.slice(i+1).filter(c=>!!c.request.finalize).length):outcome.value)
          pending=pending.filter(u=>u.id!==item.group[i].unit.id)
        }else rejectedInputs.add(identity(item.group[i].request))
        // End the event-loop job after durable outcomes. This lets cancellation
        // messages and collection of completed request graphs run, including
        // when an offline provider resolves entirely through microtasks.
        await yieldControl();options.check()
        if(options.shouldContinue?.()===false)return
        // Some planning decisions reveal future work. Rebuild factories and
        // reserves before paying the next group, while preserving accepted
        // siblings and retaining ordinary token batching within each group.
        if(options.refreshAfterGroup){regroup=true;break}
    }
    // Failed children remain pending. Their factories load the persisted retry
    // ordinal and full previous output; accepted siblings have checkpoints now.
    if(regroup)continue
  }
}
