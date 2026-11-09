import {it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {segmentFixture} from './fixtures/guide-segment'
import {auditText,auditLanguagePass} from './fixtures/guide-audit'
import {guideHash,guideSource,packetHash,type GuidePacket} from '../src/main/matchup-guide-packet'
import {finiteGuideRuntime} from '../src/main/guide-finite-runtime'
import {repairGuideNativeAudits,quantifiedAuditPatch} from '../src/main/guide-audit-repair'
import {collectGuideAuditCandidates,projectGuideSetup} from '../src/shared/guide-ledger-projection'
import {guideWithoutNativeAudits} from '../src/shared/guide-audit-candidates'
import {createGuideSegments,appendGuideSegment} from '../src/main/guide-segments'
import {guideTurnDeclarationRequest,withGuideSegmentRetry} from '../src/main/guide-segment-generation'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'

function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'audit-repair-')),file=join(folder,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file),project=projects.create({name:'Independent audit fixture',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'audit-fixture'),archive=new AiEvidenceArchive(file,job),base=segmentFixture()
 const packet={...base.packet,ourList:{...base.packet.ourList,label:'Synthetic ours',url:null},opponentLists:base.packet.opponentLists.map(l=>({...l,label:'Synthetic opponent',url:null})),matchup:'Independent synthetic audit',deckContext:'Synthetic',gaps:[],basis:{projectId:project.id,promptVersion:'matchup-guide-28',analysisContract:'finite-evidence-1',deckHash:'synthetic',deckVersionId:null,deckResolutionId:null,metaId:'synthetic',opponentId:'synthetic',asOf:'2026-11-05',ruleVersion:null,dependencyHash:''}} as GuidePacket;packet.basis.dependencyHash=packetHash(packet)
 const scope={projectId:project.id,jobId:job.id,dependencyHash:packet.basis.dependencyHash,configHash:'synthetic'}
 const event={kind:'play',description:'Synthetic manual Grass attachment to the sole Active.',moves:[],energyRoutes:[{side:'ours',printId:'e',count:1,path:['hand','attached'],hostPrintId:'p',sourceIds:['rules'],attachment:'manual'}],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:{cards:[],reason:'Incomplete original synthetic declaration.'}}
 const {turns,developmentPlan,...setup}=structuredClone(base.scenario),decision={availableAttack:'Synthetic free attack',choice:'Keep the board',reason:'Synthetic accounting only.'}
 const native:any={...setup,setupRounds:[{ours:{draw:'e',events:[event],decision,tactical:{attacks:[],cards:[],promotions:[],comparison:'Incomplete original synthetic audit.'}},opponent:{draw:'e',events:[],decision,tactical:structuredClone(base.opponent.tactical)}}]}
 let calls=0,bad=0,budget=80,badEvent=0,wrongQuantity=0,languageNegatives=0,overdraw=false,nativeResponse:any=null;const requests:any[]=[]
 const options:GuideConstructionRuntime={scope,packet,archive,reserveOutside:3,check:()=>{},remainingCalls:()=>budget-calls,isCached:()=>false,
 estimate:r=>({stage:r.stage,units:r.units??1,encoding:'plain',visibleTokens:100,estimatedInput:1000,reservedOutput:6000,estimatedResponseCharacters:15000,margin:8192,bytes:10000,fits:true,fitsTarget:true,remainingCalls:budget-calls,reservedCalls:r.reserveCalls,calibrationFactor:1.12,family:'synthetic',estimateOnly:true}),
 call:async r=>{calls++;requests.push(r);return r.read({units:(r.data as any).units.map((u:any)=>{
  const d=u.data
  if(r.stage==='review-premise-audit-language'){const result:any=auditLanguagePass(d);if(languageNegatives-->0){result.verdict='revise';result.targets.t0.findings=[{quote:d.targets[0].text,reason:'Synthetic unresolved implicit quantitative assertion.'}]}return {unitId:u.unitId,response:result}}
  if(r.stage==='segments-finite-turn-frames')return {unitId:u.unitId,response:{caseId:nativeResponse.caseId,parentHash:nativeResponse.parentHash,phase:nativeResponse.phase,contextHash:d.contextHash,body:{draw:nativeResponse.body.draw,tactical:null},development:nativeResponse.development,eventPlan:{events:nativeResponse.body.events.map((_:any,i:number)=>'Synthetic event '+i)}}}
  if(r.stage==='segments-finite-turn-events'){const index=Number(d.slotId.split('-').at(-1)),body={...structuredClone(nativeResponse.body.events[index]),decisionProof:null};if(overdraw&&d.ordinal===0)body.energyRoutes[0].count=60;const frameHash=badEvent-->0?'invalid-frame':d.frameHash;return {unitId:u.unitId,response:{contextHash:d.contextHash,frameHash,slotId:d.slotId,previousHash:d.previousHash,body}}}
  if(r.stage!=='segments-finite-audits')return {unitId:u.unitId,response:nativeResponse}
  const response:any={caseId:native.id,sourceHash:d.sourceHash,candidatesHash:d.candidatesHash,turnKey:d.turnKey,quantityContextHash:d.quantityContextHash,decisions:Object.fromEntries(d.decisions.map((v:any)=>[v.key,auditText('Synthetic comparison of every supplied pre-action candidate, with printed cost and timing.')])),tactical:{comparison:auditText('Synthetic comparison of all supplied cards and attacks. No competitive optimality is claimed.'),promotions:Object.fromEntries(d.promotions.map((v:any)=>[v.key,auditText('Synthetic conditional promotion comparison.')]))}}
  if(!Object.hasOwn((u as any),'schema')){const g=d.group;const original=collectGuideAuditCandidates(native,packet,{kind:'setup'});if(!original.groups.some(x=>x.turn===g.turn))throw Error('Unexpected group')}
  if(d.semanticFeedback&&response.tactical)response.tactical.comparison=auditText('Corrected synthetic conditional judgment; no change to the physical register.')
  if(bad>0){bad--;response.native={opening:'illegal mutation'}}
  if(wrongQuantity>0){wrongQuantity--;const window=d.quantityContext.windows[0],card=d.quantityContext.cards[0];response.tactical.comparison=[{text:null,quantity:{windowId:window.id,side:card.side,printId:card.printId,zone:'deck',host:null,count:card.total+1},card:null,measureId:null}]}
  return {unitId:u.unitId,response}
 })})}}
 const runtime=finiteGuideRuntime(options)
 return {file,native,scope,packet,archive,runtime,base,event,requests,get calls(){return calls},fail(n:number){bad=n},rejectLanguage(n:number){languageNegatives=n},badEvents(n:number){badEvent=n},invalidQuantities(n:number){wrongQuantity=n},overdrawFirstFragment(){overdraw=true},limit(n:number){budget=n},response(v:any){nativeResponse=v},close(){archive.close();jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}}
}

