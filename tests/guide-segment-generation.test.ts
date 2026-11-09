import {it,expect} from 'vitest'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {createHash} from 'node:crypto'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {AiJobStore} from '../src/main/ai-job-store'
import {ProjectStore} from '../src/main/project-store'
import {constructGuideMainLine,guideTurnDeclarationRequest,type GuideSegmentRequest,type GuideTurnDeclaration} from '../src/main/guide-segment-generation'
import {segmentFixture} from './fixtures/guide-segment'
import type {GuidePacket} from '../src/main/matchup-guide-packet'
import {appendGuideSegment,createGuideSegments,guideSegmentNativeSchema,verifyGuideSegments,type GuideSegmentJournal} from '../src/main/guide-segments'
import {loadGuideSegmentCheckpoint} from '../src/main/guide-segment-checkpoints'
import {callGuideSegmentBatch,guideSegmentRetry,prepareGuideSegmentBatch} from '../src/main/guide-segment-batch'
import {boundGuideSchema} from '../src/main/guide-bound-schema'
import {singleScenarioSchemaV27} from '../src/main/matchup-guide-schema'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'
import {planGuideRequest} from '../src/main/guide-request-budget'
import {constructGuideMainLines} from '../src/main/guide-mainline-phase'
import {constructGuideReplyBranches,constructGuideReplyPlans} from '../src/main/guide-reply-phase'
import {guideSource} from '../src/main/matchup-guide-packet'
import {constructGuideScenarioMetadata,guideScenarioMetadataRequest} from '../src/main/guide-scenario-metadata'
import {projectGuideLedger} from '../src/shared/guide-ledger-projection'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {assertGuideReport} from '../src/shared/matchup-guide'
import {unpackGuideData} from '../src/main/guide-request-budget'
import {guideSegmentReviewRequest} from '../src/main/guide-segment-review'

it('binds construction fragments to exactly the original constraints with different cards on the two sides',()=>{
  const f=segmentFixture(),packet=f.packet as unknown as GuidePacket,ours=JSON.parse(packet.sources[0].content)
  packet.opponentLists=structuredClone(packet.opponentLists)
  ours.printId='ours-only';packet.ourList.cards[0].printId='ours-only'
  packet.sources.push(guideSource('card:ours-only','card','Synthetic own card',null,JSON.stringify(ours)))
  f.scenario.opening.ours.active='ours-only';f.scenario.positionAnnotations[0].printId='ours-only'
  const original=(boundGuideSchema(singleScenarioSchemaV27(f.scenario.id),packet,'their-list') as any).properties.scenarios.items
  const fragment=guideSegmentNativeSchema(f.scenario.id,packet,'their-list')
  for(const [key,value]of Object.entries(fragment.properties))expect(value,key).toEqual(original.properties[key])
  const {turns,developmentPlan,...nativeSetup}=f.scenario
  const scope={projectId:'project-a',jobId:'schema-only',dependencyHash:packet.basis.dependencyHash,configHash:'synthetic-config'}
  const root=createGuideSegments(nativeSetup,scope,packet),request=guideTurnDeclarationRequest(root,scope,packet,{reserveCalls:0})
  expect((request.schema as any).properties.body).toEqual(original.properties.turns.properties.ours)
  expect((request.schema as any).properties.development).toEqual(original.properties.developmentPlan.properties.ours)
})

