import {beforeAll,afterAll,it,expect} from 'vitest'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {readGuideWitnessLibrary} from '../src/main/guide-witness-library'
import {GuideAtomicReviewContext} from '../src/main/guide-atomic-requests'
import {reviewGuideAtomicPredicate,restoreGuideAtomicReviews} from '../src/main/guide-atomic-review'
import {guideAtomicObligationDescriptor,guideAtomicRegistryContext} from '../src/main/guide-atomic-binding'
import {ProofRegistry,digest,type Obligation,type Formula,type ReviewReceipt,type Scope,type Original} from '../src/main/guide-obligation-registry'
import type {GuideAtomicPredicate} from '../src/main/guide-atomic-proofs'

let f:Awaited<ReturnType<typeof guideObligationFixture>>,context:GuideAtomicReviewContext,exist:GuideAtomicPredicate,compare:GuideAtomicPredicate,grown:ReturnType<typeof readGuideWitnessLibrary>
beforeAll(async()=>{
  f=await guideObligationFixture();context=new GuideAtomicReviewContext(readGuideWitnessLibrary(f.main,f.options),f.options)
  const catalogue=context.createStore()
  exist=catalogue.predicate('Synthetic existential fact for the bridge','Exact native frame and sources',['card:p'],{kind:'exists-line',frame:{firstTurnHash:null,drawsHash:null}},['synthetic-original-producer'])
  compare=catalogue.predicate('Synthetic pairwise fact for the bridge','Explicitly conditional finite domain, not all legal TCG moves',['card:p'],{kind:'all-pairs',frame:{firstTurnHash:null,drawsHash:null},focusId:null,frameMode:'declared-conditional'},['synthetic-original-producer'])
  for(const atom of [exist,compare])await reviewGuideAtomicPredicate(context,atom,{...f.options,reserveOutside:3,call:async r=>r.read({units:(r.data as any).units.map((child:any)=>({unitId:child.unitId,response:{atomId:child.data.predicate.id,unitId:child.data.unit.id,verdict:'proves',reason:'Synthetic independently accepted test response, no real semantic approval.',sourceIds:['card:p'],witnesses:child.data.unit.witnesses.map((w:any)=>({...w,turnNumbers:[1]})),needs:'none'}}))})})
  f.setConstructorNote('Another synthetic declaration for bridge invalidation tests');await f.adopt();grown=readGuideWitnessLibrary(f.main,f.options)
},60000)
afterAll(()=>f?.close())
function fixture(scope:Scope={...context.library.scope,caseId:context.library.caseId},mappingFrameHash?:string){
  const frame=guideAtomicRegistryContext({caseId:context.library.caseId,rootHash:context.library.rootHash,nativePacketHash:context.library.packetHash,contextHash:context.contextHash,...context.environment},mappingFrameHash)
  const registry=new ProofRegistry(scope,frame,{mechanics:[],reviews:[]}),reviews:ReviewReceipt[]=[]
  let ordinal=0
  function original(raw='Exact synthetic original',producer='synthetic-original-producer'){
    const value:Original={origin:'ai',rawJson:JSON.stringify({goal:raw,reason:'An immutable full original for protocol tests'}),producerRequestId:producer,sourceIds:['card:p']}
    registry.append({type:'original',value});return registry.originalId(value)
  }
  const obligation=(atom:GuideAtomicPredicate)=>registry.obligation(guideAtomicObligationDescriptor(atom))
  function map(id:string,obligations:Obligation[],formula:Formula={atom:obligations[0].id}){
    const responseJson=JSON.stringify({obligations,decisions:[{originalId:id,disposition:'map',formula,reason:'Explicit synthetic independent mapping, not real AI semantics.',sourceIds:['card:p']}],work:obligations.map(o=>({obligationId:o.id,action:'clarify',witnessIds:[],reason:'Wait for exact fact coverage'}))})
    const receipt:ReviewReceipt={kind:'admission',requestId:'synthetic-mapping-critic-'+ ++ordinal,contractVersion:'guide-obligations-1',scopeHash:registry.scopeHash,contextHash:registry.contextHash,responseHash:digest(responseJson),originalIds:[id],obligationIds:[],witnessRefs:[],sourceIds:frame.sourceIds,competitors:{},bindingHash:null}
    reviews.push(receipt);registry.importHostReceipts({mechanics:[],reviews:[receipt]});registry.append({type:'admission',responseJson,receiptHash:digest(receipt)})
  }
  return {registry,scope,frame,reviews,original,obligation,map,store:(atom:GuideAtomicPredicate)=>restoreGuideAtomicReviews(context,atom,f.archive)}
}

