import {beforeAll,afterAll,it,expect} from 'vitest'
import {mkdirSync,mkdtempSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {DatabaseSync,backup} from 'node:sqlite'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {constructGuideMainLines} from '../src/main/guide-mainline-phase'
import {constructGuideReplyPlans,constructGuideReplyBranches,guideReplyTurnRequest,readGuideReplyBranchSnapshots,type GuideConstructionRuntime} from '../src/main/guide-reply-phase'
import {guideReplyPlanRequest,guideReplyFork,type GuideReplyPlan} from '../src/main/guide-reply-plan'
import {guideReplyPlanNativeReserve} from '../src/main/guide-reply-plan-choice'
import {guideScenarioMetadataRequest} from '../src/main/guide-scenario-metadata'
import {prepareGuideSegmentBatch,callGuideSegmentBatch} from '../src/main/guide-segment-batch'
import {forkGuideSegmentCheckpoint,loadGuideSegmentCheckpoint,guideSegmentCheckpointFeedback,saveGuideSegmentCheckpoint} from '../src/main/guide-segment-checkpoints'
import {guideHash,packetHash,guideSource} from '../src/main/matchup-guide-packet'
import {planGuideRequest} from '../src/main/guide-request-budget'
import {projectGuideLedger} from '../src/shared/guide-ledger-projection'
import {guideReplyInitialRequest,guideReplyInitialReview,guideReplyLegacyInitialReview} from '../src/main/guide-reply-initial'
import {guidePremiseRequest} from '../src/main/guide-segment-generation'
import {appendGuideSegment} from '../src/main/guide-segments'
import {GuidePremiseSetupRejected} from '../src/main/guide-segment-generation'
import {guideSetupRepairRequest} from '../src/main/guide-setup-repair'
import {constructGuideScenarioEvaluations} from '../src/main/guide-scenario-evaluation'

const root=resolve('.verify/app225-segments-20261102')
let projects:ProjectStore,jobs:AiJobStore,archive:AiEvidenceArchive,path:string,fixture:ReturnType<typeof syntheticSegmentProtocol>,options:GuideConstructionRuntime,main:any,plan:GuideReplyPlan,oldBranches:any[]
beforeAll(async()=>{
 mkdirSync(root,{recursive:true});path=join(mkdtempSync(join(root,'initial-fork-base-')),'data.sqlite');projects=new ProjectStore(path);jobs=new AiJobStore(path)
 const project=projects.create({name:'Independent initial-decision branch fixture',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'independent-initial-fork');archive=new AiEvidenceArchive(path,job);fixture=syntheticSegmentProtocol(project.id)
 const scope={projectId:project.id,jobId:job.id,dependencyHash:fixture.packet.basis.dependencyHash,configHash:'independent-initial-fork'}
 options={scope,packet:fixture.packet,archive,call:async r=>r.read(fixture.response(r.stage,r.data,r.schema)),estimate:r=>planGuideRequest(r.stage,r.instructions,r.data,r.schema,[],100,r.reserveCalls,r.units).budget,isCached:()=>false,remainingCalls:()=>100,reserveOutside:3,check:()=>{}}
 const initial=fixture.response('plan',{}, {}) as any,setup=(fixture.response('setup-1',{caseId:'scenario-1'}, {}) as any).caseSetup
 main=(await constructGuideMainLines({...options,setups:[{...setup,opening:initial.initialOpenings[0].opening}]}))[0].journal
 plan=(await constructGuideReplyPlans([main],options))[0];oldBranches=await constructGuideReplyBranches([main],[plan],options)
},60000)
afterAll(()=>{archive?.close();jobs?.close();projects?.close()})
function alternative():GuideReplyPlan{return {...structuredClone(plan),others:[{id:'scenario-1-reply-extra-1',role:'other',intent:'attack',goal:'Use the printed Insight ability in our initial decision, then complete both later turns.',sourceIds:['card:p'],forkAtTurn:0}]}}
function initialResponse(r:any){
 return fixture.response(r.stage,r.data,r.schema) as any
}
async function copy(){
 const copied=join(mkdtempSync(join(root,'initial-fork-copy-')),'data.sqlite'),source=new DatabaseSync(path,{readOnly:true});try{await backup(source,copied)}finally{source.close()}
 const copyJobs=new AiJobStore(copied),copyArchive=new AiEvidenceArchive(copied,copyJobs.get(options.scope.jobId)!)
 const stages:string[]=[],runtime={...options,archive:copyArchive,call:async<T>(r:any):Promise<T>=>{stages.push(r.stage);return r.read(initialResponse(r))}}
 return {runtime,stages,archive:copyArchive,path:copied,close:()=>{copyArchive.close();copyJobs.close()}}
}
it('requires an explicit other fork, preserves old plans and rejects changing the timing of mandatory response roles',()=>{
 const request=guideReplyPlanRequest(main,options.scope,options.packet,0)
 expect(request.read(alternative()).others[0].forkAtTurn).toBe(0);expect(request.read(plan)).toEqual(plan);expect(guideReplyFork(plan.direct)).toBe(1)
 expect(()=>request.read({...plan,direct:{...plan.direct,forkAtTurn:0}})).toThrow()
})
it('builds and independently reviews a changed initial decision, assembles its full three turns and reopens without new calls',async()=>{
 const c=await copy(),p=alternative(),before=guideHash(main),old=oldBranches.map(b=>guideHash(b.journal))
 try{
  expect(guideReplyPlanNativeReserve([main],[p],c.runtime)).toBe(4)
  const branches=await constructGuideReplyBranches([main],[p],c.runtime),b=branches.find(b=>b.seed.id===p.others[0].id)!
  expect(c.stages).toEqual(['segments-reply-ours','review-premise-replies','segments-reply-opponent','segments-reply-next'])
  expect(b.journal.segments).toHaveLength(3);expect(b.journal.segments[0].body.draw).toEqual(main.segments[0].body.draw)
  expect(b.journal.segments[0].body.events).not.toEqual(main.segments[0].body.events)
  const reviewed=guideReplyInitialReview(b.seed,b.journal,c.runtime)!,goalRequest=guideReplyInitialRequest(b.seed,b.journal,c.runtime,0)
  expect((goalRequest.data as any).branchObjective.seed.goal).toBe(b.seed.goal);expect((goalRequest.data as any).branchObjective.seedHash).toBe(guideHash(b.seed));expect(reviewed.goalEvaluation.goalHash).toBe((goalRequest.data as any).branchObjective.goalHash)
  expect(()=>goalRequest.read({...reviewed,goalEvaluation:{...reviewed.goalEvaluation,firstTurnSatisfied:false}})).toThrow('obiettivo iniziale non eseguito')
  expect(()=>goalRequest.read({...reviewed,goalEvaluation:{...reviewed.goalEvaluation,goalHash:'foreign'}})).toThrow()
  expect(()=>goalRequest.read({...reviewed,goalEvaluation:{...reviewed.goalEvaluation,eventIndexes:[999]}})).toThrow()
  expect(guideReplyInitialReview({...b.seed,goal:'Another independent first-turn objective.'},b.journal,c.runtime)).toBeUndefined()
  expect(branches.filter(b=>b.seed.role!=='other').map(b=>guideHash(b.journal))).toEqual(old);expect(guideHash(main)).toBe(before)
  const metadata=guideScenarioMetadataRequest(main,p,branches,c.runtime)
  const built=await callGuideSegmentBatch([metadata.request],{stage:'metadata-cases',reserveCalls:metadata.request.reserveCalls,archive:c.archive,call:c.runtime.call})
  expect(built.outcomes[0].accepted).toBe(true)
  const outcome=built.outcomes[0];if(!outcome.accepted)throw Error(outcome.message)
  const declaration=outcome.value as any,raw=metadata.build(declaration).raw as any,option=raw.scenarios[0].replyComparison.options.find((o:any)=>o.id===p.others[0].id)
  expect(option.forkAtEvent).toBe(0);expect(option.turns.ours).toEqual(b.journal.segments[0].body)
  const bad=structuredClone(declaration);bad.metadata.replyComparison.minimumReplyId=p.others[0].id;expect(()=>metadata.build(bad)).toThrow('mossa principale')
  const forged=structuredClone(raw);const alt=forged.scenarios[0].replyComparison.options.find((o:any)=>o.id===p.others[0].id);alt.turns.opponent={terminal:true};alt.turns.next={terminal:true}
  expect(()=>projectGuideLedger(forged,options.packet)).toThrow('terminale')
  expect(guideReplyPlanNativeReserve([main],[p],c.runtime)).toBe(0)
  const again=await constructGuideReplyBranches([main],[p],{...c.runtime,call:async()=>{throw Error('No new calls on resume')}});expect(again.map(b=>b.journal)).toEqual(branches.map(b=>b.journal))
 }finally{c.close()}
},60000)

// Simulate the historical protocol on disposable data: it reviewed only the
// premise, then built two later turns without seeing the assigned objective.
async function legacyInitial(c:Awaited<ReturnType<typeof copy>>,reviewed=true){
 const p=alternative(),seed=p.others[0],fork=forkGuideSegmentCheckpoint(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,'reply-'+guideHash(seed),0),state={caseId:main.setup.id,seed,line:fork.line,journal:fork.journal,main,terminal:false}
 for(let phase=0;phase<3;phase++){
  const request=guideReplyTurnRequest(state,c.runtime),out=await callGuideSegmentBatch([request],{stage:'segments-reply-'+['ours','opponent','next'][phase],reserveCalls:request.reserveCalls,archive:c.archive,call:c.runtime.call}),o=out.outcomes[0]
  if(!o.accepted)throw Error(o.message);const v=o.value as any;state.journal=appendGuideSegment(state.journal,options.scope,options.packet,v.body,v.development);saveGuideSegmentCheckpoint(c.archive,options.scope,options.packet,state.journal,null,state.line)
  if(phase===0&&reviewed){const old=guidePremiseRequest(state.journal,options.scope,options.packet,0,c.archive),r=await callGuideSegmentBatch([old],{stage:'review-premise-replies',reserveCalls:old.reserveCalls,archive:c.archive,call:c.runtime.call});expect(r.outcomes[0].accepted).toBe(true)}
 }
 c.stages.length=0;return {p,state}
}
it('requires a goal-bound review of an already complete historical branch and preserves its paid turns when it passes',async()=>{
 const c=await copy()
 try{
  const {p,state}=await legacyInitial(c),before=guideHash(state.journal)
  expect(guideReplyLegacyInitialReview(state.journal,c.runtime)?.verdict).toBe('pass');expect(guideReplyInitialReview(state.seed,state.journal,c.runtime)).toBeUndefined();expect(guideReplyPlanNativeReserve([main],[p],c.runtime)).toBe(1)
  expect(()=>guideScenarioMetadataRequest(main,p,[...oldBranches,state],c.runtime)).toThrow('obiettivo')
  const built=await constructGuideReplyBranches([main],[p],c.runtime),b=built.find(b=>b.seed.role==='other')!
  expect(c.stages).toEqual(['review-premise-replies']);expect(guideHash(b.journal)).toBe(before);expect(guideReplyPlanNativeReserve([main],[p],c.runtime)).toBe(0)
  const again=await constructGuideReplyBranches([main],[p],{...c.runtime,call:async()=>{throw Error('No paid goal review or native turn twice')}});expect(again).toEqual(built)
 }finally{c.close()}
},60000)
it('reads legacy branches for planning without calls or writes, then performs the mandatory goal migration only during execution',async()=>{
 const c=await copy()
 try{
  const {p,state}=await legacyInitial(c),count=[...c.archive.values('guide-segment-checkpoint-v2')].length,branches=readGuideReplyBranchSnapshots([main],[p],c.runtime),original=guideHash(state.journal)
  expect(c.stages).toEqual([]);expect([...c.archive.values('guide-segment-checkpoint-v2')]).toHaveLength(count);expect(guideReplyInitialReview(state.seed,state.journal,c.runtime)).toBeUndefined()
  const requirements=[{goal:'Construct another independent follow-up witness.',reason:'The completed historical branches do not execute this comparison.',sourceIds:['card:p']}],selection={scope:options.scope,packetHash:guideHash(options.packet),caseId:main.setup.id,mainHash:p.mainHash,before:p,requirements},key=guideHash(selection),proposal={...p,others:[...p.others,{id:'scenario-1-reply-extra-2',role:'other',intent:'attack',goal:'One additional synthetic comparison witness.',sourceIds:['card:p']}]}
  c.archive.saveValue('guide-reply-plan-selection-v1',key,selection);c.archive.saveValue('guide-reply-plan-selection-result-v1',key,{selectionHash:key,plan:proposal,planningProtocol:'initial-forks-1'})
  const need={kind:'needs-branches',caseId:main.setup.id,constructionHash:guideHash({main:main.segments[2].hash,branches:branches.map(b=>({seed:b.seed,line:b.line,head:b.journal.segments.at(-1)!.hash}))}),requirements};c.archive.saveValue('guide-metadata-needs-v1',guideHash(need),need)
  const result=await constructGuideScenarioEvaluations([main],[p],c.runtime)
  expect(c.stages).toEqual(['branch-plan-choices','review-premise-replies','segments-reply-opponent','segments-reply-next','metadata-cases']);expect(result.built).toHaveLength(1)
  expect(guideHash(result.branches.find(b=>b.seed.id===state.seed.id)!.journal)).toBe(original);expect(guideReplyInitialReview(state.seed,state.journal,c.runtime)?.verdict).toBe('pass')
  const snapshot=c.archive.value<any>('guide-reply-plan-choice-context-v1',key)!.context.branches.find((b:any)=>b.seed.id===state.seed.id);expect(guideHash(snapshot.journal)).toBe(original)
 }finally{c.close()}
},60000)
it('rejects an unmet goal before reusing a historical continuation and persists scoped feedback before any repair',async()=>{
 const c=await copy();let rejected=false
 try{
  const {p,state}=await legacyInitial(c),mainHash=guideHash(main)
  const runtime={...c.runtime,call:async<T>(r:any):Promise<T>=>{
   if(rejected){expect(r.data.units[0].data.feedback.goalEvaluation.firstTurnSatisfied).toBe(false);throw Error('STOP_BEFORE_GOAL_REPAIR')}
   expect(r.stage).toBe('review-premise-replies');expect(r.data.units[0].data.branchObjective.seed.goal).toBe(state.seed.goal)
   const raw=initialResponse(r),review=raw.units[0].response;review.goalEvaluation.firstTurnSatisfied=false;Object.assign(review,{verdict:'revise',repairScope:'first-turn',findings:[{severity:'major',targetId:main.setup.id,message:'The assigned first-turn objective is not executed.',correction:'Execute the declared alternative before any response.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}]});rejected=true;c.stages.push(r.stage);return r.read(raw)
  }}
  await expect(constructGuideReplyBranches([main],[p],runtime)).rejects.toThrow('STOP_BEFORE_GOAL_REPAIR');expect(c.stages).toEqual(['review-premise-replies']);expect(guideHash(main)).toBe(mainHash)
  expect(loadGuideSegmentCheckpoint(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,state.line)?.segments).toHaveLength(0)
  expect(guideSegmentCheckpointFeedback(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,state.line)?.reason).toContain('objective is not executed')
 }finally{c.close()}
},60000)
it('does not treat a complete but never reviewed historical branch as a permitted migration',async()=>{
 const c=await copy()
 try{const {p}=await legacyInitial(c,false);expect(()=>readGuideReplyBranchSnapshots([main],[p],c.runtime)).toThrow('critica indipendente');await expect(constructGuideReplyBranches([main],[p],{...c.runtime,call:async()=>{throw Error('No provider before the provenance check')}})).rejects.toThrow('seguito costruito senza critica indipendente');expect(c.stages).toEqual([])}finally{c.close()}
},60000)
it('preserves goal evidence separately while routing a rejected shared setup through the unchanged complete setup reader',async()=>{
 const c=await copy()
 try{
  const {p}=await legacyInitial(c);let error:any
  try{await constructGuideReplyBranches([main],[p],{...c.runtime,call:async<T>(r:any):Promise<T>=>{const raw=initialResponse(r),v=raw.units[0].response;v.goalEvaluation.firstTurnSatisfied=false;Object.assign(v,{verdict:'revise',repairScope:'setup',findings:[{severity:'major',targetId:main.setup.id,message:'Synthetic shared setup cannot support the assigned objective.',correction:'Rebuild a realistic setup without inventing cards.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}]});return r.read(raw)}})}catch(e){error=e}
  expect(error).toBeInstanceOf(GuidePremiseSetupRejected);expect(error.review.goalEvaluation).toBeUndefined()
  expect(()=>guideSetupRepairRequest(error.prefix,error.review,c.runtime)).not.toThrow()
  const saved=[...c.archive.values<any>('guide-premise-review-v1')].find(r=>r.value.goalEvaluation?.firstTurnSatisfied===false)!
  expect(saved.value.goalEvaluation.goalHash).toBeTruthy();expect(saved.value.review.findings[0].message).toContain('assigned objective');expect(saved.key).toBe(guideHash(saved.value))
 }finally{c.close()}
},60000)
it('rejects a different ordinary draw and an unchanged first decision before accepting any alternate first-turn checkpoint',async()=>{
 const c=await copy(),p=alternative(),seed=p.others[0]
 try{
  const fork=forkGuideSegmentCheckpoint(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,'reply-'+guideHash(seed),0),state={caseId:main.setup.id,seed,line:fork.line,journal:fork.journal,main,terminal:false}
  const request=guideReplyTurnRequest(state,c.runtime),batch=prepareGuideSegmentBatch([request],{stage:'segments-reply-ours',reserveCalls:request.reserveCalls}).request,raw=initialResponse(batch).units[0].response
  const otherDraw=structuredClone(raw);otherDraw.body.draw='p';expect(()=>request.read(otherDraw)).toThrow('pescata ordinaria')
  const unchanged=structuredClone(raw);unchanged.body.events=structuredClone(main.segments[0].body.events);expect(()=>request.read(unchanged)).toThrow('identica')
  expect(loadGuideSegmentCheckpoint(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,fork.line)!.segments).toHaveLength(0)
 }finally{c.close()}
},60000)
it('reserves the alternate first turn, its independent critic and both later turns before spending',async()=>{
 const c=await copy();let called=false
 try{await expect(constructGuideReplyBranches([main],[alternative()],{...c.runtime,remainingCalls:()=>6,call:async()=>{called=true;throw Error('No unfunded request')}})).rejects.toMatchObject({code:'call-budget',budget:{remainingCalls:6,requiredCalls:7}});expect(called).toBe(false)}finally{c.close()}
},60000)
it('stops before the opponent without an independent initial critique, and metadata cannot inherit the main-line pass',async()=>{
 const c=await copy(),p=alternative(),seed=p.others[0]
 try{
  await expect(constructGuideReplyBranches([main],[p],{...c.runtime,call:async r=>{if(r.stage==='review-premise-replies')throw Error('INTERRUPT_AT_INDEPENDENT_CRITIC');return c.runtime.call(r)}})).rejects.toThrow('INTERRUPT_AT_INDEPENDENT_CRITIC')
  expect(c.stages).toEqual(['segments-reply-ours'])
  const fork=forkGuideSegmentCheckpoint(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,'reply-'+guideHash(seed),0),b={caseId:main.setup.id,seed,line:fork.line,journal:fork.journal,terminal:false}
  expect(b.journal.segments).toHaveLength(1)
  expect(()=>guideScenarioMetadataRequest(main,p,[...oldBranches,b],c.runtime)).toThrow('critica indipendente')
 }finally{c.close()}
},60000)
it('persists a negative initial critique on its own branch and carries the original findings into repair without changing the main',async()=>{
 const c=await copy(),p=alternative(),seed=p.others[0];let rejected=false
 try{
  const runtime={...c.runtime,call:async<T>(r:any):Promise<T>=>{
   if(r.stage==='review-premise-replies'){
    const raw=initialResponse(r),review=raw.units[0].response;Object.assign(review,{verdict:'revise',repairScope:'first-turn',findings:[{severity:'major',targetId:main.setup.id,message:'Independent synthetic alternate decision needs correction.',correction:'Rebuild only this alternate initial decision.',sourceIds:['card:p'],proposedActions:[],counterlines:[]}]});rejected=true;c.stages.push(r.stage);return r.read(raw)
   }
   if(rejected){expect(r.data.units[0].data.feedback.review.findings[0].message).toContain('alternate decision');throw Error('STOP_BEFORE_PAID_REPAIR')}
   return c.runtime.call(r)
  }}
  await expect(constructGuideReplyBranches([main],[p],runtime)).rejects.toThrow('STOP_BEFORE_PAID_REPAIR')
  expect(c.stages).toEqual(['segments-reply-ours','review-premise-replies'])
  const fork=forkGuideSegmentCheckpoint(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,'reply-'+guideHash(seed),0)
  expect(fork.journal.segments).toHaveLength(0);expect(guideSegmentCheckpointFeedback(c.archive,options.scope,options.packet,main.setup.id,main.rootHash,fork.line)?.reason).toContain('alternate decision')
  expect(loadGuideSegmentCheckpoint(c.archive,options.scope,options.packet,main.setup.id,main.rootHash)).toEqual(main)
 }finally{c.close()}
},60000)
it('derives a winning initial alternative, reviews it, and omits only the two turns that cannot occur after game end',async()=>{
 const c=await copy(),jobStore=new AiJobStore(c.path),job=jobStore.start('matchup-generate',options.scope.projectId,'independent-terminal-alternative'),a=new AiEvidenceArchive(c.path,job)
 try{
  const packet=structuredClone(options.packet),card=JSON.parse(packet.sources[0].content);card.gameplay.attacks[0].damage='1';packet.sources[0]=guideSource('card:p','card','Synthetic Basic',null,JSON.stringify(card));packet.basis.dependencyHash=packetHash(packet)
  const scope={...options.scope,jobId:job.id,dependencyHash:packet.basis.dependencyHash},stages:string[]=[]
  const ko=()=>({...structuredClone(main.segments[2].body.attack),description:'The printed attack knocks out the only opposing Pokemon and takes one Prize.',moves:[{side:'opponent',printId:'p',count:1,from:'active',to:'discard'}],energyRoutes:[{side:'ours',printId:'e',count:1,path:['prizes','hand'],hostPrintId:null,sourceIds:['card:p'],attachment:null}],action:'active-ko',affectedSide:'opponent'})
  const runtime:GuideConstructionRuntime={...options,packet,scope,archive:a,call:async r=>{
   stages.push(r.stage);const raw=fixture.response(r.stage,r.data,r.schema) as any
   for(const [i,u]of (raw.units??[]).entries()){
    const data=(r.data as any).units[i].data
    if(u.response.phase==='next')u.response.body.attack=ko()
    if(u.response.phase==='ours'&&data.reply?.forkAtTurn===0)u.response.body.events.push(ko())
    if(u.response.metadata){
     const m=u.response.metadata;m.calculations[0].terms=[1];m.calculations[0].expected=1
     m.replyComparison.options.forEach((o:any)=>{const b=data.branches.find((b:any)=>b.seed.id===o.id),terminal=b.receipt.terminal&&b.native.turns.opponent===undefined;o.terms=[terminal?0:1];o.damage=terminal?0:1;o.remainingHp=terminal?120:119;o.outcome=terminal?'Game ended before any opponent reply.':'Printed one-damage reply.'})
    }
   }
   return r.read(raw)
  }}
  const setup=structuredClone(main.setup);setup.positionAnnotations.find((p:any)=>p.side==='opponent').damage=119
  setup.firstOpponentTurn={draw:'e',events:[],decision:{availableAttack:'Synthetic attack',choice:'Pass on the first turn.',reason:'The first player cannot attack.'},tactical:structuredClone(main.segments[0].body.tactical)}
  const line=(await constructGuideMainLines({...runtime,setups:[setup]}))[0].journal,base=(await constructGuideReplyPlans([line],runtime))[0],p={...base,others:alternative().others}
  stages.length=0;const branches=await constructGuideReplyBranches([line],[p],runtime),b=branches.find(b=>b.seed.role==='other')!
  expect(b.terminal).toBe(true);expect(b.journal.segments).toHaveLength(1);expect(b.journal.segments[0].receipt.termination).toEqual({winner:'ours',reason:'no-pokemon'})
  const request=guideScenarioMetadataRequest(line,p,branches,runtime),output=await callGuideSegmentBatch([request.request],{stage:'metadata-cases',reserveCalls:request.request.reserveCalls,archive:a,call:runtime.call}),outcome=output.outcomes[0]
  if(!outcome.accepted)throw Error(outcome.message);expect(outcome.accepted).toBe(true)
  const native=request.build(outcome.value as any).native as any,option=native.replyComparison.options.find((o:any)=>o.id===b.seed.id)
  expect(option.turns.opponent).toEqual({terminal:true});expect(option.turns.next).toEqual({terminal:true});expect(option.forkAtEvent).toBe(0)
 }finally{a.close();jobStore.close();c.close()}
},60000)
