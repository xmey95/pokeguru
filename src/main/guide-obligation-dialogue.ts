import type {AiEvidenceArchive} from './ai-evidence-archive'
import {guideHash} from './matchup-guide-packet'
import {adoptGuideObligationInput,isVerifiedGuideObligationInput,readGuideStoredOriginalPool,type GuideObligationInput} from './guide-obligation-input'
import {GuideObligationMappingContext,type GuideObligationMappingProposal,type GuideObligationMappingReview,type GuideMappingCapture,type GuideMappingFeedback} from './guide-obligation-mapping'
import {guideTransportSnapshot,restoreGuideTransportRequest,readAcceptedGuideTransport,validateGuideTransportOutcome,type GuideTransportSnapshot,type GuideTransportRow} from './guide-transport-evidence'
import {guideSegmentUnitIdentity} from './guide-segment-batch'
import type {GuideSegmentRequest} from './guide-segment-generation'
import {runGuideSegmentPhase} from './guide-segment-scheduler'
import {guideRequestOutputFits} from './guide-request-budget'
import {ProofRegistry,digest} from './guide-obligation-registry'
import type {GuideAtomicPredicate} from './guide-atomic-proofs'
import type {GuideConstructionRuntime} from './guide-reply-phase'

const captureRole='guide-obligation-mapping-capture-v1',requestRole='guide-obligation-dialogue-request-v1',outcomeRole='guide-segment-unit-result-v1',receiptRole='guide-obligation-dialogue-outcome-v1'
type Archive=GuideConstructionRuntime['archive']
type Phase='proposal'|'review'
interface Ref {requestKey:string;outcomeKey:string}
interface RequestRecord {
  version:1;scopeHash:string;contextHash:string;rootHash:string;captureKey:string;originId:string;round:number;phase:Phase;
  proposal:Ref|null;feedback:Ref[];request:GuideTransportSnapshot
}
interface OutcomeReceipt {version:1;scopeHash:string;contextHash:string;rootHash:string;requestKey:string;outcomeKey:string;outcomeHash:string}
interface Snapshot {
  requests:{key:string;value:RequestRecord}[];receipts:{key:string;value:OutcomeReceipt}[];outcomes:GuideTransportRow[];
  captures:{key:string;value:GuideMappingCapture}[]
}
interface Child {requestKey:string;outcomeKey:string;request:GuideSegmentRequest<any>;row:GuideTransportRow;context:GuideObligationMappingContext}
export interface GuideAdmissionState {
  registry:ProofRegistry;atoms:GuideAtomicPredicate[];
  origins:{originId:string;round:number;status:'unplanned'|'review'|'mapped'|'clarify'|'revise'|'needs-context'|'conflict'|'non-independent';proposal:Child|null;reviews:Child[]}[];
  sourceHash:string;inactiveRequests:number
}
function fail(message:string):never{throw Error('Dialogo obblighi: '+message)}
function scopeHash(input:GuideObligationInput){return digest({...input.scope,caseId:input.caseId})}
function owner(input:GuideObligationInput,archive:Archive){if(!isVerifiedGuideObligationInput(input)||archive.id!==input.scope.jobId||archive.projectId!==input.scope.projectId)fail('scope estraneo o ingresso non verificato.')}
function withSnapshot<T>(input:GuideObligationInput,archive:Archive,read:()=>T):T{
  owner(input,archive);const sql=archive as Archive&Partial<Pick<AiEvidenceArchive,'withReadSnapshot'>>
  if(!sql.withReadSnapshot)fail('snapshot coerente mancante.');return sql.withReadSnapshot(read)
}
function snapshot(archive:Archive):Snapshot{return {requests:[...archive.values<RequestRecord>(requestRole)],receipts:[...archive.values<OutcomeReceipt>(receiptRole)],outcomes:[...archive.values<any>(outcomeRole)],captures:[...archive.values<GuideMappingCapture>(captureRole)]}}
function load(input:GuideObligationInput,archive:Archive,state:Snapshot):GuideAdmissionState{
  const scope=scopeHash(input),context=digest(input.context),registry=new ProofRegistry({...input.scope,caseId:input.caseId},input.context,{mechanics:[],reviews:[]})
  const requests=new Map(state.requests.map(r=>[r.key,r.value])),outcomes=new Map(state.outcomes.map(r=>[r.key,r])),contexts=new Map<string,GuideObligationMappingContext>()
  const pool=readGuideStoredOriginalPool(input,archive),originalInputs=new Map([...pool.origins,...input.origins].map(o=>[o.id,o])),active=state.requests.filter(r=>r.value.scopeHash===scope&&r.value.rootHash===input.rootHash&&r.value.contextHash===context)
  for(const row of state.requests)if(row.key!==guideHash(row.value)||row.value.version!==1||!Number.isSafeInteger(row.value.round)||row.value.round<0||!['proposal','review'].includes(row.value.phase))fail('descrittore di dialogo alterato.')
  const receipted=new Set<string>()
  for(const row of state.receipts){
    const receipt=row.value,request=requests.get(receipt.requestKey),outcome=outcomes.get(receipt.outcomeKey)
    if(row.key!==guideHash(receipt)||receipt.version!==1||!request||request.scopeHash!==receipt.scopeHash||request.contextHash!==receipt.contextHash||request.rootHash!==receipt.rootHash||!outcome||guideHash(outcome.value)!==receipt.outcomeHash)fail('opinione conosciuta senza richiesta o risposta originale.')
    if(guideSegmentUnitIdentity({...request.request,cacheValidation:{id:request.request.validationId}} as any).unitId!==outcome.value.unitId||receipt.outcomeKey!==guideHash(outcome.value))fail('ricevuta di un altro figlio.')
    receipted.add(receipt.requestKey+'/'+receipt.outcomeKey)
  }
  for(const row of active){
    if(!contexts.has(row.value.captureKey)){
      const captured=GuideObligationMappingContext.openCapture(row.value.captureKey,input,archive);contexts.set(row.value.captureKey,captured)
      for(const original of captured.capture().originals){const prior=originalInputs.get(original.id);if(prior&&guideHash(prior.original)!==guideHash(original.original))fail('originale riscritto.');originalInputs.set(original.id,prior??original)}
    }
  }
  // All captured originals survive even if no longer mentioned by the latest
  // plan. Refresh carrying aliases from the current accepted source children.
  const aliases=new Map([...originalInputs.values()].map(o=>[o.original.rawJson,new Set<string>(o.producers.map(p=>p.unitId))]))
  for(const row of state.outcomes){
    if(row.key!==guideHash(row.value))fail('esito sorgente alterato.')
    if(row.value.accepted!==true)continue
    const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(typeof value.goal==='string'&&Array.isArray(value.sourceIds))aliases.get(JSON.stringify(value))?.add(row.value.unitId);for(const child of Object.values(value))visit(child)}
    visit(row.value.value)
  }
  for(const original of [...originalInputs.values()].sort((a,b)=>a.id.localeCompare(b.id))){
    registry.append({type:'original',value:original.original})
    const current=new Set(registry.originalProducerIds(original.id)),extra=[...aliases.get(original.original.rawJson)!].filter(id=>!current.has(id)).sort()
    if(extra.length)registry.append({type:'original-producers',originalId:original.id,requestIds:extra})
  }
  const children=new Map<string,Child[]>(),restored=new Map<string,GuideSegmentRequest<any>>(),visiting=new Set<string>()
  const restore=(key:string):GuideSegmentRequest<any>=>{
    const cached=restored.get(key);if(cached)return cached
    if(visiting.has(key))fail('ciclo nei riferimenti del dialogo.');visiting.add(key)
    const record=requests.get(key),capture=record&&contexts.get(record.captureKey)
    if(!record||!capture||record.contextHash!==context||record.scopeHash!==scope||record.rootHash!==input.rootHash||!originalInputs.has(record.originId))fail('riferimento di dialogo estraneo.')
    const child=(ref:Ref):Child=>{
      const request=restore(ref.requestKey),row=outcomes.get(ref.outcomeKey)
      if(!row||!receipted.has(ref.requestKey+'/'+ref.outcomeKey))fail('risposta referenziata priva di ricevuta.')
      readAcceptedGuideTransport(request,row,archive);return {requestKey:ref.requestKey,outcomeKey:ref.outcomeKey,request,row,context:contexts.get(requests.get(ref.requestKey)!.captureKey)!}
    }
    let base:GuideSegmentRequest<any>
    if(record.phase==='proposal'){
      if(record.proposal!==null)fail('proposta con padre di fase errato.')
      let feedback:GuideMappingFeedback|undefined
      if(record.round){
        if(!record.feedback.length)fail('revisione senza rilievi originali.')
        const previous=record.feedback.map(child)
        if(previous.some(c=>requests.get(c.requestKey)!.phase!=='review'||requests.get(c.requestKey)!.round!==record.round-1||requests.get(c.requestKey)!.originId!==record.originId))fail('rilievi di un altro originale o round.')
        if(previous.some(c=>c.row.value.value.verdict!=='revise'))fail('nuovo round senza richiesta di revisione verificata.')
        const first=requests.get(previous[0].requestKey)!.proposal!,proposal=child(first)
        if(previous.some(c=>guideHash(requests.get(c.requestKey)!.proposal)!==guideHash(first)))fail('rilievi di proposte diverse.')
        feedback={proposal:proposal.row.value.value,review:previous[0].row.value.value,reviews:previous.map(c=>c.row.value.value)}
      }else if(record.feedback.length)fail('primo round con feedback non originario.')
      base=capture.proposalRequest(record.originId,0,undefined,feedback)
    }else{
      if(!record.proposal||record.feedback.length)fail('critica senza proposta o con feedback estraneo.')
      const proposal=child(record.proposal),parent=requests.get(record.proposal.requestKey)!
      if(parent.phase!=='proposal'||parent.originId!==record.originId||parent.round!==record.round)fail('critica di un altro round.')
      base=capture.reviewRequest(proposal.request,proposal.row,0)
    }
    const request=restoreGuideTransportRequest(base,record.request,archive)
    if(record.originId!==(request.data as any).original?.id)fail('identità originale diversa dal prompt.')
    restored.set(key,request);visiting.delete(key);return request
  }
  for(const row of active){
    const request=restore(row.key),id=guideSegmentUnitIdentity(request).unitId,accepted:Child[]=[]
    for(const outcome of state.outcomes.filter(o=>o.value.unitId===id)){
      if(!receipted.has(row.key+'/'+outcome.key))fail('risposta di dialogo senza ricevuta durevole.')
      validateGuideTransportOutcome(request,outcome)
      if(outcome.value.accepted)accepted.push({requestKey:row.key,outcomeKey:outcome.key,request,row:outcome,context:contexts.get(row.value.captureKey)!})
    }
    children.set(row.key,accepted)
  }
  const result:GuideAdmissionState['origins']=[],atoms=new Map<string,GuideAtomicPredicate>()
  for(const original of [...originalInputs.values()].sort((a,b)=>a.id.localeCompare(b.id))){
    const own=active.filter(r=>r.value.originId===original.id),round=Math.max(0,...own.map(r=>r.value.round)),current=own.filter(r=>r.value.round===round)
    const proposals=current.filter(r=>r.value.phase==='proposal').flatMap(r=>children.get(r.key)??[])
    const uniqueProposals=new Set(proposals.map(p=>guideHash(p.row.value.value))),proposal=proposals[0]??null
    const reviews=current.filter(r=>r.value.phase==='review').flatMap(r=>children.get(r.key)??[])
    let status:GuideAdmissionState['origins'][number]['status']=!proposal?'unplanned':'review'
    if(uniqueProposals.size>1||new Set(reviews.map(r=>r.row.value.value.verdict)).size>1)status='conflict'
    else if(reviews.length&&proposal){
      if(reviews.some(r=>registry.originalProducerIds(original.id).includes(r.row.value.unitId)||r.row.value.unitId===proposal.row.value.unitId))status='non-independent'
      else if(reviews[0].row.value.value.verdict==='accept'){
        // Verify every opinion; use a deterministic representative only when
        // all accepted judgments agree on acceptance of this same proposal.
        for(const review of reviews){
          const derived=review.context.derive(proposal.request,proposal.row,review.request,review.row,registry)
          registry.importHostReceipts({mechanics:[],reviews:[derived.receipt]})
          registry.append({type:'admission',responseJson:derived.responseJson,receiptHash:digest(derived.receipt)})
          for(const atom of derived.atoms)atoms.set(atom.id,atom)
        }
        status=proposal.row.value.value.disposition==='clarify'?'clarify':'mapped'
      }else status=reviews[0].row.value.value.verdict
    }
    result.push({originId:original.id,round,status,proposal,reviews})
  }
  return {registry,atoms:[...atoms.values()],origins:result,sourceHash:guideHash({requests:state.requests.map(r=>r.key),receipts:state.receipts.map(r=>r.key)}),inactiveRequests:state.requests.length-active.length}
}

