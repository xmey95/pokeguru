import {guideHash} from './matchup-guide-packet'
import type {GuideSegmentJournal} from './guide-segments'
import {constructGuideReplyPlans,constructGuideReplyBranches,readGuideReplyBranchSnapshots,type GuideConstructionRuntime} from './guide-reply-phase'
import {guideReplyPlanRequest,readGuideReplyPlan,type GuideReplyPlan,type GuideReplyPlanRepair} from './guide-reply-plan'
import {constructGuideScenarioMetadata,GuideMetadataConstructionNeeded,type GuideMetadataRepair,type GuideMetadataBranchNeed} from './guide-scenario-metadata'
import {createGuideReplyChoiceContext,guideReplyPlanChoiceRequest,guideReplyPlanChoiceNativeReserve,verifyGuideReplyChoiceContext,type GuideReplyChoiceContext,type GuideReplyChoiceResult} from './guide-reply-plan-choice'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {guideReplyRequirementLedger,type GuideReplyRequirementLedger} from './guide-reply-requirements'

interface Selection {scope:GuideConstructionRuntime['scope'];packetHash:string;caseId:string;mainHash:string;before:GuideReplyPlan;requirements:GuideMetadataBranchNeed['requirements'];retained?:GuideReplyRequirementLedger}
const role='guide-reply-plan-selection-v1',resultRole='guide-reply-plan-selection-result-v1'
const choiceContextRole='guide-reply-plan-choice-context-v1',choiceResultRole='guide-reply-plan-choice-result-v1'
const upgradeRole='guide-reply-plan-initial-fork-upgrade-v1',planningProtocol='initial-forks-1'
interface Upgrade {selectionHash:string;originalProposalHash:string;scope:GuideConstructionRuntime['scope'];packetHash:string;plan:GuideReplyPlan}
/** Metadata may request missing witnesses without inventing zero damage or
 * editing frozen events. Each additional plan and branch is an ordinary paid,
 * validated unit, with recoverable selection of the current AI plan. */
