import {it,expect} from 'vitest'
import {join,resolve,dirname,sep} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
import {DatabaseSync,backup} from 'node:sqlite'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity,deepGuideReport} from '../src/main/matchup-guide-generation'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {readGuideDelivery} from '../src/main/guide-delivery-policy'
import {AiFailure} from '../src/main/ai-failure'
import {readAuditLanguageReview} from '../src/main/guide-audit-language-review'

it('integrates the bounded application path, complete readers, final approval and read-back with a synthetic provider',async()=>{
 const f=deliveryApplicationFixture(true,true),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null};let work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{
  const coldStarted=performance.now()
  const runner=async(prompt:string,_c:unknown,schema:object)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic bounded application guide only.',runner})
  const report=deepGuideReport({...guide.basis,jobId:f.job.id,generatedAt:'2026-11-06T09:00:00.000Z',sampleDeckUrl:null},guide)
  f.projects.saveMatchupReport(report);expect(f.projects.listMatchupReports(f.project.id,f.meta.id)[0].guide).toEqual(guide)
  expect(guide.chapters).toHaveLength(8);expect(guide.exercises).toHaveLength(2);assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
  const boundedAudits=[...work.archive.values<any>('guide-finite-request-v1')].map(r=>r.value.request).filter(r=>r.validationId==='guide-finite-audit-4')
  expect(boundedAudits.length).toBeGreaterThan(0)
  const setupTurn=[...work.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.stage==='segments-finite-setup-turns')!.value.value.body
  expect(setupTurn.events[0].decisionProof).toBeNull()
  const constructed=[...work.archive.values<any>('guide-finite-setup-constructed-v1')].map(r=>r.value)
  expect(constructed).toHaveLength(2)
  for(const setup of constructed){expect(setup.native.firstOpponentTurn.events[0].decisionProof.cards).toEqual(['e','p']);expect(setup.completeOriginalValidation).toBe(true);expect(setup.requiresIndependentPremiseReview).toBe(true)}
  expect([...work.archive.values('guide-finite-setup-negative-v1')]).toHaveLength(0)
  for(const audit of boundedAudits){expect(audit.data.auditNarrativeVersion).toBe(4);expect(audit.task).toContain('600');expect(audit.task).not.toMatch(/comparison1600|dN1000/);for(const node of [...Object.values<any>(audit.schema.properties.decisions.properties),...audit.schema.properties.tactical.type==='null'?[]:[audit.schema.properties.tactical.properties.comparison,...Object.values<any>(audit.schema.properties.tactical.properties.promotions.properties)]]){expect(node.properties.text.maxLength).toBe(600);expect(node.properties.parts.maxItems).toBe(24)}}
  expect(guide.generation.finiteOriginals?.planningMains.every((m:any)=>m.segments.length===1)).toBe(true)
  expect(f.stages).not.toContain('segments-main-opponent');expect(f.stages).not.toContain('segments-main-next');expect(f.stages).not.toContain('segments-finite-turn-events');expect(f.stages).toContain('review-delivery-outline')
  const policy=readGuideDelivery(work.archive);expect(policy.repairs).toBe(0);expect(policy.rows.length).toBe(guide.generation.attempts.length);const calls=f.calls
  const coldMs=performance.now()-coldStarted,warmStarted=performance.now();work.close();work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
  const recovered=await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic bounded application guide only.',runner:async()=>{throw Error('No repurchase')}})
  expect(recovered).toEqual(guide);expect(f.calls).toBe(calls)
  const warmMs=performance.now()-warmStarted
  await expect(generateDeepGuide({packet:{...f.options.packet,basis:{...f.options.packet.basis,opponentId:'other-matchup'}},config,work,request:'Synthetic bounded application guide only.',runner:async()=>{throw Error('No cross-matchup reuse')}})).rejects.toThrow('congelata')
  const noSeal=new Proxy(work.archive,{get(t,k){if(k==='value')return (role:string,key:string)=>role==='guide-delivery-final-v1'?undefined:t.value(role,key);const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})
  expect(()=>assertGuideSegmentApproval(guide,noSeal)).toThrow('attestazione finale')
  if(process.env.POKEGURU_DELIVERY_TEST_EXPORT){const output=resolve(process.env.POKEGURU_DELIVERY_TEST_EXPORT);if(!output.startsWith(resolve('.verify')+sep))throw Error('Export outside isolated test workspace');mkdirSync(dirname(output),{recursive:true});f.jobs.ready(f.job.id,report);f.jobs.transition(f.job.id,'applied');writeFileSync(output+'.requests.json',JSON.stringify([...work.archive.values('guide-finite-request-v1')].map(r=>r.value)));writeFileSync(join(dirname(output),'application-performance.json'),JSON.stringify({coldMs,warmMs,syntheticResponsesOnly:true,allNativeReadersAndPersistence:true,calls:f.calls,repairs:policy.repairs,peakRssMiB:process.resourceUsage().maxRSS/1024}));const db=new DatabaseSync(f.file,{readOnly:true});try{await backup(db,output)}finally{db.close()}}
 }finally{work.close();f.close()}
},120000)
it('blocks an actual provider without an authenticated app request or host authority',async()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{await expect(generateDeepGuide({packet:f.options.packet,config:{provider:'codex',source:'global',model:null,reasoningEffort:null},work,request:'Must not invoke the real provider.'})).rejects.toThrow('richiesta utente autenticata');expect([...work.archive.values('guide-attempt-start')]).toHaveLength(0)}finally{work.close();f.close()}
})
it('rejects an insufficient complete delivery allowance before purchasing a plan',async()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{await expect(generateDeepGuide({packet:f.options.packet,config:{provider:'codex',source:'global',model:null,reasoningEffort:null},work,request:'No underfunded generation.',callBudgetAuthorization:{jobId:f.job.id,projectId:f.project.id,dependencyHash:f.options.packet.basis.dependencyHash,maximum:145,reason:'Synthetic residual campaign authority, cannot enlarge the manifest.'},runner:async()=>{throw Error('Must not dispatch')}})).rejects.toMatchObject({code:'call-budget',budget:{stage:'delivery-admission',remainingCalls:145,requiredCalls:164}});expect([...work.archive.values('guide-attempt-start')]).toHaveLength(0)}finally{work.close();f.close()}
})
it.each(['case','text'] as const)('repairs a %s finding through unchanged independent readers with one shared durable reserve',async kind=>{
 const f=deliveryApplicationFixture(),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null},work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{
  if(kind==='case')f.caseFailure();else f.textFailure()
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic repair integration only.',runner:async(prompt,_c,schema)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)})
  assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
  const policy=readGuideDelivery(work.archive);expect(policy.repairs).toBeGreaterThan(0);expect(policy.repairs).toBeLessThanOrEqual(16)
  const calls=f.calls;const recovered=await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic repair integration only.',runner:async()=>{throw Error('No extra request')}});expect(recovered).toEqual(guide);expect(f.calls).toBe(calls)
  if(process.env.POKEGURU_DELIVERY_TEST_EXPORT){const output=resolve(process.env.POKEGURU_DELIVERY_TEST_EXPORT);if(!output.startsWith(resolve('.verify')+sep))throw Error('Export outside isolated test workspace');writeFileSync(output+'.'+kind+'.requests.json',JSON.stringify([...work.archive.values('guide-finite-request-v1')].map(r=>r.value)))}
 }finally{work.close();f.close()}
},120000)
it('refines a real archived output failure into whole-target audits and reuses all accepted work on reopen',async()=>{
 const f=deliveryApplicationFixture(),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null},work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal);let overflow=false
 try{
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic transport overflow only.',runner:async(prompt,_c,schema)=>{
   const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))
   if(!overflow&&stage==='review-premise-audit-language'&&data.units[0].data.targets.length>1){overflow=true;throw new AiFailure('output-limit','Synthetic truncated provider output')}
   return f.rawResponse(stage,data,schema)
  }})
  expect(overflow).toBe(true);assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
  expect([...work.archive.values('guide-delivery-audit-refinement-v1')]).toHaveLength(1)
  const aggregates=[...work.archive.values<any>('guide-delivery-audit-aggregate-v1')],split=aggregates.find(r=>r.value.plan.groups.length===2)!
  expect(split).toBeDefined();expect(split.value.plan.groups.flatMap((g:any)=>g.targetIds).sort()).toEqual(split.value.targets.map((t:any)=>t.id).sort())
  const ref={unitId:'aggregate-'+(await import('../src/main/matchup-guide-packet')).guideHash(split.value.fullData),outcomeKey:split.key,partitioned:true as const}
  expect(readAuditLanguageReview(ref,work).value.verdict).toBe('pass')
  const archive=new Proxy(work.archive,{get(t,k){if(k==='value')return (role:string,key:string)=>role==='guide-segment-unit-result-v1'&&key===split.value.refs[0].outcomeKey?undefined:t.value(role,key);const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})
  expect(()=>readAuditLanguageReview(ref,{archive})).toThrow('originale indipendente mancante')
  const calls=f.calls;expect(await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic transport overflow only.',runner:async()=>{throw Error('No repurchase')}})).toEqual(guide);expect(f.calls).toBe(calls)
 }finally{work.close();f.close()}
},120000)
it.each(['timeout','network','auth','quota'] as const)('stops on a %s with one durable invocation, no publication and no automatic retry on reopen',async code=>{
 const f=deliveryApplicationFixture(),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null},work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal);let calls=0
 try{
  const options={packet:f.options.packet,config,work,request:'Synthetic service failure only.',runner:async()=>{calls++;throw new AiFailure(code,'Synthetic service stop')}}
  await expect(generateDeepGuide(options)).rejects.toThrow('Synthetic service stop');await expect(generateDeepGuide(options)).rejects.toThrow('Synthetic service stop')
  expect(calls).toBe(1);expect(readGuideDelivery(work.archive).rows).toHaveLength(1);expect([...work.archive.values('guide-delivery-final-v1')]).toHaveLength(0);expect(f.projects.listMatchupReports(f.project.id,f.meta.id)).toHaveLength(0)
 }finally{work.close();f.close()}
},120000)
it.each(['pause','cancel'] as const)('acknowledges %s and preserves consumption before an explicit reopen',async reason=>{
 const f=deliveryApplicationFixture(),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null},controller=new AbortController();let work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,controller.signal),calls=0
 try{
  await expect(generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic interruption only.',runner:async()=>{calls++;controller.abort(reason);throw new AiFailure(reason==='pause'?'paused':'cancelled','Synthetic interruption')}})).rejects.toMatchObject({code:reason==='pause'?'paused':'cancelled'})
  expect(calls).toBe(1);expect(readGuideDelivery(work.archive)).toMatchObject({repairs:0});expect([...work.archive.values('guide-attempt-end')]).toHaveLength(1);expect([...work.archive.values('guide-delivery-final-v1')]).toHaveLength(0)
  if(reason==='pause'){work.close();work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal);await expect(generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic interruption only.',runner:async()=>{calls++;throw new AiFailure('auth','Synthetic fresh explicit resume')}})).rejects.toThrow('Synthetic fresh explicit resume');expect(calls).toBe(2);expect(readGuideDelivery(work.archive).repairs).toBe(1)}
 }finally{work.close();f.close()}
},120000)
