import {beforeAll,afterAll,it,expect} from 'vitest'
import {mkdirSync,mkdtempSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {DatabaseSync,backup} from 'node:sqlite'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {constructGuideMainLines} from '../src/main/guide-mainline-phase'
import {constructGuideReplyPlans,constructGuideReplyBranches,type GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {createGuideReplyChoiceContext,guideReplyPlanChoiceRequest} from '../src/main/guide-reply-plan-choice'
import {guideHash} from '../src/main/matchup-guide-packet'
import {planGuideRequest} from '../src/main/guide-request-budget'
import {guideReplyRequirementLedger,guideReplyRequirementAssignments,assertGuideReplyRequirementRetention} from '../src/main/guide-reply-requirements'
import {constructGuideScenarioMetadata} from '../src/main/guide-scenario-metadata'
import {guideSegmentReviewRequest,readArchivedGuideSegmentReview} from '../src/main/guide-segment-review'
import {saveGuideSegmentReviewContext,assertGuideFinalReviewEvidence} from '../src/main/guide-segment-review-history'
import {guideReplyPlanRequest,readGuideReplyPlan,GUIDE_REPLY_MAX_OTHER} from '../src/main/guide-reply-plan'
import {readGuideContent} from '../src/shared/matchup-guide'
import {singleScenarioSchemaV27} from '../src/main/matchup-guide-schema'
import {assertNativeScenarioSchema} from '../src/main/guide-scenario-output-schema'
import {guideSegmentOriginals,readGuideSegmentOriginals,seedGuideSegmentRevision} from '../src/main/guide-segment-originals'
import {nativeRepairCase} from '../src/main/guide-native-repair'
let path:string,projects:ProjectStore,jobs:AiJobStore,archive:AiEvidenceArchive,options:GuideConstructionRuntime,main:any,before:any
beforeAll(async()=>{
 const root=resolve('.verify/app225-segments-20261102');mkdirSync(root,{recursive:true});path=join(mkdtempSync(join(root,'requirements-base-')),'data.sqlite');projects=new ProjectStore(path);jobs=new AiJobStore(path)
 const project=projects.create({name:'Independent requirement ancestry fixture',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic-requirements');archive=new AiEvidenceArchive(path,job)
 const fixture=syntheticSegmentProtocol(project.id),config={provider:'codex',model:'synthetic',source:'global',reasoningEffort:null},scope={projectId:project.id,jobId:job.id,dependencyHash:fixture.packet.basis.dependencyHash,configHash:guideHash({config,protocol:'segments-v28-1'})}
 options={scope,packet:fixture.packet,archive,call:async r=>r.read(fixture.response(r.stage,r.data,r.schema)),estimate:r=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],100,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>100,check:()=>{},reserveOutside:3}
 const initial=fixture.response('plan',{}, {}) as any,setup=(fixture.response('setup-1',{caseId:'scenario-1'}, {}) as any).caseSetup
 main=(await constructGuideMainLines({...options,setups:[{...setup,opening:initial.initialOpenings[0].opening}]}))[0].journal;before=(await constructGuideReplyPlans([main],options))[0]
},60000)
afterAll(()=>{archive?.close();jobs?.close();projects?.close()})
async function savedOriginals(plan:any,runtime:GuideConstructionRuntime,store:AiJobStore){
 const branches=await constructGuideReplyBranches([main],[plan],runtime),built=await constructGuideScenarioMetadata([main],[plan],branches,runtime),construction={mains:[main],plans:[plan],branches,built},basis=runtime.packet.basis,scopeHash=guideHash(basis)
 const report:any={...built[0].content,basis,ourList:runtime.packet.ourList,opponentLists:runtime.packet.opponentLists,sources:runtime.packet.sources,generation:{segmentOriginals:guideSegmentOriginals(construction,basis),scenarioOriginals:{formatVersion:1,scopeHash,cases:[nativeRepairCase(built[0].native,scopeHash)]}}}
 expect(readGuideSegmentOriginals(report)).toEqual(report.generation.segmentOriginals)
 const job=store.start('matchup-revise',runtime.scope.projectId,'independent-originals-reopen'),reopened=new AiEvidenceArchive(store.filePath,job)
 try{
  const options={...runtime,archive:reopened,scope:{...runtime.scope,jobId:job.id},call:async()=>{throw Error('No AI call or approval during original replay')}} as GuideConstructionRuntime,seeded=seedGuideSegmentRevision(report,options)!
  expect(seedGuideSegmentRevision(report,options)).toEqual(seeded)
  expect(seeded.construction.plans[0].others).toEqual(plan.others)
  for(const branch of branches)expect(seeded.construction.branches.find(b=>b.seed.id===branch.seed.id)!.journal.segments.map(s=>s.body)).toEqual(branch.journal.segments.map(s=>s.body))
  expect([...reopened.values('guide-segment-review-v1')]).toHaveLength(0)
 }finally{reopened.close();store.transition(job.id,'cancelled')}
}
it.each([false,true])('keeps original obligations across a new request and detects loss of an assigned witness (preserved: %s)',async preserve=>{
 const copy=join(mkdtempSync(join(resolve('.verify/app225-segments-20261102'),'requirements-copy-')),'data.sqlite'),source=new DatabaseSync(path,{readOnly:true});try{await backup(source,copy)}finally{source.close()}
 const store=new AiJobStore(copy),a=new AiEvidenceArchive(copy,store.get(options.scope.jobId)!),runtime={...options,archive:a}
 const choose=async(old:any,proposal:any,requirements:any[],initial=false,carry=false,rebind:string[]=[])=>{
  const branches=await constructGuideReplyBranches([main],[old],runtime),selection={scope:runtime.scope,packetHash:guideHash(runtime.packet),caseId:main.setup.id,mainHash:old.mainHash,before:old,requirements,...carry?{retained:guideReplyRequirementLedger(main,old,runtime)}:{}},key=guideHash(selection),need={kind:'needs-branches',caseId:main.setup.id,constructionHash:guideHash({main:main.segments[2].hash,branches:branches.map(b=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1)!.hash}))}),requirements}
  a.saveValue('guide-reply-plan-selection-v1',key,selection);a.saveValue('guide-metadata-needs-v1',guideHash(need),need)
  const context=createGuideReplyChoiceContext(key,old,proposal,requirements,branches,main,runtime),ids=[...new Set([...old.others,...proposal.others].map((s:any)=>s.id))]
  const decision={caseId:main.setup.id,contextHash:guideHash(context),choices:[...['direct','access','defend'].map(role=>({id:old[role].id,source:'previous',requirementIds:role==='direct'?rebind:[],reason:'Retain the independent baseline.'})),...ids.map(id=>{const proposed=proposal.others.find((s:any)=>s.id===id),previous=old.others.find((s:any)=>s.id===id),changed=!previous||guideHash(previous)!==guideHash(proposed);return {id,source:changed?'proposal':'previous',requirementIds:changed?requirements.map(guideHash):[],reason:changed?'Construct the newly assigned independent witness.':'Retain the earlier independent witness.',...initial&&changed?{forkAtTurn:0}:{}}})]}
  const result=guideReplyPlanChoiceRequest(context,main,runtime,0).read(decision)
  a.saveValue('guide-reply-plan-choice-context-v1',key,{hash:guideHash(context),context});a.saveValue('guide-reply-plan-choice-result-v1',key,{contextHash:guideHash(context),result});return result.plan
 }
 try{
  const r1={goal:'Compare a genuinely different first action.',reason:'A later opposing response does not replace this decision.',sourceIds:['card:p']},seed={id:'scenario-1-reply-extra-1',role:'other',intent:'attack',goal:'First independent witness.',sourceIds:['card:p']}
  const first=await choose(before,{...before,others:[seed]},[r1],true),old=guideReplyRequirementAssignments(main,first,runtime),original=structuredClone(old)
  expect(old.unassignedRequirementIds).toEqual([])
  if(preserve)await savedOriginals(first,runtime,store)
  const r2={goal:'Compare a second independent opposing response.',reason:'This new request adds a distinct obligation.',sourceIds:['card:p']},nextSeed={...seed,id:preserve?'scenario-1-reply-extra-2':seed.id,goal:'Second independent witness.'}
  const next=await choose(first,{...first,others:preserve?[...first.others,nextSeed]:[nextSeed]},[r2]),current=guideReplyRequirementAssignments(main,next,runtime)
  expect(current.ledger.requirements.map(r=>r.id).sort()).toEqual([guideHash(r1),guideHash(r2)].sort());expect(guideReplyRequirementAssignments(main,first,runtime)).toEqual(original)
  if(preserve){expect(current.unassignedRequirementIds).toEqual([]);expect(()=>assertGuideReplyRequirementRetention(old,current)).not.toThrow()}else{expect(current.unassignedRequirementIds).toEqual([guideHash(r1)]);expect(()=>assertGuideReplyRequirementRetention(old,current)).toThrow('perso')}
  if(preserve){
   const r3={goal:'Compare a third decision without silently dropping earlier ones.',reason:'Preservation is independently checked rather than assumed.',sourceIds:['card:p']},replacement={...seed,goal:'The third assigned independent witness.'},proposal={...next,others:[replacement,nextSeed]}
   await expect(choose(next,proposal,[r3],false,true)).rejects.toThrow('precedente perso')
   const retained=await choose(next,proposal,[r3],false,true,[guideHash(r1)]),assigned=guideReplyRequirementAssignments(main,retained,runtime)
   expect(assigned.unassignedRequirementIds).toEqual([])
   expect(assigned.assignments.find(a=>a.branchId===retained.direct.id)?.requirementIds).toContain(guideHash(r1))
   expect(()=>assertGuideReplyRequirementRetention(current,assigned)).not.toThrow()
   const branches=await constructGuideReplyBranches([main],[retained],runtime),built=await constructGuideScenarioMetadata([main],[retained],branches,runtime),construction={mains:[main],plans:[retained],branches,built},view=built[0].content
   const request=guideSegmentReviewRequest(view,construction,{...runtime,stage:'independent-obligation-review',task:'Check all original obligations.',scopeKind:'scenarios',withRetry:false}),data=request.data as any
   expect(request.cacheValidation.id).toBe('guide-segment-review-6');expect(data.constructionRequirements[0].ledger.requirements).toHaveLength(3)
   const requirementAudit=data.constructionRequirements.flatMap((c:any)=>c.ledger.requirements.map((r:any)=>({caseId:c.ledger.caseId,requirementId:r.id,disposition:'resolved',reason:'The synthetic critic independently checked the current source and complete witness.',sourceIds:['card:p'],witnesses:[c.witnesses[0]],currentFindingIndex:null})))
   const pass={verdict:'pass',findings:[],checks:['Independent synthetic coverage check.'],revalidatedIds:[],textCorrections:[],draftHash:data.draftHash,constructionHash:data.constructionHash,reviewContextHash:data.reviewContextHash,resolutionAudit:[],requirementAudit}
   expect(()=>request.read({...pass,requirementAudit:[]})).toThrow()
   const checked=request.read(pass),reviewKey=guideHash([main.setup.id,checked]);a.saveValue('guide-segment-review-v1',reviewKey,{unitId:main.setup.id,review:checked});saveGuideSegmentReviewContext(runtime,main.setup.id,checked,request)
   expect(()=>assertGuideFinalReviewEvidence([reviewKey],runtime)).not.toThrow()
   const negative=request.read({...pass,verdict:'revise',findings:[{severity:'major',targetId:main.setup.id,message:'Independent synthetic source finding.',correction:'Review the interpretation.',sourceIds:['card:p'],proposedActions:[],counterlines:[],repair:{kind:'reply-plan',caseId:main.setup.id,mainHash:retained.mainHash}}]}),negativeKey=guideHash([main.setup.id,negative])
   a.saveValue('guide-segment-review-v1',negativeKey,{unitId:main.setup.id,review:negative});saveGuideSegmentReviewContext(runtime,main.setup.id,negative,request)
   expect(readArchivedGuideSegmentReview(main.setup.id,negative,view,construction,runtime)).toEqual(negative)
  }
  expect(()=>guideReplyRequirementLedger(main,{...next,mainHash:'foreign'},runtime)).toThrow('linea principale')
  expect(()=>guideReplyRequirementLedger(main,next,{...runtime,scope:{...runtime.scope,projectId:'foreign'}})).toThrow()
 }finally{a.close();store.close()}
},120000)
it('grows repair capacity only for preserved requirements and carries every planned witness through projection and the versioned reader',async()=>{
 const others=Array.from({length:5},(_,i)=>({id:`scenario-1-reply-extra-${i+1}`,role:'other' as const,intent:'attack' as const,goal:'Independent bounded comparison '+i,sourceIds:['card:p']})),previous={...before,others},need={goal:'One additional independent comparison.',reason:'Keep the earlier comparisons while adding a witness.',sourceIds:['card:p']}
 const cold=guideReplyPlanRequest(main,options.scope,options.packet,0),coldSchema=cold.schema as any
 expect(coldSchema.properties.others.maxItems).toBe(5)
 const repair=guideReplyPlanRequest(main,options.scope,options.packet,0,archive,{previous,findings:[need],requireChange:true,retained:guideReplyRequirementLedger(main,previous,options)}),schema=repair.schema as any
 expect(schema.properties.others.maxItems).toBe(6)
 const six={...previous,others:[...others,{...others[0],id:'scenario-1-reply-extra-6',goal:'The newly requested comparison.'}]}
 expect(()=>cold.read(six)).toThrow();expect(repair.read(six)).toEqual(six);expect(readGuideReplyPlan(main,options.scope,options.packet,six)).toEqual(six)
 expect(()=>readGuideReplyPlan(main,options.scope,options.packet,{...six,others:[...six.others,{...others[0],id:`scenario-1-reply-extra-${GUIDE_REPLY_MAX_OTHER+1}`}]})).toThrow()
 const branches=await constructGuideReplyBranches([main],[six],options),built=(await constructGuideScenarioMetadata([main],[six],branches,options))[0]
 expect(built.content.scenarios[0].replyComparison!.options).toHaveLength(9)
 expect(readGuideContent(built.content,'matchup-guide-28')).toEqual(built.content)
 expect(()=>readGuideContent(built.content,'matchup-guide-27')).toThrow()
 expect(()=>assertNativeScenarioSchema(built.raw,singleScenarioSchemaV27(main.setup.id))).toThrow()
 await savedOriginals(six,options,jobs)
},60000)
