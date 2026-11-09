import {guideHash} from './matchup-guide-packet'
import {guideReplySeeds,type GuideReplyPlan} from './guide-reply-plan'
import {guideReplyObjective} from './guide-reply-objective'
import {verifyGuideSegments,type GuideSegmentJournal} from './guide-segments'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuideMetadataBranchNeed} from './guide-scenario-metadata'

type Requirement=GuideMetadataBranchNeed['requirements'][number]
export interface GuideReplyRequirementLedger {
 version:1;caseId:string;mainHash:string;packetHash:string;scopeHash:string;planHash:string;
 selections:string[];choiceKeys:string[];
 requirements:(Requirement&{id:string;selectionKeys:string[]})[]
}
/** Original metadata obligations follow the adopted plan ancestry, rather than
 * only the latest missing witness. Unadopted or unrelated proposals add nothing.
 * This is provenance and assignment accounting, never tactical approval. */
export function guideReplyRequirementLedger(main:GuideSegmentJournal,plan:GuideReplyPlan,options:GuideConstructionRuntime):GuideReplyRequirementLedger{
 const {archive,scope,packet}=options
 verifyGuideSegments(main,scope,packet)
 if(archive.id!==scope.jobId||archive.projectId!==scope.projectId||plan.caseId!==main.setup.id||plan.mainHash!==main.segments[2]?.hash)throw new Error('Requisiti repliche: ambito o linea principale diversi.')
 const scopeHash=guideHash(scope),packetHash=guideHash(packet),seen=new Set<string>(),ancestry:{key:string;selectionHash:string;context:any;requirements:Requirement[];beforeHash:string}[]=[]
 const choices=[...archive.values<any>('guide-reply-plan-choice-result-v1')]
 let current=plan
 for(;;){
  const signature=guideHash(current);if(seen.has(signature))throw new Error('Requisiti repliche: ciclo nella provenienza dei piani.');seen.add(signature)
  const rows=choices.filter(r=>guideHash(r.value.result?.plan)===signature)
  if(!rows.length)break
  if(rows.length!==1)throw new Error('Requisiti repliche: provenienza del piano ambigua.')
  const row=rows[0],saved=archive.value<any>('guide-reply-plan-choice-context-v1',row.key),context=saved?.context,decision=row.value.result.decision
  if(!context||saved.hash!==guideHash(context)||row.value.contextHash!==saved.hash||decision?.contextHash!==saved.hash||decision.caseId!==plan.caseId||context.packetHash!==packetHash||guideHash(context.scope)!==scopeHash||context.before.caseId!==plan.caseId||context.before.mainHash!==plan.mainHash)throw new Error('Requisiti repliche: contesto della scelta alterato o estraneo.')
  const selection=archive.value<any>('guide-reply-plan-selection-v1',context.selectionHash)
  if(!selection||guideHash(selection)!==context.selectionHash||guideHash(selection.scope)!==scopeHash||selection.packetHash!==packetHash||selection.caseId!==plan.caseId||selection.mainHash!==plan.mainHash||guideHash(selection.before)!==guideHash(context.before)||guideHash(selection.requirements)!==guideHash(context.requirements))throw new Error('Requisiti repliche: richiesta originale non verificabile.')
  const need=archive.value<GuideMetadataBranchNeed>('guide-metadata-needs-v1',context.metadataNeedHash)
  if(!need||guideHash(need)!==context.metadataNeedHash||need.kind!=='needs-branches'||need.caseId!==plan.caseId||guideHash(need.requirements)!==guideHash(selection.requirements))throw new Error('Requisiti repliche: origine metadata diversa o mancante.')
  if((context.retained||selection.retained)&&(!context.retained||!selection.retained||guideHash(context.retained)!==guideHash(selection.retained)))throw new Error('Requisiti repliche: registro conservato diverso dalla selezione.')
  const previous=new Map(guideReplySeeds(context.before).map(s=>[s.id,s])),proposal=new Map(guideReplySeeds(context.proposal).map(s=>[s.id,s])),ids=[...new Set([...previous.keys(),...proposal.keys()])],selected=new Map<string,any>(),declared=new Set<string>([...(context.requirements as Requirement[]).map(guideHash),...(context.retained?.requirements??[]).map((r:any)=>r.id)]),covered=new Set<string>()
  if(!Array.isArray(decision.choices)||decision.choices.length!==ids.length||new Set(decision.choices.map((c:any)=>c.id)).size!==ids.length)throw new Error('Requisiti repliche: decisione con identità duplicate o mancanti.')
  for(const c of decision.choices){
   if(!ids.includes(c.id)||!['previous','proposal','omit'].includes(c.source)||!Array.isArray(c.requirementIds)||new Set(c.requirementIds).size!==c.requirementIds.length||c.requirementIds.some((id:string)=>!declared.has(id)))throw new Error('Requisiti repliche: assegnazione non verificabile.')
   if(c.referenceBranchIds!==undefined&&(!Array.isArray(c.referenceBranchIds)||new Set(c.referenceBranchIds).size!==c.referenceBranchIds.length||c.referenceBranchIds.some((id:string)=>!previous.has(id))||c.source==='omit'&&c.referenceBranchIds.length))throw new Error('Requisiti repliche: riferimenti storici duplicati o estranei alla scelta.')
   if(c.source==='omit'){if(previous.has(c.id))throw new Error('Requisiti repliche: omissione di variante originale.');continue}
   const seed=(c.source==='previous'?previous:proposal).get(c.id)
   if(!seed||c.source==='proposal'&&!c.requirementIds.length||c.forkAtTurn!==undefined&&(c.forkAtTurn!==0||c.source!=='proposal'||seed.role!=='other'))throw new Error('Requisiti repliche: variante estranea alla decisione.')
   selected.set(c.id,{...structuredClone(seed),...c.forkAtTurn===0?{forkAtTurn:0}:{}});if(c.source==='proposal')c.requirementIds.forEach((id:string)=>covered.add(id))
  }
  const expected={...structuredClone(context.before),direct:selected.get(context.before.direct.id),access:selected.get(context.before.access.id),defend:selected.get(context.before.defend.id),others:ids.filter(id=>selected.get(id)?.role==='other').map(id=>selected.get(id))}
  if((context.requirements as Requirement[]).map(guideHash).some(id=>!covered.has(id))||guideHash(expected)!==signature)throw new Error('Requisiti repliche: piano diverso dalla scelta originale.')
  for(const r of selection.requirements as Requirement[]){
   if(typeof r.goal!=='string'||!r.goal.trim()||r.goal.length>1600||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>4000||!Array.isArray(r.sourceIds)||!r.sourceIds.length||r.sourceIds.length>30||r.sourceIds.some(id=>!packet.sources.some(s=>s.id===id)))throw new Error('Requisiti repliche: requisito o fonte non validi.')
  }
  ancestry.push({key:row.key,selectionHash:context.selectionHash,context,requirements:structuredClone(selection.requirements),beforeHash:guideHash(context.before)})
  current=context.before
 }
 const snapshot=(start:number,planHash:string):GuideReplyRequirementLedger=>{
  const kept=new Map<string,Requirement&{id:string;selectionKeys:string[]}>()
  for(const edge of ancestry.slice(start))for(const r of edge.requirements){const id=guideHash(r),prior=kept.get(id);if(prior){if(!prior.selectionKeys.includes(edge.selectionHash))prior.selectionKeys.push(edge.selectionHash)}else kept.set(id,{id,...structuredClone(r),selectionKeys:[edge.selectionHash]})}
  return {version:1,caseId:plan.caseId,mainHash:plan.mainHash,packetHash,scopeHash,planHash,selections:ancestry.slice(start).map(e=>e.selectionHash),choiceKeys:ancestry.slice(start).map(e=>e.key),requirements:[...kept.values()].map(r=>({...r,selectionKeys:r.selectionKeys.sort()})).sort((a,b)=>a.id.localeCompare(b.id))}
 }
 for(const[i,edge]of ancestry.entries())if(edge.context.retained&&guideHash(edge.context.retained)!==guideHash(snapshot(i+1,edge.beforeHash)))throw new Error('Requisiti repliche: registro storico incompleto o alterato.')
 return snapshot(0,guideHash(plan))
}
export function guideReplyRequirementAssignments(main:GuideSegmentJournal,plan:GuideReplyPlan,options:GuideConstructionRuntime){
 const ledger=guideReplyRequirementLedger(main,plan,options),known=new Set(ledger.requirements.map(r=>r.id)),assignments=guideReplySeeds(plan).map(seed=>({branchId:seed.id,seedHash:guideHash(seed),requirementIds:guideReplyObjective(seed,main,options,new Set(ledger.choiceKeys)).requirements.map(r=>r.id).filter(id=>known.has(id))}))
 const assigned=new Set(assignments.flatMap(a=>a.requirementIds))
 return {ledger,assignments,unassignedRequirementIds:ledger.requirements.filter(r=>!assigned.has(r.id)).map(r=>r.id)}
}
/** The AI sees every original obligation and binding. Opaque internal ancestry
 * addresses stay in the full verified host ledger rather than becoming facts
 * the model must interpret. This is a new protocol view, not a history summary. */
