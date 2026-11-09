import { it, expect } from 'vitest'
import { join } from 'node:path'
import { deliveryApplicationFixture } from './fixtures/guide-delivery-application'
import { authorizeGuideUntilValid, guideUntilValidAuthority, GUIDE_UNLIMITED_CAPACITY } from '../src/main/guide-run-policy'
import { initializeGuideDelivery, beginGuideDelivery, registerDeliveryUnit, readGuideDelivery } from '../src/main/guide-delivery-policy'
import { guideHash } from '../src/main/matchup-guide-packet'
import { AiAnalysisWork } from '../src/main/ai-analysis-work'
import { generateDeepGuide, assertGuideIntegrity, deepGuideReport } from '../src/main/matchup-guide-generation'
import { assertGuideSegmentApproval } from '../src/main/guide-segment-approval'
import { unpackGuideData } from '../src/main/guide-request-budget'
import type { GuideAttempt } from '../src/shared/matchup-guide'
import { assertNativeScenarioSchema } from '../src/main/guide-scenario-output-schema'
import {lateAuditFeedback} from '../src/main/guide-late-audit-feedback'
import {assertFiniteAuditCountsMany} from '../src/main/guide-audit-count-gate'
import {readGuideFiniteOriginals} from '../src/main/guide-finite-originals'
import {finiteNativeWitnesses} from '../src/main/guide-finite-cases'
import {guideSegmentDeclarations} from '../src/main/guide-segments'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'

