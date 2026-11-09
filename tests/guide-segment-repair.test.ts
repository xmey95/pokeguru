import {it,expect} from 'vitest'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {guideHash} from '../src/main/matchup-guide-packet'
import {constructGuideMainLines} from '../src/main/guide-mainline-phase'
import {constructGuideReplyBranches,constructGuideReplyPlans,type GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {constructGuideScenarioMetadata} from '../src/main/guide-scenario-metadata'
import {guideSegmentReviewRequest,type GuideSegmentReview,type GuideSegmentConstruction} from '../src/main/guide-segment-review'
import {beginGuideSegmentRepair,executeGuideSegmentRepair,latestGuideSegmentRepair} from '../src/main/guide-segment-repair'
import {guideSegmentDeclarations} from '../src/main/guide-segments'
import {planGuideRequest} from '../src/main/guide-request-budget'
import {invalidatedGuideIds} from '../src/main/matchup-guide-generation'
import type {GuideSegmentRequest} from '../src/main/guide-segment-generation'
import type {GuideContent} from '../src/shared/matchup-guide'
import {assertGuideReport} from '../src/shared/matchup-guide'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {constructGuideScenarioEvaluations} from '../src/main/guide-scenario-evaluation'
import {loadGuideSegmentCheckpoint} from '../src/main/guide-segment-checkpoints'
import {saveGuideSegmentReviewContext} from '../src/main/guide-segment-review-history'
import {reviewGuideSegmentConstruction,readArchivedGuideSegmentReview,estimateGuideSegmentFinalReviewReserve} from '../src/main/guide-segment-review'
import {guideChapterKinds,readGuideReview} from '../src/shared/matchup-guide'
import {compactGuideSchema,shortGuideSchemaRefs} from '../src/main/guide-schema-encoding'

async function open(){
 const parent=resolve('.verify/app225-segments-20261102');mkdirSync(parent,{recursive:true})
 const folder=mkdtempSync(join(parent,'repair-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path)
 const project=projects.create({name:'Synthetic segment repair',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic-repair'),fixture=syntheticSegmentProtocol(project.id)
 let archive=new AiEvidenceArchive(path,job),left=64,interrupt=false
 const stages:string[]=[],scope={projectId:project.id,jobId:job.id,dependencyHash:fixture.packet.basis.dependencyHash,configHash:'synthetic-repair'}
 const runtime=():GuideConstructionRuntime=>({scope,packet:fixture.packet,archive,call:async<T>(r:GuideSegmentRequest<T>)=>{if(interrupt){interrupt=false;throw Error('Synthetic interruption before provider')}stages.push(r.stage);left--;return r.read(fixture.response(r.stage,r.data,r.schema))},estimate:r=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],left,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>left,reserveOutside:3,check:()=>{}})
 const setups=['scenario-1','scenario-2'].map(id=>{
  const plan=fixture.response('plan',{}, {}) as any,raw=fixture.response('setup-1',{caseId:id},{}) as any
  return {...raw.caseSetup,opening:plan.initialOpenings[0].opening}
 })
 const mains=(await constructGuideMainLines({...runtime(),setups})).map(r=>r.journal),plans=await constructGuideReplyPlans(mains,runtime()),branches=await constructGuideReplyBranches(mains,plans,runtime()),built=await constructGuideScenarioMetadata(mains,plans,branches,runtime())
 const construction:GuideSegmentConstruction={mains,plans,branches,built},draft:GuideContent={chapters:[],exercises:[],claims:built.flatMap(b=>b.content.claims),scenarios:built.flatMap(b=>b.content.scenarios),limitations:[...new Set(built.flatMap(b=>b.content.limitations))],changeSummary:'Synthetic complete cases.'}
 return {path,fixture,scope,stages,runtime,construction,draft,setLeft:(n:number)=>{left=n},interrupt:()=>{interrupt=true},reopen:()=>{archive.close();archive=new AiEvidenceArchive(path,job)},close:()=>{archive.close();jobs.close();projects.close()}}
}
function negative(s:Awaited<ReturnType<typeof open>>,repair:any):GuideSegmentReview{
 const view={...s.draft,scenarios:[s.draft.scenarios[0]]},request=guideSegmentReviewRequest(view,s.construction,{...s.runtime(),stage:'review-synthetic-case',task:'Review one complete case.',scopeKind:'scenarios'})
 const data=request.data as any,review=request.read({verdict:'revise',findings:[{severity:'major',targetId:'scenario-1',message:'Synthetic source interpretation requires the assigned correction.',correction:'Correct the assigned native point.',sourceIds:['card:p'],proposedActions:[],counterlines:[],repair}],checks:['Keep the semantic finding explicit.'],revalidatedIds:[],textCorrections:[],draftHash:data.draftHash,constructionHash:data.constructionHash,reviewContextHash:data.reviewContextHash,resolutionAudit:[]})
 s.runtime().archive.saveValue('guide-segment-review-v1',guideHash(['scenario-1',review]),{unitId:'scenario-1',review})
 saveGuideSegmentReviewContext(s.runtime(),'scenario-1',review,request)
 return review
}
it('partitions oversized final critics across every case while retaining ALL prose and full-guide checks in every text unit',async()=>{
 const s=await open()
 try{
  const prose=s.fixture.response('prose',{requestedChapterKinds:guideChapterKinds,includeExercises:true},{}) as GuideContent
  const draft={...s.draft,chapters:prose.chapters,exercises:prose.exercises},runtime=s.runtime()
  const baseEstimate=(r:GuideSegmentRequest<any>)=>planGuideRequest(r.stage,r.instructions,r.data,shortGuideSchemaRefs(compactGuideSchema(r.schema)),[],runtime.remainingCalls(),r.reserveCalls,r.units,false,true,true,true).budget
  const observed:any[]=[];let providerCalls=0
  const options={...runtime,reserveOutside:0,stage:'review-final-partition-fixture',task:'Review the complete synthetic guide.',final:true,readReview:(raw:unknown)=>readGuideReview(raw),estimate:(r:GuideSegmentRequest<any>)=>{
   const p=baseEstimate(r),units=(r.data as any).units??[]
   if(units.length>1)return {...p,estimatedResponseCharacters:100001,fits:false,fitsTarget:false}
   return units.some((u:any)=>u.data.reviewScope.kind==='guide-text'&&u.data.draft.scenarios.length===2)?{...p,estimatedInput:129000,fits:false,fitsTarget:false}:p
  },call:async<T>(r:GuideSegmentRequest<T>)=>{
   providerCalls++
   const data=r.data as any
   for(const unit of data.units??[])if(unit.data.reviewScope.kind==='guide-text')observed.push(unit.data)
   const raw=s.fixture.response(r.stage,r.data,r.schema) as any
   const index=(data.units??[]).findIndex((u:any)=>u.data.reviewScope.proofCaseIds?.[0]==='scenario-2')
   if(index>=0)raw.units[index].response={...raw.units[index].response,verdict:'revise',findings:[{severity:'major',targetId:'chapter-summary',message:'Clarify the second case in the shared prose.',correction:'Explain the declared cost more precisely.',sourceIds:['card:p'],proposedActions:[],counterlines:[],repair:{kind:'text',targetId:'chapter-summary'}}]}
   return r.read(raw)
  }}
  const futureProseBudget={reservedOutput:16000,estimatedResponseCharacters:44000}
  const forecast=estimateGuideSegmentFinalReviewReserve(draft,s.construction,{...options,futureProseBudget})
  expect(forecast.reserveCalls).toBe(4);expect(forecast.textUnitsReserved).toBe(2);expect(providerCalls).toBe(0)
  const uncertain=estimateGuideSegmentFinalReviewReserve(draft,s.construction,{...options,futureProseBudget,estimate:r=>{
   const p=options.estimate(r),units=(r.data as any).units??[]
   return units.length===1&&units[0].data.reviewScope.kind==='guide-text'&&units[0].data.draft.scenarios.length===1?{...p,estimatedInput:125000,fits:false,fitsTarget:false}:p
  }})
  expect(uncertain.projectedGrowthUncertainUnits).toHaveLength(2);expect(uncertain.reserveCalls).toBe(4)
  await expect(reviewGuideSegmentConstruction(draft,s.construction,{...options,remainingCalls:()=>3})).rejects.toMatchObject({code:'call-budget'})
  expect(providerCalls).toBe(0)
  const reviews=await reviewGuideSegmentConstruction(draft,s.construction,options)
  expect(providerCalls).toBe(4)
  expect(reviews).toHaveLength(4);expect(reviews.filter(r=>r.verdict==='revise')).toHaveLength(1)
  expect(observed.map(d=>d.reviewScope.proofCaseIds[0]).sort()).toEqual(['scenario-1','scenario-2'])
  for(const data of observed){
   expect(data.draft.chapters).toEqual(draft.chapters);expect(data.draft.exercises).toEqual(draft.exercises);expect(data.draft.claims).toEqual(draft.claims)
   expect(data.localChecks.errors).toEqual([]);expect(data.reviewScope.allScenarioIds).toEqual(['scenario-1','scenario-2'])
   expect(data.contexts.every((c:any)=>c.scenarioId===data.reviewScope.proofCaseIds[0])).toBe(true)
  }
  const bad=[...runtime.archive.values<any>('guide-segment-review-v1')].find(v=>v.value.unitId==='guide-text-case-scenario-2')!.value
  s.reopen();expect(readArchivedGuideSegmentReview(bad.unitId,bad.review,draft,s.construction,s.runtime()).verdict).toBe('revise')
  const altered=structuredClone(draft);altered.scenarios[0].assumptions.push('A different complete guide.')
  expect(()=>readArchivedGuideSegmentReview(bad.unitId,bad.review,altered,s.construction,s.runtime())).toThrow('guida completa diversa')
  expect(()=>guideSegmentReviewRequest({...draft,scenarios:[draft.scenarios[1]],chapters:[]},s.construction,{...s.runtime(),stage:'invalid-prose-partition',task:'Invalid omission',scopeKind:'guide-text',proofCaseId:'scenario-2',completeDraft:draft})).toThrow('partizione incompleta')
  expect(beginGuideSegmentRepair(draft,s.construction,reviews,s.runtime()).epoch.reviews).toHaveLength(1)
 }finally{s.close()}
},30000)
it('repairs only metadata, preserves all line receipts, and reopens the same completed repair without calls',async()=>{
 const s=await open()
 try{
  const original=JSON.stringify(s.construction),review=negative(s,{kind:'metadata',caseId:'scenario-1',constructionHash:s.construction.built[0].constructionHash}),started=beginGuideSegmentRepair(s.draft,s.construction,[review],s.runtime()),n=s.stages.length
  const result=await executeGuideSegmentRepair(started.key,started.epoch,{...s.runtime(),invalidateTexts:invalidatedGuideIds})
  expect(s.stages.slice(n)).toEqual(['metadata-cases'])
  expect(JSON.stringify(s.construction)).toBe(original)
  expect(result.construction.mains).toEqual(s.construction.mains);expect(result.construction.branches).toEqual(s.construction.branches)
  expect(result.construction.built[1]).toEqual(s.construction.built[1]);expect(result.construction.built[0].native.replyComparison.conclusion).not.toBe(s.construction.built[0].native.replyComparison.conclusion)
  const view={...result.draft,scenarios:[result.draft.scenarios[0]]},request=guideSegmentReviewRequest(view,result.construction,{...s.runtime(),stage:'review-followup',task:'Recheck every original finding.',scopeKind:'scenarios'}),context=request.data as any
  expect(context.reviewHistory.findings).toHaveLength(1)
  expect(context.reviewHistory.reviews[0].snapshot.data.draft).toEqual({...s.draft,scenarios:[s.draft.scenarios[0]]})
  const audit={findingHash:context.reviewHistory.findings[0].hash,disposition:'resolved',reason:'The current comparison now explicitly explains the same-cost difference.',sourceIds:['card:p'],currentFindingIndex:null}
  const pass={verdict:'pass',findings:[],checks:['Recheck the old finding against the current frozen registers.'],revalidatedIds:[],textCorrections:[],draftHash:context.draftHash,constructionHash:context.constructionHash,reviewContextHash:context.reviewContextHash,resolutionAudit:[audit]}
  expect(request.read(pass).verdict).toBe('pass')
  expect(()=>request.read({...pass,resolutionAudit:[]})).toThrow()
  expect(()=>request.read({...pass,resolutionAudit:[{...audit,disposition:'still-open',currentFindingIndex:0}]})).toThrow('ancora aperto')
  s.reopen();s.setLeft(0);const count=s.stages.length
  expect(latestGuideSegmentRepair(s.runtime())!.result).toEqual(result)
  expect(await executeGuideSegmentRepair(started.key,started.epoch,{...s.runtime(),invalidateTexts:invalidatedGuideIds})).toEqual(result)
  expect(s.stages).toHaveLength(count)
  expect(()=>beginGuideSegmentRepair(s.draft,s.construction,[review],s.runtime())).toThrow('ultimo risultato')
  const reopenedRequest=guideSegmentReviewRequest(view,result.construction,{...s.runtime(),stage:'review-followup',task:'Recheck every original finding.',scopeKind:'scenarios'})
  const second=reopenedRequest.read({...pass,verdict:'revise',findings:[{...review.findings[0],message:'A second distinct source interpretation on the revised comparison.'}]})
  s.runtime().archive.saveValue('guide-segment-review-v1',guideHash(['scenario-1',second]),{unitId:'scenario-1',review:second})
  saveGuideSegmentReviewContext(s.runtime(),'scenario-1',second,reopenedRequest)
  beginGuideSegmentRepair(result.draft,result.construction,[second],s.runtime())
  const next=guideSegmentReviewRequest(view,result.construction,{...s.runtime(),stage:'review-two-epochs',task:'Recheck both revisions without discarding their original contexts.',scopeKind:'scenarios'}),nextData=next.data as any
  expect(nextData.reviewHistory.reviews).toHaveLength(2)
  expect(nextData.reviewHistory.findings).toHaveLength(2)
  expect(nextData.reviewHistory.reviews[1].snapshot.historyKeys).toHaveLength(1)
  expect(next.read({...pass,draftHash:nextData.draftHash,constructionHash:nextData.constructionHash,reviewContextHash:nextData.reviewContextHash,resolutionAudit:nextData.reviewHistory.findings.map((f:any)=>({...audit,findingHash:f.hash}))}).verdict).toBe('pass')
 }finally{s.close()}
},30000)
it('requests a missing witness before metadata, stops before an unaffordable branch rebuild, and resumes without buying the same request again',async()=>{
 const s=await open(),repairs=new Map([['scenario-1',{previous:s.construction.built[0],findings:[{message:'A synthetic additional witness is required.'}]}]])
 let requested=false
 const runtime=():GuideConstructionRuntime=>({...s.runtime(),call:async<T>(r:GuideSegmentRequest<T>)=>s.runtime().call({...r,read:(raw:unknown)=>{
  const data=r.data as any,value=structuredClone(raw) as any
  if(r.stage==='metadata-cases'&&!requested){
   const unit=data.units.find((u:any)=>u.data.main.id==='scenario-1')
   if(unit){requested=true;const row=value.units.find((v:any)=>v.unitId===unit.unitId);row.response={kind:'needs-branches',caseId:'scenario-1',constructionHash:unit.data.constructionHash,requirements:[{goal:'Demonstrate a separate synthetic comparison witness.',reason:'The frozen comparison needs one more executed branch.',sourceIds:['card:p']}]}}
  }
  return r.read(value)
 }})})
 try{
  const n=s.stages.length;s.setLeft(4)
  await expect(constructGuideScenarioEvaluations(s.construction.mains,s.construction.plans,runtime(),repairs)).rejects.toThrow('Budget insufficiente')
  expect(s.stages.slice(n)).toEqual(['metadata-cases'])
  expect([...s.runtime().archive.values('guide-reply-plan-selection-v1')]).toHaveLength(1)
  s.reopen();s.setLeft(30);const count=s.stages.length
  const result=await constructGuideScenarioEvaluations(s.construction.mains,s.construction.plans,runtime(),repairs)
  expect(s.stages.slice(count)).toEqual(['branch-plan-cases','branch-plan-choices','segments-reply-opponent','segments-reply-next','metadata-cases'])
  expect(result.plans[0].others).toHaveLength(1);expect(result.built[0].content.scenarios[0].replyComparison!.options).toHaveLength(4)
  expect(result.plans[1]).toEqual(s.construction.plans[1]);expect(result.built[1]).toEqual(s.construction.built[1])
  const old=s.stages.length;s.setLeft(0)
  expect(await constructGuideScenarioEvaluations(s.construction.mains,s.construction.plans,runtime(),repairs)).toEqual(result)
  expect(s.stages).toHaveLength(old)
 }finally{s.close()}
},45000)
it.each(['setup','first-turn','reply-plan'] as const)('reconstructs %s from the stored criticism and invalidates exactly its dependent native states',async mode=>{
 const s=await open()
 try{
  const main=s.construction.mains[0],target=mode==='setup'?{kind:'setup',caseId:main.setup.id,rootHash:main.rootHash}:mode==='reply-plan'?{kind:'reply-plan',caseId:main.setup.id,mainHash:main.segments[2].hash}:{kind:'turn',caseId:main.setup.id,lineId:'main',reviewedHash:main.segments[2].hash,fromTurn:main.segments[0].receipt.lastTurn}
  const review=negative(s,target),started=beginGuideSegmentRepair(s.draft,s.construction,[review],s.runtime()),count=s.stages.length
  const result=await executeGuideSegmentRepair(started.key,started.epoch,{...s.runtime(),invalidateTexts:invalidatedGuideIds})
  expect(result.construction.mains[1]).toEqual(s.construction.mains[1])
  for(const branch of s.construction.branches.filter(b=>b.caseId!=='scenario-1'))expect(result.construction.branches.find(b=>b.seed.id===branch.seed.id)).toEqual(branch)
  if(mode==='reply-plan'){
   expect(result.construction.mains[0]).toEqual(main)
   expect(result.construction.plans[0].others).toHaveLength(1)
   for(const branch of s.construction.branches)expect(result.construction.branches.find(b=>b.seed.id===branch.seed.id)).toEqual(branch)
  }else{
   const next=result.construction.mains[0]
   expect(next.segments[0].hash).not.toBe(main.segments[0].hash)
   expect(s.stages.slice(count)).toContain('review-premise-main')
   for(const branch of s.construction.branches.filter(b=>b.caseId==='scenario-1'))expect(()=>loadGuideSegmentCheckpoint(s.runtime().archive,s.scope,s.fixture.packet,branch.caseId,main.rootHash,branch.line)).toThrow('prefisso condiviso cambiato')
   if(mode==='setup')expect(next.rootHash).not.toBe(main.rootHash)
   else expect(next.rootHash).toBe(main.rootHash)
  }
  s.reopen();s.setLeft(0);const paid=s.stages.length
  expect(await executeGuideSegmentRepair(started.key,started.epoch,{...s.runtime(),invalidateTexts:invalidatedGuideIds})).toEqual(result)
  expect(s.stages).toHaveLength(paid)
 }finally{s.close()}
},45000)
it.each(['scenario-metadata','final-text','final-native'] as const)('completes the full host cycle after %s criticism, with immutable originals and no manual output patch',async mode=>{
 const parent=resolve('.verify/app225-segments-20261102');mkdirSync(parent,{recursive:true})
 const folder=mkdtempSync(join(parent,'repair-host-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path)
 const project=projects.create({name:'Synthetic full repair '+mode,format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic-full-repair'),fixture=syntheticSegmentProtocol(project.id)
 let work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal),rejected=false,interrupted=false
 const stages:string[]=[],config={provider:'codex' as const,source:'global' as const,model:'gpt-6.1-sol',reasoningEffort:null}
 const options={packet:fixture.packet,config,request:'Synthetic complete repair '+mode,...mode==='final-native'?{callBudgetAuthorization:{jobId:job.id,projectId:project.id,dependencyHash:fixture.packet.basis.dependencyHash,maximum:24,reason:'Isolated synthetic test only; no model service.'}}:{}}
 const runner:NonNullable<Parameters<typeof generateDeepGuide>[0]['runner']>=async(prompt,_config,schema)=>{
  const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));stages.push(stage)
  const raw=fixture.response(stage,data,schema) as any
  const eligible=mode==='scenario-metadata'?stage.startsWith('review-scenarios-'):/^review-[a-f0-9]{16}$/.test(stage)
  if(!rejected&&eligible){
   const index=data.units.findIndex((u:any)=>mode==='final-text'?u.data.reviewScope.kind==='guide-text':u.data.draft.scenarios[0]?.id==='scenario-1')
   const unit=data.units[index],scenarioId='scenario-1',line=unit.data.contexts.find((c:any)=>c.scenarioId===scenarioId&&c.lineId==='main')
   const repair:any=mode==='final-text'?{kind:'text',targetId:'chapter-summary'}:mode==='scenario-metadata'?{kind:'metadata',caseId:scenarioId,constructionHash:undefined}:{kind:'turn',caseId:scenarioId,lineId:'main',reviewedHash:line.reviewedHash,fromTurn:line.windows[2].turn}
   if(mode==='scenario-metadata'){
    const record=[...work.archive.values<any>('guide-segment-construction-v28')].at(-1)!.value
    // The metadata hash is derived only from accepted heads and seeds.
    repair.constructionHash=guideHash({main:record.mains[0].segments[2].hash,branches:record.branches.filter((b:any)=>b.caseId===scenarioId).map((b:any)=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1).hash}))})
   }
   raw.units[index].response={...raw.units[index].response,verdict:'revise',findings:[{severity:'major',targetId:mode==='final-text'?'chapter-summary':scenarioId,message:'Synthetic independent finding at the assigned point.',correction:'Rebuild only the assigned point and reconsider dependent texts.',sourceIds:['card:p'],proposedActions:[],counterlines:[],repair}]}
   rejected=true
  }
  return raw
 }
 try{
  if(mode==='scenario-metadata'){
   await expect(generateDeepGuide({...options,work,runner,onStage:stage=>{if(stage==='metadata-cases'&&rejected&&!interrupted){interrupted=true;throw Error('Synthetic interruption after repair journal before provider')}}})).rejects.toThrow('Synthetic interruption')
   expect(stages).toHaveLength(12)
   expect([...work.archive.values('guide-segment-repair-start-v1')]).toHaveLength(1)
   work.close();work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal)
  }
  const guide=await generateDeepGuide({...options,work,runner})
  assertGuideReport({...fixture.packet.basis,guide});assertGuideIntegrity(guide)
  expect(rejected).toBe(true);expect(guide.review.verdict).toBe('pass')
  expect(guide.generation.attempts.length).toBeLessThanOrEqual(mode==='final-native'?24:16)
  expect(stages.some(s=>s.startsWith('repair-scenarios')||s.startsWith('repair-final'))).toBe(false)
  expect([...work.archive.values('guide-segment-repair-start-v1')]).toHaveLength(1)
  expect([...work.archive.values('guide-segment-repair-ready-v1')]).toHaveLength(1)
  expect([...work.archive.values<any>('guide-segment-review-v1')].some(v=>v.value.review.verdict==='revise')).toBe(true)
  if(mode==='final-native'){
   expect(stages.some(s=>s.startsWith('review-repaired-scenarios-'))).toBe(true)
   expect(stages.indexOf('prose-repair-segments')).toBeGreaterThan(stages.findIndex(s=>s.startsWith('review-repaired-scenarios-')))
  }
  const count=stages.length
  work.close();work=new AiAnalysisWork(join(folder,'work'),jobs,job.id,new AbortController().signal)
  expect(await generateDeepGuide({...options,work,runner:async()=>{throw Error('Validated repair recovery must not invoke a provider')}})).toEqual(guide)
  expect(stages).toHaveLength(count)
 }finally{work.close();jobs.close();projects.close()}
},90000)
it('repairs one branch from its exact retained prefix after interruption, leaving main and sibling branches unchanged',async()=>{
 const s=await open()
 try{
  const branch=s.construction.branches.find(b=>b.caseId==='scenario-1'&&b.seed.role==='direct')!,before=JSON.stringify(branch.journal.segments[0])
  const review=negative(s,{kind:'turn',caseId:branch.caseId,lineId:branch.seed.id,reviewedHash:branch.journal.segments.at(-1)!.hash,fromTurn:branch.journal.segments[1].receipt.lastTurn}),started=beginGuideSegmentRepair(s.draft,s.construction,[review],s.runtime())
  s.interrupt();await expect(executeGuideSegmentRepair(started.key,started.epoch,{...s.runtime(),invalidateTexts:invalidatedGuideIds})).rejects.toThrow('Synthetic interruption')
  s.reopen();const n=s.stages.length,result=await executeGuideSegmentRepair(started.key,started.epoch,{...s.runtime(),invalidateTexts:invalidatedGuideIds})
  expect(s.stages.slice(n)).toEqual(['segments-reply-opponent','segments-reply-next','metadata-cases'])
  expect(result.construction.mains).toEqual(s.construction.mains)
  const changed=result.construction.branches.find(b=>b.seed.id===branch.seed.id)!
  expect(JSON.stringify(changed.journal.segments[0])).toBe(before)
  expect(changed.journal.segments[1].hash).not.toBe(branch.journal.segments[1].hash)
  for(const old of s.construction.branches.filter(b=>b.seed.id!==branch.seed.id))expect(result.construction.branches.find(b=>b.seed.id===old.seed.id)).toEqual(old)
  expect(guideSegmentDeclarations(changed.journal,s.scope,s.fixture.packet).turns.opponent.events.length).toBe(2)
 }finally{s.close()}
},30000)
