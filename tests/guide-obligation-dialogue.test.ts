import {it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {prepareGuideReplyObligationInput} from '../src/main/guide-obligation-input'
import {advanceGuideObligationDialogue,restoreGuideObligationDialogue} from '../src/main/guide-obligation-dialogue'
import {guideHash} from '../src/main/matchup-guide-packet'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {GuideObligationMappingContext} from '../src/main/guide-obligation-mapping'

async function fixture(){
  const f=await guideObligationFixture(),input=prepareGuideReplyObligationInput(f.main,f.before,f.options)
  let calls=0,interrupt:number|null=null,invalidReview=false,revise=false,reviseAlways=false
  const stages:string[]=[]
  const options:GuideConstructionRuntime={...f.options,reserveOutside:3,remainingCalls:()=>100-calls,call:async request=>{
    calls++;stages.push(request.stage);if(calls===interrupt)throw Error('Synthetic provider interruption')
    const units=(request.data as any).units.map((unit:any)=>{
      const data=unit.data,sourceIds=data.original.sourceIds
      if(request.role==='constructor')return {unitId:unit.unitId,response:{originId:data.original.id,inputHash:data.inputHash,disposition:'map',witnessScope:'single-line',atoms:[{label:'a1',statement:'Synthetic predicate: '+data.original.rawJson,conditions:'Exact root and fixed hypothetical conditions, test-only semantics.',sourceIds,policy:{kind:'exists-line',frame:{firstTurnHash:null,drawsHash:null}}}],nodes:[{atom:'a1'}],root:0,reason:data.previousMapping?'A synthetic revised mapping after the complete prior criticism.':'A synthetic first proposal.',sourceIds}}
      return {unitId:unit.unitId,response:{originId:data.original.id,inputHash:data.inputHash,proposalHash:data.proposalHash,verdict:revise?'revise':'accept',reason:revise?'Synthetic logical issue must be corrected.':'Synthetic independent mapping accepted for protocol testing.',sourceIds,
        checks:{wholeOriginal:!invalidReview,conditions:true,quantifiers:!revise,witnessIdentity:true,domain:true,invariants:true},missingWitnessIds:[]}}
    })
    if(request.role==='critic'){invalidReview=false;if(!reviseAlways)revise=false}
    return request.read({units})
  }}
  const remove=(role:string,key:string)=>{const db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,role,key)}finally{db.close()}}
  return {...f,input,options,stages,get calls(){return calls},interruptAt(n:number){interrupt=n},invalidNextCritic(){invalidReview=true},reviseNextCritic(){revise=true},keepRevising(){revise=true;reviseAlways=true},remove}
}

it('runs propose/review automatically, restores without writes/calls and leaves facts open',async()=>{
  const f=await fixture()
  try{
    const state=await advanceGuideObligationDialogue(f.input,f.options)
    expect(state.origins.every(o=>o.status==='mapped')).toBe(true)
    expect(state.registry.audit().originals.every(o=>o.status==='open')).toBe(true)
    expect(state.registry.audit().obligationsClosed).toBe(false)
    expect(f.stages).toEqual(['obligation-decompositions','obligation-mapping-reviews'])
    const counts=[...f.archive.values('guide-obligation-dialogue-request-v1')].length,calls=f.calls
    const restored=restoreGuideObligationDialogue(f.input,f.archive)
    expect(restored.registry.serialize()).toBe(state.registry.serialize())
    expect(restored.sourceHash).toBe(state.sourceHash)
    expect([...f.archive.values('guide-obligation-dialogue-request-v1')]).toHaveLength(counts)
    await advanceGuideObligationDialogue(f.input,f.options)
    expect(f.calls).toBe(calls)
  }finally{f.close()}
})

it('resumes only the pending critic after a process interruption without repurchasing proposals',async()=>{
  const f=await fixture()
  try{
    f.interruptAt(2)
    await expect(advanceGuideObligationDialogue(f.input,f.options)).rejects.toThrow('provider interruption')
    expect(restoreGuideObligationDialogue(f.input,f.archive).origins.every(o=>o.status==='review')).toBe(true)
    const before=f.calls,state=await advanceGuideObligationDialogue(f.input,f.options)
    expect(f.calls-before).toBe(1)
    expect(f.stages.at(-1)).toBe('obligation-mapping-reviews')
    expect(state.origins.every(o=>o.status==='mapped')).toBe(true)
  }finally{f.close()}
})

