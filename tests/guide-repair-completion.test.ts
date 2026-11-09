import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {AiJobStore} from '../src/main/ai-job-store'
import {ProjectStore} from '../src/main/project-store'
import {AiFailure} from '../src/main/ai-failure'
import {assertConstructedRepair} from '../src/shared/guide-scenario-output'
import type {AiRunConfig} from '../src/shared/ai'
const config:AiRunConfig={provider:'codex',source:'global',model:null,reasoningEffort:null}
const guard={id:'fixture-repair-validation-1',validate:assertConstructedRepair}
const incomplete={changeSummary:'Riparazione non completata: nessuna modifica proposta e nessun finding risolto.',scenarios:[]}
const complete={changeSummary:'Riparazione completata; le modifiche richiedono il riesame indipendente.',scenarios:[]}
function setup(){
 const folder=mkdtempSync(join(tmpdir(),'guide-repair-cache-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),project=projects.create({name:'Cache validation fixture',format:'STANDARD'});projects.close()
 const jobs=new AiJobStore(path),job=jobs.start('matchup-generate',project.id,'fixture'),work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal,{kind:'matchup-generate',args:[],guideVersion:1})
 return {jobs,job,work,dispose:()=>{work.close();jobs.close();if(resolve(dirname(folder))!==resolve(tmpdir()))throw new Error('Unexpected test directory');rmSync(folder,{recursive:true,force:true})}}
}
it('rejects explicit incomplete repairs even when an empty transaction leaves the old cases well formed',()=>{
 for(const text of ['Riparazione non completata: nessuna modifica proposta.','La transazione è incompleta.','La correzione non è stata completata.','Non ho completato la riparazione richiesta.'])expect(()=>assertConstructedRepair({cases:[{operations:[]}],changeSummary:text})).toThrow('RIPARAZIONE NON COMPLETATA')
})
it('keeps completed repairs, conditional losing lines and legitimate source limitations admissible',()=>{
 for(const text of ['Riparazione completata; attendo la critica.','Il ramo completo perde: la ritirata non impedisce il KO.','Nessuna correzione necessaria dopo il controllo delle fonti.','La limitazione riguarda una variante non osservata.'])expect(()=>assertConstructedRepair({changeSummary:text})).not.toThrow()
})
it('revalidates old cached values and stores a valid replacement without overwriting the immutable original',async()=>{
 const s=setup();try{
  await s.work.run('analysis','repair-fixture',config,async()=>incomplete)
  expect(s.work.cachedCall('analysis','repair-fixture',config,guard)).toBeUndefined()
  let refreshed=0
  expect(await s.work.run('analysis','repair-fixture',config,async()=>{refreshed++;return complete},true,{cacheValidation:guard})).toEqual(complete)
  expect(await s.work.run('analysis','repair-fixture',config,async()=>{refreshed++;return complete},true,{cacheValidation:guard})).toEqual(complete)
  expect(refreshed).toBe(1);expect(s.work.cachedCall('analysis','repair-fixture',config)!.value).toEqual(incomplete)
  expect(s.work.cachedCall('analysis','repair-fixture',config,guard)!.value).toEqual(complete)
  const rejected=[...s.work.archive.values<any>('ai-call-cache-rejected')];expect(rejected).toHaveLength(1);expect(s.jobs.callResult(s.job.id,rejected[0].value.replacementKey)!.value).toEqual(complete)
 }finally{s.dispose()}
})
it('does not replace an incomplete cache when the normal budget guard stops refresh, and preserves its retry journal',async()=>{
 const s=setup();try{
  await s.work.run('analysis','bounded-fixture',config,async()=>incomplete)
  await expect(s.work.run('analysis','bounded-fixture',config,async()=>{throw new AiFailure('call-budget','Budget guard preserved')},true,{cacheValidation:guard,resumeAfterBudgetReplan:true})).rejects.toThrow('Budget guard preserved')
  const rejected=[...s.work.archive.values<any>('ai-call-cache-rejected')][0].value
  expect(s.jobs.callResult(s.job.id,rejected.replacementKey)).toBeUndefined();expect(s.jobs.callState(s.job.id,rejected.replacementKey)).toMatchObject({status:'blocked',failures:1,code:'call-budget'})
  expect(s.work.cachedCall('analysis','bounded-fixture',config)!.value).toEqual(incomplete)
  expect(await s.work.run('analysis','bounded-fixture',config,async()=>complete,true,{cacheValidation:guard,resumeAfterBudgetReplan:true})).toEqual(complete)
 }finally{s.dispose()}
})
it('classifies a fresh incomplete value as invalid and never stores it as a successful cache',async()=>{
 const s=setup();try{
  await expect(s.work.run('analysis','fresh-invalid',config,async()=>incomplete,true,{cacheValidation:guard,maximumStructuralFailures:1})).rejects.toMatchObject({code:'invalid-response'})
  expect(s.work.cachedCall('analysis','fresh-invalid',config)).toBeUndefined()
 }finally{s.dispose()}
})

it('keeps the first immutable rejection while a stricter validation version gets its own evidence and replacement',async()=>{
 const s=setup();try{
  const prompt='versioned-repair-fixture';await s.work.run('analysis',prompt,config,async()=>incomplete)
  await s.work.run('analysis',prompt,config,async()=>complete,true,{cacheValidation:guard})
  const original=[...s.work.archive.values<any>('ai-call-cache-rejected')][0],bytes=JSON.stringify(original),next={...guard,id:'fixture-repair-validation-2'};let calls=0
  expect(await s.work.run('analysis',prompt,config,async()=>{calls++;return complete},true,{cacheValidation:next})).toEqual(complete)
  expect(s.work.cachedCall('analysis',prompt,config,next)!.value).toEqual(complete);expect(calls).toBe(1)
  expect(JSON.stringify([...s.work.archive.values<any>('ai-call-cache-rejected')][0])).toBe(bytes)
  expect([...s.work.archive.values<any>('ai-call-cache-validation-rejected')]).toHaveLength(2)
  expect(s.work.rejectedCachedCall('analysis',prompt,config,next.id)!.validationId).toBe(next.id)
  expect(s.work.rejectedCachedCall('analysis',prompt,config,guard.id)!.validationId).toBe(guard.id)
 }finally{s.dispose()}
})
