import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {startUntilValidCampaignCase,untilValidCampaignResource} from '../scripts/lib/guide-until-valid-start'
import {guideUntilValidAuthority} from '../src/main/guide-run-policy'
import {guideHash} from '../src/main/matchup-guide-packet'
const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null},campaignId='12345678-1234-1234-1234-123456789abc'
it('shares isolated startup with explicit same-job resume, no call ceilings, no transferred old results and unchanged calibration',()=>{
 const f=deliveryApplicationFixture(),calibration=[{family:'synthetic',actualInput:123}],input={database:f.file,directory:f.folder,campaignId,caseId:'unrelated-case',projectId:f.project.id,packet:f.options.packet,config,calibration,request:'Exact synthetic matchup',authorityReference:'offline:generic-start',approvedAt:'2026-11-08T00:00:00.000Z'}
 let ctx:ReturnType<typeof startUntilValidCampaignCase>|undefined
 try{
  expect(()=>startUntilValidCampaignCase({...input,config:undefined as any})).toThrow('Configurazione AI')
  expect(f.jobs.latest(f.project.id,untilValidCampaignResource(campaignId,input.caseId))).toBeFalsy()
  f.archive.saveValue('old-negative','original',{verdict:'revise'})
  ctx=startUntilValidCampaignCase(input);const id=ctx.job.id
  expect(id).not.toBe(f.job.id);expect(guideUntilValidAuthority(ctx.work.archive)).toMatchObject({callCeiling:null,repairCeiling:null,jobId:id})
  expect([...ctx.work.archive.values('old-negative')]).toHaveLength(0)
  expect([...ctx.work.archive.values('guide-token-sample')].map(r=>r.value)).toEqual(calibration)
  expect(()=>startUntilValidCampaignCase(input)).toThrow('già avviata')
  ctx.work.archive.saveValue('paid','original',{original:true});ctx.jobs.suspend(id,'Synthetic stop','failure');ctx.close();ctx=undefined
  f.jobs.saveCallState(id,'blocked-transport',{status:'blocked',code:'unknown',failures:1})
  expect(()=>startUntilValidCampaignCase({...input,resumeJobId:id,config:{...config,model:'foreign'}})).toThrow('autorità diversa')
  expect(f.jobs.callState(id,'blocked-transport')?.code).toBe('unknown')
  expect(f.jobs.get(id)?.status).toBe('interrupted')
  ctx=startUntilValidCampaignCase({...input,resumeJobId:id})
  expect(ctx.job.id).toBe(id);expect(ctx.work.archive.value('paid','original')).toEqual({original:true})
  expect(f.archive.value('old-negative','original')).toEqual({verdict:'revise'})
  expect([...ctx.work.archive.values('guide-operator-intervention-v1')]).toHaveLength(1)
  expect(untilValidCampaignResource(campaignId,'unrelated-case')).toBe('until-valid:campaign:'+campaignId+':'+guideHash('unrelated-case'))
 }finally{ctx?.close();f.close()}
})
it('rejects a foreign list or a guessed resume identifier before generating anything',()=>{
 const f=deliveryApplicationFixture(),input={database:f.file,directory:f.folder,campaignId,caseId:'other',projectId:f.project.id,packet:f.options.packet,config,calibration:[],request:'Synthetic',authorityReference:'offline:generic-start',approvedAt:'2026-11-08T00:00:00.000Z'}
 try{
  expect(()=>startUntilValidCampaignCase({...input,packet:{...input.packet,basis:{...input.packet.basis,deckHash:'foreign'}}})).toThrow('lista')
  expect(()=>startUntilValidCampaignCase({...input,resumeJobId:f.job.id})).toThrow('Ripresa estranea')
  expect([...f.archive.values('guide-attempt-start')]).toHaveLength(0)
 }finally{f.close()}
})
