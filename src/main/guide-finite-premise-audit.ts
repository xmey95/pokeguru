import {guideHash} from './matchup-guide-packet'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuidePremiseReview} from './guide-premise-review'
import {readGuidePremiseReview} from './guide-premise-review'
import {guideSegmentDeclarations,createGuideSegments,appendGuideSegment,forkGuideSegments,type GuideSegmentJournal} from './guide-segments'
import {guideAuditLocations,guideAuditAt,guideWithoutNativeAudits} from '../shared/guide-audit-candidates'
import {withGuideSegmentRetry} from './guide-segment-generation'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {runFiniteUnit} from './guide-finite-unit'
import {readAcceptedGuideTransport} from './guide-transport-evidence'
import {prepareFiniteRequest,assertFiniteTransportHistory} from './guide-finite-runtime'
import {repairGuideNativeAudits,quantifiedAuditPatch} from './guide-audit-repair'
import {assertAuditLanguagePass} from './guide-audit-language-driver'
import {saveGuideSegmentCheckpoint,loadGuideSegmentCheckpoint} from './guide-segment-checkpoints'
import {AiFailure} from './ai-failure'
import {finitePremiseTextTargets,finitePremiseTextRequest,withoutFinitePremiseTexts} from './guide-finite-premise-text'
import {certifyFiniteAuditCounts,assertFiniteAuditCounts} from './guide-audit-count-gate'
type Context=Pick<GuideConstructionRuntime,'scope'|'packet'|'archive'>
interface Route {reviewHash:string;prefixHash:string;mode:'audit'|'original'|'text';mapping:{findingIndex:number;targets:string[]}[];reason:string}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
function legacyRouteRequest(prefix:GuideSegmentJournal,review:GuidePremiseReview,o:Context,reserveCalls:number){
 readGuidePremiseReview(review,prefix,o.scope,o.packet)
 if(review.verdict==='pass'||!o.archive.value('guide-premise-review-v1',guideHash({prefix,review})))throw Error('Routing audit: rifiuto indipendente originale mancante.')
 const native=guideSegmentDeclarations(prefix,o.scope,o.packet),mode={kind:'prefix' as const,turns:1 as const},targets=guideAuditLocations(native,mode).flatMap(l=>[
  {id:JSON.stringify([...l.path,'tactical']),value:guideAuditAt(native,l.path).tactical},
  ...l.events.filter(p=>guideAuditAt(native,p).decisionProof!==null).map(p=>({id:JSON.stringify([...p,'decisionProof']),value:guideAuditAt(native,p).decisionProof}))
 ]),reviewHash=guideHash({prefix,review}),prefixHash=guideHash(prefix)
 const schema=object({reviewHash:{type:'string',const:reviewHash},prefixHash:{type:'string',const:prefixHash},mode:{type:'string',enum:['audit','original']},mapping:{type:'array',maxItems:review.findings.length,items:object({findingIndex:{type:'integer',minimum:0,maximum:review.findings.length-1},targets:{type:'array',minItems:1,maxItems:targets.length,items:{type:'string',enum:targets.map(t=>t.id)}}})},reason:{type:'string',minLength:1,maxLength:1600}})
 const read=(raw:any):Route=>{assertNativeScenarioSchema(raw,schema)
  if(!raw.reason.trim())throw Error('Routing audit: motivo vuoto.')
  if(raw.mode==='original'){if(raw.mapping.length)throw Error('Routing audit: mapping ammesso solo per la riparazione audit.')}
  else if(!targets.length||review.findings.some(f=>f.proposedActions.length||f.counterlines.length)||raw.mapping.length!==review.findings.length||new Set(raw.mapping.map((m:any)=>m.findingIndex)).size!==review.findings.length||raw.mapping.some((m:any)=>new Set(m.targets).size!==m.targets.length))throw Error('Routing audit: copertura dei rilievi incompleta o alternative fisiche da eseguire.')
  return structuredClone(raw)
 }
 return withGuideSegmentRetry({stage:'review-premise-audit-route-'+prefix.setup.id,role:'critic' as const,instructions:guideFiniteInstructions('review'),task:'Classifica il rifiuto indipendente senza annullarlo. mode=audit solo se TUTTI i rilievi possono essere corretti nei giudizi degli audit elencati mantenendo esattamente apertura, pescate, azioni, Energia, pagamenti, attacchi e sviluppo. Per ogni rilievo indica i soli target ammessi. Se occorre qualsiasi modifica fuori dagli audit scegli original, senza mapping. Non dedurre la classificazione dal nome della carta: confronta fonti e rilievi. Non dare un pass; ogni correzione richiederà una nuova critica indipendente.',data:{packet:o.packet,prefix,native,review,reviewHash,prefixHash,targets},schema,reserveCalls,read,cacheValidation:{id:'guide-finite-premise-route-1',validate:(v:Route)=>{read(v)}}},o.scope,o.archive)
}
function routeRequest(prefix:GuideSegmentJournal,review:GuidePremiseReview,o:Context,reserveCalls:number){
 const legacy=legacyRouteRequest(prefix,review,o,reserveCalls),data=legacy.data as any,textTargets=finitePremiseTextTargets(prefix,o),auditIds=data.targets.map((t:any)=>t.id),textIds=textTargets.map(t=>t.id)
 const schema=structuredClone(legacy.schema) as any
 schema.properties.mode.enum=['audit','text','original'];schema.properties.mapping.items.properties.targets={type:'array',minItems:1,maxItems:auditIds.length+textIds.length,items:{type:'string',enum:[...auditIds,...textIds]}}
 const read=(raw:any):Route=>{
  assertNativeScenarioSchema(raw,schema)
  if(!raw.reason.trim())throw Error('Routing della premessa: motivo vuoto.')
  if(raw.mode==='original'){if(raw.mapping.length)throw Error('Routing della premessa: mapping estraneo alla ricostruzione.');return structuredClone(raw)}
  const allowed=raw.mode==='text'?textIds:auditIds
  if(review.findings.some(f=>f.proposedActions.length||f.counterlines.length)||raw.mapping.length!==review.findings.length||new Set(raw.mapping.map((m:any)=>m.findingIndex)).size!==review.findings.length||raw.mapping.some((m:any)=>new Set(m.targets).size!==m.targets.length||m.targets.some((id:string)=>!allowed.includes(id))))throw Error('Routing della premessa: rilievi non coperti o campi protetti.')
  return structuredClone(raw)
 }
 return withGuideSegmentRetry({...legacy,unitKey:undefined,retryOrdinal:undefined,task:'Classifica TUTTI i rilievi indipendenti senza annullarli. mode=audit solo se bastano i giudizi in targets; mode=text solo se bastano le spiegazioni in textTargets. Per ciascun rilievo indica i soli target consentiti dalla modalità scelta, mantenendo apertura, pescate, azioni, Energia, pagamenti, attacchi, sviluppo e tutti gli altri campi. Non mescolare target audit e testo. Se occorrono entrambi, altri campi, modifiche fisiche o nuove alternative scegli original con mapping=[]. Non dedurre la classificazione dalla severità, da parole chiave o dal nome della carta: confronta tutte le fonti e i rilievi. Una nota obsoleta sulla fase non autorizza nuove mosse. Non dare un pass: ogni correzione richiede una nuova critica indipendente completa.',data:{...data,textTargets:textTargets.map(t=>({id:t.id,value:t.text})),phase:'completed-native-with-audits'},schema,read,cacheValidation:{id:'guide-finite-premise-route-2',validate:(v:Route)=>{read(v)}}},o.scope,o.archive)
}
export function readKnownFinitePremiseRoute(prefix:GuideSegmentJournal,review:GuidePremiseReview,o:Context):Route|undefined{
 const key=guideHash({scope:o.scope,packetHash:guideHash(o.packet),prefix,review}),row=o.archive.value<any>('guide-finite-premise-route-v1',key)
 if(!row)return undefined
 if(row.key!==key||row.prefixHash!==guideHash(prefix)||row.reviewHash!==guideHash({prefix,review}))throw Error('Routing audit: ricevuta estranea.')
 if(row.version!==undefined&&row.version!==2)throw Error('Routing della premessa: versione sconosciuta.')
 const request=prepareFiniteRequest((row.version===2?routeRequest:legacyRouteRequest)(prefix,review,o,0),o),source=o.archive.value<any>('guide-segment-unit-result-v1',row.ref.outcomeKey)
 if(!source)throw Error('Routing audit: originale AI mancante.')
 readAcceptedGuideTransport(request,{key:row.ref.outcomeKey,value:source},o.archive)
 if(guideHash(source.value)!==guideHash(row.route))throw Error('Routing audit: risultato diverso dall’originale.')
 return row.route
}
export async function routeFinitePremise(prefix:GuideSegmentJournal,review:GuidePremiseReview,o:GuideConstructionRuntime):Promise<Route>{
 assertFiniteTransportHistory(o.archive,o.scope)
 const negatives=[...o.archive.values<any>('guide-premise-review-v1')].filter(r=>r.value.prefix.setup.id===prefix.setup.id&&r.value.review.verdict!=='pass')
 if(!guideSemanticRetryAllowed(o.archive,negatives.length))throw new AiFailure('draft-limit','Premessa ancora respinta dopo due riesami indipendenti; nessuna nuova riparazione automatica.')
 const saved=readKnownFinitePremiseRoute(prefix,review,o);if(saved)return saved
 const source=await runFiniteUnit(prefix.setup.id,'review-premise-audit-routing',()=>routeRequest(prefix,review,o,o.reserveOutside+2),o)
 const key=guideHash({scope:o.scope,packetHash:guideHash(o.packet),prefix,review})
 o.archive.saveValue('guide-finite-premise-route-v1',key,{version:2,key,prefixHash:guideHash(prefix),reviewHash:guideHash({prefix,review}),route:source.value,ref:source.ref})
 return source.value
}
export async function repairFinitePremiseAudits(prefix:GuideSegmentJournal,review:GuidePremiseReview,route:Route,o:GuideConstructionRuntime){
 if(route.mode!=='audit'||guideHash(readKnownFinitePremiseRoute(prefix,review,o))!==guideHash(route))throw Error('Routing audit: classificazione autentica richiesta.')
 const mode={kind:'prefix' as const,turns:1 as const},native=guideSegmentDeclarations(prefix,o.scope,o.packet),feedback={reviewHash:guideHash({prefix,review}),findings:review.findings,targets:[...new Set(route.mapping.flatMap(m=>m.targets))]}
 const repaired=await repairGuideNativeAudits(native,mode,o,feedback),{turns,developmentPlan,...setup}=repaired
 if(guideHash(native)===guideHash(repaired))throw Error('Routing audit: rilievo riproposto senza modifiche.')
 if(guideHash(guideWithoutNativeAudits(native,mode))!==guideHash(guideWithoutNativeAudits(repaired,mode)))throw Error('Routing audit: registro modificato.')
 const root=createGuideSegments(setup,o.scope,o.packet),journal=appendGuideSegment(root,o.scope,o.packet,turns.ours,developmentPlan.ours)
 const receipts=[...o.archive.values<any>('guide-native-audit-repair-v1')].filter(r=>r.value.sourceHash===guideHash(native)&&r.value.repairedHash===guideHash(repaired)&&r.value.feedbackHash===guideHash(feedback))
 if(receipts.length!==1||receipts[0].key!==guideHash(receipts[0].value)||!receipts[0].value.refs.length)throw Error('Routing audit: correzione senza ricevuta dei giudizi AI.')
 const record={version:1,scopeHash:guideHash(o.scope),prefixHash:guideHash(journal),sourcePrefix:prefix,review,route,auditReceiptKey:receipts[0].key,immutableHash:guideHash(guideWithoutNativeAudits(native,mode))}
 const existing=loadGuideSegmentCheckpoint(o.archive,o.scope,o.packet,root.setup.id,root.rootHash)
 if(!existing)saveGuideSegmentCheckpoint(o.archive,o.scope,o.packet,root)
 if(existing?.segments.length){if(guideHash(forkGuideSegments(existing,o.scope,o.packet,1))!==guideHash(journal))throw Error('Routing audit: checkpoint diverso; invalidazione esplicita richiesta.')}
 else saveGuideSegmentCheckpoint(o.archive,o.scope,o.packet,journal)
 o.archive.saveValue('guide-finite-premise-audit-context-v1',guideHash(record),record)
 return journal
}
function premiseTextRepair(prefix:GuideSegmentJournal,review:GuidePremiseReview,route:Route,o:GuideConstructionRuntime){
 if(route.mode!=='text'||guideHash(readKnownFinitePremiseRoute(prefix,review,o))!==guideHash(route))throw Error('Testo della premessa: routing autentico richiesto.')
 const ids=[...new Set(route.mapping.flatMap(m=>m.targets))],native=guideSegmentDeclarations(prefix,o.scope,o.packet),selected=finitePremiseTextTargets(prefix,o).filter(t=>ids.includes(t.id))
 const affected=guideAuditLocations(native,{kind:'prefix',turns:1}).filter(l=>selected.some(t=>guideHash(t.path.slice(0,l.path.length))===guideHash(l.path))).length
 const reserve=1+4*affected,prepared=finitePremiseTextRequest(prefix,review,ids,o,o.reserveOutside+reserve)
 prepared.request.deliveryRepairReserve=reserve
 return prepared
}
/** AI-authored narrative transaction; complete physical readers and fresh
 * quantitative anchor reviews precede the new independent premise opinion. */
