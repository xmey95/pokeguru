import type {GuideSegmentRequest} from './guide-segment-generation'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {assertNativeScenarioSchema} from './guide-scenario-output-schema'
import {collectGuideAuditCandidates} from '../shared/guide-ledger-projection'
import {repairGuideNativeAudits} from './guide-audit-repair'
import {guideHash} from './matchup-guide-packet'
import {constructFiniteTurn} from './guide-finite-turn'
import {isGuideDelivery} from '../shared/guide-delivery'
import {guideDeliverySchema,deliveryDeclarationCapacity} from './guide-delivery-schema'

/** Native turn transport acceptance is a declaration, never a checkpoint.
 * The unchanged original reader runs after the audit-only finalizer. */
export function finiteAuditTurnRequest<T>(original:GuideSegmentRequest<T>,runtime:GuideConstructionRuntime,validateDeclaration=false):GuideSegmentRequest<T>{
  if(original.cacheValidation.id!=='guide-segment-declaration-2')return original
  const bounded=isGuideDelivery(runtime.packet.basis),data={...original.data as any};delete data.previousInvalid
  const phases=['ours','opponent','next'],prefix=data.prefix
  const reserveKeys=[...new Set([...(runtime.deliveryReserveKeys??[]),...bounded&&prefix&&!data.reply&&Object.keys(prefix.turns??{}).length===0?[prefix.id+'/premise']:[]])]
  const compose=(value:any)=>{
    const index=phases.indexOf(value.phase)
    if(index<0||!prefix||Object.keys(prefix.turns??{}).length!==index)throw Error('Audit turno: fase o prefisso estranei.')
    return {native:{...structuredClone(prefix),turns:{...structuredClone(prefix.turns??{}),[value.phase]:structuredClone(value.body)},developmentPlan:{...structuredClone(prefix.developmentPlan??{}),[value.phase]:structuredClone(value.development)}},mode:{kind:'prefix' as const,turns:(index+1) as 1|2|3}}
  }
  const read=(raw:any):T=>{assertNativeScenarioSchema(raw,original.schema);const {native,mode}=compose(raw);collectGuideAuditCandidates(native,runtime.packet,mode);return structuredClone(raw)}
  const prepareAudits=async(value:any,reserveCalls=original.reserveCalls)=>{
    const {native,mode}=compose(value),repaired=await repairGuideNativeAudits(native,mode,{...runtime,deliveryReserveKeys:reserveKeys,deliveryLineId:data.reply?.id??'main',reserveOutside:Math.max(original.reserveCalls,reserveCalls)})
    if(guideHash({...native,turns:{...native.turns,[value.phase]:repaired.turns[value.phase]}})!==guideHash(repaired))throw Error('Audit turno: tentativo di modificare il prefisso o lo sviluppo.')
    return {...value,body:repaired.turns[value.phase]}
  }
  const finalize=async(value:any,reserveCalls=original.reserveCalls)=>original.read(await prepareAudits(value,reserveCalls))
  if(bounded){
    const schema=guideDeliverySchema(original.schema,true),read=(raw:any):T=>{assertNativeScenarioSchema(raw,schema);deliveryDeclarationCapacity(raw);const {native,mode}=compose(raw);collectGuideAuditCandidates(native,runtime.packet,mode);if(validateDeclaration)original.validateDeclaration?.(raw);return structuredClone(raw)}
    return {...original,data,schema,deliveryFollowupKeys:reserveKeys,unitKey:undefined,retryOrdinal:undefined,...validateDeclaration?{task:original.task+' Verifica il contratto della replica già nella dichiarazione: previousDeclarationFailure conserva un originale precedente non conforme e il motivo autentico, non un’approvazione. Correggi quel requisito senza cambiare il prefisso.'}:{},instructions:guideFiniteInstructions('declaration')+'\nCONSEGNA LIMITATA: al massimo sei eventi complessivi. Non eliminare mosse necessarie per rientrare: segnala una posizione non costruibile.',read,finalize,minimumConstructCalls:1,reserveCalls:original.reserveCalls+1,cacheValidation:{id:validateDeclaration?'guide-delivery-turn-2':'guide-delivery-turn-1',validate:value=>{read(value)}}}
  }
  return {...original,data,unitKey:undefined,retryOrdinal:undefined,outputCapacity:{scope:runtime.scope,packetHash:guideHash(runtime.packet),kind:'guide-finite-turn-declaration-1'},instructions:guideFiniteInstructions('native'),cacheValidation:{id:'guide-finite-turn-declaration-1',validate:value=>{read(value)}},read,
    reserveCalls:original.reserveCalls+2,finalize,minimumConstructCalls:Object.keys(prefix?.turns??{}).length===2?4:3,
    construct:reserve=>constructFiniteTurn({...original,data},runtime,Math.max(original.reserveCalls,reserve-2),value=>{const {native,mode}=compose(value);collectGuideAuditCandidates(native,runtime.packet,mode)},prepareAudits,original.read)}
}
