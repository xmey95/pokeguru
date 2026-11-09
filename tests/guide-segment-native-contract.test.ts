import {it,expect} from 'vitest'
import {guideSegmentNativeRules} from '../src/main/guide-causal-contract'
import {guideTurnDeclarationRequest,guidePremiseRequest,withGuideSegmentRetry} from '../src/main/guide-segment-generation'
import {createGuideSegments,appendGuideSegment} from '../src/main/guide-segments'
import {verifyAttackPayment} from '../src/shared/guide-attack-payment'
import {guideHash,guideSource,type GuidePacket} from '../src/main/matchup-guide-packet'
import {segmentFixture} from './fixtures/guide-segment'
import {guideSetupRepairRequest,repairGuideSetup} from '../src/main/guide-setup-repair'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {prepareGuideSegmentBatch} from '../src/main/guide-segment-batch'

function setup(){
 const f=segmentFixture(),packet=f.packet as unknown as GuidePacket,scope={projectId:'project-a',jobId:'native-contract',dependencyHash:packet.basis.dependencyHash,configHash:'native-contract'}
 const {turns,developmentPlan,...native}=f.scenario
 return {f,packet,scope,journal:createGuideSegments(native,scope,packet)}
}
it('adds advisory writing margins from the current schema without changing limits, data or accepted output',()=>{
 const {scope,packet}=setup(),schema={type:'object',properties:{comparison:{type:'string',minLength:1,maxLength:1600},reason:{type:'string',minLength:1,maxLength:800},unseenNarrative:{type:'string',minLength:1,maxLength:420},valueJson:{type:'string',maxLength:7000},fixed:{type:'string',const:'synthetic-fixed',maxLength:2000}},required:['comparison','reason','unseenNarrative','valueJson','fixed'],additionalProperties:false},before=guideHash(schema)
 const read=(raw:unknown)=>{assertNativeScenarioSchema(raw,schema);return raw},base={stage:'synthetic-constructor',role:'constructor' as const,instructions:'Synthetic generic constructor.',task:'Preserve all constraints.',data:{synthetic:true,packet},schema,reserveCalls:11,read,cacheValidation:{id:'synthetic-margin-1',validate:read}},request=withGuideSegmentRetry(base,scope)
 expect(request.schema).toBe(schema);expect(guideHash(schema)).toBe(before);expect(request.data).toEqual(base.data);expect(request.reserveCalls).toBe(11)
 expect(request.task).toContain('1600→960');expect(request.task).toContain('800→480');expect(request.task).toContain('420→252');expect(request.task).not.toContain('7000→');expect(request.task).not.toContain('2000→')
 const value={comparison:'x'.repeat(1599)+'.',reason:'x'.repeat(799)+'.',unseenNarrative:'x'.repeat(419)+'.',valueJson:'{}',fixed:'synthetic-fixed'},copy=guideHash(value)
 expect(request.read(value)).toBe(value);expect(guideHash(value)).toBe(copy)
 expect(()=>request.read({...value,comparison:'x'.repeat(1601)})).toThrow();expect(()=>request.read({...value,fixed:'foreign'})).toThrow()
 expect(withGuideSegmentRetry(request,scope).instructions).toBe(request.instructions)
 expect(withGuideSegmentRetry(request,scope).task).toBe(request.task)
 const otherSchema=structuredClone(schema);otherSchema.properties.unseenNarrative.maxLength=430
 const other=withGuideSegmentRetry({...base,stage:'another-constructor',schema:otherSchema},scope)
 expect(other.instructions).toBe(request.instructions);expect(other.task).toContain('430→258');expect(()=>prepareGuideSegmentBatch([request,other],{stage:'synthetic-batch',reserveCalls:11})).not.toThrow()
 const critic=withGuideSegmentRetry({...base,role:'critic'},scope);expect(critic.instructions).toBe(base.instructions)
})
it('supplies native conventions to every turn constructor and the premise witness critic without changing output ownership',()=>{
 const {f,packet,scope,journal:root}=setup();let journal=root
 const attack={kind:'effect',description:'Synthetic free attack',moves:[],energyRoutes:[],attack:{printId:'p',attackName:'Synthetic attack'},trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:{energy:[],costAdjustments:[]},decisionProof:{cards:['p','e'],reason:'Compare all synthetic candidates'},action:'other',affectedSide:'ours'}
 const bodies=[f.scenario.turns.ours,f.opponent,{draw:'e',beforeAttack:[],attack,afterAttack:[],tactical:f.scenario.turns.ours.tactical}]
 for(const [index,body]of bodies.entries()){
  const request=guideTurnDeclarationRequest(journal,scope,packet,{reserveCalls:0})
  expect(request.instructions).toContain(guideSegmentNativeRules())
  expect(request.task).toContain('1600→960');expect(request.task).toContain('800→480')
  for(const convention of ['non ricopiarlo in events','NON ridichiarare Energie Base ordinarie','cards contiene esattamente gli identificativi distinti','copy numera tutti i Pokémon','USCITE SENZA KO v26','CHIAVI NATIVE'])expect(request.instructions).toContain(convention)
  expect(request.instructions).not.toMatch(/Toucannon|Dragapult|Festival|Hydrapple|Meganium|Ogerpon|Moltres|Briar/)
  expect(request.instructions).toContain('Non fornire turni futuri')
  const before=guideHash(journal),value=request.read({caseId:journal.setup.id,parentHash:journal.segments.at(-1)?.hash??journal.rootHash,phase:['ours','opponent','next'][index],body,development:{reason:'Synthetic native contract regression',pivot:'Preserve stock'}})
  expect(guideHash(journal)).toBe(before);journal=appendGuideSegment(journal,scope,packet,value.body,value.development)
  if(index===0){const critic=guidePremiseRequest(journal,scope,packet,0);expect(critic.instructions).toContain(guideSegmentNativeRules());expect(critic.instructions).toContain('Non contestare l’assenza dei turni futuri')}
 }
})
it('explains a duplicated ordinary draw and keeps the journal unchanged until a conforming declaration is supplied',()=>{
 const {f,packet,scope,journal}=setup(),request=guideTurnDeclarationRequest(journal,scope,packet,{reserveCalls:0}),before=guideHash(journal)
 const body={...f.scenario.turns.ours,draw:'p'},event={kind:'turn-draw',description:'Incorrect duplicate of body.draw',moves:[{side:'ours',printId:'p',count:1,from:'deck',to:'hand'}],energyRoutes:[],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:null,action:'other',affectedSide:'ours'}
 const raw={caseId:journal.setup.id,parentHash:journal.rootHash,phase:'ours',body:{...body,events:[event]},development:{reason:'Synthetic duplicate draw regression',pivot:'Preserve stock'}}
 expect(()=>request.read(raw)).toThrow('draw la materializza automaticamente');expect(guideHash(journal)).toBe(before)
 expect(()=>request.read({...raw,body})).not.toThrow();expect(guideHash(journal)).toBe(before)
})
it('keeps ordinary Basic Energy implicit, explains invalid sourced entries and still allows a real conditional modification',()=>{
 const basic=guideSource('card:e','card','Synthetic Basic Grass',null,{printId:'e',name:'Basic Grass Energy',category:'Energy'}),pokemon=(modified=false)=>guideSource('card:p','card','Synthetic attacker',null,{printId:'p',name:'Synthetic attacker',category:'Pokemon',gameplay:{attacks:[{name:'Synthetic attack',cost:modified?['Grass','Grass']:['Grass']}],abilities:modified?[{name:'Synthetic amplifier',effect:'Each Basic Grass Energy attached to this Pokémon provides two Grass Energy.'}]:[]}})
 const board={groups:[{id:1,side:'ours',printId:'p',zone:'active',attached:[{printId:'e',count:1}]}],unknown:[]},present=new Set(['card:p','card:e'])
 const event={turn:2,side:'ours',attack:{printId:'p',attackName:'Synthetic attack'},attackPayment:{energy:[] as any[],costAdjustments:[]}}
 expect(verifyAttackPayment(event,board,[pokemon(),basic],present)!.units).toHaveLength(1)
 const redundant={...event,attackPayment:{...event.attackPayment,energy:[{printId:'e',copy:1,units:[{types:['Grass']}],sourceIds:['rules'],reason:'Incorrect source for a normal Basic contribution'}]}}
 expect(()=>verifyAttackPayment(redundant,board,[pokemon(),basic],present)).toThrow(/fonte di effetto non presente.*Base ordinarie/)
 expect(()=>verifyAttackPayment(event,board,[pokemon(true),basic],present)).toThrow('costo non pagabile')
 const modified={...event,attackPayment:{...event.attackPayment,energy:[{printId:'e',copy:1,units:[{types:['Grass']},{types:['Grass']}],sourceIds:['card:p'],reason:'The supplied active Pokémon ability changes this Basic contribution'}]}}
 expect(verifyAttackPayment(modified,board,[pokemon(true),basic],present)!.units).toHaveLength(2)
})

