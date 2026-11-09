import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { runRecoverableAiCall, type AiCallState } from '../src/main/ai-call-retry'
import { AiFailure, aiFailureCode } from '../src/main/ai-failure'
import { codexErrorEvent, codexFailure } from '../src/main/codex-failure'
import { AiJobStore } from '../src/main/ai-job-store'
import { ProjectStore } from '../src/main/project-store'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'

it('releases a persisted controller pause only on explicit intervention, preserving paid work and content failures',()=>{
 const folder=mkdtempSync(join(tmpdir(),'controller-pause-')),file=join(folder,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file)
 try{
  const p=projects.create({name:'Controller pause',format:'STANDARD'}),j=jobs.start('matchup-generate',p.id,'same'),other=jobs.start('matchup-generate',p.id,'other')
  jobs.saveCallResult(j.id,'paid',{original:true})
  jobs.saveCallState(j.id,'pending',{status:'blocked',code:'paused',failures:1})
  jobs.saveCallState(j.id,'content',{status:'blocked',code:'invalid-response',failures:3})
  jobs.saveCallState(other.id,'pending',{status:'blocked',code:'paused',failures:1})
  expect(()=>jobs.retryAfterIntervention(j.id)).toThrow('non riprendibile')
  jobs.suspend(j.id,'Controller boundary stop','failure');jobs.resume(j.id)
  expect(jobs.callState(j.id,'pending')?.code).toBe('paused')
  jobs.suspend(j.id,'Controller boundary stop','failure');jobs.retryAfterIntervention(j.id)
  expect(jobs.callState(j.id,'pending')).toBeUndefined()
  expect(jobs.callState(other.id,'pending')?.code).toBe('paused')
  expect(jobs.callState(j.id,'content')).toMatchObject({code:'invalid-response',failures:3})
  expect(jobs.callResult(j.id,'paid')?.value).toEqual({original:true})
 }finally{jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}
})

it.each([1073807364,3221225786,-1073741510])('classifies Windows process interruption %s without guessing user intent or service failure',code=>{
 const error=codexFailure('PRIVATE INPUT',code)
 expect(error).toMatchObject({code:'process-interrupted',providerDetails:{reason:'process-terminated',exitCode:code,httpStatus:null}})
 expect(error.message).not.toContain('PRIVATE');expect(codexFailure('Unclassified exit',1).code).toBe('unknown')
 expect(codexFailure('429 rate limit',code).code).toBe('quota')
 expect(codexFailure('HTTP 401',code).providerDetails?.httpStatus).toBe(401)
})
it.each(['unknown','process-interrupted'] as const)('requires explicit job intervention for %s even when instructions change',code=>{
 const folder=mkdtempSync(join(tmpdir(),'explicit-job-guard-')),file=join(folder,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file)
 let work:AiAnalysisWork|undefined
 try{
  const p=projects.create({name:'Synthetic interrupted job',format:'STANDARD'}),j=jobs.start('matchup-generate',p.id,'same'),other=jobs.start('matchup-generate',p.id,'other')
  jobs.saveCallResult(j.id,'paid',{original:true});jobs.saveCallState(j.id,'old-input',{status:'blocked',code,failures:1,message:'Original transport stop'})
  jobs.saveCallState(j.id,'semantic',{status:'blocked',code:'invalid-response',failures:2});jobs.saveCallState(other.id,'transport',{status:'blocked',code,failures:1})
  work=new AiAnalysisWork(join(folder,'work'),jobs,j.id,new AbortController().signal)
  expect(()=>work!.assertTransportResumeAuthorized()).toThrow('Original transport stop')
  jobs.suspend(j.id,'Original transport stop','failure');jobs.resume(j.id);expect(()=>work!.assertTransportResumeAuthorized()).toThrow('Original transport stop')
  jobs.suspend(j.id,'Original transport stop','failure');jobs.retryAfterIntervention(j.id);jobs.resume(j.id)
  expect(()=>work!.assertTransportResumeAuthorized()).not.toThrow();expect(jobs.callResult(j.id,'paid')?.value).toEqual({original:true});expect(jobs.callState(j.id,'semantic')?.failures).toBe(2);expect(jobs.blockedTransportFailure(other.id)?.code).toBe(code)
 }finally{work?.close();jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}
})

