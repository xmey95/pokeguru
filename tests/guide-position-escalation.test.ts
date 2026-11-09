import {it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {deliveryApplicationFixture} from './fixtures/guide-delivery-application'
import {authorizeGuideUntilValid} from '../src/main/guide-run-policy'
import {repairGuideSetupPosition} from '../src/main/guide-position-repair'
import {finiteGuideRuntime} from '../src/main/guide-finite-runtime'
import {constructFiniteGuideSetup} from '../src/main/guide-finite-setup'
import {guideSegmentNativeSchema,createGuideSegments} from '../src/main/guide-segments'

const config={provider:'codex' as const,source:'global' as const,model:null,reasoningEffort:null}
function fixture(){
 const f=deliveryApplicationFixture();authorizeGuideUntilValid(f.archive,f.options.packet,config,'user:synthetic-position-rebuild','2026-11-08T00:00:00.000Z')
 return f
}
it('keeps lethal annotations rejected, then authenticates an explicit physical-rebuild declaration without accepting a position',async()=>{
 const f=fixture();try{
  const native=structuredClone(f.setups[0]);native.positionAnnotations[0].damage=1000
  const original=structuredClone(native);let calls=0
  const options=finiteGuideRuntime({...f.options,call:async request=>{
   calls++;return request.read({units:(request.data as any).units.map((u:any)=>{
    const d=u.data,positions=Object.fromEntries(d.candidates.map((c:any)=>[c.id,{damage:1000,condition:null,hpAdjustment:{amount:0,sourceIds:[]}}]))
    return {unitId:u.unitId,response:{caseId:d.caseId,sourceHash:d.sourceHash,candidatesHash:d.candidatesHash,outcome:calls===1?'annotate':'rebuild-required',reason:'Synthetic immutable ledger is missing a KO and promotion; reconstruct the physical history.',positions:calls===1?positions:null}}
   })})
  }})
  await expect(repairGuideSetupPosition(native,options)).rejects.toThrow('ricostruzione completa richiesta')
  expect(calls).toBe(2);expect(native).toEqual(original)
  const rows=[...f.archive.values<any>('guide-segment-unit-result-v1')];expect(rows.filter(r=>!r.value.accepted)).toHaveLength(1)
  expect(rows.filter(r=>r.value.accepted)[0].value.value.outcome).toBe('rebuild-required')
  expect([...f.archive.values('guide-native-position-repair-v1')]).toHaveLength(0)
  await expect(repairGuideSetupPosition(native,options)).rejects.toThrow('ricostruzione completa richiesta');expect(calls).toBe(2)
  const accepted=rows.find(r=>r.value.accepted)!,db=new DatabaseSync(f.file)
  try{db.prepare('DELETE FROM ai_evidence_values WHERE job_id=? AND role=? AND key=?').run(f.archive.id,'guide-segment-unit-result-v1',accepted.key)}finally{db.close()}
  // The public fragmented constructor authenticates all original transport.
  const schema=guideSegmentNativeSchema(native.id,f.options.packet,native.opponentListId);delete schema.properties.turns;delete schema.properties.developmentPlan;schema.required=schema.required.filter((k:string)=>!['turns','developmentPlan'].includes(k))
  await expect(constructFiniteGuideSetup({caseId:native.id,nativeSchema:schema,context:{fixture:true},validate:n=>n},options)).rejects.toThrow('risposta conosciuta');expect(calls).toBe(2)
 }finally{f.close()}
},60000)

it('rebuilds the whole rejected setup, retains its original negative, and reopens the successor without buying any declarations again',async()=>{
 const f=fixture();try{
  const native=structuredClone(f.setups[0]),schema=guideSegmentNativeSchema(native.id,f.options.packet,native.opponentListId)
  delete schema.properties.turns;delete schema.properties.developmentPlan;schema.required=schema.required.filter((k:string)=>!['turns','developmentPlan'].includes(k))
  let calls=0,frames=0,validated=0
  const options={...f.options,call:async(request:any)=>{calls++;return request.read({units:request.data.units.map((u:any)=>{
   const d=u.data
   if(request.stage==='segments-finite-setup-frames'){
    const frame=structuredClone(native);delete frame.firstOpponentTurn;delete frame.setupRounds;delete frame.opening
    if(frames++===0)frame.positionAnnotations[0].damage=1000
    return {unitId:u.unitId,response:{caseId:d.caseId,contextHash:d.contextHash,frame,leadOpponent:false,rounds:0,...d.turnCapacity?{plannedTurns:[]}:{},changeSummary:'Synthetic full reconstruction; all source history remains archived.'}}
   }
   if(request.stage!=='segments-finite-position-repair')throw Error('Unexpected extra stage '+request.stage)
   return {unitId:u.unitId,response:{caseId:d.caseId,sourceHash:d.sourceHash,candidatesHash:d.candidatesHash,outcome:'rebuild-required',reason:'Synthetic missing KO in the immutable ledger.',positions:null}}
  })})}}
  const input={caseId:native.id,nativeSchema:schema,fixedOpening:native.opening,context:{fixture:'position failure requires a new frame'},validate:(n:Record<string,any>)=>{validated++;return createGuideSegments(n,options.scope,options.packet)}}
  options.check=()=>{if([...f.archive.values('guide-finite-setup-negative-v1')].length)throw Error('Synthetic interruption after the authenticated position rejection')}
  await expect(constructFiniteGuideSetup(input,options)).rejects.toThrow('Synthetic interruption')
  expect(calls).toBe(2);expect(frames).toBe(1);expect(validated).toBe(0)
  options.check=()=>{}
  const result=await constructFiniteGuideSetup(input,options)
  expect(calls).toBe(3);expect(frames).toBe(2);expect(validated).toBe(1)
  const negatives=[...f.archive.values<any>('guide-finite-setup-negative-v1')];expect(negatives).toHaveLength(1);expect(negatives[0].value.native.positionAnnotations[0].damage).toBe(1000)
  expect(negatives[0].value.message).toContain('Fonte originale:')
  const constructed=[...f.archive.values<any>('guide-finite-setup-constructed-v1')];expect(constructed).toHaveLength(1);expect(constructed[0].value.requiresIndependentPremiseReview).toBe(true)
  expect(await constructFiniteGuideSetup(input,options)).toEqual(result);expect(calls).toBe(3)
  expect([...f.archive.values<any>('guide-finite-setup-negative-v1')]).toEqual(negatives)
 }finally{f.close()}
},60000)
