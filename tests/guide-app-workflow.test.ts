import {it,expect} from 'vitest'
import {join} from 'node:path'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {AiAnalysisWork,readAiWorkflow} from '../src/main/ai-analysis-work'
import {appGuideWorkflowInput,authorizeAppGuideWorkflow,hasAppGuideNetworkAuthority} from '../src/main/guide-app-workflow'
import {guideUntilValidAuthority,GUIDE_UNLIMITED_CAPACITY} from '../src/main/guide-run-policy'
import {guideHash} from '../src/main/matchup-guide-packet'
import {generateDeepGuide,deepGuideReport} from '../src/main/matchup-guide-generation'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {readGuideDelivery} from '../src/main/guide-delivery-policy'
const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}

it('creates the policy only for an explicit new Matchup workflow and never for another AI action or disabled readiness',()=>{
 expect(appGuideWorkflowInput('thread-ask',[],true)).toEqual({kind:'thread-ask',args:[]})
 expect(appGuideWorkflowInput('matchup-generate',[],false)).toEqual({kind:'matchup-generate',args:[],guideVersion:1})
 for(const kind of ['matchup-generate','matchup-revise','matchup-continue'] as const)expect(appGuideWorkflowInput(kind,['frozen'],true)).toMatchObject({kind,args:['frozen'],guideVersion:1,guideConvergence:'until-valid'})
})
it('persists exact app authority across reopening without changing a paid legacy workflow or upgrading its call policy',()=>{
 const f=deliveryApplicationFixture(),dir=join(f.folder,'work');let work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal,{kind:'matchup-generate',args:['legacy'],guideVersion:1})
 try{
  const original=readAiWorkflow(dir,f.jobs,f.job.id)
  work.close();work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal,appGuideWorkflowInput('matchup-generate',['new'],true))
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config)
  expect(readAiWorkflow(dir,f.jobs,f.job.id)).toEqual(original);expect(guideUntilValidAuthority(work.archive)).toBeUndefined();expect(hasAppGuideNetworkAuthority(work)).toBe(true)
 }finally{work.close();f.close()}
})
it('binds a new action to its job, exact packet and model while rejecting retroactive authority and foreign projects',()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal,appGuideWorkflowInput('matchup-generate',['exact'],true))
 try{
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config);const authority=guideUntilValidAuthority(work.archive)!
  expect(authority).toMatchObject({jobId:f.job.id,projectId:f.project.id,packetHash:guideHash(f.options.packet),configHash:guideHash(config),callCeiling:null,repairCeiling:null,approvedAt:f.job.createdAt})
  expect(hasAppGuideNetworkAuthority(work)).toBe(true)
  expect(()=>authorizeAppGuideWorkflow(work,{...f.job,projectId:'foreign'},f.options.packet,config)).toThrow('richiesta utente')
  expect(()=>authorizeAppGuideWorkflow(work,f.job,f.options.packet,{...config,model:'other-model'})).toThrow('autorità diversa')
  expect(guideUntilValidAuthority(work.archive)).toEqual(authority)
 }finally{work.close();f.close()}
 const old=deliveryApplicationFixture(),paid=new AiAnalysisWork(join(old.folder,'work'),old.jobs,old.job.id,new AbortController().signal,appGuideWorkflowInput('matchup-generate',['cannot-retrofit'],true))
 try{paid.archive.saveValue('guide-attempt-start','001',{sequence:1});expect(()=>authorizeAppGuideWorkflow(paid,old.job,old.options.packet,config)).toThrow('job storico');expect(guideUntilValidAuthority(paid.archive)).toBeUndefined()}finally{paid.close();old.close()}
})
it('rejects malformed policy markers on recovery and cannot treat a marker alone as network authority',()=>{
 const f=deliveryApplicationFixture(),dir=join(f.folder,'work'),work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal,{kind:'matchup-generate',args:[],guideVersion:1,guideConvergence:'forged' as any})
 try{expect(()=>readAiWorkflow(dir,f.jobs,f.job.id)).toThrow('Contesto di ripresa');expect(hasAppGuideNetworkAuthority(work)).toBe(false);expect([...work.archive.values('guide-attempt-start')]).toHaveLength(0)}finally{work.close();f.close()}
})
it('runs the app workflow through three automatic repairs, approval, persistence and fresh-work recovery using a synthetic provider',async()=>{
 const f=deliveryApplicationFixture(true,true),dir=join(f.folder,'work');let work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal,appGuideWorkflowInput('matchup-generate',[f.project.id,f.meta.id,'999'],true))
 try{
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config);f.repeatCaseFailures(3)
  const request='Synthetic application action; not a live OpenAI integration test.'
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request,runner:async(prompt,_config,schema)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)})
  assertGuideSegmentApproval(guide,work.archive);expect(readGuideDelivery(work.archive).maximumCalls).toBe(GUIDE_UNLIMITED_CAPACITY)
  f.projects.saveMatchupReport(deepGuideReport({...guide.basis,jobId:f.job.id,generatedAt:new Date().toISOString(),sampleDeckUrl:null},guide))
  const calls=f.calls,workflow=readAiWorkflow(dir,f.jobs,f.job.id);work.close();work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal)
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config)
  expect(await generateDeepGuide({packet:f.options.packet,config,work,request,runner:async()=>{throw Error('No provider during completed recovery')}})).toEqual(guide)
  expect(readAiWorkflow(dir,f.jobs,f.job.id)).toEqual(workflow);expect(f.calls).toBe(calls)
  expect(f.projects.listMatchupReports(f.project.id,f.meta.id)[0].guide).toEqual(guide)
 }finally{work.close();f.close()}
},120000)
it('preserves the app authority and paid outcomes across a paused incomplete job, then resumes to approval without repurchasing them',async()=>{
 const f=deliveryApplicationFixture(),dir=join(f.folder,'paused-work'),controller=new AbortController();let work=new AiAnalysisWork(dir,f.jobs,f.job.id,controller.signal,appGuideWorkflowInput('matchup-generate',[f.project.id,f.meta.id,'999'],true)),dispatches=0
 const request='Synthetic paused app workflow; no network.'
 const respond=async(prompt:string,_config:unknown,schema:object)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)
 try{
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config);const authority=guideUntilValidAuthority(work.archive)
  await expect(generateDeepGuide({packet:f.options.packet,config,work,request,runner:async(prompt,config,schema)=>{if(++dispatches===5){controller.abort('pause');throw Error('Synthetic user pause before reply')}return respond(prompt,config,schema)}})).rejects.toThrow()
  const original=[...work.archive.values<any>('guide-segment-unit-result-v1')].map(r=>[r.key,guideHash(r.value)]);expect(original.length).toBeGreaterThan(0)
  f.jobs.suspend(f.job.id,'Synthetic user pause','user');work.close();f.jobs.retryAfterIntervention(f.job.id)
  work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal)
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config);expect(guideUntilValidAuthority(work.archive)).toEqual(authority)
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request,runner:respond});assertGuideSegmentApproval(guide,work.archive)
  for(const [key,hash]of original)expect(guideHash(work.archive.value('guide-segment-unit-result-v1',key))).toBe(hash)
  expect(readAiWorkflow(dir,f.jobs,f.job.id)?.guideConvergence).toBe('until-valid')
 }finally{work.close();f.close()}
},120000)
