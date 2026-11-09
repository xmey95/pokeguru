import {it,expect} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {ProjectStore} from '../src/main/project-store'
import {AiJobStore} from '../src/main/ai-job-store'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {generateDeepGuide,deepGuideReport,assertGuideIntegrity} from '../src/main/matchup-guide-generation'
import {syntheticSegmentProtocol} from './fixtures/guide-segment-protocol'
import {packetHash,guideHash} from '../src/main/matchup-guide-packet'
import {unpackGuideData} from '../src/main/guide-request-budget'

it('persists a generated v28 guide and revision through the real project/history store, preserving the last valid guide after interruption',async()=>{
 const root=resolve('.verify/app225-segments-20261102');mkdirSync(root,{recursive:true})
 const folder=mkdtempSync(join(root,'app-path-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path)
 const config={provider:'codex' as const,source:'global' as const,model:'gpt-6.1-sol',reasoningEffort:null},project=projects.create({name:'SYNTHETIC v28 application verification',format:'STANDARD'}),other=projects.create({name:'Isolation control — no guide',format:'STANDARD'})
 projects.importDeck({projectId:project.id,rawText:'4 Synthetic Basic\n56 Basic Grass Energy',source:'paste'})
 const metaId='c'.repeat(64),date='2026-11-02T18:00:00.000Z',opponentId='synthetic-opponent'
 projects.saveMetaSnapshot({id:metaId,fetchedAt:date,sourceUrl:'https://limitlesstcg.com/decks',circuit:'WESTERN',format:'STANDARD',period:'Isolated synthetic verification',decks:[{id:opponentId,name:'Synthetic Basic',url:'https://limitlesstcg.com/decks/284',share:1,count:1}]} as never)
 const fixture=syntheticSegmentProtocol(project.id,true),context=projects.getCurrentDeckContext(project.id)!
 fixture.packet.basis={...fixture.packet.basis,deckHash:projects.getCurrentDeckHash(project.id)!,deckVersionId:context.versionId,deckResolutionId:context.resolutionId,metaId,opponentId};fixture.packet.basis.dependencyHash=packetHash(fixture.packet)
 const runner=async(prompt:string,_config:unknown,schema:object)=>{const stage=/FASE: ([^\n]+)/.exec(prompt)![1],data=unpackGuideData(JSON.parse(prompt.split('\n\nDATI CONGELATI:\n')[1]));return fixture.response(stage,data,schema)}
 let work:AiAnalysisWork|undefined
 try{
  const job=jobs.start('matchup-generate',project.id,'synthetic-app-guide');work=new AiAnalysisWork(join(folder,job.id),jobs,job.id,new AbortController().signal)
  const guide=await generateDeepGuide({packet:fixture.packet,config,work,request:'SYNTHETIC application persistence verification.',runner})
  const report=deepGuideReport({...fixture.packet.basis,jobId:job.id,generatedAt:date,sampleDeckUrl:null},guide)
  projects.saveMatchupReport(report);jobs.ready(job.id,{report});jobs.transition(job.id,'applied');work.close()
  expect(projects.listMatchupReports(project.id,metaId)[0]).toEqual(report);expect(projects.listMatchupReports(other.id,metaId)).toEqual([])
  expect(()=>projects.saveMatchupReport({...report,projectId:other.id})).toThrow()
  const discussion=projects.listMatchupDiscussions(project.id,opponentId)[0],pending=projects.addMatchupFeedback(discussion.id,'Verify the printed free attack cost again.'),target=pending.turns.at(-1)!
  expect(projects.getMatchupDiscussionWindow(other.id,discussion.id)).toBeNull()
  const child=jobs.start('matchup-revise',project.id,'synthetic-app-revision'),request=target.feedback!
  work=new AiAnalysisWork(join(folder,child.id),jobs,child.id,new AbortController().signal)
  const options={packet:fixture.packet,config,previous:report,revision:true,request,runner}
  await expect(generateDeepGuide({...options,work,onStage:stage=>{if(stage.startsWith('review-revision-'))throw Error('Synthetic interruption before independent revision assessment')}})).rejects.toThrow('Synthetic interruption')
  expect(projects.listMatchupReports(project.id,metaId)[0]).toEqual(report)
  expect(projects.getMatchupDiscussionWindow(project.id,discussion.id)!.turns.at(-1)!.report).toBeNull()
  work.close();work=new AiAnalysisWork(join(folder,child.id),jobs,child.id,new AbortController().signal)
  const revised=await generateDeepGuide({...options,work}),revisedReport=deepGuideReport({...fixture.packet.basis,jobId:child.id,generatedAt:'2026-11-02T18:01:00.000Z',sampleDeckUrl:null},revised)
  const saved=projects.completeMatchupFeedback(discussion.id,target.id,revisedReport,revised.changeSummary)
  jobs.ready(child.id,{report:revisedReport});jobs.transition(child.id,'applied');work.close()
  expect(saved.turns).toHaveLength(2);expect(saved.turns[0].report).toEqual(report);expect(saved.turns[1].report).toEqual(revisedReport)
  const reopened=new ProjectStore(path)
  try{
   const current=reopened.listMatchupReports(project.id,metaId)[0],history=reopened.getMatchupDiscussionWindow(project.id,discussion.id)!
   expect(current).toEqual(revisedReport);expect(history.turns[0].report).toEqual(report);expect(history.turns[1].changeSummary).toBe(revised.changeSummary)
   expect(current.guide!.generation.segmentOriginals).toEqual(revised.generation.segmentOriginals);assertGuideIntegrity(current.guide!)
   expect(reopened.listMatchupReports(other.id,metaId)).toEqual([])
  }finally{reopened.close()}
  writeFileSync(join(root,'app-fixture.json'),JSON.stringify({path,projectId:project.id,otherProjectId:other.id,metaId,opponentId,discussionId:discussion.id,reportHash:guideHash(revisedReport),parentCalls:guide.generation.attempts.length,revisionCalls:revised.generation.attempts.length,mockedProvider:true,realModelCalls:0,originalDatabaseModified:false},null,2))
 }finally{work?.close();jobs.close();projects.close()}
// Complete generation + interrupted revision + SQLite reopen, with no provider.
// CPU profiling exceeded 60s; this is a test allowance, not an app budget change.
},180000)
