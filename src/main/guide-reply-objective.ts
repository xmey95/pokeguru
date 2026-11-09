import {guideHash} from './matchup-guide-packet'
import {guideReplySeeds,type GuideReplySeed,type GuideReplyPlan} from './guide-reply-plan'
import {loadGuideSegmentCheckpoint} from './guide-segment-checkpoints'
import type {GuideSegmentJournal} from './guide-segments'
import type {GuideConstructionRuntime} from './guide-reply-phase'

/** Recover the original AI-assigned requirements, not a host paraphrase of the
 * seed. The planning decision's reason must not disappear before execution. */
export function guideReplyObjective(seed:GuideReplySeed,journal:GuideSegmentJournal,options:GuideConstructionRuntime,choiceKeys?:Set<string>){
 const {archive,scope,packet}=options
 if(archive.id!==scope.jobId||archive.projectId!==scope.projectId)throw new Error('Obiettivo replica: archivio estraneo.')
 const assignments:{choiceKey:string;contextHash:string;reason:string;requirementIds:string[]}[]=[],requirements=new Map<string,any>(),seedHash=guideHash(seed)
 const rows=[...archive.values<any>('guide-reply-plan-choice-result-v1')].filter(row=>(!choiceKeys||choiceKeys.has(row.key))&&row.value.result?.plan?.caseId===journal.setup.id&&guideReplySeeds(row.value.result.plan).some(s=>guideHash(s)===seedHash))
 if(!rows.length)return {version:1,seedHash,seed:structuredClone(seed),assignments,requirements:[] as any[]}
 const main=loadGuideSegmentCheckpoint(archive,scope,packet,journal.setup.id,journal.rootHash)
 if(!main?.segments.length)throw new Error('Obiettivo replica: prima mossa di riferimento mancante.')
 for(const row of rows){
  const plan=row.value.result?.plan as GuideReplyPlan|undefined
  if(!plan||plan.caseId!==journal.setup.id||plan.mainHash!==main.segments[2]?.hash||!guideReplySeeds(plan).some(s=>guideHash(s)===seedHash))continue
  const decision=row.value.result.decision,choice=decision?.choices?.find((c:any)=>c.id===seed.id)
  if(choice?.source!=='proposal'&&!(choice?.source==='previous'&&choice.requirementIds?.length))continue
  const saved=archive.value<any>('guide-reply-plan-choice-context-v1',row.key),context=saved?.context
  if(!context||context.version!==1||saved.hash!==guideHash(context)||row.value.contextHash!==saved.hash||decision.contextHash!==saved.hash||decision.caseId!==plan.caseId||context.packetHash!==guideHash(packet)||guideHash(context.scope)!==guideHash(scope)||context.before.caseId!==plan.caseId||context.before.mainHash!==plan.mainHash||decision.choices.filter((c:any)=>c.id===seed.id).length!==1)throw new Error('Obiettivo replica: contesto di assegnazione alterato o estraneo.')
  const selection=archive.value<any>('guide-reply-plan-selection-v1',context.selectionHash)
  if(!selection||guideHash(selection)!==context.selectionHash||guideHash(selection.scope)!==guideHash(scope)||selection.packetHash!==guideHash(packet)||selection.caseId!==plan.caseId||selection.mainHash!==plan.mainHash||guideHash(selection.before)!==guideHash(context.before)||guideHash(selection.requirements)!==guideHash(context.requirements))throw new Error('Obiettivo replica: requisiti originali non verificabili.')
  if((context.retained||selection.retained)&&(!context.retained||!selection.retained||guideHash(context.retained)!==guideHash(selection.retained)||context.retained.planHash!==guideHash(context.before)||context.retained.mainHash!==plan.mainHash||context.retained.packetHash!==guideHash(packet)||context.retained.scopeHash!==guideHash(scope)))throw new Error('Obiettivo replica: registro dei requisiti precedenti diverso o estraneo.')
  const original=guideReplySeeds(choice.source==='previous'?context.before:context.proposal).find(s=>s.id===seed.id)
  if(!original||guideHash({...original,...choice.forkAtTurn===0?{forkAtTurn:0}:{}})!==seedHash||typeof choice.reason!=='string'||!choice.reason.trim()||!Array.isArray(choice.requirementIds)||!choice.requirementIds.length||new Set(choice.requirementIds).size!==choice.requirementIds.length)throw new Error('Obiettivo replica: decisione diversa dal piano selezionato.')
  const retained=(context.retained?.requirements??[]).map((r:any)=>{const {id,selectionKeys,...value}=r;if(guideHash(value)!==id)throw new Error('Obiettivo replica: identificativo del requisito precedente diverso.');return value})
  const declared=new Map<string,any>([...context.requirements,...retained].map((r:any)=>[guideHash(r),r]))
  for(const id of choice.requirementIds){const r=declared.get(id);if(!r||!Array.isArray(r.sourceIds)||r.sourceIds.some((s:string)=>!packet.sources.some(p=>p.id===s)))throw new Error('Obiettivo replica: requisito o fonti estranei.');requirements.set(id,{id,...structuredClone(r)})}
  assignments.push({choiceKey:row.key,contextHash:saved.hash,reason:choice.reason,requirementIds:[...choice.requirementIds]})
 }
 return {version:1,seedHash,seed:structuredClone(seed),assignments:assignments.sort((a,b)=>a.choiceKey.localeCompare(b.choiceKey)),requirements:[...requirements.values()].sort((a,b)=>a.id.localeCompare(b.id))}
}
