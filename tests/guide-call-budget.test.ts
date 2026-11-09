import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect,it} from 'vitest'
import {AiAnalysisWork} from '../src/main/ai-analysis-work'
import {AiJobStore} from '../src/main/ai-job-store'
import {ProjectStore} from '../src/main/project-store'
import {guideAttemptLimit} from '../src/main/guide-call-budget'
import type {GuidePacket} from '../src/main/matchup-guide-packet'

it('keeps ordinary and historical limits and persists a separately authorized exception only for the same job and frozen sources',()=>{
 const folder=mkdtempSync(join(tmpdir(),'guide-budget-')),path=join(folder,'data.sqlite'),projects=new ProjectStore(path),jobs=new AiJobStore(path)
 const project=projects.create({name:'Unrelated deck',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,`matchup:${project.id}`)
 let work=new AiAnalysisWork(join(folder,'job'),jobs,job.id,new AbortController().signal)
 const packet={basis:{projectId:project.id,dependencyHash:'frozen-unrelated-source',promptVersion:'matchup-guide-24'}} as GuidePacket
 try{
  expect(guideAttemptLimit(packet,work,100)).toBe(16)
  expect(guideAttemptLimit({...packet,basis:{...packet.basis,promptVersion:'matchup-guide-25'}},work,100)).toBe(16)
  expect(guideAttemptLimit({...packet,basis:{...packet.basis,promptVersion:'matchup-guide-26'}},work,100)).toBe(16)
  expect(guideAttemptLimit({...packet,basis:{...packet.basis,promptVersion:'matchup-guide-27'}},work,100)).toBe(16)
  expect(guideAttemptLimit({...packet,basis:{...packet.basis,promptVersion:'matchup-guide-23'}},work,100)).toBe(8)
  const grant={jobId:job.id,projectId:project.id,dependencyHash:packet.basis.dependencyHash,maximum:18,reason:'Synthetic explicit authorization in an isolated test.'}
  for(const invalid of [{...grant,jobId:'different-job'},{...grant,projectId:'different-project'},{...grant,dependencyHash:'changed-sources'},{...grant,maximum:18.5},{...grant,reason:''}])expect(()=>guideAttemptLimit(packet,work,undefined,invalid)).toThrow('Autorizzazione')
  expect([...work.archive.values('guide-call-budget-authorization')]).toHaveLength(0)
  expect(guideAttemptLimit(packet,work,undefined,grant)).toBe(18)
  expect(guideAttemptLimit(packet,work,12)).toBe(12)
  work.close();work=new AiAnalysisWork(join(folder,'job'),jobs,job.id,new AbortController().signal)
  expect(guideAttemptLimit(packet,work)).toBe(18)
  expect(()=>guideAttemptLimit({...packet,basis:{...packet.basis,dependencyHash:'different'}},work)).toThrow('Autorizzazione')
  const otherProject=projects.create({name:'Another deck',format:'STANDARD'}),otherJob=jobs.start('matchup-generate',otherProject.id,`matchup:${otherProject.id}`),other=new AiAnalysisWork(join(folder,'other'),jobs,otherJob.id,new AbortController().signal)
  try{expect(guideAttemptLimit({...packet,basis:{...packet.basis,projectId:otherProject.id}},other)).toBe(16);expect([...other.archive.values('guide-call-budget-authorization')]).toHaveLength(0)}finally{other.close()}
 }finally{work.close();jobs.close();projects.close();rmSync(folder,{recursive:true,force:true})}
})