export async function constructGuideScenarioEvaluations(mains:GuideSegmentJournal[],initialPlans:GuideReplyPlan[],options:GuideConstructionRuntime,repairs=new Map<string,GuideMetadataRepair>()){
 const {archive,scope,packet}=options
 if(archive.id!==scope.jobId||archive.projectId!==scope.projectId)throw new Error('Valutazione casi: archivio estraneo.')
 let plans=mains.map(main=>initialPlans.find(p=>p.caseId===main.setup.id)!)
 if(plans.some(p=>!p))throw new Error('Valutazione casi: piano mancante.')
 const visited=new Map(mains.map(m=>[m.setup.id,new Set<string>()]))
 for(;;){
  options.check()
  const pending:{key:string;selection:Selection}[]=[],next=[...plans]
  const choices:{key:string;index:number;context:GuideReplyChoiceContext}[]=[]
  const upgrades:{key:string;index:number;selection:Selection;proposal:GuideReplyPlan;context:GuideReplyChoiceContext}[]=[]
  let advanced=false
  for(const [i,plan]of plans.entries()){
   const seen=visited.get(plan.caseId)!,signature=guideHash(plan)
   if(!seen.has(signature))seen.add(signature)
   const rows=[...archive.values<Selection>(role)].filter(r=>r.value.caseId===plan.caseId&&r.value.mainHash===plan.mainHash&&guideHash(r.value.before)===signature&&guideHash(r.value.scope)===guideHash(scope)&&r.value.packetHash===guideHash(packet))
   if(rows.length>1)throw new Error('Valutazione casi: selezione delle repliche ambigua.')
   const row=rows[0];if(!row)continue
   if(row.key!==guideHash(row.value))throw new Error('Valutazione casi: selezione delle repliche alterata.')
   const saved=archive.value<{selectionHash:string;plan:GuideReplyPlan;planningProtocol?:string}>(resultRole,row.key)
   if(saved){
    if(saved.selectionHash!==row.key)throw new Error('Valutazione casi: proposta di un’altra selezione.')
    readGuideReplyPlan(mains[i],scope,packet,saved.plan,{previous:plan,findings:row.value.requirements,requireChange:true})
    const oldChoice=archive.value<{contextHash:string;result:GuideReplyChoiceResult}>(choiceResultRole,row.key)
    let proposal=saved.plan,contextKey=row.key
    if(!oldChoice&&saved.planningProtocol!==planningProtocol){
     const upgraded=archive.value<Upgrade>(upgradeRole,row.key)
     if(!upgraded){
      const oldBranches=readGuideReplyBranchSnapshots([mains[i]],[plan],options)
      const context=createGuideReplyChoiceContext(row.key,plan,saved.plan,row.value.requirements,oldBranches,mains[i],options)
      upgrades.push({key:row.key,index:i,selection:row.value,proposal:saved.plan,context});continue
     }
     if(upgraded.selectionHash!==row.key||upgraded.originalProposalHash!==guideHash(saved.plan)||guideHash(upgraded.scope)!==guideHash(scope)||upgraded.packetHash!==guideHash(packet))throw new Error('Upgrade piano: contesto o proposta originale diversi.')
     readGuideReplyPlan(mains[i],scope,packet,upgraded.plan,{previous:plan,findings:row.value.requirements,requireChange:true})
     proposal=upgraded.plan;contextKey=guideHash({selectionHash:row.key,proposalHash:guideHash(proposal),planningProtocol})
    }
    let contextRecord=archive.value<{hash:string;context:GuideReplyChoiceContext}>(choiceContextRole,contextKey)
    if(!contextRecord){
     const oldBranches=readGuideReplyBranchSnapshots([mains[i]],[plan],options)
     const context=createGuideReplyChoiceContext(row.key,plan,proposal,row.value.requirements,oldBranches,mains[i],options)
     contextRecord={hash:guideHash(context),context};archive.saveValue(choiceContextRole,contextKey,contextRecord)
    }
    if(contextRecord.hash!==guideHash(contextRecord.context)||contextRecord.context.selectionHash!==row.key||guideHash(contextRecord.context.proposal)!==guideHash(proposal))throw new Error('Valutazione casi: contesto di scelta alterato.')
    verifyGuideReplyChoiceContext(contextRecord.context,mains[i],options)
    const selected=archive.value<{contextHash:string;result:GuideReplyChoiceResult}>(choiceResultRole,contextKey)
    if(selected){
     if(selected.contextHash!==contextRecord.hash)throw new Error('Valutazione casi: scelta di un altro contesto.')
     guideReplyPlanChoiceRequest(contextRecord.context,mains[i],options,0).cacheValidation.validate(selected.result)
     if(seen.has(guideHash(selected.result.plan)))throw new Error('Valutazione casi: ciclo o piano già superato.')
     next[i]=selected.result.plan;advanced=true
    }else choices.push({key:contextKey,index:i,context:contextRecord.context})
   }else pending.push({key:row.key,selection:row.value})
  }
  if(pending.length){
   const planRepairs=new Map<string,GuideReplyPlanRepair>(pending.map(p=>[p.selection.caseId,{previous:p.selection.before,findings:p.selection.requirements,requireChange:true,...p.selection.retained?{retained:p.selection.retained}:{}}]))
   const built=await constructGuideReplyPlans(mains.filter(m=>planRepairs.has(m.setup.id)),{...options,reserveOutside:options.reserveOutside+1},planRepairs)
   for(const plan of built){const selected=pending.find(p=>p.selection.caseId===plan.caseId)!,main=mains.find(m=>m.setup.id===plan.caseId)!,modern=['guide-reply-plan-3','guide-reply-plan-4'].includes(guideReplyPlanRequest(main,scope,packet,0,archive,planRepairs.get(plan.caseId)).cacheValidation.id);archive.saveValue(resultRole,selected.key,{selectionHash:selected.key,plan,...modern?{planningProtocol}:{}})}
   continue
  }
  if(upgrades.length){
   const contexts=[...choices.map(c=>c.context),...upgrades.map(u=>u.context)]
   const reserve=options.reserveOutside+mains.length+contexts.length+guideReplyPlanChoiceNativeReserve(mains,next,contexts,options)
   await runGuideSegmentPhase<GuideReplyPlan>(upgrades.map(u=>({id:mains[u.index].setup.id,request:()=>guideReplyPlanRequest(mains[u.index],scope,packet,reserve,archive,{previous:u.selection.before,findings:u.selection.requirements,requireChange:true,unadoptedProposal:u.proposal}),accept:plan=>{
    const upgraded:Upgrade={selectionHash:u.key,originalProposalHash:guideHash(u.proposal),scope,packetHash:guideHash(packet),plan};archive.saveValue(upgradeRole,u.key,upgraded)
   }})),{...options,stage:'branch-plan-upgrades'})
   continue
  }
  if(choices.length){
   const selected=new Map<number,GuideReplyPlan>()
   // Request factories are read repeatedly during grouping and cache checks.
   // Native journals cannot change in this planning phase: only an accepted
   // choice changes the forecast, so invalidate it at that exact boundary.
   let forecast:number|undefined
   const reserve=()=>forecast??=options.reserveOutside+mains.length+guideReplyPlanChoiceNativeReserve(mains,next.map((p,i)=>selected.get(i)??p),choices.filter(c=>!selected.has(c.index)).map(c=>c.context),options)
   await runGuideSegmentPhase<GuideReplyChoiceResult>(choices.map(c=>({id:mains[c.index].setup.id,request:()=>guideReplyPlanChoiceRequest(c.context,mains[c.index],options,reserve()),accept:result=>{archive.saveValue(choiceResultRole,c.key,{contextHash:guideHash(c.context),result});selected.set(c.index,result.plan);forecast=undefined}})),{...options,stage:'branch-plan-choices',refreshAfterGroup:true})
   continue
  }
  if(advanced){plans=next;continue}
  const branches=await constructGuideReplyBranches(mains,plans,{...options,reserveOutside:options.reserveOutside+1})
  try{
   const built=await constructGuideScenarioMetadata(mains,plans,branches,options,repairs)
   return {plans,branches,built}
  }catch(error){
   if(!(error instanceof GuideMetadataConstructionNeeded))throw error
   for(const need of error.needs){
    const before=plans.find(p=>p.caseId===need.caseId)!
    const main=mains.find(m=>m.setup.id===need.caseId)!,retained=guideReplyRequirementLedger(main,before,options)
    const selection:Selection={scope,packetHash:guideHash(packet),caseId:need.caseId,mainHash:before.mainHash,before,requirements:need.requirements,...retained.requirements.length?{retained}:{}}
    archive.saveValue(role,guideHash(selection),selection)
   }
  }
 }
}
