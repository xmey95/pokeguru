import {guideHash} from './matchup-guide-packet'
import {projectGuideCaseProofs,guideProofDirectory,guideProofPairs} from './guide-proof-partition'
import type {GuideContent} from '../shared/matchup-guide'
import type {GuideSegmentReviewHistory} from './guide-segment-review-history'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {prepareGuideSegmentBatch,guideSegmentAcceptedUnit} from './guide-segment-batch'
import {guideSegmentCapacity} from './guide-segment-scheduler'
import {guideBudgetStop} from './guide-request-budget'

export interface GuideReviewProofScope {
 version:1;caseId:string;baseViewId:string;baseViewHash:string;completeDraftHash:string;
 branchIds:string[];allBranchIds:string[];branchHeads:{id:string;head:string}[];
 requirementIds:string[];allRequirementIds:string[];historyFindingHashes:string[];allHistoryFindingHashes:string[]
}
export interface GuideReviewProofUnit {id:string;scope:GuideReviewProofScope;view:GuideContent;request:GuideSegmentRequest<any>}
export interface GuideReviewProofManifest {
 version:1;scope:GuideConstructionRuntime['scope'];packetHash:string;completeDraftHash:string;caseId:string;baseViewId:string;
 branchHeads:{id:string;head:string}[];requirements:{id:string;branchIds:string[]}[];
 historicalFindings:{hash:string;branchIds:string[];global:boolean}[];
 units:{id:string;proofHash:string;reviewContextHash:string;branchIds:string[];requirementIds:string[];historyFindingHashes:string[]}[]
}
export const guideProofHistoryRules=' STORICO PARTIZIONATO: reviewHistory è una vista esplicita per i finding assegnati e le prove di questa unità, non una riscrittura degli originali. originalReviewHash e originalContextHash vincolano gli originali integrali conservati e verificati dall’app. I contesti storici mostrano le linee di questa unità e quelle delle controlinee originali; non usarne le risorse come attuali. resolutionAudit riguarda esattamente i finding assegnati nel contesto della porzione esaminata. Per un difetto globale, controlla le condizioni applicabili alle linee presenti e il directory completo: le altre porzioni hanno audit obbligatori separati. Non dichiarare un obiettivo positivo dimostrato dal solo directory: i suoi testimoni completi hanno un audit obbligatorio dedicato. Se manca una prova necessaria, emetti un finding azionabile invece di un pass. Nessuna porzione approva da sola una guida.'

/** Render an explicitly scoped history packet. Full source atoms are verified
 * before this projection and remain immutable in the archive. */
export function projectGuideProofHistory(history:GuideSegmentReviewHistory,spec:Pick<GuideReviewProofScope,'caseId'|'branchIds'|'historyFindingHashes'>):any{
 const wanted=new Set(spec.historyFindingHashes),findings=history.findings.filter(f=>wanted.has(f.hash))
 if(findings.length!==wanted.size)throw new Error('Storico partizionato: finding originale assente.')
 const sourceKeys=new Set(findings.flatMap(f=>f.reviewKeys)),lineIds=new Set(['main',...spec.branchIds,...findings.flatMap(f=>f.finding.counterlines.map(c=>c.lineId))])
 const reviews=history.reviews.filter(r=>sourceKeys.has(r.key)).map(r=>{
  const source=r.snapshot.data,draft=projectGuideCaseProofs(source.draft,spec.caseId,[...lineIds])
  const data={...source,draft,contexts:source.contexts.filter((c:any)=>c.scenarioId===spec.caseId&&lineIds.has(c.lineId)),
   proofProjection:{originalDraftHash:r.review.draftHash,originalConstructionHash:r.review.constructionHash,caseId:spec.caseId,lineIds:[...lineIds],branchDirectory:source.draft.scenarios.some((s:any)=>s.id===spec.caseId)?guideProofDirectory(source.draft,spec.caseId):[]}}
  if(Array.isArray(source.tacticalFrontier))data.tacticalFrontier=source.tacticalFrontier.filter((c:any)=>c.scenarioId===spec.caseId).map((c:any)=>({...c,groups:c.groups.filter((g:any)=>lineIds.has(g.lineId))}))
  if(Array.isArray(source.reviewFacts))data.reviewFacts=source.reviewFacts.filter((c:any)=>c.scenarioId===spec.caseId).map((c:any)=>({...c,...c.tacticalIndex?{tacticalIndex:c.tacticalIndex.filter((t:any)=>t.lineIds.some((id:string)=>lineIds.has(id)))}:{}}))
  if(Array.isArray(source.opportunities))data.opportunities=source.opportunities.filter((c:any)=>c.scenarioId===spec.caseId)
  return {key:r.key,unitId:r.unitId,originalReviewHash:guideHash(r.review),originalContextHash:r.review.reviewContextHash,
   reviewHeader:{verdict:r.review.verdict,checks:r.review.checks,draftHash:r.review.draftHash,constructionHash:r.review.constructionHash},snapshot:{request:r.snapshot.request,data}}
 })
 return {projection:'finding-proof-scope-1',reviews,findings:structuredClone(findings)}
}

