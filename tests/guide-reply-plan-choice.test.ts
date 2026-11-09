import {beforeAll,afterAll,it,expect} from 'vitest'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {DatabaseSync,backup} from 'node:sqlite'
import {resolve,join} from 'node:path'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {constructGuideMainLines} from '../src/main/guide-mainline-phase'
import {constructGuideReplyPlans,constructGuideReplyBranches,readGuideReplyBranchSnapshots,type GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {guideHash} from '../src/main/matchup-guide-packet'
import {planGuideRequest} from '../src/main/guide-request-budget'
import {createGuideReplyChoiceContext,guideReplyPlanChoiceRequest,guideReplyPlanNativeReserve,guideReplyPlanChoiceNativeReserve} from '../src/main/guide-reply-plan-choice'
import {guideTurnDeclarationRequest} from '../src/main/guide-segment-generation'
import {forkGuideSegments} from '../src/main/guide-segments'
import {recordGuideOutputCapacity} from '../src/main/guide-output-capacity'
import {constructGuideScenarioEvaluations} from '../src/main/guide-scenario-evaluation'
import {guideReplyObjective} from '../src/main/guide-reply-objective'
import {guideReplyInitialRequest} from '../src/main/guide-reply-initial'
import {guideReplyTurnRequest} from '../src/main/guide-reply-phase'
let projects:ProjectStore,jobs:AiJobStore,archive:AiEvidenceArchive,fixture:ReturnType<typeof syntheticSegmentProtocol>,options:GuideConstructionRuntime,main:any,before:any,proposal:any,context:any,raw:any,branches:any[],fixturePath:string
beforeAll(async()=>{
 const root=resolve('.verify/app225-segments-20261102');mkdirSync(root,{recursive:true});const path=join(mkdtempSync(join(root,'choice-test-')),'data.sqlite')
 fixturePath=path
 projects=new ProjectStore(path);jobs=new AiJobStore(path);const project=projects.create({name:'Independent plan selection fixture',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'synthetic-plan-choice');archive=new AiEvidenceArchive(path,job);fixture=syntheticSegmentProtocol(project.id)
 const config={provider:'codex',model:'synthetic',source:'global',reasoningEffort:null},scope={projectId:project.id,jobId:job.id,dependencyHash:fixture.packet.basis.dependencyHash,configHash:guideHash({config,protocol:'segments-v28-1'})}
 options={scope,packet:fixture.packet,archive,call:async r=>r.read(fixture.response(r.stage,r.data,r.schema)),estimate:r=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],100,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>100,check:()=>{},reserveOutside:3}
 const initial=fixture.response('plan',{}, {}) as any,setup=(fixture.response('setup-1',{caseId:'scenario-1'}, {}) as any).caseSetup
 main=(await constructGuideMainLines({...options,setups:[{...setup,opening:initial.initialOpenings[0].opening}]}))[0].journal
 before=(await constructGuideReplyPlans([main],options))[0];branches=await constructGuideReplyBranches([main],[before],options)
 proposal={...structuredClone(before),direct:{...before.direct,goal:'A changed candidate that is not needed by the synthetic finding.'},others:[{id:'scenario-1-reply-extra-1',role:'other',intent:'attack',goal:'An additional required synthetic witness.',sourceIds:['card:p']}]}
 const requirements=[{goal:'Construct one additional independent witness.',reason:'The existing three branches do not contain this comparison.',sourceIds:['card:p']}],selection={scope,packetHash:guideHash(fixture.packet),caseId:main.setup.id,mainHash:before.mainHash,before,requirements},key=guideHash(selection)
 archive.saveValue('guide-reply-plan-selection-v1',key,selection);archive.saveValue('guide-reply-plan-selection-result-v1',key,{selectionHash:key,plan:proposal,planningProtocol:'initial-forks-1'})
 const need={kind:'needs-branches',caseId:main.setup.id,constructionHash:guideHash({main:main.segments[2].hash,branches:branches.map(b=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1)!.hash}))}),requirements}
 archive.saveValue('guide-metadata-needs-v1',guideHash(need),need)
 context=createGuideReplyChoiceContext(key,before,proposal,requirements,branches,main,options)
 raw={caseId:main.setup.id,contextHash:guideHash(context),choices:[before.direct,before.access,before.defend,proposal.others[0]].map(s=>({id:s.id,source:s.role==='other'?'proposal':'previous',requirementIds:s.role==='other'?requirements.map(guideHash):[],reason:'Explicit independent synthetic planning decision.'}))}
},60000)
afterAll(()=>{archive?.close();jobs?.close();projects?.close()})
it('retains exact old variants, selects only an AI-proposed addition and rejects cache or original-data mutation',()=>{
 expect(guideHash(readGuideReplyBranchSnapshots([main],[before],options))).toBe(guideHash(branches))
 const request=guideReplyPlanChoiceRequest(context,main,options,8),oldHash=guideHash(context),result=request.read(raw)
 expect(result.plan.direct).toEqual(before.direct);expect(result.plan.access).toEqual(before.access);expect(result.plan.defend).toEqual(before.defend);expect(result.plan.others).toEqual(proposal.others)
 expect(guideHash(context)).toBe(oldHash);request.cacheValidation.validate(result)
 expect(()=>request.cacheValidation.validate({...result,plan:{...result.plan,direct:proposal.direct}})).toThrow('cache')
 const tampered=structuredClone(context);tampered.branches[0].journal.segments[1].body.draw='foreign-card';expect(()=>guideReplyPlanChoiceRequest(tampered,main,options,0)).toThrow()
})
it('rejects duplicate IDs, foreign contexts, omitted existing variants and unaddressed original requirements',()=>{
 const request=guideReplyPlanChoiceRequest(context,main,options,0)
 expect(()=>request.read({...raw,contextHash:'other'})).toThrow()
 const duplicate=structuredClone(raw);duplicate.choices[1]=duplicate.choices[0];expect(()=>request.read(duplicate)).toThrow('duplicati')
 const omit=structuredClone(raw);omit.choices[0].source='omit';expect(()=>request.read(omit)).toThrow()
 const missing=structuredClone(raw);missing.choices.at(-1).requirementIds=[];expect(()=>request.read(missing)).toThrow()
 const noOp=structuredClone(raw);noOp.choices.at(-1).source='omit';noOp.choices.at(-1).requirementIds=[];expect(()=>request.read(noOp)).toThrow()
 expect(()=>guideReplyPlanChoiceRequest({...context,packetHash:'foreign'},main,options,0)).toThrow('estraneo')
})
it('adds an initial fork only through an explicit AI proposal choice, without rewriting its goal or sources',()=>{
 const request=guideReplyPlanChoiceRequest(context,main,options,0),decision=structuredClone(raw)
 decision.choices.at(-1).forkAtTurn=0
 const selected=request.read(decision),seed=selected.plan.others[0]
 expect(seed).toEqual({...proposal.others[0],forkAtTurn:0});expect(seed.goal).toBe(proposal.others[0].goal);expect(seed.sourceIds).toEqual(proposal.others[0].sourceIds)
 request.cacheValidation.validate(selected);expect(guideReplyPlanNativeReserve([main],[selected.plan],options)).toBe(4)
 const forged=structuredClone(decision);forged.choices[0].forkAtTurn=0;expect(()=>request.read(forged)).toThrow()
 expect(()=>request.cacheValidation.validate({...selected,plan:{...selected.plan,others:proposal.others}})).toThrow('cache')
})
it('carries the original assigned requirements and choice reason into execution and goal criticism without rewriting the seed',async()=>{
 const path=join(mkdtempSync(join(resolve('.verify/app225-segments-20261102'),'objective-context-')),'data.sqlite'),source=new DatabaseSync(fixturePath,{readOnly:true});try{await backup(source,path)}finally{source.close()}
 const j=new AiJobStore(path),a=new AiEvidenceArchive(path,j.get(options.scope.jobId)!)
 try{
  const runtime={...options,archive:a},decision=structuredClone(raw);decision.choices.at(-1).forkAtTurn=0
  const selected=guideReplyPlanChoiceRequest(context,main,runtime,0).read(decision),seed=selected.plan.others[0],key=context.selectionHash
  a.saveValue('guide-reply-plan-choice-context-v1',key,{hash:guideHash(context),context});a.saveValue('guide-reply-plan-choice-result-v1',key,{contextHash:guideHash(context),result:selected})
  const objective=guideReplyObjective(seed,main,runtime),original=structuredClone(seed)
  expect(objective.requirements).toEqual(context.requirements.map((r:any)=>({id:guideHash(r),...r})));expect(objective.assignments[0].reason).toBe(decision.choices.at(-1).reason);expect(seed).toEqual(original)
  const state={caseId:main.setup.id,seed,line:{id:'synthetic-objective'},journal:forkGuideSegments(main,options.scope,options.packet,0),main,terminal:false},turn=guideReplyTurnRequest(state as any,runtime),review=guideReplyInitialRequest(seed,main,runtime,0)
  expect((turn.data as any).branchAssignment).toEqual(objective);expect((review.data as any).branchObjective.requirements).toEqual(objective.requirements);expect((review.data as any).branchObjective.assignments).toEqual(objective.assignments)
  const foreign={...runtime,archive:{...a,id:a.id,projectId:a.projectId,values:a.values.bind(a),value:(role:string,k:string)=>{const value=a.value<any>(role,k);return role==='guide-reply-plan-choice-context-v1'?{...value,context:{...value.context,scope:{...value.context.scope,projectId:'foreign'}}}:value}}} as any
  expect(()=>guideReplyObjective(seed,main,foreign)).toThrow('contesto di assegnazione alterato')
  expect(a.value('guide-reply-plan-choice-result-v1',key)).toEqual({contextHash:guideHash(context),result:selected})
 }finally{a.close();j.close()}
},60000)
it.each(['access','defend'] as const)('keeps the assigned original objective explicit when adding the %s turn contract',async role=>{
 const path=join(mkdtempSync(join(resolve('.verify/app225-segments-20261102'),'objective-role-')),'data.sqlite'),source=new DatabaseSync(fixturePath,{readOnly:true});try{await backup(source,path)}finally{source.close()}
 const j=new AiJobStore(path),a=new AiEvidenceArchive(path,j.get(options.scope.jobId)!)
 try{
  const runtime={...options,archive:a},requirements=[{goal:'Execute the original independent source condition in this response.',reason:'The role contract must not replace the assigned condition.',sourceIds:['card:p']}],next={...structuredClone(before),[role]:{...before[role],goal:'An explicit newly assigned synthetic '+role+' witness.'}},selection={scope:options.scope,packetHash:guideHash(options.packet),caseId:main.setup.id,mainHash:before.mainHash,before,requirements},key=guideHash(selection),need={kind:'needs-branches',caseId:main.setup.id,constructionHash:guideHash({main:main.segments[2].hash,branches:branches.map(b=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1)!.hash}))}),requirements}
  a.saveValue('guide-reply-plan-selection-v1',key,selection);a.saveValue('guide-metadata-needs-v1',guideHash(need),need)
  const assigned=createGuideReplyChoiceContext(key,before,next,requirements,branches,main,runtime),decision={caseId:main.setup.id,contextHash:guideHash(assigned),choices:['direct','access','defend'].map(r=>({id:before[r].id,source:r===role?'proposal':'previous',requirementIds:r===role?requirements.map(guideHash):[],reason:'Execute the complete assigned condition alongside the role-specific contract.'}))},selected=guideReplyPlanChoiceRequest(assigned,main,runtime,0).read(decision)
  a.saveValue('guide-reply-plan-choice-context-v1',key,{hash:guideHash(assigned),context:assigned});a.saveValue('guide-reply-plan-choice-result-v1',key,{contextHash:guideHash(assigned),result:selected})
  const state={caseId:main.setup.id,seed:selected.plan[role],line:{id:'independent-assigned-'+role},journal:forkGuideSegments(main,options.scope,options.packet,1),main,terminal:false},request=guideReplyTurnRequest(state as any,runtime),data=request.data as any
  expect(data.branchAssignment.requirements).toEqual(requirements.map(r=>({id:guideHash(r),...r})))
  expect(request.task).toContain('branchAssignment.requirements');expect(request.task).toContain(role==='access'?'CONTRATTO ACCESSO':'DIFESA ESEGUITA')
  expect(request.instructions).toContain('registro');expect(request.schema).toEqual(guideTurnDeclarationRequest(state.journal,options.scope,options.packet,{reserveCalls:request.reserveCalls}).schema)
 }finally{a.close();j.close()}
},60000)
it('supplies the exact same-phase selected baseline with both receipts, without changing the current prefix or accepting foreign references',async()=>{
 const path=join(mkdtempSync(join(resolve('.verify/app225-segments-20261102'),'reference-turn-')),'data.sqlite'),source=new DatabaseSync(fixturePath,{readOnly:true});try{await backup(source,path)}finally{source.close()}
 const j=new AiJobStore(path),a=new AiEvidenceArchive(path,j.get(options.scope.jobId)!)
 try{
  const runtime={...options,archive:a},request=guideReplyPlanChoiceRequest(context,main,runtime,0),decision=structuredClone(raw);decision.choices.at(-1).referenceBranchIds=[before.defend.id]
  for(const variant of (request.schema as any).properties.choices.items.anyOf)expect([...variant.required].sort()).toEqual(Object.keys(variant.properties).sort())
  const selected=request.read(decision),seed=selected.plan.others[0],key=context.selectionHash
  a.saveValue('guide-reply-plan-choice-context-v1',key,{hash:guideHash(context),context});a.saveValue('guide-reply-plan-choice-result-v1',key,{contextHash:guideHash(context),result:selected})
  const state:any={caseId:main.setup.id,seed,line:{id:'independent-reference'},journal:forkGuideSegments(main,options.scope,options.packet,1),main,terminal:false},prefixHash=guideHash(state.journal),turn=guideReplyTurnRequest(state,runtime,0,selected.plan),reference=(turn.data as any).referenceTurns,baseline=branches.find(b=>b.seed.id===before.defend.id)!
  expect(reference.turns).toHaveLength(1);expect(reference.turns[0]).toMatchObject({branchId:before.defend.id,phase:'opponent',beforeReceipt:baseline.journal.segments[0].receipt,body:baseline.journal.segments[1].body,development:baseline.journal.segments[1].development,receipt:baseline.journal.segments[1].receipt})
  expect(turn.task).toContain('RIFERIMENTI DI CONFRONTO');expect(turn.schema).toEqual(guideReplyTurnRequest(state,runtime).schema);expect(guideHash(state.journal)).toBe(prefixHash)
  reference.turns[0].body.draw='mutated-returned-copy'
  expect((guideReplyTurnRequest(state,runtime,0,selected.plan).data as any).referenceTurns.turns[0].body).toEqual(baseline.journal.segments[1].body)
  const foreign=structuredClone(decision);foreign.choices.at(-1).referenceBranchIds=['foreign-branch'];expect(()=>request.read(foreign)).toThrow()
  const duplicate=structuredClone(decision);duplicate.choices.at(-1).referenceBranchIds=[before.defend.id,before.defend.id];expect(()=>request.read(duplicate)).toThrow('duplicati')
  expect(()=>guideReplyTurnRequest(state,{...runtime,scope:{...runtime.scope,projectId:'foreign'}},0,selected.plan)).toThrow()
 }finally{a.close();j.close()}
},60000)
it('upgrades an unadopted historical proposal through AI without overwriting its plan or old choice context',async()=>{
 const path=join(mkdtempSync(join(resolve('.verify/app225-segments-20261102'),'legacy-plan-upgrade-')),'data.sqlite'),source=new DatabaseSync(fixturePath,{readOnly:true})
 try{await backup(source,path)}finally{source.close()}
 // Prepare a historical-format synthetic archive on this disposable copy only.
 const fixtureDb=new DatabaseSync(path);try{fixtureDb.prepare('DELETE FROM ai_evidence_values WHERE job_id = ? AND role = ? AND key = ?').run(options.scope.jobId,'guide-reply-plan-selection-result-v1',context.selectionHash)}finally{fixtureDb.close()}
 const j=new AiJobStore(path),a=new AiEvidenceArchive(path,j.get(options.scope.jobId)!),key=context.selectionHash,original={selectionHash:key,plan:proposal},oldContext={hash:guideHash(context),context},stages:string[]=[]
 try{
  a.saveValue('guide-reply-plan-selection-result-v1',key,original);a.saveValue('guide-reply-plan-choice-context-v1',key,oldContext)
  const runtime={...options,archive:a,call:async<T>(r:any):Promise<T>=>{stages.push(r.stage);return r.read(fixture.response(r.stage,r.data,r.schema))}}
  const result=await constructGuideScenarioEvaluations([main],[before],runtime)
  expect(stages).toEqual(['branch-plan-upgrades','branch-plan-choices','segments-reply-ours','review-premise-replies','segments-reply-opponent','segments-reply-next','metadata-cases'])
  expect(result.plans[0].others[0].forkAtTurn).toBe(0);expect(result.built).toHaveLength(1)
  expect(a.value('guide-reply-plan-selection-result-v1',key)).toEqual(original);expect(a.value('guide-reply-plan-choice-context-v1',key)).toEqual(oldContext)
  expect(a.value('guide-reply-plan-initial-fork-upgrade-v1',key)).toMatchObject({selectionHash:key,originalProposalHash:guideHash(proposal)})
  const again=await constructGuideScenarioEvaluations([main],[before],{...runtime,call:async()=>{throw Error('No paid upgrade or construction twice')}});expect(again).toEqual(result)
 }finally{a.close();j.close()}
},60000)
it('counts only uncached native turns at their real checkpoint boundary, without writing checkpoints',()=>{
 const native=guideTurnDeclarationRequest(forkGuideSegments(main,options.scope,options.packet,1),options.scope,options.packet,{reserveCalls:0});recordGuideOutputCapacity([native,native],archive)
 const count=[...archive.values('guide-segment-checkpoint-v2')].length,selected=guideReplyPlanChoiceRequest(context,main,options,0).read(raw).plan
 expect(guideReplyPlanNativeReserve([main],[before],options)).toBe(0)
 expect(guideReplyPlanNativeReserve([main],[proposal],options)).toBe(4)
 expect(guideReplyPlanNativeReserve([main],[selected],options)).toBe(2)
 expect(guideReplyPlanChoiceNativeReserve([main],[before],[context],options)).toBe(2)
 expect([...archive.values('guide-segment-checkpoint-v2')]).toHaveLength(count)
})
it.each([false,true])('funds planning at a partial ceiling and rechecks the actual native work before building (full proposal=%s)',async full=>{
 const root=resolve('.verify/app225-segments-20261102'),path=join(mkdtempSync(join(root,'choice-budget-')),'data.sqlite'),source=new DatabaseSync(fixturePath,{readOnly:true})
 try{await backup(source,path)}finally{source.close()}
 const copyJobs=new AiJobStore(path),copy=new AiEvidenceArchive(path,copyJobs.get(options.scope.jobId)!),stages:string[]=[],oldRows=[...copy.values('guide-segment-checkpoint-v2')];let remaining=7
 const runtime:GuideConstructionRuntime={...options,archive:copy,remainingCalls:()=>remaining,estimate:r=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],remaining,r.reserveCalls,r.units).budget,call:async<T>(r:any):Promise<T>=>{
  stages.push(r.stage);remaining--
  if(r.stage==='branch-plan-choices'){
   const decision=structuredClone(raw)
   if(full){decision.choices[0].source='proposal';decision.choices[0].requirementIds=[...decision.choices.at(-1).requirementIds]}
   return r.read({units:r.data.units.map((u:any)=>({unitId:u.unitId,response:decision}))})
  }
  return r.read(fixture.response(r.stage,r.data,r.schema))
 }}
 try{
  if(full){
   await expect(constructGuideScenarioEvaluations([main],[before],runtime)).rejects.toMatchObject({code:'call-budget',budget:{remainingCalls:6,requiredCalls:8}})
   expect(stages).toEqual(['branch-plan-choices']);expect(remaining).toBe(6)
  }else{
   const result=await constructGuideScenarioEvaluations([main],[before],runtime)
   expect(result.built).toHaveLength(1);expect(stages).toEqual(['branch-plan-choices','segments-reply-opponent','segments-reply-next','metadata-cases']);expect(remaining).toBe(3)
  }
  for(const row of oldRows)expect(copy.value('guide-segment-checkpoint-v2',row.key)).toEqual(row.value)
 }finally{copy.close();copyJobs.close()}
},60000)
it('recomputes known construction costs after a planning group before paying another case',async()=>{
 const root=resolve('.verify/app225-segments-20261102'),path=join(mkdtempSync(join(root,'choice-groups-')),'data.sqlite'),source=new DatabaseSync(fixturePath,{readOnly:true})
 try{await backup(source,path)}finally{source.close()}
 const copyJobs=new AiJobStore(path),copy=new AiEvidenceArchive(path,copyJobs.get(options.scope.jobId)!)
 try{
  const base={...options,archive:copy},initial=fixture.response('plan',{}, {}) as any,setup=(fixture.response('setup-2',{caseId:'scenario-2'}, {}) as any).caseSetup
  const runtime={...base,call:async<T>(r:any):Promise<T>=>r.read(fixture.response(r.stage,r.data,r.schema))}
  const second=(await constructGuideMainLines({...runtime,setups:[{...setup,opening:initial.initialOpenings[1].opening}]}))[0].journal,secondPlan=(await constructGuideReplyPlans([second],runtime))[0],secondBranches=await constructGuideReplyBranches([second],[secondPlan],runtime)
  const proposed={...structuredClone(secondPlan),direct:{...secondPlan.direct,goal:'A second explicit synthetic proposed variant.'},others:[{id:'scenario-2-reply-extra-1',role:'other',intent:'attack',goal:'A second synthetic required witness.',sourceIds:['card:p']}]},requirements=context.requirements,selection={scope:options.scope,packetHash:guideHash(fixture.packet),caseId:second.setup.id,mainHash:secondPlan.mainHash,before:secondPlan,requirements},key=guideHash(selection)
  copy.saveValue('guide-reply-plan-selection-v1',key,selection);copy.saveValue('guide-reply-plan-selection-result-v1',key,{selectionHash:key,plan:proposed,planningProtocol:'initial-forks-1'})
  const need={kind:'needs-branches',caseId:second.setup.id,constructionHash:guideHash({main:second.segments[2].hash,branches:secondBranches.map(b=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1)!.hash}))}),requirements};copy.saveValue('guide-metadata-needs-v1',guideHash(need),need)
  let remaining=11;const stages:string[]=[]
  const measured={...runtime,remainingCalls:()=>remaining,estimate:(r:any)=>{const p=planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],remaining,r.reserveCalls,r.units).budget;return r.units>1?{...p,estimatedInput:200000,fits:false,fitsTarget:false}:p},call:async<T>(r:any):Promise<T>=>{remaining--;stages.push(r.stage);return r.read(fixture.response(r.stage,r.data,r.schema))}}
  await expect(constructGuideScenarioEvaluations([main,second],[before,secondPlan],measured)).rejects.toMatchObject({code:'call-budget',budget:{remainingCalls:10,requiredCalls:12}})
  expect(stages).toEqual(['branch-plan-choices']);expect([...copy.values('guide-reply-plan-choice-result-v1')]).toHaveLength(1)
 }finally{copy.close();copyJobs.close()}
},60000)
it('integrates an explicit partial choice, builds only its new branch and resumes the same selection without calls',async()=>{
 const stages:string[]=[],runtime={...options,call:async<T>(r:any):Promise<T>=>{stages.push(r.stage);if(r.stage==='branch-plan-choices')return r.read({units:r.data.units.map((u:any)=>({unitId:u.unitId,response:raw}))});return r.read(fixture.response(r.stage,r.data,r.schema))}}
 const original=branches.map(b=>guideHash(b.journal)),result=await constructGuideScenarioEvaluations([main],[before],runtime)
 expect(stages).toEqual(['branch-plan-choices','segments-reply-opponent','segments-reply-next','metadata-cases'])
 expect(result.plans[0].direct).toEqual(before.direct);expect(result.branches.filter(b=>b.seed.role!=='other').map(b=>guideHash(b.journal))).toEqual(original)
 expect(result.built).toHaveLength(1)
 const again=await constructGuideScenarioEvaluations([main],[before],{...runtime,call:async()=>{throw Error('No provider calls on complete resume')}})
 expect(again).toEqual(result)
},45000)
