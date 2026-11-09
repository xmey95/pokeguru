import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'
import {finiteGuideRuntime} from '../src/main/guide-finite-runtime'
import {plannedGuideHistoricalHeader,coherentGuideHistoricalTurn} from '../src/main/guide-historical-plan'
import {withGuideSegmentRetry,type GuideSegmentRequest} from '../src/main/guide-segment-generation'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
const object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const literal=(value:string)=>({type:'string',const:value})
function fixture(){const f=deliveryApplicationFixture();authorizeGuideUntilValid(f.archive,f.options.packet,{provider:'codex',source:'global',model:null,reasoningEffort:null},'user:synthetic-historical-plan','2026-11-08T00:00:00.000Z');return {...f,o:finiteGuideRuntime(f.options)}}
function frame(f:ReturnType<typeof fixture>){
 const schema=object({caseId:literal('case'),contextHash:literal('context'),frame:object({}),leadOpponent:{type:'boolean'},rounds:{type:'integer',minimum:0,maximum:2},changeSummary:{type:'string'}})
 const read=(v:any)=>{assertNativeScenarioSchema(v,schema);return structuredClone(v)}
 const request=withGuideSegmentRetry({stage:'segment-finite-setup-frame-case',role:'constructor',instructions:'Synthetic header',task:'Synthetic header only',data:{packet:f.options.packet,caseId:'case'},schema,reserveCalls:0,read,cacheValidation:{id:'guide-finite-setup-frame-1',validate:read}},f.options.scope,f.archive)
 return {schema,request,raw:{caseId:'case',contextHash:'context',frame:{},leadOpponent:true,rounds:1,changeSummary:'Synthetic plan only',plannedTurns:['first-opponent','round-1-ours','round-1-opponent'].map(slotId=>({slotId,events:['Synthetic event declaration']}))}}
}
it('requires all planned historical slots in order without turning advisory text into an approved state',()=>{
 const f=fixture();try{const h=frame(f),r=plannedGuideHistoricalHeader(h.request,h.schema,2,f.o)
  expect(r.cacheValidation.id).toBe('guide-finite-setup-frame-2');expect(r.read(h.raw)).toEqual(h.raw)
  for(const plannedTurns of [h.raw.plannedTurns.slice(1),[...h.raw.plannedTurns].reverse(),[h.raw.plannedTurns[0],h.raw.plannedTurns[0],h.raw.plannedTurns[2]]])expect(()=>r.read({...h.raw,plannedTurns})).toThrow('turni omessi')
  expect(r.read(h.raw)).not.toHaveProperty('completeOriginalValidation');expect([...f.archive.values('guide-attempt-start')]).toHaveLength(0)
 }finally{f.close()}
})
it('retains event capacity and rejects an overfull advisory turn before any provider call',()=>{
 const f=fixture();try{const h=frame(f),r=plannedGuideHistoricalHeader(h.request,h.schema,2,f.o),raw=structuredClone(h.raw);raw.plannedTurns[0].events=Array(7).fill('Synthetic seventh event must not fit')
  expect(()=>r.read(raw)).toThrow();expect((r.data as any).turnCapacity.events).toBe(6);expect([...f.archive.values('guide-attempt-start')]).toHaveLength(0)
 }finally{f.close()}
})
function turn(f:ReturnType<typeof fixture>){
 const schema=object({caseId:literal('case'),outcome:{type:'string',enum:['complete','rebuild-required']},reason:{type:'string',minLength:1},body:{anyOf:[object({events:{type:'array',maxItems:6,items:{type:'string'}}}),{type:'null'}]}})
 let reads=0
 const read=(v:any)=>{assertNativeScenarioSchema(v,schema);if(v.outcome==='complete'&&v.body===null||v.outcome==='rebuild-required'&&v.body!==null)throw Error('Original v2 coherence gate');reads++;return structuredClone(v)}
 const request=withGuideSegmentRetry({stage:'segment-finite-setup-case-round-1-ours',role:'constructor',instructions:'Synthetic turn',task:'Synthetic turn only',data:{packet:f.options.packet,caseId:'case',slotId:'round-1-ours'},schema,reserveCalls:0,read,cacheValidation:{id:'guide-finite-setup-turn-2',validate:read}},f.options.scope,f.archive)
 return {request,get reads(){return reads},complete:{caseId:'case',outcome:'complete',reason:'Synthetic complete',body:{events:[]}},decline:{caseId:'case',outcome:'rebuild-required',reason:'Synthetic impossible immutable prefix',body:null}}
}
it('expresses the exact v2 acceptance predicate in disjoint schema branches before generation',()=>{
 const f=fixture();try{const t=turn(f),r=coherentGuideHistoricalTurn(t.request,f.o)
  expect(r.cacheValidation.id).toBe('guide-finite-setup-turn-3')
  for(const raw of [{...t.complete,body:null},{...t.decline,body:{events:[]}}])expect(()=>r.read(raw)).toThrow()
  expect(t.reads).toBe(0);expect(r.read(t.complete)).toEqual(t.complete);expect(r.read(t.decline)).toEqual(t.decline);expect(t.reads).toBe(2)
 }finally{f.close()}
})
it('reuses a paid v2 turn exactly instead of transferring its result to a new schema identity',async()=>{
 const f=fixture();try{const t=turn(f);let calls=0
  const o=finiteGuideRuntime({...f.options,call:async(request:GuideSegmentRequest<any>)=>{calls++;return request.read({units:(request.data as any).units.map((u:any)=>({unitId:u.unitId,response:t.complete}))})}})
  await runGuideSegmentPhase([{id:'paid',request:()=>t.request,accept:()=>{}}],{...o,stage:'segments-finite-setup-turns'})
  const originals=[...f.archive.values('guide-segment-unit-result-v1')],r=coherentGuideHistoricalTurn(t.request,o)
  expect(r).toBe(t.request);expect(r.cacheValidation.id).toBe('guide-finite-setup-turn-2');expect(calls).toBe(1);expect([...f.archive.values('guide-segment-unit-result-v1')]).toEqual(originals)
 }finally{f.close()}
})
