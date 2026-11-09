import {matchingEvidenceValues} from './ai-evidence-selection'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
import {readAcceptedGuideTransport} from './guide-transport-evidence'
export interface FiniteUnitRef {unitId:string;outcomeKey:string}
export async function runFiniteUnit<T>(id:string,stage:string,make:()=>GuideSegmentRequest<T>,options:GuideConstructionRuntime):Promise<{value:T;ref:FiniteUnitRef}>{
 let value:T|undefined
 await runGuideSegmentPhase([{id,request:make,accept:v=>{value=v}}],{...options,stage})
 const request=options.prepareRequest!(make()),unitId=guideSegmentUnitIdentity(request).unitId,row=[...matchingEvidenceValues<any>(options.archive,'guide-segment-unit-result-v1','unitId',unitId)].find(r=>r.value.unitId===unitId&&r.value.accepted)
 if(!row||value===undefined)throw Error('Costruzione finita: originale accettato mancante.')
 readAcceptedGuideTransport(request,row,options.archive)
 return {value,ref:{unitId,outcomeKey:row.key}}
}
