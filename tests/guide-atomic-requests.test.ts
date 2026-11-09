import {beforeAll,afterAll,it,expect} from 'vitest'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {readGuideWitnessLibrary} from '../src/main/guide-witness-library'
import {GuideAtomicReviewContext} from '../src/main/guide-atomic-requests'
import {callGuideSegmentBatch,guideSegmentUnitIdentity} from '../src/main/guide-segment-batch'
import {guideHash} from '../src/main/matchup-guide-packet'
import type {GuideAtomicFact} from '../src/main/guide-atomic-proofs'

let f:Awaited<ReturnType<typeof guideObligationFixture>>,context:GuideAtomicReviewContext
beforeAll(async()=>{f=await guideObligationFixture();context=new GuideAtomicReviewContext(readGuideWitnessLibrary(f.main,f.options),f.options)},60000)
afterAll(()=>f?.close())
function fixture(statement='Synthetic predicate for the request contract'){
  const store=context.createStore(),atom=store.predicate(statement,'Exact complete bodies, fixed native frame and current sources',['card:p'],{kind:'exists-line',frame:{firstTurnHash:null,drawsHash:null}},['synthetic-plan-unit'])
  const unit=store.units(atom)[0],request=context.request(atom,unit,3)
  const fact:GuideAtomicFact={atomId:atom.id,unitId:unit.id,verdict:'proves',reason:'Synthetic independent response for protocol tests, no real tactical approval.',sourceIds:['card:p'],
    witnesses:unit.witnesses.map(w=>({...w,turnNumbers:[1]})),needs:'none'}
  return {store,atom,unit,request,fact}
}
const history=()=>[...f.archive.values<any>('guide-segment-unit-result-v1')]

it('prepares full native proof bodies once, with a separate current evidence binding and no directory proof',()=>{
  const t=fixture(),data=t.request.data as any,witness=context.library.members.find(w=>w.id===t.unit.witnesses[0].id)!
  expect(data.proofs).toHaveLength(1)
  expect(data.proofs[0].journal).toEqual(witness.journal)
  expect(data.proofs[0].journal).toBe(witness.journal)
  expect(data).not.toHaveProperty('directory')
  expect(data.nativePacketHash).toBe(guideHash(f.options.packet))
  expect(data.packet).toEqual(f.options.packet)
  expect(t.request.outputCapacity?.packetHash).toBe(context.environment.evidenceHash)
  expect(()=>{data.proofs[0].journal.segments[0].body.draw='tamper'}).toThrow()
  expect(()=>context.request(t.atom,{...t.unit,witnesses:[]},0)).toThrow('fuori dal predicato')
  expect(()=>context.request(t.atom,t.unit,-1)).toThrow('riserva')
})

it('rejects omitted sources/bodies/turns and separates incomplete facts from new construction',()=>{
  const t=fixture()
  expect(t.request.read(t.fact)).toEqual(t.fact)
  expect(()=>t.request.read({...t.fact,sourceIds:[]})).toThrow()
  expect(()=>t.request.read({...t.fact,witnesses:[]})).toThrow()
  expect(()=>t.request.read({...t.fact,witnesses:t.fact.witnesses.map(w=>({...w,turnNumbers:[99]}))})).toThrow()
  expect(()=>t.request.read({...t.fact,verdict:'incomplete'})).toThrow('dipendenza')
  expect(t.request.read({...t.fact,verdict:'incomplete',needs:'source-evidence'}).needs).toBe('source-evidence')
  expect(()=>t.request.read({...t.fact,needs:'construct'})).toThrow()
})

