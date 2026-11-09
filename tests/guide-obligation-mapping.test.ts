import {it,expect} from 'vitest'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {prepareGuideReplyObligationInput,adoptGuideObligationInput} from '../src/main/guide-obligation-input'
import {GuideObligationMappingContext,type GuideObligationMappingProposal,type GuideObligationMappingReview} from '../src/main/guide-obligation-mapping'
import {ProofRegistry} from '../src/main/guide-obligation-registry'
import {guideSegmentUnitIdentity,callGuideSegmentBatch} from '../src/main/guide-segment-batch'
import type {GuideSegmentRequest} from '../src/main/guide-segment-generation'
import {reviewGuideAtomicPredicate} from '../src/main/guide-atomic-review'

async function fixture(){
  const f=await guideObligationFixture(),input=prepareGuideReplyObligationInput(f.main,f.before,f.options),registry=new ProofRegistry({...input.scope,caseId:input.caseId},input.context,{mechanics:[],reviews:[]})
  adoptGuideObligationInput(input,registry,f.archive)
  const context=new GuideObligationMappingContext(input,f.archive),origin=input.origins[0],request=context.proposalRequest(origin.id,3)
  const proposal:GuideObligationMappingProposal={originId:origin.id,inputHash:(request.data as any).inputHash,disposition:'map',witnessScope:'single-line',
    atoms:[{label:'a1',statement:'An explicit synthetic complete-witness predicate',conditions:'Same exact native root and current sources; test-only semantics.',sourceIds:origin.original.sourceIds,policy:{kind:'exists-line',frame:{firstTurnHash:null,drawsHash:null}}}],
    nodes:[{atom:'a1'}],root:0,reason:'Synthetic proposer output, not a real semantic decomposition.',sourceIds:origin.original.sourceIds}
  async function accept<T>(request:GuideSegmentRequest<T>,raw:unknown){
    const id=guideSegmentUnitIdentity(request).unitId
    await callGuideSegmentBatch([request],{archive:f.archive,stage:request.role==='constructor'?'obligation-decompositions':'obligation-mapping-reviews',reserveCalls:request.reserveCalls,
      call:async r=>r.read({units:[{unitId:id,response:raw}]})})
    return [...f.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.unitId===id&&JSON.stringify(r.value.raw)===JSON.stringify(raw))!
  }
  const review=(request:GuideSegmentRequest<GuideObligationMappingReview>):GuideObligationMappingReview=>({originId:origin.id,inputHash:(request.data as any).inputHash,proposalHash:(request.data as any).proposalHash,verdict:'accept',reason:'Synthetic independent mapping review for protocol tests.',sourceIds:origin.original.sourceIds,
    checks:{wholeOriginal:true,conditions:true,quantifiers:true,witnessIdentity:true,domain:true,invariants:true},missingWitnessIds:[]})
  return {...f,input,registry,context,origin,request,proposal,accept,review}
}

it('admits only independently reviewed exact mappings, keeping factual coverage and other originals open',async()=>{
  const f=await fixture()
  try{
    const source=await f.accept(f.request,f.proposal),request=f.context.reviewRequest(f.request,source,3),review=await f.accept(request,f.review(request))
    expect((f.request.data as any).knownCandidateCoverage).toBe('selected-only-not-a-complete-catalogue')
    const intentions=(f.request.data as any).directory.intentions
    expect(intentions.length).toBeGreaterThan(0)
    expect(intentions.every((i:any)=>f.input.origins.some(o=>o.id===i.originId&&o.original.rawJson===JSON.stringify(i.value)))).toBe(true)
    const mapped=f.context.adopt(f.request,source,request,review,f.registry)
    expect(f.registry.audit().originals.find(o=>o.id===f.origin.id)!.status).toBe('open')
    expect(f.registry.audit().obligationsClosed).toBe(false)
    expect(mapped.atoms[0].authorRequestIds).toContain(source.value.unitId)
    const facts=await reviewGuideAtomicPredicate(f.input.atomic,mapped.atoms[0],{...f.options,reserveOutside:3,call:async r=>r.read({units:(r.data as any).units.map((u:any)=>({unitId:u.unitId,response:{atomId:u.data.predicate.id,unitId:u.data.unit.id,verdict:'proves',reason:'Synthetic independent fact review, not a real guide approval.',sourceIds:f.origin.original.sourceIds,witnesses:u.data.unit.witnesses.map((w:any)=>({...w,turnNumbers:[1]})),needs:'none'}}))})})
    f.registry.importAtomicProofs([{obligationId:mapped.admission.obligations[0].id,proof:facts.coverage(mapped.atoms[0])!}])
    expect(f.registry.audit().originals.find(o=>o.id===f.origin.id)!.status).toBe('verified')
    expect(f.registry.audit().originals.filter(o=>o.status==='proposed').length).toBe(f.input.origins.length-1)
  }finally{f.close()}
})