it('requires an independent exact mapping before a fact can close any original',()=>{
  const t=fixture(),o=t.obligation(exist),store=t.store(exist),proof=store.coverage(exist)!
  expect(()=>t.registry.importAtomicProofs([{obligationId:o.id,proof}])).toThrow('unmapped')
  const id=t.original();t.map(id,[o])
  expect(t.registry.audit().obligationsClosed).toBe(false)
  t.registry.importAtomicProofs([{obligationId:o.id,proof}])
  expect(t.registry.audit().obligationsClosed).toBe(true)
  expect(t.registry.progress().facts.length).toBeGreaterThan(0)
})

it('reuses an unchanged local fact only after the new original receives its own independent mapping',()=>{
  const t=fixture(),o=t.obligation(exist),proof=t.store(exist).coverage(exist)!,first=t.original('First exact original')
  t.map(first,[o]);t.registry.importAtomicProofs([{obligationId:o.id,proof}])
  const before=t.registry.bindingHash(o.id),second=t.original('Second distinct exact original')
  expect(t.registry.audit().obligationsClosed).toBe(false)
  t.map(second,[o])
  expect(t.registry.bindingHash(o.id)).not.toBe(before)
  expect(t.registry.audit().obligationsClosed).toBe(true)
  expect(t.registry.serialize()).not.toContain('host-atomic-approved')
})

it('does not import a global pass on reopen: facts must be reauthenticated from the source stores',()=>{
  const t=fixture(),o=t.obligation(exist),id=t.original();t.map(id,[o]);t.registry.importAtomicProofs([{obligationId:o.id,proof:t.store(exist).coverage(exist)!}])
  const reopened=ProofRegistry.open(t.registry.serialize(),t.scope,t.frame,{mechanics:[],reviews:t.reviews})
  expect(reopened.audit().obligationsClosed).toBe(false)
  reopened.importAtomicProofs([{obligationId:o.id,proof:t.store(exist).coverage(exist)!}])
  expect(reopened.audit().obligationsClosed).toBe(true)
})

it('invalidates the global comparison when its native domain grows while the existential fact remains valid',()=>{
  const a=fixture(),e=a.obligation(exist),es=a.store(exist);a.map(a.original(),[e]);a.registry.importAtomicProofs([{obligationId:e.id,proof:es.coverage(exist)!}])
  const b=fixture(),c=b.obligation(compare),cs=b.store(compare);b.map(b.original(),[c]);b.registry.importAtomicProofs([{obligationId:c.id,proof:cs.coverage(compare)!}])
  es.useLibrary(grown);cs.useLibrary(grown)
  expect(a.registry.audit().obligationsClosed).toBe(true)
  expect(b.registry.audit().obligationsClosed).toBe(false)
})

it('rejects a JSON pass, a changed predicate, a foreign scope and partial transactional imports',()=>{
  const t=fixture(),o=t.obligation(exist),proof=t.store(exist).coverage(exist)!
  t.map(t.original(),[o]);t.registry.importAtomicProofs([{obligationId:o.id,proof}])
  expect(()=>t.registry.importAtomicProofs([{obligationId:o.id,proof:JSON.parse(JSON.stringify(proof))}])).toThrow('foreign')
  expect(t.registry.audit().obligationsClosed).toBe(true)
  const changed=fixture(),wrong=changed.registry.obligation({...guideAtomicObligationDescriptor(exist),conditions:'Changed frame condition'})
  changed.map(changed.original(),[wrong]);expect(()=>changed.registry.importAtomicProofs([{obligationId:wrong.id,proof}])).toThrow('foreign')
  const foreign=fixture({...t.scope,jobId:'foreign'}),fo=foreign.obligation(exist);foreign.map(foreign.original(),[fo])
  expect(()=>foreign.registry.importAtomicProofs([{obligationId:fo.id,proof}])).toThrow('foreign')
})

