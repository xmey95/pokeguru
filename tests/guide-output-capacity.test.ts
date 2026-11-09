import {it,expect} from 'vitest'
import {guideOutputCapacity,recordGuideOutputCapacity} from '../src/main/guide-output-capacity'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import {guideHash} from '../src/main/matchup-guide-packet'
import {AiFailure} from '../src/main/ai-failure'
import {guideMainFutureCalls} from '../src/main/guide-mainline-phase'
import {withGuideSegmentRetry} from '../src/main/guide-segment-generation'

const config={provider:'codex',source:'global',model:'synthetic-model',reasoningEffort:null}
const packet={basis:{projectId:'project-a',dependencyHash:'dep-a'}}
const context={scope:{projectId:'project-a',jobId:'job-a',dependencyHash:'dep-a',configHash:guideHash({config,protocol:'segments-v28-1'})},packetHash:guideHash(packet),kind:'guide-segment-declaration-2'}
function archive(){
 const rows=new Map<string,Map<string,any>>()
 return {id:'job-a',projectId:'project-a',rows,saveValue:(role:string,key:string,value:any)=>{if(!rows.has(role))rows.set(role,new Map());rows.get(role)!.set(key,structuredClone(value))},value:<T>(role:string,key:string):T|undefined=>structuredClone(rows.get(role)?.get(key)),values:<T>(role:string)=>[...rows.get(role)??[]].map(([key,value])=>({key,value:structuredClone(value) as T}))} as any
}
function request(id='a',outputCapacity:any=context):any{return {stage:'segment-'+id,role:'constructor',instructions:'Synthetic native constructor',task:id,data:{packet},schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},reserveCalls:0,unitKey:id,retryOrdinal:0,read:(v:any)=>v,cacheValidation:{id:'guide-segment-declaration-2',validate:()=>{}},outputCapacity}}
it('retains decreasing empirical capacity across phases while isolating config, packet, job and narrative output',()=>{
 const a=archive(),r=request();expect(guideOutputCapacity(r,a)).toBe(Infinity)
 recordGuideOutputCapacity(Array.from({length:6},()=>r),a);expect(guideOutputCapacity(r,a)).toBe(3)
 recordGuideOutputCapacity(Array.from({length:3},()=>r),a);expect(guideOutputCapacity(request('next'),a)).toBe(1)
 expect(guideOutputCapacity(request('other-config',{...context,scope:{...context.scope,configHash:'different'}}),a)).toBe(Infinity)
 expect(guideOutputCapacity(request('other-packet',{...context,packetHash:'different'}),a)).toBe(Infinity)
 expect(guideOutputCapacity({...r,outputCapacity:undefined},a)).toBe(Infinity)
 expect(()=>guideOutputCapacity(request('foreign',{...context,scope:{...context.scope,jobId:'foreign'}}),a)).toThrow('altro job')
 recordGuideOutputCapacity([r],a);expect(a.values('guide-segment-output-capacity-v1')).toHaveLength(2)
})
it('rejects a changed persisted bound instead of inheriting an unverified observation',()=>{
 const a=archive(),r=request();recordGuideOutputCapacity([r,r],a)
 const row=a.values('guide-segment-output-capacity-v1')[0];a.saveValue('guide-segment-output-capacity-v1',row.key,{...row.value,maximumUnits:2})
 expect(()=>guideOutputCapacity(r,a)).toThrow('non verificabile')
})
function historical(a:any,overrides:any={}){
 const prompt='Synthetic exact historical prompt',inputHash=guideHash(prompt),stage='segments-reply-opponent'
 a.saveValue('guide-attempt-start','001',{stage,inputHash});a.saveValue('guide-attempt-end','001',{stage,inputHash,status:'failed'})
 a.saveValue('guide-attempt-failure','001',{stage,code:'output-limit',...overrides.failure})
 a.saveValue('guide-prompt',inputHash,{stage,prompt,config,...overrides.origin})
 const native={data:{packet,prefix:{id:'a'},previousReceipt:{},...overrides.unitData}}
 a.saveValue('guide-call-data',inputHash,{stage,data:{units:[native,native,native]}})
}
it('imports paid historical native failures only with exact archived config, packet and prompt provenance',()=>{
 const a=archive();historical(a);expect(guideOutputCapacity(request(),a)).toBe(1)
 expect(a.values('guide-segment-output-capacity-v1')).toHaveLength(0)
 const bad=archive();historical(bad,{origin:{prompt:'changed'}});expect(()=>guideOutputCapacity(request(),bad)).toThrow('impronta')
})
it.each(['guide-metadata-fragments-1','guide-metadata-compositions-1','guide-proof-review-1'])('does not transfer a native output failure to the independent %s family',kind=>{
 const a=archive();historical(a)
 expect(guideOutputCapacity(request('independent',{...context,kind}),a)).toBe(Infinity)
})
it.each([{failure:{code:'request-limit'}},{origin:{config:{...config,model:'other'}}},{unitData:{packet:{basis:{projectId:'foreign'}}}},{unitData:{protocol:'pg-premise-text-repair-2'}}])('ignores a nonmatching historical failure %#',overrides=>{
 const a=archive();historical(a,overrides);expect(guideOutputCapacity(request(),a)).toBe(Infinity)
})
it('persists a smaller group after an output failure and uses it in another phase without another oversized dispatch',async()=>{
 const a=archive(),sizes:number[]=[],options={archive:a,stage:'phase-a',call:async(r:any)=>{sizes.push(r.data.units.length);if(sizes.length===1)throw new AiFailure('output-limit','Synthetic output failure');return r.read({units:r.data.units.map((u:any)=>({unitId:u.unitId,response:{ok:true}}))})},estimate:()=>({bytes:1,estimatedResponseCharacters:1,estimatedInput:1,reservedOutput:1,margin:1}) as any,isCached:()=>false,remainingCalls:()=>20,check:()=>{}}
 const units=(phase:string)=>Array.from({length:4},(_,i)=>({id:phase+i,request:()=>request(phase+i),accept:()=>{}}))
 await runGuideSegmentPhase(units('first'),options);expect(sizes).toEqual([4,2,2])
 await runGuideSegmentPhase(units('next'),{...options,stage:'phase-b'});expect(sizes).toEqual([4,2,2,2,2])
})
it('reserves all future main turns when native batches have narrowed, without applying native capacity to narrative patches',()=>{
 const states=[{journal:{segments:[]}},{journal:{segments:[]}}]
 expect(guideMainFutureCalls(states,0,Infinity)).toBe(3)
 expect(guideMainFutureCalls(states,0,1)).toBe(5)
 expect(guideMainFutureCalls(states,1,1)).toBe(4)
 expect(guideMainFutureCalls(states,2,1)).toBe(2)
 expect(guideMainFutureCalls(states,3,1)).toBe(0)
 const r=request();r.cacheValidation.id='guide-premise-text-repair-2'
 expect(withGuideSegmentRetry(r,context.scope).outputCapacity).toBeUndefined()
})
it.each(['output-limit','request-limit'] as const)('stops a single-unit %s without inventing a smaller capacity',async code=>{
 const a=archive(),unit={id:'single',request:()=>request(),accept:()=>{}}
 await expect(runGuideSegmentPhase([unit],{stage:'single',archive:a,call:async()=>{throw new AiFailure(code,'Synthetic single-unit failure')},estimate:()=>({bytes:1,estimatedResponseCharacters:1,estimatedInput:1,reservedOutput:1,margin:1}) as any,isCached:()=>false,remainingCalls:()=>10,check:()=>{}})).rejects.toMatchObject({code})
 expect(a.values('guide-segment-output-capacity-v1')).toHaveLength(0)
})
