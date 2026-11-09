import {matchingEvidenceValues} from './ai-evidence-selection'
import {createHash} from 'node:crypto'
import type {AiEvidenceArchive} from './ai-evidence-archive'
import type {GuideSegmentCaller,GuideSegmentRequest} from './guide-segment-generation'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'

type Outcome<T>={unitId:string;unitKey:string;retryOrdinal:number;raw:unknown}&({accepted:true;value:T}|{accepted:false;message:string})
export interface GuideSegmentBatch<T>{batchHash:string;outcomes:Outcome<T>[]}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const object=(properties:Record<string,any>)=>({type:'object',properties,additionalProperties:false,required:Object.keys(properties)})
/** The exact child identity used by the transport and authenticated readers. */
export function guideSegmentUnitIdentity(request:GuideSegmentRequest<any>){
  const unitId=hash({stage:request.stage,role:request.role,instructions:request.instructions,task:request.task,data:request.data,schema:request.schema,validationId:request.cacheValidation.id,unitKey:request.unitKey??null,retryOrdinal:request.retryOrdinal??0})
  return {unitId,unitKey:request.unitKey??unitId,retryOrdinal:request.retryOrdinal??0}
}
/** Build the complete descriptor without provider calls or archive writes, so
 * the host can estimate the real prompt/schema and split the group first. */
export function prepareGuideSegmentBatch<T>(requests:GuideSegmentRequest<T>[],options:{stage:string;reserveCalls:number}):{request:GuideSegmentRequest<GuideSegmentBatch<T>>;validate:(value:GuideSegmentBatch<T>)=>void}{
  if(!requests.length||!Number.isSafeInteger(options.reserveCalls)||options.reserveCalls<Math.max(...requests.map(r=>r.reserveCalls)))throw new Error('Batch segmenti: unità o riserva non valide.')
  const first=requests[0]
  if(!(first.data as any)?.packet?.basis?.projectId)throw new Error('Batch segmenti: packet mancante.')
  const packetHash=hash((first.data as any).packet)
  if(requests.some(r=>!(r.data as any)?.packet||r.role!==first.role||r.instructions!==first.instructions||hash((r.data as any).packet)!==packetHash))throw new Error('Batch segmenti: separare ruoli, istruzioni, progetti e fonti differenti.')
  if(requests.some(r=>!Number.isSafeInteger(r.retryOrdinal??0)||(r.retryOrdinal??0)<0))throw new Error('Batch segmenti: numero del retry non valido.')
  const units=requests.map(request=>({...guideSegmentUnitIdentity(request),request}))
  if(new Set(units.map(u=>u.unitId)).size!==units.length)throw new Error('Batch segmenti: unità duplicate.')
  if(new Set(units.map(u=>u.unitKey)).size!==units.length)throw new Error('Batch segmenti: due tentativi della stessa unità nel medesimo gruppo.')
  const batchHash=hash(units.map(u=>u.unitId)),ids=units.map(u=>u.unitId)
  const schema=object({units:{type:'array',minItems:units.length,maxItems:units.length,items:{anyOf:units.map(u=>object({unitId:{type:'string',const:u.unitId},response:u.request.schema}))}}})
  // The container is checked separately so that an invalid child is rejected
  // by its own complete schema/reader, without waiving that check for any unit.
  const container=object({units:{type:'array',minItems:units.length,maxItems:units.length,items:object({unitId:{type:'string',enum:ids},response:{}})}})
  const read=(raw:unknown):GuideSegmentBatch<T>=>{
    assertNativeScenarioSchema(raw,container)
    const rows=(raw as {units:{unitId:string;response:unknown}[]}).units
    if(new Set(rows.map(r=>r.unitId)).size!==units.length)throw new Error('Batch segmenti: unità mancanti o duplicate.')
    return {batchHash,outcomes:units.map(({unitId,unitKey,retryOrdinal,request})=>{
      const original=structuredClone(rows.find(r=>r.unitId===unitId)!.response)
      try{return {unitId,unitKey,retryOrdinal,raw:original,accepted:true as const,value:request.read(structuredClone(original))}}
      catch(error){return {unitId,unitKey,retryOrdinal,raw:original,accepted:false as const,message:error instanceof Error?error.message:String(error)}}
    })}
  }
  const validate=(value:GuideSegmentBatch<T>)=>{
    if(value.batchHash!==batchHash||!Array.isArray(value.outcomes)||value.outcomes.length!==units.length||new Set(value.outcomes.map(o=>o.unitId)).size!==units.length)throw new Error('Batch segmenti: cache di un altro insieme di unità.')
    for(const unit of units){
      const outcome=value.outcomes.find(o=>o.unitId===unit.unitId)
      if(!outcome||outcome.unitKey!==unit.unitKey||outcome.retryOrdinal!==unit.retryOrdinal)throw new Error('Batch segmenti: unità cache assente o retry diverso.')
      if(outcome.accepted){
        unit.request.cacheValidation.validate(outcome.value)
        if(hash(unit.request.read(structuredClone(outcome.raw)))!==hash(outcome.value))throw new Error('Batch segmenti: valore cache diverso dal risultato verificato.')
      }else{
        let nowValid=false;try{unit.request.read(structuredClone(outcome.raw));nowValid=true}catch{/* Original rejection remains explicit. */}
        if(nowValid)throw new Error('Batch segmenti: controllo cambiato, rivalutare la cache con la nuova versione.')
      }
    }
  }
  const request:GuideSegmentRequest<GuideSegmentBatch<T>>={stage:options.stage,role:first.role,instructions:first.instructions+' Ogni unità del batch è indipendente: rispetta unitId, istruzioni e schema assegnati. Non trasferire carte, stati o conclusioni fra unità.',task:'Restituisci tutte le unità assegnate, ciascuna nel proprio response.',data:{packet:(first.data as any).packet,units:units.map(u=>({unitId:u.unitId,stage:u.request.stage,task:u.request.task,data:u.request.data}))},schema,reserveCalls:options.reserveCalls,units:requests.reduce((n,r)=>n+(r.units??1),0),read,cacheValidation:{id:'guide-segment-batch-1',validate}}
  if(requests.some(r=>r.deliveryFollowupKeys?.length))request.deliveryFollowupKeys=[...new Set(requests.flatMap(r=>r.deliveryFollowupKeys??[]))]
  if(requests.some(r=>r.deliveryRepairReserve!==undefined))request.deliveryRepairReserve=requests.reduce((n,r)=>n+(r.deliveryRepairReserve??0),0)
  return {request,validate}
}
/** Retained across reopen: even a byte-identical second failure gets a new
 * request identity. A cached rejection cannot form a zero-call retry loop. */