it('checks independence again when a newly mapped original was produced by the old fact reviewer',()=>{
  const t=fixture(),o=t.obligation(exist),proof=t.store(exist).coverage(exist)!
  t.map(t.original(),[o]);t.registry.importAtomicProofs([{obligationId:o.id,proof}]);expect(t.registry.audit().obligationsClosed).toBe(true)
  t.map(t.original('An original produced by the earlier fact reviewer',proof.reviewerRequestIds[0]),[o])
  expect(t.registry.audit().obligationsClosed).toBe(false)
  expect(()=>t.registry.importAtomicProofs([{obligationId:o.id,proof}])).toThrow('not independent')
})

it('keeps conjunctions open until every independent fact is present, without weakening them to a disjunction',()=>{
  const t=fixture(),one=t.obligation(exist),two=t.obligation(compare),id=t.original('An exact compound synthetic original')
  t.map(id,[one,two],{all:[{atom:one.id},{atom:two.id}]})
  t.registry.importAtomicProofs([{obligationId:one.id,proof:t.store(exist).coverage(exist)!}])
  expect(t.registry.audit().obligationsClosed).toBe(false)
  t.registry.importAtomicProofs([{obligationId:two.id,proof:t.store(compare).coverage(compare)!}])
  expect(t.registry.audit().obligationsClosed).toBe(true)
})

it('refuses relabeling a legacy global certificate as an atomic factual proof',()=>{
  const t=fixture(),o=t.obligation(compare),original=t.original();t.map(original,[o])
  const responseJson=JSON.stringify({obligationId:o.id,verdict:'verified',reason:'A legacy certificate is not the required atomic coverage.',sourceIds:['card:p'],witnesses:[],next:null})
  const receipt:ReviewReceipt={kind:'certification',requestId:'synthetic-old-global-critic',contractVersion:'guide-obligations-1',scopeHash:t.registry.scopeHash,contextHash:t.registry.contextHash,responseHash:digest(responseJson),originalIds:[original],obligationIds:[o.id],witnessRefs:[],sourceIds:t.frame.sourceIds,competitors:{},bindingHash:t.registry.bindingHash(o.id)}
  t.registry.importHostReceipts({mechanics:[],reviews:[receipt]})
  expect(()=>t.registry.append({type:'certification',responseJson,receiptHash:digest(receipt)})).toThrow('not a legacy certificate')
  expect(t.registry.audit().obligationsClosed).toBe(false)
})

it('invalidates mapping semantics after main-line selection changes while allowing facts only through a fresh independent mapping',()=>{
  const t=fixture(undefined,'a'.repeat(64)),o=t.obligation(exist),id=t.original(),proof=t.store(exist).coverage(exist)!
  t.map(id,[o]);t.registry.importAtomicProofs([{obligationId:o.id,proof}]);expect(t.registry.audit().obligationsClosed).toBe(true)
  const frame={...t.frame,frameHash:t.frame.frameHash.slice(0,-64)+'b'.repeat(64)}
  t.registry.append({type:'context',value:frame})
  expect(t.registry.audit().originals[0].status).toBe('invalidated')
  expect(()=>t.registry.importAtomicProofs([{obligationId:o.id,proof}])).toThrow('stale')
  const current=t.obligation(exist);t.map(id,[current])
  t.registry.importAtomicProofs([{obligationId:current.id,proof}])
  expect(t.registry.audit().obligationsClosed).toBe(true)
  t.registry.append({type:'context',value:{...frame,frameHash:'foreign-frame'}})
  const foreign=t.obligation(exist);t.map(id,[foreign])
  expect(()=>t.registry.importAtomicProofs([{obligationId:foreign.id,proof}])).toThrow('foreign')
})
