import {it,expect} from 'vitest'
import {join} from 'node:path'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {readGuideDelivery} from '../src/main/guide-delivery-policy'
const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
const input=(prompt:string)=>({stage:/FASE: ([^\n]+)/.exec(prompt)![1],data:unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]))})
it('keeps a malformed positive raw, sends precise authenticated feedback, then completes through all unchanged readers',async()=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal);let critics=0
 try{
  const guide=await generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic outline protocol retry only.',runner:async(prompt,_c,schema)=>{
   const {stage,data}=input(prompt),raw:any=await f.rawResponse(stage,data,schema)
   if(stage==='review-delivery-outline'){critics++;if(critics===1)raw.units[0].response.findings=['Positive confirmation, deliberately invalid with pass.'];else{expect(data.units[0].data.previousInvalid.message).toContain('findings=[]');expect(data.units[0].data.previousInvalid.raw.findings).toEqual(['Positive confirmation, deliberately invalid with pass.'])}}
   return raw
  }})
  expect(critics).toBe(2);assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive);expect(readGuideDelivery(work.archive).repairs).toBe(1)
  const rejected=[...work.archive.values<any>('guide-segment-unit-result-v1')].filter(r=>!r.value.accepted);expect(rejected).toHaveLength(1);expect(rejected[0].value.raw.findings).toEqual(['Positive confirmation, deliberately invalid with pass.'])
 }finally{work.close();f.close()}
},120000)
it.each(['revise','incomplete'] as const)('retains a coherent %s as a real negative and stops before setup without a format retry',async verdict=>{
 const f=deliveryApplicationFixture(),work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{
  await expect(generateDeepGuide({packet:f.options.packet,config,work,request:'Synthetic negative outline only.',runner:async(prompt,_c,schema)=>{const {stage,data}=input(prompt),raw:any=await f.rawResponse(stage,data,schema);if(stage==='review-delivery-outline')Object.assign(raw.units[0].response,{verdict,findings:['A concrete unresolved feasibility problem in the synthetic plan.']});return raw}})).rejects.toMatchObject({code:'draft-limit'})
  expect(f.stages).toEqual(['plan','review-delivery-outline']);expect(f.calls).toBe(2);expect(work.archive.value('guide','validated')).toBeUndefined();expect(f.projects.listMatchupReports(f.project.id,f.meta.id)).toHaveLength(0)
  const outcome=[...work.archive.values<any>('guide-segment-unit-result-v1')].find(r=>r.value.value?.verdict===verdict);expect(outcome?.value.accepted).toBe(true)
 }finally{work.close();f.close()}
},120000)
it('stops after two malformed critic children and does not renew that limit or repurchase the plan on reopen',async()=>{
 const f=deliveryApplicationFixture();let work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
 try{
  const request='Synthetic persistent outline format limit.',runner=async(prompt:string,_c:unknown,schema:object)=>{const {stage,data}=input(prompt),raw:any=await f.rawResponse(stage,data,schema);if(stage==='review-delivery-outline')raw.units[0].response.findings=['Positive confirmation, deliberately invalid.'];return raw}
  await expect(generateDeepGuide({packet:f.options.packet,config,work,request,runner})).rejects.toMatchObject({code:'invalid-response'});expect(f.calls).toBe(3)
  work.close();work=new AiAnalysisWork(join(f.folder,'work'),f.jobs,f.job.id,new AbortController().signal)
  await expect(generateDeepGuide({packet:f.options.packet,config,work,request,runner:async()=>{throw Error('Must not retry')}})).rejects.toMatchObject({code:'invalid-response'});expect(f.calls).toBe(3);expect(readGuideDelivery(work.archive).rows).toHaveLength(3);expect(readGuideDelivery(work.archive).repairs).toBe(1)
 }finally{work.close();f.close()}
},120000)
