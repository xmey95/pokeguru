import {matchingEvidenceValues} from './ai-evidence-selection'
import {guideHash} from './matchup-guide-packet'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
import type {GuideSegmentRequest} from './guide-segment-generation'
import type {GuideConstructionRuntime} from './guide-reply-phase'
export interface GuideTransportSnapshot {
  stage:string;role:'constructor'|'critic';instructions:string;task:string;data:unknown;schema:object;validationId:string;unitKey:string;retryOrdinal:number
}
export interface GuideTransportRow {key:string;value:any}
/** Transport writer validation, before committing the child. This does not
 * attest that an arbitrary caller obtained it from a provider. */
export function validateGuideTransportOutcome<T>(request:GuideSegmentRequest<T>,row:GuideTransportRow):void{
  const actual=row.value,identity=guideSegmentUnitIdentity(request)
  if(row.key!==guideHash(actual)||actual.unitId!==identity.unitId||actual.unitKey!==identity.unitKey||actual.retryOrdinal!==identity.retryOrdinal||typeof actual.stage!=='string'||typeof actual.batchHash!=='string')throw Error('Trasporto: figlio di un altro descrittore.')
  if(actual.accepted===true){
    const value=request.read(actual.raw);request.cacheValidation.validate(actual.value)
    if(guideHash(value)!==guideHash(actual.value))throw Error('Trasporto: valore diverso dalla risposta grezza.')
  }else if(actual.accepted===false){
    let rejected=false;try{request.read(actual.raw)}catch{rejected=true}
    if(!rejected||typeof actual.message!=='string'||!actual.message.trim())throw Error('Trasporto: rifiuto senza errore attuale verificabile.')
  }else throw Error('Trasporto: esito senza accettazione esplicita.')
}
export function guideTransportSnapshot(request:GuideSegmentRequest<any>):GuideTransportSnapshot{
  if(!request.unitKey)throw Error('Trasporto: unitKey mancante.')
  return structuredClone({stage:request.stage,role:request.role,instructions:request.instructions,task:request.task,data:request.data,schema:request.schema,validationId:request.cacheValidation.id,unitKey:request.unitKey,retryOrdinal:request.retryOrdinal??0})
}
/** The bare descriptor is rebuilt from the current local contract without a
 * retry archive. Only previously rejected raw feedback can extend its data. */
export function restoreGuideTransportRequest<T>(base:GuideSegmentRequest<T>,saved:GuideTransportSnapshot,archive:GuideConstructionRuntime['archive']):GuideSegmentRequest<T>{
  const {previousInvalid,...data}=saved.data as Record<string,unknown>
  if(guideHash({...saved,data,retryOrdinal:0})!==guideHash(guideTransportSnapshot(base))||!Number.isSafeInteger(saved.retryOrdinal)||saved.retryOrdinal<0)throw Error('Trasporto: descrittore estraneo o alterato.')
  if(!saved.retryOrdinal){if(previousInvalid!==undefined)throw Error('Trasporto: feedback iniziale estraneo.')}
  else{
    const rows=[...matchingEvidenceValues<any>(archive,'guide-segment-unit-result-v1','unitKey',base.unitKey!)].filter(r=>r.value.accepted===false&&r.value.unitKey===base.unitKey&&r.value.retryOrdinal===saved.retryOrdinal-1)
    if(!rows.length||rows.some(r=>r.key!==guideHash(r.value))||new Set(rows.map(r=>guideHash([r.value.unitId,r.value.raw,r.value.message]))).size!==1||!rows.some(r=>guideHash(previousInvalid)===guideHash({ordinal:saved.retryOrdinal,unitId:r.value.unitId,message:r.value.message,raw:r.value.raw})))throw Error('Trasporto: feedback del retry non autenticato.')
  }
  return {...base,data:structuredClone(saved.data),retryOrdinal:saved.retryOrdinal}
}
export function readAcceptedGuideTransport<T>(request:GuideSegmentRequest<T>,row:GuideTransportRow,archive:GuideConstructionRuntime['archive']):{unitId:string;value:T}{
  const actual=archive.value<any>('guide-segment-unit-result-v1',row.key),identity=guideSegmentUnitIdentity(request)
  if(!actual||row.key!==guideHash(actual)||guideHash(actual)!==guideHash(row.value)||actual.accepted!==true||actual.unitId!==identity.unitId||actual.unitKey!==identity.unitKey||actual.retryOrdinal!==identity.retryOrdinal)throw Error('Trasporto: risposta non autenticata per la richiesta.')
  const value=request.read(actual.raw);request.cacheValidation.validate(actual.value)
  if(guideHash(value)!==guideHash(actual.value))throw Error('Trasporto: risposta diversa dal valore verificato.')
  return {unitId:actual.unitId,value}
}
