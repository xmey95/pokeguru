import {guideHash} from './matchup-guide-packet'
import type {FiniteUnitRef} from './guide-finite-unit'
import {reviewAuditLanguage,readAuditLanguageReview,auditLanguageInput,auditLanguageCapacity,type AuditLanguageTarget} from './guide-audit-language-review'
import {isGuideDelivery} from '../shared/guide-delivery'
import {guideGameRuleSources,isGuideGameRuleSource} from './guide-game-rule-sources'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {guidePrizeRuleSources} from './guide-prize-rule-sources'
import {AiFailure} from './ai-failure'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuideSegmentRequest} from './guide-segment-generation'
import type {AuditQuantityContext} from './guide-audit-quantities'
import {runAuditDeclaration,readPartitionedAuditDeclaration,type AuditTransportRef} from './guide-audit-partition'

export interface AuditDeclarationRef extends AuditTransportRef {inputVersion:2|3|4;declarationOnly?:boolean}
export function auditAnchor(native:any,path:(string|number)[]){
 let body:any=path.reduce((v,k)=>v[k],native);body=structuredClone(body);delete body.tactical
 for(const e of [...body.events??[],...body.beforeAttack??[],...body.afterAttack??[],...body.attack?[body.attack]:[]])delete e.decisionProof
 return guideHash(body)
}
export function readAuditDeclaration(ref:AuditDeclarationRef,o:GuideConstructionRuntime,read:(data:any,raw:any)=>any){
 if(ref.partitioned){if(ref.inputVersion!==4||ref.declarationOnly)throw Error('Audit semantico: versione partizionata incoerente.');const source=readPartitionedAuditDeclaration(ref,o);assertNativeScenarioSchema(source.raw,o.archive.value<any>('guide-finite-request-v1',ref.unitId).request.schema);return {...source,patch:read(source.data,source.raw)}}
 const source=o.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey),descriptor=o.archive.value<any>('guide-finite-request-v1',ref.unitId)
 if(!source||ref.outcomeKey!==guideHash(source)||source.unitId!==ref.unitId||descriptor?.scopeHash!==guideHash(o.scope)||descriptor?.request.validationId!=='guide-finite-audit-'+ref.inputVersion||!source.accepted&&!(ref.inputVersion===2&&ref.declarationOnly))throw Error('Audit semantico: dichiarazione originale mancante o estranea.')
 assertNativeScenarioSchema(source.raw,descriptor.request.schema)
 return {data:descriptor.request.data,raw:source.raw,patch:read(descriptor.request.data,source.raw)}
}
export async function resolveAuditLanguage(taskKey:string,initial:{raw:any;ref:AuditDeclarationRef}|undefined,request:(round:number,feedback:any)=>GuideSegmentRequest<any>,describe:(raw:any,data?:any)=>{context:AuditQuantityContext;targets:AuditLanguageTarget[];contextFacts:{id:string;label:string;value:number}[]},o:GuideConstructionRuntime,reserve:number){
 const role='guide-audit-language-negative-v1',known=[...o.archive.values<any>(role)].filter(r=>r.value.taskKey===taskKey)
 for(const r of known){
  if(r.key!==guideHash(r.value)||r.value.version!==1||!Number.isSafeInteger(r.value.round)||r.value.round<0||!guideSemanticRetryAllowed(o.archive,r.value.round))throw Error('Audit semantico: rifiuto alterato.')
  const expected=request(0,null).data as any
  const source=readAuditDeclaration(r.value.source,o,(data,raw)=>{
    for(const key of ['packet','native','mode','deliveryLineId','sourceHash','candidatesHash','quantityContextHash','turnKey','decisions','promotions','locationPath','auditCards','auditAttacks'])if(guideHash(data[key])!==guideHash(expected[key]))throw Error('Audit semantico: dichiarazione originale di un altro contesto.')
    return describe(raw,data)
  }),d=source.patch,review=readAuditLanguageReview(r.value.review,o)
  if(review.value.verdict!=='revise'||guideHash(review.data.context)!==guideHash(d.context)||guideHash(review.data.targets)!==guideHash(auditLanguageInput(d.targets,d.context))||guideHash(review.data.contextFacts)!==guideHash(d.contextFacts))throw Error('Audit semantico: rifiuto senza critica originale del testo e del registro correnti.')
 }
 if(new Set(known.map(r=>r.value.round)).size!==known.length)throw Error('Audit semantico: rifiuti ambigui.')
 if(!guideSemanticRetryAllowed(o.archive,known.length))throw new AiFailure('draft-limit','Audit ancora incoerente dopo due riesami semantici; nessun nuovo tentativo automatico.')
 const capacityRole='guide-audit-language-capacity-rejection-v1',capacityKnown=[...o.archive.values<any>(capacityRole)].filter(r=>r.value.taskKey===taskKey)
 for(const r of capacityKnown)if(r.key!==guideHash(r.value)||r.value.version!==1||r.value.scopeHash!==guideHash(o.scope)||!Number.isSafeInteger(r.value.round)||r.value.round<0||!Number.isSafeInteger(r.value.ordinal)||r.value.ordinal<0||!Array.isArray(r.value.gameRuleSources)||r.value.gameRuleSources.some((s:any)=>!isGuideGameRuleSource(s,o.packet.basis.asOf)))throw Error('Audit semantico: rifiuto di capienza alterato.')
 if(new Set(capacityKnown.map(r=>r.value.round+'/'+r.value.ordinal)).size!==capacityKnown.length)throw Error('Audit semantico: rifiuti di capienza ambigui.')
 let previous:any=null
 for(let round=0;guideSemanticRetryAllowed(o.archive,round);round++){
  const declare=(feedback:any)=>runAuditDeclaration(()=>request(round,feedback),o).then(r=>{const id=o.archive.value<any>('guide-finite-request-v1',r.ref.unitId)?.request.validationId;if(!/^guide-finite-audit-[34]$/.test(id))throw Error('Audit semantico: protocollo della dichiarazione sconosciuto.');return {raw:r.value,ref:{...r.ref,inputVersion:Number(id.at(-1)) as 3|4}}})
  let source=round===0&&initial?initial:await declare(previous),data=o.archive.value<any>('guide-finite-request-v1',source.ref.unitId)?.request.data,d=describe(source.raw,data),ordinal=0,capacityFeedback:any=previous
  for(;;){
   const violations=isGuideDelivery(o.packet.basis)?auditLanguageCapacity(d.targets,d.context):[]
   if(!violations.length)break
   const prior=capacityKnown.find(r=>r.value.round===round&&r.value.ordinal===ordinal)
   const record={version:1,scopeHash:guideHash(o.scope),taskKey,round,ordinal,source:source.ref,targetsHash:guideHash(auditLanguageInput(d.targets,d.context)),violations,gameRuleSources:prior?.value.gameRuleSources??guideGameRuleSources(o.packet.basis.asOf)}
   if(prior&&guideHash(record)!==prior.key)throw Error('Audit semantico: capienza diversa dalla dichiarazione originale.')
   o.archive.saveValue(capacityRole,guideHash(record),record)
   if(!guideSemanticRetryAllowed(o.archive,++ordinal))throw new AiFailure('draft-limit','Audit ancora oltre capienza dopo due dichiarazioni: originali conservati, nessun limite rinnovato.')
   capacityFeedback={...previous,gameRuleSources:record.gameRuleSources,hostCapacity:{recordHash:guideHash(record),source:source.ref,raw:source.raw,violations,previous:capacityFeedback?.hostCapacity??null,meaning:'Rifiuto dimensionale del codice, NON giudizio AI né pass. Riscrivi soltanto gli audit entro gli stessi limiti, conservando candidati, fatti, fonti e condizioni. Nessun testo o numero verrà tagliato automaticamente. Tutti i testi corretti richiedono la critica indipendente completa.'}}
   source=await declare(capacityFeedback);data=o.archive.value<any>('guide-finite-request-v1',source.ref.unitId)?.request.data;d=describe(source.raw,data)
  }
  if(capacityKnown.filter(r=>r.value.round===round).length>ordinal)throw Error('Audit semantico: storia di capienza non ricostruita.')
  const review=await reviewAuditLanguage(d.targets,d.context,d.contextFacts,o,reserve)
  if(review.value.verdict==='pass')return {raw:source.raw,ref:source.ref,review:review.ref}
  const record={version:1,taskKey,round,source:source.ref,review:review.ref}
  const prior=known.find(r=>r.value.round===round);if(prior&&guideHash(prior.value)!==guideHash(record))throw Error('Audit semantico: rifiuto diverso dalla fonte pagata.')
  o.archive.saveValue(role,guideHash(record),record);previous={source:source.ref,review:review.ref,value:review.value,...review.ref.negativeOnlyAs===3?{negativeOnly:true,unverifiedPriorResponses:review.rejectedDiagnostics,warning:'Giudizio negativo storico autenticato, non prova positiva delle annotazioni o delle quote abbreviate. Tutte le risposte respinte restano feedback non verificato, compresa la più recente. Conserva il registro e correggi i problemi reali; non trasformare conferme di inventario in errori.'}:{}}
  // Keep historical repair inputs byte-for-byte, including property order.
  // Only newly interpreted/current negatives acquire the new evidence annex.
  if(review.ref.partitioned||review.ref.revalidatedAs===4||o.archive.value<any>('guide-finite-request-v1',review.ref.unitId)?.request.validationId==='guide-finite-audit-language-4')Object.assign(previous,{gameRuleSources:readAuditLanguageReview(review.ref,o).data.gameRuleSources??guidePrizeRuleSources(o.packet.basis.asOf),...review.rejectedDiagnostics?.length?{unverifiedPriorResponses:review.rejectedDiagnostics}:{}})
 }
 throw new AiFailure('draft-limit','Audit ancora incoerente dopo due riesami semantici; originali e rifiuti conservati.')
}
export function assertAuditLanguagePass(ref:FiniteUnitRef,targets:AuditLanguageTarget[],context:AuditQuantityContext,o:Pick<GuideConstructionRuntime,'archive'>){
 const review=readAuditLanguageReview(ref,o)
 const expected=targets.map((t,i)=>({...t,key:'t'+i}))
 if(review.value.verdict!=='pass'||guideHash(review.data.context)!==guideHash(context)||review.data.targets.length!==expected.length||expected.some((t,i)=>{const {spans:_s,contextHash:_h,...old}=review.data.targets[i];return guideHash(old)!==guideHash(t)}))throw Error('Audit semantico: pass estraneo al testo o alle finestre correnti.')
 return review
}
import {guideSemanticRetryAllowed} from './guide-run-policy'