it('authenticates the actual accepted batch child before creating a receipt or adding a fact',async()=>{
  const t=fixture('Accepted independent fake critic unit')
  await callGuideSegmentBatch([t.request],{archive:f.archive,stage:'obligation-facts',reserveCalls:3,call:async r=>r.read({units:[{unitId:guideSegmentUnitIdentity(t.request).unitId,response:t.fact}]})})
  const row=history().find(r=>r.value.unitId===guideSegmentUnitIdentity(t.request).unitId)!
  const receipt=context.receipt(t.atom,t.unit,t.request,row)
  t.store.addFact(t.atom,t.unit,t.fact,receipt)
  expect(t.store.derive(t.atom).status).toBe('verified')
  expect(()=>context.receipt(t.atom,t.unit,t.request,{...row,key:'forged'})).toThrow('non legata')
  const altered={...t.request,data:{...(t.request.data as object),proofs:[]}}
  expect(()=>context.receipt(t.atom,t.unit,altered,row)).toThrow('descrittore storico')
  const badValue={...row.value,value:{...t.fact,reason:'Not the raw response'}}
  expect(()=>context.receipt(t.atom,t.unit,t.request,{key:guideHash(badValue),value:badValue})).toThrow('diversa dal valore')
})

it('reconstructs only authenticated retry feedback, preserving child identities across reopen',async()=>{
  const t=fixture('Retry with a prior invalid fake response')
  await callGuideSegmentBatch([t.request],{archive:f.archive,stage:'obligation-facts',reserveCalls:3,call:async r=>r.read({units:[{unitId:guideSegmentUnitIdentity(t.request).unitId,response:{...t.fact,witnesses:[]}}]})})
  const next=context.request(t.atom,t.unit,3,f.archive)
  expect(next.retryOrdinal).toBe(1)
  expect(guideSegmentUnitIdentity(next).unitId).not.toBe(guideSegmentUnitIdentity(t.request).unitId)
  await callGuideSegmentBatch([next],{archive:f.archive,stage:'obligation-facts',reserveCalls:3,call:async r=>r.read({units:[{unitId:guideSegmentUnitIdentity(next).unitId,response:t.fact}]})})
  const rows=history(),accepted=rows.find(r=>r.value.unitId===guideSegmentUnitIdentity(next).unitId)!
  const restored=context.restoreRequest(t.atom,t.unit,context.snapshot(next),rows)
  expect(guideSegmentUnitIdentity(restored)).toEqual(guideSegmentUnitIdentity(next))
  expect(context.receipt(t.atom,t.unit,next,accepted,rows).responseHash).toBe(guideHash(t.fact))
  expect(()=>context.receipt(t.atom,t.unit,next,accepted)).toThrow('feedback del retry')
  const altered=context.snapshot(next);(altered.data as any).previousInvalid.raw={manual:'replacement'}
  expect(()=>context.restoreRequest(t.atom,t.unit,altered,rows)).toThrow('feedback del retry')
  expect(()=>context.restoreRequest(t.atom,t.unit,{...context.snapshot(next),retryOrdinal:2},rows)).toThrow('feedback del retry')
})

it('keeps local request identities stable as an unrelated native candidate arrives',async()=>{
  const t=fixture('Local request identity survives domain growth'),before=guideSegmentUnitIdentity(t.request)
  f.setConstructorNote('Another accepted synthetic declaration for a future domain')
  await f.adopt()
  const later=new GuideAtomicReviewContext(readGuideWitnessLibrary(f.main,f.options),f.options),store=later.createStore()
  expect(store.units(t.atom).length).toBeGreaterThan(t.store.units(t.atom).length)
  expect(guideSegmentUnitIdentity(later.request(t.atom,t.unit,9))).toEqual(before)
})

it('does not let packet, source or scope changes inherit the old local context',()=>{
  const library=context.library
  expect(()=>new GuideAtomicReviewContext(library,{...f.options,scope:{...f.options.scope,jobId:'foreign'}})).toThrow('scope')
  expect(()=>new GuideAtomicReviewContext(JSON.parse(JSON.stringify(library)),f.options)).toThrow('non verificata')
  const packet=structuredClone(f.options.packet);packet.sources[0].content='Changed source body'
  expect(()=>new GuideAtomicReviewContext(library,{...f.options,packet})).toThrow()
})
