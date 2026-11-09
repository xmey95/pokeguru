import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {finiteGuideRuntime} from '../src/main/guide-finite-runtime'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import {guideFiniteInstructions} from '../src/main/guide-finite-instructions'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {DatabaseSync} from 'node:sqlite'

function fixture(kind:string){
 const f=deliveryApplicationFixture(true,true),schema={type:'object',properties:{value:{type:'string',const:'ok'}},required:['value'],additionalProperties:false},read=(raw:unknown)=>{assertNativeScenarioSchema(raw,schema);return raw};let calls=0,bad=false
 const runtime=finiteGuideRuntime({...f.options,call:async request=>{
  calls++
  return request.read({units:(request.data as any).units.map((u:any)=>({unitId:u.unitId,response:{value:bad?'invalid':'ok'}}))})
 }})
 const run=(modern=false,change=false)=>runGuideSegmentPhase([{id:'turn',request:()=>({stage:'segment-independent-ours',role:'constructor',instructions:modern?guideFiniteInstructions('declaration'):'Original historical instructions',task:modern?'Declare physical development with deferred audits.':'Original historical task',data:{packet:f.options.packet,caseId:'independent',slotId:'round-1-ours',prefix:{id:'independent',turns:{}},frozen:change?'changed':'same'},schema,read,cacheValidation:{id:kind,validate:read},reserveCalls:0}),accept:()=>{}}],{...runtime,stage:'segments-finite-setup-turns'})
 return {...f,run,get calls(){return calls},reject(){bad=true}}
}
it.each(['guide-finite-setup-turn-1','guide-delivery-turn-1','guide-delivery-turn-2'])('reuses paid %s declarations after guidance changes, while changed physical inputs require a new request',async kind=>{
 const f=fixture(kind);try{await f.run();const original=[...f.archive.values('guide-segment-unit-result-v1')],descriptors=[...f.archive.values('guide-finite-request-v1')];expect(f.calls).toBe(1);await f.run(true);expect(f.calls).toBe(1);expect([...f.archive.values('guide-segment-unit-result-v1')]).toEqual(original);expect([...f.archive.values('guide-finite-request-v1')]).toEqual(descriptors);await f.run(true,true);expect(f.calls).toBe(2)}finally{f.close()}
})
it.each(['guide-finite-setup-turn-1','guide-delivery-turn-1','guide-delivery-turn-2'])('keeps two rejected %s replies exhausted under new declaration instructions',async kind=>{
 const f=fixture(kind);try{f.reject();await expect(f.run()).rejects.toMatchObject({code:'invalid-response'});expect(f.calls).toBe(2);const original=[...f.archive.values('guide-segment-unit-result-v1')];await expect(f.run(true)).rejects.toMatchObject({code:'invalid-response'});expect(f.calls).toBe(2);expect([...f.archive.values('guide-segment-unit-result-v1')]).toEqual(original)}finally{f.close()}
})
it('rechecks the original paid source after an asynchronous reuse instead of trusting the locator index',async()=>{
 const f=fixture('guide-finite-setup-turn-1');try{
  await f.run();await f.run(true);const row=[...f.archive.values<any>('guide-segment-unit-result-v1')][0],db=new DatabaseSync(f.file)
  try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.job.id,'guide-segment-unit-result-v1',row.key)}finally{db.close()}
  await expect(f.run(true)).rejects.toThrow('originali autentici');expect(f.calls).toBe(1)
 }finally{f.close()}
})
