import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {finiteGuideRuntime} from '../src/main/guide-finite-runtime'
import {guideTurnDeclarationRequest} from '../src/main/guide-segment-generation'
import {createGuideSegments,appendGuideSegment,guideSegmentDeclarations} from '../src/main/guide-segments'
import {repairGuideNativeAudits} from '../src/main/guide-audit-repair'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import {readGuideAccessTurn} from '../src/shared/guide-native-decisions'
import {guideHash} from '../src/main/matchup-guide-packet'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'

async function fixture(startValid=false){
 const f=deliveryApplicationFixture(),{scope,packet}=f.options,config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
 scope.configHash=guideHash({config,protocol:'segments-v28-1'})
 authorizeGuideUntilValid(f.archive,packet,config,'offline:declaration-role','2026-11-08T00:00:00.000Z')
 const root=createGuideSegments(f.setups[0],scope,packet)
 const tactical={attacks:[{printId:'p',attackName:'Synthetic attack'}],cards:['p','e'],promotions:[],comparison:'Compare the physical synthetic candidates.'}
 let journal=appendGuideSegment(root,scope,packet,{draw:'e',events:[],tactical},{reason:'First player draws without attacking.',pivot:'Keep the board.'})
 const event={kind:'effect',description:'Synthetic additional draw, or an incorrectly marked manual attachment.',moves:[],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['hand','attached'],hostPrintId:'p',sourceIds:['card:e'],attachment:'manual'}],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:null,action:'other',affectedSide:'opponent',accessReceipt:{sourceIds:['card:p'],reason:'Synthetic additional access must actually move a card from the deck.'}}
 const declaration=(valid:boolean)=>({caseId:journal.setup.id,parentHash:journal.segments[0].hash,phase:'opponent',body:{draw:'e',events:[{...event,energyRoutes:valid?[{side:'opponent',printId:'e',count:1,path:['deck','hand'],hostPrintId:null,sourceIds:['card:p'],attachment:null}]:event.energyRoutes}],tactical:null},development:{reason:'Execute the selected synthetic access.',pivot:'Preserve the following turn.'}})
 let calls=0,declarations=0;const phases:string[]=[],requests:any[]=[]
 const options={...f.options,call:async(request:any)=>{
  calls++;phases.push(request.stage)
  if(request.stage==='segments-role'){
   declarations++;requests.push(...request.data.units)
   return request.read({units:request.data.units.map((u:any)=>({unitId:u.unitId,response:declaration(startValid||declarations>1)}))})
  }
  return f.options.call(request)
 }}
 let runtime=finiteGuideRuntime(options),result:any
 // Match the real startup: the previous turn already has immutable audit
 // originals before another turn may be appended to that prefix.
 const certified=await repairGuideNativeAudits(guideSegmentDeclarations(journal,scope,packet),{kind:'prefix',turns:1},runtime)
 journal=appendGuideSegment(root,scope,packet,certified.turns.ours,certified.developmentPlan.ours)
 const run=(legacy=false)=>runGuideSegmentPhase([{id:'access',request:()=>{
  const request=guideTurnDeclarationRequest(journal,scope,packet,{reserveCalls:0,archive:f.archive,extraData:{reply:{id:'synthetic-access',role:'access',goal:'Execute an additional draw.'}},validateBody:body=>{readGuideAccessTurn(journal.setup.id,body.events)}})
  // Reproduce an original v1 declaration, whose complete reader still checks
  // the role only after its separate audits. Never weaken the current reader.
  return legacy?{...request,validateDeclaration:undefined}:request
 },accept:value=>{result=appendGuideSegment(journal,scope,packet,value.body,value.development)}}],{...runtime,stage:'segments-role'})
 return {...f,run,requests,phases,get calls(){return calls},get declarations(){return declarations},get result(){return result},reopen(){runtime=finiteGuideRuntime(options)}}
}

it('rejects an ordinary/manual-only access before buying audits, then retries the physical declaration with complete feedback',async()=>{
 const f=await fixture();try{
  const before=f.phases.length
  await f.run()
  expect(f.phases.slice(before,before+2)).toEqual(['segments-role','segments-role'])
  expect(f.declarations).toBe(2)
  expect(f.requests[1].data.previousInvalid.message).toContain('accesso aggiuntivo')
  expect(f.requests[1].data.previousInvalid.raw.body.events[0].energyRoutes[0].path).toEqual(['hand','attached'])
  expect(f.result.segments).toHaveLength(2)
  expect(f.result.segments[1].body.events[0].energyRoutes[0].path).toEqual(['deck','hand'])
  const outcomes=[...f.archive.values<any>('guide-segment-unit-result-v1')]
  expect(outcomes.some(r=>r.value.accepted===false&&r.value.message.includes('accesso aggiuntivo'))).toBe(true)
  const calls=f.calls;f.reopen();await f.run();expect(f.calls).toBe(calls)
 }finally{f.close()}
},60000)

it('recovers an authenticated paid v1 declaration that failed its later role gate without reclassifying or deleting any original',async()=>{
 const f=await fixture();try{
  await expect(f.run(true)).rejects.toThrow('accesso aggiuntivo')
  const original=[...f.archive.values<any>('guide-segment-unit-result-v1')].map(r=>[r.key,guideHash(r.value)]),paid=f.calls
  expect(f.declarations).toBe(1)
  f.reopen();await f.run()
  expect(f.declarations).toBe(2);expect(f.calls).toBeGreaterThan(paid)
  expect(f.requests.at(-1).data.previousDeclarationFailure.message).toContain('accesso aggiuntivo')
  const current=new Map([...f.archive.values<any>('guide-segment-unit-result-v1')].map(r=>[r.key,guideHash(r.value)]))
  for(const [key,hash]of original)expect(current.get(key)).toBe(hash)
  expect([...f.archive.values<any>('guide-finite-request-v1')].some(r=>r.value.request.validationId==='guide-delivery-turn-2')).toBe(true)
  const calls=f.calls;f.reopen();await f.run();expect(f.calls).toBe(calls)
 }finally{f.close()}
},60000)

it('keeps an already conforming paid v1 declaration and its audits without repurchasing or changing their identities',async()=>{
 const f=await fixture(true);try{
  await f.run(true);const calls=f.calls,original=[...f.archive.values<any>('guide-segment-unit-result-v1')].map(r=>[r.key,guideHash(r.value)])
  f.reopen();await f.run()
  expect(f.calls).toBe(calls)
  expect([...f.archive.values<any>('guide-segment-unit-result-v1')].map(r=>[r.key,guideHash(r.value)])).toEqual(original)
  expect([...f.archive.values<any>('guide-finite-request-v1')].some(r=>r.value.request.validationId==='guide-delivery-turn-2')).toBe(false)
 }finally{f.close()}
},60000)