export function assertGuideReviewProofManifest(m:GuideReviewProofManifest){
 const ids=m.branchHeads.map(b=>b.id),unique=(v:string[])=>new Set(v).size===v.length
 if(!ids.length||!unique(ids)||!unique(m.units.map(u=>u.id))||!unique(m.requirements.map(r=>r.id))||!unique(m.historicalFindings.map(f=>f.hash)))throw new Error('Critiche partizionate: identità duplicate o mancanti.')
 for(const unit of m.units)if(!unique(unit.branchIds)||unit.branchIds.some(id=>!ids.includes(id))||unit.requirementIds.some(id=>!m.requirements.some(r=>r.id===id))||unit.historyFindingHashes.some(hash=>!m.historicalFindings.some(f=>f.hash===hash)))throw new Error('Critiche partizionate: scope estraneo.')
 for(const pair of guideProofPairs(ids))if(!m.units.some(u=>pair.every(id=>u.branchIds.includes(id))))throw new Error('Critiche partizionate: confronto o ramo omesso.')
 for(const r of m.requirements){const units=m.units.filter(u=>u.requirementIds.includes(r.id));if(units.length!==1||!r.branchIds.every(id=>units[0].branchIds.includes(id)))throw new Error('Critiche partizionate: obbligo senza tutti i testimoni o audit duplicato.')}
 for(const f of m.historicalFindings){const sets=f.global?guideProofPairs(ids):[f.branchIds.filter(id=>id!=='main')];for(const set of sets)if(!m.units.some(u=>u.historyFindingHashes.includes(f.hash)&&set.every(id=>u.branchIds.includes(id))))throw new Error('Critiche partizionate: audit storico incompleto.')}
}

/** Plan complete comparisons, splitting audit output as well as input. The
 * indivisible pair/requirement still fails closed if it cannot fit. */
