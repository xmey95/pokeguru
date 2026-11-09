import {guideHash,type GuidePacket} from './matchup-guide-packet'
import {collectGuideAuditCandidates} from '../shared/guide-ledger-projection'
import {guideAuditAt} from '../shared/guide-audit-candidates'
import {auditQuantityContext,auditDecisionWindows,auditPromotionWindows} from './guide-audit-quantities'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {assertFiniteTransportHistory} from './guide-finite-runtime'
import {auditAnchor,assertAuditLanguagePass} from './guide-audit-language-driver'
import {reviewAuditLanguage,type AuditLanguageTarget,type AuditLanguageReviewRef} from './guide-audit-language-review'
import {auditContextFacts,quantifiedAuditPatch} from './guide-audit-repair'
import {auditPositionFacts,auditPositionEvidenceMatches} from './guide-audit-position-facts'
import {AiFailure} from './ai-failure'

function knownLanguagePasses(archive:GuideConstructionRuntime['archive']){
 return [...archive.values<any>('guide-audit-language-pass-v1')].map(r=>{
  const v=r.value
  if(r.key!==guideHash(v)||v.version!==1)throw Error('Audit semantico: ricevuta del riesame alterata.')
  const review=assertAuditLanguagePass(v.ref,v.targets,v.context,{archive});if(guideHash(review.data.scope)!==v.scopeHash)throw Error('Audit semantico: ricevuta del riesame alterata.');if(guideHash(review.data.contextFacts)!==guideHash(v.contextFacts))throw Error('Audit semantico: fatti di contesto alterati.');return v
 })
}
function oldCertificates(archive:GuideConstructionRuntime['archive']){return [...archive.values<any>('guide-native-audit-repair-v1')].filter(r=>r.value.quantityVersion===1&&r.value.auditProtocol!==3).flatMap(r=>{
 if(r.key!==guideHash(r.value))throw Error('Audit quantitativo: certificato alterato.')
 const actual=r.value.refs.flatMap((ref:any)=>{const d=archive.value<any>('guide-finite-request-v1',ref.unitId),source=archive.value<any>('guide-segment-unit-result-v1',ref.outcomeKey);if(!source?.accepted||ref.outcomeKey!==guideHash(source)||source.unitId!==ref.unitId||d?.request.validationId!=='guide-finite-audit-2'||d.request.data.sourceHash!==r.value.sourceHash)throw Error('Audit quantitativo: certificato senza fonte originale.');return quantifiedAuditPatch(d.request.data,source.raw,2).certificates})
 if(guideHash(actual)!==guideHash(r.value.certified))throw Error('Audit quantitativo: certificato diverso dagli originali.');return actual
})}
function fieldTarget(native:any,location:any,path:any[],text:string,context:any,allowedWindows:string[],maximum:number):AuditLanguageTarget{return {id:JSON.stringify(path),text,parts:[{text,quantity:null,measureId:null,card:null}],allowedWindows,maximum,anchorHash:auditAnchor(native,location.path)}}
function languageFields(native:any,location:any,context:any){
 const body=guideAuditAt(native,location.path),out=[{certificatePath:[...location.path,'tactical'],certificateValue:body.tactical,target:fieldTarget(native,location,[...location.path,'tactical','comparison'],body.tactical.comparison,context,context.windows.map((w:any)=>w.id),1600)}]
 for(const [i,p]of (body.tactical.promotions??[]).entries())out.push({certificatePath:[...location.path,'tactical'],certificateValue:body.tactical,target:fieldTarget(native,location,[...location.path,'tactical','promotions',i,'reason'],p.reason,context,auditPromotionWindows(context,native,p.side),600)})
 for(const path of location.events){const proof=guideAuditAt(native,path).decisionProof;if(proof)out.push({certificatePath:[...path,'decisionProof'],certificateValue:proof,target:fieldTarget(native,location,[...path,'decisionProof','reason'],proof.reason,context,auditDecisionWindows(context,path),1000)})}
 return out
}
function supported(field:ReturnType<typeof languageFields>[number],context:any,passes:any[],certificates:any[],positions:any[]=[]){
 const hash=guideHash(context),t=field.target
 return certificates.some(c=>c.target===JSON.stringify(field.certificatePath)&&c.valueHash===guideHash(field.certificateValue)&&c.contextHash===hash)||passes.some(p=>guideHash(p.context)===hash&&auditPositionEvidenceMatches(p.contextFacts,positions)&&p.targets.some((old:any)=>old.id===t.id&&old.text===t.text&&old.anchorHash===t.anchorHash&&guideHash(old.allowedWindows)===guideHash(t.allowedWindows)))
}