it('refuses splitting a single-witness claim across independent existentials, cycles and orphaned nodes',async()=>{
  const f=await fixture()
  try{
    const a=f.proposal.atoms[0] as any,b={...a,label:'a2',statement:'A different synthetic property'}
    const split={...f.proposal,atoms:[a,b],nodes:[{atom:'a1'},{atom:'a2'},{all:[0,1]}],root:2}
    expect(()=>f.request.read(split)).toThrow('singolo testimone')
    expect(()=>f.request.read({...split,witnessScope:'independent-lines',nodes:[{atom:'a1'},{atom:'a2'},{all:[0,2]}]})).toThrow('ciclica')
    expect(()=>f.request.read({...split,witnessScope:'independent-lines',nodes:[{atom:'a1'},{atom:'a2'}],root:1})).toThrow('orfani')
    expect(()=>f.request.read({...split,witnessScope:'independent-lines',atoms:[a,{...a,label:'a2'}]})).toThrow('proposizioni duplicate')
  }finally{f.close()}
})

it('requires every semantic review check and explicit missing-context routing without manufacturing new branches',async()=>{
  const f=await fixture()
  try{
    const source=await f.accept(f.request,f.proposal),request=f.context.reviewRequest(f.request,source,3),raw=f.review(request)
    expect(()=>request.read({...raw,checks:{...raw.checks,quantifiers:false}})).toThrow('incoerente')
    expect(()=>request.read({...raw,sourceIds:[]})).toThrow()
    expect(()=>request.read({...raw,verdict:'needs-context'})).toThrow('incoerente')
    const missing=f.input.library.members.find(w=>!w.aliases.some(a=>a.line.id==='main'))!.id
    const incomplete={...raw,verdict:'needs-context' as const,missingWitnessIds:[missing]},row=await f.accept(request,incomplete)
    expect(()=>f.context.adopt(f.request,source,request,row,f.registry)).toThrow('ancora da rivedere')
    expect(f.registry.audit().originals.every(o=>o.status==='proposed')).toBe(true)
  }finally{f.close()}
})

it('preserves known predicate identity and provenance after an independently reviewed reuse',async()=>{
  const f=await fixture()
  try{
    const source=await f.accept(f.request,f.proposal),reviewRequest=f.context.reviewRequest(f.request,source,3),review=await f.accept(reviewRequest,f.review(reviewRequest)),first=f.context.adopt(f.request,source,reviewRequest,review,f.registry)
    const next=new GuideObligationMappingContext(f.input,f.archive,first.atoms),request=next.proposalRequest(f.origin.id,3),raw={...f.proposal,inputHash:(request.data as any).inputHash,atoms:[{label:'a1',existingId:first.atoms[0].id}]}
    const nextSource=await f.accept(request,raw),nextReview=next.reviewRequest(request,nextSource,3),nextRow=await f.accept(nextReview,f.review(nextReview)),second=next.adopt(request,nextSource,nextReview,nextRow,f.registry)
    expect(second.atoms[0].id).toBe(first.atoms[0].id)
    expect(second.atoms[0].authorRequestIds).toContain(first.atoms[0].authorRequestIds[0])
    expect(second.atoms[0].authorRequestIds).toContain(nextSource.value.unitId)
  }finally{f.close()}
})

