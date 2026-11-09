import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideHash} from './matchup-guide-packet'
import {readGuideReplyObligationOrigins,type GuideObligationOrigin,type GuideReplyObligationOrigins} from './guide-obligation-origins'
import {readGuideWitnessLibrary,type GuideWitnessLibrary} from './guide-witness-library'
import {GuideAtomicReviewContext} from './guide-atomic-requests'
import {guideAtomicRegistryContext} from './guide-atomic-binding'
import {ProofRegistry,digest,type Original,type Context} from './guide-obligation-registry'
import type {GuideReplyPlan} from './guide-reply-plan'
import type {GuideSegmentJournal} from './guide-segments'
import type {GuideConstructionRuntime} from './guide-reply-phase'

const birthRole='guide-obligation-original-birth-v1'
export interface GuideOriginProducerBinding {
  role:'guide-segment-unit-result-v1';key:string;objectHash:string;pointer:string;unitId:string;unitKey:string;retryOrdinal:number;rawHash:string;valueHash:string
}
export interface GuideObligationInputOriginal {
  legacyId:string;id:string;original:Original;occurrences:GuideObligationOrigin['occurrences'];producers:GuideOriginProducerBinding[];
  birth:{key:string;value:{version:1;scopeHash:string;rootHash:string;nativePacketHash:string;legacyId:string;original:Original}}
}
export interface GuideObligationInput {
  version:1;scope:GuideConstructionRuntime['scope'];caseId:string;packetHash:string;rootHash:string;mainHash:string;planHash:string;constructionHash:string;
  context:Context;atomic:GuideAtomicReviewContext;provenance:GuideReplyObligationOrigins;library:GuideWitnessLibrary;origins:GuideObligationInputOriginal[];
  coverage:{replyOrigins:true;producerUnitBindings:true;guideInvariants:false;criticalFindings:false;wholeGuideMigration:false}
}
const verifiedInputs=new WeakSet<object>()
const verifiedPools=new WeakSet<object>()
export interface GuideStoredOriginalPool {scopeHash:string;rootHash:string;nativePacketHash:string;origins:GuideObligationInputOriginal[]}
export function isVerifiedGuideStoredOriginalPool(pool:GuideStoredOriginalPool){return verifiedPools.has(pool)}
export function isVerifiedGuideObligationInput(input:GuideObligationInput){return verifiedInputs.has(input)}
function freeze(value:any):void{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value)}}
function fail(message:string):never{throw new Error('Ingressi obblighi: '+message)}
type Runtime=Pick<GuideConstructionRuntime,'scope'|'packet'|'evidencePacket'|'evidenceAnchor'|'archive'>

/** Read the durable births of this case/root, even when the newest plan no
 * longer mentions an older pending AI request. No approval is imported. */
