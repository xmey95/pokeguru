import {it,expect,vi} from 'vitest'
import {mkdirSync,mkdtempSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {guideHash} from '../src/main/matchup-guide-packet'
import {projectGuideCaseProofs,guideProofDirectory,assertGuideProofReserve} from '../src/main/guide-proof-partition'
import {planGuideReviewProofs,assertGuideReviewProofManifest} from '../src/main/guide-review-proof-scope'
import * as budget from '../src/main/guide-request-budget'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {assertGuideSegmentApproval} from '../src/main/guide-segment-approval'
import {readGuideContent} from '../src/shared/matchup-guide'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'

it('retains exact proof objects and metadata across explicit projections, without changing the original',()=>{
 const source:any={chapters:[],claims:[],scenarios:[{id:'independent',explanation:'  Pokémon 🐦\n',replyComparison:{options:['a','b','c'].map((id,i)=>({id,outcome:'Condition '+i,terms:[i],turns:{ours:{events:[{original:i}]}},steps:[{proof:i}]}))},tacticalAudit:[{lineIds:['main'],comparison:'original'},{lineIds:['b'],comparison:'other original'}]}],exercises:[],limitations:[],changeSummary:''},before=JSON.stringify(source)
 const views=['a','b','c'].map(id=>projectGuideCaseProofs(source,'independent',[id]))
 expect(views.flatMap(v=>v.scenarios[0].replyComparison.options)).toEqual(source.scenarios[0].replyComparison.options)
 expect(guideProofDirectory(source,'independent')).toEqual(source.scenarios[0].replyComparison.options.map(({turns,steps,...metadata}:any)=>metadata))
 expect(JSON.stringify(source)).toBe(before)
})
it('covers every pair, complete multi-witness requirements and every historical finding despite audit splits',()=>{
 const ids=['alpha','beta','gamma','delta','epsilon'],packet:any={basis:{projectId:'independent'}},scope={projectId:'independent',jobId:'j',dependencyHash:'d',configHash:'c'},base:any={chapters:[],claims:[],scenarios:[{id:'case',replyComparison:{options:ids.map(id=>({id}))}}],exercises:[],limitations:[],changeSummary:''}
 const history:any={reviews:[],findings:Array.from({length:5},(_,i)=>({hash:'h'+i,finding:{repair:{kind:'metadata'},counterlines:[]},reviewKeys:[]}))}
 const options:any={packet,scope,archive:{values:()=>[],saveValue:()=>{},id:'j',projectId:'independent'},remainingCalls:()=>100,check:()=>{},reserveOutside:3,isCached:()=>false,estimate:(r:any)=>{
  const spec=r.data.units[0].data.proofPartition,real=budget.planGuideRequest('review-test','Synthetic estimate',{}, {},[],100,3).budget
  return {...real,estimatedInput:spec.branchIds.length*26000+spec.historyFindingHashes.length*20000,estimatedResponseCharacters:1000,reservedOutput:1000}
 }}
 const result=planGuideReviewProofs({caseId:'case',baseViewId:'independent',base,completeDraft:base,branchHeads:ids.map(id=>({id,head:id+'-head'})),requirements:[{id:'requires-four',branchIds:ids.slice(0,4)}],history,make:(_view,spec,id)=>({stage:id,role:'critic',task:'Synthetic',instructions:'Synthetic',data:{packet,proofPartition:spec,reviewContextHash:guideHash(spec)},schema:{},reserveCalls:3,read:v=>v,cacheValidation:{id:'synthetic',validate:()=>{}}})},options,'review-test')
 assertGuideReviewProofManifest(result.manifest)
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)for(const hash of history.findings.map((f:any)=>f.hash))expect(result.units.some(u=>u.scope.branchIds.includes(ids[i])&&u.scope.branchIds.includes(ids[j])&&u.scope.historyFindingHashes.includes(hash))).toBe(true)
 const owner=result.manifest.units.find(u=>u.requirementIds.includes('requires-four'))!
 expect(owner.branchIds).toEqual(ids.slice(0,4))
 const missing=structuredClone(result.manifest);missing.units=missing.units.filter(u=>u.id!==owner.id)
 expect(()=>assertGuideReviewProofManifest(missing)).toThrow('obbligo')
 expect(()=>assertGuideProofReserve(2,3,{...options,remainingCalls:()=>4},'review-test')).toThrow('Budget insufficiente')
 expect(()=>assertGuideProofReserve(0,3,{...options,remainingCalls:()=>0},'review-test')).not.toThrow()
})