it('preserves invalid-format critics and retries only those children with fresh transport identities',async()=>{
  const f=await fixture()
  try{
    f.invalidNextCritic()
    const state=await advanceGuideObligationDialogue(f.input,f.options)
    expect(f.calls).toBe(3)
    expect(state.origins.every(o=>o.status==='mapped')).toBe(true)
    const rows=[...f.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.stage==='obligation-mapping-reviews')
    expect(rows.some(r=>r.value.accepted===false&&r.value.retryOrdinal===0)).toBe(true)
    expect(rows.some(r=>r.value.accepted===true&&r.value.retryOrdinal===1)).toBe(true)
    expect([...f.archive.values<any>('guide-obligation-dialogue-outcome-v1')].length).toBeGreaterThan(state.origins.length*2)
  }finally{f.close()}
})

it('revises the mapping from all prior critical output without turning a negative into a branch request',async()=>{
  const f=await fixture()
  try{
    f.reviseNextCritic()
    const first=await advanceGuideObligationDialogue(f.input,f.options)
    expect(first.origins.every(o=>o.status==='revise')).toBe(true)
    expect(first.registry.audit().originals.every(o=>o.status==='proposed')).toBe(true)
    const next=await advanceGuideObligationDialogue(f.input,f.options)
    expect(next.origins.every(o=>o.status==='mapped'&&o.round===1)).toBe(true)
    expect(f.calls).toBe(4)
    const secondRound=[...f.archive.values<any>('guide-obligation-dialogue-request-v1')].filter(r=>r.value.round===1&&r.value.phase==='proposal')
    expect(secondRound.every(r=>r.value.feedback.length===1&&r.value.request.data.previousMapping.reviews.length===1)).toBe(true)
    expect(next.registry.audit().obligationsClosed).toBe(false)
  }finally{f.close()}
})

it('detects missing negative raw responses, descriptors and opinion receipts on pure reopen',async()=>{
  for(const kind of ['raw','request','receipt'] as const){
    const f=await fixture()
    try{
      f.keepRevising();await advanceGuideObligationDialogue(f.input,f.options)
      const receipts=[...f.archive.values<any>('guide-obligation-dialogue-outcome-v1')],requests=[...f.archive.values<any>('guide-obligation-dialogue-request-v1')]
      const negative=receipts.find(r=>requests.find(q=>q.key===r.value.requestKey)!.value.phase==='review')!
      if(kind==='raw')f.remove('guide-segment-unit-result-v1',negative.value.outcomeKey)
      else if(kind==='request')f.remove('guide-obligation-dialogue-request-v1',negative.value.requestKey)
      else f.remove('guide-obligation-dialogue-outcome-v1',negative.key)
      expect(()=>restoreGuideObligationDialogue(f.input,f.archive)).toThrow(kind==='receipt'?'ricevuta durevole':'opinione conosciuta')
    }finally{f.close()}
  }
})

it('rejects a foreign runtime and reserves the output-implied critic floor before paying proposals',async()=>{
  const f=await fixture()
  try{
    await expect(advanceGuideObligationDialogue(f.input,{...f.options,scope:{...f.options.scope,jobId:'foreign'}})).rejects.toThrow('runtime diverso')
    expect(f.calls).toBe(0)
    const need=f.need(f.before,f.branches,'A synthetic bound need for the reserve stress test'),value={...need,requirements:Array.from({length:10},(_,i)=>({...need.requirements[0],goal:'Distinct synthetic goal '+i}))}
    // Replace no real content: isolated fixture-only new metadata and its
    // explicit synthetic accepted source, after removing the fixture precursor.
    f.remove('guide-metadata-needs-v1',guideHash(need));f.archive.saveValue('guide-metadata-needs-v1',guideHash(value),value)
    const carrier={stage:'synthetic-metadata',batchHash:'synthetic',unitId:'synthetic-carrier',unitKey:'synthetic-carrier',retryOrdinal:0,accepted:true,value,raw:value}
    f.archive.saveValue('guide-segment-unit-result-v1',guideHash(carrier),carrier)
    const input=prepareGuideReplyObligationInput(f.main,f.before,f.options)
    expect(input.origins.length).toBeGreaterThan(10)
    await expect(advanceGuideObligationDialogue(input,{...f.options,remainingCalls:()=>8})).rejects.toThrow()
    expect(f.calls).toBe(0)
  }finally{f.close()}
})