it('distinguishes rejected output parameters and schemas from actual incomplete output without exposing provider text',()=>{
 for(const text of ["Unsupported parameter: 'max_output_tokens' PRIVATE",'max_output_tokens is not supported PRIVATE','HTTP 400 invalid_request_error for max_output_tokens PRIVATE']){
  const error=codexFailure(text,1);expect(error.code).toBe('provider');expect(error.providerDetails?.reason).toBe('invalid-request');expect(JSON.stringify(error)).not.toContain('PRIVATE')
 }
 expect(codexFailure('Invalid schema: max_output_tokens PRIVATE',1).code).toBe('invalid-schema')
 expect(codexFailure('Incomplete response returned for schema: reason=max_output_tokens limit PRIVATE',1).code).toBe('output-limit')
 expect(codexFailure('HTTP 503 max_output_tokens PRIVATE',1).code).toBe('network')
})

it('resumes an explicitly extended structural policy without resetting already consumed failures',async()=>{
 let state:AiCallState|undefined={failures:2,status:'blocked',code:'invalid-response',message:'Old ceiling'},calls=0,now=0
 const journal={read:()=>state,write:(v:AiCallState)=>{state=v}}
 const result=await runRecoverableAiCall(async()=>{calls++;if(calls<3)throw new AiFailure('invalid-response','New diagnostic');return 'valid'},journal,{signal:new AbortController().signal,maximumStructuralFailures:5,now:()=>now,wait:async ms=>{now+=ms}})
 expect(result).toBe('valid');expect(calls).toBe(3);expect(state).toMatchObject({status:'complete',failures:4});expect(now).toBe(2000)
})
it.each(['auth','context-limit','invalid-schema','quota','unknown'] as const)('never reopens %s by increasing only the structural policy',async code=>{
 let calls=0;const state:AiCallState={failures:2,status:'blocked',code,message:'Blocked'}
 await expect(runRecoverableAiCall(async()=>{calls++;return 'bad'}, {read:()=>state,write:()=>undefined},{signal:new AbortController().signal,maximumStructuralFailures:16,resumeAfterBudgetReplan:true})).rejects.toMatchObject({code});expect(calls).toBe(0)
})

