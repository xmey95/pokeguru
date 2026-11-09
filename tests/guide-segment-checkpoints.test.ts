import {it,expect} from 'vitest'
import {mkdirSync,mkdtempSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {AiEvidenceArchive} from '../src/main/ai-evidence-archive'
import {AiJobStore} from '../src/main/ai-job-store'
import {ProjectStore} from '../src/main/project-store'
import {appendGuideSegment,createGuideSegments,forkGuideSegments} from '../src/main/guide-segments'
import {forkGuideSegmentCheckpoint,guideSegmentCheckpointFeedback,loadGuideSegmentCheckpoint,saveGuideSegmentCheckpoint,readGuideCheckpointInventory} from '../src/main/guide-segment-checkpoints'
import {segmentFixture} from './fixtures/guide-segment'
import type {GuidePacket} from '../src/main/matchup-guide-packet'

it('resumes a real SQLite head, preserves rejected descendants and prevents resurrection or foreign reuse',()=>{
  const parent=resolve('.verify/app225-segments-20261102');mkdirSync(parent,{recursive:true})
  const folder=mkdtempSync(join(parent,'checkpoint-')),path=join(folder,'data.sqlite')
  const projects=new ProjectStore(path),jobs=new AiJobStore(path)
  const project=projects.create({name:'Synthetic segments A',format:'STANDARD'}),job=jobs.start('matchup-generate',project.id,'segments-a')
  let archive=new AiEvidenceArchive(path,job)
  try{
    const {packet:fixture,scenario,opponent}=segmentFixture(),packet={...fixture,basis:{...fixture.basis,projectId:project.id}} as GuidePacket
    const scope={projectId:project.id,jobId:job.id,dependencyHash:packet.basis.dependencyHash,configHash:'synthetic-config'}
    const {turns,developmentPlan,...setup}=scenario,note=developmentPlan.ours
    const root=createGuideSegments(setup,scope,packet),first=appendGuideSegment(root,scope,packet,turns.ours,note),second=appendGuideSegment(first,scope,packet,opponent,note)
    for(const journal of [root,first,second])saveGuideSegmentCheckpoint(archive,scope,packet,journal)
    const originals=[...archive.values('guide-segment-checkpoint-v2')]
    saveGuideSegmentCheckpoint(archive,scope,packet,second)
    expect([...archive.values('guide-segment-checkpoint-v2')]).toEqual(originals)
    archive.close();archive=new AiEvidenceArchive(path,job)
    expect(loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash)).toEqual(second)
    const attack=forkGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash,'reply-attack',1)
    const defend=forkGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash,'reply-defend',1)
    expect(attack.journal.segments[0]).toEqual(first.segments[0])
    const attackReply=appendGuideSegment(attack.journal,scope,packet,opponent,note)
    saveGuideSegmentCheckpoint(archive,scope,packet,attackReply,null,attack.line)
    expect(loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash,attack.line)).toEqual(attackReply)
    expect(loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash,defend.line)).toEqual(defend.journal)
    const invalidated=forkGuideSegments(second,scope,packet,0)
    saveGuideSegmentCheckpoint(archive,scope,packet,invalidated,{reviewHash:'independent-negative-review',reason:'Premise must be rebuilt; all descendants invalidated.'})
    expect(loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash)!.segments).toHaveLength(0)
    expect(guideSegmentCheckpointFeedback(archive,scope,packet,setup.id,root.rootHash)!.reviewHash).toBe('independent-negative-review')
    expect(()=>loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash,attack.line)).toThrow('prefisso condiviso cambiato')
    const inventory=readGuideCheckpointInventory(archive,scope,packet,setup.id,root.rootHash)
    expect(inventory.find(r=>r.line.id==='main')?.journal?.segments).toHaveLength(0)
    expect(inventory.filter(r=>r.line.id!=='main').every(r=>r.status==='superseded-prefix'&&r.journal===null)).toBe(true)
    const retained=[...archive.values('guide-segment-checkpoint-v2')]
    for(const row of originals)expect(retained).toContainEqual(row)
    expect(()=>saveGuideSegmentCheckpoint(archive,scope,packet,second)).toThrow('non consecutiva')
    saveGuideSegmentCheckpoint(archive,scope,packet,first)
    expect(loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash)).toEqual(first)
    expect(()=>loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash,attack.line)).toThrow('prefisso condiviso cambiato')
    const newAttack=forkGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash,'reply-attack',1)
    expect(newAttack.line.anchorHash).not.toBe(attack.line.anchorHash)
    expect(newAttack.journal).toEqual(first)
    const rebuiltRoot=createGuideSegments({...setup,decision:'Different synthetic premise'},scope,packet)
    saveGuideSegmentCheckpoint(archive,scope,packet,rebuiltRoot)
    expect(loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,rebuiltRoot.rootHash)).toEqual(rebuiltRoot)
    expect(loadGuideSegmentCheckpoint(archive,scope,packet,setup.id,root.rootHash)).toEqual(first)
    expect(loadGuideSegmentCheckpoint(archive,{...scope,configHash:'foreign-config'},packet,setup.id,root.rootHash)).toBeUndefined()
    expect(()=>loadGuideSegmentCheckpoint(archive,{...scope,jobId:'foreign-job'},packet,setup.id,root.rootHash)).toThrow('altro job')
    const otherProject=projects.create({name:'Synthetic segments B',format:'STANDARD'}),otherJob=jobs.start('matchup-generate',otherProject.id,'segments-b'),other=new AiEvidenceArchive(path,otherJob)
    try{expect(()=>saveGuideSegmentCheckpoint(other,scope,packet,first)).toThrow('altro job');expect([...other.values('guide-segment-checkpoint-v2')]).toHaveLength(0)}finally{other.close()}
    expect(()=>createGuideSegments(setup,{...scope,projectId:'foreign-project'},packet)).toThrow('contesto')
    expect(()=>createGuideSegments(setup,{...scope,dependencyHash:'foreign-source'},packet)).toThrow('contesto')
    expect([...archive.values('guide-attempt-start')]).toHaveLength(0)
  }finally{archive.close();jobs.close();projects.close()}
})