export function guideReplyRequirementView(value:ReturnType<typeof guideReplyRequirementAssignments>){
 return {ledger:{caseId:value.ledger.caseId,requirements:value.ledger.requirements.map(({id,goal,reason,sourceIds})=>({id,goal,reason,sourceIds:[...sourceIds]}))},assignments:value.assignments.map(({branchId,requirementIds})=>({branchId,requirementIds:[...requirementIds]})),unassignedRequirementIds:[...value.unassignedRequirementIds]}
}
/** A changed witness is not an implicit withdrawal of the original request.
 * New assignments still need ordinary construction and independent criticism. */
export function assertGuideReplyRequirementRetention(before:ReturnType<typeof guideReplyRequirementAssignments>,after:ReturnType<typeof guideReplyRequirementAssignments>):void{
 for(const key of ['caseId','mainHash','packetHash','scopeHash'] as const)if(before.ledger[key]!==after.ledger[key])throw new Error('Requisiti repliche: confronto fra ambiti diversi.')
 const declared=new Set(after.ledger.requirements.map(r=>r.id)),assignedBefore=new Set(before.assignments.flatMap(a=>a.requirementIds)),assignedAfter=new Set(after.assignments.flatMap(a=>a.requirementIds))
 if(before.ledger.requirements.some(r=>!declared.has(r.id)||assignedBefore.has(r.id)&&!assignedAfter.has(r.id)))throw new Error('Requisiti repliche: una nuova scelta ha perso un requisito originale o il suo testimone assegnato.')
}
