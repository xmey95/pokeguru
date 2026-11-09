import {it,expect} from 'vitest'
import {join} from 'node:path'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {AiAnalysisWork,readAiWorkflow} from '../src/main/ai-analysis-work'
import {appGuideWorkflowInput,authorizeAppGuideWorkflow} from '../src/main/guide-app-workflow'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'
import {hasMinimumGuideTransport,pinMinimumGuideTransport} from '../src/main/guide-transport-selection'
import {createGuideRequestPlanner,unpackGuideData} from '../src/main/guide-request-budget'

const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
it('pins compact selection on new app actions and retains it across paid recovery',()=>{
 const f=deliveryApplicationFixture(),dir=join(f.folder,'transport');let work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal,appGuideWorkflowInput('matchup-generate',[],true))
 try{
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config);expect(hasMinimumGuideTransport(work.archive)).toBe(true)
  work.archive.saveValue('guide-attempt-start','001',{sequence:1});const workflow=readAiWorkflow(dir,f.jobs,f.job.id)
  work.close();work=new AiAnalysisWork(dir,f.jobs,f.job.id,new AbortController().signal);authorizeAppGuideWorkflow(work,f.job,f.options.packet,config)
  expect(hasMinimumGuideTransport(work.archive)).toBe(true);expect(readAiWorkflow(dir,f.jobs,f.job.id)).toEqual(workflow)
  expect(()=>pinMinimumGuideTransport(work.archive,f.options.packet,{...config,model:'different'})).toThrow('modello')
 }finally{work.close();f.close()}
})
it('does not upgrade old until-valid workflows, historical paid jobs or malformed markers',()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'legacy'),f.jobs,f.job.id,new AbortController().signal,{kind:'matchup-generate',args:[],guideVersion:1,guideConvergence:'until-valid'})
 try{
  authorizeAppGuideWorkflow(work,f.job,f.options.packet,config);expect(hasMinimumGuideTransport(work.archive)).toBe(false)
  work.archive.saveValue('guide-attempt-start','001',{sequence:1});expect(()=>pinMinimumGuideTransport(work.archive,f.options.packet,config)).toThrow('job storico')
  expect(hasMinimumGuideTransport(work.archive)).toBe(false)
 }finally{work.close();f.close()}
 const bad=deliveryApplicationFixture(),invalid=new AiAnalysisWork(join(bad.folder,'bad'),bad.jobs,bad.job.id,new AbortController().signal,{kind:'matchup-generate',args:[],guideVersion:1,guideTransport:'forged' as any})
 try{expect(()=>readAiWorkflow(invalid.directory,bad.jobs,bad.job.id)).toThrow('ripresa');expect(hasMinimumGuideTransport(invalid.archive)).toBe(false)}finally{invalid.close();bad.close()}
})
it('rejects foreign or malformed transport policies before planning',()=>{
 const f=deliveryApplicationFixture()
 try{
  expect(()=>pinMinimumGuideTransport(f.archive,f.options.packet,config)).toThrow('autorità')
  authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:independent-transport-test',new Date().toISOString())
  f.archive.saveValue('guide-transport-selection-v1','policy',{version:1,selection:'minimum-visible',jobId:'foreign'})
  expect(()=>hasMinimumGuideTransport(f.archive)).toThrow('estranea')
 }finally{f.close()}
})
it('chooses an exact smaller transport below target while retaining all schema, facts and dynamic budget checks',()=>{
 const data={sources:Array.from({length:40},(_,i)=>({id:'independent-'+i,content:'Complete printed costs, amounts, effects, conditions and timing. '.repeat(12)}))},schema={type:'object',properties:{answer:{type:'string',maxLength:600}},required:['answer'],additionalProperties:false},plan=createGuideRequestPlanner(true)
 const before=plan('plan','Exact independent facts',data,schema,[],100,4,1,false,true,true,true),after=plan('plan','Exact independent facts',data,schema,[],100,4,1,true,true,true,true)
 expect(before.budget.encoding).toBe('plain');expect(before.budget.fitsTarget).toBe(true);expect(after.budget.visibleTokens).toBeLessThan(before.budget.visibleTokens)
 expect(unpackGuideData(after.data)).toEqual(data);expect(after.budget.reservedOutput).toBe(before.budget.reservedOutput);expect(after.budget.margin).toBe(before.budget.margin)
 const blocked=plan('plan','Exact independent facts',data,schema,[],4,4,1,true,true,true,true)
 expect(blocked.budget.fits).toBe(false);expect(unpackGuideData(blocked.data)).toEqual(data)
})