const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
it('recovers a completed exact-prompt raw through the current reader without a new attempt or usage sample',async()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{
  const prompt='Exact authenticated synthetic request',transportPrompt='Losslessly encoded exact transport',inputHash=guideHash(transportPrompt),schema={type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false},raw={value:3},stage='repair-synthetic'
  f.archive.saveValue('guide-prompt',inputHash,{stage,prompt:transportPrompt,config})
  f.archive.saveValue('guide-output-schema',guideHash([prompt,schema]),{stage,schema})
  f.archive.saveValue('guide-attempt-start','001',{sequence:1,inputHash,stage,status:'running'})
  f.archive.saveValue('guide-attempt-end','001',{sequence:1,inputHash,stage,status:'succeeded'})
  f.archive.saveValue('guide-raw-response','001',{stage,inputHash,raw})
  const read=(value:any)=>{assertNativeScenarioSchema(value,schema);return {...value,derived:value.value*2}}
  const validation={id:'synthetic-derived-1',validate:(value:any)=>{expect(value.derived).toBe(value.value*2)}}
  let transportResolutions=0
  const transport=()=>{transportResolutions++;return transportPrompt}
  expect(work.restoreGuideRawCall('analysis',prompt,config,schema,read,validation,transport)).toBe(true)
  expect(transportResolutions).toBe(1)
  expect(work.restoreGuideRawCall('analysis',prompt,config,schema,read,validation,()=>{throw Error('A logical result already exists; transport must stay lazy')})).toBe(false)
  expect(await work.run('analysis',prompt,config,async()=>{throw Error('Paid raw must not be repurchased')},true,{cacheValidation:validation})).toEqual({value:3,derived:6})
  expect([...work.archive.values('guide-attempt-start')]).toHaveLength(1)
  expect([...work.archive.values('guide-token-sample')]).toHaveLength(0)
  expect([...work.archive.values<any>('guide-raw-cache-recovery-v1')][0].value.sourceSequence).toBe('001')
  expect(work.restoreGuideRawCall('analysis',prompt+' changed',config,schema,read,validation)).toBe(false)
  expect(work.restoreGuideRawCall('analysis',prompt,{...config,model:'other'},schema,read,validation)).toBe(false)
 }finally{work.close();f.close()}
})
function authorize(f:ReturnType<typeof deliveryApplicationFixture>) {
  return authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:20261108-until-valid','2026-11-08T00:00:00.000Z')
}
it('exceeds both 164 calls and 16 repair credits only under a new explicit authenticated authority',()=>{
  const f=deliveryApplicationFixture()
  try{
    authorize(f);initializeGuideDelivery(f.options.packet,config,f.archive)
    for(let i=0;i<170;i++){
      const id='different-'+i,sequence=i+1,key=String(sequence).padStart(3,'0')
      registerDeliveryUnit(f.archive,{stage:'metadata',data:{caseId:'same-case'},cacheValidation:{id:'guide-finite-metadata-1'}},id)
      const attempt={sequence,stage:'metadata',inputHash:guideHash(id),status:'running',startedAt:'2026-11-08T00:00:00.000Z'} as GuideAttempt
      beginGuideDelivery(f.archive,attempt,{units:[{unitId:id}]})
      f.archive.saveValue('guide-attempt-end',key,{...attempt,status:'succeeded'})
      const outcome={unitId:id,batchHash:guideHash([id]),accepted:true,value:{verdict:'revise'}}
      f.archive.saveValue('guide-segment-unit-result-v1',guideHash(outcome),outcome)
    }
    const policy=readGuideDelivery(f.archive)
    expect(policy.rows).toHaveLength(170);expect(policy.repairs).toBe(169)
    expect(policy.maximumCalls).toBe(GUIDE_UNLIMITED_CAPACITY)
    expect(guideUntilValidAuthority(f.archive)?.callCeiling).toBeNull()
    const removed=new Proxy(f.archive,{get(target,key){if(key==='values')return function*(role:string){if(role!=='guide-until-valid-authority-v1')yield* target.values(role)};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v}})
    expect(()=>readGuideDelivery(removed)).toThrow('Registro')
  }finally{f.close()}
},60000)
it('does not attach the new policy to existing paid history or permit another frozen packet/config',()=>{
 const f=deliveryApplicationFixture()
 try{
  f.archive.saveValue('guide-attempt-start','001',{sequence:1})
  expect(()=>authorize(f)).toThrow('storico')
  expect(guideUntilValidAuthority(f.archive)).toBeUndefined()
 }finally{f.close()}
 const fresh=deliveryApplicationFixture()
 try{authorize(fresh);expect(()=>initializeGuideDelivery(fresh.options.packet,{...config,model:'other'},fresh.archive)).toThrow('configurazione')}
 finally{fresh.close()}
})
it('completes three independent case repair rounds, keeps negatives, seals, persists and reopens without another call',async()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{
  f.badAuditReviews(3)
  authorize(f);f.repeatCaseFailures(3);f.badInitialPlans(3);f.rejectFirstOutline();f.replaceRepairLimitations('Synthetic corrected global condition, explicitly scoped to the declared cases.')
  f.badFirstAuditPatch('Synthetic unsupported absence.');f.rejectAuditText('Synthetic unsupported absence.')
  const coldStart=performance.now()
  const runner=async(prompt:string,_config:unknown,schema:object)=>f.rawResponse(/FASE: ([^\n]+)/.exec(prompt)![1],unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])),schema)
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request:'Until-valid synthetic integration.',runner})
  const coldMs=performance.now()-coldStart
  assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
  expect(guide.limitations).toContain('Synthetic corrected global condition, explicitly scoped to the declared cases.')
  expect(work.archive.value<any>('guide-finite-critic-contract-v1','contract').version).toBe(3)
  const fullCritic=[...work.archive.values<any>('guide-finite-request-v1')].find(r=>r.value.request.validationId==='guide-finite-review-6'&&r.value.request.data.reviewScope==='complete-selected-cases')!.value.request
  expect(fullCritic.data.repairTargetContract.version).toBe(1)
  expect(fullCritic.data.repairTargetContract.prose).toContain('quote')
  expect(fullCritic.data.proofCaseIds).toHaveLength(1);expect(fullCritic.data.draft.scenarios).toHaveLength(1)
  expect(fullCritic.data.crossCaseScopes).toHaveLength(1);expect(fullCritic.data.allCaseIds).toHaveLength(2)
  expect(fullCritic.data.completeDraftHash).toMatch(/^[a-f0-9]{64}$/)
  expect(fullCritic.data.auditChoiceContract.decisionProof).toContain('supporterUsed')
  const globalPatch=[...work.archive.values<any>('guide-finite-request-v1')].find(r=>r.value.request.validationId==='guide-finite-native-repair-4')!.value.request
  expect(globalPatch.schema.required).toContain('limitations');expect(globalPatch.data.contextCases).toHaveLength(2)
  const lateRequest=[...work.archive.values<any>('guide-finite-request-v1')].find(r=>r.value.request.data.lateAuditFeedback)!.value.request
  const late=lateRequest.data.lateAuditFeedback
  expect(lateRequest.data.auditPositionEvidenceVersion).toBe(1)
  expect([...work.archive.values<any>('guide-finite-request-v1')].some(r=>r.value.request.data.contextFacts?.some((fact:any)=>fact.positionEvidenceVersion===1&&fact.positionEvidence?.history?.length))).toBe(true)
  expect(late?.history.length).toBeGreaterThan(0)
  expect(late.reviews[0].review.verdict).toBe('revise')
  expect(JSON.stringify(guide)).not.toContain('Synthetic unsupported absence.')
  const lateOptions={...f.options,scope:guide.generation.finiteOriginals!.sourceScope,archive:work.archive}
  const originals=readGuideFiniteOriginals(guide)!,packet=originals.saved.nativePacket
  const auditLines=originals.natives.flatMap(n=>finiteNativeWitnesses(n.native,originals.plans.find(p=>p.caseId===n.id)!,{...lateOptions,packet}).lines.map(line=>guideSegmentDeclarations(line.journal,lateOptions.scope,packet)))
  let descriptorReads=0
  const countedArchive=new Proxy(work.archive,{get(target,key){if(key==='values')return function*(role:string){if(role==='guide-finite-request-v1')descriptorReads++;yield* target.values(role)};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
  expect(()=>assertFiniteAuditCountsMany(auditLines,packet,countedArchive)).not.toThrow()
  expect(descriptorReads).toBe(1)
  expect(()=>assertFiniteAuditCountsMany([],packet,countedArchive)).toThrow('linee')
  const badLast=structuredClone(auditLines)
  badLast.at(-1)!.turns.next.tactical.comparison+=' Unreviewed 123.'
  expect(()=>assertFiniteAuditCountsMany(badLast,packet,countedArchive)).toThrow('riesame quantitativo mancante')
  const writer=new DatabaseSync(f.file),proof=writer.prepare("SELECT object_hash FROM ai_evidence_values WHERE job_id=? AND role='guide-audit-language-pass-v1' LIMIT 1").get(work.archive.id) as {object_hash:string}
  const chunk=writer.prepare('SELECT ordinal,body FROM ai_evidence_chunks WHERE object_hash=? ORDER BY ordinal LIMIT 1').get(proof.object_hash) as {ordinal:number;body:Uint8Array}
  try{
   const corrupt=Buffer.from(chunk.body);corrupt[0]^=1
   writer.prepare('UPDATE ai_evidence_chunks SET body=? WHERE object_hash=? AND ordinal=?').run(corrupt,proof.object_hash,chunk.ordinal)
   expect(()=>assertFiniteAuditCountsMany(auditLines,packet,countedArchive)).toThrow()
  }finally{writer.prepare('UPDATE ai_evidence_chunks SET body=? WHERE object_hash=? AND ordinal=?').run(chunk.body,proof.object_hash,chunk.ordinal);writer.close()}
  expect(()=>assertFiniteAuditCountsMany(auditLines,packet,countedArchive)).not.toThrow()
  expect(()=>lateAuditFeedback(late.history,'foreign-candidate',lateRequest.data.findings,lateOptions,()=>[])).toThrow('non autenticata')
  const foreignReview=structuredClone(late.history);foreignReview[0].review.outcomeKey='0'.repeat(64)
  expect(()=>lateAuditFeedback(foreignReview,lateRequest.data.candidateHash,lateRequest.data.findings,lateOptions,()=>[])).toThrow()
  const premise=[...work.archive.values<any>('guide-finite-request-v1')].find(r=>r.value.request.validationId==='guide-premise-review-5')!
  expect(premise).toBeTruthy()
  expect(premise.value.request.data.auditChoiceContract.candidateWindows.length).toBeGreaterThan(0)
  expect(premise.value.request.instructions).toContain('physicalHand conserva tutte le copie')
  const result=[...work.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.unitId===premise.value.unitId&&r.value.accepted)!.value.value
  expect(()=>assertNativeScenarioSchema({...result,verdict:'revise',repairScope:'none'},premise.value.request.schema)).toThrow()
  const plan=[...work.archive.values<any>('guide-finite-request-v1')].find(r=>r.value.request.validationId==='guide-finite-plan-2')!
  expect(plan).toBeTruthy();expect(plan.value.request.instructions).not.toContain('2–4 risposte')
  const planResult=[...work.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.unitId===plan.value.unitId&&r.value.accepted)!.value.value
  expect(plan.value.request.schema.properties.analysisScope.properties.comparedReplyIds.const).toEqual(planResult.replies.map((r:any)=>r.id))
  expect(()=>assertNativeScenarioSchema({...planResult,analysisScope:{...planResult.analysisScope,comparedReplyIds:[...planResult.analysisScope.comparedReplyIds,planResult.caseId+'-reply-3']}},plan.value.request.schema)).toThrow()
  expect(guide.review.verdict).toBe('pass')
  expect([...work.archive.values<any>('guide-finite-candidate-v1')].some(r=>r.value.ordinal>=3)).toBe(true)
  const negatives=[...work.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>r.value.accepted&&r.value.value?.verdict==='revise')
  expect(negatives.length).toBeGreaterThanOrEqual(3)
  f.projects.saveMatchupReport(deepGuideReport({...guide.basis,jobId:f.job.id,generatedAt:'2026-11-08T00:00:00.000Z',sampleDeckUrl:null},guide))
  expect(f.projects.listMatchupReports(f.project.id,f.meta.id)[0].guide).toEqual(guide)
  const calls=f.calls
  const warmStart=performance.now()
  expect(await generateDeepGuide({packet:f.options.packet,config,work,request:'Until-valid synthetic integration.',runner:async()=>{throw Error('No repurchase')}})).toEqual(guide)
  const warmMs=performance.now()-warmStart
  expect(f.calls).toBe(calls)
  expect(f.stages.filter(stage=>stage==='repair-delivery-outline')).toHaveLength(1)
  if(process.env.POKEGURU_UNTIL_VALID_TEST_OUTPUT){
   const output=resolve(process.env.POKEGURU_UNTIL_VALID_TEST_OUTPUT)
   if(!output.startsWith(resolve('.verify')+sep))throw Error('Only isolated verification output is allowed')
   const peakRssMiB=process.resourceUsage().maxRSS/1024
   // Preserve every observation even when a resource assertion fails. The
   // database export still requires all of the unchanged limits to pass.
   mkdirSync(dirname(output),{recursive:true})
   writeFileSync(output+'.metrics.json',JSON.stringify({coldMs,warmMs,peakRssMiB,calls,negativeOpinions:negatives.length,repairs:readGuideDelivery(work.archive).repairs,syntheticProviderOnly:true,completeReadersAndPersistence:true},null,2))
   expect(coldMs).toBeLessThan(60000);expect(warmMs).toBeLessThan(10000);expect(peakRssMiB).toBeLessThanOrEqual(768)
   const db=new DatabaseSync(f.file,{readOnly:true});try{await backup(db,output)}finally{db.close()}
  }
 }finally{work.close();f.close()}
},240000)
