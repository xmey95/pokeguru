import {guideHash} from './matchup-guide-packet'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {prepareGuideSegmentBatch,guideSegmentAcceptedUnit,guideSegmentUnitIdentity} from './guide-segment-batch'
import {runFiniteUnit,type FiniteUnitRef} from './guide-finite-unit'
import {readAcceptedGuideTransport} from './guide-transport-evidence'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {boundedAuditTextSchema,boundedAuditOutputUnits,readBoundedAuditText} from './guide-bounded-audit-text'
import {auditDecisionWindows,auditPromotionWindows} from './guide-audit-quantities'
import {GUIDE_BUDGET_POLICY,guideBudgetStop} from './guide-request-budget'
import {preflightGuideDelivery} from './guide-delivery-policy'
import {isGuideDelivery} from '../shared/guide-delivery'
import {prepareFiniteRequest} from './guide-finite-runtime'
import type {GuideConstructionRuntime} from './guide-reply-phase'

export interface AuditTransportRef extends FiniteUnitRef {partitioned?:true}
type Target={kind:'decision'|'comparison'|'promotion';key:string}
const planRole='guide-audit-partition-plan-v1',resultRole='guide-audit-partition-result-v1'
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(v:any)=>({type:typeof v,const:v})
function targets(parent:GuideSegmentRequest<any>):Target[]{const d=parent.data as any;return [...d.decisions.map((v:any):Target=>({kind:'decision',key:v.key})),...((parent.schema as any).properties.tactical.type!=='null'?[{kind:'comparison' as const,key:'comparison'},...d.promotions.map((v:any):Target=>({kind:'promotion',key:v.key}))]:[])]}
function validateLayout(groups:Target[][],all:Target[]){if(!Array.isArray(groups)||!groups.length||groups.some(g=>!Array.isArray(g)||!g.length)||guideHash(groups.flat())!==guideHash(all))throw Error('Partizione audit: destinazioni incomplete,duplicate o riordinate.')}
function partRequest(parent:GuideSegmentRequest<any>,groups:Target[][],index:number,o:GuideConstructionRuntime){
 const parentId=guideSegmentUnitIdentity(parent).unitId,d=parent.data as any,group=groups[index],layoutHash=guideHash(groups),narrative=boundedAuditTextSchema(d.quantityContext)
 const schema=object({parentUnitId:literal(parentId),layoutHash:literal(layoutHash),index:literal(index),values:object(Object.fromEntries(group.map((_,i)=>['t'+i,narrative])))})
 const read=(raw:any)=>{assertNativeScenarioSchema(raw,schema);for(const [i,t]of group.entries()){const windows=t.kind==='decision'?auditDecisionWindows(d.quantityContext,d.decisions.find((v:any)=>v.key===t.key).path):t.kind==='promotion'?auditPromotionWindows(d.quantityContext,d.native,d.promotions.find((v:any)=>v.key===t.key).side):undefined;readBoundedAuditText(raw.values['t'+i],d.quantityContext,windows)}return structuredClone(raw)}
 return withGuideSegmentRetry({stage:parent.stage+'-part-'+index,role:parent.role,instructions:parent.instructions,
  task:parent.task+'\nPARTIZIONE DI TRASPORTO: restituisci soltanto values.tN secondo auditPartition.targets. Tutti i dati, candidati, confronti, feedback e fonti del turno restano presenti. Non inventare giudizi per le altre destinazioni e non considerare i testi fratelli approvati: il riesame indipendente riguarderà l’audit completo ricomposto. Nessun testo viene riassunto o corretto dal codice.',
  data:{...d,parentInvalid:d.previousInvalid??null,auditPartition:{parentUnitId:parentId,layoutHash,index,targets:group}},schema,units:boundedAuditOutputUnits(d.quantityContext,group.length),reserveCalls:parent.reserveCalls+groups.length-index-1,
  outputCapacity:parent.outputCapacity,deliveryFollowupKeys:parent.deliveryFollowupKeys,read,cacheValidation:{id:'guide-finite-audit-part-1',validate:raw=>{read(raw)}}},o.scope,o.archive)
}
function assemble(parent:GuideSegmentRequest<any>,groups:Target[][],parts:any[]){
 if(parts.length!==groups.length)throw Error('Partizione audit: risposte mancanti.')
 const properties=(parent.schema as any).properties,d=parent.data as any,raw:any={caseId:properties.caseId.const,sourceHash:properties.sourceHash.const,candidatesHash:properties.candidatesHash.const,turnKey:properties.turnKey.const,quantityContextHash:properties.quantityContextHash.const,decisions:{},tactical:properties.tactical.type==='null'?null:{comparison:null,promotions:{}}}
 for(const [i,group]of groups.entries())for(const [j,t]of group.entries()){const value=structuredClone(parts[i].values['t'+j]);if(t.kind==='decision')raw.decisions[t.key]=value;else if(t.kind==='comparison')raw.tactical.comparison=value;else raw.tactical.promotions[t.key]=value}
 if(guideHash(Object.keys(raw.decisions))!==guideHash(d.decisions.map((v:any)=>v.key)))throw Error('Partizione audit: scelte ricomposte diverse dall’originale.')
 return raw
}
function savedParent(ref:AuditTransportRef,o:GuideConstructionRuntime){const descriptor=o.archive.value<any>('guide-finite-request-v1',ref.unitId);if(!descriptor||descriptor.scopeHash!==guideHash(o.scope)||descriptor.request.validationId!=='guide-finite-audit-4')throw Error('Partizione audit: padre estraneo.');const s=descriptor.request;const parent={...s,reserveCalls:0,units:2,cacheValidation:{id:s.validationId}} as GuideSegmentRequest<any>;if(guideSegmentUnitIdentity(parent).unitId!==ref.unitId)throw Error('Partizione audit: identità padre alterata.');return parent}
export function readPartitionedAuditDeclaration(ref:AuditTransportRef,o:GuideConstructionRuntime){
 const parent=savedParent(ref,o),record=o.archive.value<any>(resultRole,ref.outcomeKey),plan=o.archive.value<any>(planRole,ref.unitId)
 if(!record||ref.outcomeKey!==guideHash(record)||record.version!==1||record.parentUnitId!==ref.unitId||record.scopeHash!==guideHash(o.scope)||record.requiresCompleteRead!==true||record.requiresIndependentReview!==true||!plan||plan.scopeHash!==record.scopeHash||plan.parentUnitId!==ref.unitId||plan.version!==1||guideHash(plan.groups)!==record.layoutHash)throw Error('Partizione audit: ricevuta o piano alterato.')
 validateLayout(plan.groups,targets(parent));if(record.parts.length!==plan.groups.length)throw Error('Partizione audit: fonti parziali mancanti.')
 const parts=record.parts.map((ref:FiniteUnitRef,index:number)=>{const request=prepareFiniteRequest(partRequest(parent,plan.groups,index,o),o),row=o.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey);if(guideSegmentUnitIdentity(request).unitId!==ref.unitId||!row)throw Error('Partizione audit: fonte di un altro frammento.');return readAcceptedGuideTransport(request,{key:ref.outcomeKey,value:row},o.archive).value})
 const raw=assemble(parent,plan.groups,parts);if(guideHash(raw)!==record.rawHash)throw Error('Partizione audit: testi diversi dalle risposte originali.')
 return {data:parent.data,raw}
}
/** Partials are transport declarations, never semantic passes. A receipt
 * references all original child outputs; the original full reader still runs. */