it('does not hide an accepted negative critic behind a later convenient positive on the same proposal',async()=>{
  const f=await fixture()
  try{
    const source=await f.accept(f.request,f.proposal),request=f.context.reviewRequest(f.request,source,3),raw=f.review(request)
    await f.accept(request,{...raw,verdict:'revise',reason:'Synthetic negative mapping opinion must remain explicit.',checks:{...raw.checks,witnessIdentity:false}})
    const positive=await f.accept(request,raw)
    expect(()=>f.context.adopt(f.request,source,request,positive,f.registry)).toThrow('incompatibili')
    expect(f.registry.audit().originals.every(o=>o.status==='proposed')).toBe(true)
  }finally{f.close()}
})

it('authenticates actual archived child outputs and refuses a rewritten descriptor or manufactured transport row',async()=>{
  const f=await fixture()
  try{
    const source=await f.accept(f.request,f.proposal)
    expect(()=>f.context.reviewRequest({...f.request,data:{...(f.request.data as object),main:null}},source,3)).toThrow('descrittore')
    expect(()=>f.context.reviewRequest(f.request,{...source,key:'unrecorded'},3)).toThrow('non autenticata')
    expect(()=>new GuideObligationMappingContext(JSON.parse(JSON.stringify(f.input)),f.archive)).toThrow('non verificato')
  }finally{f.close()}
})

it('does not mutate the live registry when persisting an accepted mapping fails',async()=>{
  const f=await fixture()
  try{
    const source=await f.accept(f.request,f.proposal),request=f.context.reviewRequest(f.request,source,3),review=await f.accept(request,f.review(request)),before=f.registry.serialize()
    const archive={id:f.archive.id,projectId:f.archive.projectId,value:f.archive.value.bind(f.archive),values:f.archive.values.bind(f.archive),saveValue:()=>{throw Error('Synthetic storage failure')}}
    const broken=new GuideObligationMappingContext(f.input,archive)
    expect(()=>broken.adopt(f.request,source,request,review,f.registry)).toThrow('storage failure')
    expect(f.registry.serialize()).toBe(before)
  }finally{f.close()}
})

it('keeps source-refuted AI originals in history without withdrawing the other coverage obligations',async()=>{
  const f=await fixture()
  try{
    const raw:GuideObligationMappingProposal={...f.proposal,disposition:'superseded',witnessScope:'none',atoms:[],nodes:[],root:null,reason:'Synthetic source-grounded refutation proposed for an AI original.'}
    const source=await f.accept(f.request,raw),request=f.context.reviewRequest(f.request,source,3),review=await f.accept(request,f.review(request))
    f.context.adopt(f.request,source,request,review,f.registry)
    expect(f.registry.audit().originals.find(o=>o.id===f.origin.id)!.status).toBe('superseded')
    expect(f.registry.audit().obligationsClosed).toBe(false)
    expect(f.registry.serialize()).toContain(f.origin.original.rawJson.replaceAll('"','\\"'))
  }finally{f.close()}
})

it('authenticates raw-format retries of both proposer and critic without losing either rejected output',async()=>{
  const f=await fixture()
  try{
    const badSource=await f.accept(f.request,{...f.proposal,nodes:[]})
    expect(badSource.value.accepted).toBe(false)
    const retried=f.context.proposalRequest(f.origin.id,3,f.archive)
    expect(retried.retryOrdinal).toBe(1)
    const source=await f.accept(retried,f.proposal),request=f.context.reviewRequest(retried,source,3)
    const badReview=await f.accept(request,{...f.review(request),checks:{...f.review(request).checks,wholeOriginal:false}})
    expect(badReview.value.accepted).toBe(false)
    const next=f.context.reviewRequest(retried,source,3,f.archive)
    expect(next.retryOrdinal).toBe(1)
    const review=await f.accept(next,f.review(next))
    expect(f.context.adopt(retried,source,next,review,f.registry).atoms).toHaveLength(1)
    expect([...f.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.accepted===false&&[f.request.unitKey,request.unitKey].includes(r.value.unitKey))).toHaveLength(2)
  }finally{f.close()}
})
