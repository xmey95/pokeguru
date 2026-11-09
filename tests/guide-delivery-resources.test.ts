import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {initializeGuideDelivery,registerDeliveryUnit,beginGuideDelivery,readGuideDelivery,authorizeGuideDeliveryRepairs,preflightGuideDelivery} from '../src/main/guide-delivery-policy'
import {deliveryAllowanceRole,type DeliveryRepairAllowance} from '../src/main/guide-delivery-allowance'
import {guideHash} from '../src/main/matchup-guide-packet'
import {readAiBudget} from '../src/shared/ai-limits'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import type {GuideAttempt} from '../src/shared/matchup-guide'
import type {GuideSegmentRequest} from '../src/main/guide-segment-generation'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import {guideSegmentUnitIdentity,prepareGuideSegmentBatch} from '../src/main/guide-segment-batch'
const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
function fixture(){const f=deliveryApplicationFixture(),a=f.archive;initializeGuideDelivery(f.options.packet,config,a)
 const register=(id:string,caseId='independent-case',kind='guide-finite-metadata-1')=>{registerDeliveryUnit(a,{stage:'metadata',data:{caseId},cacheValidation:{id:kind}},id);return {stage:'metadata',data:{units:[{unitId:id}]}}}
 const invoke=(id:string,caseId?:string,kind?:string)=>{const request=register(id,caseId,kind),sequence=readGuideDelivery(a).rows.length+1,attempt={sequence,stage:'metadata',inputHash:guideHash(id),status:'running',startedAt:'2026-11-07T00:00:00.000Z',endedAt:null,durationMs:0} as GuideAttempt;beginGuideDelivery(a,attempt,request.data);a.saveValue('guide-attempt-end',String(sequence).padStart(3,'0'),{...attempt,status:'succeeded'});return sequence}
 const grant=(id='approval-0001',repairLimit=32):DeliveryRepairAllowance=>{const s=readGuideDelivery(a);return {version:1,id,jobId:a.id,projectId:a.projectId,manifestHash:guideHash(s.manifest),previousAllowanceHash:s.allowanceHash,afterSequence:s.rows.length,historyHash:s.previousHash,repairLimit,maximumCalls:s.manifest.maximum,reservedCalls:9,authorityReference:'offline:'+id,approvedAt:'2026-11-07T00:00:00.000Z'}}
 const fill=()=>{for(let i=0;i<17;i++)invoke('original-'+i)}
 return {...f,register,invoke,grant,fill}
}
it('reports zero repair capacity with total calls remaining, before committing an attempt',()=>{const f=fixture();try{
 f.fill();const request=f.register('pending'),before=[...f.archive.values('guide-delivery-dispatch-v1')];let error:any
 try{preflightGuideDelivery(f.archive,request.stage,[request])}catch(e){error=e}
 expect(error).toMatchObject({code:'call-budget',budget:{outcome:'blocked',reasons:['repair-calls'],remainingCalls:147,repairs:{limit:16,used:16,remaining:0,required:1}}});expect(readAiBudget(error.budget)).toEqual(error.budget)
 expect([...f.archive.values('guide-delivery-dispatch-v1')]).toEqual(before);expect([...f.archive.values('guide-attempt-start')]).toHaveLength(17)
}finally{f.close()}})
it('reserves a compulsory known reviewer and all unpaid groups before spending the last credit',()=>{const f=fixture();try{
 f.invoke('review-base','independent-case','guide-premise-review-1');for(let i=0;i<16;i++)f.invoke('audit-'+i)
 const state=readGuideDelivery(f.archive);expect(state.repairs).toBe(15);const one=f.register('pending-audit')
 expect(preflightGuideDelivery(f.archive,'metadata',[one]).outcome).toBe('ready')
 expect(()=>preflightGuideDelivery(f.archive,'metadata',[{...one,deliveryFollowupKeys:['independent-case/premise']}])).toThrow('almeno 2')
 const two=f.register('pending-again');expect(()=>preflightGuideDelivery(f.archive,'metadata',[one,two])).toThrow('almeno 2')
 expect(readGuideDelivery(f.archive).repairs).toBe(15)
}finally{f.close()}})
it('appends an explicit allowance without changing old receipts, initial limits or total call maximum',()=>{const f=fixture();try{
 f.fill();const manifest=f.archive.value('guide-delivery-manifest-v1','initial'),rows=[...f.archive.values('guide-delivery-dispatch-v1')],g=f.grant(),key=authorizeGuideDeliveryRepairs(f.archive,g)
 expect(authorizeGuideDeliveryRepairs(f.archive,g)).toBe(key);expect([...f.archive.values(deliveryAllowanceRole)]).toHaveLength(1);f.invoke('after-grant')
 const state=readGuideDelivery(f.archive);expect(state).toMatchObject({repairs:17,repairLimit:32,allowanceHash:key,manifest:{maximum:164,repairCredits:16,base:148}});expect(f.archive.value('guide-delivery-manifest-v1','initial')).toEqual(manifest)
 for(const row of rows)expect(f.archive.value('guide-delivery-dispatch-v1',row.key)).toEqual(row.value)
 expect(f.archive.value('guide-delivery-dispatch-v1','018')).toMatchObject({version:2,allowanceHash:key});expect(authorizeGuideDeliveryRepairs(f.archive,g)).toBe(key);expect(readGuideDelivery(f.archive).repairs).toBe(17)
 const reopened=new AiEvidenceArchive(f.file,f.job,true);try{expect(readGuideDelivery(reopened)).toMatchObject({repairs:17,repairLimit:32,allowanceHash:key})}finally{reopened.close()}
}finally{f.close()}})
it('anchors multiple explicit grants to their exact completed prefixes and distinct authorities',()=>{const f=fixture();try{
 f.fill();const first=authorizeGuideDeliveryRepairs(f.archive,f.grant());f.invoke('after-first');const next=f.grant('approval-0002',48),second=authorizeGuideDeliveryRepairs(f.archive,next);f.invoke('after-second')
 expect(readGuideDelivery(f.archive)).toMatchObject({repairLimit:48,repairs:18,allowanceHash:second});expect(f.archive.value('guide-delivery-dispatch-v1','018')).toMatchObject({allowanceHash:first});expect(f.archive.value('guide-delivery-dispatch-v1','019')).toMatchObject({allowanceHash:second})
 expect(()=>authorizeGuideDeliveryRepairs(f.archive,{...f.grant('approval-0003',64),authorityReference:next.authorityReference})).toThrow()
}finally{f.close()}})
it.each(['invalid-format','negative'] as const)('keeps two %s results binding after a user allowance',kind=>{const f=fixture();try{
 for(let i=0;i<2;i++){const id='bad-'+i,n=f.invoke(id);if(kind==='invalid-format')f.archive.saveValue('guide-attempt-failure',String(n).padStart(3,'0'),{code:'invalid-response'});else{const r={unitId:id,batchHash:guideHash([id]),accepted:true,value:{verdict:'revise'}};f.archive.saveValue('guide-segment-unit-result-v1',guideHash(r),r)}}
 authorizeGuideDeliveryRepairs(f.archive,f.grant());expect(()=>f.invoke('new-identity')).toThrow(kind==='negative'?'Secondo giudizio negativo':'Due risposte non valide');expect(readGuideDelivery(f.archive).rows).toHaveLength(2)
}finally{f.close()}})
it.each(['job','project','manifest','history','sequence','maximum','limit','reserve','authority','date'] as const)('rejects an invalid %s allowance without creating an authority record',field=>{const f=fixture();try{
 f.fill();const g=f.grant();const patch:any={job:{jobId:'other-job'},project:{projectId:'other-project'},manifest:{manifestHash:'bad'},history:{historyHash:'bad'},sequence:{afterSequence:16},maximum:{maximumCalls:165},limit:{repairLimit:49},reserve:{reservedCalls:164},authority:{authorityReference:'PRIVATE\nDATA'},date:{approvedAt:'not-a-date'}}[field]
 expect(()=>authorizeGuideDeliveryRepairs(f.archive,{...g,...patch})).toThrow();expect([...f.archive.values(deliveryAllowanceRole)]).toHaveLength(0);expect(readGuideDelivery(f.archive).repairLimit).toBe(16)
}finally{f.close()}})
it('rejects retroactive authority and missing authority for a version-two dispatch',()=>{const f=fixture();try{
 f.fill();const g=f.grant(),retro={...g,afterSequence:16,historyHash:guideHash(f.archive.value('guide-delivery-dispatch-v1','016'))},view=new Proxy(f.archive,{get(t,k){if(k==='values')return function*(role:string){yield* t.values(role);if(role===deliveryAllowanceRole)yield {key:guideHash(retro),value:retro}};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})
 expect(()=>readGuideDelivery(view)).toThrow('Registro');authorizeGuideDeliveryRepairs(f.archive,g);f.invoke('new')
 const missing=new Proxy(f.archive,{get(t,k){if(k==='values')return function*(role:string){if(role!==deliveryAllowanceRole)yield* t.values(role)};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}});expect(()=>readGuideDelivery(missing)).toThrow('Registro')
}finally{f.close()}})
it('cannot allocate repair capacity committed to the total ceiling and mandatory calls',()=>{const f=fixture();try{
 f.fill()
 expect(()=>authorizeGuideDeliveryRepairs(f.archive,{...f.grant(),reservedCalls:132})).toThrow('capacità residua');expect([...f.archive.values(deliveryAllowanceRole)]).toHaveLength(0)
 authorizeGuideDeliveryRepairs(f.archive,{...f.grant(),reservedCalls:131});expect(readGuideDelivery(f.archive).repairLimit).toBe(32)
}finally{f.close()}})
it('preflights all known phase groups before calling the provider for the first group',async()=>{const f=fixture();try{
 for(let i=0;i<16;i++)f.invoke('paid-'+i)
 let calls=0
 const request=(id:string):GuideSegmentRequest<object>=>({stage:'metadata-'+id,role:'constructor',instructions:'Independent unit',task:id,data:{packet:f.options.packet,caseId:'independent-case',nonce:id},schema:{type:'object'},reserveCalls:0,read:()=>({}),cacheValidation:{id:'guide-finite-metadata-1',validate:()=>{}}})
 await expect(runGuideSegmentPhase(['a','b'].map(id=>({id,request:()=>request(id),accept:()=>{}})),{stage:'metadata',archive:f.archive,call:async()=>{calls++;throw Error('Provider must not be reached')},estimate:r=>({stage:r.stage,units:1,encoding:'plain',visibleTokens:1,estimatedInput:1,reservedOutput:1,estimatedResponseCharacters:1,margin:1,bytes:1,fits:true,fitsTarget:true,remainingCalls:148,reservedCalls:0,calibrationFactor:1.12,family:'metadata',estimateOnly:true}),isCached:()=>false,remainingCalls:()=>148,check:()=>{},outputFits:(_stage,units)=>units===1,prepareRequest:r=>{registerDeliveryUnit(f.archive,r,guideSegmentUnitIdentity(r).unitId);return r},preflight:groups=>{preflightGuideDelivery(f.archive,'metadata',groups)}})).rejects.toMatchObject({code:'call-budget',budget:{repairs:{remaining:1,required:2}}})
 expect(calls).toBe(0);expect(readGuideDelivery(f.archive).rows).toHaveLength(16)
}finally{f.close()}})
it('keeps host-only reservations out of model inputs, schema and transport identities',()=>{const f=fixture();try{
 const r:GuideSegmentRequest<object>={stage:'metadata',role:'constructor',instructions:'All facts',task:'Exact unit',data:{packet:f.options.packet,caseId:'case'},schema:{type:'object'},reserveCalls:0,read:()=>({}),cacheValidation:{id:'guide-finite-metadata-1',validate:()=>{}}},reserved={...r,deliveryFollowupKeys:['case/premise'],deliveryRepairReserve:5}
 expect(guideSegmentUnitIdentity(reserved)).toEqual(guideSegmentUnitIdentity(r));const a=prepareGuideSegmentBatch([r],{stage:'metadata',reserveCalls:0}).request,b=prepareGuideSegmentBatch([reserved],{stage:'metadata',reserveCalls:0}).request
 expect(b.data).toEqual(a.data);expect(b.schema).toEqual(a.schema);expect(guideSegmentUnitIdentity(b)).toEqual(guideSegmentUnitIdentity(a));expect(b.deliveryFollowupKeys).toEqual(['case/premise']);expect(b.deliveryRepairReserve).toBe(5)
}finally{f.close()}})
it('reserves mandatory quantitative recertification repairs before accepting a text patch',()=>{const f=fixture();try{
 for(let i=0;i<13;i++)f.invoke('paid-'+i)
 const pending=f.register('narrative','independent-case','guide-finite-premise-text-1');let error:any;try{preflightGuideDelivery(f.archive,'narrative',[{...pending,deliveryRepairReserve:5}])}catch(e){error=e}
 expect(error).toMatchObject({code:'call-budget',budget:{repairs:{limit:16,used:12,remaining:4,required:6}}});expect(readGuideDelivery(f.archive).rows).toHaveLength(13)
}finally{f.close()}})
it('keeps two old routing format errors binding after the routing schema evolves',()=>{const f=fixture();try{
 for(let i=0;i<2;i++){const n=f.invoke('route-'+i,'independent-case','guide-finite-premise-route-1');f.archive.saveValue('guide-attempt-failure',String(n).padStart(3,'0'),{code:'invalid-response'})}
 expect(()=>f.invoke('route-v2','independent-case','guide-finite-premise-route-2')).toThrow('Due risposte non valide');expect(readGuideDelivery(f.archive).rows).toHaveLength(2)
}finally{f.close()}})
it('does not allocate while an invocation lacks its final receipt or after final validation',()=>{const f=fixture();try{
 const r=f.register('unfinished'),attempt={sequence:1,stage:r.stage,inputHash:'original'} as GuideAttempt;beginGuideDelivery(f.archive,attempt,r.data)
 expect(()=>authorizeGuideDeliveryRepairs(f.archive,f.grant())).toThrow('prima dell’esito');expect([...f.archive.values(deliveryAllowanceRole)]).toHaveLength(0)
 f.archive.saveValue('guide-attempt-end','001',{...attempt,status:'succeeded'});f.archive.saveValue('guide-delivery-final-v1','validated',{fixture:true})
 expect(()=>authorizeGuideDeliveryRepairs(f.archive,f.grant())).toThrow('già convalidata');expect([...f.archive.values(deliveryAllowanceRole)]).toHaveLength(0)
}finally{f.close()}})