function routingFixture(){
 const {f,packet,scope,journal:root}=setup(),prefix=appendGuideSegment(root,scope,packet,f.scenario.turns.ours,f.scenario.developmentPlan.ours)
 const request=guidePremiseRequest(prefix,scope,packet,0),review={verdict:'revise',findings:[{severity:'minor',targetId:prefix.setup.id,message:'An incomplete explanatory sentence in the first turn.',correction:'Complete the sentence against the frozen inventory.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}],checks:['Check the supplied first turn and its immutable setup.'],revalidatedIds:[],textCorrections:[],reviewedHash:(request.data as any).witnessContext.reviewedHash,repairScope:'none'}
 return {packet,scope,root,prefix,request,review}
}
it('uses disjoint premise transport without weakening routing, source or counterline validation',async()=>{
 const {prefix,scope,packet,review}=routingFixture()
 const {compactGuidePremiseReviewSchema,coherentGuidePremiseReviewSchema,readGuidePremiseReview}=await import('../src/main/guide-premise-review')
 const {assertNativeScenarioSchema}=await import('../src/main/guide-scenario-output-schema')
 const compact=compactGuidePremiseReviewSchema(prefix,scope,packet),old=coherentGuidePremiseReviewSchema(prefix,scope,packet)
 expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(old).length/2)
 const pass={...review,verdict:'pass',repairScope:'none',findings:[]},negative={...review,repairScope:'first-turn'}
 for(const value of [pass,negative]){expect(()=>assertNativeScenarioSchema(value,compact)).not.toThrow();expect(()=>readGuidePremiseReview(value,prefix,scope,packet)).not.toThrow()}
 for(const value of [review,{...negative,verdict:'pass'},{...pass,repairScope:'setup'},{...negative,findings:[]},{...negative,findings:[{...negative.findings[0],sourceIds:['foreign']}]}])expect(()=>assertNativeScenarioSchema(value,compact)).toThrow()
 const noWitness={...negative,findings:[{...negative.findings[0],proposedActions:[{scenarioId:prefix.setup.id,turn:2,side:'ours',action:'other',reason:'A claimed alternative needs a witness.'}]}]}
 expect(()=>readGuidePremiseReview(noWitness,prefix,scope,packet)).toThrow()
})
it('rejects an inconsistent minor review with actionable first-turn feedback and never promotes it into a pass',()=>{
 const {request,review,prefix}=routingFixture(),before=guideHash({review,prefix})
 expect(()=>request.read(review)).toThrow(/repairScope=none.*first-turn.*setup/)
 expect(guideHash({review,prefix})).toBe(before)
 const corrected={...review,repairScope:'first-turn'}
 expect(request.read(corrected).verdict).toBe('revise');expect(request.read(corrected).findings).toEqual(review.findings)
 expect(()=>request.read({...review,findings:[],repairScope:'first-turn'})).toThrow('almeno un rilievo reale')
 expect(()=>request.read({...corrected,verdict:'pass'})).toThrow('pass incompatibile')
 expect(()=>request.read({...review,verdict:'pass',findings:[]})).not.toThrow()
})
it('gives setup repairs and native turns the complete accounting and temporal candidate instructions',()=>{
 const {scope,packet,prefix,request,review,root}=routingFixture(),archive={id:scope.jobId,projectId:scope.projectId,values:()=>[],value:()=>undefined,saveValue:()=>{}}
 const repair=guideSetupRepairRequest(prefix,{...review,repairScope:'setup'} as any,{scope,packet,archive,reserveOutside:0} as any)
 const turn=guideTurnDeclarationRequest(root,scope,packet,{reserveCalls:0}),rules=guideSegmentNativeRules()
 for(const actor of [repair,turn,request]){
  expect(actor.instructions).toContain(rules)
  for(const text of ['non ricopiarlo in events','NON ridichiarare Energie Base ordinarie','decisionProof','UNIONE temporale','recuperabili dagli scarti','tactical.promotions','OGNI copia','CHIAVI NATIVE'])expect(actor.instructions).toContain(text)
  expect(actor.instructions).not.toMatch(/Crustle|Zoroark|Alakazam|Dudunsparce|Dhelmise|Lucario|Hariyama|Toucannon|Dragapult|Festival|Hydrapple/)
 }
 expect(request.instructions).toContain('anche minor o testuale')
 expect(request.instructions).toContain('first-turn se basta cambiare il primo turno')
 expect((repair.schema as any).properties.native.properties.turns).toBeUndefined()
 const native=structuredClone(prefix.setup);native.assumptions.push('Synthetic alternative premise, still subject to independent criticism.')
 expect(()=>repair.read({caseId:native.id,rejectedRootHash:prefix.rootHash,native,changeSummary:'Declare a changed premise explicitly.'})).not.toThrow()
})
it('revalidates a paid setup after instruction changes without reusing a critic pass or a later rejected premise',async()=>{
 const {scope,packet,prefix,review}=routingFixture(),records=new Map<string,Map<string,any>>(),saved=(role:string)=>[...(records.get(role)??new Map()).entries()].map(([key,value])=>({key,value}))
 const archive={id:scope.jobId,projectId:scope.projectId,values:saved,value:(role:string,key:string)=>records.get(role)?.get(key),saveValue:(role:string,key:string,value:any)=>{if(!records.has(role))records.set(role,new Map());records.get(role)!.set(key,structuredClone(value))}}
 const rejection={...review,repairScope:'setup'},native=structuredClone(prefix.setup);native.assumptions.push('Synthetic replacement setup, still awaiting independent premise review.')
 let calls=0
 const runtime:any={scope,packet,archive,reserveOutside:0,estimate:()=>({bytes:1,estimatedInput:1,reservedOutput:1,estimatedResponseCharacters:1,margin:1}),isCached:()=>false,remainingCalls:()=>64,check:()=>{},call:async(r:any)=>{calls++;return r.read({units:r.data.units.map((u:any)=>({unitId:u.unitId,response:{caseId:native.id,rejectedRootHash:prefix.rootHash,native,changeSummary:'Synthetic replacement.'}}))})}}
 const current=guideSetupRepairRequest(prefix,rejection as any,runtime),older={...current,instructions:'Synthetic older constructor instructions.',unitKey:guideHash('synthetic-older-setup-constructor')}
 await runGuideSegmentPhase([{id:prefix.setup.id,request:()=>older,accept:(value:any)=>archive.saveValue('guide-setup-repair-v1',guideHash([prefix.rootHash,rejection,value]),{prefix,review:rejection,value})}],{...runtime,stage:'segment-setup-repair'})
 expect(calls).toBe(1);runtime.call=async()=>{throw Error('UNEXPECTED_NEW_MODEL_CALL')}
 expect(await repairGuideSetup(prefix,rejection as any,runtime)).toEqual(native);expect(calls).toBe(1)
 const original=saved('guide-setup-repair-v1')[0],altered=structuredClone(original.value);altered.value.changeSummary='Corrupt synthetic stored value'
 records.get('guide-setup-repair-v1')!.set(original.key,altered)
 await expect(repairGuideSetup(prefix,rejection as any,runtime)).rejects.toThrow('ricevuta archiviata alterata')
 records.get('guide-setup-repair-v1')!.set(original.key,original.value)
 const acceptedUnits=records.get('guide-segment-unit-result-v1')!;records.delete('guide-segment-unit-result-v1')
 await expect(repairGuideSetup(prefix,rejection as any,runtime)).rejects.toThrow('senza risposta AI accettata')
 records.set('guide-segment-unit-result-v1',acceptedUnits)
 const repaired=appendGuideSegment(createGuideSegments(native,scope,packet),scope,packet,prefix.segments[0].body,prefix.segments[0].development),newCritic=guidePremiseRequest(repaired,scope,packet,0)
 archive.saveValue('guide-premise-review-v1','synthetic-later-rejection',{prefix:repaired,review:{...rejection,reviewedHash:(newCritic.data as any).witnessContext.reviewedHash}})
 await expect(repairGuideSetup(prefix,rejection as any,runtime)).rejects.toThrow('UNEXPECTED_NEW_MODEL_CALL')
})
