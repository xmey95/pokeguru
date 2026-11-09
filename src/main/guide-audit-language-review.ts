import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {auditLanguageSpans,auditNarrativeSchema,renderAuditNarrative,type AuditQuantityContext} from './guide-audit-quantities'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {runFiniteUnit,type FiniteUnitRef} from './guide-finite-unit'
import {readAcceptedGuideTransport,validateGuideTransportOutcome} from './guide-transport-evidence'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
import {assertFiniteTransportHistory,prepareFiniteRequest,type FiniteTransportReadView} from './guide-finite-runtime'
import {auditSourceQuantities} from './guide-audit-source-quantities'
import {auditCalculationSchema,readAuditCalculation} from './guide-audit-calculation'
import {hasGuideSourceQuote} from './guide-source-quote'
import {guideGameRuleSources,isGuideGameRuleSource} from './guide-game-rule-sources'
import {auditArithmeticEvidence} from './guide-audit-arithmetic-evidence'
import {AiFailure} from './ai-failure'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {isGuideDelivery,GUIDE_DELIVERY_DIMENSIONS as DELIVERY} from '../shared/guide-delivery'
import {planDeliveryAudits,aggregateDeliveryAudits} from './guide-delivery-audits'
import {prepareGuideSegmentBatch,guideSegmentAcceptedUnit} from './guide-segment-batch'
import {readDeliveryPartitions,freezeDeliveryPartitions,refineDeliveryPartitions} from './guide-delivery-partitions'
import {guideBudgetStop} from './guide-request-budget'
import {guideSemanticRetryAllowed} from './guide-run-policy'

