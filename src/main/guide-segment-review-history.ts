import {guideHash} from './matchup-guide-packet'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuideSegmentReview,GuideSegmentFinding} from './guide-segment-review'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {assertGuideRuntimeEvidence} from './guide-evidence-extension'
import {assertGuideRequirementResolutions,guideRequirementAuditSchema} from './guide-requirement-review'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {projectGuideProofHistory} from './guide-review-proof-scope'
import {assertGuideProofReviewEvidence} from './guide-proof-review-evidence'
import type {GuideContent} from '../shared/matchup-guide'

interface Review {unitId:string;review:GuideSegmentReview}
interface RequestContext {scope:GuideConstructionRuntime['scope'];stage:string;task:string;instructionsHash:string}
interface Snapshot {data:any;historyKeys:string[];auditFindings:{hash:string;reviewKeys:string[]}[];request:RequestContext}
interface Atom {key:string;unitId:string;review:GuideSegmentReview;snapshot:Snapshot}
export type GuideReviewEvidenceScope=Pick<GuideConstructionRuntime,'scope'|'packet'|'evidencePacket'|'evidenceAnchor'|'archive'>
export interface GuideSegmentReviewHistory {reviews:Atom[];findings:{hash:string;finding:GuideSegmentFinding;reviewKeys:string[]}[]}
export interface GuideFindingResolution {findingHash:string;disposition:'resolved'|'superseded'|'still-open';reason:string;sourceIds:string[];currentFindingIndex:number|null}
const role='guide-segment-review-context-v1'
const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v
const inputHash=(request:RequestContext,data:any)=>guideHash(ordered({request,data}))

