import {it,expect} from 'vitest'
import {join} from 'node:path'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {guideHash} from '../src/main/matchup-guide-packet'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'

const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
it('rebuilds a stale derived value from a succeeded exact raw into its replacement slot without repurchasing or overwriting history',async()=>{
 const f=deliveryApplicationFixture(),dir=join(f.folder,'raw-chain');let work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal)
 const prompt='Exact logical request',transport='Exact full transport',inputHash=guideHash(transport),schema={type:'object',properties:{n:{type:'integer'}},required:['n'],additionalProperties:false},raw={n:3},key=guideHash(['analysis',prompt,config]),old={n:3,derived:999}
 const read=(raw:unknown)=>{assertNativeScenarioSchema(raw,schema);return {...raw as {n:number},derived:(raw as {n:number}).n*2}}
 const validation={id:'independent-derived-2',validate:(v:any)=>{expect(v.derived).toBe(v.n*2)}}
 try{
  f.jobs.saveCallResult(f.job.id,key,old)
  work.archive.saveValue('guide-prompt',inputHash,{stage:'repair-independent',prompt:transport,config})
  work.archive.saveValue('guide-output-schema',guideHash([prompt,schema]),{stage:'repair-independent',schema})
  work.archive.saveValue('guide-attempt-start','001',{sequence:1,inputHash,stage:'repair-independent'})
  work.archive.saveValue('guide-attempt-end','001',{sequence:1,inputHash,stage:'repair-independent',status:'succeeded'})
  work.archive.saveValue('guide-raw-response','001',{inputHash,stage:'repair-independent',raw})
  expect(work.restoreGuideRawCall('analysis',prompt,{...config,model:'foreign-model'},schema,read,validation,transport)).toBe(false)
  expect(work.restoreGuideRawCall('analysis',prompt,config,{type:'number'},read,validation,transport)).toBe(false)
  expect([...work.archive.values('guide-raw-cache-recovery-v2')]).toHaveLength(0)
  expect(work.cachedCall('analysis',prompt,config,validation)).toBeUndefined()
  expect(work.restoreGuideRawCall('analysis',prompt,config,schema,read,validation,()=>transport)).toBe(true)
  const receipt=[...work.archive.values<any>('guide-raw-cache-recovery-v2')][0].value
  expect(receipt).toMatchObject({version:2,originCacheKey:key,sourceSequence:'001'});expect(receipt.cacheKey).not.toBe(key)
  expect(f.jobs.callResult(f.job.id,key)!.value).toEqual(old)
  expect(await work.run('analysis',prompt,config,async()=>{throw Error('A valid paid raw must not be repurchased')},true,{cacheValidation:validation})).toEqual({n:3,derived:6})
  work.close();work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal)
  expect(await work.run('analysis',prompt,config,async()=>{throw Error('No provider after reopening')},true,{cacheValidation:validation})).toEqual({n:3,derived:6})
  expect([...work.archive.values('guide-attempt-start')]).toHaveLength(1);expect([...work.archive.values('guide-token-sample')]).toHaveLength(0)
  expect(work.archive.value<any>('guide-raw-response','001').raw).toEqual(raw)
  expect([...work.archive.values('ai-call-cache-validation-rejected')]).toHaveLength(1)
 }finally{work.close();f.close()}
})
it('cannot recover failed, foreign-schema or currently invalid raw evidence and preserves the stale cache',()=>{
 for(const status of ['failed','succeeded']){
  const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'invalid-chain'),f.jobs,f.job.id,new AbortController().signal),prompt='Independent request',transport='Independent transport',inputHash=guideHash(transport),schema={type:'integer'},key=guideHash(['analysis',prompt,config])
  try{
   f.jobs.saveCallResult(f.job.id,key,999)
   work.archive.saveValue('guide-prompt',inputHash,{stage:'repair-independent',prompt:transport,config})
   work.archive.saveValue('guide-output-schema',guideHash([prompt,schema]),{stage:'repair-independent',schema})
   work.archive.saveValue('guide-attempt-start','001',{sequence:1,inputHash,stage:'repair-independent'})
   work.archive.saveValue('guide-attempt-end','001',{sequence:1,inputHash,stage:'repair-independent',status})
   work.archive.saveValue('guide-raw-response','001',{inputHash,stage:'repair-independent',raw:status==='failed'?3:'invalid'})
   const validation={id:'independent-derived-2',validate:(v:any)=>{if(v!==6)throw Error('Current derivation rejected')}}
   expect(work.restoreGuideRawCall('analysis',prompt,config,schema,(raw:any)=>{assertNativeScenarioSchema(raw,schema);return raw*2},validation,transport)).toBe(false)
   expect(f.jobs.callResult(f.job.id,key)!.value).toBe(999);expect([...work.archive.values('guide-raw-cache-recovery-v2')]).toHaveLength(0)
  }finally{work.close();f.close()}
 }
})
