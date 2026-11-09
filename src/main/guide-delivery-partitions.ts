import {guideHash} from './matchup-guide-packet'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {AuditLanguageTarget} from './guide-audit-language-review'
import {AiFailure} from './ai-failure'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
const initialRole='guide-delivery-audit-partition-v1',refineRole='guide-delivery-audit-refinement-v1'
type Runtime=Pick<GuideConstructionRuntime,'archive'|'scope'>
/** Pure replay of bounded refinements from actual archived output-limit
 * failures. A model or a fabricated observation cannot renew the partition. */
export function readDeliveryPartitions(fullHash:string,targets:AuditLanguageTarget[],o:Runtime):string[][]|undefined{
 const first=o.archive.value<any>(initialRole,fullHash);if(!first)return undefined
 if(first.version!==1||first.fullHash!==fullHash||first.scopeHash!==guideHash(o.scope)||first.targetsHash!==guideHash(targets))throw Error('Partizione iniziale alterata.')
 let groups:string[][]=first.groups;const used=new Set<string>()
 const rows=[...o.archive.values<any>(refineRole)].filter(r=>r.value.fullHash===fullHash)
 for(let step=0;step<4;step++){
  const next=rows.filter(r=>r.value.beforeHash===guideHash(groups))
  if(next.length>1)throw Error('Partizione con successori ambigui.');if(!next.length)break
  const row=next[0],r=row.value;if(used.has(row.key)||row.key!==guideHash(r)||r.scopeHash!==guideHash(o.scope))throw Error('Raffinamento alterato o ciclico.')
  const start=o.archive.value<any>('guide-attempt-start',r.failureSequence),end=o.archive.value<any>('guide-attempt-end',r.failureSequence),failure=o.archive.value<any>('guide-attempt-failure',r.failureSequence),data=start&&o.archive.value<any>('guide-call-data',start.inputHash)?.data,descriptor=o.archive.value<any>('guide-finite-request-v1',r.unitId),request=descriptor?.request
  if(!start||end?.status!=='failed'||failure?.code!=='output-limit'||!data?.units?.some((u:any)=>u.unitId===r.unitId&&guideHash(u.data)===guideHash(request?.data))||request?.role!=='critic'||request?.validationId!=='guide-finite-audit-language-4'||descriptor.scopeHash!==guideHash(o.scope)||guideSegmentUnitIdentity({...request,cacheValidation:{id:request.validationId}} as any).unitId!==r.unitId||guideHash(request.data.targets.map(({key:_key,spans:_spans,contextHash:_hash,...t}:any)=>t))!==guideHash(groups[r.index].map(id=>targets.find(t=>t.id===id))))throw Error('Riduzione senza un errore di output autentico dello stesso gruppo.')
  const old=groups[r.index];if(!old||old.length<2||groups.length>=4)throw Error('Atomo o massimo di partizioni superato.')
  const cut=Math.ceil(old.length/2),expected=[...groups.slice(0,r.index),old.slice(0,cut),old.slice(cut),...groups.slice(r.index+1)]
  if(guideHash(r.groups)!==guideHash(expected))throw Error('Riduzione diversa dalla partizione senza perdita.')
  groups=expected;used.add(row.key)
 }
 if(used.size!==rows.length)throw Error('Raffinamento orfano.')
 const flat=groups.flat();if(groups.length>4||groups.some(g=>!g.length)||flat.length!==targets.length||new Set(flat).size!==flat.length||targets.some(t=>!flat.includes(t.id)))throw Error('Copertura della partizione incompleta.')
 return groups
}
export function freezeDeliveryPartitions(fullHash:string,targets:AuditLanguageTarget[],groups:string[][],o:Runtime){
 o.archive.saveValue(initialRole,fullHash,{version:1,fullHash,scopeHash:guideHash(o.scope),targetsHash:guideHash(targets),groups})
 return readDeliveryPartitions(fullHash,targets,o)!
}
export function refineDeliveryPartitions(fullHash:string,targets:AuditLanguageTarget[],groups:string[][],index:number,unitId:string,o:Runtime){
 const old=groups[index];if(!old||old.length<2||groups.length>=4)throw new AiFailure('draft-limit','Output troppo grande per un atomo o per le quattro partizioni ammesse; nessun dato eliminato.')
 const failed=[...o.archive.values<any>('guide-attempt-failure')].filter(r=>r.value.code==='output-limit'&&(()=>{const start=o.archive.value<any>('guide-attempt-start',r.key);return start&&o.archive.value<any>('guide-call-data',start.inputHash)?.data?.units?.some((u:any)=>u.unitId===unitId)})()).sort((a,b)=>Number(b.key)-Number(a.key))[0]
 if(!failed)throw Error('Errore di output privo di ricevuta durevole.')
 const cut=Math.ceil(old.length/2),next=[...groups.slice(0,index),old.slice(0,cut),old.slice(cut),...groups.slice(index+1)],record={version:1,fullHash,scopeHash:guideHash(o.scope),beforeHash:guideHash(groups),index,unitId,failureSequence:failed.key,groups:next}
 o.archive.saveValue(refineRole,guideHash(record),record);return readDeliveryPartitions(fullHash,targets,o)!
}
