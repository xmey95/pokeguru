import {it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {prepareGuideReplyObligationInput,adoptGuideObligationInput,isVerifiedGuideObligationInput} from '../src/main/guide-obligation-input'
import {ProofRegistry,digest,type ReviewReceipt} from '../src/main/guide-obligation-registry'
import {guideHash} from '../src/main/matchup-guide-packet'
function registry(input:ReturnType<typeof prepareGuideReplyObligationInput>){return new ProofRegistry({...input.scope,caseId:input.caseId},input.context,{mechanics:[],reviews:[]})}
function syntheticCarrier(f:Awaited<ReturnType<typeof guideObligationFixture>>,value:unknown,id:string){
  const record={stage:'synthetic-carrier-test',batchHash:'synthetic-batch',unitId:id,unitKey:id+'-key',retryOrdinal:0,accepted:true,value,raw:value}
  f.archive.saveValue('guide-segment-unit-result-v1',guideHash(record),record)
  return guideHash(record)
}

it('prepares exact case originals, native library and carrying-unit references without requests or writes',async()=>{
  const f=await guideObligationFixture()
  try{
    const before=f.calls,input=prepareGuideReplyObligationInput(f.main,f.before,f.options)
    expect(input.origins.length).toBeGreaterThan(0)
    expect(input.origins.every(o=>o.producers.length>0)).toBe(true)
    expect(input.origins.map(o=>o.original.rawJson)).toEqual(input.provenance.origins.map(o=>o.rawJson))
    expect(input.coverage).toEqual({replyOrigins:true,producerUnitBindings:true,guideInvariants:false,criticalFindings:false,wholeGuideMigration:false})
    expect([...f.archive.values('guide-obligation-original-birth-v1')]).toEqual([])
    expect(f.calls).toBe(before)
    expect(isVerifiedGuideObligationInput(input)).toBe(true)
    expect(isVerifiedGuideObligationInput(JSON.parse(JSON.stringify(input)))).toBe(false)
    expect(()=>{input.origins[0].original.rawJson='rewritten'}).toThrow()
  }finally{f.close()}
})

it('pins original identities and adds later carrier aliases monotonically without rewriting or duplicating an original',async()=>{
  const f=await guideObligationFixture()
  try{
    const first=prepareGuideReplyObligationInput(f.main,f.before,f.options),r=registry(first)
    adoptGuideObligationInput(first,r,f.archive)
    const original=first.origins[0],before=r.serialize()
    adoptGuideObligationInput(first,r,f.archive);expect(r.serialize()).toBe(before)
    syntheticCarrier(f,{copied:JSON.parse(original.original.rawJson)},'new-synthetic-carrying-unit')
    const next=prepareGuideReplyObligationInput(f.main,f.before,f.options),same=next.origins.find(o=>o.legacyId===original.legacyId)!
    expect(same.id).toBe(original.id)
    expect(same.original).toEqual(original.original)
    expect(same.producers.some(p=>p.unitId==='new-synthetic-carrying-unit')).toBe(true)
    adoptGuideObligationInput(next,r,f.archive)
    expect(r.audit().originals).toHaveLength(first.origins.length)
    expect(r.originalProducerIds(original.id)).toContain('new-synthetic-carrying-unit')
    const reopened=ProofRegistry.open(r.serialize(),{...next.scope,caseId:next.caseId},next.context,{mechanics:[],reviews:[]})
    expect(reopened.originalProducerIds(original.id)).toEqual(r.originalProducerIds(original.id))
  }finally{f.close()}
})

it('blocks an original without a complete accepted source instead of fabricating its producer',async()=>{
  const f=await guideObligationFixture()
  try{
    f.need(f.before,f.branches,'An exact synthetic need that has not been emitted by a model')
    expect(()=>prepareGuideReplyObligationInput(f.main,f.before,f.options)).toThrow('senza unità AI accettata')
  }finally{f.close()}
})

it('binds an exact accepted missing-proof original and rejects a producer removed after its birth',async()=>{
  const f=await guideObligationFixture()
  try{
    const need=f.need(f.before,f.branches,'A synthetic metadata request with a source child'),key=syntheticCarrier(f,need,'synthetic-need-producer')
    const input=prepareGuideReplyObligationInput(f.main,f.before,f.options),r=registry(input);adoptGuideObligationInput(input,r,f.archive)
    expect(input.origins.find(o=>o.original.origin==='ai')!.producers.map(p=>p.unitId)).toEqual(['synthetic-need-producer'])
    const db=new DatabaseSync(f.file)
    try{db.prepare("DELETE FROM ai_evidence_values WHERE job_id=? AND role='guide-segment-unit-result-v1' AND key=?").run(f.archive.id,key)}finally{db.close()}
    expect(()=>prepareGuideReplyObligationInput(f.main,f.before,f.options)).toThrow('senza unità AI accettata')
  }finally{f.close()}
})

it('invalidates a formerly independent mapping when the same unit becomes a known carrier, including after reopen',async()=>{
  const f=await guideObligationFixture()
  try{
    const input=prepareGuideReplyObligationInput(f.main,f.before,f.options),r=registry(input);adoptGuideObligationInput(input,r,f.archive)
    const original=input.origins[0],responseJson=JSON.stringify({obligations:[],decisions:[{originalId:original.id,disposition:'clarify',formula:null,reason:'Synthetic independent admission before a new carrier is found',sourceIds:original.original.sourceIds}],work:[]})
    const review:ReviewReceipt={kind:'admission',requestId:'future-synthetic-carrier',contractVersion:'guide-obligations-1',scopeHash:r.scopeHash,contextHash:r.contextHash,responseHash:digest(responseJson),originalIds:[original.id],obligationIds:[],witnessRefs:[],sourceIds:input.context.sourceIds,competitors:{},bindingHash:null}
    r.importHostReceipts({mechanics:[],reviews:[review]});r.append({type:'admission',responseJson,receiptHash:digest(review)})
    expect(r.audit().originals.find(o=>o.id===original.id)!.status).toBe('clarify')
    syntheticCarrier(f,{copied:JSON.parse(original.original.rawJson)},review.requestId)
    adoptGuideObligationInput(prepareGuideReplyObligationInput(f.main,f.before,f.options),r,f.archive)
    expect(r.audit().originals.find(o=>o.id===original.id)!.status).toBe('invalidated')
    const reopened=ProofRegistry.open(r.serialize(),{...input.scope,caseId:input.caseId},input.context,{mechanics:[],reviews:[review]})
    expect(reopened.audit().originals.find(o=>o.id===original.id)!.status).toBe('invalidated')
    expect(()=>r.append({type:'admission',responseJson,receiptHash:digest(review)})).toThrow('bindings differ')
  }finally{f.close()}
})

it('rejects foreign scopes and cloned manifests before adopting any birth',async()=>{
  const f=await guideObligationFixture()
  try{
    const input=prepareGuideReplyObligationInput(f.main,f.before,f.options),r=registry(input)
    expect(()=>adoptGuideObligationInput(JSON.parse(JSON.stringify(input)),r,f.archive)).toThrow('non verificato')
    expect(()=>prepareGuideReplyObligationInput(f.main,f.before,{...f.options,scope:{...f.options.scope,jobId:'foreign'}})).toThrow('estraneo')
    expect([...f.archive.values('guide-obligation-original-birth-v1')]).toEqual([])
  }finally{f.close()}
})