export interface AuditLanguageTarget {id:string;text:string;parts:any[];allowedWindows:string[];maximum:number;anchorHash:string}
export function auditLanguageCapacity(targets:AuditLanguageTarget[],context:AuditQuantityContext){
 const prepared=auditLanguageInput(targets,context)
 return [...targets.length>DELIVERY.auditTargetsPerTurn?[{targetId:null,dimension:'targets',actual:targets.length,maximum:DELIVERY.auditTargetsPerTurn}]:[],...prepared.flatMap(t=>[
  ...t.text.length>DELIVERY.auditTextCharacters?[{targetId:t.id,dimension:'characters',actual:t.text.length,maximum:DELIVERY.auditTextCharacters}]:[],
  ...t.spans.length>DELIVERY.auditSpansPerTarget?[{targetId:t.id,dimension:'spans',actual:t.spans.length,maximum:DELIVERY.auditSpansPerTarget}]:[]
 ])]
}
export interface AuditLanguageReviewRef extends FiniteUnitRef {revalidatedAs?:2|4;negativeOnlyAs?:3;partitioned?:true}
export interface AuditLanguageReviewResult {value:any;ref:AuditLanguageReviewRef;rejectedDiagnostics?:{unitId:string;outcomeKey:string;retryOrdinal:number;unverified:true;raw:any}[]}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value}),nullable=(v:any)=>({anyOf:[v,{type:'null'}]}),text=(n:number)=>({type:'string',minLength:1,maxLength:n})
export function auditLanguageInput(targets:AuditLanguageTarget[],context:AuditQuantityContext){
 return targets.map((t,i)=>({...t,key:'t'+i,spans:t.parts.flatMap((p,j)=>p.text===null?[]:auditLanguageSpans(p.text).map(s=>({...s,id:j+':'+s.id,partIndex:j}))),contextHash:guideHash(context)}))
}
function sourcePacket(data:any,version:number){
 if(version<4)return data.packet as GuidePacket;const packet=structuredClone(data.packet) as GuidePacket
 const extra=data.gameRuleSources??[];if(!Array.isArray(extra)||extra.some(s=>!isGuideGameRuleSource(s,packet.basis.asOf))||new Set(extra.map(s=>s.id)).size!==extra.length)throw Error('Audit semantico: fonti Premi/regole non autentiche.')
 for(const source of extra){const old=packet.sources.find(s=>s.id===source.id);if(old&&guideHash(old)!==guideHash(source))throw Error('Audit semantico: fonte Premi in conflitto.');if(!old)packet.sources.push(source)}
 return packet
}
function strictReviewSchema(data:any,version:2|3|4=2){
 const packet=sourcePacket(data,version)
 const quantity=requireQuantitySchema(data.context),count={type:'integer',minimum:0,maximum:10000},nil={type:'null'},enumText=(values:string[])=>({type:'string',enum:[...new Set(values)]})
 return object({reviewedHash:literal(data.reviewedHash),verdict:{type:'string',enum:['pass','revise']},targets:object(Object.fromEntries(data.targets.map((t:any)=>{
  const common={spanId:enumText(t.spans.length?t.spans.map((s:any)=>s.id):['no-spans']),kind:nil,declaredCount:nil,quantity:nil,measureId:nil,contextId:nil,source:nil,cardId:nil,...version>=3?{calculation:nil}:{},reason:text(600)}
  const variant=(kind:string,fields:Record<string,any>)=>object({...common,kind:literal(kind),...fields}),variants=[variant('qualitative',{}),variant('inventory',{declaredCount:count,quantity})]
  if(data.context.measures.length)variants.push(variant('measure',{declaredCount:count,measureId:enumText(data.context.measures.map((m:any)=>m.id))}))
  if(data.contextFacts.length)variants.push(variant('context',{declaredCount:count,contextId:enumText(data.contextFacts.map((f:any)=>f.id))}))
  const sources=packet.sources.filter((s:any)=>['card','rules'].includes(s.kind)).map((s:any)=>s.id)
  if(sources.length)variants.push(variant('source',{declaredCount:count,source:object({id:enumText(sources),quote:text(1500)})}))
  if(version>=3){variants.push(variant('calculation',{declaredCount:count,calculation:auditCalculationSchema({...data,packet})}));variants.push(variant('unproven',{declaredCount:nullable(count)}))}
  variants.push(variant('name',{cardId:enumText([...data.context.cards.map((c:any)=>c.printId),...data.packet.sources.map((s:any)=>s.id)])}))
  return [t.key,object({allClaimsChecked:{type:'boolean'},annotations:{type:'array',minItems:t.spans.length,maxItems:t.spans.length,items:{anyOf:variants}},findings:{type:'array',maxItems:version>=3?1:12,items:object({quote:version>=3?literal(t.text):text(1600),reason:text(1600)})}})]
 })))})
}
function readReview(data:any,raw:any,version:1|2|3|4=1){
 if(guideHash({scope:data.scope,context:data.context,targets:data.targets,contextFacts:data.contextFacts})!==data.reviewedHash)throw Error('Audit semantico: contesto del riesame alterato.')
 assertNativeScenarioSchema(raw,version===1?data.reviewSchema:strictReviewSchema(data,version))
 const packet=sourcePacket(data,version)
 let mismatch=false
 for(const t of data.targets){const result=raw.targets[t.key]
  if(!result.allClaimsChecked||result.annotations.length!==t.spans.length||new Set(result.annotations.map((a:any)=>a.spanId)).size!==t.spans.length)throw Error('Audit semantico: copertura incompleta delle affermazioni.')
  if(result.findings.some((f:any)=>!f.quote.trim()||!t.text.includes(f.quote)||!f.reason.trim()))throw Error('Audit semantico: rilievo privo di riferimento al testo assegnato.')
  for(const a of result.annotations){const span=t.spans.find((s:any)=>s.id===a.spanId);if(!span)throw Error('Audit semantico: riferimento di testo estraneo.')
   const fields=[a.quantity,a.measureId,a.contextId,a.source,a.cardId,...version>=3?[a.calculation]:[]].filter(v=>v!==null)
   if(!a.reason.trim())throw Error('Audit semantico: classificazione senza motivazione.')
   if(a.kind==='qualitative'){
    if(fields.length||a.declaredCount!==null||span.explicit)throw Error('Audit semantico: numerale esplicito non fondato o classificazione ambigua.')
   }else if(version>=3&&a.kind==='unproven'){
    if(fields.length||span.value!==null&&a.declaredCount!==span.value||!result.findings.length||raw.verdict!=='revise')throw Error('Audit semantico: quantità non comprovata senza un negativo riferito al testo.')
    mismatch=true
   }else{
    if(fields.length!==1||span.explicit&&a.kind!=='name'&&a.declaredCount===null||a.declaredCount!==null&&span.value!==null&&span.explicit&&a.declaredCount!==span.value)throw Error('Audit semantico: valore dichiarato diverso dal testo.')
    if(version>=2&&!['name','inventory'].includes(a.kind)&&span.value!==null&&a.declaredCount!==span.value)throw Error('Audit semantico: numero affermato nel testo alterato.')
    let actual:number|undefined
    if(a.kind==='inventory'){
     if(!a.quantity||a.declaredCount===null)throw Error('Audit semantico: conteggio senza finestra o valore dichiarato.')
     if(span.value!==null&&a.declaredCount!==span.value)throw Error('Audit semantico: numero affermato nel testo alterato.')
     renderAuditNarrative([{text:null,quantity:a.quantity,measureId:null,card:null}],data.context,10000,t.allowedWindows,3)
     actual=a.quantity.count
    }else if(a.kind==='measure'){
     const m=data.context.measures.find((m:any)=>m.id===a.measureId);if(!m||a.declaredCount===null)throw Error('Audit semantico: misura stampata senza fonte.')
     actual=Number.parseInt(m.value,10)
    }else if(a.kind==='context'){
     const f=data.contextFacts.find((f:any)=>f.id===a.contextId);if(!f||a.declaredCount===null)throw Error('Audit semantico: fatto del turno mancante.');actual=f.value
    }else if(a.kind==='source'){
     const s=packet.sources.find((s:any)=>s.id===a.source?.id)
     if(!s||!['card','rules'].includes(s.kind)||!(version>=4?hasGuideSourceQuote(s.content,a.source.quote):a.source.quote.trim()&&s.content.includes(a.source.quote)))throw Error('Audit semantico: citazione originale mancante.')
     const values=version===1?auditLanguageSpans(a.source.quote).map(s=>s.value):auditSourceQuantities(a.source.quote)
     if(a.declaredCount!==null&&!values.includes(a.declaredCount))throw Error('Audit semantico: valore assente dalla citazione.')
    }else if(version>=3&&a.kind==='calculation'){
     actual=readAuditCalculation(a.calculation,{...data,packet},t.allowedWindows,version>=4)
    }else if(a.kind==='name'){
     const names=[...data.context.cards.filter((c:any)=>c.printId===a.cardId).map((c:any)=>c.name),...data.packet.sources.filter((s:any)=>s.id===a.cardId).map((s:any)=>s.id)],part=t.parts[span.partIndex].text
     if(a.declaredCount!==null||!names.some((name:string)=>{const index=part.indexOf(name);return index>=0&&span.start>=index&&span.end<=index+name.length}))throw Error('Audit semantico: numero non appartenente al nome citato.')
    }else throw Error('Audit semantico: classificazione sconosciuta.')
    if(actual!==undefined&&(!Number.isFinite(actual)||actual!==a.declaredCount))mismatch=true
   }
  }
 }
 const findings=Object.values(raw.targets).flatMap((t:any)=>t.findings)
 if(raw.verdict==='pass'&&(mismatch||findings.length)||raw.verdict==='revise'&&!findings.length)throw Error('Audit semantico: verdetto incompatibile con conteggi o rilievi.')
 return structuredClone(raw)
}
/** A historical negative is not a proof of any annotation. Retain the exact
 * independent raw, require complete assigned-text coverage and at least one
 * literal finding, and allow it ONLY to request a repair, never to pass a gate.
 * Other unbound/abbreviated findings remain diagnostics, not certified facts. */
