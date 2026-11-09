import {it,expect} from 'vitest'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'
import {constructFiniteGuideSetup} from '../src/main/guide-finite-setup'
import {guideSegmentNativeSchema,createGuideSegments} from '../src/main/guide-segments'
import {guideHash} from '../src/main/matchup-guide-packet'

function fixture(declines=1){
 const f=deliveryApplicationFixture(),config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
 authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:synthetic-setup-planning','2026-11-08T00:00:00.000Z')
 const native=structuredClone(f.setups[0]),schema=guideSegmentNativeSchema(native.id,f.options.packet,native.opponentListId)
 delete schema.properties.turns;delete schema.properties.developmentPlan;schema.required=schema.required.filter((k:string)=>!['turns','developmentPlan'].includes(k))
 const stages:string[]=[],turns:string[]=[];let calls=0,validations=0
 const options={...f.options,call:async(request:any)=>{
  calls++;stages.push(request.stage)
  if(!['segments-finite-setup-frames','segments-finite-setup-turns'].includes(request.stage))return f.options.call(request)
  return request.read({units:request.data.units.map((u:any)=>{
   const d=u.data
   if(request.stage==='segments-finite-setup-frames'){
    const frame=structuredClone(native);delete frame.opening;delete frame.firstOpponentTurn;delete frame.setupRounds
    return {unitId:u.unitId,response:{caseId:d.caseId,contextHash:d.contextHash,frame,leadOpponent:false,rounds:1,...d.turnCapacity?{plannedTurns:['round-1-ours','round-1-opponent'].map(slotId=>({slotId,events:[]}))}:{},changeSummary:'Synthetic complete frame; no claim of competitive quality.'}}
   }
   turns.push(d.ordinal+':'+d.slotId)
   const decline=d.ordinal<declines
   const body={draw:'e',events:[],decision:{availableAttack:'No attack selected in this synthetic transport fixture.',choice:'Complete the synthetic accounting turn without an attack.',reason:'Synthetic fixture only; independent strategic review remains mandatory.'},tactical:null}
   return {unitId:u.unitId,response:{caseId:d.caseId,headerHash:d.headerHash,slotId:d.slotId,previousHash:d.previousHash,outcome:decline?'rebuild-required':'complete',reason:decline?'Synthetic prior attack omitted mandatory KO, Prize and promotion; reconstruct the full frame.':'Synthetic legal declaration, not a premise approval.',body:decline?null:body}}
  })})
 }}
 const input={caseId:native.id,nativeSchema:schema,fixedOpening:native.opening,context:{fixture:'historical planning protocol'},validate:(n:Record<string,any>)=>{validations++;return createGuideSegments(n,options.scope,options.packet)}}
 return {...f,options,input,stages,turns,get requests(){return calls},get validations(){return validations}}
}
it('replans beyond two genuine declarations without buying dependent turns or weakening the complete setup gate',async()=>{
 const f=fixture(3);try{
  const result=await constructFiniteGuideSetup(f.input,f.options)
  expect(f.turns).toEqual(['0:round-1-ours','1:round-1-ours','2:round-1-ours','3:round-1-ours','3:round-1-opponent'])
  expect(f.validations).toBe(1);expect([...f.archive.values('guide-finite-setup-plan-rejection-v1')]).toHaveLength(3)
  const constructed=[...f.archive.values<any>('guide-finite-setup-constructed-v1')];expect(constructed).toHaveLength(1);expect(constructed[0].value.ordinal).toBe(3);expect(constructed[0].value.requiresIndependentPremiseReview).toBe(true)
  const originals=[...f.archive.values<any>('guide-segment-unit-result-v1')],calls=f.requests
  expect(await constructFiniteGuideSetup(f.input,f.options)).toEqual(result);expect(f.requests).toBe(calls)
  expect([...f.archive.values<any>('guide-segment-unit-result-v1')]).toEqual(originals)
 }finally{f.close()}
},60000)
it('uses the real synthetic provider schema through a nullable historical body and completes every deferred audit',async()=>{
 const f=deliveryApplicationFixture(true,true);try{
  const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
  authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:synthetic-historical-provider','2026-11-08T00:00:00.000Z')
  const native=f.setups[0],schema=guideSegmentNativeSchema(native.id,f.options.packet,native.opponentListId)
  delete schema.properties.turns;delete schema.properties.developmentPlan;schema.required=schema.required.filter((k:string)=>!['turns','developmentPlan'].includes(k))
  const options={...f.options,call:async(request:any)=>{const result:any=await f.options.call(request);const bad=result.outcomes?.find((o:any)=>!o.accepted);if(bad)throw Error('Unexpected synthetic provider contract failure: '+bad.message);return result}}
  const result=await constructFiniteGuideSetup({caseId:native.id,nativeSchema:schema,fixedOpening:native.opening,context:{fixture:'complete synthetic provider with deferred setup audit'},validate:n=>createGuideSegments(n,options.scope,options.packet)},options)
  expect(result.setup.firstOpponentTurn?.events[0].decisionProof).not.toBeNull()
  expect([...f.archive.values<any>('guide-finite-request-v1')].some(r=>r.value.request.validationId==='guide-finite-setup-turn-3')).toBe(true)
  const calls=f.calls;expect(await constructFiniteGuideSetup({caseId:native.id,nativeSchema:schema,fixedOpening:native.opening,context:{fixture:'complete synthetic provider with deferred setup audit'},validate:n=>createGuideSegments(n,options.scope,options.packet)},options)).toEqual(result);expect(f.calls).toBe(calls)
 }finally{f.close()}
},60000)
it('retains a planning rejection across interruption and rejects altered feedback before another provider call',async()=>{
 const f=fixture();try{
  f.options.check=()=>{if([...f.archive.values('guide-finite-setup-plan-rejection-v1')].length)throw Error('Synthetic boundary after the AI planning rejection')}
  await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('Synthetic boundary')
  expect(f.requests).toBe(2);expect(f.turns).toEqual(['0:round-1-ours']);expect(f.validations).toBe(0)
  const originals=[...f.archive.values<any>('guide-segment-unit-result-v1')]
  f.options.check=()=>{}
  await constructFiniteGuideSetup(f.input,f.options)
  for(const row of originals)expect(f.archive.value('guide-segment-unit-result-v1',row.key)).toEqual(row.value)
  const count=f.requests,negative=[...f.archive.values<any>('guide-finite-setup-plan-rejection-v1')][0].value,forged={...negative,message:'Forged reason different from the actual constructor declaration.'}
  f.archive.saveValue('guide-finite-setup-plan-rejection-v1',guideHash(forged),forged)
  await expect(constructFiniteGuideSetup(f.input,f.options)).rejects.toThrow('diverso dalla dichiarazione AI originale');expect(f.requests).toBe(count)
 }finally{f.close()}
},60000)