export async function repairFinitePremiseTexts(prefix:GuideSegmentJournal,review:GuidePremiseReview,route:Route,o:GuideConstructionRuntime){
 assertFiniteTransportHistory(o.archive,o.scope)
 const negatives=[...o.archive.values<any>('guide-premise-review-v1')].filter(r=>r.value.prefix.setup.id===prefix.setup.id&&r.value.review.verdict!=='pass')
 if(!guideSemanticRetryAllowed(o.archive,negatives.length))throw new AiFailure('draft-limit','Premessa ancora respinta dopo due riesami indipendenti; nessuna nuova riparazione automatica.')
 assertFiniteAuditCounts(guideSegmentDeclarations(prefix,o.scope,o.packet),o.packet,o.archive)
 const make=()=>premiseTextRepair(prefix,review,route,o),source=await runFiniteUnit(prefix.setup.id,'repair-finite-premise-text',()=>make().request,o),built=make().build(source.value),journal=built.journal
 await certifyFiniteAuditCounts([built.native],{...o,reserveOutside:o.reserveOutside+1},true)
 assertFiniteAuditCounts(built.native,o.packet,o.archive)
 const record={version:1,scopeHash:guideHash(o.scope),prefixHash:guideHash(journal),sourcePrefix:prefix,review,route,ref:source.ref,selectedIds:built.selected.map(t=>t.id),immutableHash:guideHash(withoutFinitePremiseTexts(built.native,built.selected))}
 const root=forkGuideSegments(journal,o.scope,o.packet,0),existing=loadGuideSegmentCheckpoint(o.archive,o.scope,o.packet,root.setup.id,root.rootHash)
 if(!existing)saveGuideSegmentCheckpoint(o.archive,o.scope,o.packet,root)
 if(existing?.segments.length){if(guideHash(forkGuideSegments(existing,o.scope,o.packet,1))!==guideHash(journal))throw Error('Testo della premessa: checkpoint diverso.')}
 else saveGuideSegmentCheckpoint(o.archive,o.scope,o.packet,journal)
 o.archive.saveValue('guide-finite-premise-text-context-v1',guideHash(record),record)
 return journal
}
function readFinitePremiseTextContext(prefix:GuideSegmentJournal,o:Context):unknown{
 const rows=[...o.archive.values<any>('guide-finite-premise-text-context-v1')].filter(r=>r.value.prefixHash===guideHash(prefix))
 if(!rows.length)return undefined
 if(rows.length!==1)throw Error('Testo della premessa: contesti ambigui.')
 const {key,value:v}=rows[0]
 if(key!==guideHash(v)||v.version!==1||v.scopeHash!==guideHash(o.scope)||guideHash(readKnownFinitePremiseRoute(v.sourcePrefix,v.review,o))!==guideHash(v.route))throw Error('Testo della premessa: contesto alterato.')
 const request=finitePremiseTextRequest(v.sourcePrefix,v.review,v.selectedIds,o,0),source=o.archive.value<any>('guide-segment-unit-result-v1',v.ref.outcomeKey)
 if(!source||source.unitId!==v.ref.unitId||v.ref.outcomeKey!==guideHash(source))throw Error('Testo della premessa: originale AI mancante.')
 readAcceptedGuideTransport(prepareFiniteRequest(request.request,o),{key:v.ref.outcomeKey,value:source},o.archive)
 const built=request.build(source.value)
 if(guideHash(built.journal)!==guideHash(prefix)||v.immutableHash!==guideHash(withoutFinitePremiseTexts(built.native,built.selected)))throw Error('Testo della premessa: registro o testi diversi dall’originale AI.')
 assertFiniteAuditCounts(built.native,o.packet,o.archive)
 return v
}
export function readFinitePremiseAuditContext(prefix:GuideSegmentJournal,o:Context):unknown{
 const rows=[...o.archive.values<any>('guide-finite-premise-audit-context-v1')].filter(r=>r.value.prefixHash===guideHash(prefix))
 if(!rows.length)return readFinitePremiseTextContext(prefix,o)
 if(rows.length!==1)throw Error('Routing audit: contesti di riesame ambigui.')
 const {key,value:v}=rows[0]
 if(key!==guideHash(v)||v.version!==1||v.scopeHash!==guideHash(o.scope)||guideHash(readKnownFinitePremiseRoute(v.sourcePrefix,v.review,o))!==guideHash(v.route)||v.immutableHash!==guideHash(guideWithoutNativeAudits(guideSegmentDeclarations(prefix,o.scope,o.packet),{kind:'prefix',turns:1})))throw Error('Routing audit: contesto di riesame alterato.')
 const receipt=o.archive.value<any>('guide-native-audit-repair-v1',v.auditReceiptKey)
 if(!receipt||v.auditReceiptKey!==guideHash(receipt)||receipt.repairedHash!==guideHash(guideSegmentDeclarations(prefix,o.scope,o.packet)))throw Error('Routing audit: giudizi corretti senza provenienza.')
 for(const [i,ref]of receipt.refs.entries()){const source=o.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey),descriptor=o.archive.value<any>('guide-finite-request-v1',ref.unitId);if(!(source?.accepted||receipt.auditProtocol===3&&ref.declarationOnly&&ref.inputVersion===2)||source.unitId!==ref.unitId||ref.outcomeKey!==guideHash(source))throw Error('Routing audit: originale del giudizio corretto mancante.');if(receipt.auditProtocol===3){const patch=quantifiedAuditPatch(descriptor.request.data,source.raw,3);assertAuditLanguagePass(receipt.languageRefs[i],patch.targets,descriptor.request.data.quantityContext,o)}}
 return v
}
import {guideSemanticRetryAllowed} from './guide-run-policy'
