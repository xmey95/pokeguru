import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideHash} from './matchup-guide-packet'
import {GuideAtomicReviewContext,type GuideAtomicRequestSnapshot,type GuideAtomicAcceptedRow} from './guide-atomic-requests'
import type {GuideAtomicFact,GuideAtomicPredicate,GuideAtomicProofStore} from './guide-atomic-proofs'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import type {GuideConstructionRuntime} from './guide-reply-phase'
import {guideRequestOutputFits} from './guide-request-budget'

const requestRole='guide-atomic-request-v1',outcomeRole='guide-segment-unit-result-v1',opinionRole='guide-atomic-opinion-v1'
interface SavedRequest {
  version:1;scopeHash:string;contextHash:string;atomId:string;proofUnitId:string;request:GuideAtomicRequestSnapshot
}
interface SavedOpinion {version:1;scopeHash:string;contextHash:string;atomId:string;proofUnitId:string;requestKey:string;outcomeKey:string;outcomeHash:string;receiptHash:string}
interface Snapshot {requests:{key:string;value:SavedRequest}[];outcomes:GuideAtomicAcceptedRow[];opinions:{key:string;value:SavedOpinion}[]}
function fail(message:string):never{throw new Error('Revisioni atomiche: '+message)}
type Archive=GuideConstructionRuntime['archive']
function snapshot(archive:Archive,context:GuideAtomicReviewContext):Snapshot{
  if(archive.id!==context.library.scope.jobId||archive.projectId!==context.library.scope.projectId)fail('archivio estraneo.')
  const owner=archive as Archive&Partial<Pick<AiEvidenceArchive,'withReadSnapshot'>>
  if(!owner.withReadSnapshot)fail('lettura SQLite coerente mancante.')
  return owner.withReadSnapshot(()=>({requests:[...archive.values<SavedRequest>(requestRole)],outcomes:[...archive.values<any>(outcomeRole)],opinions:[...archive.values<SavedOpinion>(opinionRole)]}))
}
function restore(context:GuideAtomicReviewContext,atom:GuideAtomicPredicate,state:Snapshot):GuideAtomicProofStore{
  const store=context.createStore(),units=new Map(store.units(atom).map(u=>[u.id,u]))
  const described=new Set<string>()
  const byUnit=new Map<string,GuideAtomicAcceptedRow[]>()
  for(const row of state.outcomes)byUnit.set(row.value.unitId,[...byUnit.get(row.value.unitId)??[],row])
  for(const row of state.opinions){
    const value=row.value
    if(row.key!==guideHash(value)||value.version!==1)fail('ricevuta di opinione alterata.')
    if(value.scopeHash!==context.scopeHash||value.contextHash!==context.contextHash||value.atomId!==atom.id||!units.has(value.proofUnitId))continue
    const descriptor=state.requests.find(r=>r.key===value.requestKey),outcome=state.outcomes.find(r=>r.key===value.outcomeKey)
    if(!descriptor||descriptor.key!==guideHash(descriptor.value)||!outcome||guideHash(outcome.value)!==value.outcomeHash)fail('opinione conosciuta senza descrittore o risposta; recuperare gli originali.')
    const unit=units.get(value.proofUnitId)!,request=context.restoreRequest(atom,unit,descriptor.value.request,state.outcomes)
    if(guideHash(context.receipt(atom,unit,request,outcome,state.outcomes))!==value.receiptHash)fail('ricevuta diversa dal giudizio archiviato.')
  }
  for(const row of state.requests){
    const record=row.value
    if(row.key!==guideHash(record)||record.version!==1)fail('descrittore salvato alterato.')
    if(record.scopeHash!==context.scopeHash||record.contextHash!==context.contextHash||record.atomId!==atom.id)continue
    const unit=units.get(record.proofUnitId)
    if(!unit)continue // Removed witnesses remain archived, outside this current finite domain.
    const request=context.restoreRequest(atom,unit,record.request,state.outcomes),identity=guideSegmentUnitIdentity(request)
    described.add(identity.unitId)
    const matching=byUnit.get(identity.unitId)??[]
    for(const accepted of matching){
      if(accepted.key!==guideHash(accepted.value))fail('risposta salvata alterata.')
      if(accepted.value.accepted!==true)continue
      const receipt=context.receipt(atom,unit,request,accepted,state.outcomes)
      store.addFact(atom,unit,request.read(accepted.value.raw),receipt)
    }
  }
  // An accepted fact without the descriptor that proves what was read must
  // block reuse. It cannot disappear to leave a convenient positive opinion.
  for(const row of state.outcomes)if(row.value.accepted===true&&row.value.value?.atomId===atom.id&&units.has(row.value.value?.unitId)){
    if(row.key!==guideHash(row.value))fail('risposta salvata alterata.')
    if(!described.has(row.value.unitId))fail('giudizio senza il descrittore autenticato; recuperare la ricevuta originale.')
  }
  return store
}

/** Atomically bind an actual accepted transport child to its exact host
 * descriptor and opinion receipt. No model-authored receipt is accepted. */
