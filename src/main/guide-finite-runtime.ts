import type {AiEvidenceArchive} from './ai-evidence-archive'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {withGuideSegmentRetry} from './guide-segment-generation'
import {guideHash} from './matchup-guide-packet'
import {guideSegmentUnitIdentity,guideSegmentAcceptedUnit} from './guide-segment-batch'
import {guideTransportSnapshot,validateGuideTransportOutcome,restoreGuideTransportRequest,readAcceptedGuideTransport,type GuideTransportSnapshot} from './guide-transport-evidence'
import {guideFiniteInstructions} from './guide-finite-instructions'
import {GUIDE_FINITE_ANALYSIS_CONTRACT} from '../shared/guide-analysis-scope'
import {AiFailure} from './ai-failure'
import {finiteAuditTurnRequest} from './guide-audit-turn'
import {isGuideDelivery} from '../shared/guide-delivery'
import {registerDeliveryUnit} from './guide-delivery-policy'

const requestRole='guide-finite-request-v1',receiptRole='guide-finite-outcome-v1',outcomeRole='guide-segment-unit-result-v1'
interface Descriptor{version:1;scopeHash:string;unitId:string;request:GuideTransportSnapshot}
interface Receipt{version:1;unitId:string;requestHash:string;outcomeKey:string;outcomeHash:string}
export interface FiniteTransportReadView {descriptors:ReadonlyMap<string,Descriptor>;outcomes:ReadonlyMap<string,{key:string;value:any}>}
/** Frozen user input is data, never an instruction to bypass a control. The
 * complete previous guide is needed only by the final revision critic. */
export function finiteUserContext(archive:GuideConstructionRuntime['archive'],final=false):unknown{
  const saved=archive.value<any>('guide-finite-user-context-v1','request')
  if(!saved)return undefined
  const identity=archive.value<any>('guide-segment-job-identity-v1','request')
  if(!identity||saved.request!==identity.request||saved.revision!==identity.revision||saved.parentGuideHash!==identity.parentGuideHash)throw Error('Contesto finito diverso dalla richiesta congelata del job.')
  return final?structuredClone(saved):{request:saved.request,revision:saved.revision}
}
/** Pure descriptor preparation; history can be deliberately excluded when
 * rebuilding the bare request for authenticated transport replay. */
export function prepareFiniteRequest<T>(original:GuideSegmentRequest<T>,options:Pick<GuideConstructionRuntime,'scope'|'archive'>,withHistory=true):GuideSegmentRequest<T>{
  const {unitKey:_key,retryOrdinal:_retry,outputCapacity:_capacity,...base}=original,data={...base.data as object} as any
  delete data.previousInvalid
  const finite=(base.cacheValidation.id.startsWith('guide-finite-')||base.cacheValidation.id.startsWith('guide-delivery-')||/^guide-premise-review-[345]$/.test(base.cacheValidation.id)),prefix=base.stage.startsWith('review-premise')
  const instructions=finite?base.instructions:prefix?guideFiniteInstructions('native')+'\nCRITICA INDIPENDENTE DEL SOLO PRIMO TURNO: esamina la premessa e le scelte già costruite. Non richiedere turni, repliche o capitoli futuri. Conserva controlinee eseguibili per le azioni alternative proposte e repairScope tipizzato; pass soltanto senza rilievi.':guideFiniteInstructions(base.role==='critic'?'review':'native')
  const userContext=finiteUserContext(options.archive,base.stage.startsWith('review-finite-final-'))
  const request=withGuideSegmentRetry({...base,instructions,data:{...data,finiteAnalysisContract:GUIDE_FINITE_ANALYSIS_CONTRACT,...userContext?{userContext}:{}}},options.scope,withHistory?options.archive:undefined)
  return original.outputCapacity?{...request,outputCapacity:original.outputCapacity}:request
}
/** Pure structural completeness of transport history, including rejected
 * children. Current readers must additionally revalidate every reused value. */