it('reuses logical admission after domain growth while requiring fresh facts for the new current library',async()=>{
  const f=await fixture()
  try{
    const first=await advanceGuideObligationDialogue(f.input,f.options),before=f.calls
    f.setConstructorNote('A new synthetic native witness, independent of the logical mapping')
    const adopted=await f.adopt()
    const carrier={stage:'synthetic-metadata',batchHash:'synthetic-growth',unitId:'synthetic-growth-carrier',unitKey:'synthetic-growth-carrier',retryOrdinal:0,accepted:true,value:adopted.first,raw:adopted.first}
    f.archive.saveValue('guide-segment-unit-result-v1',guideHash(carrier),carrier)
    const next=prepareGuideReplyObligationInput(f.main,adopted.plan,f.options)
    expect(next.library.members.length).toBeGreaterThan(f.input.library.members.length)
    const restored=restoreGuideObligationDialogue(next,f.archive),oldIds=new Set(first.origins.map(o=>o.originId))
    expect(restored.origins.filter(o=>oldIds.has(o.originId)).every(o=>o.status==='mapped')).toBe(true)
    expect(restored.registry.audit().obligationsClosed).toBe(false)
    expect(f.calls).toBe(before)
    const ids=restored.atoms.map(a=>a.id)
    expect(ids).toEqual(first.atoms.map(a=>a.id))
  }finally{f.close()}
})

it('retains a born metadata original after it leaves the latest construction view, without writes on reopen',async()=>{
  const f=await fixture()
  try{
    const need=f.need(f.before,f.branches,'A synthetic need which must survive a later plan')
    const carrier={stage:'synthetic-metadata',batchHash:'synthetic-retention',unitId:'synthetic-retention-source',unitKey:'synthetic-retention-source',retryOrdinal:0,accepted:true,value:need,raw:need}
    f.archive.saveValue('guide-segment-unit-result-v1',guideHash(carrier),carrier)
    const input=prepareGuideReplyObligationInput(f.main,f.before,f.options),state=await advanceGuideObligationDialogue(input,f.options)
    const needed=input.origins.find(o=>o.original.origin==='ai')!
    // The source itself remains immutable; the next native plan has another
    // construction hash, so the old pending need is absent from its input view.
    f.setConstructorNote('Distinct accepted native declaration for a later construction')
    const nextPlan=await f.adopt()
    const extra={...carrier,unitId:'synthetic-next-source',unitKey:'synthetic-next-source',value:nextPlan.first,raw:nextPlan.first}
    f.archive.saveValue('guide-segment-unit-result-v1',guideHash(extra),extra)
    const next=prepareGuideReplyObligationInput(f.main,nextPlan.plan,f.options),restored=restoreGuideObligationDialogue(next,f.archive)
    expect(restored.origins.some(o=>o.originId===needed.id)).toBe(true)
    expect(restored.registry.audit().originals.length).toBeGreaterThanOrEqual(state.registry.audit().originals.length)
    expect(restored.origins.find(o=>o.originId===needed.id)!.status).toBe('mapped')
  }finally{f.close()}
})

it('refuses forged historical capture indexes and never turns one into a current native library',async()=>{
  const f=await fixture()
  try{
    await advanceGuideObligationDialogue(f.input,f.options)
    const captured=[...f.archive.values<any>('guide-obligation-mapping-capture-v1')][0],changed=structuredClone(captured.value)
    changed.directory.members[0].nativeHash='f'.repeat(64)
    const key=guideHash(changed);f.archive.saveValue('guide-obligation-mapping-capture-v1',key,changed)
    expect(()=>GuideObligationMappingContext.openCapture(key,f.input,f.archive)).toThrow('indice storico')
    const wrongFrame=structuredClone(captured.value);wrongFrame.mainHash='f'.repeat(64)
    const other=guideHash(wrongFrame);f.archive.saveValue('guide-obligation-mapping-capture-v1',other,wrongFrame)
    expect(()=>GuideObligationMappingContext.openCapture(other,f.input,f.archive)).toThrow('altro frame')
  }finally{f.close()}
})
