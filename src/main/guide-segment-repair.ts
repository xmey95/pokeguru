import {guideHash} from './matchup-guide-packet'
import type {GuideContent} from '../shared/matchup-guide'
import {checkGuide,readGuideContent} from '../shared/matchup-guide'
import {createGuideSegments,forkGuideSegments,verifyGuideSegments,type GuideSegmentJournal} from './guide-segments'
import {guideSegmentCheckpointFeedback,loadGuideSegmentCheckpoint,saveGuideSegmentCheckpoint,type GuideSegmentLine} from './guide-segment-checkpoints'
import {constructGuideMainLines} from './guide-mainline-phase'
import {constructGuideReplyPlans,constructGuideReplyBranches,type GuideConstructionRuntime} from './guide-reply-phase'
import {constructGuideScenarioMetadata,type GuideMetadataRepair} from './guide-scenario-metadata'
import type {GuideReplyPlanRepair} from './guide-reply-plan'
import {readArchivedGuideSegmentReview,type GuideSegmentConstruction,type GuideSegmentReview,type GuideSegmentFinding} from './guide-segment-review'
import type {GuideSegmentRepairFeedback} from './guide-segment-repair-feedback'
import {GuidePremiseSetupRejected} from './guide-segment-generation'
import {repairGuideSetup} from './guide-setup-repair'
import {constructGuideScenarioEvaluations} from './guide-scenario-evaluation'
import {assertGuideRuntimeEvidence} from './guide-evidence-extension'

type Review={unitId:string;review:GuideSegmentReview}
export interface GuideSegmentRepairEpoch {version:1;scope:GuideConstructionRuntime['scope'];packetHash:string;sequence:number;previousHash:string|null;phase:'scenarios'|'final';draft:GuideContent;construction:GuideSegmentConstruction;reviews:Review[];pendingTextIds:string[];pendingReviews:Review[]}
export interface GuideSegmentRepairResult {epochHash:string;draft:GuideContent;construction:GuideSegmentConstruction;changedCaseIds:string[];textTargetIds:string[];requiresScenarioReviewBeforeText:boolean}
type CaseEdit={caseId:string;setup:boolean;mainRetain?:number;branchRetain:Map<string,number>;plan:boolean;findings:GuideSegmentFinding[]}
const startRole='guide-segment-repair-start-v1',resultRole='guide-segment-repair-result-v1'
const owner=(r:GuideConstructionRuntime)=>{if(r.archive.id!==r.scope.jobId||r.archive.projectId!==r.scope.projectId)throw new Error('Riparazione: archivio di un altro job o progetto.');assertGuideRuntimeEvidence(r)}
export function assertSelectedGuideConstruction(construction:GuideSegmentConstruction,options:GuideConstructionRuntime):void{
 for(const main of construction.mains){
  verifyGuideSegments(main,options.scope,options.packet)
  const selected=loadGuideSegmentCheckpoint(options.archive,options.scope,options.packet,main.setup.id,main.rootHash)
  if(!selected||guideHash(selected)!==guideHash(main))throw new Error('Riparazione: linea principale superata.')
 }
 for(const branch of construction.branches){
  verifyGuideSegments(branch.journal,options.scope,options.packet)
  const selected=loadGuideSegmentCheckpoint(options.archive,options.scope,options.packet,branch.caseId,branch.journal.rootHash,branch.line)
  const main=construction.mains.find(m=>m.setup.id===branch.caseId)
  if(!selected||guideHash(selected)!==guideHash(branch.journal)||main?.segments[0].hash!==branch.journal.segments[0].hash)throw new Error('Riparazione: ramo superato o appartenente a un altro prefisso.')
 }
}

export function latestGuideSegmentRepair(options:GuideConstructionRuntime):{key:string;epoch:GuideSegmentRepairEpoch;result?:GuideSegmentRepairResult}|undefined{
 owner(options)
 const rows=[...options.archive.values<GuideSegmentRepairEpoch>(startRole)].sort((a,b)=>a.value.sequence-b.value.sequence)
 let previous:string|null=null
 for(const [i,row]of rows.entries()){
  if(row.key!==guideHash(row.value)||row.value.version!==1||row.value.sequence!==i||row.value.previousHash!==previous||guideHash(row.value.scope)!==guideHash(options.scope)||row.value.packetHash!==guideHash(options.packet))throw new Error('Riparazione: catena, fonti o configurazione alterate.')
  if(i&& !options.archive.value(resultRole,previous!))throw new Error('Riparazione: epoca precedente ancora incompleta.')
  previous=row.key
 }
 const last=rows.at(-1);if(!last)return undefined
 const result=options.archive.value<GuideSegmentRepairResult>(resultRole,last.key)
 if(result&&result.epochHash!==last.key)throw new Error('Riparazione: risultato di un’altra epoca.')
 return {key:last.key,epoch:last.value,...result?{result}:{}}
}

