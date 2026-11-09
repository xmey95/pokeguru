import {guideHash} from './matchup-guide-packet'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {runFiniteUnit} from './guide-finite-unit'
import {withGuideSegmentRetry} from './guide-segment-generation'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {AiFailure} from './ai-failure'
import {guideUntilValidAuthority} from './guide-run-policy'
import {guidePlanSchemaV21} from './matchup-guide-schema'
import {readOpeningAllocations} from './guide-decision-context'
export interface DeliveryOutlineReview {planHash:string;verdict:'pass'|'revise'|'incomplete';findings:string[]}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
function baseSchema(plan:unknown){return object({planHash:{type:'string',const:guideHash(plan)},verdict:{type:'string',enum:['pass','revise','incomplete']},findings:{type:'array',maxItems:8,items:{type:'string',minLength:1,maxLength:1200,pattern:'\\S'}}})}
/** Same approval rule as v1, now present in the transport as well. Complete
 * object alternatives retain strict required fields after schema sharing. */
export function deliveryOutlineReviewSchema(plan:unknown){
 const base=baseSchema(plan),branch=(verdict:object,minimum:number,maximum:number)=>object({...base.properties,verdict,findings:{...base.properties.findings,minItems:minimum,maxItems:maximum}})
 return {...base,anyOf:[branch({type:'string',const:'pass'},0,0),branch({type:'string',enum:['revise','incomplete']},1,8)]}
}
export function readDeliveryOutlineReview(raw:unknown,plan:unknown):DeliveryOutlineReview{
 assertNativeScenarioSchema(raw,baseSchema(plan));const value=raw as DeliveryOutlineReview
 if(value.verdict==='pass'&&value.findings.length)throw Error('Critica iniziale: verdict="pass" richiede findings=[]. findings contiene soltanto problemi irrisolti; non inserire conferme positive. Se esiste un problema, usa revise o incomplete e descrivilo senza cancellarlo.')
 if(value.verdict!=='pass'&&!value.findings.length)throw Error('Critica iniziale: verdict="'+value.verdict+'" richiede almeno un problema concreto in findings. Non usare un array vuoto per revise o incomplete.')
 if(value.findings.some(f=>!f.trim()))throw Error('Critica iniziale: findings contiene un rilievo vuoto o di soli spazi; descrivi il problema concreto.')
 assertNativeScenarioSchema(raw,deliveryOutlineReviewSchema(plan));return structuredClone(value)
}
export function deliveryOutlineReviewRequest(plan:unknown,o:GuideConstructionRuntime):GuideSegmentRequest<DeliveryOutlineReview>{
 const read=(raw:unknown)=>readDeliveryOutlineReview(raw,plan)
 const original=withGuideSegmentRetry({stage:'review-delivery-outline',role:'critic',instructions:'Esamina indipendentemente pertinenza e realismo del piano delle due posizioni per la lista esatta e il matchup. Non certificare turni o capitoli futuri. Nessuna vittoria forzata o winrate senza prove. Pass soltanto se il piano è pertinente e le lacune esplicite. PROTOCOLLO DEL VERDETTO: findings contiene esclusivamente problemi concreti irrisolti o prove mancanti, mai conferme, riepiloghi positivi o limiti già correttamente dichiarati. Con verdict="pass" restituisci findings=[] e nessun commento aggiuntivo. Con verdict="revise" oppure "incomplete" restituisci almeno un rilievo effettivo. Se rilevi un problema non scegliere pass e non cancellare il problema per rientrare nello schema. Copia esattamente planHash; non aggiungere campi.',task:'Verifica il piano prima di acquistare preparazioni e rami. Scegli una sola alternativa dello schema: pass con findings vuoto; revise/incomplete con uno o più problemi concreti.',data:{packet:o.evidencePacket??o.packet,plan},schema:deliveryOutlineReviewSchema(plan),reserveCalls:o.reserveOutside,read,cacheValidation:{id:'guide-delivery-outline-review-2',validate:value=>{read(value)}}},o.scope,o.archive)
 const historic=[...o.archive.values<any>('guide-finite-request-v1')].some(r=>r.value.scopeHash===guideHash(o.scope)&&r.value.request.validationId==='guide-delivery-outline-review-2'&&guideHash(r.value.request.data.plan)===guideHash(plan))
 if(!guideUntilValidAuthority(o.archive)||historic)return original
 const openingContract={active:'One Basic placed separately from the six remaining cards in opening.hand.',hand:'The six cards before selecting initial Bench Pokemon; opening.bench identifies copies drawn from this same hand, not additional inventory.',bench:'A subset of opening.hand. Subtract these copies from hand when projecting the board, never consume them twice.',prizes:'Six separately reserved cards.',remainingDeck:'The exact list minus active, the six pre-benching hand cards and six prizes: 47 cards. Bench is not subtracted a second time.'}
 return withGuideSegmentRetry({...original,data:{...original.data as object,openingContract},instructions:original.instructions+' openingContract definisce la rappresentazione delle zone: verifica i conteggi secondo queste definizioni prima di contestare duplicazioni. Le allocazioni sono derivate dal codice e non certificano decisioni o effetti.',cacheValidation:{id:'guide-delivery-outline-review-3',validate:value=>{read(value)}}},o.scope,o.archive)
}
export async function reviewDeliveryOutline(plan:any,o:GuideConstructionRuntime){
 const result=await runFiniteUnit('outline','review-delivery-outline',()=>deliveryOutlineReviewRequest(plan,o),o)
 if(result.value.verdict!=='pass'&&!guideUntilValidAuthority(o.archive))throw new AiFailure('draft-limit','Piano iniziale respinto: guida conservata, nessuna preparazione acquistata o espansione automatica.')
 return result.value
}

export async function repairDeliveryOutline(plan:any,review:DeliveryOutlineReview,o:GuideConstructionRuntime){
 if(!guideUntilValidAuthority(o.archive)||review.verdict==='pass'||review.planHash!==guideHash(plan))throw Error('Riparazione del piano priva del rifiuto e dell’autorità corrispondenti.')
 const schema:any=structuredClone(guidePlanSchemaV21)
 schema.properties.opponentListId={type:'string',const:plan.opponentListId}
 schema.properties.additionalPrintIds={...schema.properties.additionalPrintIds,const:plan.additionalPrintIds}
 schema.properties.additionalLists={...schema.properties.additionalLists,const:plan.additionalLists}
 const request=()=>{
  const read=(raw:unknown)=>{assertNativeScenarioSchema(raw,schema);const value=raw as any;return {...value,allocations:readOpeningAllocations(value.initialOpenings,o.packet,value.opponentListId)}}
  const validate=(value:any)=>{const {allocations,...raw}=value;const expected=read(raw);if(guideHash(expected)!==guideHash(value))throw Error('Allocazioni derivate della riparazione diverse dagli originali e dalle liste esatte.')}
  return withGuideSegmentRetry({stage:'repair-delivery-outline',role:'constructor' as const,instructions:'Correggi il piano della guida in base a TUTTI i rilievi indipendenti. Mantieni il matchup, la lista esatta e le fonti congelate. Non eliminare rilievi o inventare approvazioni; il nuovo piano verrà riesaminato indipendentemente. Le aperture devono rispettare l’inventario di ogni lista.',task:'Restituisci il piano corretto completo, con due posizioni pertinenti e realistiche.',data:{packet:o.packet,plan,review},schema,reserveCalls:o.reserveOutside+1,read,cacheValidation:{id:'guide-delivery-outline-repair-1',validate}},o.scope,o.archive)
 }
 return (await runFiniteUnit('outline','repair-delivery-outline',request,o)).value
}
