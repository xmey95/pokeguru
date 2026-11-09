import type {guideReplyRequirementView} from './guide-reply-requirements'
import type {GuideSegmentFinding} from './guide-segment-review'

export type GuideConstructionRequirementContext=ReturnType<typeof guideReplyRequirementView>&{
 witnesses:{lineId:string;reviewedHash:string;turnNumbers:number[]}[]
}
export interface GuideRequirementResolution {
 caseId:string;requirementId:string;disposition:'resolved'|'superseded'|'still-open';reason:string;sourceIds:string[];
 witnesses:{lineId:string;reviewedHash:string;turnNumbers:number[]}[];currentFindingIndex:number|null
}
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
export const guideRequirementReviewInstructions=' Verifica inoltre OGNI obbligo originale in constructionRequirements, anche se non è assegnato o la sua variante è stata sostituita. requirementAudit deve riportare esattamente una voce per coppia caseId/requirementId: resolved solo con riferimenti ai turni dei testimoni correnti e fonti che dimostrano la copertura semantica; superseded solo motivando dalle fonti e dalle condizioni perché la richiesta originale era infondata o non più pertinente; still-open con indice del finding azionabile per lo stesso caso. Le assegnazioni sono intenzioni, non prove. Un ramo può dimostrare più obblighi realmente equivalenti; un requisito non assegnato non implica automaticamente un ramo mancante. Non ritirare un obbligo per risparmiare spazio o chiamate e non dedurre che sia risolto dalla sola validità meccanica. Nessun pass con obblighi ancora aperti.'

export function guideRequirementAuditSchema(contexts:GuideConstructionRequirementContext[],sourceIds:string[]){
 const count=contexts.reduce((n,c)=>n+c.ledger.requirements.length,0)
 return {type:'array',minItems:count,maxItems:count,items:{anyOf:contexts.flatMap(c=>c.ledger.requirements.map(r=>object({
  caseId:{type:'string',const:c.ledger.caseId},requirementId:{type:'string',const:r.id},
  disposition:{type:'string',enum:['resolved','superseded','still-open']},reason:{type:'string',minLength:1,maxLength:4000,pattern:'\\S'},
  sourceIds:{type:'array',minItems:1,maxItems:200,items:{type:'string',enum:sourceIds}},
  witnesses:{type:'array',maxItems:c.witnesses.length,items:{anyOf:c.witnesses.map(w=>object({lineId:{type:'string',const:w.lineId},reviewedHash:{type:'string',const:w.reviewedHash},turnNumbers:{type:'array',minItems:1,maxItems:w.turnNumbers.length,items:{type:'integer',enum:w.turnNumbers}}}))}},
  currentFindingIndex:{anyOf:[{type:'integer',minimum:0,maximum:49},{type:'null'}]}
 })))}}
}
/** Structural completeness and exact current proof references. The independent
 * critic, not the host's assignment bookkeeping, judges tactical equivalence. */
export function assertGuideRequirementResolutions(audit:GuideRequirementResolution[],contexts:GuideConstructionRequirementContext[],findings:GuideSegmentFinding[]):void{
 const expected=contexts.flatMap(c=>c.ledger.requirements.map(r=>c.ledger.caseId+'/'+r.id)),keys=audit.map(a=>a.caseId+'/'+a.requirementId)
 if(keys.length!==expected.length||new Set(keys).size!==expected.length||keys.some(k=>!expected.includes(k)))throw new Error('Critica: audit degli obblighi originali incompleto, duplicato o estraneo.')
 for(const item of audit){
  const context=contexts.find(c=>c.ledger.caseId===item.caseId)!
  if(!item.reason.trim()||!item.sourceIds.length||new Set(item.sourceIds).size!==item.sourceIds.length)throw new Error('Critica: motivazione o fonti dell’obbligo mancanti.')
  if(new Set(item.witnesses.map(w=>w.lineId)).size!==item.witnesses.length)throw new Error('Critica: testimoni duplicati nell’audit dell’obbligo.')
  for(const proof of item.witnesses){const actual=context.witnesses.find(w=>w.lineId===proof.lineId);if(!actual||actual.reviewedHash!==proof.reviewedHash||!proof.turnNumbers.length||new Set(proof.turnNumbers).size!==proof.turnNumbers.length||proof.turnNumbers.some(n=>!actual.turnNumbers.includes(n)))throw new Error('Critica: testimone dell’obbligo estraneo o superato.')}
  if(item.disposition==='resolved'&&!item.witnesses.length)throw new Error('Critica: obbligo risolto senza testimone corrente.')
  if(item.disposition==='still-open'){
   const finding=item.currentFindingIndex===null?undefined:findings[item.currentFindingIndex]
   if(!finding||finding.repair.kind==='text'||finding.repair.caseId!==item.caseId)throw new Error('Critica: obbligo ancora aperto senza finding azionabile nello stesso caso.')
  }else if(item.currentFindingIndex!==null)throw new Error('Critica: obbligo risolto/superato con finding ancora aperto.')
 }
}