export async function runAuditDeclaration(make:()=>GuideSegmentRequest<any>,o:GuideConstructionRuntime):Promise<{value:any;ref:AuditTransportRef}>{
 const parent=o.prepareRequest!(make()),id=guideSegmentUnitIdentity(parent).unitId
 if(parent.cacheValidation.id!=='guide-finite-audit-4'||guideSegmentAcceptedUnit(o.archive,parent)!==undefined)return runFiniteUnit('audit','segments-finite-audits',make,o)
 const existing=[...o.archive.values<any>(resultRole)].filter(r=>r.value.parentUnitId===id)
 if(existing.length>1)throw Error('Partizione audit: ricevute ambigue.')
 if(existing.length){const ref={unitId:id,outcomeKey:existing[0].key,partitioned:true as const},read=readPartitionedAuditDeclaration(ref,o);return {value:parent.read(read.raw),ref}}
 const fits=(request:GuideSegmentRequest<any>)=>{const p=o.estimate(prepareGuideSegmentBatch([request],{stage:'segments-finite-audits',reserveCalls:request.reserveCalls}).request);return p.fits&&p.estimatedResponseCharacters<=GUIDE_BUDGET_POLICY.responseCharacters&&(o.outputFits?.('segments-finite-audits',request.units??1)??true)}
 let plan=o.archive.value<any>(planRole,id)
 if(!plan&&fits(parent))return runFiniteUnit('audit','segments-finite-audits',make,o)
 const all=targets(parent)
 if(!plan){let groups=[all]
  for(let i=0;i<groups.length;){const request=o.prepareRequest!(partRequest(parent,groups,i,o));if(fits(request)){i++;continue}if(groups[i].length===1){const p=o.estimate(prepareGuideSegmentBatch([request],{stage:'segments-finite-audits',reserveCalls:request.reserveCalls}).request);throw guideBudgetStop(p.stage,o.remainingCalls(),parent.reserveCalls+groups.length,p)}const g=groups[i],mid=Math.ceil(g.length/2);groups.splice(i,1,g.slice(0,mid),g.slice(mid))}
  plan={version:1,parentUnitId:id,scopeHash:guideHash(o.scope),groups};o.archive.saveValue(planRole,id,plan)
 }
 if(plan.version!==1||plan.parentUnitId!==id||plan.scopeHash!==guideHash(o.scope))throw Error('Partizione audit: piano estraneo.');validateLayout(plan.groups,all)
 const requests=plan.groups.map((_:Target[],i:number)=>o.prepareRequest!(partRequest(parent,plan.groups,i,o))),pending=requests.filter((r:GuideSegmentRequest<any>)=>guideSegmentAcceptedUnit(o.archive,r)===undefined)
 for(const r of requests)if(!fits(r))throw guideBudgetStop('segments-finite-audits',o.remainingCalls(),parent.reserveCalls+pending.length,o.estimate(prepareGuideSegmentBatch([r],{stage:'segments-finite-audits',reserveCalls:r.reserveCalls}).request))
 if(o.remainingCalls()<parent.reserveCalls+pending.length)throw guideBudgetStop('segments-finite-audits',o.remainingCalls(),parent.reserveCalls+pending.length)
 if(isGuideDelivery(o.packet.basis)&&pending.length){const groups=pending.map((r:GuideSegmentRequest<any>)=>prepareGuideSegmentBatch([r],{stage:'segments-finite-audits',reserveCalls:r.reserveCalls}).request);if(o.preflight)o.preflight(groups);else preflightGuideDelivery(o.archive,'segments-finite-audits',groups)}
 const parts=[],refs=[]
 for(let i=0;i<requests.length;i++){const result=await runFiniteUnit('audit-part-'+i,'segments-finite-audits',()=>partRequest(parent,plan.groups,i,o),o);parts.push(result.value);refs.push(result.ref)}
 const raw=assemble(parent,plan.groups,parts),value=parent.read(raw),record={version:1,parentUnitId:id,scopeHash:guideHash(o.scope),layoutHash:guideHash(plan.groups),parts:refs,rawHash:guideHash(raw),requiresCompleteRead:true,requiresIndependentReview:true},key=guideHash(record);o.archive.saveValue(resultRole,key,record)
 return {value,ref:{unitId:id,outcomeKey:key,partitioned:true}}
}