/** Count-only validation after a native-case transaction. The patch remains
 * original and provisional until every changed audit has an actual review. */
export function pendingFiniteAuditGroups(natives:any[],o:GuideConstructionRuntime,premiseText=false,positionEvidence=false){
 const passes=knownLanguagePasses(o.archive),certificates=oldCertificates(o.archive),groups:any[]=[]
 for(const native of natives){const turns=Object.keys(native.turns).length as 1|2|3,facts=collectGuideAuditCandidates(native,o.packet,{kind:'prefix',turns},true)
  for(const location of facts.locations){const context=auditQuantityContext(native,o.packet,facts,location),positions=auditPositionFacts(native,location.path,location),targets=languageFields(native,location,context).filter(f=>!supported(f,context,passes,certificates,positions)).map(f=>f.target)
   if(targets.length){const group=facts.groups.find(g=>g.lineId===location.lineId&&g.turn===location.turn&&g.side===location.side)!,data={native,locationPath:location.path,group,auditCards:group.cards.map(c=>c.printId),auditAttacks:group.attacks,promotions:group.promotions.flatMap(p=>p.printIds.map(printId=>({side:p.side,printId})))};if(premiseText&&turns!==1)throw Error('Ricertificazione narrativa fuori dalla premessa.');groups.push({targets,context,facts:[...auditContextFacts(data),...positionEvidence?positions:[]],...premiseText?{deliveryAuditKey:native.id+'/'+(location.lineId==='setup'?'setup':'main')+'/'+[location.lineId,location.turn,location.side].join('|')}:{}})}
  }
 }
 return groups
}
const rejectedReviews=new WeakMap<object,AuditLanguageReviewRef>()
export function rejectedFiniteAuditReview(error:unknown):AuditLanguageReviewRef|undefined{return error!==null&&typeof error==='object'?rejectedReviews.get(error):undefined}
export async function certifyFiniteAuditCounts(natives:any[],o:GuideConstructionRuntime,premiseText=false,positionEvidence=false){
 const groups=pendingFiniteAuditGroups(natives,o,premiseText,positionEvidence)
 for(const [i,g]of groups.entries()){
  const review=await reviewAuditLanguage(g.targets,g.context,g.facts,{...o,...g.deliveryAuditKey?{deliveryAuditKey:g.deliveryAuditKey}:{}},o.reserveOutside+groups.length-i-1)
  if(review.value.verdict!=='pass'){
   const error=new AiFailure('draft-limit','La correzione dei casi non supera il riesame quantitativo indipendente; nessun candidato approvato.')
   rejectedReviews.set(error,structuredClone(review.ref));throw error
  }
 }
}

/** Full-case repairs have native strings for historical compatibility. They
 * still cannot bypass the quantitative protocol used to construct those strings.
 * The original AI patch is retained; unsupported counts are a local rejection. */
export function assertFiniteAuditCounts(native:any,packet:GuidePacket,archive:GuideConstructionRuntime['archive']){
 return assertFiniteAuditCountsMany([native],packet,archive)
}
/** One synchronous validation transaction. Every original is authenticated on
 * this invocation, then shared only while checking these supplied lines.
 * No state survives this function, a write, an await or another reopening. */
export function assertFiniteAuditCountsMany(natives:any[],packet:GuidePacket,archive:GuideConstructionRuntime['archive']){
 if(!Array.isArray(natives)||!natives.length)throw Error('Audit quantitativo: linee da verificare mancanti.')
 const policies=[...archive.values<any>('guide-audit-count-policy-v1')]
 if(policies.length!==1||policies[0].key!==guideHash(policies[0].value))throw Error('Audit quantitativo: politica mancante o alterata nel gate completo.')
 if(policies[0].value.mode==='legacy-read')return
 if(policies[0].value.mode!=='quantified'||policies[0].value.legacyRefs.length)throw Error('Audit quantitativo: downgrade nel gate completo.')
 assertFiniteTransportHistory(archive)
 const passes=knownLanguagePasses(archive),certificates=oldCertificates(archive)
 for(const native of natives){
  const turns=Object.keys(native.turns??{}).length
  if(![1,2,3].includes(turns))throw Error('Audit quantitativo: prefisso completo mancante.')
  const facts=collectGuideAuditCandidates(native,packet,{kind:'prefix',turns:turns as 1|2|3},true)
  for(const location of facts.locations){
   const context=auditQuantityContext(native,packet,facts,location)
   for(const field of languageFields(native,location,context))if(!supported(field,context,passes,certificates,auditPositionFacts(native,location.path,location)))throw Error('Audit semantico: riesame quantitativo mancante per '+field.target.id)
  }
 }
}