export function beginGuideSegmentRepair(draft:GuideContent,construction:GuideSegmentConstruction,reviews:GuideSegmentReview[],options:GuideConstructionRuntime):{key:string;epoch:GuideSegmentRepairEpoch}{
 owner(options)
 const negative:Review[]=reviews.filter(r=>r.verdict!=='pass').map(review=>{
  const unit=[...options.archive.values<Review>('guide-segment-review-v1')].find(v=>guideHash(v.value.review)===guideHash(review))?.value
  if(!unit)throw new Error('Riparazione: critica negativa originale non archiviata.')
  readArchivedGuideSegmentReview(unit.unitId,review,draft,construction,options)
  return unit
 })
 if(!negative.length)throw new Error('Riparazione: nessun rilievo indipendente da risolvere.')
 const latest=latestGuideSegmentRepair(options)
 if(latest&&!latest.result)throw new Error('Riparazione pendente: riprendere la stessa epoca prima di avviarne un’altra.')
 if(latest?.result&&guideHash(latest.result.construction)!==guideHash(construction))throw new Error('Riparazione: costruzione diversa dall’ultimo risultato corrente.')
 assertSelectedGuideConstruction(construction,options)
 const ready=latest&&options.archive.value<{draft:GuideContent}>('guide-segment-repair-ready-v1',latest.key)
 if(ready&&latest?.epoch.phase==='final'&&guideHash(ready.draft)!==guideHash(draft))throw new Error('Riparazione: bozza diversa dall’ultimo risultato corrente.')
 const epoch:GuideSegmentRepairEpoch={version:1,scope:options.scope,packetHash:guideHash(options.packet),sequence:latest?latest.epoch.sequence+1:0,previousHash:latest?.key??null,phase:draft.chapters.length?'final':'scenarios',draft:structuredClone(draft),construction:structuredClone(construction),reviews:negative,pendingTextIds:!ready?latest?.result?.textTargetIds??[]:[],pendingReviews:!ready&&latest?[...latest.epoch.pendingReviews,...latest.epoch.reviews]:[]}
 const key=guideHash(epoch);options.archive.saveValue(startRole,key,epoch)
 return {key,epoch}
}