export function saveGuideAtomicReviewOutcome(context:GuideAtomicReviewContext,atom:GuideAtomicPredicate,unit:ReturnType<GuideAtomicProofStore['units']>[number],request:GuideSegmentRequest<GuideAtomicFact>,row:GuideAtomicAcceptedRow,archive:Archive,history:GuideAtomicAcceptedRow[]):void{
  if(archive.id!==context.library.scope.jobId||archive.projectId!==context.library.scope.projectId)fail('archivio estraneo.')
  const owner=archive as Archive&Partial<Pick<AiEvidenceArchive,'saveValues'>>
  if(!owner.saveValues)fail('salvataggio atomico delle opinioni mancante.')
  const receipt=context.receipt(atom,unit,request,row,history)
  const saved:SavedRequest={version:1,scopeHash:context.scopeHash,contextHash:context.contextHash,atomId:atom.id,proofUnitId:unit.id,request:context.snapshot(request)},requestKey=guideHash(saved)
  const opinion:SavedOpinion={version:1,scopeHash:context.scopeHash,contextHash:context.contextHash,atomId:atom.id,proofUnitId:unit.id,requestKey,outcomeKey:row.key,outcomeHash:guideHash(row.value),receiptHash:guideHash(receipt)}
  owner.saveValues([{role:requestRole,key:requestKey,value:saved},{role:outcomeRole,key:row.key,value:row.value},{role:opinionRole,key:guideHash(opinion),value:opinion}])
}

/** Pure reopen: derives receipts only from saved host descriptors plus exact
 * accepted raw children. No provider, writes, review, or constructed pass. */
export function restoreGuideAtomicReviews(context:GuideAtomicReviewContext,atom:GuideAtomicPredicate,archive:Archive):GuideAtomicProofStore{
  return restore(context,atom,snapshot(archive,context))
}

/** Uses the existing token scheduler, retry identities and call reserves. It
 * reviews only unknown local facts; source/numeric gaps and contradictory
 * opinions are returned to their explicit dependency work, never new branches.
 * This still does NOT approve mappings, construction or a complete guide. */
export async function reviewGuideAtomicPredicate(context:GuideAtomicReviewContext,atom:GuideAtomicPredicate,options:GuideConstructionRuntime):Promise<GuideAtomicProofStore>{
  if(guideHash(options.scope)!==guideHash(context.library.scope)||guideHash(options.packet)!==context.library.packetHash||guideHash(options.evidencePacket??options.packet)!==context.environment.evidenceHash)fail('runtime diverso dal contesto preparato.')
  options.check()
  const initial=snapshot(options.archive,context),store=restore(context,atom,initial)
  const pending=new Set(store.pendingWork(atom).filter(w=>w.needs==='critique').map(w=>w.unitId))
  const units=store.units(atom).filter(u=>pending.has(u.id))
  if(!units.length||store.derive(atom).status==='verified')return store
  // This phase-local transport view avoids rereading/decompressing every old
  // outcome in each factory. Writes still go through the immutable SQL archive;
  // every new phase/reopen reconstructs this view in a coherent read snapshot.
  const history=new Map(initial.outcomes.map(r=>[r.key,r]))
  const requests=new Map<string,{request:GuideSegmentRequest<GuideAtomicFact>;unit:typeof units[number]}>()
  const view={saveValue:(role:string,key:string,value:unknown)=>{
    const outcome=value as any,current=role===outcomeRole&&outcome.accepted===true?requests.get(outcome.unitId):undefined
    if(role===outcomeRole&&outcome.accepted===true){
      if(!current)fail('risposta estranea al gruppo corrente.')
      saveGuideAtomicReviewOutcome(context,atom,current.unit,current.request,{key,value},options.archive,[...history.values()])
    }else options.archive.saveValue(role,key,value)
    if(role===outcomeRole)history.set(key,{key,value:structuredClone(value)})
  },*values<T>(role:string){
    if(role===outcomeRole){for(const row of history.values())yield row as {key:string;value:T}}
    else yield*options.archive.values<T>(role)
  }}
  await runGuideSegmentPhase<GuideAtomicFact>(units.map(unit=>({id:unit.id,request:()=>{
    const request=context.request(atom,unit,options.reserveOutside,view)
    requests.set(guideSegmentUnitIdentity(request).unitId,{request,unit});return request
  },accept:fact=>{
    const unit=units.find(u=>u.id===fact.unitId)!,matches=[...requests.values()].filter(v=>v.unit.id===unit.id)
    const rows=[...history.values()]
    let added=false
    for(const {request}of matches){
      const identity=guideSegmentUnitIdentity(request)
      for(const row of rows.filter(r=>r.value.unitId===identity.unitId&&r.value.accepted===true)){store.addFact(atom,unit,request.read(row.value.raw),context.receipt(atom,unit,request,row,rows));added=true}
    }
    if(!added)fail('unità accettata senza richiesta e risposta archiviate.')
  }})),{...options,archive:view,stage:'obligation-facts',outputFits:options.outputFits??((stage,units)=>guideRequestOutputFits(stage,[],units)),shouldContinue:()=>store.derive(atom).status!=='verified',
    call:async request=>{
      const input=request.data as {units?:{unitId:string}[]}
      if(!input.units?.length)fail('batch senza unità.')
      for(const child of input.units){
        const current=requests.get(child.unitId)
        if(!current)fail('batch estraneo al predicato.')
        const saved:SavedRequest={version:1,scopeHash:context.scopeHash,contextHash:context.contextHash,atomId:atom.id,proofUnitId:current.unit.id,request:context.snapshot(current.request)}
        options.archive.saveValue(requestRole,guideHash(saved),saved)
      }
      return options.call(request)
    }})
  return store
}