function atoms(keys:string[],options:GuideReviewEvidenceScope):Atom[]{
 const result:Atom[]=[],seen=new Set<string>(),visiting=new Set<string>()
 const read=(key:string)=>{
  if(visiting.has(key))throw new Error('Storico critiche: riferimenti circolari.')
  if(seen.has(key))return
  visiting.add(key)
  const review=options.archive.value<Review>('guide-segment-review-v1',key),snapshot=options.archive.value<Snapshot>(role,key)
  if(!review||!snapshot||guideHash([review.unitId,review.review])!==key||guideHash(snapshot.data.draft)!==review.review.draftHash)throw new Error('Storico critiche: contesto originale mancante o estraneo.')
  assertGuideRuntimeEvidence(options,snapshot.data.packet)
  if(guideHash(snapshot.data.contexts.map((c:any)=>({caseId:c.scenarioId,lineId:c.lineId,head:c.reviewedHash,acceptanceLine:c.acceptanceLine})))!==review.review.constructionHash)throw new Error('Storico critiche: stati originali non corrispondenti al riesame.')
  for(const parent of snapshot.historyKeys)read(parent)
  const parents=snapshot.historyKeys.map(k=>result.find(r=>r.key===k)!)
  const prior={reviews:parents,findings:snapshot.auditFindings.map(f=>{
   const original=parents.flatMap(p=>p.review.findings).find(item=>guideHash(item)===f.hash)
   if(!original||f.reviewKeys.some(k=>!parents.some(p=>p.key===k&&p.review.findings.some(x=>guideHash(x)===f.hash))))throw new Error('Storico critiche: rilievi originari non ricostruibili.')
   return {...f,finding:original}
  })}
  const {reviewContextHash,...plain}=snapshot.data
  const priorView=snapshot.data.proofPartition?projectGuideProofHistory(prior,snapshot.data.proofPartition):prior
  if(guideHash(snapshot.request.scope)!==guideHash(options.scope)||reviewContextHash!==review.review.reviewContextHash||inputHash(snapshot.request,{...plain,reviewHistory:priorView})!==reviewContextHash)throw new Error('Storico critiche: input del riesame diverso dal contesto originale.')
  visiting.delete(key);seen.add(key);result.push({key,...review,snapshot})
 }
 for(const key of keys)read(key)
 return result
}
export function assertGuideFinalReviewEvidence(keys:string[],options:GuideReviewEvidenceScope,expectedDraft?:GuideContent,requirePartition=false):void{
 if(!keys.length||new Set(keys).size!==keys.length)throw new Error('Riesame finale: riferimenti alle critiche mancanti o duplicati.')
 const saved=atoms(keys,options),current=guideHash(options.evidencePacket??options.packet)
 for(const key of keys){
  const item=saved.find(r=>r.key===key)
  if(!item||item.review.verdict!=='pass'||item.review.findings.length||item.snapshot.data.localChecks.errors.length||guideHash(item.snapshot.data.packet)!==current)throw new Error('Riesame finale non aggiornato alle fonti complete della guida.')
  if(item.snapshot.data.constructionRequirements){
   const contexts=item.snapshot.data.constructionRequirements
   assertNativeScenarioSchema({requirementAudit:item.review.requirementAudit},{type:'object',properties:{requirementAudit:guideRequirementAuditSchema(contexts,item.snapshot.data.packet.sources.map((s:any)=>s.id))},required:['requirementAudit'],additionalProperties:false})
   assertGuideRequirementResolutions(item.review.requirementAudit!,contexts,item.review.findings)
  }
 }
 assertGuideProofReviewEvidence(keys.map(key=>saved.find(r=>r.key===key)!),options,expectedDraft,requirePartition)
}
export function guideSegmentReviewHistory(options:GuideConstructionRuntime,caseIds:Set<string>,textIds:Set<string>,kind:'scenarios'|'guide-text',historicalKey?:string):GuideSegmentReviewHistory{
 if(historicalKey){
  const snapshot=options.archive.value<Snapshot>(role,historicalKey)
  if(!snapshot)throw new Error('Storico critiche: snapshot del riesame originale assente.')
  return history(atoms(snapshot.historyKeys,options),caseIds,textIds,kind)
 }
 const keys:string[]=[]
 for(const row of options.archive.values<any>('guide-segment-repair-start-v1')){
  const epoch=row.value
  if(guideHash(epoch.scope)!==guideHash(options.scope)||epoch.packetHash!==guideHash(options.packet))continue
  if(guideHash(epoch)!==row.key)throw new Error('Storico critiche: epoca alterata.')
  for(const saved of epoch.reviews as Review[])if(saved.review.findings.some(f=>relevant(f,caseIds,textIds,kind)))keys.push(guideHash([saved.unitId,saved.review]))
 }
 return history(atoms([...new Set(keys)],options),caseIds,textIds,kind)
}
function relevant(f:GuideSegmentFinding,cases:Set<string>,texts:Set<string>,kind:'scenarios'|'guide-text'){
 return f.repair.kind==='text'?texts.has(f.repair.targetId):cases.has(f.repair.caseId)
}
function history(reviews:Atom[],cases:Set<string>,texts:Set<string>,kind:'scenarios'|'guide-text'):GuideSegmentReviewHistory{
 const findings=new Map<string,GuideSegmentReviewHistory['findings'][number]>()
 for(const review of reviews)for(const finding of review.review.findings)if(relevant(finding,cases,texts,kind)){
  const hash=guideHash(finding),previous=findings.get(hash)
  if(previous)previous.reviewKeys.push(review.key);else findings.set(hash,{hash,finding,reviewKeys:[review.key]})
 }
 return {reviews,findings:[...findings.values()]}
}
export function guideSegmentReviewContextHash(options:GuideConstructionRuntime,stage:string,task:string,instructions:string,data:any,historicalKey?:string):string{
 if(historicalKey){const value=options.archive.value<Snapshot>(role,historicalKey);if(!value)throw new Error('Contesto critico originale assente.');const {reviewContextHash,...plain}=value.data;if(inputHash(value.request,{...plain,reviewHistory:data.reviewHistory})!==reviewContextHash)throw new Error('Contesto critico originale alterato.');return reviewContextHash}
 return inputHash({scope:options.scope,stage,task,instructionsHash:guideHash(instructions)},data)
}
export function saveGuideSegmentReviewContext(options:GuideConstructionRuntime,unitId:string,review:GuideSegmentReview,request:Pick<GuideSegmentRequest<any>,'stage'|'task'|'instructions'|'data'>):void{
 const data=request.data as any
 const {reviewHistory,...snapshot}=data
 const value:Snapshot={data:snapshot,historyKeys:(reviewHistory as GuideSegmentReviewHistory).reviews.map(r=>r.key),auditFindings:(reviewHistory as GuideSegmentReviewHistory).findings.map(f=>({hash:f.hash,reviewKeys:f.reviewKeys})),request:{scope:options.scope,stage:request.stage,task:request.task,instructionsHash:guideHash(request.instructions)}}
 options.archive.saveValue(role,guideHash([unitId,review]),value)
}
export function assertGuideFindingResolutions(audit:GuideFindingResolution[],previous:GuideSegmentReviewHistory,findings:GuideSegmentFinding[]):void{
 if(audit.length!==previous.findings.length||new Set(audit.map(a=>a.findingHash)).size!==previous.findings.length||previous.findings.some(f=>!audit.some(a=>a.findingHash===f.hash)))throw new Error('Critica: rendere conto di ogni rilievo precedente, senza omissioni o duplicati.')
 for(const item of audit){
  if(item.disposition==='still-open'){
   if(item.currentFindingIndex===null||!findings[item.currentFindingIndex])throw new Error('Critica: un rilievo ancora aperto richiede il finding attuale con correzione e prove.')
   const old=previous.findings.find(f=>f.hash===item.findingHash)!.finding.repair,current=findings[item.currentFindingIndex].repair
   if(old.kind!=='text'&&(current.kind==='text'||current.caseId!==old.caseId))throw new Error('Critica: il rilievo aperto è stato spostato a un altro caso.')
  }else if(item.currentFindingIndex!==null)throw new Error('Critica: un rilievo risolto/superato non ha un finding ancora aperto.')
 }
}
