import {beforeAll,afterAll,it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {readGuideWitnessLibrary} from '../src/main/guide-witness-library'
import {GuideAtomicReviewContext} from '../src/main/guide-atomic-requests'
import {reviewGuideAtomicPredicate,restoreGuideAtomicReviews,saveGuideAtomicReviewOutcome} from '../src/main/guide-atomic-review'
import {guideSegmentUnitIdentity,callGuideSegmentBatch} from '../src/main/guide-segment-batch'
import {guideHash} from '../src/main/matchup-guide-packet'
import type {GuideAtomicFact} from '../src/main/guide-atomic-proofs'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'
let f:Awaited<ReturnType<typeof guideObligationFixture>>,context:GuideAtomicReviewContext
beforeAll(async()=>{f=await guideObligationFixture();f.setConstructorNote('Another complete synthetic witness for review-session tests');await f.adopt();context=new GuideAtomicReviewContext(readGuideWitnessLibrary(f.main,f.options),f.options)},60000)
afterAll(()=>f?.close())
function fixture(statement:string,kind:'exists-line'|'all-pairs'='all-pairs',verdict:GuideAtomicFact['verdict']='proves'){
  const store=context.createStore(),atom=store.predicate(statement,'Synthetic exact finite-domain test, no real tactical approval',['card:p'],kind==='exists-line'?{kind,frame:{firstTurnHash:null,drawsHash:null}}:{kind,frame:{firstTurnHash:null,drawsHash:null},focusId:null,frameMode:'declared-conditional'},['synthetic-author'])
  let calls=0,interrupt:number|null=null
  const options:GuideConstructionRuntime={...f.options,reserveOutside:3,call:async r=>{
    calls++;if(calls===interrupt)throw new Error('Synthetic interrupted provider')
    const data=r.data as any
    return r.read({units:data.units.map((child:any)=>({unitId:child.unitId,response:{atomId:child.data.predicate.id,unitId:child.data.unit.id,verdict,
      reason:'Explicit synthetic independent response, not a real guide pass.',sourceIds:['card:p'],witnesses:child.data.unit.witnesses.map((w:any)=>({...w,turnNumbers:[1]})),needs:verdict==='incomplete'?'source-evidence':'none'}}))})
  },estimate:r=>{const p=f.options.estimate(r);return {...p,estimatedInput:r.units!>1?129000:p.estimatedInput,fits:r.units!<=1&&p.fits,fitsTarget:r.units!<=1&&p.fitsTarget}}}
  return {atom,store,options,get calls(){return calls},interruptAt(n:number){interrupt=n}}
}

it('reopens from authenticated host requests and raw accepted children without any new call or write',async()=>{
  const t=fixture('A full finite-domain review and pure reopen')
  const result=await reviewGuideAtomicPredicate(context,t.atom,t.options)
  expect(result.derive(t.atom).status).toBe('verified')
  expect(t.calls).toBe(result.units(t.atom).length)
  const before=[...f.archive.values('guide-atomic-request-v1')],calls=t.calls
  const reopened=restoreGuideAtomicReviews(context,t.atom,f.archive)
  expect(reopened.serialize()).toBe(result.serialize())
  expect([...f.archive.values('guide-atomic-request-v1')]).toEqual(before)
  expect((await reviewGuideAtomicPredicate(context,t.atom,t.options)).derive(t.atom).status).toBe('verified')
  expect(t.calls).toBe(calls)
})

it('resumes only missing local units after interruption, preserving successful siblings',async()=>{
  const t=fixture('An interrupted review retains paid successful children');t.interruptAt(2)
  await expect(reviewGuideAtomicPredicate(context,t.atom,t.options)).rejects.toThrow('Synthetic interrupted provider')
  const reopened=restoreGuideAtomicReviews(context,t.atom,f.archive),before=t.calls
  expect(reopened.derive(t.atom).provenUnitIds).toHaveLength(1)
  const missing=reopened.pendingWork(t.atom).filter(w=>w.needs==='critique').length
  const complete=await reviewGuideAtomicPredicate(context,t.atom,t.options)
  expect(t.calls-before).toBe(missing)
  expect(complete.derive(t.atom).status).toBe('verified')
})

it('stops the remaining existential search after a complete positive group',async()=>{
  const t=fixture('A single complete positive is sufficient for this existential claim','exists-line')
  const result=await reviewGuideAtomicPredicate(context,t.atom,t.options)
  expect(result.units(t.atom).length).toBeGreaterThan(1)
  expect(result.derive(t.atom).status).toBe('verified')
  expect(t.calls).toBe(1)
})

it('keeps numerical/source gaps out of critic retry and branch-construction loops',async()=>{
  const t=fixture('An incomplete source analysis stays a source dependency','all-pairs','incomplete')
  const result=await reviewGuideAtomicPredicate(context,t.atom,t.options),before=t.calls
  expect(result.derive(t.atom)).toMatchObject({status:'needs-evaluation',constructionAuthorized:false})
  expect(result.pendingWork(t.atom).every(w=>w.needs==='source-evidence')).toBe(true)
  expect((await reviewGuideAtomicPredicate(context,t.atom,t.options)).derive(t.atom).status).toBe('needs-evaluation')
  expect(t.calls).toBe(before)
})

it('retains contradictory accepted opinions and blocks a missing descriptor instead of hiding the negative',async()=>{
  const t=fixture('Historical contradictory independent opinions remain explicit')
  await reviewGuideAtomicPredicate(context,t.atom,t.options)
  const unit=t.store.units(t.atom)[0],request=context.request(t.atom,unit,3)
  const fact:GuideAtomicFact={atomId:t.atom.id,unitId:unit.id,verdict:'does-not-prove',reason:'Synthetic second opinion contradicts the first.',sourceIds:['card:p'],witnesses:unit.witnesses.map(w=>({...w,turnNumbers:[1]})),needs:'none'}
  await callGuideSegmentBatch([request],{archive:f.archive,stage:'obligation-facts',reserveCalls:3,call:async r=>r.read({units:[{unitId:guideSegmentUnitIdentity(request).unitId,response:fact}]})})
  expect(restoreGuideAtomicReviews(context,t.atom,f.archive).derive(t.atom).status).toBe('conflicted')
  const saved=[...f.archive.values<any>('guide-atomic-request-v1')].find(r=>r.value.atomId===t.atom.id&&r.value.proofUnitId===unit.id)!
  const db=new DatabaseSync(f.file)
  try{db.prepare("DELETE FROM ai_evidence_values WHERE job_id=? AND role='guide-atomic-request-v1' AND key=?").run(f.archive.id,saved.key)}finally{db.close()}
  expect(()=>restoreGuideAtomicReviews(context,t.atom,f.archive)).toThrow('opinione conosciuta')
})

it('detects a missing negative raw opinion from its durable receipt instead of retaining only the positive',async()=>{
  const t=fixture('A missing negative opinion cannot disappear on reopen')
  await reviewGuideAtomicPredicate(context,t.atom,t.options)
  const unit=t.store.units(t.atom)[0],request=context.request(t.atom,unit,3)
  const fact:GuideAtomicFact={atomId:t.atom.id,unitId:unit.id,verdict:'does-not-prove',reason:'Synthetic independently archived conflicting negative.',sourceIds:['card:p'],witnesses:unit.witnesses.map(w=>({...w,turnNumbers:[1]})),needs:'none'}
  const history=[...f.archive.values<any>('guide-segment-unit-result-v1')]
  const value={stage:'obligation-facts',batchHash:'synthetic-actual-transport-group',...guideSegmentUnitIdentity(request),accepted:true,value:fact,raw:fact},key=guideHash(value)
  saveGuideAtomicReviewOutcome(context,t.atom,unit,request,{key,value},f.archive,history)
  expect(restoreGuideAtomicReviews(context,t.atom,f.archive).derive(t.atom).status).toBe('conflicted')
  const db=new DatabaseSync(f.file)
  try{db.prepare("DELETE FROM ai_evidence_values WHERE job_id=? AND role='guide-segment-unit-result-v1' AND key=?").run(f.archive.id,key)}finally{db.close()}
  expect(()=>restoreGuideAtomicReviews(context,t.atom,f.archive)).toThrow('opinione conosciuta')
})

it('respects the total future call reserve before sending a critic batch',async()=>{
  const t=fixture('Call reserves are still required for an atomic review')
  await expect(reviewGuideAtomicPredicate(context,t.atom,{...t.options,remainingCalls:()=>3})).rejects.toThrow()
  expect(t.calls).toBe(0)
})

it('rejects a foreign runtime before invoking any provider',async()=>{
  const t=fixture('Foreign scope isolation for an atomic session')
  await expect(reviewGuideAtomicPredicate(context,t.atom,{...t.options,scope:{...t.options.scope,projectId:'foreign'}})).rejects.toThrow('runtime diverso')
  expect(t.calls).toBe(0)
})
