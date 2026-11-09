import {it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {auditTextFor,auditLanguagePass} from './fixtures/guide-audit'
import {finiteGuideRuntime} from '../src/main/guide-finite-runtime'
import {runAuditDeclaration,readPartitionedAuditDeclaration} from '../src/main/guide-audit-partition'
import {readAuditDeclaration,resolveAuditLanguage} from '../src/main/guide-audit-language-driver'
import {boundedAuditTextSchema,boundedAuditOutputUnits} from '../src/main/guide-bounded-audit-text'
import {quantifiedAuditPatch} from '../src/main/guide-audit-repair'
import {guideHash} from '../src/main/matchup-guide-packet'
import {withGuideSegmentRetry,type GuideSegmentRequest} from '../src/main/guide-segment-generation'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {initializeGuideDelivery,beginGuideDelivery,readGuideDelivery,registerDeliveryUnit} from '../src/main/guide-delivery-policy'
import {repairGuideNativeAudits} from '../src/main/guide-audit-repair'
import {projectGuideSetup} from '../src/shared/guide-ledger-projection'
import {reviewAuditLanguage} from '../src/main/guide-audit-language-review'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'
const object=(properties:any)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),literal=(v:string)=>({type:'string',const:v})
const describeCapacity=(raw:any,d:any)=>({context:d.quantityContext,targets:quantifiedAuditPatch(d,raw,3).targets,contextFacts:[]})
it('routes an authenticated over-dense audit back to its constructor before any critic, preserving original outcomes on interruption and recovery',async()=>{
 const f=fixture(17,true,1);try{
  f.interruptAt(2);await expect(resolveAuditLanguage('capacity-test',undefined,f.make,describeCapacity,f.runtime,2)).rejects.toThrow('Synthetic interruption')
  expect(f.reviewTargets).toEqual([]);const originals=[...f.archive.values<any>('guide-segment-unit-result-v1')],capacity=[...f.archive.values<any>('guide-audit-language-capacity-rejection-v1')]
  expect(capacity).toHaveLength(1);expect(capacity[0].value.violations.every((v:any)=>v.actual===9&&v.maximum===8)).toBe(true)
  const result=await resolveAuditLanguage('capacity-test',undefined,f.make,describeCapacity,f.runtime,2);expect(result.review).toBeTruthy();expect(f.reviewTargets).toEqual([17])
  for(const row of originals)expect(f.archive.value('guide-segment-unit-result-v1',row.key)).toEqual(row.value)
  expect([...f.archive.values('guide-audit-language-negative-v1')]).toHaveLength(0)
  const calls=f.calls;await resolveAuditLanguage('capacity-test',undefined,f.make,describeCapacity,f.runtime,2);expect(f.calls).toBe(calls)
 }finally{f.close()}
})
it('preserves the bounded two-declaration stop and allows three host capacity repairs only under explicit until-valid authority',async()=>{
 const old=fixture(17,true,3);try{await expect(resolveAuditLanguage('capacity-limit',undefined,old.make,describeCapacity,old.runtime,2)).rejects.toMatchObject({code:'draft-limit'});expect(old.calls).toBe(2);expect(old.reviewTargets).toEqual([]);const calls=old.calls;await expect(resolveAuditLanguage('capacity-limit',undefined,old.make,describeCapacity,old.runtime,2)).rejects.toMatchObject({code:'draft-limit'});expect(old.calls).toBe(calls)}finally{old.close()}
 const modern=fixture(17,true,3);try{
  authorizeGuideUntilValid(modern.archive,modern.runtime.packet,{provider:'codex',source:'global',model:null,reasoningEffort:null},'user:synthetic-capacity','2026-11-08T00:00:00.000Z')
  await resolveAuditLanguage('capacity-until-valid',undefined,modern.make,describeCapacity,modern.runtime,2);expect([...modern.archive.values('guide-audit-language-capacity-rejection-v1')]).toHaveLength(3);expect(modern.reviewTargets).toEqual([17]);expect(modern.calls).toBe(5)
 }finally{modern.close()}
})
function fixture(limit=3,delivery=false,denseRounds=0){
 const f=deliveryApplicationFixture(true,true),packet=structuredClone(f.options.packet);if(!delivery)delete packet.basis.deliveryContract;else initializeGuideDelivery(packet,{provider:'codex',source:'global',model:null,reasoningEffort:null},f.archive)
 const context={version:1,caseId:'case',opponentListId:'their',cards:[{side:'ours',printId:'p',name:'Synthetic Basic',total:4}],windows:[],measures:[]} as any,native={id:'case',body:{events:[]}},narrative=boundedAuditTextSchema(context)
 const data={packet,native,mode:{kind:'setup'},caseId:'case',sourceHash:guideHash(native),candidatesHash:'candidates',auditProtocol:3,auditNarrativeVersion:4,deliveryBounded:true,deliveryLineId:'setup',turnKey:'setup|2|ours',locationPath:['body'],group:{turn:2},auditCards:['p'],auditAttacks:[],decisions:Array.from({length:16},(_,i)=>({key:'d'+i,path:['body','events',i],candidateIds:['p']})),promotions:[],quantityContext:context,quantityContextHash:guideHash(context)}
 const schema=object({caseId:literal('case'),sourceHash:literal(data.sourceHash),candidatesHash:literal('candidates'),turnKey:literal(data.turnKey),quantityContextHash:literal(data.quantityContextHash),decisions:object(Object.fromEntries(data.decisions.map(d=>[d.key,narrative]))),tactical:object({comparison:narrative,promotions:object({})})})
 let calls=0,remaining=200,interrupt=-1,bad=false,revise=false,unsplittable=false;const stages:string[]=[],reviewTargets:number[]=[]
 const runtime=finiteGuideRuntime({...f.options,packet,remainingCalls:()=>remaining-calls,outputFits:undefined,
  estimate:r=>{const d=(r.data as any).units[0].data,n=d.auditPartition?.targets.length??(d.decisions?d.decisions.length+1:1),pass=!unsplittable&&n<=limit;return {...f.options.estimate(r),fits:pass,fitsTarget:pass,estimatedResponseCharacters:pass?15000:120000}},
  call:async request=>{calls++;stages.push(request.stage);if(delivery){const attempt={sequence:calls,stage:request.stage,inputHash:guideHash(request.data)} as any;beginGuideDelivery(f.archive,attempt,request.data);f.archive.saveValue('guide-attempt-end',String(calls).padStart(3,'0'),{...attempt,status:calls===interrupt?'failed':'succeeded'})}if(calls===interrupt)throw Error('Synthetic interruption before a partial response');return request.read({units:(request.data as any).units.map((u:any)=>{const d=u.data;if(request.stage==='review-premise-audit-language'){reviewTargets.push(d.targets.length);const raw:any=auditLanguagePass(d);if(revise){raw.verdict='revise';raw.targets[d.targets[0].key].findings=[{quote:d.targets[0].text,reason:'Synthetic unresolved comparison.'}]}return {unitId:u.unitId,response:raw}}const host=d.semanticFeedback?.hostCapacity;let depth=0;for(let h=host;h;h=h.previous)depth++;const text=auditTextFor(d,depth<denseRounds?'1 2 3 4 5 6 7 8 9':'Conditional synthetic comparison.');if(d.auditPartition)return {unitId:u.unitId,response:{parentUnitId:d.auditPartition.parentUnitId,layoutHash:d.auditPartition.layoutHash,index:d.auditPartition.index,values:Object.fromEntries(d.auditPartition.targets.map((_:any,i:number)=>['t'+i,bad?{...text,text:'Mismatch'}:text]))}};return {unitId:u.unitId,response:{caseId:d.native.id,sourceHash:d.sourceHash,candidatesHash:d.candidatesHash,turnKey:d.turnKey,quantityContextHash:d.quantityContextHash,decisions:Object.fromEntries(d.decisions.map((v:any)=>[v.key,text])),tactical:{comparison:text,promotions:{}}}}})})}})
 const make=(round=0,semanticFeedback:any=null):GuideSegmentRequest<any>=>withGuideSegmentRetry({stage:'segment-finite-audit-case',role:'constructor',instructions:'Synthetic audit fixture only.',task:'Construct every supplied target; no game-quality claim.',data:{...data,semanticRound:round,semanticFeedback},schema,units:boundedAuditOutputUnits(context,17),reserveCalls:2,read:raw=>{assertNativeScenarioSchema(raw,schema);quantifiedAuditPatch(data,raw,3);return structuredClone(raw)},cacheValidation:{id:'guide-finite-audit-4',validate:raw=>{quantifiedAuditPatch(data,raw,3)}}},runtime.scope,runtime.archive)
 return {...f,runtime,make,data,reviewTargets,stages,get calls(){return calls},setRemaining(n:number){remaining=n},interruptAt(n:number){interrupt=n},bad(){bad=true},revise(){revise=true},unsplittable(){unsplittable=true}}
}
it('reassembles all seventeen typed targets and authenticates every partial without creating a provider pass for the parent',async()=>{
 const f=fixture();try{const result=await runAuditDeclaration(f.make,f.runtime);expect(result.ref.partitioned).toBe(true);expect(Object.keys(result.value.decisions)).toHaveLength(16);expect(result.value.tactical.comparison.text).toBe('Conditional synthetic comparison.');expect(f.calls).toBeGreaterThan(1)
  const source=readAuditDeclaration({...result.ref,inputVersion:4},f.runtime,(d,raw)=>quantifiedAuditPatch(d,raw,3));expect(source.patch.targets).toHaveLength(17);expect(f.archive.value('guide-segment-unit-result-v1',result.ref.outcomeKey)).toBeUndefined();const count=f.calls;expect(await runAuditDeclaration(f.make,f.runtime)).toEqual(result);expect(f.calls).toBe(count)
 }finally{f.close()}
})
it('reviews the full reconstructed audit after partitioning, with all targets retained across reviewer groups',async()=>{
 const f=fixture();try{const result=await resolveAuditLanguage('synthetic',undefined,f.make,(raw,d)=>({context:d.quantityContext,targets:quantifiedAuditPatch(d,raw,3).targets,contextFacts:[]}),f.runtime,2);expect(result.ref.partitioned).toBe(true);expect(f.reviewTargets.reduce((n,v)=>n+v,0)).toBe(17);const count=f.calls;await resolveAuditLanguage('synthetic',undefined,f.make,(raw,d)=>({context:d.quantityContext,targets:quantifiedAuditPatch(d,raw,3).targets,contextFacts:[]}),f.runtime,2);expect(f.calls).toBe(count)}finally{f.close()}
})
it('preserves the two-negative-review stop for reconstructed audits',async()=>{
 const f=fixture();try{f.revise();await expect(resolveAuditLanguage('synthetic',undefined,f.make,(raw,d)=>({context:d.quantityContext,targets:quantifiedAuditPatch(d,raw,3).targets,contextFacts:[]}),f.runtime,2)).rejects.toMatchObject({code:'draft-limit'});const count=f.calls;await expect(resolveAuditLanguage('synthetic',undefined,f.make,(raw,d)=>({context:d.quantityContext,targets:quantifiedAuditPatch(d,raw,3).targets,contextFacts:[]}),f.runtime,2)).rejects.toMatchObject({code:'draft-limit'});expect(f.calls).toBe(count)}finally{f.close()}
})
it('reuses accepted siblings after interruption and reserves the remaining parts before any call',async()=>{
 const f=fixture();try{f.interruptAt(2);await expect(runAuditDeclaration(f.make,f.runtime)).rejects.toThrow('Synthetic interruption');const before=f.calls,accepted=[...f.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.accepted);expect(accepted).toHaveLength(1);const result=await runAuditDeclaration(f.make,f.runtime);expect(result.ref.partitioned).toBe(true);for(const row of accepted)expect(f.archive.value('guide-segment-unit-result-v1',row.key)).toEqual(row.value);expect(f.calls-before).toBeGreaterThan(0)}finally{f.close()}
})
it.each(['budget','single-target'] as const)('stops an impossible %s partition before purchasing any output',async kind=>{
 const f=fixture();try{if(kind==='budget')f.setRemaining(2);else f.unsplittable();await expect(runAuditDeclaration(f.make,f.runtime)).rejects.toMatchObject({code:kind==='budget'?'call-budget':'request-limit'});expect(f.calls).toBe(0)}finally{f.close()}
})
it('rejects invalid child text and never certifies an incomplete composition',async()=>{const f=fixture();try{f.bad();await expect(runAuditDeclaration(f.make,f.runtime)).rejects.toMatchObject({code:'invalid-response'});expect([...f.archive.values('guide-audit-partition-result-v1')]).toHaveLength(0)}finally{f.close()}})
it('rejects a missing original child on reopening',async()=>{const f=fixture();try{const result=await runAuditDeclaration(f.make,f.runtime),record=f.archive.value<any>('guide-audit-partition-result-v1',result.ref.outcomeKey),db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.job.id,'guide-segment-unit-result-v1',record.parts[0].outcomeKey)}finally{db.close()}expect(()=>readPartitionedAuditDeclaration(result.ref,f.runtime)).toThrow('fonte')}finally{f.close()}})
it('charges additional parts to the existing shared sixteen credits rather than adding base slots',async()=>{const f=fixture(3,true);try{await runAuditDeclaration(f.make,f.runtime);const state=readGuideDelivery(f.archive);expect(state.baseSeen.size).toBe(1);expect(state.repairs).toBe(f.calls-1);expect(state.manifest.maximum).toBe(164)}finally{f.close()}})
it('blocks a partition before any new call when its extra parts cannot fit the shared credits',async()=>{const f=fixture(3,true);try{for(let i=0;i<17;i++){const id='prior-'+i;registerDeliveryUnit(f.archive,{stage:'prior',data:{caseId:'other'},cacheValidation:{id:'guide-finite-metadata-1'}},id);const a={sequence:i+1,stage:'prior',inputHash:id} as any;beginGuideDelivery(f.archive,a,{units:[{unitId:id}]});f.archive.saveValue('guide-attempt-end',String(i+1).padStart(3,'0'),{...a,status:'succeeded'})}await expect(runAuditDeclaration(f.make,f.runtime)).rejects.toMatchObject({code:'call-budget'});expect(f.calls).toBe(0)}finally{f.close()}})
it('persists partitioned audit receipts through the real repair and complete setup reader, without changing physical actions',async()=>{
 const f=fixture(1,true);try{const source=structuredClone(f.setups[0]),result=await repairGuideNativeAudits(source,{kind:'setup'},f.runtime);expect(projectGuideSetup({scenarios:[result]},f.runtime.packet)).toHaveLength(1);expect(result.firstOpponentTurn.events[0].decisionProof.cards).toHaveLength(2);expect(source.firstOpponentTurn.events[0].decisionProof.cards).toEqual([]);const receipt=[...f.archive.values<any>('guide-native-audit-repair-v1')][0].value;expect(receipt.refs[0].partitioned).toBe(true);const count=f.calls;expect(await repairGuideNativeAudits(source,{kind:'setup'},f.runtime)).toEqual(result);expect(f.calls).toBe(count);expect(readGuideDelivery(f.archive).repairs).toBe(1)}finally{f.close()}
})
it('rejects a changed partition layout and foreign parent, while valid receipt reads remain read-only',async()=>{
 const f=fixture();try{const result=await runAuditDeclaration(f.make,f.runtime),before=[...f.archive.values('guide-finite-request-v1')].length;readPartitionedAuditDeclaration(result.ref,f.runtime);expect([...f.archive.values('guide-finite-request-v1')]).toHaveLength(before);expect(()=>readPartitionedAuditDeclaration({...result.ref,unitId:'foreign'},f.runtime)).toThrow('padre');const plan=f.archive.value<any>('guide-audit-partition-plan-v1',result.ref.unitId);f.archive.saveValue('guide-audit-partition-plan-v1','forged',{...plan,groups:[...plan.groups].reverse()});const db=new DatabaseSync(f.file);try{const replacement=db.prepare('SELECT object_hash FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').get(f.job.id,'guide-audit-partition-plan-v1','forged')!;db.prepare('UPDATE ai_evidence_values SET object_hash=? WHERE job_id=? AND role=? AND key=?').run(replacement.object_hash as string,f.job.id,'guide-audit-partition-plan-v1',result.ref.unitId)}finally{db.close()}expect(()=>readPartitionedAuditDeclaration(result.ref,f.runtime)).toThrow('alterato')}finally{f.close()}
})
it('recovers the authenticated paid aggregate before sizing changed guidance, but rejects reuse for changed audit text',async()=>{
 const f=fixture(1,true);try{
  await repairGuideNativeAudits(structuredClone(f.setups[0]),{kind:'setup'},f.runtime)
  const records=[...f.archive.values<any>('guide-delivery-audit-aggregate-v1')],record=records[0].value,count=f.calls
  const runtime={...f.runtime,estimate:()=>{throw Error('No new sizing for an unchanged paid aggregate')},call:async()=>{throw Error('No new provider for an unchanged paid aggregate')}}
  const review=await reviewAuditLanguage(record.targets,record.fullData.context,record.fullData.contextFacts,runtime,24)
  expect(review.ref.outcomeKey).toBe(records[0].key);expect(review.value.verdict).toBe('pass');expect(f.calls).toBe(count)
  const changed=structuredClone(record.targets);changed[0].text+=' Changed.';changed[0].parts[0].text+=' Changed.'
  await expect(reviewAuditLanguage(changed,record.fullData.context,record.fullData.contextFacts,runtime,24)).rejects.toThrow('No new sizing')
 }finally{f.close()}
})

