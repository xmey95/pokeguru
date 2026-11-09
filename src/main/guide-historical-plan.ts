import {guideSegmentAcceptedUnit} from './guide-segment-batch'
import {withGuideSegmentRetry,type GuideSegmentRequest} from './guide-segment-generation'
import {guideUntilValidAuthority} from './guide-run-policy'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {GUIDE_DELIVERY_DIMENSIONS} from '../shared/guide-delivery'
import type {GuideConstructionRuntime} from './guide-reply-phase'

const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value})
const cached=(request:GuideSegmentRequest<any>,o:GuideConstructionRuntime)=>guideSegmentAcceptedUnit(o.archive,o.prepareRequest!(request))!==undefined

/** Advisory AI allocation, never a physical witness or an approval. Accepted
 * old headers retain their exact schema, prompt and transport identity. */
export function plannedGuideHistoricalHeader<T>(legacy:GuideSegmentRequest<T>,headerSchema:any,maxRounds:number,o:GuideConstructionRuntime):GuideSegmentRequest<any>{
 if(!guideUntilValidAuthority(o.archive)||cached(legacy,o))return legacy
 const possible=['first-opponent',...Array.from({length:maxRounds},(_,i)=>['round-'+(i+1)+'-ours','round-'+(i+1)+'-opponent']).flat()]
 const p=headerSchema.properties,plannedTurns={type:'array',maxItems:1+2*maxRounds,items:object({slotId:{type:'string',enum:possible},events:{type:'array',maxItems:GUIDE_DELIVERY_DIMENSIONS.eventsPerTurn,items:{type:'string',minLength:1,maxLength:400}}})}
 // Allocate first, then declare the resulting desired position. No plan text
 // is copied into physical actions by the host.
 const schema=object({caseId:p.caseId,contextHash:p.contextHash,leadOpponent:p.leadOpponent,rounds:p.rounds,plannedTurns,frame:p.frame,changeSummary:p.changeSummary})
 const read=(raw:any)=>{
  assertNativeScenarioSchema(raw,schema)
  const base=Object.fromEntries(Object.keys(p).map(key=>[key,raw[key]]));legacy.read(base)
  const expected=[...raw.leadOpponent?['first-opponent']:[],...Array.from({length:raw.rounds},(_,i)=>['round-'+(i+1)+'-ours','round-'+(i+1)+'-opponent']).flat()]
  if(JSON.stringify(raw.plannedTurns.map((t:any)=>t.slotId))!==JSON.stringify(expected))throw Error('Piano storico: turni omessi, duplicati o fuori ordine rispetto al quadro.')
  return structuredClone(raw)
 }
 const {previousInvalid,...data}=legacy.data as any
 return withGuideSegmentRetry({...legacy,task:legacy.task+' PIANO STORICO ESPLICITO: prima di fissare la posizione finale distribuisci gli eventi tra TUTTI i turni plannedTurns, nell’ordine esatto degli slot scelti. Ogni stringa descrive un evento che sarà poi costruito e verificato separatamente. Nel limite per turno includi attacco con tutti i movimenti obbligatori di KO/Premi/scarti e una promozione come evento separato. Non consumare tutti gli slot con sviluppo differibile lasciando fuori le risoluzioni obbligatorie. Sposta preparazioni, evoluzioni e assegnazioni nei turni in cui sono legali e necessari; non raggruppare azioni indipendenti in un’etichetta per aggirare il profilo. Verifica risorse e turni del primo giocatore. Se la precedente ipotesi non è costruibile nel profilo, scegli una nuova premessa esplicita coerente con il contesto e la lista: non ripetere il medesimo registro incompleto. Non inventare pescate o azioni già avvenute. Le descrizioni sono un piano, non eventi, prove o pass; ogni turno e la premessa dovranno superare tutti i controlli originali.',data:{...data,turnCapacity:{events:GUIDE_DELIVERY_DIMENSIONS.eventsPerTurn,moves:GUIDE_DELIVERY_DIMENSIONS.movesPerEvent,energyRoutes:GUIDE_DELIVERY_DIMENSIONS.energyRoutesPerEvent},...previousInvalid?{previousFrameFormatFailure:previousInvalid}:{}},schema,read,cacheValidation:{id:'guide-finite-setup-frame-2',validate:raw=>{read(raw)}}},o.scope,o.archive)
}

/** Schema is the same acceptance set as the v2 reader, expressed before
 * generation as two disjoint branches. Paid v2 originals remain untouched. */
export function coherentGuideHistoricalTurn<T>(legacy:GuideSegmentRequest<T>,o:GuideConstructionRuntime):GuideSegmentRequest<T>{
 if(cached(legacy,o))return legacy
 const p=(legacy.schema as any).properties,body=p.body.anyOf.find((n:any)=>n.type!=='null'),common=Object.fromEntries(Object.entries(p).filter(([key])=>!['outcome','reason','body'].includes(key)))
 const schema={anyOf:[object({outcome:literal('complete'),reason:p.reason,...common,body}),object({outcome:literal('rebuild-required'),reason:p.reason,...common,body:{type:'null'}})]}
 const read=(raw:unknown)=>{assertNativeScenarioSchema(raw,schema);return legacy.read(raw)}
 const {previousInvalid,...data}=legacy.data as any
 return withGuideSegmentRetry({...legacy,task:legacy.task+' Scegli prima il ramo outcome. Lo schema lega complete a un body completo e rebuild-required esclusivamente a body=null; non mescolare i due rami.',data:{...data,...previousInvalid?{previousTurnFormatFailure:previousInvalid}:{}},schema,read,cacheValidation:{id:'guide-finite-setup-turn-3',validate:raw=>{legacy.cacheValidation.validate(read(raw))}}},o.scope,o.archive)
}
