import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {segmentFixture} from './fixtures/guide-segment'
import {auditText,auditLanguagePass} from './fixtures/guide-audit'
import {guideHash,packetHash,type GuidePacket} from '../src/main/matchup-guide-packet'
import {createGuideSegments,appendGuideSegment,guideSegmentDeclarations} from '../src/main/guide-segments'
import {guidePremiseRequest,type SavedPremiseReview} from '../src/main/guide-segment-generation'
import {finiteGuideRuntime} from '../src/main/guide-finite-runtime'
import {routeFinitePremise,repairFinitePremiseAudits,repairFinitePremiseTexts,readKnownFinitePremiseRoute} from '../src/main/guide-finite-premise-audit'
import {repairGuideNativeAudits} from '../src/main/guide-audit-repair'
import {finitePremiseTextTargets,finitePremiseTextRequest,withoutFinitePremiseTexts} from '../src/main/guide-finite-premise-text'
import {auditAnchor} from '../src/main/guide-audit-language-driver'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import {guideWithoutNativeAudits} from '../src/shared/guide-audit-candidates'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'

async function fixture(narrative=false){
 const folder=mkdtempSync(join(tmpdir(),'premise-audit-')),file=join(folder,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file),project=projects.create({name:'Independent audit routing',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic'),archive=new AiEvidenceArchive(file,job),base=segmentFixture()
 const packet={...base.packet,ourList:{...base.packet.ourList,label:'Ours',url:null},opponentLists:base.packet.opponentLists.map(l=>({...l,label:'Theirs',url:null})),matchup:'Synthetic only',deckContext:'Synthetic',gaps:[],basis:{projectId:project.id,promptVersion:'matchup-guide-28',analysisContract:'finite-evidence-1',dependencyHash:'',deckHash:'synthetic',deckVersionId:null,deckResolutionId:null,metaId:'synthetic',opponentId:'synthetic',asOf:'2026-11-05',ruleVersion:null}} as GuidePacket;packet.basis.dependencyHash=packetHash(packet)
 const scope={projectId:project.id,jobId:job.id,dependencyHash:packet.basis.dependencyHash,configHash:'synthetic'}, {turns,developmentPlan,...setup}=base.scenario
 if(narrative){const historical=(reason:string)=>({draw:'e',events:[],decision:{availableAttack:'Synthetic attack',choice:'Preserve resources',reason},tactical:structuredClone(turns.ours.tactical)});(setup as any).setupRounds=[{ours:historical('Temporary transport: decisionProof=null prevents a structured judgment.'),opponent:historical('Preserve the board under the explicit conditions.')}]}
 let prefix=appendGuideSegment(createGuideSegments(setup,scope,packet),scope,packet,turns.ours,developmentPlan.ours)
 let calls=0,pass=false,original=false,invalid=false
 const options:GuideConstructionRuntime={scope,packet,archive,reserveOutside:2,remainingCalls:()=>100-calls,check:()=>{},isCached:()=>false,estimate:r=>({stage:r.stage,units:r.units??1,encoding:'plain',visibleTokens:100,estimatedInput:1000,reservedOutput:6000,estimatedResponseCharacters:15000,margin:8192,bytes:10000,fits:true,fitsTarget:true,remainingCalls:100-calls,reservedCalls:r.reserveCalls,calibrationFactor:1.12,family:'synthetic',estimateOnly:true}),call:async request=>{
  calls++;return request.read({units:(request.data as any).units.map((u:any)=>{const d=u.data
   if(request.stage==='review-premise-audit-language')return {unitId:u.unitId,response:auditLanguagePass(d)}
   if(request.stage==='review-premise-audit-routing')return {unitId:u.unitId,response:{reviewHash:d.reviewHash,prefixHash:d.prefixHash,mode:original?'original':narrative?'text':'audit',mapping:original?[]:d.review.findings.map((_:any,i:number)=>({findingIndex:i,targets:invalid?['["opening"]']:[narrative?d.textTargets.find((t:any)=>t.id==='["setupRounds",0,"ours","decision","reason"]').id:d.targets[0].id]})),reason:'Synthetic typed routing; no real strategic quality claim.'}}
   if(request.stage==='repair-finite-premise-text')return {unitId:u.unitId,response:{caseId:d.prefix.id,prefixHash:d.prefixHash,reviewHash:d.reviewHash,texts:Object.fromEntries(d.targets.map((t:any)=>[t.key,'Preserve resources under the stated game conditions; the alternative stays conditional.']))}}
   if(request.stage==='segments-finite-audits')return {unitId:u.unitId,response:{caseId:d.native.id,sourceHash:d.sourceHash,candidatesHash:d.candidatesHash,turnKey:d.turnKey,quantityContextHash:d.quantityContextHash,decisions:Object.fromEntries(d.decisions.map((v:any)=>[v.key,auditText('Corrected synthetic audit judgment.')])),tactical:{comparison:auditText('Corrected synthetic audit wording with the unchanged physical ledger.'),promotions:Object.fromEntries(d.promotions.map((v:any)=>[v.key,auditText('Corrected synthetic promotion judgment.')]))}}}
   return {unitId:u.unitId,response:{reviewedHash:d.witnessContext.reviewedHash,verdict:pass?'pass':'revise',repairScope:pass?'none':'setup',findings:pass?[]:[{severity:'major',targetId:prefix.setup.id,message:'Synthetic audit wording is inconsistent.',correction:'Correct the audit while preserving every movement.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}],checks:['Synthetic source and ledger review.'],revalidatedIds:[],textCorrections:[]}}
  })})}}
 const runtime=finiteGuideRuntime(options);let review:any
 if(narrative){const fixed=await repairGuideNativeAudits(guideSegmentDeclarations(prefix,scope,packet),{kind:'prefix',turns:1},runtime),{turns,developmentPlan,...setup}=fixed;prefix=appendGuideSegment(createGuideSegments(setup,scope,packet),scope,packet,turns.ours,developmentPlan.ours)}
 await runGuideSegmentPhase([{id:prefix.setup.id,request:()=>guidePremiseRequest(prefix,scope,packet,2,archive),accept:r=>{review=r}}],{...runtime,stage:'review-premise-main'})
 const saved:SavedPremiseReview={prefix,review};archive.saveValue('guide-premise-review-v1',guideHash(saved),saved)
 return {file,prefix,review,runtime,archive,get calls(){return calls},passNext(){pass=true},useOriginal(){original=true},invalidTargets(){invalid=true},close(){archive.close();jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}}
}
it('routes a setup-scoped critic finding to audit-only changes and requires a fresh independent review with the original finding visible',async()=>{
 const f=await fixture();try{
  const route=await routeFinitePremise(f.prefix,f.review,f.runtime);expect(route.mode).toBe('audit')
  const fixed=await repairFinitePremiseAudits(f.prefix,f.review,route,f.runtime),mode={kind:'prefix' as const,turns:1 as const}
  expect(guideWithoutNativeAudits(guideSegmentDeclarations(fixed,f.runtime.scope,f.runtime.packet),mode)).toEqual(guideWithoutNativeAudits(guideSegmentDeclarations(f.prefix,f.runtime.scope,f.runtime.packet),mode))
  expect(fixed.segments[0].hash).not.toBe(f.prefix.segments[0].hash)
  const request=guidePremiseRequest(fixed,f.runtime.scope,f.runtime.packet,0,f.archive)
  expect((request.data as any).auditRepairContext.review).toEqual(f.review)
  expect([...f.archive.values('guide-premise-review-v1')]).toHaveLength(1)
  f.passNext();let pass:any;await runGuideSegmentPhase([{id:fixed.setup.id,request:()=>request,accept:r=>{pass=r}}],{...f.runtime,stage:'review-premise-main'})
  expect(pass.verdict).toBe('pass');expect(f.calls).toBe(5)
  expect(await repairFinitePremiseAudits(f.prefix,f.review,await routeFinitePremise(f.prefix,f.review,f.runtime),f.runtime)).toEqual(fixed);expect(f.calls).toBe(5)
 }finally{f.close()}
},60000)
it('keeps the original repair route when AI does not narrow every finding to an audit',async()=>{const f=await fixture();try{f.useOriginal();const route=await routeFinitePremise(f.prefix,f.review,f.runtime);expect(route.mode).toBe('original');await expect(repairFinitePremiseAudits(f.prefix,f.review,route,f.runtime)).rejects.toThrow();expect(f.calls).toBe(2)}finally{f.close()}})
it('rejects routing into protected fields twice and never purchases a third attempt on reopening',async()=>{const f=await fixture();try{f.invalidTargets();await expect(routeFinitePremise(f.prefix,f.review,f.runtime)).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(3);await expect(routeFinitePremise(f.prefix,f.review,f.runtime)).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(3)}finally{f.close()}})
it('fails closed if the routing source was deleted, without a fresh classifier call',async()=>{const f=await fixture();try{await routeFinitePremise(f.prefix,f.review,f.runtime);const row=[...f.archive.values<any>('guide-finite-premise-route-v1')][0].value,db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',row.ref.outcomeKey)}finally{db.close()}expect(()=>readKnownFinitePremiseRoute(f.prefix,f.review,f.runtime)).toThrow('originale AI mancante');expect(f.calls).toBe(2)}finally{f.close()}})
it('repairs an inherited setup explanation with exact AI strings, recertifies anchors and requires the independent premise review',async()=>{
 const f=await fixture(true);try{
  const before=guideSegmentDeclarations(f.prefix,f.runtime.scope,f.runtime.packet),route=await routeFinitePremise(f.prefix,f.review,f.runtime);expect(route.mode).toBe('text')
  const routeReceipt=[...f.archive.values<any>('guide-finite-premise-route-v1')][0].value,routeDescriptor=f.archive.value<any>('guide-finite-request-v1',routeReceipt.ref.unitId).request
  expect(routeDescriptor.task).not.toContain('Se occorre qualsiasi modifica fuori dagli audit scegli original');expect(routeDescriptor.task).toContain('mode=text');expect(routeDescriptor.schema.properties.mode.enum).toEqual(['audit','text','original'])
  const fixed=await repairFinitePremiseTexts(f.prefix,f.review,route,f.runtime),after=guideSegmentDeclarations(fixed,f.runtime.scope,f.runtime.packet),ids=route.mapping.flatMap(m=>m.targets),selected=finitePremiseTextTargets(f.prefix,f.runtime).filter(t=>ids.includes(t.id))
  expect(withoutFinitePremiseTexts(after,selected)).toEqual(withoutFinitePremiseTexts(before,selected));expect(after.setupRounds[0].ours.decision.reason).toBe('Preserve resources under the stated game conditions; the alternative stays conditional.')
  expect(guideSegmentDeclarations(f.prefix,f.runtime.scope,f.runtime.packet)).toEqual(before);expect([...f.archive.values('guide-premise-review-v1')]).toHaveLength(1)
  const request=guidePremiseRequest(fixed,f.runtime.scope,f.runtime.packet,0,f.archive);expect((request.data as any).auditRepairContext.review).toEqual(f.review)
  f.passNext();let reviewed:any;await runGuideSegmentPhase([{id:fixed.setup.id,request:()=>request,accept:r=>{reviewed=r}}],{...f.runtime,stage:'review-premise-main'});expect(reviewed.verdict).toBe('pass')
  const calls=f.calls;expect(await repairFinitePremiseTexts(f.prefix,f.review,route,f.runtime)).toEqual(fixed);expect(f.calls).toBe(calls)
 }finally{f.close()}
},60000)
it('keeps the original schema limits and rejects protected paths, extra output and unchanged text',async()=>{const f=await fixture(true);try{
 const targets=finitePremiseTextTargets(f.prefix,f.runtime),target=targets.find(t=>t.id==='["setupRounds",0,"ours","decision","reason"]')!,make=finitePremiseTextRequest(f.prefix,f.review,[target.id],f.runtime,5),d=make.request.data as any,raw={caseId:f.prefix.setup.id,prefixHash:d.prefixHash,reviewHash:d.reviewHash,texts:{t0:'Corrected game explanation.'}}
 expect(()=>make.request.read({...raw,body:{events:[]}})).toThrow();expect(()=>make.request.read({...raw,prefixHash:'different'})).toThrow();expect(()=>make.request.read({...raw,texts:{t0:target.text}})).toThrow('nessuna correzione');expect(()=>make.request.read({...raw,texts:{t0:'x'.repeat(target.schema.maxLength+1)}})).toThrow()
 expect(()=>finitePremiseTextRequest(f.prefix,f.review,['["opening"]'],f.runtime,0)).toThrow('destinazioni');expect(()=>finitePremiseTextRequest(f.prefix,f.review,[target.id,target.id],f.runtime,0)).toThrow('duplicate')
 expect(()=>make.request.read({...raw,texts:{t0:'Type: Null remains a card name; null is also an ordinary word.'}})).not.toThrow()
}finally{f.close()}},60000)
it('does not renew the premise negatives after a narrative correction, including a direct repair entry',async()=>{const f=await fixture(true);try{
 const route=await routeFinitePremise(f.prefix,f.review,f.runtime),fixed=await repairFinitePremiseTexts(f.prefix,f.review,route,f.runtime),request=guidePremiseRequest(fixed,f.runtime.scope,f.runtime.packet,0,f.archive);let second:any
 await runGuideSegmentPhase([{id:fixed.setup.id,request:()=>request,accept:r=>{second=r}}],{...f.runtime,stage:'review-premise-main'});const saved={prefix:fixed,review:second};f.archive.saveValue('guide-premise-review-v1',guideHash(saved),saved)
 const calls=f.calls;await expect(routeFinitePremise(fixed,second,f.runtime)).rejects.toMatchObject({code:'draft-limit'});await expect(repairFinitePremiseTexts(f.prefix,f.review,route,f.runtime)).rejects.toMatchObject({code:'draft-limit'});expect(f.calls).toBe(calls)
}finally{f.close()}},60000)
it('refuses narrative recovery when its original model response is missing',async()=>{const f=await fixture(true);try{
 const route=await routeFinitePremise(f.prefix,f.review,f.runtime),fixed=await repairFinitePremiseTexts(f.prefix,f.review,route,f.runtime),record=[...f.archive.values<any>('guide-finite-premise-text-context-v1')][0].value,calls=f.calls,db=new DatabaseSync(f.file)
 try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',record.ref.outcomeKey)}finally{db.close()}
 expect(()=>guidePremiseRequest(fixed,f.runtime.scope,f.runtime.packet,0,f.archive)).toThrow('originale AI mancante');expect(f.calls).toBe(calls)
}finally{f.close()}},60000)
it('does not transfer the old quantitative approval after a narrative anchor changes',async()=>{const f=await fixture(true);try{
 const route=await routeFinitePremise(f.prefix,f.review,f.runtime),fixed=await repairFinitePremiseTexts(f.prefix,f.review,route,f.runtime),native=guideSegmentDeclarations(fixed,f.runtime.scope,f.runtime.packet),anchor=auditAnchor(native,['setupRounds',0,'ours']),fresh=[...f.archive.values<any>('guide-audit-language-pass-v1')].filter(r=>r.value.targets.some((t:any)=>t.anchorHash===anchor))
 expect(fresh).toHaveLength(1);const calls=f.calls,db=new DatabaseSync(f.file)
 try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-audit-language-pass-v1',fresh[0].key)}finally{db.close()}
 expect(()=>guidePremiseRequest(fixed,f.runtime.scope,f.runtime.packet,0,f.archive)).toThrow('riesame quantitativo mancante');expect(f.calls).toBe(calls)
}finally{f.close()}},60000)
