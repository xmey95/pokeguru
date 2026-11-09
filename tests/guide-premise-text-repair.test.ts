import {it,expect} from 'vitest'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {segmentFixture} from './fixtures/guide-segment'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {guideHash} from '../src/main/matchup-guide-packet'
import {createGuideSegments,appendGuideSegment} from '../src/main/guide-segments'
import {guidePremiseRequest,guideTurnDeclarationRequest,type SavedPremiseReview,type GuideSegmentRequest} from '../src/main/guide-segment-generation'
import {guidePremiseRepairRouteRequest,guidePremiseTextRepairRequest} from '../src/main/guide-premise-text-repair'
import {prepareGuideSegmentBatch} from '../src/main/guide-segment-batch'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {constructGuideMainLines} from '../src/main/guide-mainline-phase'
import {planGuideRequest} from '../src/main/guide-request-budget'
import {runGuideSegmentPhase} from '../src/main/guide-segment-scheduler'

function fixture(projectId='project-a',jobId='narrative-job',distinct=false){
 const protocol=syntheticSegmentProtocol(projectId,distinct),{turns,developmentPlan,...setup}=segmentFixture().scenario,packet=protocol.packet
 if(distinct){setup.opening.ours.active='our-basic';setup.positionAnnotations[0].printId='our-basic';setup.sourceIds.push('card:our-basic');setup.id='unseen-case'}
 const scope={projectId,jobId,dependencyHash:packet.basis.dependencyHash,configHash:'synthetic'},root=createGuideSegments(setup,scope,packet),turn=guideTurnDeclarationRequest(root,scope,packet,{reserveCalls:0}),batch=prepareGuideSegmentBatch([turn],{stage:'segments-main-ours',reserveCalls:0}),outcome=batch.request.read(protocol.response('segments-main-ours',batch.request.data,batch.request.schema)).outcomes[0]
 if(!outcome.accepted)throw Error(outcome.message)
 const prefix=appendGuideSegment(root,scope,packet,outcome.value.body,outcome.value.development),reviewer=guidePremiseRequest(prefix,scope,packet,0),review=reviewer.read({verdict:'revise',findings:[{severity:'major',targetId:setup.id,message:'Synthetic explanation is incomplete.',correction:'Explain the choice without changing actions.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}],checks:['Synthetic complete independent review'],revalidatedIds:[],textCorrections:[],reviewedHash:(reviewer.data as any).witnessContext.reviewedHash,repairScope:'first-turn'}),feedback:SavedPremiseReview={prefix,review},routing=guidePremiseRepairRouteRequest(feedback,scope,packet,0),route=routing.read({reviewHash:guideHash(feedback),prefixHash:guideHash(prefix),mode:'text',fields:['comparison'],reason:'All findings concern only the comparison.'}),request=guidePremiseTextRepairRequest(feedback,route,scope,packet,0),raw={caseId:setup.id,prefixHash:guideHash(prefix),reviewHash:guideHash(feedback),comparison:'The synthetic choice preserves resources, with an explicitly conditional continuation.'}
 return {protocol,packet,scope,root,prefix,feedback,routing,route,request,raw,setup}
}
it.each([false,true])('preserves exact native data and original bounds for distinct card bindings: %s',distinct=>{
 const f=fixture('project-a','narrative-job',distinct),before=guideHash(f.feedback),value=f.request.read(f.raw),schema=f.request.schema as any
 expect(schema.properties.comparison.maxLength).toBe(1600);expect(schema.properties.reason).toBeUndefined();expect(schema.properties.pivot).toBeUndefined();expect((f.request.data as any).originalTextLimits).toEqual({comparison:1600,reason:800,pivot:1500})
 expect(value.body.tactical.comparison).toBe(f.raw.comparison);expect(value.development).toEqual(f.prefix.segments[0].development)
 const body=structuredClone(value.body),old=structuredClone(f.prefix.segments[0].body);delete body.tactical.comparison;delete old.tactical.comparison;expect(body).toEqual(old)
 expect(()=>f.request.read({...f.raw,comparison:'x'.repeat(1601)})).toThrow();expect(()=>f.request.read({...f.raw,reason:'Changed without authorization'})).toThrow()
 expect(()=>f.request.read({...f.raw,prefixHash:'foreign'})).toThrow();expect(()=>f.request.read({...f.raw,extra:'field'})).toThrow()
 expect(()=>f.request.read({...f.raw,comparison:f.prefix.segments[0].body.tactical.comparison})).toThrow('senza modifiche')
 const tampered=structuredClone(value);tampered.body.tactical.cards.reverse();expect(()=>f.request.cacheValidation.validate(tampered)).toThrow('cache diversa')
 const other={...f.scope,jobId:'foreign'};expect(()=>guidePremiseTextRepairRequest(f.feedback,f.route,other,f.packet,0)).toThrow()
 const changedSources=structuredClone(f.packet);changedSources.sources[0].content+=' Changed source';expect(()=>guidePremiseTextRepairRequest(f.feedback,f.route,f.scope,changedSources,0)).toThrow()
 expect(guideHash(f.feedback)).toBe(before)
})
it('requires explicit routing of all findings and cannot turn routing into a pass or a text repair into a turn',()=>{
 const f=fixture(),full={...f.route,mode:'turn',fields:[]} as const
 expect(f.routing.read(full).mode).toBe('turn');expect(()=>guidePremiseTextRepairRequest(f.feedback,full as any,f.scope,f.packet,0)).toThrow('turno completo')
 for(const invalid of [{...f.route,fields:[]},{...f.route,fields:['comparison','comparison']},{...f.route,fields:['draw']},{...f.route,mode:'pass'},{...f.route,reviewHash:'foreign'},{...f.route,reason:' '}])expect(()=>f.routing.read(invalid)).toThrow()
 const changed=structuredClone(f.feedback);changed.review.findings[0].message='A second original criticism must remain in context.'
 expect(()=>guidePremiseTextRepairRequest(changed,f.route,f.scope,f.packet,0)).toThrow()
 const all=f.routing.read({...f.route,fields:['comparison','reason','pivot']}),request=guidePremiseTextRepairRequest(f.feedback,all,f.scope,f.packet,0)
 const allRaw={...f.raw,reason:f.prefix.segments[0].development.reason,pivot:f.prefix.segments[0].development.pivot};expect(()=>request.read({...allRaw,reason:'x'.repeat(801)})).toThrow();expect(()=>request.read({...allRaw,pivot:'x'.repeat(1501)})).toThrow()
 expect((request.data as any).feedback).toEqual(f.feedback)
})
it.each([['comparison'],['reason'],['pivot'],['comparison','reason'],['comparison','pivot'],['reason','pivot'],['comparison','reason','pivot']])('emits only the selected narrative subset %j and validates the complete immutable result',(...subset)=>{
 const f=fixture(),selected=subset as ('comparison'|'reason'|'pivot')[],route=f.routing.read({...f.route,fields:selected}),request=guidePremiseTextRepairRequest(f.feedback,route,f.scope,f.packet,0),schema=request.schema as any,texts={comparison:'A complete alternate explanation with a stated limit.',reason:'A complete reason for the frozen development.',pivot:'A conditional continuation from the frozen position.'}
 const raw={caseId:f.raw.caseId,prefixHash:f.raw.prefixHash,reviewHash:f.raw.reviewHash,...Object.fromEntries(selected.map(field=>[field,texts[field]]))},value=request.read(raw)
 expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(raw).sort());expect(schema.additionalProperties).toBe(false)
 expect(value.body.tactical.comparison).toBe(selected.includes('comparison')?texts.comparison:f.prefix.segments[0].body.tactical.comparison)
 for(const field of ['reason','pivot'] as const)expect(value.development[field]).toBe(selected.includes(field)?texts[field]:f.prefix.segments[0].development[field])
 request.cacheValidation.validate(value)
 const unselected=(['comparison','reason','pivot'] as const).find(field=>!selected.includes(field))
 if(unselected){expect(()=>request.read({...raw,[unselected]:'Not authorized'})).toThrow();const altered=structuredClone(value);if(unselected==='comparison')altered.body.tactical.comparison='Unauthorized cached explanation.';else altered.development[unselected]='Unauthorized cached explanation.';expect(()=>request.cacheValidation.validate(altered)).toThrow('cache diversa')}
 expect((request.data as any).prefix.developmentPlan.ours).toEqual(f.prefix.segments[0].development)
})
it.each(['before-text','before-review'])('persists mixed repairs and reserves every group across an interruption %s',async boundary=>{
 const parent=resolve('.verify/app225-segments-20261102');mkdirSync(parent,{recursive:true});const folder=mkdtempSync(join(parent,'narrative-integration-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path),project=projects.create({name:'Independent narrative integration',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic'),f=fixture(project.id,job.id),setups=[f.setup,{...f.setup,id:'physical-case'},{...f.setup,id:'accepted-sibling'}]
 let archive=new AiEvidenceArchive(path,job),left=30,interrupt=true
 const stages:{stage:string;ids:string[];reserve:number}[]=[]
 const call=async<T>(r:GuideSegmentRequest<T>):Promise<T>=>{
  const data=r.data as any,units=data.units,variants=(r.schema as any).properties.units.items.anyOf
  const atBoundary=boundary==='before-text'?units.some((u:any)=>u.data.protocol==='pg-premise-text-repair-2'):r.stage==='review-premise-main'&&units.every((u:any)=>u.data.prefix.id==='accepted-sibling'||u.data.prefix.turns.ours.draw==='p'||u.data.prefix.turns.ours.tactical.comparison.startsWith('Rewritten'))
  if(atBoundary&&interrupt){interrupt=false;throw Error('Synthetic interruption '+boundary)}
  stages.push({stage:r.stage,ids:units.map((u:any)=>u.data.prefix.id),reserve:r.reserveCalls});left--
  if(r.stage==='review-premise-repair-routing')return r.read({units:units.map((u:any)=>({unitId:u.unitId,response:{reviewHash:u.data.reviewHash,prefixHash:u.data.prefixHash,mode:u.data.prefix.id==='physical-case'?'turn':'text',fields:u.data.prefix.id==='physical-case'?[]:['comparison'],reason:'Explicit synthetic routing of every original finding.'}}))})
  if(r.stage==='review-premise-main')return r.read({units:units.map((u:any)=>{
   const p=u.data.prefix,negative=p.id!=='accepted-sibling'&&p.turns.ours.draw==='e'&&!p.turns.ours.tactical.comparison.startsWith('Rewritten')
   return {unitId:u.unitId,response:{verdict:negative?'revise':'pass',findings:negative?[{severity:'major',targetId:p.id,message:'Synthetic issue requiring explicit scope classification.',correction:p.id==='physical-case'?'Correct the declared draw.':'Complete the explanation only.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}]:[],checks:['Synthetic independent full premise review'],revalidatedIds:[],textCorrections:[],reviewedHash:u.data.witnessContext.reviewedHash,repairScope:negative?'first-turn':'none'}}
  })})
  if(units[0].data.protocol==='pg-premise-text-repair-2')return r.read({units:units.map((u:any)=>({unitId:u.unitId,response:{caseId:u.data.prefix.id,prefixHash:u.data.route.prefixHash,reviewHash:u.data.route.reviewHash,comparison:'Rewritten complete explanation; the frozen synthetic actions are unchanged.'}}))})
  const raw=f.protocol.response(r.stage,r.data,r.schema) as any
  for(const u of raw.units){const input=units.find((v:any)=>v.unitId===u.unitId),schema=variants.find((v:any)=>v.properties.unitId.const===u.unitId).properties.response;if(input.data.feedback&&input.data.prefix.id==='physical-case'&&schema.properties.phase.const==='ours')u.response.body.draw='p'}
  return r.read(raw)
 }
 const options=()=>({setups,scope:f.scope,packet:f.packet,archive,call,estimate:(r:GuideSegmentRequest<any>)=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],left,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>left,reserveOutside:2,check:()=>{}})
 try{
  await expect(constructGuideMainLines(options())).rejects.toThrow('Synthetic interruption '+boundary)
  const negatives=[...archive.values<any>('guide-premise-review-v1')].filter(r=>r.value.review.verdict!=='pass').map(r=>({key:r.key,hash:guideHash(r.value)}));expect(negatives).toHaveLength(2)
  const before=stages.length;archive.close();archive=new AiEvidenceArchive(path,job)
  const built=await constructGuideMainLines(options());expect(stages.slice(before).map(s=>s.stage)).toEqual([...(boundary==='before-text'?['segments-main-ours','segments-main-ours']:[]),'review-premise-main','segments-main-opponent','segments-main-next'])
  const repairs=stages.filter(s=>s.stage==='segments-main-ours').slice(1);expect(repairs.map(r=>r.ids)).toEqual([[f.setup.id],['physical-case']]);expect(repairs.map(r=>r.reserve)).toEqual([6,5]);expect(stages.filter(s=>s.stage==='review-premise-repair-routing')).toHaveLength(1)
  expect(built.every(b=>b.premise.verdict==='pass'&&b.journal.segments.length===3)).toBe(true)
  expect(built[0].journal.segments[0].body.draw).toBe('e');expect(built[1].journal.segments[0].body.draw).toBe('p');expect(built[2].journal.segments[0].body).toEqual(f.prefix.segments[0].body)
  for(const r of negatives)expect(guideHash(archive.value('guide-premise-review-v1',r.key))).toBe(r.hash)
  const count=stages.length;left=0;expect(await constructGuideMainLines(options())).toEqual(built);expect(stages).toHaveLength(count)
 }finally{archive.close();jobs.close();projects.close()}
},60000)
it('keeps the cross-project, source and role gates when separating constructor headers',async()=>{
 const f=fixture(),request=f.request,archive={saveValue:()=>{},values:function*<T>(){return;yield undefined as unknown as {key:string;value:T}}}
 for(const change of ['project','source','role']){
  const foreign={...request,data:structuredClone(request.data)}
  if(change==='role')foreign.role='critic';else if(change==='project')(foreign.data as any).packet.basis.projectId='foreign-project';else (foreign.data as any).packet.sources[0].content+='different source'
  let calls=0
  await expect(runGuideSegmentPhase([{id:'ours',request:()=>request,accept:()=>{}},{id:'foreign',request:()=>foreign,accept:()=>{}}],{stage:'segments-main-ours',archive,call:async()=>{calls++;throw Error('Unexpected dispatch')},estimate:r=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],16,r.reserveCalls).budget,isCached:()=>false,remainingCalls:()=>16,check:()=>{}})).rejects.toThrow('non mescolare')
  expect(calls).toBe(0)
 }
})