it('retries an unclassified failure only after explicit intervention, preserving paid results, semantic stops and guide accounting',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'pokeguru-explicit-unknown-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path)
 try{
  const project=projects.create({name:'Synthetic explicit retry',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'unknown'),other=jobs.start('thread-ask',project.id,'other')
  const guide={formatVersion:1 as const,attempts:39,failedAttempts:12,attemptLimit:56,inputTokens:1,outputTokens:1,cachedInputTokens:0,durationMs:1,localErrors:0,reviewFindings:1,validated:false}
  jobs.recordDiagnostics(job.id,{guide});jobs.saveCallResult(job.id,'paid',{acceptedSyntheticResult:true})
  jobs.saveCallState(job.id,'pending',{status:'blocked',failures:1,code:'unknown',message:'Unclassified synthetic exit'})
  for(const code of ['invalid-response','invalid-schema','context-limit','no-progress','call-budget'] as const)jobs.saveCallState(job.id,code,{status:'blocked',failures:1,code})
  jobs.saveCallState(other.id,'pending',{status:'blocked',failures:1,code:'unknown'});jobs.suspend(job.id,'Unknown exit','failure')
  const journal={read:()=>jobs.callState(job.id,'pending'),write:(state:AiCallState)=>jobs.saveCallState(job.id,'pending',state)},execute=vi.fn(async()=> 'synthetic-success')
  jobs.resume(job.id)
  await expect(runRecoverableAiCall(execute,journal,{signal:new AbortController().signal,maximumStructuralFailures:16,resumeAfterBudgetReplan:true})).rejects.toMatchObject({code:'unknown'});expect(execute).not.toHaveBeenCalled()
  jobs.suspend(job.id,'Still blocked','failure');expect(jobs.automaticResumable()).toEqual([])
  jobs.retryAfterIntervention(job.id)
  expect(jobs.callState(job.id,'pending')).toBeUndefined();expect(jobs.callState(other.id,'pending')?.code).toBe('unknown')
  for(const code of ['invalid-response','invalid-schema','context-limit','no-progress','call-budget'])expect(jobs.callState(job.id,code)?.status).toBe('blocked')
  expect(jobs.callResult(job.id,'paid')?.value).toEqual({acceptedSyntheticResult:true});expect(jobs.get(job.id)!.progress!.diagnostics!.guide).toEqual(guide)
  jobs.resume(job.id);expect(await runRecoverableAiCall(execute,journal,{signal:new AbortController().signal})).toBe('synthetic-success');expect(execute).toHaveBeenCalledTimes(1)
  expect(jobs.get(job.id)!.progress!.diagnostics!.guide).toEqual(guide)
 }finally{jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}
})
it.each(['token-budget','call-budget'] as const)('replans a local %s stop only when explicitly requested and retains every prior failure',async code=>{
 let state:AiCallState={failures:3,status:'blocked',code,message:'Old estimate'},calls=0
 const journal={read:()=>state,write:(v:AiCallState)=>{state=v}}
 await expect(runRecoverableAiCall(async()=>{calls++;return 'bad'},journal,{signal:new AbortController().signal})).rejects.toMatchObject({code});expect(calls).toBe(0)
 await expect(runRecoverableAiCall(async()=>{calls++;throw new AiFailure(code,'Still outside hard limits')},journal,{signal:new AbortController().signal,resumeAfterBudgetReplan:true})).rejects.toThrow('Still outside hard limits')
 expect(state.failures).toBe(4)
 expect(await runRecoverableAiCall(async()=>{calls++;return 'fits'},journal,{signal:new AbortController().signal,resumeAfterBudgetReplan:true})).toBe('fits');expect(state.failures).toBe(4)
})

it('can restrict a scoped rebuild to one failure without raising the default retry budgets',async()=>{
  let calls=0,state:AiCallState|undefined
  await expect(runRecoverableAiCall(async()=>{calls++;throw new AiFailure('invalid-response','Incomplete rebuild')},{read:()=>state,write:v=>{state=v}},{signal:new AbortController().signal,maximumFailures:1})).rejects.toThrow('Incomplete rebuild')
  expect(calls).toBe(1);expect(state).toMatchObject({failures:1,status:'blocked',code:'invalid-response'})
})

it('persists quota deadline and attempt budget across a paused wait and database reopen', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'pokeguru-retry-')), path = join(folder, 'data.sqlite')
  const projects = new ProjectStore(path)
  let jobs = new AiJobStore(path)
  try {
    const project = projects.create({ name: 'Retry', format: 'STANDARD' })
    const job = jobs.start('thread-ask', project.id, 'thread')
    const journal = { read: () => jobs.callState(job.id, 'quota'), write: (state: AiCallState) => jobs.saveCallState(job.id, 'quota', state) }
    let now = 1000, calls = 0
    const execute = async () => { calls++; throw new AiFailure('quota', 'Limite temporaneo', 90_000) }
    const controller = new AbortController()
    await expect(runRecoverableAiCall(execute, journal, { signal: controller.signal, now: () => now,
      wait: async (ms) => { expect(ms).toBe(30_000); now += 5000; controller.abort('pause'); throw new Error('AbortError') } }))
      .rejects.toMatchObject({ code: 'paused' })
    expect(calls).toBe(1)
    expect(journal.read()).toMatchObject({ status: 'waiting', failures: 1, nextAttemptAt: 91_000 })
    jobs.close(); jobs = new AiJobStore(path)
    const delays: number[] = []
    await expect(runRecoverableAiCall(execute, journal, { signal: new AbortController().signal, now: () => now,
      wait: async (ms) => { delays.push(ms); now += ms } })).rejects.toMatchObject({ code: 'quota' })
    expect(delays.reduce((sum, ms) => sum + ms, 0)).toBe(175_000)
    expect(calls).toBe(3)
    expect(journal.read()).toMatchObject({ status: 'blocked', failures: 3 })
    await expect(runRecoverableAiCall(execute, journal, { signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'quota' })
    expect(calls).toBe(3)
  } finally { jobs.close(); projects.close(); rmSync(folder, { recursive: true, force: true }) }
})