export function guideSegmentRetry(archive:Pick<AiEvidenceArchive,'values'>,unitKey:string):{ordinal:number;unitId:string;message:string;raw:unknown}|null{
  const rejected=[...matchingEvidenceValues<Outcome<unknown>>(archive,'guide-segment-unit-result-v1','unitKey',unitKey)].map(r=>r.value).filter((v):v is Outcome<unknown>&{accepted:false;message:string}=>v.unitKey===unitKey&&v.accepted===false)
  if(!rejected.length)return null
  if(rejected.some(v=>!Number.isSafeInteger(v.retryOrdinal)||v.retryOrdinal<0))throw new Error('Batch segmenti: storico dei retry non valido.')
  const ordinals=new Map<number,string>()
  for(const row of rejected){const payload=hash([row.unitId,row.raw,row.message]);if(ordinals.has(row.retryOrdinal)&&ordinals.get(row.retryOrdinal)!==payload)throw new Error('Batch segmenti: storico dei retry ambiguo.');ordinals.set(row.retryOrdinal,payload)}
  const latest=rejected.sort((a,b)=>b.retryOrdinal-a.retryOrdinal)[0]
  return {ordinal:latest.retryOrdinal+1,unitId:latest.unitId,message:latest.message,raw:structuredClone(latest.raw)}
}
export function guideSegmentAcceptedUnit<T>(archive:Pick<AiEvidenceArchive,'values'>,request:GuideSegmentRequest<T>):T|undefined{
  if(!request.unitKey)return undefined
  const values=[...matchingEvidenceValues<Outcome<T>>(archive,'guide-segment-unit-result-v1','unitKey',request.unitKey)].map(r=>r.value).filter((v):v is Outcome<T>&{accepted:true;value:T}=>v.unitKey===request.unitKey&&v.accepted===true).sort((a,b)=>b.retryOrdinal-a.retryOrdinal)
  for(const value of values){
    try{request.cacheValidation.validate(value.value);if(hash(request.read(structuredClone(value.raw)))!==hash(value.value))continue;return structuredClone(value.value)}catch{/* Never reuse a result rejected by the current reader. */}
  }
  return undefined
}
/** Independent readers retain every accepted sibling and every rejected raw
 * response. Scheduling/retry and checkpointing remain caller responsibilities. */
export async function callGuideSegmentBatch<T>(requests:GuideSegmentRequest<T>[],options:{stage:string;reserveCalls:number;call:GuideSegmentCaller;archive:Pick<AiEvidenceArchive,'saveValue'>}):Promise<GuideSegmentBatch<T>>{
  const prepared=prepareGuideSegmentBatch(requests,options)
  const result=await options.call(prepared.request)
  prepared.validate(result)
  for(const outcome of result.outcomes){
    const record={stage:options.stage,batchHash:result.batchHash,...outcome}
    options.archive.saveValue('guide-segment-unit-result-v1',hash(record),record)
  }
  return structuredClone(result)
}