/** Pure fold: coherent SQL snapshot, no writes, scheduling, provider calls or
 * progress observations. A missing negative is caught through its receipt. */
export function restoreGuideObligationDialogue(input:GuideObligationInput,archive:Archive):GuideAdmissionState{return withSnapshot(input,archive,()=>load(input,archive,snapshot(archive)))}

/** Advance one automatic propose/review round for every eligible original.
 * Revisions are resumed on the next advance with every prior opinion intact.
 * Context retrieval/conflict adjudication are explicit dependencies, never
 * silently turned into new native branches or guide approval. */
export async function advanceGuideObligationDialogue(input:GuideObligationInput,options:GuideConstructionRuntime):Promise<GuideAdmissionState>{
  owner(input,options.archive)
  if(guideHash(options.scope)!==guideHash(input.scope)||guideHash(options.packet)!==input.packetHash||guideHash(options.evidencePacket??options.packet)!==input.atomic.environment.evidenceHash)fail('runtime diverso dall’ingresso.')
  options.check()
  const born=restoreGuideObligationDialogue(input,options.archive)
  if(!born.origins.some(o=>['unplanned','revise','review'].includes(o.status)))return born
  adoptGuideObligationInput(input,born.registry,options.archive)
  const pool=withSnapshot(input,options.archive,()=>readGuideStoredOriginalPool(input,options.archive)),context=new GuideObligationMappingContext(input,options.archive,born.atoms,undefined,pool),captureKey=context.saveCapture()
  const requests=new Map<string,{record:RequestRecord;request:GuideSegmentRequest<any>}>()
  const seed=withSnapshot(input,options.archive,()=>snapshot(options.archive)),history=new Map(seed.outcomes.map(r=>[r.key,r]))
  const sql=options.archive as Archive&Partial<Pick<AiEvidenceArchive,'saveValues'>>
  if(!sql.saveValues)fail('salvataggio atomico mancante.')
  const view={saveValue:(role:string,key:string,value:unknown)=>{
    if(role===outcomeRole){
      const row={key,value},bound=requests.get((value as any).unitId)
      if(!bound)fail('figlio non richiesto da questo dialogo.')
      validateGuideTransportOutcome(bound.request,row)
      const requestKey=guideHash(bound.record),receipt:OutcomeReceipt={version:1,scopeHash:bound.record.scopeHash,contextHash:bound.record.contextHash,rootHash:bound.record.rootHash,requestKey,outcomeKey:key,outcomeHash:guideHash(value)}
      sql.saveValues!([{role:requestRole,key:requestKey,value:bound.record},{role:outcomeRole,key,value},{role:receiptRole,key:guideHash(receipt),value:receipt}])
      history.set(key,{key,value:structuredClone(value)})
    }else options.archive.saveValue(role,key,value)
  },*values<T>(role:string){if(role===outcomeRole){for(const row of history.values())yield row as {key:string;value:T}}else yield*options.archive.values<T>(role)}}
  const bind=(request:GuideSegmentRequest<any>,record:Omit<RequestRecord,'request'>)=>{
    requests.set(guideSegmentUnitIdentity(request).unitId,{request,record:{...record,request:guideTransportSnapshot(request)}});return request
  }
  const execute=async(phase:Phase,units:{id:string;request:()=>GuideSegmentRequest<any>}[])=>{
    if(!units.length)return
    await runGuideSegmentPhase(units.map(u=>({...u,accept:()=>{}})),{...options,archive:view,stage:phase==='proposal'?'obligation-decompositions':'obligation-mapping-reviews',outputFits:options.outputFits??((stage,units)=>guideRequestOutputFits(stage,[],units)),
      call:async request=>{
        const children=(request.data as any)?.units
        if(!Array.isArray(children)||!children.length)fail('batch privo di figli.')
        sql.saveValues!(children.map((child:any)=>{const item=requests.get(child.unitId);if(!item)fail('batch estraneo.');return {role:requestRole,key:guideHash(item.record),value:item.record}}))
        return options.call(request)
      }})
  }
  const base={version:1 as const,scopeHash:scopeHash(input),contextHash:digest(input.context),rootHash:input.rootHash,captureKey}
  const todo=born.origins.filter(o=>['unplanned','revise'].includes(o.status))
  const outputFits=options.outputFits??((stage:string,units:number)=>guideRequestOutputFits(stage,[],units))
  const futureReviewUnits=todo.length+born.origins.filter(o=>o.status==='review').length
  let maximumReviewGroup=0
  for(let count=1;count<=futureReviewUnits&&outputFits('obligation-mapping-reviews',count);count++)maximumReviewGroup=count
  if(futureReviewUnits&&!maximumReviewGroup)fail('output di una critica troppo grande: nessuna proposta inviata.')
  // A genuine output-only lower bound before responses exist. The subsequent
  // review phase recomputes exact input grouping and reserves every uncached
  // group. This is not a completion estimate for unknown model outputs.
  const reviewFloor=futureReviewUnits?Math.ceil(futureReviewUnits/maximumReviewGroup):0
  await execute('proposal',todo.map(origin=>({id:origin.originId,request:()=>{
    const revised=origin.status==='revise',feedback=revised?{proposal:origin.proposal!.row.value.value,review:origin.reviews[0].row.value.value,reviews:origin.reviews.map(r=>r.row.value.value)}:undefined
    return bind(context.proposalRequest(origin.originId,options.reserveOutside+reviewFloor,view,feedback),{...base,originId:origin.originId,round:origin.round+(revised?1:0),phase:'proposal',proposal:null,feedback:revised?origin.reviews.map(r=>({requestKey:r.requestKey,outcomeKey:r.outcomeKey})):[]})
  }})))
  const afterProposals=restoreGuideObligationDialogue(input,options.archive)
  await execute('review',afterProposals.origins.filter(o=>o.status==='review'&&o.proposal).map(origin=>({id:origin.originId,request:()=>{
    const source=origin.proposal!,request=source.context.reviewRequest(source.request,source.row,options.reserveOutside,view)
    // Review under the exact proposal's captured logical contract, not a
    // different directory that happened to arrive between process restarts.
    const sourceCapture=requests.has(guideSegmentUnitIdentity(source.request).unitId)?captureKey:seed.requests.find(r=>r.key===source.requestKey)!.value.captureKey
    return bind(request,{...base,captureKey:sourceCapture,originId:origin.originId,round:origin.round,phase:'review',proposal:{requestKey:source.requestKey,outcomeKey:source.outcomeKey},feedback:[]})
  }})))
  return restoreGuideObligationDialogue(input,options.archive)
}
