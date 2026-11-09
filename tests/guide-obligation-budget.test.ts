import { it, expect } from 'vitest'
import { guideStageFamily, planGuideRequest, guideRequestOutputFits, guideRequestOutputReservation, type GuideBudgetSample } from '../src/main/guide-request-budget'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import type {GuideSegmentRequest} from '../src/main/guide-segment-generation'

const schema = { type: 'object', properties: {}, required: [], additionalProperties: false }
it('separates assessment output sizing while retaining conservative input calibration from every family', () => {
  const samples: GuideBudgetSample[] = [{ family: 'turn-segment', visibleTokens: 100, inputTokens: 220, outputTokens: 50000, units: 1 }]
  const one = planGuideRequest('obligation-assessments', 'Independent assessment', { exact: true }, schema, samples, 10, 3).budget
  const two = planGuideRequest('obligation-assessments', 'Independent assessment', { exact: true }, schema, samples, 10, 3, 2).budget
  expect(one.family).toBe('obligation-assessment')
  expect(one.calibrationFactor).toBeCloseTo(2.42)
  expect(one.reservedOutput).toBe(10000)
  expect(two.reservedOutput).toBe(20000)
  expect(two.estimatedResponseCharacters).toBe(36000)
  expect(one.calibration?.samples).toBe(1)
  expect(guideStageFamily('branch-plan-choices')).toBe('branch-plan')
  expect(guideStageFamily('metadata-fragments')).toBe('metadata')
  expect(guideStageFamily('review-segments-cases')).toBe('segment-review')
})

it('reserves future calls and learns assessment output without spending a request', () => {
  const samples: GuideBudgetSample[] = [{ family: 'obligation-assessment', visibleTokens: 100, inputTokens: 100, outputTokens: 12000, responseCharacters: 20000, units: 1 }]
  const blocked = planGuideRequest('obligation-assessments', 'Exact scope', {}, schema, samples, 3, 3).budget
  expect(blocked.fits).toBe(false)
  expect(blocked.reservedOutput).toBe(14400)
  expect(blocked.estimatedResponseCharacters).toBe(23000)
  expect(planGuideRequest('obligation-assessments', 'Exact scope', {}, schema, samples, 4, 3).budget.fits).toBe(true)
})

it('uses identical observed output reserves for the cheap precheck and full budget, without rejecting a fitting request',()=>{
  const samples:GuideBudgetSample[]=[{family:'obligation-assessment',visibleTokens:100,inputTokens:150,outputTokens:24000,responseCharacters:33000,units:2}]
  for(const stage of ['obligation-facts','segment-native','metadata-fragments','review-segments-cases','branch-plan-choices','prose','setup-1','plan'])for(const units of [1,2,4,6,16]){
    const {budget}=planGuideRequest(stage,'Small exact payload',{exact:true},schema,samples,100,3,units)
    expect(guideRequestOutputReservation(stage,samples,units)).toEqual({family:budget.family,reservedOutput:budget.reservedOutput,estimatedResponseCharacters:budget.estimatedResponseCharacters})
    if(budget.fits)expect(guideRequestOutputFits(stage,samples,units)).toBe(true)
    if(!guideRequestOutputFits(stage,samples,units))expect(budget.fits).toBe(false)
  }
})

it('splits impossible output groups before estimating their bodies, preserving batch identities and every unit',async()=>{
  const requests:GuideSegmentRequest<string>[]=Array.from({length:8},(_,i)=>({stage:'obligation-fact-'+i,role:'critic',instructions:'Synthetic independent test',task:'Return the exact test value',
    data:{packet:{basis:{projectId:'generic'}},i},schema:{type:'string',const:'ok'},reserveCalls:3,read:raw=>{if(raw!=='ok')throw Error('Invalid child');return raw},cacheValidation:{id:'synthetic-output-precheck-1',validate:value=>{if(value!=='ok')throw Error('Invalid value')}}}))
  async function run(early:boolean){
    const rows=new Map<string,Map<string,unknown>>(),estimated:number[]=[],calls:string[]=[],accepted:string[]=[]
    const archive={saveValue:(role:string,key:string,value:unknown)=>{if(!rows.has(role))rows.set(role,new Map());rows.get(role)!.set(key,value)},*values<T>(role:string){for(const [key,value]of rows.get(role)??[])yield {key,value:value as T}}}
    await runGuideSegmentPhase(requests.map((request,i)=>({id:String(i),request:()=>request,accept:()=>{accepted.push(String(i))}})),{stage:'obligation-facts',archive,
      call:async r=>{calls.push(JSON.stringify(r.schema));return r.read({units:(r.data as any).units.map((u:any)=>({unitId:u.unitId,response:'ok'}))})},
      estimate:r=>{estimated.push(r.units??1);return planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],100,r.reserveCalls,r.units).budget},
      ...early?{outputFits:(stage:string,units:number)=>guideRequestOutputFits(stage,[],units)}:{},isCached:()=>false,remainingCalls:()=>100,check:()=>{}})
    return {calls,estimated,accepted}
  }
  const baseline=await run(false),optimized=await run(true)
  expect(baseline.estimated).toContain(6)
  expect(optimized.estimated.every(n=>n<=5)).toBe(true)
  expect(optimized.calls).toEqual(baseline.calls)
  expect(optimized.accepted.sort()).toEqual(requests.map((_,i)=>String(i)))
})