export function readGuideStoredOriginalPool(input:GuideObligationInput,archive:Runtime['archive']):GuideStoredOriginalPool{
  if(!isVerifiedGuideObligationInput(input)||archive.id!==input.scope.jobId||archive.projectId!==input.scope.projectId)fail('pool di un altro ingresso.')
  const sql=archive as Runtime['archive']&Partial<Pick<AiEvidenceArchive,'withReadSnapshot'>>
  if(!sql.withReadSnapshot)fail('snapshot del pool mancante.')
  return sql.withReadSnapshot(()=>readStoredOriginalPool(input,archive))
}
function readStoredOriginalPool(input:GuideObligationInput,archive:Runtime['archive']):GuideStoredOriginalPool{
  const scope={...input.scope,caseId:input.caseId},scopeHash=digest(scope),births=[...archive.values<GuideObligationInputOriginal['birth']['value']>(birthRole)]
    .filter(r=>r.value.scopeHash===scopeHash&&r.value.rootHash===input.rootHash&&r.value.nativePacketHash===input.packetHash)
  const targets=new Map<string,GuideOriginProducerBinding[]>(births.map(b=>[b.value.original.rawJson,[]]))
  for(const row of archive.values<any>('guide-segment-unit-result-v1')){
    if(row.key!==guideHash(row.value))fail('unità del pool alterata.')
    if(row.value.accepted!==true)continue
    const outcome=row.value
    const base={role:'guide-segment-unit-result-v1' as const,key:row.key,objectHash:row.key,unitId:outcome.unitId,unitKey:outcome.unitKey,retryOrdinal:outcome.retryOrdinal,rawHash:guideHash(outcome.raw),valueHash:guideHash(outcome.value)}
    const visit=(value:any,pointer:string)=>{if(!value||typeof value!=='object')return;if(typeof value.goal==='string'&&Array.isArray(value.sourceIds))targets.get(JSON.stringify(value))?.push({...base,pointer});for(const [key,child]of Object.entries(value))visit(child,pointer+'/'+key.replaceAll('~','~0').replaceAll('/','~1'))}
    visit(outcome.value,'/value')
  }
  const registry=new ProofRegistry(scope,input.context,{mechanics:[],reviews:[]})
  const origins=births.map(({key,value})=>{
    const original=value.original,producers=targets.get(original.rawJson)!.sort((a,b)=>guideHash(a).localeCompare(guideHash(b)))
    if(key!==guideHash({scope,rootHash:input.rootHash,nativePacketHash:input.packetHash,legacyId:value.legacyId})||value.version!==1||guideHash({origin:original.origin,rawJson:original.rawJson})!==value.legacyId||!producers.length||!Array.isArray(original.producerRequestIds)||!original.producerRequestId||!original.producerRequestIds.includes(original.producerRequestId)||original.producerRequestIds.some(id=>!producers.some(p=>p.unitId===id)))fail('nascita conservata o produttore mancante.')
    registry.append({type:'original',value:original})
    // Reuse the exact body path in the accepted child as the occurrence proof.
    const occurrences=producers.map(p=>({role:p.role,key:p.key,objectHash:p.objectHash,pointer:p.pointer}))
    return {legacyId:value.legacyId,id:registry.originalId(original),original,producers,occurrences,birth:{key,value}}
  })
  const result={scopeHash,rootHash:input.rootHash,nativePacketHash:input.packetHash,origins};freeze(result);verifiedPools.add(result);return result
}

/** Pure, coherent source import. Producer aliases cover EVERY accepted child
 * carrying the exact whole original, including inherited copies. This is not
 * a claim of sole authorship, semantic equivalence or AI approval. */
