import {it,expect} from 'vitest'
import {DatabaseSync} from 'node:sqlite'
import {guideObligationFixture} from './fixtures/guide-obligation'
import {readGuideWitnessLibrary,guideWitnessDirectory,isVerifiedGuideWitnessLibrary} from '../src/main/guide-witness-library'
import {guideHash} from '../src/main/matchup-guide-packet'
import {forkGuideSegments} from '../src/main/guide-segments'
import {saveGuideSegmentCheckpoint} from '../src/main/guide-segment-checkpoints'

it('retains complete retired heads, authenticates every turn and exposes a non-probative directory',async()=>{
  const f=await guideObligationFixture()
  try{
    const first=await f.adopt(),old=first.plan.others[0],lineId='reply-'+guideHash(old)
    f.setConstructorNote('A distinct synthetic model declaration, before its ordinary schema reader.')
    const next=await f.adopt(first.plan,first.branches,'A replacement goal on the same logical slot')
    const calls=f.calls,library=readGuideWitnessLibrary(f.main,f.options)
    expect(library.complete).toBe(true)
    expect(library.members.some(m=>m.aliases.some(a=>a.line.id===lineId))).toBe(true)
    expect(library.members.some(m=>m.aliases.some(a=>a.line.id==='reply-'+guideHash(next.plan.others[0])))).toBe(true)
    expect(library.members.every(m=>m.producers.length===m.journal.segments.length&&m.producers.every(p=>p.references.length))).toBe(true)
    expect(library.tacticalApprovalReused).toBe(false)
    expect(f.calls).toBe(calls)
    expect(isVerifiedGuideWitnessLibrary(JSON.parse(JSON.stringify(library)))).toBe(false)
    expect(()=>{library.members[0].journal.segments[0].body.draw='not-the-original'}).toThrow()
    const directory=guideWitnessDirectory(library)
    expect(directory.members.some(m=>'journal'in m)).toBe(false)
    expect(readGuideWitnessLibrary(f.main,f.options)).toEqual(library)
  }finally{f.close()}
})

it('keeps invalidated descendants out of the candidate domain instead of resurrecting an earlier complete body',async()=>{
  const f=await guideObligationFixture()
  try{
    const branch=f.branches[0],short=forkGuideSegments(branch.journal,f.options.scope,f.options.packet,1)
    saveGuideSegmentCheckpoint(f.archive,f.options.scope,f.options.packet,short,{reviewHash:'independent-native-finding',reason:'This descendant needs repair.'},branch.line)
    const library=readGuideWitnessLibrary(f.main,f.options)
    expect(library.excluded.some(e=>e.line.id===branch.line.id&&e.reason==='incomplete')).toBe(true)
    expect(library.members.some(m=>m.aliases.some(a=>a.line.id===branch.line.id))).toBe(false)
  }finally{f.close()}
})

it('does not call an unauthenticated native body a complete library, or accept a foreign job',async()=>{
  const f=await guideObligationFixture()
  try{
    expect(()=>readGuideWitnessLibrary(f.main,{...f.options,scope:{...f.options.scope,jobId:'foreign'}})).toThrow('estraneo')
    const db=new DatabaseSync(f.file)
    try{db.exec("DELETE FROM ai_evidence_values WHERE role='guide-segment-unit-result-v1'")}finally{db.close()}
    const library=readGuideWitnessLibrary(f.main,f.options)
    expect(library.complete).toBe(false)
    expect(library.members).toEqual([])
    expect(library.excluded.some(e=>e.reason==='unbound-producer')).toBe(true)
  }finally{f.close()}
})