it.each(['context-limit', 'storage-full', 'auth', 'invalid-schema', 'output-limit'] as const)('never repeats an unchanged structural failure: %s', async (code) => {
  let state: AiCallState | undefined, calls = 0
  const journal = { read: () => state, write: (value: AiCallState) => { state = value } }
  for (let reopen = 0; reopen < 2; reopen++) await expect(runRecoverableAiCall(async () => {
    calls++; throw new AiFailure(code, 'richiede intervento')
  }, journal, { signal: new AbortController().signal, wait: async () => { throw new Error('must not wait') } }))
    .rejects.toMatchObject({ code })
  expect(calls).toBe(1)
})

it('recovers transient failures within the budget and does not count a user pause as failure', async () => {
  let state: AiCallState | undefined, calls = 0, now = 0
  const journal = { read: () => state, write: (value: AiCallState) => { state = value } }
  expect(await runRecoverableAiCall(async () => {
    if (++calls < 3) throw new AiFailure('network', 'rete')
    return 'completato'
  }, journal, { signal: new AbortController().signal, now: () => now, wait: async (ms) => { now += ms } })).toBe('completato')
  expect(now).toBe(3000)
  expect(state).toMatchObject({ failures: 2, status: 'complete' })
  state = undefined
  const controller = new AbortController()
  await expect(runRecoverableAiCall(async () => { controller.abort('pause'); throw new Error('interrupted') }, journal,
    { signal: controller.signal })).rejects.toMatchObject({ code: 'paused' })
  expect(state).toMatchObject({ failures: 0, status: 'running' })
})

it('classifies provider failures without leaking raw messages or confusing context with disk limits', () => {
  const raw = codexErrorEvent(JSON.stringify({ type: 'turn.failed', error: { message: 'maximum context length: PRIVATE CONTENT' } }))
  expect(codexFailure(raw)).toMatchObject({ code: 'context-limit' })
  expect(codexFailure(raw).message).not.toContain('PRIVATE')
  expect(codexErrorEvent(JSON.stringify({ type: 'item.completed', message: 'quota' }))).toBe('')
  expect(codexFailure('429 rate limit; retry-after: 45')).toMatchObject({ code: 'quota', retryAfterMs: 45_000 })
  expect(aiFailureCode(new Error('SQLITE_FULL: database or disk is full'))).toBe('storage-full')
  expect(codexFailure('Not logged in')).toMatchObject({ code: 'auth' })
})

it('identifies rejected schemas and HTTP provider errors without persisting raw private text',()=>{
 expect(codexFailure('Incomplete response returned: reason=max_output_tokens PRIVATE',1)).toMatchObject({code:'output-limit',providerDetails:{reason:'output-limit',exitCode:1}})
 expect(codexFailure('Incomplete response returned: reason=max_output_tokens PRIVATE',1).message).not.toContain('PRIVATE')
 const event=codexErrorEvent(JSON.stringify({type:'turn.failed',error:{message:'HTTP 400 Invalid schema: too many enum values PRIVATE '+ 'secret'.repeat(3000)}}))
 const error=codexFailure(event,1)
 expect(error).toMatchObject({code:'invalid-schema',providerDetails:{reason:'enum-limit',httpStatus:400,exitCode:1}})
 expect(error.message).not.toContain('PRIVATE');expect(JSON.stringify(error)).not.toContain('secret')
 expect(codexFailure('Unexpected status 400 Bad Request PRIVATE',2)).toMatchObject({code:'provider',providerDetails:{reason:'invalid-request',httpStatus:400}})
 expect(codexFailure('HTTP 503 temporarily unavailable PRIVATE',1)).toMatchObject({code:'network',providerDetails:{reason:'server',httpStatus:503}})
})
