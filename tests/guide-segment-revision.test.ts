import {beforeAll,afterAll,it,expect} from 'vitest'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {AiJobStore} from '../src/main/ai-job-store'
import {ProjectStore} from '../src/main/project-store'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {readGuideSegmentOriginals,seedGuideSegmentRevision} from '../src/main/guide-segment-originals'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {guideHash,packetHash,guideSource} from '../src/main/matchup-guide-packet'
import {unpackGuideData} from '../src/main/guide-request-budget'
import type {MatchupGuide} from '../src/shared/matchup-guide'
import type {GuideConstructionRuntime} from '../src/main/guide-reply-phase'

const config={provider:'codex' as const,source:'global' as const,model:'gpt-6.1-sol',reasoningEffort:null}
let jobs:AiJobStore,projects:ProjectStore,folder:string,fixture:ReturnType<typeof syntheticSegmentProtocol>,parent:MatchupGuide
const runResponse=(prompt:string,schema:object)=>{const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));return {stage,data,raw:fixture.response(stage,data,schema) as any}}
const makeWork=(name:string)=>{const job=jobs.start('matchup-revise',parent.basis.projectId,name);return new AiAnalysisWork(join(folder,job.id),jobs,job.id,new AbortController().signal)}
const previous=()=>({guide:parent,...parent.basis}) as any
beforeAll(async()=>{
 const root=resolve('.verify/app225-segments-20261102');mkdirSync(root,{recursive:true});folder=mkdtempSync(join(root,'revision-'))
 const path=join(folder,'data.sqlite');projects=new ProjectStore(path);jobs=new AiJobStore(path)
 const project=projects.create({name:'Independent revision isolation fixture',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'parent')
 fixture=syntheticSegmentProtocol(project.id,true)
 const work=new AiAnalysisWork(join(folder,job.id),jobs,job.id,new AbortController().signal)
 try{parent=await generateDeepGuide({packet:fixture.packet,config,work,request:'Synthetic revision parent',runner:async(prompt,_config,schema)=>runResponse(prompt,schema).raw})}
 finally{work.close();jobs.transition(job.id,'applied')}
},60000)
afterAll(()=>{jobs?.close();projects?.close()})

it('preserves original goals and notes, seeds a new scope without AI or tactical approval, and refuses changed sources',()=>{
 const original=readGuideSegmentOriginals(parent)!,before=guideHash(parent),work=makeWork('seed-a')
 const runtime={scope:{projectId:parent.basis.projectId,jobId:work.id,dependencyHash:fixture.packet.basis.dependencyHash,configHash:guideHash(config)},packet:fixture.packet,archive:work.archive,call:async()=>{throw Error('No AI call allowed while seeding')},estimate:()=>{throw Error('No estimate required')},isCached:()=>false,remainingCalls:()=>0,check:()=>{},reserveOutside:0} as GuideConstructionRuntime
 try{
  expect(original.cases).toHaveLength(2);expect(original.cases.every(c=>c.seeds.length===3&&c.branchNotes.length===3)).toBe(true)
  const seeded=seedGuideSegmentRevision(parent,runtime)!
  expect(seedGuideSegmentRevision(parent,runtime)).toEqual(seeded)
  expect(seeded.construction.plans[0].direct.goal).toBe(original.cases[0].seeds[0].goal)
  expect(seeded.construction.branches[0].journal.segments[1].development).toEqual(original.cases[0].branchNotes[0].opponent)
  expect(seeded.construction.mains[0].scope.jobId).toBe(work.id)
  expect(seeded.construction.mains[0].segments.at(-1)!.hash).not.toBe(original.cases[0].sourceMainHash)
  expect([...work.archive.values('guide-segment-review-v1')]).toHaveLength(0)
  expect([...work.archive.values<any>('guide-segment-revision-seed-v1')][0].value.tacticalApprovalReused).toBe(false)
  const changed=structuredClone(fixture.packet);changed.sources[0]=guideSource(changed.sources[0].id,changed.sources[0].kind,changed.sources[0].label,null,changed.sources[0].content+' ');changed.basis.dependencyHash=packetHash(changed)
  expect(seedGuideSegmentRevision(parent,{...runtime,packet:changed,scope:{...runtime.scope,dependencyHash:changed.basis.dependencyHash}})).toBeUndefined()
  const forged=structuredClone(parent);forged.generation.segmentOriginals!.cases[0].nativeHash='f'.repeat(64)
  expect(()=>assertGuideIntegrity(forged)).toThrow('Originali dei segmenti')
  expect(()=>seedGuideSegmentRevision(parent,{...runtime,scope:{...runtime.scope,projectId:'foreign'}})).toThrow('altro progetto')
  expect(guideHash(parent)).toBe(before)
 }finally{work.close();jobs.transition(work.id,'cancelled')}
},20000)

it('rechecks previous cases and feedback with fresh critics, keeps the parent intact and binds recovery to the request',async()=>{
 const work=makeWork('unchanged'),stages:string[]=[],before=guideHash(parent),request='Check whether the printed free attack requires Energy.'
 try{
  const guide=await generateDeepGuide({packet:fixture.packet,config,work,previous:previous(),revision:true,request,runner:async(prompt,_config,schema)=>{const r=runResponse(prompt,schema);stages.push(r.stage);return r.raw}})
  assertGuideIntegrity(guide)
  expect(stages).toHaveLength(2);expect(stages[0]).toMatch(/^review-revision-/);expect(stages[1]).toMatch(/^review-[a-f0-9]{16}$/)
  expect(guide.changeSummary).toContain('no changes are justified');expect(guide.generation.attempts).toHaveLength(2)
  expect(guide.scenarios).toEqual(parent.scenarios);expect(guide.generation.parentDependencyHash).toBe(parent.basis.dependencyHash)
  expect([...work.archive.values('guide-segment-review-v1')].length).toBeGreaterThanOrEqual(4)
  expect(guideHash(parent)).toBe(before)
  expect(await generateDeepGuide({packet:fixture.packet,config,work,previous:previous(),revision:true,request,runner:async()=>{throw Error('Recovery must not call AI')}})).toEqual(guide)
  await expect(generateDeepGuide({packet:fixture.packet,config,work,previous:previous(),revision:true,request:'Different feedback',runner:async()=>{throw Error('Foreign request must fail before AI')}})).rejects.toThrow('un’altra richiesta')
 }finally{work.close();jobs.transition(work.id,'cancelled')}
},60000)

it('reconstructs from current evidence and resumes the chosen alternative list without rebuying the plan',async()=>{
 let work=makeWork('changed-source');const jobId=work.id,packet=structuredClone(fixture.packet),stages:string[]=[]
 packet.sources[0]=guideSource(packet.sources[0].id,packet.sources[0].kind,packet.sources[0].label,null,packet.sources[0].content+' ')
 const alternative={...structuredClone(packet.opponentLists[0]),id:'alternative-list',label:'Independent alternate exact list'}
 packet.opponentLists.push(alternative);packet.sources.push(guideSource(alternative.id,'list',alternative.label,null,alternative))
 packet.basis.dependencyHash=packetHash(packet)
 const runner=async(prompt:string,_config:unknown,schema:object)=>{
  const r=runResponse(prompt,schema);stages.push(r.stage)
  if(r.stage==='plan')r.raw.opponentListId=alternative.id
  if(r.stage.startsWith('setup-'))r.raw.caseSetup.opponentListId=alternative.id
  return r.raw
 }
 const options={packet,config,previous:previous(),revision:true,request:'Review with the updated source.',runner}
 try{
  await expect(generateDeepGuide({...options,work,onStage:stage=>{if(stage.startsWith('segments-main-'))throw Error('Synthetic interruption after fresh scope was pinned')}})).rejects.toThrow('Synthetic interruption after fresh scope')
  expect(work.archive.value<any>('guide-segment-native-scope-v1','native').opponentId).toBe(alternative.id)
  work.close();work=new AiAnalysisWork(join(folder,jobId),jobs,jobId,new AbortController().signal)
  const guide=await generateDeepGuide({...options,work})
  assertGuideIntegrity(guide);expect(stages).toContain('plan');expect(stages).toContain('setup-1')
  expect(stages.filter(s=>s==='plan')).toHaveLength(1);expect(stages.filter(s=>s.startsWith('setup-'))).toHaveLength(2)
  expect(guide.scenarios.every(s=>s.opponentListId===alternative.id)).toBe(true)
  expect([...work.archive.values('guide-segment-revision-seed-v1')]).toHaveLength(0)
  expect(guide.basis.dependencyHash).toBe(packet.basis.dependencyHash);expect(guide.generation.parentDependencyHash).toBe(parent.basis.dependencyHash)
  expect(guide.generation.attempts.length).toBeLessThanOrEqual(16)
 }finally{work.close();jobs.transition(work.id,'cancelled')}
},60000)

it('rejects cross-version frozen revisions before spending a call',async()=>{
 const work=makeWork('wrong-contract'),packet=structuredClone(fixture.packet);packet.basis.promptVersion='matchup-guide-27';packet.basis.dependencyHash=packetHash(packet)
 try{
  await expect(generateDeepGuide({packet,config,work,previous:previous(),revision:true,request:'Historical contract mismatch',runner:async()=>{throw Error('Must not invoke AI')}})).rejects.toThrow('contratto nativo')
  expect([...work.archive.values('guide-attempt-start')]).toHaveLength(0)
 }finally{work.close();jobs.transition(work.id,'cancelled')}
})

for(const native of [false,true])it('repairs feedback on '+(native?'native metadata':'a chapter')+' with independent final checks and resumes the same epoch',async()=>{
 let work=makeWork('repair-'+native),interrupt=true;const jobId=work.id,request=native?'Compare resources more explicitly.':'Explain the attack more clearly.',before=guideHash(parent),stages:string[]=[]
 const runner=async(prompt:string,_config:unknown,schema:object)=>{
  const r=runResponse(prompt,schema);stages.push(r.stage)
  if(r.stage.startsWith('review-revision-')){
   const index=r.data.units.findIndex((u:any)=>u.data.reviewScope.kind==='guide-text')
   if(index>=0){
   const unit=r.raw.units[index]
   const repair:any=native?{kind:'metadata',caseId:'scenario-1',constructionHash:''}:{kind:'text',targetId:'chapter-summary'}
   if(native){
    const resolve=(n:any):any=>n?.$ref?resolve((schema as any).$defs[n.$ref.slice('#/$defs/'.length)]):n
    const envelope=resolve(resolve((schema as any).properties.units).items).anyOf.map(resolve).find((x:any)=>resolve(x.properties.unitId).const===unit.unitId)
    const target=resolve(resolve(resolve(resolve(envelope.properties.response).properties.findings).items).properties.repair).anyOf.map(resolve).find((t:any)=>resolve(t.properties.kind).const==='metadata'&&resolve(t.properties.caseId).const==='scenario-1')
    repair.constructionHash=resolve(target.properties.constructionHash).const
   }
   unit.response.verdict='revise';unit.response.revisionResponse='Make the requested synthetic clarification.'
   unit.response.findings=[{severity:'major',targetId:native?'scenario-1':'chapter-summary',message:'Requested synthetic explanation needs clarification.',correction:'Clarify the printed cost and resource comparison.',sourceIds:['card:p'],proposedActions:[],counterlines:[],repair}]
   }
  }
  return r.raw
 }
 try{
  await expect(generateDeepGuide({packet:fixture.packet,config,work,previous:previous(),revision:true,request,runner,onStage:stage=>{if(interrupt&&(stage.startsWith('prose-repair')||stage.startsWith('metadata-'))){interrupt=false;throw Error('Synthetic revision interrupted after assessment')}}})).rejects.toThrow('Synthetic revision interrupted')
  expect([...work.archive.values('guide-segment-repair-start-v1')]).toHaveLength(1)
  const assessmentCount=stages.filter(s=>s.startsWith('review-revision-')).length
  work.close();work=new AiAnalysisWork(join(folder,jobId),jobs,jobId,new AbortController().signal)
  const guide=await generateDeepGuide({packet:fixture.packet,config,work,previous:previous(),revision:true,request,runner})
  assertGuideIntegrity(guide);expect(guide.generation.attempts.length).toBeLessThanOrEqual(16)
  expect(stages.filter(s=>s.startsWith('review-revision-'))).toHaveLength(assessmentCount)
  expect(stages.some(s=>s.startsWith('plan')||s.startsWith('setup-')||s.startsWith('segments-main'))).toBe(false)
  if(native){expect(guide.scenarios[0].replyComparison!.conclusion).not.toBe(parent.scenarios[0].replyComparison!.conclusion);expect(stages.some(s=>s.startsWith('review-repaired-scenarios-'))).toBe(true)}
  else{expect(guide.chapters.find(c=>c.id==='chapter-summary')!.body).toContain('Updated synthetic explanation');expect(guide.scenarios).toEqual(parent.scenarios)}
  expect(guideHash(parent)).toBe(before)
 }finally{work.close();jobs.transition(work.id,'cancelled')}
// Metadata repair constructs and rechecks native units as well as the prose.
// Preserve the independent gates and call assertions; allow their measured CPU work.
},native?180000:60000)