export function assertFiniteTransportHistory(archive:GuideConstructionRuntime['archive'],scope?:GuideConstructionRuntime['scope'],capture?:(view:FiniteTransportReadView)=>void){
  const descriptors=new Map([...archive.values<Descriptor>(requestRole)].map(row=>{
    const value=row.value,id=guideSegmentUnitIdentity({...value.request,cacheValidation:{id:value.request.validationId}} as any).unitId
    if(value.version!==1||row.key!==value.unitId||id!==value.unitId||scope&&value.scopeHash!==guideHash(scope))throw Error('Trasporto finito: descrittore alterato o scope estraneo.')
    return [row.key,value] as const
  }))
  const outcomes=new Map([...archive.values<any>(outcomeRole)].map(r=>[r.key,r])),receipted=new Set<string>()
  for(const row of archive.values<Receipt>(receiptRole)){
    const v=row.value,descriptor=descriptors.get(v.unitId),outcome=outcomes.get(v.outcomeKey)
    if(row.key!==guideHash(v)||v.version!==1||!descriptor||guideHash(descriptor)!==v.requestHash||!outcome||outcome.value.unitId!==v.unitId||guideHash(outcome.value)!==v.outcomeHash||outcome.key!==v.outcomeHash)throw Error('Trasporto finito: risposta conosciuta o descrittore mancante/alterato.')
    receipted.add(v.outcomeKey)
  }
  for(const row of outcomes.values())if(descriptors.has(row.value.unitId)&&!receipted.has(row.key))throw Error('Trasporto finito: esito senza ricevuta durevole.')
  // Invocation-local reuse only, after EVERY descriptor/outcome/receipt passed.
  // Never persist/cache this view across writes, async work or another reopen.
  capture?.({descriptors,outcomes})
  return {descriptors:descriptors.size,outcomes:receipted.size}
}
/** Reuse the original prompt for paid declarations with identical physical
 * inputs. New guidance applies only to unanswered units. Rejections retain the
 * same unitKey and retry history; no old response is reclassified as a pass. */
type DeclarationLocator={unitId:string;outcomeKey:string}
function declarationKey(s:GuideTransportSnapshot){return guideHash([s.stage,s.role,s.validationId,s.schema,s.data])}
function retainPaidDeclaration<T>(original:GuideSegmentRequest<T>,options:Pick<GuideConstructionRuntime,'scope'|'archive'>,locators:Map<string,DeclarationLocator[]>,stages:Set<string>):GuideSegmentRequest<T>{
 if(!['guide-finite-setup-turn-1','guide-delivery-turn-1','guide-delivery-turn-2'].includes(original.cacheValidation.id))return original
 // Fresh stages have no paid prompt to recover. Avoid cloning their entire
 // schema/context only to discover that there is no historical candidate.
 if(!stages.has(guideHash([original.stage,original.role,original.cacheValidation.id])))return original
 const desired=prepareFiniteRequest(original,options,false),key=declarationKey(guideTransportSnapshot(desired)),matches:GuideTransportSnapshot[]=[]
 for(const ref of locators.get(key)??[]){
  // Only small source locators survive asynchronous work. Re-read and
  // authenticate both originals on every use; no cached approval/read view.
  const d=options.archive.value<Descriptor>(requestRole,ref.unitId),outcome=options.archive.value<any>(outcomeRole,ref.outcomeKey),s=d?.request
  if(!d||!s||!outcome||guideHash(outcome)!==ref.outcomeKey||outcome.unitId!==ref.unitId||d.scopeHash!==guideHash(options.scope)||s.retryOrdinal!==0||declarationKey(s)!==key||guideSegmentUnitIdentity({...s,cacheValidation:{id:s.validationId}} as any).unitId!==ref.unitId)throw Error('Dichiarazione storica senza originali autentici.')
  matches.push(s)
 }
 if(new Set(matches.map(s=>guideHash([s.instructions,s.task]))).size>1)throw Error('Dichiarazione storica ambigua: istruzioni pagate differenti sugli stessi dati.')
 return matches.length?{...original,instructions:matches[0].instructions,task:matches[0].task}:original
}
/** Host wrapper around the existing budgeted caller/scheduler. It never starts
 * a provider itself, changes calibration or grants an approval. */