function editsFor(epoch:GuideSegmentRepairEpoch,options:GuideConstructionRuntime):Map<string,CaseEdit>{
 const edits=new Map<string,CaseEdit>()
 for(const saved of epoch.reviews){
  const review=readArchivedGuideSegmentReview(saved.unitId,saved.review,epoch.draft,epoch.construction,options)
  for(const finding of review.findings){
   const target=finding.repair;if(target.kind==='text')continue
   let edit=edits.get(target.caseId)
   if(!edit){edit={caseId:target.caseId,setup:false,branchRetain:new Map(),plan:false,findings:[]};edits.set(target.caseId,edit)}
   edit.findings.push(finding)
   if(target.kind==='setup')edit.setup=true
   if(target.kind==='reply-plan')edit.plan=true
   if(target.kind==='turn'){
    const line=target.lineId==='main'?epoch.construction.mains.find(m=>m.setup.id===target.caseId):epoch.construction.branches.find(b=>b.caseId===target.caseId&&b.seed.id===target.lineId)?.journal
    const index=line?.segments.findIndex(s=>s.receipt.lastTurn===target.fromTurn)
    if(index===undefined||index<0)throw new Error('Riparazione: finestra contestata non disponibile.')
    if(target.lineId==='main')edit.mainRetain=Math.min(edit.mainRetain??3,index)
    else edit.branchRetain.set(target.lineId,Math.min(edit.branchRetain.get(target.lineId)??3,index))
   }
  }
 }
 return edits
}
function invalidate(epoch:GuideSegmentRepairEpoch,key:string,journal:GuideSegmentJournal,retain:number,findings:GuideSegmentFinding[],options:GuideConstructionRuntime,line?:GuideSegmentLine):void{
 const marker=guideHash([key,journal.setup.id,line??'main']),saved=options.archive.value<any>('guide-segment-repair-invalidation-v1',marker)
 if(saved){if(saved.epochHash!==key||saved.beforeHash!==guideHash(journal)||saved.retain!==retain)throw new Error('Riparazione: invalidazione archiviata incoerente.');return}
 const feedback:GuideSegmentRepairFeedback={epochHash:key,rejected:journal,retainTurns:retain,reviewHashes:epoch.reviews.map(r=>guideHash(r.review)),findings}
 const reviewHash=guideHash(feedback);options.archive.saveValue('guide-segment-repair-feedback-v1',reviewHash,feedback)
 const current=loadGuideSegmentCheckpoint(options.archive,options.scope,options.packet,journal.setup.id,journal.rootHash,line)
 if(!current)throw new Error('Riparazione: checkpoint da invalidare assente.')
 const currentFeedback=guideSegmentCheckpointFeedback(options.archive,options.scope,options.packet,journal.setup.id,journal.rootHash,line)
 if(currentFeedback?.reviewHash!==reviewHash){
  if(guideHash(current)!==guideHash(journal))throw new Error('Riparazione: la linea da invalidare è già cambiata.')
  saveGuideSegmentCheckpoint(options.archive,options.scope,options.packet,forkGuideSegments(journal,options.scope,options.packet,retain),{reviewHash,reason:findings.map(f=>f.message).join('\n')},line)
 }
 options.archive.saveValue('guide-segment-repair-invalidation-v1',marker,{epochHash:key,beforeHash:guideHash(journal),retain})
}

/** Recoverable construction transaction: SQL invalidation markers and accepted
 * units survive each await. No AI declaration or independent finding is edited. */