function fixtureRunner(f:ReturnType<typeof syntheticSegmentProtocol>,extra:number,calls:{stage:string;ids:string[]}[]){
 return async(prompt:string,_config:unknown,schema:object)=>{
  const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=budget.unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1])) as any
  calls.push({stage,ids:data.units?.map((u:any)=>u.unitId)??[]})
  if(stage==='metadata-fragments')return {units:data.units.map((u:any)=>({unitId:u.unitId,response:{caseId:u.data.caseId,partHash:u.data.partHash,value:u.data.kind==='option'?{id:u.data.branches[0].seed.id,intent:u.data.branches[0].seed.intent,specificDraws:[],terms:[0],multiplier:1,damage:0,reachesThreshold:false,remainingHp:120,outcome:'Synthetic zero damage; no KO.',sourceIds:['card:p'],promotionRationale:'No compulsory promotion in this branch.'}:{firstId:u.data.branches[0].seed.id,secondId:u.data.branches[1].seed.id,relation:'tradeoff',comparison:'Compare the complete synthetic paths and their actual resource access. No competitive quality is claimed.',sourceIds:['card:p']}}}))}
  if(stage==='metadata-compositions')for(const unit of data.units)unit.data.branches=unit.data.branchDirectory
  const raw=f.response(stage,data,schema) as any
  if(stage==='branch-plan-cases')for(const unit of raw.units){const id=unit.response.caseId;unit.response.others=Array.from({length:extra},(_,i)=>({id:id+'-reply-extra-'+(i+1),role:'other',intent:'attack',goal:'Compare independent synthetic alternative '+(i+1),sourceIds:['card:p']}))}
  return raw
 }
}

it('SYNTHETIC: composes the same complete guide through fragments and mandatory proof critics, rejecting partial approvals',async()=>{
 const root=resolve('.verify/app225-segments-20261102');mkdirSync(root,{recursive:true});const folder=mkdtempSync(join(root,'partition-protocol-')),projects=new ProjectStore(join(folder,'data.sqlite')),jobs=new AiJobStore(join(folder,'data.sqlite')),project=projects.create({name:'SYNTHETIC partition controls',format:'STANDARD'}),f=syntheticSegmentProtocol(project.id),calls:{stage:string;ids:string[]}[]=[]
 const config={provider:'codex' as const,source:'global' as const,model:'gpt-6.1-sol',reasoningEffort:null},original=budget.planGuideRequest,originalFactory=budget.createGuideRequestPlanner;let force=false,work:AiAnalysisWork|undefined
 const forceMeasurement=(planner:typeof original)=>(...args:Parameters<typeof budget.planGuideRequest>)=>{
  const result=planner(...args),units=(args[2] as any)?.units??[]
  if(force&&(args[0]==='metadata-cases'||args[0].startsWith('review')&&units.some((u:any)=>(u.data?.contexts?.length??0)>3)))return {...result,budget:{...result.budget,estimatedInput:budget.GUIDE_BUDGET_POLICY.inputMaximum+1,fits:false,fitsTarget:false}}
  return result
 }
 const spy=vi.spyOn(budget,'planGuideRequest').mockImplementation(forceMeasurement(original)),factorySpy=vi.spyOn(budget,'createGuideRequestPlanner').mockImplementation(()=>forceMeasurement(originalFactory()))
 const generate=async(resource:string)=>{
  const job=jobs.start('matchup-generate',project.id,resource);work=new AiAnalysisWork(join(folder,job.id),jobs,job.id,new AbortController().signal)
  const guide=await generateDeepGuide({packet:f.packet,config,work,request:'SYNTHETIC partition controls; no provider.',attemptLimit:64,callBudgetAuthorization:{jobId:job.id,projectId:project.id,dependencyHash:f.packet.basis.dependencyHash,maximum:64,reason:'Synthetic test only; no provider'},runner:fixtureRunner(f,0,calls)})
  assertGuideIntegrity(guide);assertGuideSegmentApproval(guide,work.archive)
  return guide
 }
 try{
  const baseline=await generate('baseline');work!.close();force=true;calls.length=0
  const partitioned=await generate('partitioned')
  expect(readGuideContent(partitioned)).toEqual(readGuideContent(baseline))
  expect(calls.some(c=>c.stage==='metadata-fragments')).toBe(true);expect(calls.some(c=>c.stage==='metadata-compositions')).toBe(true)
  const archive=work!.archive,approval=archive.value<any>('guide-segment-final-approval-v1','validated')
  expect(approval.version).toBe(2)
  const proxy=(role:string,key:string)=>role==='guide-segment-final-approval-v1'&&key==='validated'?{...approval,reviewKeys:approval.reviewKeys.slice(1)}:archive.value(role,key)
  expect(()=>assertGuideSegmentApproval(partitioned,{id:archive.id,projectId:archive.projectId,value:proxy,values:(role:string)=>archive.values(role)} as any)).toThrow()
  const manifests=[...archive.values<any>('guide-proof-review-manifest-v1')]
  expect(manifests.length).toBeGreaterThan(0);for(const row of manifests)assertGuideReviewProofManifest(row.value)
 }finally{factorySpy.mockRestore();spy.mockRestore();work?.close();jobs.close();projects.close()}
},240000)