export function finiteGuideRuntime(options:GuideConstructionRuntime):GuideConstructionRuntime{
  if(options.packet.basis.analysisContract!==GUIDE_FINITE_ANALYSIS_CONTRACT||options.packet.basis.promptVersion!=='matchup-guide-28'||options.archive.id!==options.scope.jobId||options.archive.projectId!==options.scope.projectId)throw Error('Runtime finito: contratto o archivio estranei.')
  const declarationLocators=new Map<string,DeclarationLocator[]>()
  const declarationStages=new Set<string>()
  const locate=(d:Descriptor,outcomeKey:string)=>{
    if(d.request.retryOrdinal!==0||!['guide-finite-setup-turn-1','guide-delivery-turn-1','guide-delivery-turn-2'].includes(d.request.validationId))return
    declarationStages.add(guideHash([d.request.stage,d.request.role,d.request.validationId]))
    const key=declarationKey(d.request),refs=declarationLocators.get(key)??[]
    if(!refs.some(r=>r.unitId===d.unitId&&r.outcomeKey===outcomeKey))refs.push({unitId:d.unitId,outcomeKey})
    declarationLocators.set(key,refs)
  }
  assertFiniteTransportHistory(options.archive,options.scope,view=>{for(const row of view.outcomes.values()){const d=view.descriptors.get(row.value.unitId);if(d)locate(d,row.key)}})
  const sql=options.archive as AiEvidenceArchive
  if(typeof sql.saveValues!=='function')throw Error('Runtime finito: persistenza atomica assente.')
  // The scheduler/batch validator owns pending requests across its await.
  // Keeping every past request here retained their entire native-case closure
  // graph after completion. Only a weak locator survives; no approval is cached.
  const prepared=new Map<string,WeakRef<GuideSegmentRequest<any>>>()
  const archive=new Proxy(options.archive,{get(target,key){
    if(key==='saveValue')return (role:string,key:string,value:any)=>{
      if(role!==outcomeRole)return target.saveValue(role,key,value)
      const request=prepared.get(value.unitId)?.deref(),descriptor=target.value<Descriptor>(requestRole,value.unitId)
      if(!request||!descriptor)throw Error('Runtime finito: figlio senza richiesta corrente.')
      if(descriptor.scopeHash!==guideHash(options.scope)||guideHash(descriptor.request)!==guideHash(guideTransportSnapshot(request)))throw Error('Runtime finito: descrittore cambiato prima del salvataggio.')
      validateGuideTransportOutcome(request,{key,value})
      const receipt:Receipt={version:1,unitId:value.unitId,requestHash:guideHash(descriptor),outcomeKey:key,outcomeHash:guideHash(value)}
      sql.saveValues([{role:requestRole,key:value.unitId,value:descriptor},{role,key,value},{role:receiptRole,key:guideHash(receipt),value:receipt}])
      locate(descriptor,key)
      prepared.delete(value.unitId)
    }
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
  }})
  const runtime:GuideConstructionRuntime={...options,archive,
    prepareRequest:<T>(original:GuideSegmentRequest<T>):GuideSegmentRequest<T>=>{
      // Fresh stages cannot own a paid v1 declaration. Build only the current
      // schema instead of cloning both historical and current turn grammars.
      const freshRoleDeclaration=!!original.validateDeclaration&&original.cacheValidation.id==='guide-segment-declaration-2'&&!!guideUntilValidAuthority(options.archive)&&!declarationStages.has(guideHash([original.stage,original.role,'guide-delivery-turn-1']))
      let selected=retainPaidDeclaration(finiteAuditTurnRequest(original,runtime,freshRoleDeclaration),options,declarationLocators,declarationStages)
      if(original.validateDeclaration&&selected.cacheValidation.id==='guide-delivery-turn-1'&&guideUntilValidAuthority(options.archive)){
        const legacy=declarationStages.has(guideHash([selected.stage,selected.role,selected.cacheValidation.id]))?prepareFiniteRequest(selected,options):undefined,cached=legacy?guideSegmentAcceptedUnit(options.archive,legacy):undefined
        let rejection:string|undefined
        if(cached!==undefined){try{original.validateDeclaration(cached)}catch(error){rejection=error instanceof Error?error.message:String(error)}}
        if(cached===undefined||rejection!==undefined){
          const strict=finiteAuditTurnRequest(original,runtime,true)
          if(rejection!==undefined){
            if(!legacy)throw Error('Dichiarazione respinta senza richiesta storica.')
            const source=[...options.archive.values<any>(outcomeRole)].find(r=>r.value.accepted&&r.value.unitKey===legacy.unitKey&&guideHash(r.value.value)===guideHash(cached))
            if(!source)throw Error('Dichiarazione respinta senza originale pagato.')
            const descriptor=options.archive.value<Descriptor>(requestRole,source.value.unitId)
            if(!descriptor||descriptor.scopeHash!==guideHash(options.scope))throw Error('Dichiarazione respinta di un altro contesto.')
            const restored=restoreGuideTransportRequest(prepareFiniteRequest(selected,options,false),descriptor.request,options.archive)
            readAcceptedGuideTransport(restored,source,options.archive)
            selected={...strict,data:{...strict.data as object,previousDeclarationFailure:{unitId:source.value.unitId,outcomeKey:source.key,message:rejection,raw:structuredClone(source.value.raw)}}}
          }else selected=strict
        }
      }
      const request=prepareFiniteRequest(retainPaidDeclaration(selected,options,declarationLocators,declarationStages),options)
      if(!guideSemanticRetryAllowed(options.archive,request.retryOrdinal??0))throw new AiFailure('invalid-response','Generazione finita interrotta dopo due risposte non valide della stessa unità. Risposte originali conservate; nessun controllo eliminato. Ultimo rifiuto: '+String((request.data as any).previousInvalid?.message??'non disponibile'))
      const unitId=guideSegmentUnitIdentity(request).unitId,descriptor:Descriptor={version:1,scopeHash:guideHash(options.scope),unitId,request:guideTransportSnapshot(request)}
      if(isGuideDelivery(options.packet.basis))registerDeliveryUnit(options.archive as AiEvidenceArchive,request,unitId)
      const prior=options.archive.value<Descriptor>(requestRole,unitId)
      if(prior&&guideHash(prior)!==guideHash(descriptor))throw Error('Runtime finito: identità della richiesta cambiata.')
      if(!prior)options.archive.saveValue(requestRole,unitId,descriptor)
      prepared.set(unitId,new WeakRef(request));return request
    },
    call:async request=>{
      const units=(request.data as any)?.units
      if(!Array.isArray(units)||!units.length||units.some((u:any)=>!prepared.get(u.unitId)?.deref()))throw Error('Runtime finito: invio non preparato dal pianificatore.')
      // A valid negative premise is a content retry, not a format failure. Its
      // bound is independent of the much larger authorized call ceiling.
      for(const unit of units){
        const request=prepared.get(unit.unitId)!.deref()!
        if(!/^(?:review-premise|segment-)/.test(request.stage))continue
        const details=request.data as any,caseId=details.prefix?.id??details.rejectedPrefix?.setup?.id
        if(!caseId)continue
        const descriptors=new Map([...options.archive.values<Descriptor>(requestRole)].map(r=>[r.key,r.value]))
        const negatives=[...options.archive.values<any>(outcomeRole)].filter(r=>r.value.accepted&&r.value.value?.verdict!=='pass'&&descriptors.get(r.value.unitId)?.request.stage.startsWith('review-premise')&&(descriptors.get(r.value.unitId)!.request.data as any).prefix?.id===caseId)
        if(!guideSemanticRetryAllowed(options.archive,negatives.length))throw new AiFailure('draft-limit','Premessa ancora respinta dopo due riesami: generazione conservata e arrestata senza altre iterazioni automatiche.')
      }
      return options.call(request)
    }}
  return runtime
}
import {guideSemanticRetryAllowed,guideUntilValidAuthority} from './guide-run-policy'