export async function executeGuideSegmentRepair(key:string,epoch:GuideSegmentRepairEpoch,options:GuideConstructionRuntime&{invalidateTexts:(draft:GuideContent,changed:string[])=>string[]}):Promise<GuideSegmentRepairResult>{
 owner(options)
 const latest=latestGuideSegmentRepair(options)
 if(!latest||latest.key!==key||guideHash(epoch)!==key)throw new Error('Riparazione: epoca non corrente.')
 if(latest.result){assertSelectedGuideConstruction(latest.result.construction,options);return latest.result}
 const edits=editsFor(epoch,options),before=epoch.construction,construction=structuredClone(before),{scope,packet,archive}=options
 const mainEdits=[...edits.values()].filter(e=>e.setup||e.mainRetain!==undefined),planEdits=[...edits.values()].filter(e=>e.setup||e.mainRetain!==undefined||e.plan)
 const mainPhases=Math.max(0,...mainEdits.map(e=>e.setup||e.mainRetain===0?4:3-e.mainRetain!))
 const branchPhases=planEdits.length?2:Math.max(0,...[...edits.values()].flatMap(e=>[...e.branchRetain.values()].map(n=>3-n)))
 const after=options.reserveOutside,metadataPhases=edits.size?1:0,planPhases=planEdits.length?1:0
 for(const edit of edits.values()){
  const main=before.mains.find(m=>m.setup.id===edit.caseId)!
  if(edit.setup||edit.mainRetain!==undefined)invalidate(epoch,key,main,edit.setup?0:edit.mainRetain!,edit.findings,options)
  // A changed first turn invalidates every fork through its source acceptance.
  if(!edit.setup&&edit.mainRetain!==0)for(const [id,retain]of edit.branchRetain){
   const branch=before.branches.find(b=>b.caseId===edit.caseId&&b.seed.id===id)!
   invalidate(epoch,key,branch.journal,retain,edit.findings,options,branch.line)
  }
 }
 const setups=mainEdits.map(edit=>structuredClone(before.mains.find(m=>m.setup.id===edit.caseId)!.setup))
 for(const edit of mainEdits.filter(e=>e.setup)){
  options.check()
  const index=setups.findIndex(s=>s.id===edit.caseId),prefix=before.mains.find(m=>m.setup.id===edit.caseId)!
  setups[index]=await repairGuideSetup(prefix,{kind:'complete',reviews:epoch.reviews},{...options,reserveOutside:mainPhases+planPhases+branchPhases+metadataPhases+after})
 }
 if(mainEdits.length){
  for(;;){
   try{
    const built=await constructGuideMainLines({...options,setups,reserveOutside:planPhases+branchPhases+metadataPhases+after})
    for(const main of built){const index=construction.mains.findIndex(m=>m.setup.id===main.journal.setup.id);construction.mains[index]=main.journal}break
   }catch(error){
    if(!(error instanceof GuidePremiseSetupRejected)||!error.prefix)throw error
    const index=setups.findIndex(s=>s.id===error.prefix!.setup.id);if(index<0)throw error
    setups[index]=await repairGuideSetup(error.prefix,error.review,{...options,reserveOutside:4+planPhases+branchPhases+metadataPhases+after})
   }
  }
 }
 if(planEdits.length){
  const repairs=new Map<string,GuideReplyPlanRepair>(planEdits.map(e=>[e.caseId,{previous:before.plans.find(p=>p.caseId===e.caseId)!,findings:e.findings,requireChange:e.plan}]))
  const plans=await constructGuideReplyPlans(construction.mains.filter(m=>repairs.has(m.setup.id)),{...options,reserveOutside:metadataPhases+after},repairs)
  for(const plan of plans)construction.plans[construction.plans.findIndex(p=>p.caseId===plan.caseId)]=plan
 }
 if(edits.size){
  const repairs=new Map<string,GuideMetadataRepair>([...edits.values()].map(e=>[e.caseId,{previous:before.built.find(b=>b.native.id===e.caseId)!,findings:e.findings}]))
  const {built,plans,branches}=await constructGuideScenarioEvaluations(construction.mains.filter(m=>edits.has(m.setup.id)),construction.plans,{...options,reserveOutside:after},repairs)
  for(const plan of plans)construction.plans[construction.plans.findIndex(p=>p.caseId===plan.caseId)]=plan
  construction.branches=construction.mains.flatMap(main=>(edits.has(main.setup.id)?branches:construction.branches).filter(b=>b.caseId===main.setup.id))
  for(const value of built)construction.built[construction.built.findIndex(b=>b.native.id===value.native.id)]=value
 }
 const changedCaseIds=[...edits.keys()],oldClaimIds=new Set(before.built.filter(b=>edits.has(b.native.id)).flatMap(b=>b.raw.claims.map(c=>c.id))),oldLimitations=new Set(before.built.flatMap(b=>b.raw.limitations))
 const draft=readGuideContent({...epoch.draft,scenarios:epoch.draft.scenarios.map(s=>construction.built.find(b=>b.native.id===s.id)!.content.scenarios[0]),claims:[...epoch.draft.claims.filter(c=>!oldClaimIds.has(c.id)),...construction.built.filter(b=>edits.has(b.native.id)).flatMap(b=>b.raw.claims)],limitations:[...new Set([...epoch.draft.limitations.filter(l=>!oldLimitations.has(l)),...construction.built.flatMap(b=>b.raw.limitations)])]},options.packet.basis.promptVersion)
 const textSeeds=epoch.reviews.flatMap(r=>r.review.findings.filter(f=>f.repair.kind==='text').map(f=>f.targetId))
 const nativeClaimIds=new Set(construction.built.flatMap(b=>b.raw.claims.map(c=>c.id)))
 const affected=new Set(options.invalidateTexts(epoch.draft,[...changedCaseIds,...oldClaimIds,...textSeeds,...epoch.pendingTextIds])),textTargetIds=[...draft.chapters,...draft.claims,...draft.exercises].filter(c=>affected.has(c.id)&&!nativeClaimIds.has(c.id)).map(c=>c.id)
 // Native-only gates remain mandatory even when old dependent prose is waiting
 // for its explicit AI rewrite and the subsequent complete independent review.
 const nativeCheck=checkGuide({...draft,chapters:[],exercises:[]},options.evidencePacket??packet,false)
 if(nativeCheck.errors.length)throw new Error(nativeCheck.errors.join('\n'))
 const result:GuideSegmentRepairResult={epochHash:key,draft,construction,changedCaseIds,textTargetIds,requiresScenarioReviewBeforeText:epoch.phase==='final'&&!!changedCaseIds.length}
 archive.saveValue(resultRole,key,result)
 return result
}