it('repairs a negative quantitative meaning judgment only in the audit and requires a fresh semantic pass',async()=>{const f=fixture();try{f.rejectLanguage(1);const before=guideHash(guideWithoutNativeAudits(f.native,{kind:'setup'})),result=await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime);expect(guideHash(guideWithoutNativeAudits(result,{kind:'setup'}))).toBe(before);expect([...f.archive.values('guide-audit-language-negative-v1')]).toHaveLength(1);expect(f.calls).toBe(6);const calls=f.calls;expect(await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).toEqual(result);expect(f.calls).toBe(calls)}finally{f.close()}},60000)
it('retains two semantic rejections and never reopens their local limit with new calls',async()=>{const f=fixture();try{f.rejectLanguage(20);await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('due riesami semantici');expect([...f.archive.values('guide-audit-language-negative-v1')]).toHaveLength(2);expect([...f.archive.values('guide-native-audit-repair-v1')]).toHaveLength(0);const calls=f.calls;await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('due riesami semantici');expect(f.calls).toBe(calls)}finally{f.close()}},60000)
it('fails closed after deletion of the independent semantic source, without buying a replacement',async()=>{const f=fixture();try{await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime);const review=[...f.archive.values<any>('guide-audit-language-pass-v1')][0].value.ref,db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',review.outcomeKey)}finally{db.close()}const calls=f.calls;await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow();expect(f.calls).toBe(calls)}finally{f.close()}},60000)
it('does not renew two authentic historical quantity failures when changing the narrative protocol',async()=>{const f=fixture();try{
 const original=f.runtime.call;f.runtime.call=async()=>{throw Error('Synthetic stop before dispatch')};await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('Synthetic stop');f.runtime.call=original
 const snapshot=[...f.archive.values<any>('guide-finite-request-v1')].find(r=>r.value.request.validationId==='guide-finite-audit-3')!.value.request,data=structuredClone(snapshot.data);delete data.auditProtocol;delete data.semanticRound;delete data.semanticFeedback
 const read=(raw:any)=>{assertNativeScenarioSchema(raw,snapshot.schema);quantifiedAuditPatch(data,raw,2);return structuredClone(raw)}
 f.invalidQuantities(2);await expect(runGuideSegmentPhase([{id:'historical',request:()=>withGuideSegmentRetry({...snapshot,data,reserveCalls:3,read,cacheValidation:{id:'guide-finite-audit-2',validate:v=>{read(v)}}},f.scope,f.archive),accept:()=>{throw Error('No invalid count can be accepted')}}],{...f.runtime,stage:'segments-finite-audits'})).rejects.toThrow('due risposte non valide')
 expect(f.calls).toBe(2);await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('nessun costruttore riavviato');expect(f.calls).toBe(2);expect([...f.archive.values('guide-native-audit-repair-v1')]).toHaveLength(0)
}finally{f.close()}},60000)

it('derives all pre-action and turn candidates from the original ledger; returns facts without approving an incomplete audit',()=>{
 const f=fixture();try{const facts=collectGuideAuditCandidates(f.native,f.packet,{kind:'setup'});expect(facts.choices[0].candidateIds.sort()).toEqual(['e','p']);expect(facts.groups[0].cards.map(c=>c.printId).sort()).toEqual(['e','p']);expect((facts as any).setupReceipt).toBeUndefined();expect(()=>projectGuideSetup({scenarios:[f.native]},f.packet)).toThrow('alternative PRIMA');expect(f.calls).toBe(0)}finally{f.close()}
})
it('repairs only audits with explicit AI judgments, preserves all other fields and reopens with zero calls',async()=>{
 const f=fixture();try{const before=guideHash(guideWithoutNativeAudits(f.native,{kind:'setup'})),fixed=await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime);expect(f.calls).toBe(4);expect(guideHash(guideWithoutNativeAudits(fixed,{kind:'setup'}))).toBe(before);expect(f.native.setupRounds[0].ours.events[0].decisionProof.cards).toEqual([]);expect(()=>projectGuideSetup({scenarios:[fixed]},f.packet)).not.toThrow();expect([...f.archive.values<any>('guide-native-audit-repair-v1')][0].value.requiresIndependentReview).toBe(true);expect(await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).toEqual(fixed);expect(f.calls).toBe(4)}finally{f.close()}
},60000)
it('rejects any attempt to change the ledger and stops after two invalid audit responses, including after reopening',async()=>{
 const f=fixture();try{f.fail(5);await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(2);expect([...f.archive.values('guide-native-audit-repair-v1')]).toHaveLength(0);await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(2)}finally{f.close()}
},60000)
it('retains the outside reserve before spending an audit call and does not alter the declaration on a budget stop',async()=>{
 const f=fixture();try{f.limit(3);const before=guideHash(f.native);await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow();expect(f.calls).toBe(0);expect(guideHash(f.native)).toBe(before)}finally{f.close()}
})
it('fails closed if an accepted audit source was deleted instead of hiding it with another provider call',async()=>{
 const f=fixture();try{await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime);const source=[...f.archive.values<any>('guide-segment-unit-result-v1')][0],db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',source.key)}finally{db.close()}await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('risposta conosciuta');expect(f.calls).toBe(4)}finally{f.close()}
},60000)
it('rejects unavailable Energy during candidate extraction without asking AI to repair the physical ledger',async()=>{
 const f=fixture();try{f.native.setupRounds[0].ours.events[0].energyRoutes[0].count=60;await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow();expect(f.calls).toBe(0)}finally{f.close()}
})
it('supplies every defensive promotion candidate for the non-acting side without a deck-specific rule',async()=>{
 const f=fixture();try{
  const card=JSON.parse(f.packet.sources[0].content);f.packet.sources.push(guideSource('card:q','card','Independent second Basic',null,JSON.stringify({...card,printId:'q',name:'Independent second Basic'})))
  f.packet.ourList.cards=[{printId:'p',name:'Synthetic Basic',count:4},{printId:'q',name:'Independent second Basic',count:2},{printId:'e',name:'Basic Grass Energy',count:54}]
  f.native.opening.ours.hand=['p','q','e','e','e','e'];f.native.opening.ours.bench=['p','q'];f.native.positionAnnotations.push({...structuredClone(f.native.positionAnnotations[0]),printId:'q',zone:'bench'})
  f.native.setupRounds[0].ours.events[0].attachmentTargets=[{side:'ours',printId:'e',hostPrintId:'p',copy:1}]
  const empty={...structuredClone(f.event),energyRoutes:[],decisionProof:null}
  f.native.setupRounds[0].opponent.events=[{...empty,kind:'knockout',description:'Synthetic KO movement fixture, no effect-semantics claim.',moves:[{side:'ours',printId:'p',count:1,from:'active',to:'discard'}],energyRoutes:[{side:'ours',printId:'e',count:1,path:['attached','discard'],hostPrintId:'p',sourceIds:['rules'],attachment:null}]},{...empty,kind:'setup',description:'Synthetic promotion of the remaining p.',moves:[{side:'ours',printId:'p',count:1,from:'bench',to:'active'}]}]
  f.packet.basis.dependencyHash=packetHash(f.packet);f.scope.dependencyHash=f.packet.basis.dependencyHash
  const facts=collectGuideAuditCandidates(f.native,f.packet,{kind:'setup'}),group=facts.groups.find(g=>g.side==='opponent')!
  expect(group.promotions).toEqual([{side:'ours',printIds:['p','q']}])
  const repaired=await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)
  expect(repaired.setupRounds[0].opponent.tactical.promotions.map((p:any)=>p.side+'|'+p.printId).sort()).toEqual(['ours|p','ours|q'])
  expect(repaired.setupRounds[0].opponent.events).toEqual(f.native.setupRounds[0].opponent.events)
 }finally{f.close()}
},60000)
it('finalizes a native first turn through audit-only repair before the original append gate and reuses both sources on reopen',async()=>{
 const f=fixture();try{
  const setup={...f.native,setupRounds:[]},root=createGuideSegments(setup,f.scope,f.packet),body={draw:'e',events:[{...f.event,action:'other',affectedSide:'ours'}],tactical:f.native.setupRounds[0].ours.tactical},development={reason:'Synthetic attachment development.',pivot:'Preserve the board.'}
  f.response({caseId:setup.id,parentHash:root.rootHash,phase:'ours',body,development})
  let journal:any
  const run=()=>runGuideSegmentPhase([{id:setup.id,request:()=>guideTurnDeclarationRequest(root,f.scope,f.packet,{reserveCalls:3,archive:f.archive}),accept:value=>{journal=appendGuideSegment(root,f.scope,f.packet,value.body,value.development)}}],{...f.runtime,stage:'segments-main-ours'})
  await run();expect(f.calls).toBe(4);expect(journal.segments).toHaveLength(1);expect(journal.segments[0].body.events[0].decisionProof.cards.sort()).toEqual(['e','p']);await run();expect(f.calls).toBe(4)
 }finally{f.close()}
},60000)