export function planGuideReviewProofs(input:{caseId:string;baseViewId:string;base:GuideContent;completeDraft:GuideContent;branchHeads:{id:string;head:string}[];requirements:{id:string;branchIds:string[]}[];history:GuideSegmentReviewHistory;make:(view:GuideContent,scope:GuideReviewProofScope,id:string)=>GuideSegmentRequest<any>},options:GuideConstructionRuntime,stage:string){
 const ids=input.branchHeads.map(b=>b.id),history=input.history.findings.map(f=>({hash:f.hash,global:f.finding.repair.kind!=='turn',branchIds:f.finding.repair.kind==='turn'?[f.finding.repair.lineId]:ids}))
 const memo=new Map<string,GuideReviewProofUnit>(),budgets=new Map<string,ReturnType<GuideConstructionRuntime['estimate']>>()
 const make=(branches:string[],requirements:string[],audit:string[]):GuideReviewProofUnit=>{
  const branchIds=ids.filter(id=>branches.includes(id)),requirementIds=input.requirements.map(r=>r.id).filter(id=>requirements.includes(id)),historyFindingHashes=history.map(f=>f.hash).filter(hash=>audit.includes(hash))
  const scope:GuideReviewProofScope={version:1,caseId:input.caseId,baseViewId:input.baseViewId,baseViewHash:guideHash(input.base),completeDraftHash:guideHash(input.completeDraft),branchIds,allBranchIds:ids,branchHeads:input.branchHeads,requirementIds,allRequirementIds:input.requirements.map(r=>r.id),historyFindingHashes,allHistoryFindingHashes:history.map(f=>f.hash)}
  const key=guideHash(scope),saved=memo.get(key);if(saved)return saved
  const id=input.baseViewId+'-proof-'+key.slice(0,16),view=projectGuideCaseProofs(input.base,input.caseId,branchIds),unit={id,scope,view,request:input.make(view,scope,id)}
  memo.set(key,unit);return unit
 }
 const fits=(unit:GuideReviewProofUnit,target=false)=>{let budget=budgets.get(unit.id);if(!budget){budget=options.estimate(prepareGuideSegmentBatch([unit.request],{stage,reserveCalls:unit.request.reserveCalls}).request);budgets.set(unit.id,budget)}return guideSegmentCapacity(budget,target)}
 const units:GuideReviewProofUnit[]=[],cachedIds=new Set<string>()
 // Rebuild the exact request before reusing a paid unit. A later calibration
 // can change the plan, but cannot make an immutable accepted result unpaid.
 for(const row of options.archive.values<GuideReviewProofManifest>('guide-proof-review-manifest-v1')){
  const m=row.value
  if(m.baseViewId!==input.baseViewId||m.caseId!==input.caseId||m.completeDraftHash!==guideHash(input.completeDraft)||m.packetHash!==guideHash(options.evidencePacket??options.packet)||guideHash(m.scope)!==guideHash(options.scope)||guideHash(m.branchHeads)!==guideHash(input.branchHeads)||guideHash(m.requirements)!==guideHash(input.requirements)||guideHash(m.historicalFindings)!==guideHash(history))continue
  if(row.key!==guideHash(m))throw new Error('Manifest delle critiche persistito alterato.')
  assertGuideReviewProofManifest(m)
  for(const old of m.units){
   const unit=make(old.branchIds,old.requirementIds,old.historyFindingHashes)
   if(unit.id!==old.id||guideHash(unit.scope)!==old.proofHash||(unit.request.data as any).reviewContextHash!==old.reviewContextHash||cachedIds.has(unit.id)||old.requirementIds.some(id=>units.some(u=>u.scope.requirementIds.includes(id))))continue
   if(guideSegmentAcceptedUnit(options.archive,unit.request)===undefined)continue
   units.push(unit);cachedIds.add(unit.id)
  }
 }
 const add=(branches:string[],reqs:string[],audit:string[])=>{
  const unit=make(branches,reqs,audit)
  if(fits(unit)){units.push(unit);return}
  if(audit.length>1){const half=Math.ceil(audit.length/2);add(branches,reqs,audit.slice(0,half));add(branches,[],audit.slice(half));return}
  if(reqs.length>1){const half=Math.ceil(reqs.length/2);add(branches,reqs.slice(0,half),audit);add(branches,reqs.slice(half),[]);return}
  // Keep the existing explicit oversized-unit failure and its hard checks.
  scaleFailure(unit)
 }
 const scaleFailure=(unit:GuideReviewProofUnit)=>{const p=options.estimate(prepareGuideSegmentBatch([unit.request],{stage,reserveCalls:unit.request.reserveCalls}).request);throw guideBudgetStop(stage,options.remainingCalls(),unit.request.reserveCalls+1,p)}
 for(const pair of guideProofPairs(ids)){
  const audit=history.filter(f=>f.global||f.branchIds.some(id=>id==='main'||pair.includes(id))).map(f=>f.hash).filter(hash=>!units.some(u=>pair.every(id=>u.scope.branchIds.includes(id))&&u.scope.historyFindingHashes.includes(hash)))
  if(!audit.length&&units.some(u=>pair.every(id=>u.scope.branchIds.includes(id))))continue
  let merged=false
  for(let i=0;i<units.length;i++){
   if(cachedIds.has(units[i].id))continue
   const prior=units[i],candidate=make([...new Set([...prior.scope.branchIds,...pair])],prior.scope.requirementIds,[...new Set([...prior.scope.historyFindingHashes,...audit])])
   if(fits(candidate,true)){units[i]=candidate;merged=true;break}
  }
  if(!merged)add(pair,[],audit)
 }
 for(const requirement of input.requirements){
  if(units.some(u=>u.scope.requirementIds.includes(requirement.id)))continue
  let attached=false
  for(let i=0;i<units.length;i++)if(!cachedIds.has(units[i].id)&&requirement.branchIds.every(id=>units[i].scope.branchIds.includes(id))){const old=units[i],next=make(old.scope.branchIds,[...old.scope.requirementIds,requirement.id],old.scope.historyFindingHashes);if(fits(next)){units[i]=next;attached=true;break}}
  if(!attached)add(requirement.branchIds,[requirement.id],[])
 }
 const manifest:GuideReviewProofManifest={version:1,scope:options.scope,packetHash:guideHash(options.evidencePacket??options.packet),completeDraftHash:guideHash(input.completeDraft),caseId:input.caseId,baseViewId:input.baseViewId,branchHeads:input.branchHeads,requirements:input.requirements,historicalFindings:history,units:units.map(u=>({id:u.id,proofHash:guideHash(u.scope),reviewContextHash:(u.request.data as any).reviewContextHash,branchIds:u.scope.branchIds,requirementIds:u.scope.requirementIds,historyFindingHashes:u.scope.historyFindingHashes}))}
 assertGuideReviewProofManifest(manifest)
 return {units,manifest,manifestHash:guideHash(manifest)}
}
