import {guideHash} from './matchup-guide-packet'
import {guideReplyObjective} from './guide-reply-objective'
import {guideReplyRequirementLedger} from './guide-reply-requirements'
import {verifyGuideSegments,type GuideSegmentJournal} from './guide-segments'
import {guideReplySeeds,readGuideReplyPlan,type GuideReplyPlan,type GuideReplySeed} from './guide-reply-plan'
import type {GuideConstructionRuntime} from './guide-reply-phase'

/** Exact historical same-phase declarations, never newly available resources
 * or an approval. The chosen plan ancestry fixes the reference snapshot. */
export function guideReplyReferenceTurns(seed:GuideReplySeed,journal:GuideSegmentJournal,main:GuideSegmentJournal,plan:GuideReplyPlan,options:GuideConstructionRuntime){
 const phase=journal.segments.length
 if(phase<0||phase>2)throw new Error('Riferimenti repliche: fase non valida.')
 verifyGuideSegments(journal,options.scope,options.packet)
 if(journal.setup.id!==main.setup.id||journal.rootHash!==main.rootHash)throw new Error('Riferimenti repliche: prefisso di un altro caso o setup.')
 readGuideReplyPlan(main,options.scope,options.packet,plan)
 if(!guideReplySeeds(plan).some(s=>guideHash(s)===guideHash(seed)))throw new Error('Riferimenti repliche: variante estranea al piano scelto.')
 const ledger=guideReplyRequirementLedger(main,plan,options),objective=guideReplyObjective(seed,journal,options,new Set(ledger.choiceKeys)),assigned=new Set(objective.assignments.map(a=>a.choiceKey)),key=ledger.choiceKeys.find(k=>assigned.has(k))
 if(!key)return null
 const saved=options.archive.value<any>('guide-reply-plan-choice-context-v1',key),result=options.archive.value<any>('guide-reply-plan-choice-result-v1',key),context=saved?.context,choice=result?.result.decision.choices.find((c:any)=>c.id===seed.id)
 if(!context||!choice||saved.hash!==guideHash(context)||result.contextHash!==saved.hash||context.before.mainHash!==main.segments[2]?.hash||context.packetHash!==guideHash(options.packet)||guideHash(context.scope)!==guideHash(options.scope))throw new Error('Riferimenti repliche: scelta o contesto estranei.')
 // Historical decisions did not declare references. Keep their complete
 // contemporaneous baseline snapshot; fresh decisions can select exact IDs.
 const ids:string[]=choice.referenceBranchIds??context.branches.map((b:any)=>b.seed.id)
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!context.branches.some((b:any)=>b.seed.id===id)))throw new Error('Riferimenti repliche: ramo mancante, duplicato o estraneo alla scelta.')
 const turns=ids.map(id=>{
  const branch=context.branches.find((b:any)=>b.seed.id===id),source=branch.journal as GuideSegmentJournal
  if(source.setup.id!==journal.setup.id||source.rootHash!==main.rootHash||branch.caseId!==journal.setup.id)throw new Error('Riferimenti repliche: radice o caso diversi.')
  verifyGuideSegments(source,options.scope,options.packet)
  if(!source.segments.length||source.segments.length!==3&&!source.segments.at(-1)!.receipt.terminal||branch.terminal!==!!source.segments.at(-1)!.receipt.terminal)throw new Error('Riferimenti repliche: testimone storico incompleto o terminalità diversa.')
  const turn=source.segments[phase]
  if(!turn)return {branchId:id,role:branch.seed.role,sourceHead:source.segments.at(-1)!.hash,terminalBeforePhase:true as const,termination:structuredClone(source.segments.at(-1)!.receipt.termination)}
  return {branchId:id,role:branch.seed.role,sourceHead:source.segments.at(-1)!.hash,terminalBeforePhase:false as const,phase:turn.phase,beforeReceipt:phase?structuredClone(source.segments[phase-1].receipt):null,body:structuredClone(turn.body),development:structuredClone(turn.development),receipt:structuredClone(turn.receipt)}
 })
 return {version:1,choiceKey:key,contextHash:saved.hash,caseId:journal.setup.id,phase,turns}
}
