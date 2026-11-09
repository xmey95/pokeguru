import {it,expect} from 'vitest'
import {join} from 'node:path'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'
import {enableFinalTextPartitions,finiteFinalReviewUnits,hasFinalTextPartitions} from '../src/main/guide-final-text-partitions'
import {constructFiniteGuideContent} from '../src/main/guide-finite-generation'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity,deepGuideReport} from '../src/main/matchup-guide-generation'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {guideHash} from '../src/main/matchup-guide-packet'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {aggregateFiniteGuideReviews,type GuideFiniteReview} from '../src/main/guide-finite-review'
import {readGuideReview} from '../src/shared/matchup-guide'

const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
const authorize=(f:ReturnType<typeof deliveryApplicationFixture>)=>authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:synthetic-partitions','2026-11-08T00:00:00.000Z')
it('keeps the public review readable while binding every complete original opinion and its checks',()=>{
 const reviews:GuideFiniteReview[]=Array.from({length:11},(_,i)=>({contextHash:guideHash(i),verdict:'pass',findings:[],checks:Array.from({length:30},(_,j)=>'Complete original check '+i+'/'+j),resolutions:[]})),before=JSON.stringify(reviews),review=aggregateFiniteGuideReviews(reviews,true)
 expect(()=>readGuideReview(review)).not.toThrow();expect(review.checks).toHaveLength(11)
 expect(review.checks.every((text,i)=>text.includes(guideHash(reviews[i])))).toBe(true);expect(JSON.stringify(reviews)).toBe(before)
 expect(aggregateFiniteGuideReviews(reviews).checks).toHaveLength(341)
})
it('requires until-valid authority and pairs every original text with every case plus the whole-prose reviewer',()=>{
 const f=deliveryApplicationFixture();try{
  expect(()=>enableFinalTextPartitions(f.options)).toThrow('storico');authorize(f);enableFinalTextPartitions(f.options)
  const draft:any={chapters:Array.from({length:8},(_,i)=>({id:'chapter-'+i,body:'a'.repeat(2000)})),exercises:[{id:'exercise-a',solution:'b'.repeat(2000)},{id:'exercise-b',solution:'c'.repeat(2000)}],scenarios:[{id:'case-a'},{id:'case-b'}]},texts=[...draft.chapters,...draft.exercises].map(t=>t.id),before=JSON.stringify(draft),units=finiteFinalReviewUnits(draft,f.options)
  for(const id of ['case-a','case-b'])expect(units.filter(u=>u.proofCaseIds.includes(id)).flatMap(u=>u.partition!.textIds)).toEqual(texts)
  expect(units.filter(u=>u.partition?.kind==='global-text')).toEqual([{id:'global-text',proofCaseIds:[],partition:{kind:'global-text',textIds:texts,unitId:'global-text',historyScope:'assigned-text-v2'}}])
  expect(JSON.stringify(draft)).toBe(before)
  expect(()=>hasFinalTextPartitions({...f.options,scope:{...f.options.scope,projectId:'foreign'}})).toThrow('estranea')
  expect(()=>finiteFinalReviewUnits({...draft,exercises:[draft.chapters[0]]},f.options)).toThrow('duplicati')
 }finally{f.close()}
})
it('switches automatically at a single-unit size stop before buying a final review and retains the full case proofs',async()=>{
 const f=deliveryApplicationFixture();try{
  authorize(f);const estimate=f.options.estimate
  f.options.estimate=request=>{const p=estimate(request);return request.stage==='review-finite-guide'&&!(request.data as any).units?.every((u:any)=>u.data.textPartition)?{...p,estimatedInput:128001,fits:false,fitsTarget:false}:p}
  const result=await constructFiniteGuideContent(f.setups,f.options)
  expect(result.review.verdict).toBe('pass');expect(hasFinalTextPartitions(f.options)).toBe(true)
  const final=[...f.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.stage==='review-finite-guide')
  expect(final.length).toBe(3)
  for(const row of final){const request=f.archive.value<any>('guide-finite-request-v1',row.value.unitId).request;expect(request.validationId).toBe('guide-finite-review-6');expect(request.data.textPartition).toBeTruthy();if(request.data.textPartition.kind==='case-text'){expect(request.data.natives).toHaveLength(1);expect(request.data.contexts.length).toBeGreaterThan(1)}else{expect(request.data.draft.chapters).toHaveLength(8);expect(request.data.draft.exercises).toHaveLength(2);expect(request.data.crossCaseScopes).toHaveLength(2)}}
  const calls=f.calls;await constructFiniteGuideContent(f.setups,f.options);expect(f.calls).toBe(calls)
 }finally{f.close()}
},120000)
it('carries a paid legacy negative into the new mandatory scopes instead of erasing it at a size-driven switch',async()=>{
 const f=deliveryApplicationFixture();try{
  authorize(f);f.textFailure();const estimate=f.options.estimate,call=f.options.call;let count=0
  f.options.estimate=request=>{const p=estimate(request);return request.stage==='review-finite-guide'&&(request.data as any).units.length>1?{...p,estimatedInput:128001,fits:false,fitsTarget:false}:p}
  f.options.call=async request=>{if(request.stage==='review-finite-guide'&&++count===2)throw Error('Synthetic stop after paid negative');return call(request)}
  await expect(constructFiniteGuideContent(f.setups,f.options)).rejects.toThrow('Synthetic stop after paid negative')
  const old=[...f.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.stage==='review-finite-guide'&&r.value.value?.verdict==='revise')!;expect(old).toBeTruthy()
  expect(hasFinalTextPartitions(f.options)).toBe(false)
  f.options.call=call;f.options.estimate=request=>{const p=estimate(request);return request.stage==='review-finite-guide'&&!(request.data as any).units.every((u:any)=>u.data.textPartition)?{...p,estimatedInput:128001,fits:false,fitsTarget:false}:p}
  const result=await constructFiniteGuideContent(f.setups,f.options);expect(result.review.verdict).toBe('pass');expect(hasFinalTextPartitions(f.options)).toBe(true)
  expect(f.archive.value('guide-segment-unit-result-v1',old.key)).toEqual(old.value)
  const modern=[...f.archive.values<any>('guide-finite-request-v1')].filter(r=>r.value.request.validationId==='guide-finite-review-6'&&r.value.request.data.textPartition)
  expect(modern.length).toBeGreaterThan(0);expect(modern.every(r=>r.value.request.data.previousFindings.some((p:any)=>p.finding.message===old.value.value.findings[0].message))).toBe(true)
  expect(result.reviews.every(r=>r.resolutions.some(p=>p.disposition==='resolved'))).toBe(true)
 }finally{f.close()}
},120000)
it('rejects a global negative, independently rechecks the changed complete draft, persists and reopens with every required binding',async()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{
  authorize(f);const scope={...f.options.scope,configHash:guideHash({config,protocol:'segments-v28-1'})};enableFinalTextPartitions({...f.options,scope,archive:work.archive})
  let negative=true
  const runner=async(prompt:string,_config:unknown,schema:object)=>{
   const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data:any=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),raw:any=await f.rawResponse(stage,data,schema)
   if(stage==='prose-finite-units')for(const unit of raw.units){const input=data.units.find((u:any)=>u.unitId===unit.unitId).data;if(unit.response.kind)unit.response.body='A conditional explanation tied to the exact sources and the assigned decision. '.repeat(30)+(input.findings?' Corrected conditional advice.':'')}
   if(stage==='review-finite-guide')for(const unit of raw.units){const input=data.units.find((u:any)=>u.unitId===unit.unitId).data;if(negative&&input.textPartition.kind==='global-text'){negative=false;unit.response.verdict='revise';unit.response.findings=[{severity:'minor',targetId:'chapter-summary',message:'Synthetic cross-chapter inconsistency.',correction:'Clarify this conditional claim.',sourceIds:['card:p'],repair:{kind:'text',targetId:'chapter-summary',quote:input.draft.chapters.find((c:any)=>c.id==='chapter-summary').body.slice(0,120)},proposedActions:[],counterlines:[]}]}}
   return raw
  }
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic complete final matrix.',runner})
  expect(negative).toBe(false);assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
  const approval=work.archive.value<any>('guide-finite-final-approval-v1','validated');expect(approval.version).toBe(3);expect(approval.bindings.length).toBeGreaterThan(3);expect(approval.bindings.at(-1).reviewId).toBe('global-text')
  const reviews=approval.bindings.map((b:any)=>work.archive.value<any>('guide-segment-unit-result-v1',b.outcomeKey).value)
  expect(reviews.every((r:any)=>r.verdict==='pass'&&r.findings.length===0)).toBe(true)
  const globalNegative=[...work.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.accepted&&r.value.value?.verdict==='revise'&&r.value.value.findings.some((f:any)=>f.message==='Synthetic cross-chapter inconsistency.'))
  expect(globalNegative).toBeTruthy();expect(reviews.some((r:any)=>r.resolutions.some((x:any)=>x.disposition==='resolved'))).toBe(true)
  const missing={...approval,bindings:approval.bindings.slice(0,-1)},proxy=new Proxy(work.archive,{get(target,key){if(key==='value')return (role:string,id:string)=>role==='guide-finite-final-approval-v1'&&id==='validated'?missing:target.value(role,id);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
  expect(()=>assertGuideSegmentApproval(guide,proxy)).toThrow('incompleti')
  f.projects.saveMatchupReport(deepGuideReport({...guide.basis,jobId:f.job.id,generatedAt:'2026-11-08T00:00:00.000Z',sampleDeckUrl:null},guide));expect(f.projects.listMatchupReports(f.project.id,f.meta.id)[0].guide).toEqual(guide)
  const calls=f.calls;expect(await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic complete final matrix.',runner:async()=>{throw Error('No repurchase')}})).toEqual(guide);expect(f.calls).toBe(calls)
 }finally{work.close();f.close()}
},120000)