function readHistoricalNegative(data:any,raw:any){
 if(guideHash({scope:data.scope,context:data.context,targets:data.targets,contextFacts:data.contextFacts})!==data.reviewedHash)throw Error('Audit negativo: contesto alterato.')
 assertNativeScenarioSchema(raw,data.reviewSchema);if(raw.verdict!=='revise')throw Error('Audit negativo: non è un giudizio di revisione.')
 let literalFindings=0
 for(const t of data.targets){const result=raw.targets[t.key]
  if(!result.allClaimsChecked||result.annotations.length!==t.spans.length||new Set(result.annotations.map((a:any)=>a.spanId)).size!==t.spans.length)throw Error('Audit negativo: copertura incompleta.')
  for(const a of result.annotations){const span=t.spans.find((s:any)=>s.id===a.spanId)
   if(!span||!a.reason.trim()||a.kind==='qualitative'&&span.explicit||!['qualitative','name'].includes(a.kind)&&span.value!==null&&a.declaredCount!==span.value)throw Error('Audit negativo: classificazione o numero assegnato estraneo.')
  }
  for(const f of result.findings){if(!f.quote.trim()||!f.reason.trim())throw Error('Audit negativo: rilievo vuoto.');if(t.text.includes(f.quote))literalFindings++}
 }
 if(!literalFindings)throw Error('Audit negativo: nessun rilievo letterale nel testo assegnato.')
 return structuredClone(raw)
}
export function auditLanguageRequest(targets:AuditLanguageTarget[],context:AuditQuantityContext,contextFacts:{id:string;label:string;value:number}[],o:GuideConstructionRuntime,reserveCalls:number,version:1|2|3|4=4):GuideSegmentRequest<any>{
 const prepared=auditLanguageInput(targets,context),id=guideHash({scope:o.scope,context,targets:prepared,contextFacts}),quantity=(requireQuantitySchema(context))
 const annotation=object({spanId:text(100),kind:{type:'string',enum:['qualitative','inventory','measure','context','source','name']},declaredCount:nullable({type:'integer',minimum:0,maximum:10000}),quantity:nullable(quantity),measureId:nullable(text(300)),contextId:nullable(text(300)),source:nullable(object({id:text(300),quote:text(1500)})),cardId:nullable(text(300)),reason:text(600)})
 const schema=object({reviewedHash:literal(id),verdict:{type:'string',enum:['pass','revise']},targets:object(Object.fromEntries(prepared.map(t=>[t.key,object({allClaimsChecked:{type:'boolean'},annotations:{type:'array',minItems:t.spans.length,maxItems:t.spans.length,items:{...annotation,properties:{...annotation.properties,spanId:{type:'string',enum:t.spans.length?t.spans.map(s=>s.id):['no-spans']}}}},findings:{type:'array',maxItems:12,items:object({quote:text(1600),reason:text(1600)})}})])))})
 const data={packet:o.packet,scope:o.scope,context,contextFacts,targets:prepared,reviewedHash:id,reviewSchema:schema,...version>=3?{reviewProtocol:version}:{},...version>=4?{gameRuleSources:guideGameRuleSources(o.packet.basis.asOf),arithmeticEvidence:auditArithmeticEvidence(prepared,context,contextFacts,o.packet)}:{},...isGuideDelivery(o.packet.basis)?{deliveryAuditKey:o.deliveryAuditKey??guideHash({caseId:context.caseId,windows:context.windows.map(w=>[w.lineId,w.turn,w.side]),targets:targets.map(t=>t.id)})}:{}};if(version>=2)data.reviewSchema=strictReviewSchema(data,version as 2|3|4)
 const read=(raw:any)=>readReview(data,raw,version),units=Math.max(1,Math.ceil((prepared.reduce((n,t)=>n+t.spans.length,0)*400+prepared.length*500+(version>=3?prepared.reduce((n,t)=>n+t.text.length,0):0))/6000))
 const request:GuideSegmentRequest<any>={stage:'review-premise-audit-language-'+id.slice(0,16),role:'critic',instructions:guideFiniteInstructions('review')+'\nRiesame indipendente SOLO della semantica quantitativa delle motivazioni assegnate; non certificare la strategia o richiedere turni e prosa futuri.',task:'Leggi TUTTA la motivazione, i frammenti originali, fonti e inventari nelle finestre corrette. Classifica ogni spanId: gli indizi lessicali non sono un divieto. Un articolo, confronto collettivo o assenza logica può essere qualitative, se non afferma una disponibilità numerica. «Nessuna promozione serve» e la sua parafrasi hanno la medesima semantica; «nessuna copia nel mazzo» è invece inventory e va confrontata con il saldo. Non classificare come qualitative un numerale esplicito. inventory: declaredCount è il numero affermato dal testo, quantity.count è il saldo REALE della finestra, anche quando differiscono. measure cita una misura stampata, context un fatto calcolato del turno, source una citazione ESATTA della fonte per quantità di regola/effetto non inventari; name copre soltanto cifre dentro nomi o ID congelati. Non usare fonti di regole per aggirare un conteggio di inventario. declaredCount è un intero obbligatorio per inventory/measure/context/source, null solo per qualitative/name. Ogni campo non pertinente è null. La fonte può esprimere uno con once, a card, an Energy o un altro nome singolare ammesso; twice esprime due. Non usare a few/a lot/a number/a pair come prova di uno. Anche in questi casi cita esattamente la fonte completa e verifica condizioni e significato. Verifica anche affermazioni implicite fuori dagli indizi e dichiarale nei findings. allClaimsChecked vale solo dopo la lettura completa. pass soltanto senza quantità contraddette, interpretazioni irrisolte o rilievi. La correttezza degli effetti e la tattica avranno comunque il critico completo. Non riscrivere il testo.',data,schema:data.reviewSchema,reserveCalls,units,read,cacheValidation:{id:'guide-finite-audit-language-'+version,validate:v=>{read(v)}}}
 if(version>=3)request.task=request.task.replace('declaredCount è un intero obbligatorio per inventory/measure/context/source, null solo per qualitative/name.','declaredCount è un intero obbligatorio per inventory/measure/context/source/calculation, null per qualitative/name; per unproven è il numero affermato se noto, altrimenti null.').replace('Verifica anche affermazioni implicite fuori dagli indizi e dichiarale nei findings.','Verifica anche tutte le affermazioni implicite fuori dagli indizi. I findings contengono SOLO problemi reali o prove mancanti: MAI conferme di quantità già verificate. Una verifica positiva resta nella copertura allClaimsChecked.')+' CALCOLI: calculation contiene al massimo otto passi binari; gli operandi sono misure, fatti, citazioni numeriche esatte, inventari nelle finestre ammesse o risultati di passi precedenti. Nessuna costante numerica libera. Non usare un calcolo per sostituire il saldo di una singola stampa o attestare una regola non documentata. Un totale di zona può invece sommare TUTTI i saldi delle diverse stampe di quel lato nella STESSA finestra ammessa: non richiede un fatto di contesto dedicato. Non sommare lati, zone o istanti differenti. Il calcolo dimostra aritmetica, non applicabilità degli effetti. Quantità non comprovata o non rappresentabile: kind=unproven, riferimenti null, declaredCount uguale al numero nel testo se noto; verdict=revise e finding obbligatorio del target. Non inventare citazioni né usare misure estranee per riempire lo schema. Per ogni target problematico usa un solo finding con quote IDENTICO ALL INTERO target.text, senza ellissi o sintesi; il reason riassume i problemi e le annotazioni ne mantengono i dettagli. pass soltanto senza unproven, mismatch o findings. Un rules di ammissione Standard non contiene automaticamente regole di gioco: segnala la prova mancante. Nei feedback storici negativeOnlyAs=3 conserva il giudizio negativo originale: le sue annotazioni e quote non fondate NON sono fatti approvati.'
 if(version>=4)request.task+=' CITAZIONI JSON v4: una citazione può essere una sottostringa ESATTA di un singolo campo stringa decodificato della fonte JSON, inclusi a capo e virgolette originali. Non normalizzare spazi, non unire campi o citare chiavi come prova. gameRuleSources sono estratti ufficiali consegnati e versionati: usa identità, ambito e testo originali; distingui estratti letterali e parafrasi curate. Le regole dei danni indicano quando applicare Debolezza/Resistenza e altri effetti; non sono conteggi di inventario né provano il KO o un modificatore. I vecchi negativi restano da risolvere anche se una fonte è stata aggiunta.'
 if(version>=4)request.task+=' PROVE ARITMETICHE: arithmeticEvidence contiene esempi verificati dal lettore, NON pass né interpretazioni approvate. aggregates dimostra soltanto il totale completo della zona/lato/finestra indicati. identities dimostra soltanto a/a=1 per una misura positiva già presente numericamente nel target; non è una regola di gioco. Per ×1 puoi usare calculation con questa identità, soltanto dopo avere verificato che la misura sia pertinente e che carte, tipi, effetti e regole consegnate giustifichino il fattore neutro. Non serve una regola che stampi il numero 1 per dimostrare una identità matematica; una copia in una zona estranea non ne prova l’applicabilità. Un’identità non dimostra assenza di modificatori, danno finale, KO o correttezza tattica. Se manca la prova di applicabilità conserva revise e descrivi quella mancanza reale, senza dire che l’aritmetica disponibile è irrappresentabile. I cataloghi non sono esaustivi: altri calcoli fondati restano ammessi entro otto passi.'
 if(version>=4)request.task+=' SEGNI DEI MODIFICATORI: gli operandi source.value sono scalari non negativi e il lettore estrae la magnitudine del numero stampato. Per applicare una riduzione stampata come -20 cita esattamente -20, usa source.value=20 e operation=subtract. Non usare add con un valore negativo vietato dallo schema e non sostituirlo con un numero positivo inventato. Applica il segno mediante l’operazione, conservando tutti i passi e il loro ordine. Questo esempio spiega la rappresentazione, NON prova che il modificatore si applichi: verifica tipo, destinatario, finestra, carte ed effetti; altrimenti conserva revise/unproven.'
 if(isGuideDelivery(o.packet.basis)&&o.deliveryReserveKeys?.length)request.deliveryFollowupKeys=[...o.deliveryReserveKeys]
 if(contextFacts.some((f:any)=>f.positionEvidenceVersion===1))request.task+=' positionEvidence contiene annotazioni native dei danni DOPO il setup e prima della linea, con la storia fisica fino al turno assegnato. Il valore context di una annotazione vale a quel punto iniziale: non trasferirlo automaticamente a finestre successive. Per usarlo nella finestra assegnata verifica identità/copia evolutiva, attacchi, effetti, cure e uscite intervenuti nella history e nelle fonti. Una evoluzione ordinaria conserva i segnalini; non inventare danni o cure. Se la storia prova la conservazione del valore iniziale, questo è un operando context disponibile anche quando è zero. Se un effetto cambia o rende incerto il valore, non usarlo come misura corrente: revise/unproven. La sola assenza di un numero esplicito nella dichiarazione di un attacco non prova zero danni. I percorsi context.windows e allowedWindows restano vincolanti.'
 return withGuideSegmentRetry(request,o.scope,o.archive)
}
// Reuse the exact quantity-reference shape, including host and zero checks.
function requireQuantitySchema(context:AuditQuantityContext){return (auditNarrativeSchema(context) as any).items.properties.quantity.anyOf[0]}
async function reviewAuditLanguageSingle(targets:AuditLanguageTarget[],context:AuditQuantityContext,contextFacts:{id:string;label:string;value:number}[],o:GuideConstructionRuntime,reserve:number):Promise<AuditLanguageReviewResult>{
 let view!:FiniteTransportReadView;assertFiniteTransportHistory(o.archive,o.scope,v=>{view=v})
 const prepared=auditLanguageInput(targets,context),desired={packet:o.packet,targets:prepared,context,contextFacts,reviewedHash:guideHash({scope:o.scope,context,targets:prepared,contextFacts})},scopeHash=guideHash(o.scope),packetHash=guideHash(o.packet)
 const old=[...view.outcomes.values()].filter(r=>{const d=view.descriptors.get(r.value.unitId);return d?.scopeHash===scopeHash&&['guide-finite-audit-language-1','guide-finite-audit-language-2','guide-finite-audit-language-3','guide-finite-audit-language-4'].includes(d.request.validationId)&&(d.request.data as any).reviewedHash===desired.reviewedHash&&guideHash((d.request.data as any).packet)===packetHash}).sort((a,b)=>Number(b.value.accepted)-Number(a.value.accepted)||b.value.retryOrdinal-a.value.retryOrdinal)
 const remember=(source:AuditLanguageReviewResult)=>{if(source.value.verdict==='pass'){const record={version:1,scopeHash:guideHash(o.scope),targets,context,contextFacts,ref:source.ref};o.archive.saveValue('guide-audit-language-pass-v1',guideHash(record),record)}
  else if(source.ref.negativeOnlyAs===3||source.ref.revalidatedAs===4)source.rejectedDiagnostics=old.filter(r=>!r.value.accepted).sort((a,b)=>a.value.retryOrdinal-b.value.retryOrdinal).map(r=>({unitId:r.value.unitId,outcomeKey:r.key,retryOrdinal:r.value.retryOrdinal,unverified:true as const,raw:structuredClone(r.value.raw)}))
  return source}
 for(const r of old){const ref:AuditLanguageReviewRef={unitId:r.value.unitId,outcomeKey:r.key,...r.value.accepted?{}:view.descriptors.get(r.value.unitId)!.request.validationId==='guide-finite-audit-language-3'?{revalidatedAs:4 as const}:r.value.raw?.verdict==='revise'?{negativeOnlyAs:3 as const}:{revalidatedAs:2 as const}};let review
  try{review=readAuditLanguageReview(ref,o)}catch(error){if(r.value.accepted)throw error;continue}
  if(guideHash(review.data.context)!==guideHash(context)||guideHash(review.data.targets)!==guideHash(desired.targets)||guideHash(review.data.contextFacts)!==guideHash(contextFacts))throw Error('Audit semantico: interpretazione storica estranea al registro corrente.')
  return remember({value:review.value,ref})
 }
 const legacyFailures=old.filter(r=>!r.value.accepted).length
 return remember(await runFiniteUnit<any>('language','review-premise-audit-language',()=>{const request=auditLanguageRequest(targets,context,contextFacts,o,reserve),canonical=prepareFiniteRequest(request,o);if(!guideSemanticRetryAllowed(o.archive,legacyFailures+(canonical.retryOrdinal??0)))throw new AiFailure('invalid-response','Audit semantico: due risposte non valide anche nel nuovo contratto; nessun riesame aggiuntivo o azzeramento del limite.');return request},o))
}
export function readAuditLanguageReview(ref:AuditLanguageReviewRef,o:Pick<GuideConstructionRuntime,'archive'>):{value:any;data:any}{
 if(ref.partitioned)return readPartitionedAudit(ref,o)
 const descriptor=o.archive.value<any>('guide-finite-request-v1',ref.unitId),source=o.archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey)
 if(!descriptor||descriptor.request.role!=='critic'||!['guide-finite-audit-language-1','guide-finite-audit-language-2','guide-finite-audit-language-3','guide-finite-audit-language-4'].includes(descriptor.request.validationId)||!source)throw Error('Audit semantico: originale indipendente mancante.')
 const snapshot=descriptor.request,version=snapshot.validationId.endsWith('-4')?4:snapshot.validationId.endsWith('-3')?3:snapshot.validationId.endsWith('-2')?2:1,request={...snapshot,reserveCalls:0,cacheValidation:{id:snapshot.validationId,validate:(v:any)=>{readReview(snapshot.data,v,version)}},read:(v:any)=>readReview(snapshot.data,v,version)} as any
 if(descriptor.scopeHash!==guideHash(snapshot.data.scope)||snapshot.data.scope.jobId!==o.archive.id||snapshot.data.scope.projectId!==o.archive.projectId||source.unitId!==ref.unitId||guideHash(source)!==ref.outcomeKey||guideSegmentUnitIdentity(request).unitId!==ref.unitId)throw Error('Audit semantico: fonte o scope non autenticati.')
 let value:any
 if(source.accepted){if(ref.revalidatedAs!==undefined||ref.negativeOnlyAs!==undefined)throw Error('Audit semantico: marcatura di migrazione impropria.');value=readAcceptedGuideTransport(request,{key:ref.outcomeKey,value:source},o.archive).value;if(version===1&&value.verdict==='pass')value=readReview(snapshot.data,source.raw,2)}
 else {if(ref.revalidatedAs===4&&version===3&&ref.negativeOnlyAs===undefined){validateGuideTransportOutcome(request,{key:ref.outcomeKey,value:source});value=readReview(snapshot.data,source.raw,4)}
  else if(ref.negativeOnlyAs===3&&version<3&&ref.revalidatedAs===undefined){validateGuideTransportOutcome(request,{key:ref.outcomeKey,value:source});value=readHistoricalNegative(snapshot.data,source.raw)}
  else {if(version!==1||ref.revalidatedAs!==2||ref.negativeOnlyAs!==undefined)throw Error('Audit semantico: rifiuto senza interpretazione esplicita.');validateGuideTransportOutcome(request,{key:ref.outcomeKey,value:source});value=readReview(snapshot.data,source.raw,2)}}
 return {value,data:snapshot.data}
}
export async function reviewAuditLanguage(targets:AuditLanguageTarget[],context:AuditQuantityContext,contextFacts:{id:string;label:string;value:number}[],o:GuideConstructionRuntime,reserve:number):Promise<AuditLanguageReviewResult>{
 if(!isGuideDelivery(o.packet.basis))return reviewAuditLanguageSingle(targets,context,contextFacts,o,reserve)
 const prepared=auditLanguageInput(targets,context),capacity=auditLanguageCapacity(targets,context)
 if(capacity.length)throw new AiFailure('draft-limit','Audit oltre il profilo di consegna; nessun testo o span viene eliminato. '+JSON.stringify(capacity))
 // Guidance and optional witnesses may change the transport identity. Recover
 // the exact paid aggregate before sizing new requests, preserving its verdict
 // and all original child reviews instead of repurchasing or resetting them.
 const expected=guideHash({scope:o.scope,context,targets:prepared,contextFacts})
 for(const row of o.archive.values<any>('guide-delivery-audit-aggregate-v1')){
  const d=row.value.fullData
  if(d?.reviewedHash!==expected||guideHash(d.packet)!==guideHash(o.packet)||guideHash(row.value.targets)!==guideHash(targets))continue
  const ref:AuditLanguageReviewRef={unitId:'aggregate-'+guideHash(d),outcomeKey:row.key,partitioned:true},review=readPartitionedAudit(ref,o)
  return {value:review.value,ref}
 }
 const contextHash=guideHash({scope:o.scope,packet:o.packet,context,contextFacts}),baseKey=o.deliveryAuditKey??guideHash({caseId:context.caseId,windows:context.windows.map(w=>[w.lineId,w.turn,w.side]),targets:targets.map(t=>t.id)}),full=auditLanguageRequest(targets,context,contextFacts,o,reserve).data as any,fullHash=guideHash(full)
 const make=(items:AuditLanguageTarget[],i:number,r=reserve)=>prepareFiniteRequest(auditLanguageRequest(items,context,contextFacts,{...o,deliveryAuditKey:baseKey+'/'+i},r),o)
 const measure=(items:AuditLanguageTarget[])=>o.estimate(prepareGuideSegmentBatch([make(items,0)],{stage:'review-premise-audit-language',reserveCalls:reserve}).request)
 let ids=readDeliveryPartitions(fullHash,targets,o)
 if(!ids){const plan=planDeliveryAudits(targets,contextHash,measure,4);if(plan.status!=='ready'){if(plan.budget)throw guideBudgetStop(plan.budget.stage,o.remainingCalls(),reserve+1,plan.budget);throw new AiFailure('draft-limit','La copertura quantitativa richiede più di quattro partizioni: nessun invio o pass parziale.')}ids=freezeDeliveryPartitions(fullHash,targets,plan.groups.map(g=>g.targetIds),o)}
 for(let round=0;round<4;round++){
  const groups=ids.map(group=>({targetIds:group,targets:group.map(id=>targets.find(t=>t.id===id)!)}))
  // Validate every still-unpaid actual indexed request before the first send.
  for(const [i,g]of groups.entries()){const request=make(g.targets,i,reserve+groups.length-i-1);if(guideSegmentAcceptedUnit(o.archive,request)!==undefined)continue;const budget=o.estimate(prepareGuideSegmentBatch([request],{stage:'review-premise-audit-language',reserveCalls:reserve+groups.length-i-1}).request);if(!budget.fits)throw guideBudgetStop(budget.stage,o.remainingCalls(),budget.reservedCalls+1,budget)}
  const unpaid=groups.map((g,i)=>make(g.targets,i,reserve+groups.length-i-1)).filter(r=>guideSegmentAcceptedUnit(o.archive,r)===undefined)
  if(unpaid.length&&o.preflight)o.preflight(unpaid.map(r=>o.prepareRequest!(r)).map(r=>prepareGuideSegmentBatch([r],{stage:'review-premise-audit-language',reserveCalls:r.reserveCalls}).request))
  const refs:AuditLanguageReviewRef[]=[];let changed=false
  for(const [i,g]of groups.entries()){
   try{refs.push((await reviewAuditLanguageSingle(g.targets,context,contextFacts,{...o,deliveryAuditKey:baseKey+'/'+i},reserve+groups.length-i-1)).ref)}catch(error){
    if(!(error instanceof AiFailure)||error.code!=='output-limit')throw error
    const failed=make(g.targets,i,reserve+groups.length-i-1);ids=refineDeliveryPartitions(fullHash,targets,ids,i,guideSegmentUnitIdentity(failed).unitId,o);changed=true;break
   }
  }
  if(changed)continue
  const stablePlan={status:'ready',contextHash,coverageHash:guideHash({contextHash,targets}),groups:groups.map(g=>({...g,inputHash:guideHash({contextHash,targets:g.targets})}))},record={version:1,scopeHash:guideHash(o.scope),fullData:full,contextHash,targets,plan:stablePlan,refs},key=guideHash(record)
  o.archive.saveValue('guide-delivery-audit-aggregate-v1',key,record)
  const ref:AuditLanguageReviewRef={unitId:'aggregate-'+guideHash(full),outcomeKey:key,partitioned:true},review=readPartitionedAudit(ref,o)
  if(review.value.verdict==='pass'){const pass={version:1,scopeHash:guideHash(o.scope),targets,context,contextFacts,ref};o.archive.saveValue('guide-audit-language-pass-v1',guideHash(pass),pass)}
  return {value:review.value,ref}
 }
 throw new AiFailure('draft-limit','Partizione quantitativa non completata entro il limite congelato.')
}
function readPartitionedAudit(ref:AuditLanguageReviewRef,o:Pick<GuideConstructionRuntime,'archive'>):{value:any;data:any}{
 const record=o.archive.value<any>('guide-delivery-audit-aggregate-v1',ref.outcomeKey)
 if(!record||record.version!==1||guideHash(record)!==ref.outcomeKey||ref.unitId!=='aggregate-'+guideHash(record.fullData)||record.fullData.scope.jobId!==o.archive.id||record.fullData.scope.projectId!==o.archive.projectId||record.scopeHash!==guideHash(record.fullData.scope)||record.refs.length!==record.plan.groups.length||record.refs.some((r:any)=>r.partitioned))throw Error('Riesame partizionato senza originali completi e autenticati.')
 const full=record.fullData,raw:any={reviewedHash:full.reviewedHash,verdict:'pass',targets:{}},receipts:any[]=[]
 if(!isGuideDelivery(full.packet.basis)||!record.plan.groups.length||record.plan.groups.length>4||guideHash(readDeliveryPartitions(guideHash(full),record.targets,{archive:o.archive,scope:full.scope}))!==guideHash(record.plan.groups.map((g:any)=>g.targetIds)))throw Error('Partizione senza ammissione e raffinamenti autentici.')
 for(const [i,group]of record.plan.groups.entries()){
  const child=readAuditLanguageReview(record.refs[i],o)
  if(guideHash(child.data.context)!==guideHash(full.context)||guideHash(child.data.contextFacts)!==guideHash(full.contextFacts)||guideHash(child.data.packet)!==guideHash(full.packet)||guideHash(child.data.scope)!==guideHash(full.scope))throw Error('Contesto diverso fra i riesami partizionati.')
  const ids=child.data.targets.map((t:any)=>t.id)
  receipts.push({inputHash:group.inputHash,contextHash:record.contextHash,targetIds:ids,verdict:child.value.verdict})
  for(const target of child.data.targets){const original=full.targets.find((t:any)=>t.id===target.id);if(!original||guideHash({...target,key:original.key})!==guideHash(original)||raw.targets[original.key])throw Error('Target omesso, duplicato o modificato nella partizione.');raw.targets[original.key]=child.value.targets[target.key]}
 }
 raw.verdict=aggregateDeliveryAudits(record.targets,record.plan,receipts).verdict
 return {value:readReview(full,raw,4),data:full}
}