function nativeTurn(f:ReturnType<typeof fixture>){
 const setup={...f.native,setupRounds:[]},root=createGuideSegments(setup,f.scope,f.packet),body={draw:'e',events:[{...f.event,action:'other',affectedSide:'ours'}],tactical:f.native.setupRounds[0].ours.tactical},development={reason:'Synthetic development.',pivot:'Keep board'};f.response({caseId:setup.id,parentHash:root.rootHash,phase:'ours',body,development});let result:any
 return {root,run:()=>runGuideSegmentPhase([{id:setup.id,request:()=>guideTurnDeclarationRequest(root,f.scope,f.packet,{reserveCalls:3,archive:f.archive}),accept:value=>{result=appendGuideSegment(root,f.scope,f.packet,value.body,value.development)}}],{...f.runtime,stage:'segments-main-ours'}),get result(){return result}}
}
it('rejects two mismatched event headers and reopens without a third call or partial checkpoint',async()=>{const f=fixture();try{const turn=nativeTurn(f);f.badEvents(8);await expect(turn.run()).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(3);expect(turn.result).toBeUndefined();await expect(turn.run()).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(3);expect(turn.root.segments).toHaveLength(0)}finally{f.close()}},60000)
it('reserves the audit after the frame before starting a fragmented turn',async()=>{const f=fixture();try{const turn=nativeTurn(f);f.limit(4);await expect(turn.run()).rejects.toThrow();expect(f.calls).toBe(0);expect(turn.result).toBeUndefined()}finally{f.close()}})
it('replays a positive fragmented turn after one real stock failure without repurchasing either proposal',async()=>{const f=fixture();try{const turn=nativeTurn(f);f.overdrawFirstFragment();await turn.run();expect(f.calls).toBe(6);expect([...f.archive.values('guide-finite-turn-negative-v1')]).toHaveLength(1);expect(turn.result.segments).toHaveLength(1);await turn.run();expect(f.calls).toBe(6)}finally{f.close()}},60000)
it('does not hide a deleted event source with a fresh generation on recovery',async()=>{const f=fixture();try{const turn=nativeTurn(f);await turn.run();const row=[...f.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.stage==='segments-finite-turn-events')!,db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',row.key)}finally{db.close()}await expect(turn.run()).rejects.toThrow('risposta conosciuta');expect(f.calls).toBe(4)}finally{f.close()}},60000)

it('keeps two contradictory quantity responses as local failures and never buys a third audit on reopening',async()=>{const f=fixture();try{f.invalidQuantities(8);await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('due risposte non valide');const calls=f.calls;expect(calls).toBe(2);expect([...f.archive.values('guide-native-audit-repair-v1')]).toHaveLength(0);await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(calls)}finally{f.close()}},60000)
it('authenticates quantity certificates against the original AI atoms instead of trusting a persisted text hash',async()=>{const f=fixture();try{await repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime);const old=[...f.archive.values<any>('guide-native-audit-repair-v1')][0],forged=structuredClone(old.value);forged.certified[0].valueHash='invented-rendered-text';f.archive.saveValue('guide-native-audit-repair-v1',guideHash(forged),forged);const db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-native-audit-repair-v1',old.key)}finally{db.close()}const calls=f.calls;await expect(repairGuideNativeAudits(f.native,{kind:'setup'},f.runtime)).rejects.toThrow('certificati diversi');expect(f.calls).toBe(calls)}finally{f.close()}},60000)