export function prepareGuideReplyObligationInput(main:GuideSegmentJournal,plan:GuideReplyPlan,options:Runtime):GuideObligationInput{
  const archive=options.archive as Runtime['archive']&Partial<Pick<AiEvidenceArchive,'withReadSnapshot'>>
  if(!archive.withReadSnapshot||archive.id!==options.scope.jobId||archive.projectId!==options.scope.projectId)fail('archivio o snapshot estraneo.')
  return archive.withReadSnapshot(()=>{
    const provenance=readGuideReplyObligationOrigins(main,plan,options as GuideConstructionRuntime),library=readGuideWitnessLibrary(main,options),atomic=new GuideAtomicReviewContext(library,options)
    const scope={...options.scope,caseId:main.setup.id},scopeHash=digest(scope)
    const context=guideAtomicRegistryContext({caseId:main.setup.id,rootHash:library.rootHash,nativePacketHash:library.packetHash,contextHash:atomic.contextHash,...atomic.environment},provenance.mainHash)
    const registry=new ProofRegistry(scope,context,{mechanics:[],reviews:[]})
    const targets=new Map<string,GuideOriginProducerBinding[]>(provenance.origins.map(o=>[o.rawJson,[]]))
    for(const row of archive.values<any>('guide-segment-unit-result-v1')){
      const outcome=row.value
      if(row.key!==guideHash(outcome))fail('unità produttrice alterata.')
      if(outcome.accepted!==true)continue
      if(typeof outcome.unitId!=='string'||!outcome.unitId||typeof outcome.unitKey!=='string'||!outcome.unitKey||!Number.isSafeInteger(outcome.retryOrdinal)||outcome.retryOrdinal<0)fail('identità produttrice mancante.')
      const base={role:'guide-segment-unit-result-v1' as const,key:row.key,objectHash:guideHash(outcome),unitId:outcome.unitId,unitKey:outcome.unitKey,retryOrdinal:outcome.retryOrdinal,rawHash:guideHash(outcome.raw),valueHash:guideHash(outcome.value)}
      const visit=(value:any,pointer:string)=>{
        if(!value||typeof value!=='object')return
        if(typeof value.goal==='string'&&Array.isArray(value.sourceIds))targets.get(JSON.stringify(value))?.push({...base,pointer})
        for(const [key,child]of Object.entries(value))visit(child,pointer+'/'+key.replaceAll('~','~0').replaceAll('/','~1'))
      }
      visit(outcome.value,'/value')
    }
    const origins=provenance.origins.map(origin=>{
      const producers=targets.get(origin.rawJson)!.sort((a,b)=>guideHash(a).localeCompare(guideHash(b))),aliases=[...new Set(producers.map(p=>p.unitId))].sort()
      if(!aliases.length)fail('originale senza unità AI accettata che ne conservi il corpo esatto.')
      const key=guideHash({scope,rootHash:library.rootHash,nativePacketHash:library.packetHash,legacyId:origin.id})
      const expected={version:1 as const,scopeHash,rootHash:library.rootHash,nativePacketHash:library.packetHash,legacyId:origin.id}
      const saved=archive.value<GuideObligationInputOriginal['birth']['value']>(birthRole,key)
      const original:Original=saved?.original??{origin:origin.origin,rawJson:origin.rawJson,producerRequestId:aliases[0],producerRequestIds:aliases,sourceIds:[...origin.sourceIds]}
      if(Object.keys(original).sort().join('|')!=='origin|producerRequestId|producerRequestIds|rawJson|sourceIds'||original.origin!==origin.origin||original.rawJson!==origin.rawJson||guideHash(original.sourceIds)!==guideHash(origin.sourceIds)||!original.producerRequestId||!Array.isArray(original.producerRequestIds)||new Set(original.producerRequestIds).size!==original.producerRequestIds.length||!original.producerRequestIds.includes(original.producerRequestId)||original.producerRequestIds.some(id=>!aliases.includes(id))||saved&&guideHash(saved)!==guideHash({...expected,original}))fail('nascita dell’originale alterata o produttore storico mancante.')
      return {legacyId:origin.id,id:registry.originalId(original),original,occurrences:origin.occurrences,producers,birth:{key,value:{...expected,original}}}
    })
    const result:GuideObligationInput={version:1,scope:structuredClone(options.scope),caseId:main.setup.id,packetHash:provenance.packetHash,rootHash:provenance.rootHash,mainHash:provenance.mainHash,planHash:provenance.planHash,constructionHash:provenance.constructionHash,
      context,atomic,provenance,library,origins,coverage:{replyOrigins:true,producerUnitBindings:true,guideInvariants:false,criticalFindings:false,wholeGuideMigration:false}}
    freeze(result);verifiedInputs.add(result);return result
  })
}

/** A separate explicit host step; readers never mutate the archive. Births
 * pin original identities, and later carrying aliases only strengthen the
 * independence checks without duplicating or replacing the original body. */
export function adoptGuideObligationInput(input:GuideObligationInput,registry:ProofRegistry,archive:Runtime['archive']):void{
  if(!isVerifiedGuideObligationInput(input)||archive.id!==input.scope.jobId||archive.projectId!==input.scope.projectId||registry.scopeHash!==digest({...input.scope,caseId:input.caseId})||registry.contextHash!==digest(input.context))fail('ingresso non verificato o registro estraneo.')
  const owner=archive as Runtime['archive']&Partial<Pick<AiEvidenceArchive,'saveValues'>>
  if(!owner.saveValues)fail('salvataggio atomico mancante.')
  owner.saveValues(input.origins.map(o=>({role:birthRole,key:o.birth.key,value:o.birth.value})))
  const known=new Set(registry.audit().originals.map(o=>o.id))
  for(const origin of input.origins){
    if(!known.has(origin.id))registry.append({type:'original',value:origin.original})
    const current=new Set(registry.originalProducerIds(origin.id)),additional=[...new Set(origin.producers.map(p=>p.unitId))].filter(id=>!current.has(id)).sort()
    if(additional.length)registry.append({type:'original-producers',originalId:origin.id,requestIds:additional})
  }
}