const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
function setup(){
  const parent=resolve('.verify/app225-segments-20261102');mkdirSync(parent,{recursive:true})
  const folder=mkdtempSync(join(parent,'generation-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path)
  const project=projects.create({name:'Synthetic coordinator',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic-coordinator')
  const {packet:fixture,scenario,opponent}=segmentFixture(),packet={...fixture,basis:{...fixture.basis,projectId:project.id}} as GuidePacket
  const scope={projectId:project.id,jobId:job.id,dependencyHash:packet.basis.dependencyHash,configHash:'synthetic-config'}
  const {turns,developmentPlan,...nativeSetup}=scenario
  const next={draw:'e',beforeAttack:[],afterAttack:[],tactical:turns.ours.tactical,attack:{kind:'effect',description:'Synthetic free attack',moves:[],energyRoutes:[],attack:{printId:'p',attackName:'Synthetic attack'},trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:{energy:[],costAdjustments:[]},decisionProof:{cards:['p','e'],reason:'Compare all synthetic choices'},action:'other',affectedSide:'ours'}}
  const archive=new AiEvidenceArchive(path,job)
  return {path,projects,jobs,job,archive,packet,scope,nativeSetup,bodies:{ours:turns.ours,opponent,next},note:developmentPlan.ours}
}
it('constructs and persists each turn, critics first, and resumes without buying cached work',async()=>{
  const s=setup(),cache=new Map<string,unknown>(),fresh:{stage:string;reserve:number}[]=[]
  let archive=s.archive,interrupt=true
  const call=async<T>(r:GuideSegmentRequest<T>):Promise<T>=>{
    const key=hash([r.stage,r.instructions,r.data,r.schema])
    if(cache.has(key)){const value=structuredClone(cache.get(key)) as T;r.cacheValidation.validate(value);return value}
    if(r.role==='critic'&&interrupt){interrupt=false;throw Error('Synthetic interruption before independent premise review')}
    const data=r.data as any,schema=r.schema as any
    const raw=r.role==='critic'?{verdict:'pass',findings:[],checks:['Synthetic premise checked'],revalidatedIds:[],textCorrections:[],reviewedHash:data.witnessContext.reviewedHash,repairScope:'none'}:{caseId:s.nativeSetup.id,parentHash:schema.properties.parentHash.const,phase:schema.properties.phase.const,body:s.bodies[schema.properties.phase.const as keyof typeof s.bodies],development:s.note}
    fresh.push({stage:r.stage,reserve:r.reserveCalls});const value=r.read(raw);cache.set(key,value);return structuredClone(value)
  }
  try{
    const options=()=>({setup:s.nativeSetup,scope:s.scope,packet:s.packet,archive,call,reserveOutside:5,check:()=>{}})
    await expect(constructGuideMainLine(options())).rejects.toThrow('Synthetic interruption')
    const root=createGuideSegments(s.nativeSetup,s.scope,s.packet)
    expect(loadGuideSegmentCheckpoint(archive,s.scope,s.packet,s.nativeSetup.id,root.rootHash)!.segments).toHaveLength(1)
    archive.close();archive=new AiEvidenceArchive(s.path,s.job)
    const result=await constructGuideMainLine(options())
    expect(result.journal.segments).toHaveLength(3);expect(result.premise.verdict).toBe('pass')
    expect(fresh.map(r=>r.stage)).toEqual(['segment-case-a-ours','review-premise-case-a','segment-case-a-opponent','segment-case-a-next'])
    expect(fresh.map(r=>r.reserve)).toEqual([8,7,6,5])
    const calls=fresh.length
    expect((await constructGuideMainLine(options())).journal).toEqual(result.journal)
    expect(fresh).toHaveLength(calls)
    expect([...archive.values('guide-premise-review-v1')]).toHaveLength(1)
    expect([...archive.values('guide-attempt-start')]).toHaveLength(0)
  }finally{archive.close();s.jobs.close();s.projects.close()}
},20000)
it('rejects an invalid critic before constructing later turns and prevents a cached no-op repair loop',async()=>{
  const s=setup(),stages:string[]=[],root=createGuideSegments(s.nativeSetup,s.scope,s.packet)
  let critic='invalid'
  const call=async<T>(r:GuideSegmentRequest<T>)=>{
    stages.push(r.stage);const data=r.data as any,schema=r.schema as any
    if(r.role==='constructor')return r.read({caseId:s.nativeSetup.id,parentHash:schema.properties.parentHash.const,phase:schema.properties.phase.const,body:s.bodies.ours,development:s.note})
    const finding={severity:'major',targetId:s.nativeSetup.id,message:'Synthetic unsupported first-turn choice',correction:'Reconsider the preparation',sourceIds:['card:p'],proposedActions:[],counterlines:[]}
    return r.read({verdict:critic==='invalid'?'pass':'revise',findings:[finding],checks:['Synthetic check'],revalidatedIds:[],textCorrections:[],reviewedHash:data.witnessContext.reviewedHash,repairScope:'first-turn'})
  }
  try{
    const options={setup:s.nativeSetup,scope:s.scope,packet:s.packet,archive:s.archive,call,reserveOutside:5,check:()=>{}}
    await expect(constructGuideMainLine(options)).rejects.toThrow('pass incompatibile')
    expect(stages).toEqual(['segment-case-a-ours','review-premise-case-a'])
    expect(loadGuideSegmentCheckpoint(s.archive,s.scope,s.packet,s.nativeSetup.id,root.rootHash)!.segments).toHaveLength(1)
    critic='negative'
    await expect(constructGuideMainLine(options)).rejects.toThrow('senza modifiche')
    expect(stages.every(stage=>!stage.endsWith('opponent')&&!stage.endsWith('next'))).toBe(true)
    expect(loadGuideSegmentCheckpoint(s.archive,s.scope,s.packet,s.nativeSetup.id,root.rootHash)!.segments).toHaveLength(0)
    expect([...s.archive.values('guide-premise-review-v1')]).toHaveLength(1)
  }finally{s.archive.close();s.jobs.close();s.projects.close()}
},20000)
it('retains a verified native sibling when one batch unit fails and retries only the rejected unit',async()=>{
  const s=setup(),object=(properties:Record<string,any>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
  const requests=['case-a','case-b'].map(caseId=>{
    const root=createGuideSegments({...s.nativeSetup,id:caseId},s.scope,s.packet)
    const native=(boundGuideSchema(singleScenarioSchemaV27(caseId),s.packet,s.nativeSetup.opponentListId) as any).properties.scenarios.items
    const schema=object({caseId:{type:'string',const:caseId},body:native.properties.turns.properties.ours,development:native.properties.developmentPlan.properties.ours})
    const read=(raw:unknown)=>{assertNativeScenarioSchema(raw,schema);return appendGuideSegment(root,s.scope,s.packet,(raw as any).body,(raw as any).development)}
    const request:GuideSegmentRequest<GuideSegmentJournal>={stage:'segment-'+caseId+'-ours',role:'constructor',instructions:'Synthetic exact native turns',task:'Build one synthetic turn',data:{packet:s.packet,prefix:root.setup},schema,reserveCalls:5,unitKey:hash({scope:s.scope,caseId,rootHash:root.rootHash,phase:'ours'}),read,cacheValidation:{id:'synthetic-turn-1',validate:value=>{verifyGuideSegments(value,s.scope,s.packet);if(value.rootHash!==root.rootHash||value.segments.length!==1)throw Error('Wrong synthetic prefix')}}}
    return request
  })
  let providerCalls=0
  const call=async<T>(r:GuideSegmentRequest<T>):Promise<T>=>{
    providerCalls++
    const units=(r.data as any).units
    expect(r.units).toBe(units.length)
    return r.read({units:units.map((u:any)=>({unitId:u.unitId,response:{caseId:u.data.prefix.id,body:providerCalls<=2&&u.data.prefix.id==='case-b'?{...s.bodies.ours,draw:'foreign-card'}:s.bodies.ours,development:s.note}}))})
  }
  try{
    const preview=prepareGuideSegmentBatch(requests,{stage:'segments-ours',reserveCalls:5})
    expect(preview.request.units).toBe(2);expect(providerCalls).toBe(0)
    expect([...s.archive.values('guide-segment-unit-result-v1')]).toHaveLength(0)
    const first=await callGuideSegmentBatch(requests,{stage:'segments-ours',reserveCalls:5,call,archive:s.archive})
    expect(first.outcomes.map(o=>o.accepted)).toEqual([true,false])
    const good=first.outcomes[0];if(!good.accepted)throw Error('Expected accepted synthetic unit')
    expect(good.value.segments).toHaveLength(1)
    const original=JSON.stringify(good),evidence=[...s.archive.values('guide-segment-unit-result-v1')]
    const previous=guideSegmentRetry(s.archive,requests[1].unitKey!)!
    const reopened=new AiEvidenceArchive(s.path,s.job)
    try{expect(guideSegmentRetry(reopened,requests[1].unitKey!)).toEqual(previous)}finally{reopened.close()}
    const retry={...requests[1],retryOrdinal:previous.ordinal,data:{...requests[1].data as object,previousInvalid:previous}}
    const second=await callGuideSegmentBatch([retry],{stage:'segments-ours-repair',reserveCalls:5,call,archive:s.archive})
    expect(second.outcomes[0].accepted).toBe(false)
    expect(second.outcomes[0].raw).toEqual(first.outcomes[1].raw)
    expect(second.outcomes[0].unitId).not.toBe(first.outcomes[1].unitId)
    const previousAgain=guideSegmentRetry(s.archive,requests[1].unitKey!)!
    expect(previousAgain.ordinal).toBe(2)
    const third=await callGuideSegmentBatch([{...requests[1],retryOrdinal:previousAgain.ordinal,data:{...requests[1].data as object,previousInvalid:previousAgain}}],{stage:'segments-ours-repair',reserveCalls:5,call,archive:s.archive})
    expect(third.outcomes[0].accepted).toBe(true);expect(providerCalls).toBe(3)
    expect(JSON.stringify(good)).toBe(original)
    for(const row of evidence)expect([...s.archive.values('guide-segment-unit-result-v1')]).toContainEqual(row)
    expect([...s.archive.values('guide-segment-unit-result-v1')]).toHaveLength(4)
    await expect(callGuideSegmentBatch([requests[0],{...requests[1],role:'critic'}],{stage:'mixed',reserveCalls:5,call,archive:s.archive})).rejects.toThrow('separare ruoli')
    await expect(callGuideSegmentBatch(requests,{stage:'under-reserved',reserveCalls:4,call,archive:s.archive})).rejects.toThrow('riserva')
    expect(providerCalls).toBe(3)
  }finally{s.archive.close();s.jobs.close();s.projects.close()}
},20000)
it('schedules native units with persistent repair feedback and recovers accepted work even with zero calls remaining',async()=>{
  const s=setup(),roots=['case-a','case-b'].map(id=>createGuideSegments({...s.nativeSetup,id},s.scope,s.packet))
  let states=[...roots],left=10
  const sizes:number[]=[]
  const units=roots.map((root,index)=>({id:root.setup.id,request:()=>guideTurnDeclarationRequest(states[index],s.scope,s.packet,{reserveCalls:5,archive:s.archive}),accept:(value:GuideTurnDeclaration)=>{states[index]=appendGuideSegment(states[index],s.scope,s.packet,value.body,value.development)}}))
  const call=async<T>(r:GuideSegmentRequest<T>)=>{
    left--;const data=r.data as any; sizes.push(data.units.length)
    const schemas=(r.schema as any).properties.units.items.anyOf
    return r.read({units:data.units.map((u:any)=>{
      const schema=schemas.find((v:any)=>v.properties.unitId.const===u.unitId).properties.response
      const bad=sizes.length===1&&u.data.prefix.id==='case-b'
      if(sizes.length>1)expect(u.data.previousInvalid.ordinal).toBe(1)
      return {unitId:u.unitId,response:{caseId:u.data.prefix.id,parentHash:schema.properties.parentHash.const,phase:'ours',body:bad?{...s.bodies.ours,draw:'foreign-card'}:s.bodies.ours,development:s.note}}
    })})
  }
  const options={stage:'segments-ours',archive:s.archive,call,estimate:(r:GuideSegmentRequest<any>)=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],left,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>left,check:()=>{}}
  try{
    await runGuideSegmentPhase(units,options)
    expect(sizes).toEqual([2,1]);expect(states.map(j=>j.segments.length)).toEqual([1,1])
    states=[...roots];left=0
    await runGuideSegmentPhase(units,options)
    expect(sizes).toEqual([2,1]);expect(states.map(j=>j.segments.length)).toEqual([1,1])
    expect([...s.archive.values('guide-segment-unit-result-v1')]).toHaveLength(3)
  }finally{s.archive.close();s.jobs.close();s.projects.close()}
},20000)
it('handles an event-loop cancellation after durable outcomes and before sending the next group',async()=>{
 const s=setup(),roots=['pause-a','pause-b'].map(id=>createGuideSegments({...s.nativeSetup,id},s.scope,s.packet))
 let stopped=false,calls=0;const accepted:string[]=[]
 const units=roots.map(root=>({id:root.setup.id,request:()=>({...guideTurnDeclarationRequest(root,s.scope,s.packet,{reserveCalls:0,archive:s.archive}),instructions:'Separate synthetic header '+root.setup.id}),accept:()=>{accepted.push(root.setup.id)}}))
 const options={stage:'segments-cancellation',archive:s.archive,call:async<T>(request:GuideSegmentRequest<T>)=>{
  calls++;setImmediate(()=>{stopped=true})
  const data=request.data as any,schemas=(request.schema as any).properties.units.items.anyOf
  return request.read({units:data.units.map((unit:any)=>{const schema=schemas.find((v:any)=>v.properties.unitId.const===unit.unitId).properties.response;return {unitId:unit.unitId,response:{caseId:unit.data.prefix.id,parentHash:schema.properties.parentHash.const,phase:'ours',body:s.bodies.ours,development:s.note}}})})
 },estimate:(request:GuideSegmentRequest<any>)=>planGuideRequest(request.stage,request.instructions,request.data,request.schema,[],10,request.reserveCalls,request.units).budget,isCached:()=>false,remainingCalls:()=>10,check:()=>{if(stopped)throw Error('Synthetic event-loop cancellation')}}
 try{
  await expect(runGuideSegmentPhase(units,options)).rejects.toThrow('Synthetic event-loop cancellation')
  expect(calls).toBe(1);expect(accepted).toEqual(['pause-a'])
  expect([...s.archive.values<any>('guide-segment-unit-result-v1')].map(r=>r.value.accepted)).toEqual([true])
 }finally{s.archive.close();s.jobs.close();s.projects.close()}
},20000)
it('builds two main lines in four independent phase calls and reopens without requesting them again',async()=>{
  const s=setup(),setups=[s.nativeSetup,{...s.nativeSetup,id:'case-b'}],stages:string[]=[],sizes:number[]=[]
  let left=16,archive=s.archive
  const call=async<T>(r:GuideSegmentRequest<T>)=>{
    stages.push(r.stage);left--
    const units=(r.data as any).units,schemas=(r.schema as any).properties.units.items.anyOf;sizes.push(units.length)
    return r.read({units:units.map((u:any)=>{
      const schema=schemas.find((v:any)=>v.properties.unitId.const===u.unitId).properties.response
      return {unitId:u.unitId,response:r.role==='critic'?{verdict:'pass',findings:[],checks:['Synthetic independent premise'],revalidatedIds:[],textCorrections:[],reviewedHash:u.data.witnessContext.reviewedHash,repairScope:'none'}:{caseId:u.data.prefix.id,parentHash:schema.properties.parentHash.const,phase:schema.properties.phase.const,body:s.bodies[schema.properties.phase.const as keyof typeof s.bodies],development:s.note}}
    })})
  }
  const options=()=>({setups,scope:s.scope,packet:s.packet,archive,call,estimate:(r:GuideSegmentRequest<any>)=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],left,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>left,reserveOutside:5,check:()=>{}})
  try{
    const result=await constructGuideMainLines(options())
    expect(result.map(r=>r.journal.segments.length)).toEqual([3,3])
    expect(stages).toEqual(['segments-main-ours','review-premise-main','segments-main-opponent','segments-main-next'])
    expect(sizes).toEqual([2,2,2,2])
    archive.close();archive=new AiEvidenceArchive(s.path,s.job);left=0
    expect(await constructGuideMainLines(options())).toEqual(result)
    expect(stages).toHaveLength(4)
  }finally{archive.close();s.jobs.close();s.projects.close()}
},20000)
it('builds independent replies from the same accepted prefix and verifies access before requesting continuation',async()=>{
  const s=setup(),card=JSON.parse(s.packet.sources[0].content)
  s.packet.basis.promptVersion='matchup-guide-28'
  card.gameplay.abilities=[{name:'Synthetic Insight',effect:'Once during your turn, draw one card.'}]
  card.gameplay.attacks[0].damage='0'
  s.packet.sources[0]=guideSource('card:p','card','Synthetic Basic',null,JSON.stringify(card))
  ;(s.bodies.opponent as any).events=[{...structuredClone(s.bodies.next.attack),accessReceipt:null}]
  const stages:string[]=[],sizes:number[]=[];let left=16
  const access={kind:'effect',description:'Use Synthetic Insight',moves:[],energyRoutes:[{side:'opponent',printId:'e',count:1,path:['deck','hand'],hostPrintId:null,sourceIds:['card:p'],attachment:null}],attack:null,trainer:null,retreat:null,deckObservations:[],boardExitProofs:[],attachmentTargets:[],attackPayment:null,decisionProof:null,action:'other',affectedSide:'opponent',accessReceipt:{sourceIds:['card:p'],reason:'Synthetic Insight draws a card in addition to the ordinary draw.'}}
  const call=async<T>(r:GuideSegmentRequest<T>)=>{
    stages.push(r.stage);left--
    const units=(r.data as any).units,schemas=(r.schema as any).properties.units.items.anyOf;sizes.push(units.length)
    return r.read({units:units.map((u:any)=>{
      const schema=schemas.find((v:any)=>v.properties.unitId.const===u.unitId).properties.response
      if(r.role==='critic')return {unitId:u.unitId,response:{verdict:'pass',findings:[],checks:['Synthetic premise checked'],revalidatedIds:[],textCorrections:[],reviewedHash:u.data.witnessContext.reviewedHash,repairScope:'none'}}
      if(r.stage.startsWith('metadata-')){
        const metadataSchema=schema.anyOf?.[0]??schema,c=metadataSchema.properties.metadata.properties.replyComparison.properties,coverage=Object.fromEntries(['direct','access','defend'].map(role=>[role,c.coverage.properties[role].const]))
        return {unitId:u.unitId,response:{caseId:u.data.main.id,constructionHash:u.data.constructionHash,metadata:{assumptions:[],sourceIds:['card:p','card:e','rules'],calculations:[{label:'Synthetic printed zero damage',terms:[0],multiplier:1,minimum:0,expected:0,purpose:'damage',attack:{printId:'p',attackName:'Synthetic attack'}}],replyComparison:{objective:'Compare synthetic zero-damage replies',threshold:120,minimumReplyId:null,preferredReplyId:coverage.direct,options:u.data.branches.map((b:any)=>({id:b.seed.id,intent:b.seed.intent,specificDraws:[],terms:[0],multiplier:1,damage:0,reachesThreshold:false,remainingHp:120,outcome:'Synthetic zero damage; no KO.',sourceIds:['card:p'],promotionRationale:'No compulsory promotion in this synthetic branch.'})),omissionTests:[],conclusion:'The direct synthetic reply uses no additional access.',coverage,attackReview:[{printId:'p',attackName:'Synthetic attack',replyId:coverage.direct,reason:'The direct branch executes the printed free attack.'}]}},claims:[],limitations:['Synthetic mechanical fixture; no competitive quality claimed.'],changeSummary:'Compute only from frozen synthetic lines.'}}
      }
      if(r.stage.startsWith('branch-plan-')){
        const seed=(role:string)=>({id:schema.properties[role].properties.id.const,role,intent:role==='defend'?'defend':'attack',goal:'Compare synthetic '+role,sourceIds:['card:p']})
        return {unitId:u.unitId,response:{caseId:schema.properties.caseId.const,mainHash:schema.properties.mainHash.const,direct:seed('direct'),access:seed('access'),defend:seed('defend'),others:[]}}
      }
      const phase=schema.properties.phase.const,body=structuredClone(s.bodies[phase as keyof typeof s.bodies])
      if(phase==='opponent'&&u.data.reply?.role==='access')(body as any).events=[access,...s.bodies.opponent.events]
      return {unitId:u.unitId,response:{caseId:u.data.prefix.id,parentHash:schema.properties.parentHash.const,phase,body,development:s.note}}
    })})
  }
  const runtime={scope:s.scope,packet:s.packet,archive:s.archive,call,estimate:(r:GuideSegmentRequest<any>)=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],left,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>left,reserveOutside:5,check:()=>{}}
  try{
    const mains=(await constructGuideMainLines({...runtime,setups:[s.nativeSetup]})).map(r=>r.journal)
    const plans=await constructGuideReplyPlans(mains,runtime),branches=await constructGuideReplyBranches(mains,plans,runtime)
    expect(branches).toHaveLength(3)
    for(const branch of branches){expect(branch.journal.segments).toHaveLength(3);expect(branch.journal.segments[0]).toEqual(mains[0].segments[0])}
    const hand=(role:string)=>branches.find(b=>b.seed.role===role)!.journal.segments[1].receipt.inventory.find((r:any)=>r.side==='opponent'&&r.printId==='e'&&r.zone==='hand').count
    expect(hand('direct')).toBe(7);expect(hand('access')).toBe(8);expect(hand('defend')).toBe(7)
    expect(stages.slice(-3)).toEqual(['branch-plan-cases','segments-reply-opponent','segments-reply-next'])
    expect(sizes.slice(-2)).toEqual([3,3])
    const frozen=JSON.stringify({mains,branches})
    const [built]=await constructGuideScenarioMetadata(mains,plans,branches,runtime)
    expect(built.content.scenarios[0].replyComparison!.options).toHaveLength(3)
    expect(JSON.stringify({mains,branches})).toBe(frozen)
    expect(built.native.turns).toEqual(s.bodies)
    const reviewRequest=guideSegmentReviewRequest(built.content,{mains,plans,branches,built:[built]},{...runtime,stage:'review-scenarios-synthetic',task:'Review all completed branches.',scopeKind:'scenarios'})
    const context=reviewRequest.data as any,direct=branches.find(b=>b.seed.role==='direct')!,journal=direct.journal,index=1
    const alternative=structuredClone(journal.segments[index].body);alternative.events.unshift(access)
    const witness={scenarioId:mainId(mains),reviewedHash:journal.segments.at(-1)!.hash,parentHash:journal.segments[index].parentHash,turn:journal.segments[index].receipt.lastTurn,side:'opponent' as const,sourceIds:['card:p'],reason:'Compare a real additional draw from the same branch boundary.',continuation:[{body:alternative,development:journal.segments[index].development},{body:journal.segments[2].body,development:journal.segments[2].development}]}
    const finding={severity:'major',targetId:mainId(mains),message:'Compare an additional legal access in this branch.',correction:'Reconsider the exact opponent turn.',sourceIds:['card:p'],proposedActions:[{scenarioId:mainId(mains),side:'opponent',turn:witness.turn,action:'other',reason:'Use printed Insight.'}],counterlines:[{lineId:direct.seed.id,witness}],repair:{kind:'turn',caseId:mainId(mains),lineId:direct.seed.id,reviewedHash:witness.reviewedHash,fromTurn:witness.turn}}
    const review:any={verdict:'revise',findings:[finding],checks:['Check the counterline from its actual branch.'],revalidatedIds:[],textCorrections:[],draftHash:context.draftHash,constructionHash:context.constructionHash,reviewContextHash:context.reviewContextHash,resolutionAudit:[]}
    expect(reviewRequest.read(review).findings[0].counterlines[0].lineId).toBe(direct.seed.id)
    const wrong=structuredClone(review);wrong.findings[0].counterlines[0].witness.continuation[0].body.draw='p'
    expect(()=>reviewRequest.read(wrong)).toThrow('pescata ordinaria diversa')
    const absent=structuredClone(review);absent.findings[0].counterlines=[]
    expect(()=>reviewRequest.read(absent)).toThrow('ogni alternativa')
    const stale=structuredClone(review);stale.findings[0].repair.reviewedHash='stale-state'
    expect(()=>reviewRequest.read(stale)).toThrow()
    const semantic=structuredClone(review);semantic.findings[0].proposedActions=[];semantic.findings[0].counterlines=[]
    expect(reviewRequest.read(semantic).verdict).toBe('revise')
    expect(()=>reviewRequest.read({...semantic,verdict:'pass'})).toThrow('pass con rilievi')
    const forged=structuredClone(branches);forged[0].terminal=true
    expect(()=>guideScenarioMetadataRequest(mains[0],plans[0],forged,runtime)).toThrow('terminalità non derivata')
    const terminal=structuredClone(built.raw) as any
    terminal.scenarios[0].replyComparison.options[0].turns.next={terminal:true}
    expect(()=>projectGuideLedger(terminal,s.packet)).toThrow('terminale dichiarato senza fine partita')
    const count=stages.length;left=0
    expect(await constructGuideReplyBranches(mains,plans,runtime)).toEqual(branches)
    expect(await constructGuideReplyPlans(mains,runtime)).toEqual(plans)
    expect(stages).toHaveLength(count)
  }finally{s.archive.close();s.jobs.close();s.projects.close()}
},20000)
const mainId=(mains:GuideSegmentJournal[])=>mains[0].setup.id
it('runs the v28 cold path through the shared caller and all complete publication gates on an isolated synthetic protocol',async()=>{
  const s=setup(),fixture=syntheticSegmentProtocol(s.scope.projectId,true),config={provider:'codex' as const,source:'global' as const,model:'gpt-6.1-sol',reasoningEffort:null}
  let work=new AiAnalysisWork(join(dirname(s.path),'work'),s.jobs,s.job.id,new AbortController().signal)
  const stages:string[]=[]
  try{
    const runner=async(prompt:string,_config:unknown,schema:object)=>{
      const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));stages.push(stage)
      if(stage==='segments-main-opponent'||stage==='segments-reply-opponent'){
        const root=schema as any,resolve=(node:any):any=>node?.$ref?resolve(root.$defs[node.$ref.slice('#/$defs/'.length)]):node
        for(const item of resolve(resolve(root.properties.units).items).anyOf){
          const body=resolve(resolve(resolve(item).properties.response).properties.body),event=resolve(resolve(body.properties.events).items)
          const attackers=resolve(event.properties.attack).anyOf.map(resolve).filter((v:any)=>v.type==='object').flatMap((v:any)=>resolve(v.properties.printId).enum)
          expect(attackers).toEqual(['p'])
        }
      }
      return fixture.response(stage,data,schema)
    }
    const options={packet:fixture.packet,config,request:'Independent synthetic complete-protocol fixture.',runner}
    const guide=await generateDeepGuide({...options,work,attemptLimit:14})
    const forecast=[...work.archive.values<any>('guide-segment-final-reserve-v1')].at(-1)!.value
    expect(forecast.reserveCalls).toBe(1);expect(forecast.groups[0]).toHaveLength(3)
    expect(forecast.proseGrowthReserve.inputTokens).toBeGreaterThan(16000)
    assertGuideReport({...fixture.packet.basis,guide});assertGuideIntegrity(guide)
    expect(guide.basis.promptVersion).toBe('matchup-guide-28')
    expect(guide.scenarios).toHaveLength(2);expect(guide.generation.attempts.length).toBeLessThanOrEqual(16)
    expect(stages).toContain('metadata-cases');expect(stages.some(s=>s.startsWith('review-scenarios-'))).toBe(true);expect(stages.some(s=>/^review-[a-f0-9]{16}$/.test(s))).toBe(true)
    expect(stages.some(stage=>stage==='scenarios-1'||stage==='scenarios-2')).toBe(false)
    expect(guide.generation.attempts.filter(a=>a.unitResults).every(a=>a.unitResults!.rejected===0)).toBe(true)
    const count=[...work.archive.values('guide-attempt-start')].length
    work.close();work=new AiAnalysisWork(join(dirname(s.path),'work'),s.jobs,s.job.id,new AbortController().signal)
    const recovered=await generateDeepGuide({packet:fixture.packet,config,work,request:'Independent synthetic complete-protocol fixture.',runner:async()=>{throw new Error('No provider request expected after validated recovery')}})
    expect(recovered).toEqual(guide);expect([...work.archive.values('guide-attempt-start')]).toHaveLength(count)
  }finally{work.close();s.archive.close();s.jobs.close();s.projects.close()}
},60000)
it('rebuilds only a rejected setup through AI declarations and rechecks its premise before later turns',async()=>{
  const s=setup(),fixture=syntheticSegmentProtocol(s.scope.projectId),config={provider:'codex' as const,source:'global' as const,model:'gpt-6.1-sol',reasoningEffort:null}
  const work=new AiAnalysisWork(join(dirname(s.path),'work'),s.jobs,s.job.id,new AbortController().signal),stages:string[]=[]
  let rejected=false
  const options={packet:fixture.packet,config,work,request:'Synthetic rejected setup recovery.'}
  try{
    const runner:NonNullable<Parameters<typeof generateDeepGuide>[0]['runner']>=async(prompt,_config,schema)=>{
      const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));stages.push(stage)
      const result=fixture.response(stage,data,schema) as any
      if(stage.startsWith('review-premise-')&&!rejected){
        rejected=true
        const value=result.units[0].response
        Object.assign(value,{verdict:'revise',repairScope:'setup',findings:[{severity:'major',targetId:data.units[0].data.prefix.id,message:'Synthetic premise requires a different initial hypothesis.',correction:'Rebuild the opening explicitly before constructing later turns.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}]})
      }
      return result
    }
    await expect(generateDeepGuide({...options,runner})).rejects.toThrow('Budget insufficiente')
    expect(stages).toHaveLength(5)
    expect(work.archive.value('guide','validated')).toBeUndefined()
    const grant={jobId:s.job.id,projectId:s.scope.projectId,dependencyHash:fixture.packet.basis.dependencyHash,maximum:24,reason:'Local synthetic test only; no external model.'}
    const guide=await generateDeepGuide({...options,callBudgetAuthorization:grant,runner})
    assertGuideReport({...fixture.packet.basis,guide});assertGuideIntegrity(guide)
    const repairIndex=stages.indexOf('segment-setup-repair')
    expect(repairIndex).toBeGreaterThan(stages.indexOf('review-premise-main'))
    expect(stages.slice(0,repairIndex).some(stage=>stage==='segments-main-opponent')).toBe(false)
    expect(stages.filter(stage=>stage==='segment-setup-repair')).toHaveLength(1)
    const construction=[...work.archive.values<any>('guide-segment-construction-v28')].at(-1)!.value
    expect(construction.mains[0].setup.opening.ours.hand[0]).toBe('p')
    expect(construction.mains[1].setup.opening.ours.hand[0]).toBe('e')
    expect([...work.archive.values('guide-setup-repair-v1')]).toHaveLength(1)
    expect(guide.generation.attempts.length).toBeLessThanOrEqual(24)
    const count=stages.length
    expect(await generateDeepGuide({...options,runner:async()=>{throw Error('Validated local recovery must not invoke a provider')}})).toEqual(guide)
    expect(stages).toHaveLength(count)
  }finally{work.close();s.archive.close();s.jobs.close();s.projects.close()}
},60000)
