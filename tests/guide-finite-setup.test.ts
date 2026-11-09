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
import {guideWithoutNativeAudits} from '../src/shared/guide-audit-candidates'
import {guideHash,packetHash,type GuidePacket} from '../src/main/matchup-guide-packet'
import {guideSegmentNativeSchema,createGuideSegments,appendGuideSegment} from '../src/main/guide-segments'
import {constructFiniteGuideSetup} from '../src/main/guide-finite-setup'
import {repairGuideSetup} from '../src/main/guide-setup-repair'
import type {GuidePremiseReview} from '../src/main/guide-premise-review'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {saveGuideSegmentCheckpoint} from '../src/main/guide-segment-checkpoints'
import {constructGuideMainLines} from '../src/main/guide-mainline-phase'

function fixture(){
  const folder=mkdtempSync(join(tmpdir(),'finite-setup-')),file=join(folder,'data.sqlite'),projects=new ProjectStore(file),jobs=new AiJobStore(file),project=projects.create({name:'Synthetic historical setup',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic-historical'),archive=new AiEvidenceArchive(file,job),base=segmentFixture()
  const packet={...base.packet,ourList:{...base.packet.ourList,label:'Synthetic ours',url:null},opponentLists:base.packet.opponentLists.map(l=>({...l,label:'Synthetic opponent',url:null})),matchup:'Synthetic historical setup',deckContext:'Synthetic only',gaps:[],basis:{...base.packet.basis,projectId:project.id,promptVersion:'matchup-guide-28',analysisContract:'finite-evidence-1',deckHash:'synthetic',deckVersionId:null,deckResolutionId:null,metaId:'synthetic',opponentId:'synthetic',asOf:'2026-11-05',ruleVersion:null,dependencyHash:''}} as GuidePacket
  packet.basis.dependencyHash=packetHash(packet)
  const scope={projectId:project.id,jobId:job.id,dependencyHash:packet.basis.dependencyHash,configHash:'synthetic-only'}
  const nativeSchema=guideSegmentNativeSchema(base.scenario.id,packet,'their-list');delete nativeSchema.properties.turns;delete nativeSchema.properties.developmentPlan;nativeSchema.required=nativeSchema.required.filter((k:string)=>!['turns','developmentPlan'].includes(k))
  const historical=(body:any)=>({...structuredClone(body),decision:{availableAttack:'Synthetic free attack',choice:'Draw without attacking in this protocol fixture',reason:'Synthetic accounting fixture; no strategic-quality claim.'}})
  const native={...structuredClone(base.scenario),setupRounds:[{ours:historical(base.scenario.turns.ours),opponent:historical(base.opponent)},{ours:historical(base.scenario.turns.ours),opponent:historical(base.opponent)}]} as any;delete native.turns;delete native.developmentPlan
  let calls=0,bad=0,negative=false,alternativeOpening=false,overdrawFirst=false,overdrawBoth=false,badPositions=0,deadPositions=false;const stages:string[]=[]
  const options:GuideConstructionRuntime={scope,packet,archive,reserveOutside:2,check:()=>{},remainingCalls:()=>100-calls,isCached:()=>false,
    estimate:r=>({stage:r.stage,units:r.units??1,encoding:'plain',visibleTokens:100,estimatedInput:1000,reservedOutput:6000,estimatedResponseCharacters:15000,margin:8192,bytes:10000,fits:true,fitsTarget:true,remainingCalls:100-calls,reservedCalls:r.reserveCalls,calibrationFactor:1.12,family:'synthetic',estimateOnly:true}),
    call:async request=>{calls++;stages.push(request.stage);const data=request.data as any
      return request.read({units:data.units.map((unit:any)=>{const d=unit.data
        if(request.stage==='review-premise-audit-language')return {unitId:unit.unitId,response:auditLanguagePass(d)}
        if(request.stage==='segments-finite-audits')return {unitId:unit.unitId,response:{caseId:d.native.id,sourceHash:d.sourceHash,candidatesHash:d.candidatesHash,turnKey:d.turnKey,quantityContextHash:d.quantityContextHash,decisions:{},tactical:{comparison:auditText(base.scenario.turns.ours.tactical.comparison),promotions:{}}}}
        if(request.stage==='segments-finite-position-repair'){
          const positions=Object.fromEntries(d.candidates.map((c:any)=>[c.id,{damage:deadPositions?120:0,condition:null,hpAdjustment:{amount:0,sourceIds:[]}}]))
          if(badPositions-->0)delete positions[d.candidates[0].id]
          return {unitId:unit.unitId,response:{caseId:d.caseId,sourceHash:d.sourceHash,candidatesHash:d.candidatesHash,positions}}
        }
        if(request.stage==='segments-finite-setup-frames'){
          const frame=Object.fromEntries(Object.entries(structuredClone(native)).filter(([k])=>!['firstOpponentTurn','setupRounds',...d.fixedOpening?['opening']:[]].includes(k))) as any
          if(alternativeOpening&&!d.fixedOpening)frame.opening.ours.hand[0]='p'
          return {unitId:unit.unitId,response:{caseId:native.id,contextHash:d.contextHash,frame,leadOpponent:false,rounds:2,changeSummary:'Synthetic historical declarations.'}}
        }
        const match=/round-(\d+)-(ours|opponent)/.exec(d.slotId)!,body=structuredClone(native.setupRounds[Number(match[1])-1][match[2]])
        if((overdrawBoth||overdrawFirst&&d.ordinal===0)&&d.slotId==='round-1-ours')body.events=[{kind:'effect',description:'Synthetic overdraw must fail physical stock.',moves:[{side:'ours',printId:'p',count:60,from:'deck',to:'hand'}],energyRoutes:[],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:null}]
        if(bad>0){body.tactical.cards=['card:e'];bad--}
        return {unitId:unit.unitId,response:{caseId:native.id,headerHash:d.headerHash,slotId:d.slotId,previousHash:d.previousHash,body}}
      })})},}
  const input={caseId:native.id,nativeSchema,fixedOpening:native.opening,context:{fixture:'four historical turns, no competitive-quality claim'},validate:(n:Record<string,any>,summary:string)=>{const journal=createGuideSegments(n,scope,packet);if(negative)throw Error('Synthetic independent complete-gate rejection');return {native:n,summary,journal}}}
  return {folder,file,archive,options,input,native,base,stages,get calls(){return calls},failFormat(count:number){bad=count},rejectComplete(){negative=true},overdrawFirstProposal(){overdrawFirst=true},overdrawAll(){overdrawBoth=true},stalePositions(){native.positionAnnotations[0].zone='bench'},invalidPositionResponses(count:number){badPositions=count},nonlivingPositionResponses(){deadPositions=true},useAlternativeOpening(){alternativeOpening=true},close(){archive.close();jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}}
}

it('assembles four original historical turns and replays the complete unchanged physical gate before returning',async()=>{
  const f=fixture()
  try{
    const result=await constructFiniteGuideSetup(f.input,f.options)
    expect(guideWithoutNativeAudits(result.native,{kind:'setup'})).toEqual(guideWithoutNativeAudits(f.native,{kind:'setup'}));expect(f.calls).toBe(13)
    expect(f.stages).toEqual(['segments-finite-setup-frames',...Array(4).fill('segments-finite-setup-turns'),...Array(4).fill(['segments-finite-audits','review-premise-audit-language']).flat()])
    const calls=f.calls,again=await constructFiniteGuideSetup(f.input,f.options)
    expect(again).toEqual(result);expect(f.calls).toBe(calls)
    const declared=[...f.archive.values<any>('guide-finite-setup-constructed-v1')][0].value
    expect(declared.turns).toHaveLength(4);expect(declared.requiresIndependentPremiseReview).toBe(true)
  }finally{f.close()}
},60000)

it('repairs only stale position facts after the movement replay and authenticates both original and replacement',async()=>{
 const f=fixture();try{
  f.stalePositions();const original=structuredClone(f.native),result=await constructFiniteGuideSetup(f.input,f.options)
  expect(result.native.positionAnnotations[0].zone).toBe('active');expect(f.native).toEqual(original);expect(f.calls).toBe(14)
  const without=(v:any)=>{const n=structuredClone(v);delete n.positionAnnotations;return n}
  expect(guideWithoutNativeAudits(without(result.native),{kind:'setup'})).toEqual(guideWithoutNativeAudits(without(original),{kind:'setup'}))
  const source=[...f.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.stage==='segments-finite-setup-frames')!
  expect(source.value.value.frame.positionAnnotations[0].zone).toBe('bench')
  const receipt=[...f.archive.values<any>('guide-native-position-repair-v1')][0].value
  expect(receipt.requiresCompleteValidation).toBe(true);expect(f.archive.value<any>('guide-segment-unit-result-v1',receipt.source.outcomeKey).accepted).toBe(true)
  const count=f.calls;expect(await constructFiniteGuideSetup(f.input,f.options)).toEqual(result);expect(f.calls).toBe(count)
 }finally{f.close()}
},60000)

it.each(['missing','nonliving'] as const)('retains %s annotation rejections and never rebuilds the physical ledger to bypass two bad responses',async mode=>{
 const f=fixture();try{
  f.stalePositions();if(mode==='missing')f.invalidPositionResponses(10);else f.nonlivingPositionResponses()
  await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toMatchObject({code:'invalid-response'})
  expect(f.calls).toBe(7);expect(f.stages.filter(s=>s==='segments-finite-setup-frames')).toHaveLength(1);expect([...f.archive.values('guide-native-position-repair-v1')]).toHaveLength(0)
  const count=f.calls;await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toMatchObject({code:'invalid-response'});expect(f.calls).toBe(count)
 }finally{f.close()}
},60000)

it('preserves draft-limit on repeated physical rejection during reopening, without asking for position or audit prose',async()=>{
 const f=fixture();try{
  f.overdrawAll();await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toMatchObject({code:'draft-limit'})
  expect(f.calls).toBe(10);expect(f.stages.some(s=>s==='segments-finite-position-repair'||s==='segments-finite-audits')).toBe(false)
  const count=f.calls;await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toMatchObject({code:'draft-limit'});expect(f.calls).toBe(count);expect([...f.archive.values('guide-finite-setup-negative-v1')]).toHaveLength(2)
 }finally{f.close()}
},60000)

it('keeps the complete setup gate after a position repair and rejects a missing authenticated annotation source on reopen',async()=>{
 const f=fixture();try{
  f.stalePositions();await constructFiniteGuideSetup(f.input,f.options)
  const receipt=[...f.archive.values<any>('guide-native-position-repair-v1')][0].value,count=f.calls,db=new DatabaseSync(f.file)
  try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',receipt.source.outcomeKey)}finally{db.close()}
  await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('risposta conosciuta');expect(f.calls).toBe(count)
 }finally{f.close()}
},60000)

it('rejects source IDs in audit card fields and authenticates the corrected turn instead of regenerating the whole setup',async()=>{
  const f=fixture()
  try{
    f.failFormat(1);const result=await constructFiniteGuideSetup(f.input,f.options)
    expect(guideWithoutNativeAudits(result.native,{kind:'setup'})).toEqual(guideWithoutNativeAudits(f.native,{kind:'setup'}));expect(f.calls).toBe(14)
    expect(f.stages.filter(s=>s==='segments-finite-setup-frames')).toHaveLength(1)
    const rows=[...f.archive.values<any>('guide-segment-unit-result-v1')]
    expect(rows.filter(r=>!r.value.accepted)).toHaveLength(1)
    expect(rows.some(r=>r.value.accepted&&r.value.retryOrdinal===1)).toBe(true)
  }finally{f.close()}
},60000)

it('stops after two invalid responses for a historical turn and spends nothing more on reopening',async()=>{
  const f=fixture()
  try{
    f.failFormat(10);await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('due risposte non valide')
    expect(f.calls).toBe(3) // one frame, two rejected declarations
    const calls=f.calls;await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('due risposte non valide');expect(f.calls).toBe(calls)
  }finally{f.close()}
},60000)

it('retains complete-gate rejections, stops after two complete proposals and never publishes a structurally valid fragment as a setup',async()=>{
  const f=fixture()
  try{
    f.rejectComplete();await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('due costruzioni complete')
    expect([...f.archive.values('guide-finite-setup-negative-v1')]).toHaveLength(2)
    expect([...f.archive.values('guide-finite-setup-constructed-v1')]).toHaveLength(0)
    expect(f.calls).toBe(18)
    const calls=f.calls;await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('due costruzioni complete');expect(f.calls).toBe(calls)
  }finally{f.close()}
},90000)

it('requires the actual source response on reopening, without a fresh model request to conceal its deletion',async()=>{
  const f=fixture()
  try{
    await constructFiniteGuideSetup(f.input,f.options);const source=[...f.archive.values<any>('guide-segment-unit-result-v1')][0],calls=f.calls,db=new DatabaseSync(f.file)
    try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',source.key)}finally{db.close()}
    await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('risposta conosciuta');expect(f.calls).toBe(calls)
  }finally{f.close()}
},60000)

it('uses the same fragmented constructor to repair an independently rejected premise, including a legal new hidden-card hypothesis',async()=>{
  const f=fixture()
  try{
    const root=createGuideSegments(f.native,f.options.scope,f.options.packet),prefix=appendGuideSegment(root,f.options.scope,f.options.packet,f.base.scenario.turns.ours,f.base.scenario.developmentPlan.ours)
    const review:GuidePremiseReview={reviewedHash:prefix.segments[0].hash,verdict:'revise',repairScope:'setup',findings:[{severity:'major',targetId:prefix.setup.id,message:'Synthetic hidden-card hypothesis requires independent revision.',correction:'Rebuild the initial hypothesis without removing original resource gates.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}],checks:['Synthetic protocol judgment only.'],revalidatedIds:[],textCorrections:[]}
    f.archive.saveValue('guide-premise-review-v1',guideHash({prefix,review}),{prefix,review});f.useAlternativeOpening()
    const repaired=await repairGuideSetup(prefix,review,f.options)
    expect(repaired.opening.ours.hand[0]).toBe('p');expect(guideWithoutNativeAudits({...repaired,opening:f.native.opening},{kind:'setup'})).toEqual(guideWithoutNativeAudits(f.native,{kind:'setup'}))
    expect(createGuideSegments(repaired,f.options.scope,f.options.packet).rootHash).not.toBe(root.rootHash)
    expect(f.calls).toBe(13)
    const calls=f.calls;expect(await repairGuideSetup(prefix,review,f.options)).toEqual(repaired);expect(f.calls).toBe(calls)
  }finally{f.close()}
},60000)


it('reopens the authenticated positive successor after one physical rejection without retrying that rejected ledger',async()=>{
 const f=fixture();try{f.overdrawFirstProposal();const result=await constructFiniteGuideSetup(f.input,f.options);expect(f.calls).toBe(18);expect([...f.archive.values('guide-finite-setup-negative-v1')]).toHaveLength(1);expect([...f.archive.values('guide-finite-setup-constructed-v1')]).toHaveLength(1);const calls=f.calls;expect(await constructFiniteGuideSetup(f.input,f.options)).toEqual(result);expect(f.calls).toBe(calls)}finally{f.close()}
},60000)

it('replays a paid setup after later premise history grows, then still forces the saved negative through its correction route',async()=>{
 const f=fixture();try{
  const root=createGuideSegments(f.native,f.options.scope,f.options.packet),prefix=appendGuideSegment(root,f.options.scope,f.options.packet,f.base.scenario.turns.ours,f.base.scenario.developmentPlan.ours)
  const review:GuidePremiseReview={reviewedHash:prefix.segments[0].hash,verdict:'revise',repairScope:'setup',findings:[{severity:'major',targetId:prefix.setup.id,message:'Synthetic original setup change.',correction:'Revise the original hidden-card hypothesis.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}],checks:['Synthetic protocol only.'],revalidatedIds:[],textCorrections:[]}
  f.archive.saveValue('guide-premise-review-v1',guideHash({prefix,review}),{prefix,review});f.useAlternativeOpening()
  const repaired=await repairGuideSetup(prefix,review,f.options),repairedRoot=createGuideSegments(repaired,f.options.scope,f.options.packet),laterPrefix=appendGuideSegment(repairedRoot,f.options.scope,f.options.packet,f.base.scenario.turns.ours,f.base.scenario.developmentPlan.ours)
  const later:GuidePremiseReview={...review,reviewedHash:laterPrefix.segments[0].hash,findings:[{...review.findings[0],severity:'minor',message:'Synthetic historical audit wording remains wrong.',correction:'Correct the audit while preserving physical declarations.'}]},saved={prefix:laterPrefix,review:later},key=guideHash(saved)
  f.archive.saveValue('guide-premise-review-v1',key,saved)
  saveGuideSegmentCheckpoint(f.archive,f.options.scope,f.options.packet,repairedRoot)
  saveGuideSegmentCheckpoint(f.archive,f.options.scope,f.options.packet,laterPrefix)
  saveGuideSegmentCheckpoint(f.archive,f.options.scope,f.options.packet,repairedRoot,{reviewHash:key,reason:later.findings[0].message})
  const calls=f.calls,originals=[...f.archive.values<any>('guide-segment-unit-result-v1')]
  expect(await repairGuideSetup(prefix,review,f.options)).toEqual(repaired);expect(f.calls).toBe(calls)
  await expect(constructGuideMainLines({...f.options,setups:[repaired]})).rejects.toMatchObject({name:'GuidePremiseSetupRejected',review:later})
  expect(f.calls).toBe(calls);for(const row of originals)expect(f.archive.value('guide-segment-unit-result-v1',row.key)).toEqual(row.value)
  expect([...f.archive.values<any>('guide-finite-setup-constructed-v1')]).toHaveLength(1)
  const db=new DatabaseSync(f.file);try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-premise-review-v1',key)}finally{db.close()}
  await expect(repairGuideSetup(prefix,review,f.options)).rejects.toMatchObject({code:'invalid-response'});expect(f.calls).toBe(calls)
 }finally{f.close()}
},60000)

it('resumes the remaining second proposal after interruption following one quantified full-gate rejection',async()=>{
 const f=fixture();try{f.rejectComplete();f.options.check=()=>{if([...f.archive.values('guide-finite-setup-negative-v1')].length===1)throw Error('Synthetic interruption after the first full rejection')};await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('Synthetic interruption');expect(f.calls).toBe(13);expect([...f.archive.values('guide-finite-setup-negative-v1')]).toHaveLength(1);f.options.check=()=>{};await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('due costruzioni complete');expect(f.calls).toBe(18);expect([...f.archive.values('guide-finite-setup-negative-v1')]).toHaveLength(2);const calls=f.calls;await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('due costruzioni complete');expect(f.calls).toBe(calls)}finally{f.close()}
},60000)
